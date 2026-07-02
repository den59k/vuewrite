// The markdown helpers live in the `vuewrite-markdown` workspace package. They're
// imported as values only (vite bundles their implementation into markdown.js), and
// their public types are declared here so the generated markdown.d.ts is fully
// self-contained: it must not re-export from `vuewrite-markdown`, which is an internal
// package and isn't published to npm.
import { markdownToBlocks as _markdownToBlocks, blocksToMarkdown as _blocksToMarkdown } from "vuewrite-markdown"

export type Style = { start: number; end: number; style: string; meta?: Record<string, unknown> }
export type TableCell = { text: string; styles?: Style[] }
export type TableAlign = "left" | "center" | "right" | null
export type Block = { id: string; text: string; type?: string; styles?: Style[]; editable?: boolean; [key: string]: unknown }

export const markdownToBlocks: (markdown: string, previousBlocks?: Block[], options?: { softBreaks?: boolean }) => Block[] = _markdownToBlocks
export const blocksToMarkdown: (blocks: Block[], options?: { softBreaks?: boolean }) => string = _blocksToMarkdown
