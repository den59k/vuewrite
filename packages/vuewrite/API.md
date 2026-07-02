# API

## Exports

`vuewrite`

- `TextEditor` — editable component
- `TextViewer` — read-only renderer
- `uid()` — incremental string id generator for new blocks
- types: `Block`, `Style`, `TableCell`, `TableAlign`, `Decorator`, `Renderer`, `TextParser`, `TextEditorRef`

`vuewrite/markdown`

- `markdownToBlocks`, `blocksToMarkdown`
- types: `Block`, `Style`, `TableCell`, `TableAlign`

`vuewrite/table` (opt-in, tree-shakable)

- `TableEditor` — table editing UI for the editor's `#table` slot
- `TableViewer` — static table rendering for the viewer's `#table` slot
- `createTableBlock(rows?, cols?)` — build a ready-to-insert table block
- types: `TableCell`, `TableAlign`
- structural CSS: `import "vuewrite/style.css"`

## Types

```ts
type Style = { start: number; end: number; style: string; meta?: any }
type Block = { id: string; text: string; type?: string; styles?: Style[]; editable?: boolean; [key: string]: unknown }
type TableCell = { text: string; styles?: Style[] }
type TableAlign = "left" | "center" | "right" | null
type Decorator  = (style: Style) => (HTMLAttributes & { tag?: string }) | undefined
type Renderer   = (block: Block) => (HTMLAttributes & { tag?: string }) | undefined
type TextParser = (text: string) => Style[]
```

- `Style` — an inline range `[start, end)` with a style name and optional `meta` (e.g. a link's `href`).
- `Block` — one line/paragraph. `type` is your own label (`h1`, `li`, `code`, …). `editable: false` marks an atomic block (image, divider, table) the caret skips over. The index signature holds custom props (an image's `image`, a table's `rows`); these are snapshotted by history and serialized by markdown/clipboard when a `type` knows how.
- `TableCell` — one cell of a `table` block: rich `text` plus its inline `styles` (the same `Style` vocabulary).
- `Decorator` — maps an active style to the element it renders as: `tag` (defaults to `span`) plus any attributes, `class`, `style`.
- `Renderer` — maps a block to its container element (`tag` plus attributes).
- `TextParser` — derives inline styles from text at render time (syntax highlighting, mentions). Not stored in the model.

## `<TextEditor>`

### Props

| Prop | Type | Description |
|---|---|---|
| `modelValue` | `Block[] \| string` | `v-model`. Array of blocks, or a string in `single` mode. |
| `single` | `boolean` | Treat content as a single block; emits a string plus `update:styles`. |
| `styles` | `Style[]` | Style ranges for `single`/string mode (`v-model:styles`). |
| `decorator` | `Decorator` | Renders inline styles. |
| `renderer` | `Renderer` | Renders block containers. |
| `parser` | `TextParser` | Inline styles derived at render, not stored. |
| `htmlParser` | `(el: Element) => string \| null \| void` | On paste, maps an HTML element to a block type. |
| `autofocus` | `boolean` | Focus on mount. |
| `autoselect` | `boolean` | Focus and select all on mount. |
| `preventMultiline` | `boolean` | Disables soft `\n` breaks: every Enter starts a new block, and pasted newlines split into blocks. |

### Emits

| Event | Payload |
|---|---|
| `update:modelValue` | `Block[]`, or `string` in `single` mode |
| `update:styles` | `Style[]` (`single` mode) |
| `keydown` | `KeyboardEvent`, fired before built-in handling — call `preventDefault()` to take over |

Built-in keys: Enter (new block), Shift+Enter (soft break), Ctrl/Cmd+Z and Ctrl/Cmd+Y (undo/redo). Copy, cut and paste are handled — clipboard HTML carries inline styles, with a plain-text fallback.

### Slots

| Slot | Rendered for | Scope |
|---|---|---|
| `default` | untyped blocks | `{ content, props, block }` |
| `[type]` | blocks whose `type` matches the slot name (e.g. `#code`) | `{ content, props, block }` |
| `placeholder` | the empty editor | — |

Inside a slot, bind `props` to your root element and call `content()` to render the block's editable text.

### Ref — `TextEditorRef`

Grab it with a template ref. Reactive getters plus methods that act on the current selection:

| Member | Type | Description |
|---|---|---|
| `selection` | `{ anchor, focus }` | Each end is `{ blockId, offset }`. |
| `isFocused` | `boolean` | |
| `isCollapsed` | `boolean` | Selection is a caret, not a range. |
| `currentBlock` | `Block \| null` | Block under the caret; `null` when the selection spans blocks. |
| `currentStyles` | `Map<string, Style>` | Styles active across the whole selection. |
| `getCurrentBlocks()` | `Iterable<Block>` | Blocks the selection touches. |
| `toggleStyle(name)` | `void` | |
| `applyStyle(name, meta?)` | `void` | |
| `removeStyle(name)` | `void` | |
| `insertText(text)` | `void` | Insert at the caret. |
| `insertBlock(block)` | `void` | `Partial<Block>` — split and insert a typed or atomic block. |
| `addNewLine()` | `void` | |
| `removeNewLine()` | `void` | Merge with the previous block. |
| `removeCurrentBlock()` | `void` | |
| `selectAll()` | `void` | |
| `pushHistory(type)` | `void` | Record an undo step after mutating blocks directly. |
| `getClientRects(selection)` | `DOMRectList` | Selection geometry, for positioning popovers. |

When you mutate blocks directly (for example, changing a block's `type`), call `pushHistory(...)` so the change becomes undoable.

## `<TextViewer>`

Read-only renderer for the same blocks (previews, read views). Takes `modelValue`, `decorator`, `renderer`, `parser`, `styles`, and:

| Prop | Type | Description |
|---|---|---|
| `listParser` | `(block: Block) => string \| void` | Return a wrapper tag (`ul`/`ol`) to group consecutive blocks into a list. |

Slots: `default` and `[type]`, with the same scope as the editor (without editing).

## Markdown — `vuewrite/markdown`

```ts
markdownToBlocks(markdown: string, previousBlocks?: Block[], options?: { softBreaks?: boolean }): Block[]
blocksToMarkdown(blocks: Block[], options?: { softBreaks?: boolean }): string
```

- `previousBlocks` — pass the result of a prior parse to reuse ids, so unchanged blocks keep stable keys across edits.
- `softBreaks` — when `true`, a single newline is a soft break inside a block and blank lines separate paragraphs; `blocksToMarkdown` mirrors this (blank line between blocks, consecutive list items stay tight). Both default to `false`, where blocks join with a single newline and empty blocks act as blank lines.

Supported syntax: `#`/`##`/`###` headings, `-`/`*` and `1.` lists, fenced ` ```lang ` code (the info string becomes a `lang` prop), `---` divider, GFM `| … |` pipe tables (header row + delimiter row → a `table` block; rows must start with `|`), inline `**bold**` `*italic*` `__underline__` `~~strikethrough~~` `` `code` `` `[text](url)`, `::: type key="val" … :::` custom blocks (attributes + a multi-line body), and `<tag attrs>…</tag>` / `<tag/>` XML blocks. Inline emphasis follows CommonMark flanking rules, so `2 * 3` and `snake_case` stay literal.

## Tables — `vuewrite/table`

The core defines the table **data contract**; the editing UI ships as an opt-in, tree-shakable subpath export built purely on the public API.

```ts
// The table block (atomic — the outer editor treats it like an image):
{ id, type: "table", editable: false, text: "", rows: TableCell[][], align?: ("left" | "center" | "right" | null)[] }
```

- `rows[r][c]` — row 0 is the header row. Cells reuse `TableCell` (`{ text, styles }`), so inline bold/italic/links work through the same decorator and markdown/clipboard paths.
- `align` — optional per-column alignment; omitted when every column is default.
- Producers keep rows equal-length; consumers should still read defensively.

```ts
import { TableEditor, TableViewer, createTableBlock } from 'vuewrite/table'

editor.value?.insertBlock(createTableBlock(2, 2)) // 2×2 table, row 0 is the header
```

`<TableEditor>` — used inside the editor's `#table` slot. Props: `block` (the table block), `decorator?` (forwarded to cell editors), `editor?` (a `TextEditorRef` — when given, mutations push onto its history and deleting the table removes the block). Emits `change` (any mutation) and `delete`. Exposes `addRow` / `removeRow(r)` / `addColumn` / `removeColumn(c)` / `deleteTable` on its template ref for programmatic control. Each cell hosts a nested `<TextEditor single>` (events inside the table are isolated from the outer editor); Tab / Shift+Tab move between cells, Enter moves down (adding a row past the last), and Backspace in the first cell of an entirely empty table removes it.

`<TableViewer>` — used inside the viewer's `#table` slot. Props: `block`, `decorator?`. Static, decorator-aware rendering of `rows`. Row 0 renders as `<thead>`/`<th>` (the editor also renders row 0 cells as `<th>`, so one selector themes both).

Both ship only structural CSS, extracted to `dist/style.css` at build time — load it with `import "vuewrite/style.css"` and theme on top, like the rest of the library.

### Clipboard

Pasting a `<table>` (from Excel, Google Sheets/Docs or a web page) produces a `table` block; copying a selection that contains one writes a real `<table>` (`text/html`) and TSV (`text/plain`), so tables round-trip to spreadsheets.
