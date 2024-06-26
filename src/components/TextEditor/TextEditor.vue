<template>
  <div 
    ref="textEditorRef"
    contenteditable 
    @input="store.onInput"
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
      @postrender="onPostRender"
    />
    <slot v-if="store.blocks.length === 1 && store.blocks[0].text === ''" name="placeholder"></slot>
  </div>
</template>

<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';
import { nextTick, onMounted, ref, useSlots, watch } from 'vue';
import { calcNodeByOffset, calcOffsetToNode, findParent } from '../../utils/richEditorUtils';
import { Decorator, Style, TextEditorStore, uid } from './TextEditorStore';
import { isEqual } from 'vuesix';
import TextEditorBlock from './TextEditorBlock.vue';

const props = defineProps<{ 
  decorator?: Decorator, 
  single?: boolean, 
  modelValue?: string[] | string, 
  styles?: Style[] | Style[][],
  autofocus?: boolean,
  autoselect?: boolean
}>()
const emit = defineEmits([ "keydown", "update:modelValue", "update:styles" ])
const slots = useSlots()

const textEditorRef = ref<HTMLElement>()
const store = new TextEditorStore()

let modelValue: string | string[] = ""
watch(() => props.modelValue, (newValue) => {
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
      store.blocks[i].text = newValue[i]
    }
  }
}, { immediate: true })

let styles: Style[] | Style[][]
watch(() => props.styles, (newStyles) => {
  if (!newStyles || newStyles.length === 0 || newStyles === styles) return
  for (let i = 0; i < store.blocks.length; i++) {
    if (newStyles.length <= i) break
    const style = props.single? (newStyles as Style[]): (newStyles as Style[][])[i]
    store.blocks[i].styles = style
  }
}, { immediate: true })

watch(() => store.blocks, () => {
  if (props.single) {
    modelValue = store.blocks[0].text
    styles = store.blocks[0].styles
  } else {
    modelValue = store.blocks.map(item => item.text)
    styles = store.blocks.map(item => item.styles)
  }
  emit("update:modelValue", modelValue)
  emit("update:styles", styles)
}, { deep: true })

const onKeyDown = (e: KeyboardEvent) => {
  emit("keydown", e)
  if (e.defaultPrevented) return
  if (e.code === "Enter") {
    e.preventDefault()
    if (e.shiftKey || props.single) {
      store.insertText("\n")
    } else {
      store.addNewLine()
    }
  }

  if (e.code === "Backspace") {
    if (store.isCollapsed && store.currentBlock === store.blocks[0] && store.selection.anchor.offset === 0) {
      e.preventDefault()
    }
  }

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.code === "KeyB" || e.code === "KeyI" || e.code === "KeyU") {
      e.preventDefault()
    }
  }
}

let cachedSelection = {}
useEventListener(document, "selectionchange", () => {
  const sel = window.getSelection()!
  const anchor = findParent(sel.anchorNode!, el => el.hasAttribute("data-vw-block-id"))
  if (anchor) {
    const offset = anchor === sel.anchorNode? 0: (calcOffsetToNode(anchor, sel.anchorNode!) + sel.anchorOffset)
    store.selection.anchor = { blockId: anchor.getAttribute("data-vw-block-id")!, offset }
  }

  const focus = findParent(sel.focusNode!, el => el.hasAttribute("data-vw-block-id"))
  if (focus) {
    const offset = anchor === sel.focusNode? 0: (calcOffsetToNode(focus, sel.focusNode!) + sel.focusOffset)
    store.selection.focus = { blockId: focus.getAttribute("data-vw-block-id")!, offset }
  }
  if (store.isFocused.value !== !!focus || !!anchor) {
    store.isFocused.value = !!focus || !!anchor
  }
  if (!anchor && !focus)
  cachedSelection = JSON.parse(JSON.stringify(store.selection))
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

const applySelection = () => {
  if (!store.isFocused.value) {
    cachedSelection = JSON.parse(JSON.stringify(store.selection))
    return
  }
  if (isEqual(store.selection, cachedSelection)) return

  const nativeSelection = window.getSelection()!
  let anchor: Node | null = null
  let focus: Node | null = null
  for (let item of textEditorRef.value!.children) {
    if (item.getAttribute("data-vw-block-id") === store.selection.anchor.blockId) {
      anchor = item
    }
    if (item.getAttribute("data-vw-block-id") === store.selection.focus.blockId) {
      focus = item
    }
  }
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
})

const onCopy = (e: ClipboardEvent) => {
  e.preventDefault()
  navigator.clipboard.writeText(store.selectedText)
}

const onCut = (e: ClipboardEvent) => {
  e.preventDefault()
  navigator.clipboard.writeText(store.selectedText)
  store.deleteSelected()
}

const onPaste = (e: ClipboardEvent) => {
  e.preventDefault()
  const text = e.clipboardData?.getData('Text')
  if (!text) return
  store.insertText(text)
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
  selectAll: store.selectAll.bind(store)
})

</script>

<script lang="ts">

export type TextEditorRef = Pick<TextEditorStore, 
  "currentStyles" | 
  "currentBlock" | 
  "isCollapsed" |
  "selection" |
  "toggleStyle" |
  "applyStyle" |
  "removeStyle" |
  "insertText" |
  "selectAll"
> & { isFocused: boolean }

</script>

<style lang="sass">

</style>