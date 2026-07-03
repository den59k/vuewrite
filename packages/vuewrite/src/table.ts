import TableEditor from './components/Table/TableEditor.vue'
import TableViewer from './components/Table/TableViewer.vue'
import type { Block, TableAlign, TableCell } from './components/TextEditor/TextEditorStore'
import type { TableContextMenuEvent } from './components/Table/tableBlock'
// Structural CSS for both components. Extracted to dist/style.css at build time —
// published consumers load it via `import "vuewrite/style.css"`.
import './components/Table/table.sass'

/**
 * Builds a ready-to-insert table block for `editor.insertBlock(...)`. Produces a
 * `rows` × `cols` grid of empty cells; row 0 is the header row.
 */
export const createTableBlock = (rows = 2, cols = 2): Partial<Block> => ({
  type: 'table',
  editable: false,
  text: '',
  rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ text: '' }))),
})

export { TableEditor, TableViewer }
export type { TableCell, TableAlign, TableContextMenuEvent }
