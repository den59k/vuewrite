<template>
  <div
    ref="rootRef"
    class="vw-table"
    :contenteditable="false"
    @keydown.stop
    @beforeinput.stop
    @copy.stop
    @cut.stop
    @paste.stop
    @compositionstart.stop
    @compositionend.stop
    @focusout="onFocusOut"
  >
    <table class="vw-table-grid">
      <tbody>
        <tr v-for="(row, r) in rows" :key="r">
          <component
            :is="r === 0 ? 'th' : 'td'"
            v-for="(cell, c) in row"
            :key="c"
            class="vw-table-cell"
            :style="alignStyle(c)"
          >
            <TextEditor
              :ref="(el: any) => setCellRef(r, c, el)"
              single
              :model-value="cell.text"
              :styles="cell.styles"
              :decorator="decorator"
              @update:model-value="onCellText(r, c, $event)"
              @update:styles="onCellStyles(r, c, $event)"
              @keydown="onCellKeyDown($event, r, c)"
            />
            <button
              v-if="c === 0 && rows.length > 1"
              type="button"
              class="vw-table-remove vw-table-remove-row"
              title="Remove row"
              @click="removeRow(r)"
            >×</button>
            <button
              v-if="r === 0 && cols > 1"
              type="button"
              class="vw-table-remove vw-table-remove-col"
              title="Remove column"
              @click="removeColumn(c)"
            >×</button>
          </component>
        </tr>
      </tbody>
    </table>

    <div class="vw-table-toolbar">
      <button type="button" class="vw-table-btn" @click="addRow">+ Row</button>
      <button type="button" class="vw-table-btn" @click="addColumn">+ Column</button>
      <button type="button" class="vw-table-btn vw-table-btn-danger" @click="deleteTable">Delete</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import TextEditor from '../TextEditor/TextEditor.vue'
import type { TextEditorRef } from '../TextEditor/TextEditor.vue'
import type { Block, Decorator, Style, TableCell } from '../TextEditor/TextEditorStore'
import { useTableBlock } from './tableBlock'

const props = defineProps<{
  block: Block
  decorator?: Decorator
  /** When provided, mutations are pushed onto this editor's history and deleting
   *  the table removes the block from it. Otherwise, consumers should react to
   *  the `change`/`delete` emits and manage history themselves. */
  editor?: TextEditorRef
}>()

const emit = defineEmits<{ change: []; delete: [] }>()

const rootRef = ref<HTMLElement>()

const { rows, alignStyle } = useTableBlock(props)
const cols = computed(() => rows.value.reduce((max, row) => Math.max(max, row.length), 0))

// ── Cell edits ────────────────────────────────────────────────────────────────
// Each cell editor has its own undo stack, so cell edits don't push outer history
// per keystroke. They are flushed to the outer history when focus leaves the
// table (see onFocusOut) — outer undo can only fire then, so it never crosses a
// snapshot that misses typed cell text.

let cellsDirty = false

const onCellText = (r: number, c: number, text: string) => {
  rows.value[r][c].text = text
  cellsDirty = true
  emit('change')
}
const onCellStyles = (r: number, c: number, styles: Style[]) => {
  rows.value[r][c].styles = styles
  cellsDirty = true
  emit('change')
}

const onFocusOut = (e: FocusEvent) => {
  if (!cellsDirty) return
  const to = e.relatedTarget as Node | null
  if (to && rootRef.value?.contains(to)) return
  cellsDirty = false
  props.editor?.pushHistory('setText')
}

// ── Structural mutations ──────────────────────────────────────────────────────

const emptyCell = (): TableCell => ({ text: '' })

/** Snapshots the whole block onto the outer editor's history (rows is a custom
 *  prop, so a full-update snapshot restores it on undo). */
const commit = () => {
  cellsDirty = false
  emit('change')
  props.editor?.pushHistory('setText')
}

const addRow = () => {
  rows.value.push(Array.from({ length: Math.max(cols.value, 1) }, emptyCell))
  commit()
}
const removeRow = (r: number) => {
  if (rows.value.length <= 1) return
  rows.value.splice(r, 1)
  commit()
}
const addColumn = () => {
  for (const row of rows.value) row.push(emptyCell())
  commit()
}
const removeColumn = (c: number) => {
  if (cols.value <= 1) return
  for (const row of rows.value) row.splice(c, 1)
  if (Array.isArray(props.block.align)) (props.block.align as unknown[]).splice(c, 1)
  commit()
}
const deleteTable = () => {
  emit('delete')
  if (props.editor) {
    props.editor.selection.anchor = { blockId: props.block.id, offset: 0 }
    props.editor.selection.focus = { blockId: props.block.id, offset: 0 }
    props.editor.removeCurrentBlock()
  }
}

// ── Keyboard navigation ───────────────────────────────────────────────────────
// Cells are addressed (row, col) through template refs, so navigation follows
// the data shape and stays correct for ragged rows.

const cellRefs = new Map<string, HTMLElement>()
const setCellRef = (r: number, c: number, comp: any) => {
  if (comp?.$el) cellRefs.set(`${r}:${c}`, comp.$el as HTMLElement)
  else cellRefs.delete(`${r}:${c}`)
}

const focusCell = (r: number, c: number) => {
  nextTick(() => {
    const el = cellRefs.get(`${r}:${c}`)
    if (!el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  })
}

const isTableEmpty = () => rows.value.every(row => row.every(cell => cell.text === ''))

const onCellKeyDown = (e: KeyboardEvent, r: number, c: number) => {
  if (e.code === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) {
      if (c > 0) focusCell(r, c - 1)
      else if (r > 0) focusCell(r - 1, rows.value[r - 1].length - 1)
    } else {
      if (c + 1 < rows.value[r].length) focusCell(r, c + 1)
      else if (r + 1 < rows.value.length) focusCell(r + 1, 0)
      else { addRow(); focusCell(r + 1, 0) }
    }
    return
  }

  if (e.code === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (r + 1 < rows.value.length) focusCell(r + 1, Math.min(c, rows.value[r + 1].length - 1))
    else { addRow(); focusCell(r + 1, Math.min(c, Math.max(cols.value - 1, 0))) }
    return
  }

  // Backspace at the very start of an entirely empty table removes it.
  if (e.code === 'Backspace' && r === 0 && c === 0 && isTableEmpty()) {
    e.preventDefault()
    deleteTable()
    return
  }
}

defineExpose({ addRow, removeRow, addColumn, removeColumn, deleteTable })
</script>
