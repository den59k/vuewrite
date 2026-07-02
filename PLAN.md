# Table Support — Implementation Plan

## Context

VueWrite's model is deliberately flat: a document is `Block[]`, selection is
`{ blockId, offset }` over that flat list, and history, clipboard and rendering
all assume blocks are direct children of the contenteditable root. Structure is
*derived*, never stored — lists are flat `li`/`ol` blocks grouped into
`<ul>`/`<ol>` only at render time (`wrapLists`).

Tables are the first feature that genuinely doesn't fit a flat line-of-text
model. The goal of this plan is to add them **without giving up the flat
model** and without growing the core beyond the bare essentials.

## Design decision

Three options were considered:

### Option A — Atomic table block, userland UI  ✅ recommended

One block per table: `{ type: "table", editable: false, rows: [...] }`.
The core treats it exactly like `image` or `hr` — an opaque atomic block the
caret skips over. All table UI (cell editing, row/column operations, keyboard
navigation) lives in a `#table` slot component, following the exact precedent
of the dev app's `CodeEditor` (`#code` slot) and `VImageUploader` (`#image`
slot). Cells get rich text by nesting `<TextEditor single>` per cell.

The slot component ships with the library as an opt-in **`vuewrite/table`
subpath export** (same pattern as `vuewrite/markdown`), built purely on the
public API — the core itself stays untouched.

- Core changes: near zero (see Workstream 1).
- The core's role is to define the **table data contract** and its
  **interop** (markdown, clipboard); the editing UX is a separate,
  tree-shakable entry users opt into.

### Option B — Flat cell blocks, grouped at render (like lists)

Each cell is its own block (`{ type: "td", ... }`) wrapped into
`<table>/<tr>/<td>` at render time, the way lists work in `TextViewer`.
Rejected: the *editor* (unlike the viewer) requires blocks to be direct
children of the root — `applySelection`/`getNode` and the `selectionchange`
handler both check `el.parentElement === textEditorRef.value`. Supporting
wrapper elements in edit mode means reworking selection mapping, cross-cell
range selection, backspace-merge semantics, and history for the whole core.
That is a structural editor rewrite, not "bare essentials".

### Option C — Nested block model (blocks contain blocks)

The ProseMirror route. Rejected outright: it invalidates the flat model that
every subsystem (store, history, clipboard, markdown) is built on, and is
exactly the scope creep the project wants to avoid.

**Why A is the graceful fit:** VueWrite already has a two-tier philosophy —
the core owns text, styles, selection and the block list; the consumer owns
what a `type` means. Tables slot into that seam: the core gains a *vocabulary
entry* (a canonical shape for `rows`, so markdown and clipboard can interop),
and everything interactive lives in the separate `vuewrite/table` entry, which
consumes the same public API any user could.

## Data contract

```ts
// vuewrite/markdown types.ts + documented in API.md
export type TableCell = { text: string; styles?: Style[] }

// The table block:
{
  id: string
  type: "table"
  editable: false
  text: ""                 // always empty; cell text lives in rows
  rows: TableCell[][]      // rows[r][c]; row 0 is the header row
  align?: ("left" | "center" | "right" | null)[]  // per column, optional
}
```

Notes:

- `TableCell` reuses the existing `Style` type, so inline bold/italic/links in
  cells work with the existing decorator, markdown inline parser and
  `stylesToHtml` for free.
- Row 0 is the header row (GFM tables always have one). A `header?: false`
  escape hatch can be added later if needed — don't add it now.
- No colspan/rowspan in v1 (GFM has none either). The shape leaves room to add
  per-cell props later since `TableCell` is an object.
- The invariant "all rows have equal length" is maintained by producers
  (markdown parser, clipboard parser, userland UI); consumers should still pad
  defensively when reading.

## Workstream 1 — `vuewrite` core (minimal, additive)

1. **`Block` type: allow custom props.**
   Add `[key: string]: unknown` to `Block` in `TextEditorStore.ts`, matching
   the markdown package's `Block`. The dev app already relies on this
   (`block.image`) and currently type-errors its way around it. Export
   `TableCell` type.

2. **History: snapshot custom props.**
   `cloneBlock` in `TextEditorHistory.ts` only copies
   `id/text/type/editable/styles`, so mutations to `rows` (or `image`, today)
   are not undo-safe. Extend `cloneBlock` to deep-clone all remaining
   enumerable props (JSON clone of the rest), and make `applyAction`'s
   full-update path replace the whole block rather than `Object.assign` over
   stale props (assign leaves a deleted custom prop behind). This is a
   pre-existing gap that images already suffer from; fixing it is required for
   table undo (add row / edit cell + `pushHistory` → Ctrl+Z works).

3. **Clipboard: table interop in `clipboardEvents.ts`.**
   The clipboard module already knows the shared vocabulary (`hr`, `li`, `ol`,
   `code`), so `table` joins it:
   - **Paste** — `htmlToBlocks`: handle `<TABLE>` by walking
     `tr`/`th`/`td`, building one `ParsedBlock`
     `{ type: "table", editable: false, text: "", rows }` per table. Reuse the
     existing `append`/`recordInlineStyles`/`trimWithStyles` helpers per cell
     so pasted formatting survives. This makes paste from Excel / Google
     Sheets / Google Docs / web pages work (they all put `text/html` tables on
     the clipboard). Nested tables: flatten inner table into the cell's text
     (out of scope to represent them).
   - **Copy** — in `getSelected`, when a table block is inside a multi-block
     selection, serialize it as a real `<table>` (cells via the existing
     `stylesToHtml`) in the `text/html` flavor and as TSV lines (cells joined
     by `\t`) in `text/plain`, so copying out to spreadsheets round-trips.
     Tables are atomic for selection purposes: fully in or fully out,
     same as `hr`.

4. **No other core changes.** Caret skip-over, Enter/Backspace around atomic
   blocks, `insertBlock`, and slot rendering already handle
   `editable: false` blocks correctly.

## Workstream 2 — `markdown` package (GFM pipe tables)

1. **`markdownToBlocks`**: recognize a GFM table — a `| … |` header line
   followed by a delimiter line (`| --- | :---: | ---: |`) — and consume
   subsequent `|` rows into one table block. Details:
   - Split rows on unescaped `|` (support `\|` inside cells); trim cell
     whitespace.
   - Run each cell through the existing `parseInline` → `{ text, styles }`.
   - Delimiter colons → `align` array (omit if all `null`).
   - Pad/truncate body rows to the header's column count (GFM behavior).
   - A pipe line *without* a following delimiter line is not a table — leave
     it as a plain paragraph.
   - ID reconciliation needs nothing new: `contentKey` JSON-stringifies the
     whole block, so unchanged tables keep their id via the existing LCS.

2. **`blocksToMarkdown`**: serialize a `type: "table"` block (branch before
   the extra-props XML fallback, like `code`/`hr`) to a pipe table:
   - Cells rendered with the existing `renderInline` (styles → markers),
     then escape `|` as `\|` and replace `\n` inside a cell with `<br>`.
   - Emit the delimiter row from `align`.
   - Update `markdownToBlocks` to turn a literal `<br>` inside a table cell
     back into `\n` so multi-line cells round-trip.

3. **Docs**: update the doc comments in both files and the supported-syntax
   line in `API.md`.

## Workstream 3 — `vuewrite/table` subpath export

The table UI ships with the library as an opt-in entry, mirroring how the
markdown helpers ship as `vuewrite/markdown`. One structural difference:
unlike `vuewrite-markdown` (dependency-free, hence a separate workspace
package), the table component imports `TextEditor` from the core — a separate
workspace package would create a circular workspace dependency. So it lives
**inside `packages/vuewrite/src`** as a second build entry:

1. **Packaging**:
   - Components in `packages/vuewrite/src/components/Table/`, public entry
     `packages/vuewrite/src/table.ts`.
   - `vite.config.ts`: add `table: "./src/table.ts"` to `build.lib.entry`.
     Rollup code-splits shared modules between the `vuewrite` and `table`
     entries, so the core isn't duplicated in the bundle.
   - `package.json`: add a `"./table"` entry to `exports`
     (`./dist/table.js` + `./dist/table.d.ts`).
   - Users who never import `vuewrite/table` pay nothing.

2. **`<TableEditor>`** (used inside the editor's `#table` slot):
   - Props: `block` (the table block, required), the slot `props` via
     `v-bind` (carries `data-vw-block-id`), `decorator?` (forwarded to cell
     editors), `editor?: TextEditorRef` (when given, structural mutations
     call `editor.pushHistory(...)` and Backspace-on-empty-table calls
     `editor.removeCurrentBlock()`).
   - Emits: `change` after any mutation, for consumers that manage history
     themselves.
   - Root element is `contenteditable="false"` — the same pattern as the dev
     app's `VImageUploader`, so the outer editor treats the whole table as
     one atomic block.
   - Renders `<table>` from `block.rows`; each cell hosts
     `<TextEditor single v-model="cell.text" v-model:styles="cell.styles">`.
     Cell editors `stopPropagation` on `keydown`/`beforeinput`/clipboard
     events so the outer editor doesn't double-handle them (the `CodeEditor`
     slot already establishes this pattern).
   - Controls: add/remove row and column, delete table.
   - Keyboard: Tab / Shift+Tab move between cells, Enter in the last cell
     adds a row (or exits the table), Backspace in an empty first cell
     deletes the table (via `editor` when provided, otherwise emits).
   - Unstyled by default beyond structural CSS — theming is the consumer's,
     consistent with the rest of the library.

3. **`<TableViewer>`** (used inside `TextViewer`'s `#table` slot): static
   `<table>` rendering of `block.rows`, cells rendered decorator-aware
   (reusing the static path of `TextEditorBlock` per cell).

4. **`table.ts` exports**: `TableEditor`, `TableViewer`, `TableCell` type,
   and a `createTableBlock(rows?, cols?)` helper returning a ready
   `Partial<Block>` for `insertBlock`.

## Workstream 4 — `dev-app` integration (consumer demo)

The dev app becomes the first consumer of `vuewrite/table`:

1. `#table` slot in the editor panel → `<TableEditor :block="block"
   v-bind="props" :decorator="decorator" :editor="textEditorRef" />`.
2. "Table" in the slash-command popover →
   `insertBlock(createTableBlock(2, 2))`.
3. `#table` slot in the `TextViewer` panel → `<TableViewer>`.
4. Table theming CSS in `App.vue`/`global.sass`.

## Testing

All in vitest, following the existing layout:

- `packages/markdown/tests` — table parse (basic, alignment, escaped pipes,
  inline styles in cells, ragged rows, pipe-line-without-delimiter negative
  case), serialize, and full round-trip including `<br>` multi-line cells and
  id stability across re-parses.
- `packages/vuewrite/test/clipboardEvents.test.ts` — paste `<table>` HTML
  (plain, styled cells, Excel-style markup with `<tbody>`/attributes), copy a
  selection containing a table → assert `text/html` table and TSV plain text.
- `packages/vuewrite/test/TextEditorHistory.test.ts` — undo/redo restores a
  custom prop (`rows`) after mutation + `pushHistory`, including a deleted
  custom prop not resurrecting via the assign path.
- Editor behavior (`TextEditor.test.ts`, happy-dom): insertBlock a table,
  caret skips it, Backspace/Delete removal.
- `packages/vuewrite/test/TableEditor.test.ts` (happy-dom, like
  `TextEditor.test.ts`): render from `rows`, cell edit updates the block,
  add/remove row and column (+ `pushHistory` called when `editor` is
  provided), Tab navigation between cells, `createTableBlock` shape.

## Out of scope (v1)

- colspan / rowspan, nested tables, column widths, cell background — the
  `TableCell` object shape leaves room for these later.
- Cross-cell text selection (selecting from inside one cell into another).
  The table is atomic to the outer editor; within it, each cell is its own
  selection context. This matches Notion-class editors' behavior closely
  enough for v1.
- Grouped/nested rendering inside the editable root (Option B). If it's ever
  wanted for lists, that's an independent core project.

## Rollout

Purely additive: no existing type, prop, or serialization changes shape, and
`vuewrite/table` is a new opt-in entry point. Documents without tables are
untouched; `rows` is just another custom block prop to code that doesn't know
it. Ship as the next minor of `vuewrite` (**1.3.0**; current is 1.2.0 — the
history custom-prop fix alone is worth a minor bump). Update `API.md` (table
contract, `vuewrite/table` components, clipboard behavior) and the README
feature list.

## Suggested order

1. Core: `Block` index signature + history custom-prop cloning (small,
   unblocks everything, fixes an existing image-undo bug).
2. Markdown parse/serialize + tests (pure functions, fastest feedback).
3. Clipboard paste/copy + tests.
4. `vuewrite/table` entry: `TableEditor`, `TableViewer`,
   `createTableBlock` + packaging (vite entry, exports map) + tests.
5. dev-app integration: slots, slash command, theming CSS.
6. Docs pass (`API.md`, README, doc comments).

## Decisions (previously open questions)

1. **Header row: row 0 is always the header.** GFM cannot express a
   headerless table, so headerless mode would break the markdown round-trip.
   A `header: false` prop is purely additive if ever needed — defer it.
2. **Cell editor: nested `<TextEditor single>` per cell.** Cells get inline
   styles, the decorator, per-cell undo and styled clipboard for free through
   the public API. The cost — one document-level `selectionchange` listener
   per cell — is fine at document-table scale (tens of cells). If a large
   table ever hurts, the escape hatch is internal to the component: render
   static cells and mount a single editor only in the focused cell. The data
   contract is unaffected, so this optimization never blocks anything.
3. **The table UI ships with the library as `vuewrite/table`.** Since the
   markdown package already speaks tables, the library should ship the other
   half of the story too. It's a subpath export of the `vuewrite` npm package
   (matching the existing `vuewrite/markdown` convention, rather than a
   separate `@vuewrite/table` npm package) and lives inside
   `packages/vuewrite/src` as its own build entry — a separate workspace
   package would circularly depend on the core. Opt-in and tree-shakable:
   the core stays bare-essentials for users who don't import it.
