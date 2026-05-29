<template>
  <div class="app-layout">

    <div class="toolbar">
      <VSelect v-model="blockType" :items="blockTypeItems"/>
      <button
        v-for="btn in styleButtons"
        :key="btn.style"
        class="style-btn"
        :class="{ active: btn.active }"
        @click="toggleStyle(btn.style)"
      >
        <component :is="btn.icon" />
      </button>
      <VColorPicker v-model="textColor"/>
    </div>

    <div class="panels">

      <div class="panel">
        <span class="panel-label">Editor</span>
        <TextEditor
          ref="textEditorRef"
          v-model="text"
          :renderer="renderer"
          :decorator="decorator"
          class="text-editor"
          autofocus
          :html-parser="htmlParser"
          @keydown="onKeyDown"
        >
          <template #code="{ props, block }">
            <CodeEditor
              v-model="block.text"
              v-bind="props"
              @newblockafter="textEditorRef?.addNewLine()"
              @remove="textEditorRef?.removeCurrentBlock()"
            />
          </template>
          <template #image="{ props, block }">
            <VImageUploader
              v-model="block.image"
              :contenteditable="false"
              :class="{ selected: block.id === textEditorRef?.selection.focus.blockId }"
              v-bind="props"
            />
          </template>
          <template #placeholder>
            <div class="placeholder" :contenteditable="false">Enter text...</div>
          </template>
        </TextEditor>
      </div>

      <div class="panel">
        <span class="panel-label">Markdown</span>
        <textarea
          class="markdown-editor"
          :value="markdownContent"
          spellcheck="false"
          @input="onMarkdownInput"
        />
      </div>

      <div class="panel">
        <span class="panel-label">Preview</span>
        <TextEditorView
          :model-value="text"
          class="text-editor"
          :renderer="renderer"
          :decorator="decorator"
          :list-parser="listCreator"
        >
          <template #code="{ props, block }">
            <CodeEditor v-model="block.text" v-bind="props" />
          </template>
          <template #image="{ block }">
            <img :src="block.image?.src" style="max-width: 100%; max-height: 350px"/>
          </template>
          <template #placeholder>
            <div class="placeholder" :contenteditable="false">Enter text...</div>
          </template>
        </TextEditorView>
      </div>

    </div>

    <VPopover
      :anchor-position="popoverPosition"
      placement="bottom-start"
      :open="popoverOpen"
      class="custom-blocks-popover"
    >
      <button
        v-for="item in visibleBlocks"
        :key="item.id"
        :class="{ active: activeItem === item }"
        @mouseenter="activeItem = item"
        @click="item.onClick"
      >{{ item.title }}</button>
    </VPopover>

  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { TextEditor, TextEditorView, uid } from 'vuewrite'
import type { TextEditorRef } from 'vuewrite'
import { markdownToBlocks, blocksToMarkdown } from 'vuewrite/markdown'

import BoldIcon from './components/icons/BoldIcon.vue'
import ItalicIcon from './components/icons/ItalicIcon.vue'
import UnderlineIcon from './components/icons/UnderlineIcon.vue'
import VSelect from './components/VSelect.vue'
import VColorPicker from './components/VColorPicker.vue'
import VPopover from './components/VPopover.vue'
import VImageUploader from './components/VImageUploader.vue'
import CodeEditor from './components/CodeEditor.vue'

import { renderer, decorator, htmlParser, listCreator } from './editorConfig'

// ── Core state ───────────────────────────────────────────────────────────────

const textEditorRef = shallowRef<TextEditorRef>()
const text = ref([{ id: uid(), text: '' }])

// ── Toolbar ──────────────────────────────────────────────────────────────────

const blockTypeItems = [
  { id: 'default', title: 'Default Text' },
  { id: 'h1',      title: 'Heading 1'    },
  { id: 'h2',      title: 'Heading 2'    },
  { id: 'h3',      title: 'Heading 3'    },
  { id: 'li',      title: 'List'         },
  { id: 'ol',      title: 'Numbered list'},
]

const blockType = computed({
  get() {
    if (!textEditorRef.value) return 'default'
    let type = ''
    for (const block of textEditorRef.value.getCurrentBlocks()) {
      if (!type) {
        type = block.type ?? 'default'
      } else if (type !== (block.type ?? 'default')) {
        return 'mixed'
      }
    }
    return type
  },
  set(type) {
    if (!textEditorRef.value) return
    for (const block of textEditorRef.value.getCurrentBlocks()) {
      block.type = type === 'default' ? undefined : type
    }
    textEditorRef.value.pushHistory('changeBlockType')
  },
})

const toggleStyle = (style: string) => {
  if (!textEditorRef.value) return
  if (!textEditorRef.value.isFocused) textEditorRef.value.selectAll()
  textEditorRef.value.toggleStyle(style)
}

const styleButtons = computed(() => {
  const styles = textEditorRef.value?.currentStyles
  return [
    { style: 'bold',      icon: BoldIcon,      active: styles?.has('bold')      ?? false },
    { style: 'italic',    icon: ItalicIcon,    active: styles?.has('italic')    ?? false },
    { style: 'underline', icon: UnderlineIcon, active: styles?.has('underline') ?? false },
  ]
})

const textColor = computed({
  get() {
    return (textEditorRef.value?.currentStyles.get('color')?.meta?.color as string) ?? '#FFFFFF'
  },
  set(value) {
    if (value === '#FFFFFF') {
      textEditorRef.value?.removeStyle('color')
    } else {
      textEditorRef.value?.applyStyle('color', { color: value })
    }
  },
})

// ── Markdown panel ────────────────────────────────────────────────────────────

const markdownContent = ref(blocksToMarkdown(text.value))
let fromMarkdown = false

watch(text, (blocks) => {
  if (fromMarkdown) return
  markdownContent.value = blocksToMarkdown(blocks)
}, { deep: true })

function onMarkdownInput(e: Event) {
  const md = (e.target as HTMLTextAreaElement).value
  markdownContent.value = md
  fromMarkdown = true
  text.value = markdownToBlocks(md)
  nextTick(() => { fromMarkdown = false })
}

// ── Slash-command popover ─────────────────────────────────────────────────────

const currentWord = computed(() => {
  const editor = textEditorRef.value
  if (!editor?.isCollapsed || !editor.currentBlock) return null
  const { text: blockText } = editor.currentBlock
  const end = editor.selection.anchor.offset
  let start = end
  while (start > 0 && blockText[start - 1] !== ' ') start--
  return blockText.slice(start, end)
})

const customBlocks = [
  {
    id: 'code',
    title: 'Code',
    onClick() {
      popoverOpen.value = false
      textEditorRef.value!.selection.anchor.offset -= currentWord.value!.length
      textEditorRef.value!.insertBlock({ type: 'code', editable: false, text: '' })
    },
  },
  {
    id: 'list',
    title: 'List',
    onClick() {
      popoverOpen.value = false
      textEditorRef.value!.selection.anchor.offset -= currentWord.value!.length
      textEditorRef.value!.insertBlock({ type: 'li', text: '' })
    },
  },
  {
    id: 'image',
    title: 'Image',
    onClick() {
      popoverOpen.value = false
      textEditorRef.value!.selection.anchor.offset -= currentWord.value!.length
      textEditorRef.value!.insertBlock({ type: 'image', editable: false })
    },
  },
]

const popoverOpen = ref(false)
const popoverPosition = ref({ x: 0, y: 0 })
const activeItem = shallowRef<(typeof customBlocks)[number] | null>(null)

const visibleBlocks = computed(() => {
  if (!currentWord.value || !popoverOpen.value) return []
  return customBlocks.filter(item => item.id.startsWith(currentWord.value!.slice(1)))
})

watch(visibleBlocks, (blocks) => {
  activeItem.value = blocks[0] ?? null
}, { immediate: true })

watch(currentWord, (word) => {
  if (textEditorRef.value && word?.startsWith('/')) {
    popoverOpen.value = true
    const sel = JSON.parse(JSON.stringify(textEditorRef.value.selection))
    sel.anchor.offset -= word.length
    const rect = textEditorRef.value.getClientRects(sel)[0]
    if (rect) popoverPosition.value = { y: rect.bottom, x: rect.left }
  } else {
    popoverOpen.value = false
  }
}, { flush: 'post' })

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

const onKeyDown = (e: KeyboardEvent) => {
  const editor = textEditorRef.value
  if (!editor) return

  // Ctrl/Cmd + B / I / U
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    const byKey: Record<string, string> = { KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' }
    const style = byKey[e.code]
    if (style) { editor.toggleStyle(style); e.preventDefault(); return }
  }

  // Delete non-editable, non-code block
  if (editor.currentBlock?.editable === false && editor.currentBlock.type !== 'code'
      && (e.code === 'Backspace' || e.code === 'Delete')) {
    editor.removeCurrentBlock()
    e.preventDefault()
    return
  }

  // Enter confirms active popover item
  if (e.key === 'Enter' && popoverOpen.value && activeItem.value) {
    e.preventDefault()
    activeItem.value.onClick()
    return
  }

  // Enter in list → continue with same list type
  const currentType = editor.currentBlock?.type
  if (e.key === 'Enter' && !e.shiftKey && (currentType === 'li' || currentType === 'ol')) {
    e.preventDefault()
    editor.addNewLine()
    editor.currentBlock!.type = currentType
    editor.pushHistory('setText')
    return
  }

  // Arrow keys navigate popover
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && popoverOpen.value && visibleBlocks.value.length > 0) {
    e.preventDefault()
    const idx = visibleBlocks.value.indexOf(activeItem.value!)
    const next = (idx + (e.key === 'ArrowUp' ? -1 : 1) + visibleBlocks.value.length) % visibleBlocks.value.length
    activeItem.value = visibleBlocks.value[next]
    return
  }

  // Space after Markdown shortcut prefixes (# ## ### *)
  if (e.code === 'Space' && editor.currentBlock) {
    const shortcuts: Record<string, string> = { '#': 'h1', '##': 'h2', '###': 'h3', '*': 'li' }
    const type = shortcuts[editor.currentBlock.text]
    if (type) {
      editor.currentBlock.type = type
      editor.currentBlock.text = ''
      e.preventDefault()
    }
  }
}
</script>

<style lang="sass">

// ── Layout ────────────────────────────────────────────────────────────────────

.app-layout
  height: 100vh
  overflow: hidden
  box-sizing: border-box
  padding: 20px
  display: flex
  flex-direction: column
  gap: 12px

.toolbar
  display: flex
  align-items: center
  gap: 4px
  flex: 0 0 auto

  .v-select
    width: 200px
    margin-right: 12px

.panels
  flex: 1 1 0
  display: grid
  grid-template-columns: 1fr 1fr 1fr
  gap: 16px
  overflow: hidden
  min-height: 0

.panel
  display: flex
  flex-direction: column
  gap: 6px
  overflow: hidden
  min-height: 0

.panel-label
  font-size: 11px
  text-transform: uppercase
  letter-spacing: 0.06em
  opacity: 0.4
  flex: 0 0 auto

// ── Style button ──────────────────────────────────────────────────────────────

.style-btn
  background: none
  color: white
  border: none
  width: 48px
  height: 48px
  cursor: pointer
  border-radius: 8px

  &:hover
    background-color: rgba(255, 255, 255, 0.1)

  &.active
    color: #0066FF

// ── Rich text editor ──────────────────────────────────────────────────────────

.text-editor
  position: relative
  outline: none
  white-space: pre-wrap
  font-size: 16px
  flex: 1 1 0
  overflow-y: auto
  min-height: 0

  & > div
    margin: 12px 0
    line-height: 1.5em

  b
    font-weight: 700

  i
    font-style: italic

  u
    text-decoration: underline

  li.ol
    list-style-type: decimal

.placeholder
  position: absolute
  top: 0
  opacity: 0.4
  pointer-events: none
  user-select: none

// ── Markdown textarea ─────────────────────────────────────────────────────────

.markdown-editor
  flex: 1 1 0
  min-height: 0
  background: rgba(255, 255, 255, 0.04)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 8px
  color: white
  font-family: monospace
  font-size: 13px
  line-height: 1.65
  padding: 12px
  resize: none
  outline: none
  box-sizing: border-box
  width: 100%

  &:focus
    border-color: rgba(255, 255, 255, 0.2)

// ── Slash-command popover ─────────────────────────────────────────────────────

.custom-blocks-popover
  display: flex
  flex-direction: column
  padding: 8px 0
  width: 200px

  & > button
    background: none
    height: 36px
    color: white
    border: none
    display: flex
    align-items: center
    padding: 0 16px
    cursor: pointer

    &.active
      background-color: rgba(255, 255, 255, 0.08)

</style>
