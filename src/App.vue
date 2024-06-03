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
      v-model:styles="styles"
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
      <template #placeholder>
        <div class="text-editor__placeholder" :contenteditable="false">
          Enter text...
        </div>
      </template>
    </TextEditor>
    <div class="text-small">Focused: {{ textEditorRef?.isFocused }}</div>
    <div class="text-small">Text: {{ text }}</div>
    <div class="text-small">Styles: {{ styles }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef } from 'vue';
import TextEditor, { TextEditorRef } from './components/TextEditor/TextEditor.vue';
import { Style } from './components/TextEditor/TextEditorStore';

import BoldIcon from './components/icons/BoldIcon.vue'
import ItalicIcon from './components/icons/ItalicIcon.vue'
import UnderlineIcon from './components/icons/UnderlineIcon.vue'
import VSelect from './components/VSelect.vue';
import VColorPicker from './components/VColorPicker.vue';

const textEditorRef = shallowRef<TextEditorRef>()
const text = ref([""])
const styles = ref([])

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
}

const decorator = (style: Style) => {
  if (style.style === 'color') {
    return { style: `color: ${style.meta!.color};` }
  }
  if (style.style === 'bold' || style.style === "underline" || style.style === "italic") {
    return { class: style.style }
  }
}

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

</style>