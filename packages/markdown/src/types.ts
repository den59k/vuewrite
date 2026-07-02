export type Style = { start: number; end: number; style: string; meta?: Record<string, unknown> }
/** A single table cell: rich text plus its inline styles. */
export type TableCell = { text: string; styles?: Style[] }
/** Per-column alignment of a table block (`null` = default). */
export type TableAlign = 'left' | 'center' | 'right' | null
export type Block = { id: string; text: string; type?: string; styles?: Style[]; editable?: boolean; [key: string]: unknown }
