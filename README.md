# VueWrite

VueWrite is another text editor that takes full advantage of Vue3's features. 
It contains no pre-made styles and blocks as its main goal is complete customization and extension

## Demo

You can watch the demo [here](https://vuewrite.easix.ru)

## Quickstart

```vue
<template>
<TextEditor 
  :store="textEditorStore" 
  class="text-editor"
  :decorator="decorator" 
  @keydown="onKeyDown"
/>
</template>

<script lang="ts">

const onKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.code === "KeyB") {
      textEditorStore.toggleStyle("bold")
    }
    if (e.code === "KeyI") {
      textEditorStore.toggleStyle("italic")
    }
    if (e.code === "KeyU") {
      textEditorStore.toggleStyle("underline")
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