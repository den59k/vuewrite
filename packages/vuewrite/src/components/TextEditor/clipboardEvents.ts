import { Block, Style, TableAlign, TableCell, TextEditorStore } from "./TextEditorStore"

export type ParsedBlock = { text: string, type?: string, editable?: boolean, styles?: Style[], rows?: TableCell[][], align?: TableAlign[] }

type HtmlParser = (el: Element) => string | null | void

// Block-level tags that map to a separate editor block.
const BLOCK_TAGS = new Set([
  "DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER",
])

// Inline tags that map to an editor style name (the markdown package's vocabulary).
const INLINE_STYLE_TAGS: Record<string, string> = {
  B: "bold", STRONG: "bold",
  I: "italic", EM: "italic",
  U: "underline",
  CODE: "code",
}
// Inverse mapping for serializing styles back to HTML on copy.
const STYLE_TO_TAG: Record<string, string> = { bold: "b", italic: "i", underline: "u", code: "code" }

const isContainerChild = (el: Element) =>
  BLOCK_TAGS.has(el.tagName) || el.tagName === "UL" || el.tagName === "OL" || el.tagName === "HR"

const parseColor = (styleAttr: string | null): string | undefined => {
  if (!styleAttr) return undefined
  const match = styleAttr.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)
  return match ? match[1].trim() : undefined
}

/** Records the style(s) an inline element contributes over the [start, end) range. */
const recordInlineStyles = (styles: Style[], el: HTMLElement, start: number, end: number) => {
  if (end <= start) return
  const name = INLINE_STYLE_TAGS[el.tagName]
  if (name) styles.push({ start, end, style: name })
  if (el.tagName === "A") {
    const href = el.getAttribute("href")
    styles.push(href ? { start, end, style: "link", meta: { href } } : { start, end, style: "link" })
  }
  const color = parseColor(el.getAttribute("style"))
  if (color) styles.push({ start, end, style: "color", meta: { color } })
}

/** Appends a node's children into `acc`, turning <br> into "\n", collapsing HTML
 *  formatting whitespace (unless `preserve`), and recording inline style ranges. */
const append = (acc: { text: string, styles: Style[] }, node: Node, preserve: boolean) => {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = child.textContent ?? ""
      acc.text += preserve ? value : value.replace(/\s+/g, " ")
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    if (el.tagName === "BR") { acc.text += "\n"; continue }
    const start = acc.text.length
    append(acc, el, preserve)
    recordInlineStyles(acc.styles, el, start, acc.text.length)
  }
}

/** Trims surrounding whitespace from a block's text and shifts/clamps its styles. */
const trimWithStyles = (text: string, styles: Style[]): { text: string, styles: Style[] } => {
  const leading = text.length - text.replace(/^\s+/, "").length
  const trimmed = text.trim()
  if (leading === 0 && trimmed.length === text.length) return { text, styles }
  const adjusted: Style[] = []
  for (const s of styles) {
    const start = Math.max(0, s.start - leading)
    const end = Math.min(trimmed.length, s.end - leading)
    if (end > start) adjusted.push({ ...s, start, end })
  }
  return { text: trimmed, styles: adjusted }
}

/** Column alignment of a cell element, from its `align` attribute or text-align style. */
const parseCellAlign = (cell: HTMLElement): TableAlign => {
  const value = cell.getAttribute("align") ?? cell.style?.textAlign ?? ""
  return value === "left" || value === "center" || value === "right" ? value : null
}

/** Reads a <table>'s rows into TableCell[][]. Only direct <tr> (and those inside
 *  thead/tbody/tfoot) are collected, so a nested table is flattened into its
 *  cell's text by `append` rather than becoming rows of its own. Rows are padded
 *  to equal width so consumers can read defensively. Column alignment is taken
 *  from the first row's cells. */
const parseTableRows = (table: HTMLElement): { rows: TableCell[][], align?: TableAlign[] } => {
  const trs: HTMLElement[] = []
  for (const child of table.children) {
    if (child.tagName === "TR") trs.push(child as HTMLElement)
    else if (child.tagName === "THEAD" || child.tagName === "TBODY" || child.tagName === "TFOOT") {
      for (const tr of child.children) if (tr.tagName === "TR") trs.push(tr as HTMLElement)
    }
  }

  const rows: TableCell[][] = []
  const align: TableAlign[] = []
  for (const tr of trs) {
    const cells: TableCell[] = []
    for (const cell of tr.children) {
      if (cell.tagName !== "TD" && cell.tagName !== "TH") continue
      if (rows.length === 0) align.push(parseCellAlign(cell as HTMLElement))
      const acc = { text: "", styles: [] as Style[] }
      append(acc, cell, false)
      const trimmed = trimWithStyles(acc.text, acc.styles)
      cells.push(trimmed.styles.length ? { text: trimmed.text, styles: trimmed.styles } : { text: trimmed.text })
    }
    if (cells.length) rows.push(cells)
  }

  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0)
  for (const r of rows) while (r.length < cols) r.push({ text: "" })
  while (align.length < cols) align.push(null)
  return align.some(a => a !== null) ? { rows, align } : { rows }
}

const makeBlock = (result: { text: string, styles: Style[] }, type?: string): ParsedBlock => {
  const block: ParsedBlock = type !== undefined ? { text: result.text, type } : { text: result.text }
  if (result.styles.length) block.styles = result.styles
  return block
}

/**
 * Flattens a pasted HTML tree into a list of block descriptors. Pure (DOM in,
 * data out) so it can be unit-tested without a store.
 *
 * - Block elements (<div>, <p>, <h1..6>, <li>, …) each become one block.
 * - <ul>/<ol> expand to one block per <li> (type defaults to "li"/"ol").
 * - <hr> becomes an atomic { type: "hr", editable: false } block.
 * - <table> becomes an atomic { type: "table", editable: false, rows } block
 *   (from Excel / Google Sheets / Docs / web pages).
 * - <br> becomes a "\n" inside the current block's text.
 * - Loose text and inline elements (<span>, <b>, …) are folded into one block.
 * - Inline tags (<b>/<i>/<u>/<code>/<a>/<span style="color">) become styles.
 */
export const htmlToBlocks = (root: HTMLElement, htmlParser?: HtmlParser): ParsedBlock[] => {
  const out: ParsedBlock[] = []

  const walk = (node: Node) => {
    let buffer = { text: "", styles: [] as Style[] }
    const flush = () => {
      const trimmed = trimWithStyles(buffer.text, buffer.styles)
      if (trimmed.text) out.push(makeBlock(trimmed))
      buffer = { text: "", styles: [] }
    }

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        buffer.text += (child.textContent ?? "").replace(/\s+/g, " ")
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName

      if (tag === "BR") { buffer.text += "\n"; continue }

      if (tag === "HR") {
        flush()
        out.push({ text: "", type: htmlParser?.(el) ?? "hr", editable: false })
        continue
      }

      if (tag === "TABLE") {
        flush()
        // An empty <table> produces no block at all — a rows:[] table would render
        // as a zero-cell grid and wouldn't round-trip through markdown.
        const { rows, align } = parseTableRows(el)
        if (rows.length) out.push({ type: "table", editable: false, text: "", rows, ...(align ? { align } : {}) })
        continue
      }

      if (tag === "UL" || tag === "OL") {
        flush()
        const defaultType = tag === "OL" ? "ol" : "li"
        for (const li of el.children) {
          const acc = { text: "", styles: [] as Style[] }
          append(acc, li, false)
          out.push(makeBlock(trimWithStyles(acc.text, acc.styles), htmlParser?.(li) ?? defaultType))
        }
        continue
      }

      if (BLOCK_TAGS.has(tag)) {
        flush()
        if (Array.from(el.children).some(isContainerChild)) {
          walk(el) // nested block structure — recurse instead of flattening
        } else {
          const preserve = tag === "PRE"
          const acc = { text: "", styles: [] as Style[] }
          append(acc, el, preserve)
          const result = preserve ? acc : trimWithStyles(acc.text, acc.styles)
          out.push(makeBlock(result, htmlParser?.(el) ?? undefined))
        }
        continue
      }

      // Inline element — fold its styled text into the current paragraph.
      const start = buffer.text.length
      append(buffer, el, false)
      recordInlineStyles(buffer.styles, el, start, buffer.text.length)
    }

    flush()
  }

  walk(root)
  return out
}

const escapeText = (text: string) =>
  text.replace(/[&<>]/g, c => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;")).replace(/\n/g, "<br>")

const escapeAttr = (value: string) =>
  value.replace(/[&<>"]/g, c => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"))

const tagFor = (style: Style): { open: string, close: string } | null => {
  if (style.style === "link") {
    const href = (style.meta?.href ?? "") as string
    return { open: href ? `<a href="${escapeAttr(href)}">` : "<a>", close: "</a>" }
  }
  if (style.style === "color") {
    const color = (style.meta?.color ?? "") as string
    return color ? { open: `<span style="color: ${escapeAttr(color)}">`, close: "</span>" } : null
  }
  const tag = STYLE_TO_TAG[style.style]
  return tag ? { open: `<${tag}>`, close: `</${tag}>` } : null
}

/** Serializes text + styles to inline HTML (the inverse of the inline parsing above). */
export const stylesToHtml = (text: string, styles?: Style[]): string => {
  if (!styles || styles.length === 0) return escapeText(text)

  const bounds = new Set<number>([0, text.length])
  for (const s of styles) { bounds.add(s.start); bounds.add(s.end) }
  const points = [...bounds].sort((a, b) => a - b)

  let html = ""
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    if (to <= from) continue
    let chunk = escapeText(text.slice(from, to))
    for (const s of styles) {
      if (s.start <= from && s.end >= to) {
        const wrap = tagFor(s)
        if (wrap) chunk = wrap.open + chunk + wrap.close
      }
    }
    html += chunk
  }
  return html
}

/** Serializes table rows to a real <table> (row 0 as <thead>/<th>, the rest as
 *  <tbody>/<td>), so a copied table round-trips into spreadsheets and docs.
 *  Column alignment is emitted as `align` attributes, the inverse of parseCellAlign. */
const tableToHtml = (rows: TableCell[][], align?: TableAlign[]): string => {
  const row = (cells: TableCell[], tag: "th" | "td") =>
    `<tr>${cells.map((c, i) => {
      const a = align?.[i]
      return `<${tag}${a ? ` align="${a}"` : ""}>${stylesToHtml(c?.text ?? "", c?.styles)}</${tag}>`
    }).join("")}</tr>`
  const [head, ...body] = rows
  const thead = head ? `<thead>${row(head, "th")}</thead>` : ""
  const tbody = body.length ? `<tbody>${body.map(r => row(r, "td")).join("")}</tbody>` : ""
  return `<table>${thead}${tbody}</table>`
}

/** The table payload of a block, or undefined when the block isn't a table —
 *  a custom block carrying its own `rows` prop must not be treated as one. */
const tableOf = (block: Block): { rows: TableCell[][], align?: TableAlign[] } | undefined => {
  if (block.type !== "table" || !Array.isArray(block.rows)) return undefined
  const align = Array.isArray(block.align) ? block.align as TableAlign[] : undefined
  return { rows: block.rows as TableCell[][], align }
}

/** Serializes table rows to TSV (cells joined by tabs, rows by newlines) so a
 *  copied table pastes cleanly into Excel / Google Sheets. */
const tableToText = (rows: TableCell[][]): string =>
  rows.map(r => r.map(c => (c?.text ?? "").replace(/[\t\n]/g, " ")).join("\t")).join("\n")

/** Extracts the styles overlapping [from, to) and rebases them to start at 0. */
const sliceStyles = (styles: Style[] | undefined, from: number, to: number): Style[] => {
  if (!styles) return []
  const out: Style[] = []
  for (const s of styles) {
    const start = Math.max(s.start, from)
    const end = Math.min(s.end, to)
    if (end > start) out.push({ ...s, start: start - from, end: end - from })
  }
  return out
}

export const createClipboardEvents = (store: TextEditorStore, props: {
  preventMultiline?: boolean,
  htmlParser?: HtmlParser
}) => {

  const getSelected = () => {

    const [ start, end, startIndex, endIndex ] = store.startAndEnd

    if (startIndex === endIndex) {
      const block = store.blocks[startIndex]
      const table = tableOf(block)
      if (table) {
        return [
          new ClipboardItem({
            "text/html":  new Blob([ tableToHtml(table.rows, table.align) ], { type: "text/html" }),
            "text/plain": new Blob([ tableToText(table.rows) ], { type: "text/plain" })
          })
        ]
      }
      const text = block.text.slice(start.offset, end.offset)
      const styles = sliceStyles(block.styles, start.offset, end.offset)
      return [
        new ClipboardItem({
          "text/html":  new Blob([ stylesToHtml(text, styles) ], { type: "text/html" }),
          "text/plain": new Blob([ text ], { type: "text/plain" })
        })
      ]
    }

    const arr = [
      {
        type: store.blocks[startIndex].type,
        text: store.blocks[startIndex].text.slice(start.offset),
        styles: sliceStyles(store.blocks[startIndex].styles, start.offset, store.blocks[startIndex].text.length),
        table: tableOf(store.blocks[startIndex]),
      },
      ...store.blocks.slice(startIndex + 1, endIndex).map(b => ({ type: b.type, text: b.text, styles: b.styles ?? [], table: tableOf(b) })),
      {
        type: store.blocks[endIndex].type,
        text: store.blocks[endIndex].text.slice(0, end.offset),
        styles: sliceStyles(store.blocks[endIndex].styles, 0, end.offset),
        table: tableOf(store.blocks[endIndex]),
      },
    ]
    const html = arr.map(item =>
      item.table ? tableToHtml(item.table.rows, item.table.align) :
      item.type === "hr" ? "<hr>" :
      `<div>${stylesToHtml(item.text, item.styles)}</div>`
    ).join("\n")
    const text = arr.map(item => item.table ? tableToText(item.table.rows) : item.text).join("\n")

    return [
      new ClipboardItem({
        "text/html":  new Blob([ html ], { type: "text/html" }),
        "text/plain": new Blob([ text ], { type: "text/plain" })
      })
    ]
  }

  const onCopy = (e: ClipboardEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    navigator.clipboard.write(getSelected())
    store.history.push("setText")
  }

  const onCut = (e: ClipboardEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    navigator.clipboard.write(getSelected())
    store.deleteSelected()
    store.history.push("setText")
  }

  /** Inserts text at the caret. In preventMultiline mode each "\n" starts a new
   *  block; otherwise the newline stays inside the block as a soft break. */
  const insertMultilineText = (text: string) => {
    if (!props.preventMultiline) {
      store.insertText(text)
      return
    }
    const lines = text.split("\n")
    store.insertText(lines[0])
    for (let i = 1; i < lines.length; i++) {
      store.addNewLine()
      store.insertText(lines[i])
    }
  }

  /** Writes parsed blocks into the store: the first merges into the caret's
   *  block, each subsequent one starts a new block. No trailing empty block. */
  const applyBlocks = (blocks: ParsedBlock[]) => {
    blocks.forEach((block, i) => {
      const atomic = block.editable === false
      if (i > 0 || (atomic && store.currentBlock !== null && store.currentBlock.text !== "")) {
        store.addNewLine()
      }
      // addNewLine moves the text after the caret into the current block; an atomic
      // block must not swallow it — split again and step back onto the empty block.
      if (atomic && store.currentBlock && store.currentBlock.text !== "") {
        store.addNewLine() // caret is at offset 0, so this inserts an empty block before
        const index = store.blocks.findIndex(b => b.id === store.selection.anchor.blockId)
        const empty = store.blocks[index - 1]
        store.selection.anchor = { blockId: empty.id, offset: 0 }
        store.selection.focus = { blockId: empty.id, offset: 0 }
      }
      if (store.currentBlock) {
        if (block.type !== undefined) store.currentBlock.type = block.type
        if (block.editable !== undefined) store.currentBlock.editable = block.editable
        if (block.rows !== undefined) store.currentBlock.rows = block.rows
        if (block.align !== undefined) store.currentBlock.align = block.align
      }
      if (block.text) {
        const at = store.selection.focus.offset
        insertMultilineText(block.text)
        // Re-attach the parsed styles, rebased to where the text landed. Skipped in
        // preventMultiline mode, where a single block may be split across newlines.
        const target = store.currentBlock
        if (target && block.styles && block.styles.length && !props.preventMultiline) {
          if (!target.styles) target.styles = []
          for (const s of block.styles) {
            target.styles.push({ ...s, start: s.start + at, end: s.end + at })
          }
        }
      }
    })

    // Don't leave the caret stuck on a trailing non-editable block (e.g. <hr>):
    // move it to the following text block when one exists, else add a new line.
    const last = blocks[blocks.length - 1]
    if (last && last.editable === false) {
      const index = store.blocks.findIndex(b => b.id === store.selection.anchor.blockId)
      const next = store.blocks[index + 1]
      if (next && next.editable !== false) {
        store.selection.anchor = { blockId: next.id, offset: 0 }
        store.selection.focus = { blockId: next.id, offset: 0 }
      } else {
        store.addNewLine()
      }
    }
  }

  const parser = new DOMParser()
  const onPaste = (e: ClipboardEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    const html = e.clipboardData?.getData("text/html")

    if (html) {
      store.deleteSelected()
      const dom = parser.parseFromString(html, "text/html")
      applyBlocks(htmlToBlocks(dom.body, props.htmlParser))
    } else {
      const text = e.clipboardData?.getData("text")
      if (!text) return
      store.deleteSelected()
      insertMultilineText(text)
    }

    store.history.push("setText")
  }

  return {
    onCopy,
    onCut,
    onPaste
  }
}
