# VueWrite

VueWrite is another text editor that takes full advantage of Vue3's features. 
It contains no pre-made styles and blocks as its main goal is complete customization and extension

## Demo

You can watch the demo [here](https://vuewrite.easix.ru)

## Quickstart

```vue
<template>
  <TextEditor 
    ref="textEditorRef" 
    v-model="modelValue"
    single
    class="text-editor"
    :decorator="decorator" 
    @keydown="onKeyDown"
  />
</template>

<script lang="ts">
import { TextEditor, TextEditorRef } from 'vuewrite'

const textEditorRef = shallowRef<TextEditorRef>()
const modelValue = shallowRef("")

const onKeyDown = (e: KeyboardEvent) => {
  if (!textEditorRef.value) return
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.code === "KeyB") {
      textEditorRef.value.toggleStyle("bold")
    }
    if (e.code === "KeyI") {
      textEditorRef.value.toggleStyle("italic")
    }
    if (e.code === "KeyU") {
      textEditorRef.value.toggleStyle("underline")
    }
  }
}

const decorator = (style: Style) => {
  if (style.style === 'bold' || style.style === "underline" || style.style === "italic") {
    return { class: style.style }
  }
}

</script>

<style lang="css">
.text-editor {
  white-space: pre-wrap;
}
.text-editor .bold {
  font-weight: 700
}
.text-editor .italic {
  font-style: italic
}
.text-editor .underline {
  text-decoration: underline
}
</style>

```