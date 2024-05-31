<template>
  <div 
    ref="textEditorRef"
    contenteditable 
    @input="store.onInput"
    @keydown="onKeyDown"
  >
    <TextEditorBlock 
      v-for="block in store.blocks" 
      :key="block.id" 
      :block="block" 
      :slots="slots"
      :decorator="decorator"
      @postrender="onPostRender"
    />
    <slot v-if="store.blocks.length === 1 && store.blocks[0].text === ''" name="placeholder"></slot>
  </div>
</template>

<script lang="ts" setup>
import { useEventListener } from '@vueuse/core';
import { nextTick, ref, useSlots, watch } from 'vue';
import { calcNodeByOffset, calcOffsetToNode, findParent } from '../../utils/richEditorUtils';
import { Decorator, TextEditorStore } from './TextEditorStore';
import { isEqual } from 'vuesix';
import TextEditorBlock from './TextEditorBlock.vue';

const props = defineProps<{ store: TextEditorStore, placeholder?: string, decorator?: Decorator }>()
const emit = defineEmits([ "keydown" ])
const slots = useSlots()

const textEditorRef = ref<HTMLElement>()
const store = props.store ?? new TextEditorStore()

const onKeyDown = (e: KeyboardEvent) => {
  emit("keydown", e)
  if (e.defaultPrevented) return
  if (e.code === "Enter") {
    e.preventDefault()
    if (e.shiftKey) {
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
  const anchor = findParent(sel.anchorNode!, el => el.hasAttribute("data-block-id"))
  if (anchor) {
    const offset = anchor === sel.anchorNode? 0: (calcOffsetToNode(anchor, sel.anchorNode!) + sel.anchorOffset)
    store.selection.anchor = { blockId: anchor.getAttribute("data-block-id")!, offset }
  }

  const focus = findParent(sel.focusNode!, el => el.hasAttribute("data-block-id"))
  if (focus) {
    const offset = anchor === sel.focusNode? 0: (calcOffsetToNode(focus, sel.focusNode!) + sel.focusOffset)
    store.selection.focus = { blockId: focus.getAttribute("data-block-id")!, offset }
  }
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
  if (isEqual(store.selection, cachedSelection)) return

  const nativeSelection = window.getSelection()!
  let anchor: Node | null = null
  let focus: Node | null = null
  for (let item of textEditorRef.value!.children) {
    if (item.getAttribute("data-block-id") === store.selection.anchor.blockId) {
      anchor = item
    }
    if (item.getAttribute("data-block-id") === store.selection.focus.blockId) {
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

defineExpose({
  store
})

</script>

<style lang="sass">

</style>