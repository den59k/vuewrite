import { computed } from 'vue'
import type { Block, TableAlign, TableCell } from '../TextEditor/TextEditorStore'

/** Alignments the column-handle button cycles through, in order. */
export const TABLE_ALIGN_CYCLE: TableAlign[] = [null, 'center', 'right']

/** Unwraps a table block's data contract (`rows`, `align`) for the table
 *  components — the one home for these casts, shared by editor and viewer. */
export const useTableBlock = (props: { block: Block }) => {
  const rows = computed(() => (props.block.rows as TableCell[][] | undefined) ?? [])
  const align = computed(() => (props.block.align as TableAlign[] | undefined) ?? [])
  const alignStyle = (c: number) => {
    const a = align.value[c]
    return a ? { textAlign: a } : undefined
  }
  return { rows, align, alignStyle }
}
