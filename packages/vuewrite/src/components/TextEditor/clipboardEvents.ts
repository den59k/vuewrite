import { TextEditorStore } from "./TextEditorStore"

export type ParsedBlock = { text: string, type?: string, editable?: boolean }

type HtmlParser = (el: Element) => string | null | void

// Block-level tags that map to a separate editor block.
const BLOCK_TAGS = new Set([
  "DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER",
])

const isContainerChild = (el: Element) =>
  BLOCK_TAGS.has(el.tagName) || el.tagName === "UL" || el.tagName === "OL" || el.tagName === "HR"

/** Text content of a node, turning <br> into "\n". Collapses runs of HTML
 *  formatting whitespace to a single space unless `preserve` is set (e.g. <pre>). */
const extractText = (node: Node, preserve: boolean): string => {
  let out = ""
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = child.textContent ?? ""
      out += preserve ? value : value.replace(/\s+/g, " ")
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      if (el.tagName === "BR") out += "\n"
      else out += extractText(el, preserve)
    }
  }
  return out
}

/**
 * Flattens a pasted HTML tree into a list of block descriptors. Pure (DOM in,
 * data out) so it can be unit-tested without a store.
 *
 * - Block elements (<div>, <p>, <h1..6>, <li>, …) each become one block.
 * - <ul>/<ol> expand to one block per <li> (type defaults to "li"/"ol").
 * - <hr> becomes an atomic { type: "hr", editable: false } block.
 * - <br> becomes a "\n" inside the current block's text.
 * - Loose text and inline elements (<span>, <b>, …) are folded into one block.
 */
export const htmlToBlocks = (root: HTMLElement, htmlParser?: HtmlParser): ParsedBlock[] => {
  const out: ParsedBlock[] = []

  const walk = (node: Node) => {
    let buffer = ""
    const flush = () => {
      if (buffer.trim()) out.push({ text: buffer.trim() })
      buffer = ""
    }

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        buffer += (child.textContent ?? "").replace(/\s+/g, " ")
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName

      if (tag === "BR") { buffer += "\n"; continue }

      if (tag === "HR") {
        flush()
        out.push({ text: "", type: "hr", editable: false })
        continue
      }

      if (tag === "UL" || tag === "OL") {
        flush()
        const defaultType = tag === "OL" ? "ol" : "li"
        for (const li of el.children) {
          out.push({ text: extractText(li, false).trim(), type: htmlParser?.(li) ?? defaultType })
        }
        continue
      }

      if (BLOCK_TAGS.has(tag)) {
        flush()
        if (Array.from(el.children).some(isContainerChild)) {
          walk(el) // nested block structure — recurse instead of flattening
        } else {
          const preserve = tag === "PRE"
          const text = extractText(el, preserve)
          out.push({ text: preserve ? text : text.trim(), type: htmlParser?.(el) ?? undefined })
        }
        continue
      }

      // Inline element — fold its text into the current paragraph.
      buffer += extractText(el, false)
    }

    flush()
  }

  walk(root)
  return out
}

export const createClipboardEvents = (store: TextEditorStore, props: {
  preventMultiline?: boolean,
  htmlParser?: HtmlParser
}) => {

  const getSelected = () => {

    const [ start, end, startIndex, endIndex ] = store.startAndEnd

    if (startIndex === endIndex) {
      const text = store.blocks[startIndex].text.slice(start.offset, end.offset)
      return [
        new ClipboardItem({
          "text/plain": new Blob([ text ], { type: "text/plain" })
        })
      ]
    }

    const startText = store.blocks[startIndex].text.slice(start.offset)
    const endText = store.blocks[endIndex].text.slice(0, end.offset)

    const arr = [
      { type: store.blocks[startIndex].type, text: startText },
      ...store.blocks.slice(startIndex+1, endIndex),
      { type: store.blocks[endIndex].type, text: endText },
    ]
    const html = arr.map(item => item.type === "hr" ? "<hr>" : `<div>${item.text}</div>`).join("\n")
    const text = arr.map(item => item.text).join("\n")

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
      if (store.currentBlock) {
        if (block.type !== undefined) store.currentBlock.type = block.type
        if (block.editable !== undefined) store.currentBlock.editable = block.editable
      }
      if (block.text) insertMultilineText(block.text)
    })

    // Don't leave the caret stuck on a trailing non-editable block (e.g. <hr>).
    const last = blocks[blocks.length - 1]
    if (last && last.editable === false) store.addNewLine()
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
