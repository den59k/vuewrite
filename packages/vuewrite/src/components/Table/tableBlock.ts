import { computed } from 'vue'
import type { Block, TableAlign, TableCell } from '../TextEditor/TextEditorStore'

/** Payload of `TableEditor`'s `contextmenu` event — the right-clicked cell's
 *  coordinates plus the native event (consumers call `preventDefault` and open
 *  their own menu). */
export type TableContextMenuEvent = { event: MouseEvent; row: number; col: number }

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
