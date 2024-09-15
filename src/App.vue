<template>
  <div class="app-layout">
    <div class="text-editor-actions">
      <VSelect v-model="blockType" :items="items"/>
      <button v-for="button in buttons" class="text-editor-style" :class="{ active: button.active }" @click="button.onClick">
        <component :is="button.icon" />
      </button>
      <VColorPicker v-model="textColor"/>
    </div>
    <TextEditor 
      ref="textEditorRef"
      v-model="text"
      :decorator="decorator" 
      class="text-editor"
      autofocus
      @keydown="onKeyDown"
    >
      <template #h1="{ content, props }">
        <h1 v-bind="props"><component :is="content" /></h1>
      </template>
      <template #h2="{ content, props }">
        <h2 v-bind="props"><component :is="content" /></h2>
      </template>
      <template #h3="{ content, props }">
        <h3 v-bind="props"><component :is="content" /></h3>
      </template>
      <template #li="{ content, props }">
        <li v-bind="props"><component :is="content" /></li>
      </template>
      <template #code="{ props, block }">
        <CodeEditor v-model="block.text"  v-bind="props" />
      </template>
      <template #image="{ props, block }">
        <VImageUploader v-model="block.src" :contenteditable="false" v-bind="props"/>
      </template>
      <template #placeholder>
        <div class="text-editor__placeholder" :contenteditable="false">
          Enter text...
        </div>
      </template>
    </TextEditor>
    <TextEditorView :model-value="text" class="text-editor">
      <template #h1="{ content, props }">
        <h1 v-bind="props"><component :is="content" /></h1>
      </template>
      <template #h2="{ content, props }">
        <h2 v-bind="props"><component :is="content" /></h2>
      </template>
      <template #h3="{ content, props }">
        <h3 v-bind="props"><component :is="content" /></h3>
      </template>
      <template #li="{ content, props }">
        <li v-bind="props"><component :is="content" /></li>
      </template>
      <template #code="{ props, block }">
        <CodeEditor v-model="block.text"  v-bind="props" />
      </template>
      <template #image="{ props, block }">
        <VImageUploader v-model="block.src" :contenteditable="false" v-bind="props"/>
      </template>
      <template #placeholder>
        <div class="text-editor__placeholder" :contenteditable="false">
          Enter text...
        </div>
      </template>
    </TextEditorView>
    <VPopover :anchor-position="popoverPosition" placement="bottom-start" :open="popoverOpen" class="custom-blocks-popover">
      <button v-for="item in visibleBlocks" :class="{ active: activeItem === item }" @mouseenter="activeItem = item" @click="item.onClick">
        {{ item.title }}
      </button>
    </VPopover>
    <div class="text-small">Focused: {{ textEditorRef?.isFocused }}</div>
    <div class="text-small">Text: {{ text }}</div>
    <div class="text-small">Selection: {{ textEditorRef?.selection }}</div>
    <div class="text-small">CurrentWord: {{ currentWord }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef, watch } from 'vue';
import TextEditor, { TextEditorRef } from './components/TextEditor/TextEditor.vue';
import { Style } from './components/TextEditor/TextEditorStore';

import BoldIcon from './components/icons/BoldIcon.vue'
import ItalicIcon from './components/icons/ItalicIcon.vue'
import UnderlineIcon from './components/icons/UnderlineIcon.vue'
import VSelect from './components/VSelect.vue';
import VColorPicker from './components/VColorPicker.vue';
import VPopover from './components/VPopover.vue';
import VImageUploader from './components/VImageUploader.vue';
import CodeEditor from './components/CodeEditor.vue';
import TextEditorView from './components/TextEditor/TextEditorView.vue';

const textEditorRef = shallowRef<TextEditorRef>()
const text = ref([{ text: "" }])

const toggleStyle = (style: string) => {
  if (!textEditorRef.value) return
  if (!textEditorRef.value.isFocused) {
    textEditorRef.value.selectAll()
    textEditorRef.value.toggleStyle(style)
  } else {
    textEditorRef.value.toggleStyle(style)
  }
}

const buttons = computed(() => {
  const textEditor = textEditorRef.value
  if (!textEditor) return []
  const currentStyles = textEditor.currentStyles
  return [
    { icon: BoldIcon, active: currentStyles.has("bold"), onClick: () => toggleStyle("bold") },
    { icon: ItalicIcon, active: currentStyles.has("italic"), onClick: () => toggleStyle("italic") },
    { icon: UnderlineIcon, active: currentStyles.has("underline"), onClick: () => toggleStyle("underline") }
  ]
})

const items = [
  { id: "default", title: "Default Text" },
  { id: "h1", title: "Heading 1" },
  { id: "h2", title: "Heading 2" },
  { id: "h3", title: "Heading 3" },
  { id: "li", title: "List" }
]

const textColor = computed({
  get() {
    const _textColor = textEditorRef.value?.currentStyles.get("color")
    return _textColor?.meta.color ?? "#FFFFFF"
  },
  set(value) {
    if (value === "#FFFFFF") {
      textEditorRef.value?.removeStyle("color")
    } else {
      textEditorRef.value?.applyStyle("color", { color: value })
    }
  }
})

const blockType = computed({
  get() {
    return textEditorRef.value?.currentBlock?.type ?? "default"
  },
  set(type) {
    if (!textEditorRef.value?.currentBlock) return
    if (type === "default") {
      textEditorRef.value.currentBlock.type = undefined
    } else {
      textEditorRef.value.currentBlock.type = type ?? undefined
    }
  }
})

const onKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.code === "KeyB") {
      textEditorRef.value?.toggleStyle("bold")
    }
    if (e.code === "KeyI") {
      textEditorRef.value?.toggleStyle("italic")
    }
    if (e.code === "KeyU") {
      textEditorRef.value?.toggleStyle("underline")
    }
  }
  if (e.key === "Enter" && popoverOpen.value && activeItem.value) {
    e.preventDefault()
    activeItem.value.onClick()
    return
  }
  if (e.key === "Enter" && !e.shiftKey && textEditorRef.value?.currentBlock?.type === "li") {
    e.preventDefault()
    textEditorRef.value.addNewLine()
    textEditorRef.value!.currentBlock.type = "li"
    textEditorRef.value.pushHistory("setText")
  }
  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && popoverOpen.value && visibleBlocks.value.length > 0) {
    e.preventDefault()
    const index = visibleBlocks.value.indexOf(activeItem.value!)
    let newIndex = index + (e.key === "ArrowUp"? -1: 1)
    if (newIndex < 0) newIndex = visibleBlocks.value.length-1
    if (newIndex >= visibleBlocks.value.length) newIndex = 0
    activeItem.value = visibleBlocks.value[newIndex]
  }

  if (e.code === "Space" && textEditorRef.value?.currentBlock) {
    if (textEditorRef.value.currentBlock.text === "#") {
      textEditorRef.value.currentBlock.type = "h1"
      textEditorRef.value.currentBlock.text = ""
      e.preventDefault()
    } else if (textEditorRef.value.currentBlock.text === "##") {
      textEditorRef.value.currentBlock.type = "h2"
      textEditorRef.value.currentBlock.text = ""
      e.preventDefault()
    } else if (textEditorRef.value.currentBlock.text === "###") {
      textEditorRef.value.currentBlock.type = "h3"
      textEditorRef.value.currentBlock.text = ""
      e.preventDefault()
    } else if (textEditorRef.value.currentBlock.text === "*") {
      textEditorRef.value.currentBlock.type = "li"
      textEditorRef.value.currentBlock.text = ""
      e.preventDefault()
    }
  }
}

const decorator = (style: Style) => {
  if (style.style === 'color') {
    return { style: `color: ${style.meta!.color};` }
  }
  if (style.style === 'bold' || style.style === "underline" || style.style === "italic") {
    return { class: style.style }
  }
}

const currentWord = computed(() => {
  if (!textEditorRef.value || !textEditorRef.value.isCollapsed || !textEditorRef.value.currentBlock) return null
  const text = textEditorRef.value.currentBlock!.text
  const end = textEditorRef.value.selection.anchor.offset
  let start = end
  for (start = end; start > 0; start--) {
    if (text[start] === ' ') {
      start++
      break
    }
  }
  return text.slice(start, end)
})

const customBlocks = [
  { 
    id: "code", 
    title: "Code", 
    onClick() {
      popoverOpen.value = false
      textEditorRef.value!.selection.anchor.offset -= currentWord.value!.length
      textEditorRef.value?.insertBlock({ type: "code", editable: false, text: "" })
    } 
  },
  { 
    id: "list", 
    title: "List", 
    onClick() {
      popoverOpen.value = false
      textEditorRef.value!.selection.anchor.offset -= currentWord.value!.length
      textEditorRef.value!.insertBlock({ type: "li", text: "" })
    }
  },
  { 
    id: "image", 
    title: "Image", 
    onClick() {
      popoverOpen.value = false
      textEditorRef.value!.selection.anchor.offset -= currentWord.value!.length
      textEditorRef.value!.insertBlock({ type: "image", editable: false })
    }
  },
]
const activeItem = shallowRef<typeof customBlocks[number] | null>(null)
const visibleBlocks = computed(() => {
  if (!currentWord.value || !popoverOpen.value) return []
  return customBlocks.filter(item => item.id.startsWith(currentWord.value!.slice(1)))
})

watch(visibleBlocks, (visibleBlocks) => {
  if (visibleBlocks.length === 0) {
    activeItem.value = null
  } else {
    activeItem.value = visibleBlocks[0]
  }
}, { immediate: true })

const popoverPosition = ref<{ x: number, y: number }>({ x: 0, y: 0 })
const popoverOpen = ref(false)
watch(currentWord, (currentWord) => {
  if (textEditorRef.value && currentWord?.startsWith("/")) {
    popoverOpen.value = true
    const selection = JSON.parse(JSON.stringify(textEditorRef.value.selection))
    selection.anchor.offset -= currentWord.length
    const rect = textEditorRef.value.getClientRects(selection)[0]
    if (rect) {
      popoverPosition.value = { y: rect.bottom, x: rect.left }
    }
  } else {
    popoverOpen.value = false
  }
}, { flush: "post" })

</script>

<style lang="sass">

.text-editor
  position: relative
  outline: none
  white-space: pre-wrap
  font-size: 16px

  &>div
    margin: 12px 0
    line-height: 1.5em

  .bold
    font-weight: 700

  .italic
    font-style: italic
  
  .underline
    text-decoration: underline

.text-editor__placeholder
  position: absolute
  top: 0
  opacity: 0.4
  pointer-events: none
  user-select: none

.app-layout
  height: 100vh
  overflow: hidden
  box-sizing: border-box
  padding: 20px
  display: flex
  align-items: stretch
  flex-direction: column
  gap: 16px

  .text-editor
    flex: 1 1 auto
 
.text-editor-actions
  display: flex  
  align-items: center

  .v-select
    width: 200px
    margin-right: 16px

.text-editor-style
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

.text-small
  font-size: 13px

.custom-blocks-popover
  display: flex
  flex-direction: column
  padding: 8px 0
  width: 200px
  &>button
    background: none
    height: 36px
    color: white
    border: none
    display: flex
    align-items: center
    padding: 0 16px

    &.active
      background-color: rgba(255, 255, 255, 0.015)
      cursor: pointer


</style>