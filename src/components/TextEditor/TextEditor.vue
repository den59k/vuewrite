<template>
  <div 
    ref="textEditorRef"
    contenteditable 
    @beforeinput="store.onInput"
    @keydown="onKeyDown"
    @copy="onCopy"
    @paste="onPaste"
    @cut="onCut"
  >
    <TextEditorBlock 
      v-for="block in store.blocks" 
      :key="block.id" 
      :block="block" 
      :slots="slots"
      :decorator="props.decorator"
      :parser="props.parser"
      @postrender="onPostRender"
    />
    <slot v-if="store.blocks.length === 1 && store.blocks[0].text === '' && !store.blocks[0].type" name="placeholder"></slot>
  </div>
</template>

<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';
import { isProxy, nextTick, onMounted, ref, toRaw, useSlots, watch } from 'vue';
import { calcNodeByOffset, calcOffsetToNode, findParent } from '../../utils/richEditorUtils';
import { Decorator, Style, TextEditorSelection, TextEditorStore, uid } from './TextEditorStore';
import { isEqual } from 'vuesix';
import TextEditorBlock from './TextEditorBlock.vue';
import { TextEditorHistory } from './TextEditorHistory';

const props = defineProps<{ 
  decorator?: Decorator, 
  single?: boolean, 
  modelValue?: { text: string, styles?: Style[], type?: string }[] | string, 
  parser?: TextParser,
  styles?: Style[],
  autofocus?: boolean,
  autoselect?: boolean,
  preventMultiline?: boolean
}>()
const emit = defineEmits([ "keydown", "update:modelValue", "update:styles" ])
const slots = useSlots()

const textEditorRef = ref<HTMLElement>()
const store = new TextEditorStore()

let modelValue: string | { text: string }[] = ""
watch(() => props.modelValue, (newValue) => {
  if (isProxy(newValue) && toRaw(newValue) === modelValue) return
  if (newValue === undefined || newValue === null || newValue === modelValue) return
  if (!Array.isArray(newValue)) {
    store.blocks[0].text = newValue
    return
  } else {
    for (let i = store.blocks.length; i < newValue.length; i++) {
      store.blocks.push({ id: uid(), text: "", styles: [] })
    }
    store.blocks.length = newValue.length
    for (let i = 0; i < newValue.length; i++) {
      store.blocks[i].text = newValue[i].text
      store.blocks[i].type = newValue[i].type
      store.blocks[i].styles = newValue[i].styles ?? []
    }
  }
}, { immediate: true })

let styles: Style[] | Style[][]
watch(() => props.styles, (newStyles) => {
  if (!newStyles || newStyles.length === 0 || newStyles === styles) return
  for (let i = 0; i < store.blocks.length; i++) {
    if (newStyles.length <= i) break
    store.blocks[i].styles = newStyles
  }
}, { immediate: true })

watch(() => store.blocks, () => {
  if (props.single) {
    modelValue = store.blocks[0].text
    styles = store.blocks[0].styles
    emit("update:styles", styles)
    emit("update:modelValue", modelValue)
  } else {
    modelValue = store.blocks.map(item => ({ 
      type: item.type,
      text: item.text, 
      styles: item.styles.length === 0? undefined: item.styles 
    }))
    emit("update:modelValue", modelValue)
  }
}, { deep: true })

const onKeyDown = (e: KeyboardEvent) => {
  emit("keydown", e)
  if (e.defaultPrevented) return
  if (e.code === "Enter") {
    e.preventDefault()
    if (!props.preventMultiline && (e.shiftKey || props.single)) {
      store.insertText("\n")
    } else {
      store.addNewLine()
    }
  }

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.code === "KeyB" || e.code === "KeyI" || e.code === "KeyU") {
      e.preventDefault()
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
    e.preventDefault()
    store.history.undo()
  }
  if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || (e.shiftKey && e.code === "KeyZ"))) {
    e.preventDefault()
    store.history.redo()
  }
}

let cachedSelection = {}
useEventListener(document, "selectionchange", () => {
  const sel = window.getSelection()!
  const anchor = findParent(sel.anchorNode!, el => el.hasAttribute("data-vw-block-id") && el.parentElement === textEditorRef.value)
  if (anchor) {
    const isNonEditable = anchor.getAttribute("contenteditable") === "false"
    const offset = (isNonEditable || anchor === sel.focusNode)? 0: (calcOffsetToNode(anchor, sel.anchorNode!) + sel.anchorOffset)
    store.selection.anchor = { blockId: anchor.getAttribute("data-vw-block-id")!, offset }
  }

  const focus = findParent(sel.focusNode!, el => el.hasAttribute("data-vw-block-id") && el.parentElement === textEditorRef.value)
  if (focus) {
    const isNonEditable = focus.getAttribute("contenteditable") === "false"
    const offset = (isNonEditable || focus === sel.focusNode)? 0: (calcOffsetToNode(focus, sel.focusNode!) + sel.focusOffset)
    store.selection.focus = { blockId: focus.getAttribute("data-vw-block-id")!, offset }
  }
  if (store.isFocused.value !== (!!focus || !!anchor)) {
    store.isFocused.value = (!!focus || !!anchor)
  }
  if (anchor && focus) {
    cachedSelection = JSON.parse(JSON.stringify(store.selection))
  }
})

let postRendered = false
/** Debounce apply selection */
const onPostRender = () => {
  if (postRendered) return
  cachedSelection = {}
  postRendered = true
  applySelection()
  nextTick(() => {
    postRendered = false
  })
}

const getNode = (blockId: string) => {
  for (let item of textEditorRef.value!.children) {
    if (item.getAttribute("data-vw-block-id") === blockId) {
      return item as Node
    }
  } 
  return null
}

const applySelection = () => {
  if (!store.isFocused.value) {
    cachedSelection = JSON.parse(JSON.stringify(store.selection))
    return
  }
  if (isEqual(store.selection, cachedSelection)) return
  if (store.selection.anchor.blockId === store.selection.focus.blockId && store.currentBlock && store.currentBlock.editable === false) {
    return
  }

  const anchor = getNode(store.selection.anchor.blockId)
  const focus = getNode(store.selection.focus.blockId)
  const nativeSelection = window.getSelection()!

  if (anchor && focus) {
    nativeSelection.setBaseAndExtent(
      ...calcNodeByOffset(anchor, store.selection.anchor.offset), 
      ...calcNodeByOffset(focus, store.selection.focus.offset)
    )
  }
  cachedSelection = JSON.parse(JSON.stringify(store.selection))
}

watch(() => store.selection, applySelection, { deep: true, flush: "post" })

onMounted(() => {
  if (props.autofocus) {
    textEditorRef.value?.focus()
    applySelection()
  }
  if (props.autoselect) {
    textEditorRef.value?.focus()
    store.selectAll()
  }

  store.history.push("setText")
})

const onCopy = (e: ClipboardEvent) => {
  if (e.defaultPrevented) return
  e.preventDefault()
  navigator.clipboard.writeText(store.selectedText)
  store.history.push("setText")
}

const onCut = (e: ClipboardEvent) => {
  if (e.defaultPrevented) return
  e.preventDefault()
  navigator.clipboard.writeText(store.selectedText)
  store.deleteSelected()
  store.history.push("setText")
}

const onPaste = (e: ClipboardEvent) => {
  if (e.defaultPrevented) return
  e.preventDefault()
  const text = e.clipboardData?.getData('Text')
  if (!text) return
  if (props.preventMultiline) {
    const blocks = text.split("\n")
    store.insertText(blocks[0])
    for (let i = 1; i < blocks.length; i++) {
      store.addNewLine()
      store.insertText(blocks[i])
    }
  } else {
    store.insertText(text)
  }
  store.history.push("setText")
}

const getClientRects = (selection: TextEditorSelection) => {
  const anchor = getNode(selection.anchor.blockId)
  const focus = getNode(selection.focus.blockId)

  if (anchor && focus) {
    const range = new Range()
    range.setStart(...calcNodeByOffset(anchor, selection.anchor.offset))
    range.setEnd(...calcNodeByOffset(focus, selection.focus.offset))
    return range.getClientRects()
  }
  return new DOMRectList()
}

defineExpose({
  currentStyles: store._currentStyles,
  currentBlock: store._currentBlock,
  isCollapsed: store._isCollapsed,
  selection: store.selection,
  isFocused: store.isFocused,
  toggleStyle: store.toggleStyle.bind(store),
  applyStyle: store.applyStyle.bind(store),
  removeStyle: store.removeStyle.bind(store),
  insertText: store.insertText.bind(store),
  insertBlock: store.insertBlock.bind(store),
  addNewLine: store.addNewLine.bind(store),
  removeNewLine: store.removeNewLine.bind(store),
  selectAll: store.selectAll.bind(store),
  pushHistory: store.history.push.bind(store.history),
  getClientRects
})

</script>

<script lang="ts">

export type TextParser = (text: string) => Style[]

export type TextEditorRef = Pick<TextEditorStore, 
  "currentStyles" | 
  "currentBlock" | 
  "isCollapsed" |
  "selection" |
  "toggleStyle" |
  "applyStyle" |
  "removeStyle" |
  "insertText" |
  "insertBlock" |
  "addNewLine" |
  "removeNewLine" |
  "selectAll" 
> & { 
  isFocused: boolean, 
  getClientRects: (selection: TextEditorSelection) => DOMRectList,
  pushHistory: TextEditorHistory["push"]
}

</script>

<style lang="sass">

</style>