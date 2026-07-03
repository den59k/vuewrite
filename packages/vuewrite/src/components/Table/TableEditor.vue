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
    <div class="vw-table-scroll">
      <table class="vw-table-grid">
        <tbody>
          <tr
            v-for="(row, r) in rows"
            :key="r"
            :class="{ 'is-row-hover': r === hoverRow }"
          >
            <component
              :is="r === 0 ? 'th' : 'td'"
              v-for="(cell, c) in row"
              :key="c"
              class="vw-table-cell"
              :class="{ 'is-col-hover': c === hoverCol }"
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

              <!-- Column handle: lives in the header row, sits in the top gutter -->
              <template v-if="r === 0">
                <div
                  class="vw-table-handle vw-table-handle-col"
                  :class="{ active: c === hoverCol }"
                  title="Column"
                  @mouseenter="hoverCol = c"
                  @mouseleave="hoverCol = -1"
                >
                  <button
                    class="vw-table-handle-btn"
                    :title="alignTitle(c)"
                    @click="cycleAlign(c)"
                  >
                    <component :is="alignIcon(c)" />
                  </button>
                  <button
                    v-if="cols > 1"
                    class="vw-table-handle-btn vw-table-handle-del"
                    title="Delete column"
                    @click="removeColumn(c)"
                  ><TrashIcon /></button>
                </div>
                <button
                  v-if="c === 0"
                  class="vw-table-insert vw-table-insert-col vw-table-insert-first"
                  title="Insert column"
                  @click="insertColumnAt(0)"
                ><PlusIcon /></button>
                <button
                  class="vw-table-insert vw-table-insert-col"
                  title="Insert column"
                  @click="insertColumnAt(c + 1)"
                ><PlusIcon /></button>
              </template>

              <!-- Row handle: lives in the first column, sits in the left gutter -->
              <template v-if="c === 0">
                <div
                  class="vw-table-handle vw-table-handle-row"
                  :class="{ active: r === hoverRow }"
                  title="Row"
                  @mouseenter="hoverRow = r"
                  @mouseleave="hoverRow = -1"
                >
                  <button
                    v-if="rows.length > 1"
                    class="vw-table-handle-btn vw-table-handle-del"
                    title="Delete row"
                    @click="removeRow(r)"
                  ><TrashIcon /></button>
                </div>
                <button
                  v-if="r === 0"
                  class="vw-table-insert vw-table-insert-row vw-table-insert-first"
                  title="Insert row"
                  @click="insertRowAt(0)"
                ><PlusIcon /></button>
                <button
                  class="vw-table-insert vw-table-insert-row"
                  title="Insert row"
                  @click="insertRowAt(r + 1)"
                ><PlusIcon /></button>
              </template>
            </component>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="vw-table-toolbar">
      <button type="button" class="vw-table-btn" title="Add row below" @click="addRow">
        <PlusIcon /> Row
      </button>
      <button type="button" class="vw-table-btn" title="Add column right" @click="addColumn">
        <PlusIcon /> Column
      </button>
      <div class="vw-table-toolbar-spacer" />
      <button
        type="button"
        class="vw-table-btn vw-table-btn-danger"
        title="Delete table"
        @click="deleteTable"
      ><TrashIcon /> Delete</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import TextEditor from '../TextEditor/TextEditor.vue'
import type { TextEditorRef } from '../TextEditor/TextEditor.vue'
import type { Block, Decorator, Style, TableAlign, TableCell } from '../TextEditor/TextEditorStore'
import { TABLE_ALIGN_CYCLE, useTableBlock } from './tableBlock'
import PlusIcon from './icons/PlusIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'
import AlignLeftIcon from './icons/AlignLeftIcon.vue'
import AlignCenterIcon from './icons/AlignCenterIcon.vue'
import AlignRightIcon from './icons/AlignRightIcon.vue'

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

const { rows, align, alignStyle } = useTableBlock(props)
const cols = computed(() => rows.value.reduce((max, row) => Math.max(max, row.length), 0))

// Which row/column the pointer is currently over a handle of — drives the
// whole-row / whole-column highlight.
const hoverRow = ref(-1)
const hoverCol = ref(-1)

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

/** Inserts a fresh empty row at index `at` (clamped). */
const insertRowAt = (at: number) => {
  const index = Math.max(0, Math.min(at, rows.value.length))
  rows.value.splice(index, 0, Array.from({ length: Math.max(cols.value, 1) }, emptyCell))
  commit()
}
const addRow = () => insertRowAt(rows.value.length)
const removeRow = (r: number) => {
  if (rows.value.length <= 1) return
  rows.value.splice(r, 1)
  commit()
}

/** Inserts a fresh empty column at index `at` (clamped), keeping `align` aligned. */
const insertColumnAt = (at: number) => {
  const index = Math.max(0, Math.min(at, cols.value))
  for (const row of rows.value) row.splice(index, 0, emptyCell())
  if (Array.isArray(props.block.align)) (props.block.align as unknown[]).splice(index, 0, null)
  commit()
}
const addColumn = () => insertColumnAt(cols.value)
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

// ── Column alignment ──────────────────────────────────────────────────────────

const ALIGN_ICONS = { left: AlignLeftIcon, center: AlignCenterIcon, right: AlignRightIcon }
const ALIGN_LABELS = { left: 'Align left', center: 'Align center', right: 'Align right' }

const alignOf = (c: number): Exclude<TableAlign, null> => align.value[c] ?? 'left'
const alignIcon = (c: number) => ALIGN_ICONS[alignOf(c)]
const alignTitle = (c: number) => ALIGN_LABELS[alignOf(c)]

/** Advances a column through the align cycle (default → center → right → …). */
const cycleAlign = (c: number) => {
  const current = align.value[c] ?? null
  const next = TABLE_ALIGN_CYCLE[(TABLE_ALIGN_CYCLE.indexOf(current) + 1) % TABLE_ALIGN_CYCLE.length]
  const arr = Array.isArray(props.block.align)
    ? (props.block.align as TableAlign[])
    : ((props.block.align as unknown) = Array.from({ length: cols.value }, () => null) as TableAlign[])
  while (arr.length < cols.value) arr.push(null)
  arr[c] = next
  commit()
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

defineExpose({ addRow, removeRow, addColumn, removeColumn, insertRowAt, insertColumnAt, deleteTable })
</script>
