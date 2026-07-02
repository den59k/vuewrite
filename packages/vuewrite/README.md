# VueWrite

Another rich text editor, built on Vue 3 reactivity. It ships no styles and no block types — you decide how everything renders, and it handles the editing model, selection, history and clipboard. About 11 kB gzipped, Vue 3 the only dependency.

[Demo](https://vuewrite.easix.ru) · [API reference](./API.md)

## Install

```sh
npm install vuewrite
```

## How it works

A document is a flat array of blocks. A block is plain `text` plus a list of style ranges:

```ts
{ id: "1", text: "Hello world", styles: [{ start: 0, end: 5, style: "bold" }] }
```

Nothing is styled out of the box. A `decorator` turns a style into a tag/class/attributes; a `renderer` turns a block into its element. Bold, headings, lists, links, code blocks, images — you map them however you want.

## Quickstart

```vue
<template>
  <TextEditor ref="editor" v-model="text" :decorator="decorator" class="editor" @keydown="onKeyDown" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { TextEditor } from 'vuewrite'
import type { TextEditorRef, Style } from 'vuewrite'

const editor = ref<TextEditorRef>()
const text = ref([{ id: '1', text: '' }])

const decorator = (style: Style) => ({ class: style.style })

const onKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyB') {
    e.preventDefault()
    editor.value?.toggleStyle('bold')
  }
}
</script>

<style>
.editor { white-space: pre-wrap; outline: none; }
.editor .bold { font-weight: 700; }
</style>
```

## Components

- `TextEditor` — the editable, contenteditable component (`v-model` of blocks, or a string in `single` mode).
- `TextViewer` — a read-only renderer for the same blocks, for previews and read paths.

## Markdown

`vuewrite/markdown` converts between Markdown and blocks (headings, lists, code, dividers, GFM pipe tables, inline styles, custom blocks):

```ts
import { markdownToBlocks, blocksToMarkdown } from 'vuewrite/markdown'
```

## Tables

`vuewrite/table` is an opt-in, tree-shakable entry with the table editing UI — drop `TableEditor`/`TableViewer` into the `#table` slot and insert one with `createTableBlock()`. The core owns the table data contract (so markdown and clipboard interop for free); pasting from and copying to spreadsheets round-trips.

```ts
import { TableEditor, TableViewer, createTableBlock } from 'vuewrite/table'
import 'vuewrite/style.css' // structural table CSS — theme on top
```

Full props, the editor ref, slots, types and the Markdown options are in the [API reference](./API.md).
