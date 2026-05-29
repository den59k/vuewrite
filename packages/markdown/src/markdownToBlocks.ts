import type { Block, Style } from './types.ts'

let _counter = 0
const uid = () => (++_counter).toString()

/**
 * Converts a Markdown string to an array of Vuewrite Block objects.
 *
 * Block type mapping:
 *   # text        → { type: "h1" }
 *   ## text       → { type: "h2" }
 *   ### text      → { type: "h3" }
 *   - text        → { type: "li" }
 *   1. text       → { type: "ol" }
 *   ```...```     → { type: "code", editable: false }
 *   ::: type ...  → { type: "type" }  (custom block, inline styles parsed)
 *   (empty line)  → { text: "" }
 *   plain text    → { type: undefined }
 *
 * Inline style mapping:
 *   **text**      → bold
 *   *text*        → italic
 *   __text__      → underline
 *   `text`        → code
 *   [text](url)   → link (meta: { href: url })
 *   ***text***    → bold + italic
 */
export function markdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Custom fenced block: ::: type
    const customFenceMatch = line.match(/^:::\s*(\S+)/)
    if (customFenceMatch) {
      const type = customFenceMatch[1]
      const bodyLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== ':::') {
        bodyLines.push(lines[i])
        i++
      }
      const { text, styles } = parseInline(bodyLines.join('\n'))
      const block: Block = { id: uid(), text, type }
      if (styles.length > 0) block.styles = styles
      blocks.push(block)
      i++ // skip closing :::
      continue
    }

    // XML element with closing tag: <tag attrs>text</tag>
    const xmlPairedMatch = line.match(/^<(\w[\w-]*)(\s[^>]*)?>(.+)<\/\1>$/)
    if (xmlPairedMatch) {
      const attrs = parseAttributes(xmlPairedMatch[2] ?? '')
      const { text, styles } = parseInline(xmlPairedMatch[3])
      const block: Block = { id: uid(), text, type: xmlPairedMatch[1], ...attrs }
      if (styles.length > 0) block.styles = styles
      blocks.push(block)
      i++
      continue
    }

    // Self-closing or opening-only XML element: <tag attrs/> or <tag attrs>
    const xmlSelfMatch = line.match(/^<(\w[\w-]*)(\s[^>]*)?\s*\/?>$/)
    if (xmlSelfMatch) {
      const attrs = parseAttributes(xmlSelfMatch[2] ?? '')
      const block: Block = { id: uid(), text: '', type: xmlSelfMatch[1], editable: false, ...attrs }
      blocks.push(block)
      i++
      continue
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({ id: uid(), text: codeLines.join('\n'), type: 'code', editable: false })
      i++ // skip closing ```
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3}) (.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3
      const type = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      const { text, styles } = parseInline(headingMatch[2])
      const block: Block = { id: uid(), text, type }
      if (styles.length > 0) block.styles = styles
      blocks.push(block)
      i++
      continue
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*] (.+)$/)
    if (ulMatch) {
      const { text, styles } = parseInline(ulMatch[1])
      const block: Block = { id: uid(), text, type: 'li' }
      if (styles.length > 0) block.styles = styles
      blocks.push(block)
      i++
      continue
    }

    // Ordered list item
    const olMatch = line.match(/^\d+\. (.+)$/)
    if (olMatch) {
      const { text, styles } = parseInline(olMatch[1])
      const block: Block = { id: uid(), text, type: 'ol' }
      if (styles.length > 0) block.styles = styles
      blocks.push(block)
      i++
      continue
    }

    // Empty line → empty block (skip leading/trailing empties)
    if (line === '') {
      if (blocks.length > 0 && i < lines.length - 1) {
        blocks.push({ id: uid(), text: '' })
      }
      i++
      continue
    }

    // Plain paragraph
    const { text, styles } = parseInline(line)
    const block: Block = { id: uid(), text }
    if (styles.length > 0) block.styles = styles
    blocks.push(block)
    i++
  }

  if (blocks.length === 0) {
    blocks.push({ id: uid(), text: '' })
  }

  return blocks
}

function parseAttributes(attrStr: string): Record<string, string | true> {
  const result: Record<string, string | true> = {}
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) {
    result[m[1]] = m[2] ?? m[3] ?? m[4] ?? true
  }
  return result
}

function parseInline(md: string): { text: string; styles: Style[] } {
  let plainText = ''
  const styles: Style[] = []

  function recurse(inner: string, extraStyles: string[], linkMeta?: Record<string, unknown>) {
    const start = plainText.length
    const result = parseInline(inner)
    plainText += result.text
    const end = plainText.length

    for (const styleName of extraStyles) {
      styles.push({ start, end, style: styleName, ...(linkMeta ? { meta: linkMeta } : {}) })
    }
    for (const s of result.styles) {
      styles.push({ ...s, start: start + s.start, end: start + s.end })
    }
  }

  let i = 0
  while (i < md.length) {
    const rest = md.slice(i)

    // Bold + italic: ***text***
    const boldItalicM = rest.match(/^\*\*\*([\s\S]*?)\*\*\*/)
    if (boldItalicM) {
      recurse(boldItalicM[1], ['bold', 'italic'])
      i += boldItalicM[0].length
      continue
    }

    // Bold: **text**
    const boldM = rest.match(/^\*\*([\s\S]*?)\*\*/)
    if (boldM) {
      recurse(boldM[1], ['bold'])
      i += boldM[0].length
      continue
    }

    // Underline: __text__ (must come before single _ italic)
    const underlineM = rest.match(/^__([\s\S]*?)__/)
    if (underlineM) {
      recurse(underlineM[1], ['underline'])
      i += underlineM[0].length
      continue
    }

    // Italic: *text* or _text_
    const italicAsteriskM = rest.match(/^\*([\s\S]*?)\*/)
    if (italicAsteriskM) {
      recurse(italicAsteriskM[1], ['italic'])
      i += italicAsteriskM[0].length
      continue
    }

    const italicUnderscoreM = rest.match(/^_([\s\S]*?)_/)
    if (italicUnderscoreM) {
      recurse(italicUnderscoreM[1], ['italic'])
      i += italicUnderscoreM[0].length
      continue
    }

    // Inline code: `text`
    const codeM = rest.match(/^`([\s\S]*?)`/)
    if (codeM) {
      // Inline code is verbatim — don't recurse for nested styles
      const start = plainText.length
      plainText += codeM[1]
      styles.push({ start, end: plainText.length, style: 'code' })
      i += codeM[0].length
      continue
    }

    // Link: [text](url)
    const linkM = rest.match(/^\[([\s\S]*?)\]\(([\s\S]*?)\)/)
    if (linkM) {
      recurse(linkM[1], ['link'], { href: linkM[2] })
      i += linkM[0].length
      continue
    }

    // Escaped character: \X → X
    if (md[i] === '\\' && i + 1 < md.length) {
      plainText += md[i + 1]
      i += 2
      continue
    }

    plainText += md[i]
    i++
  }

  return { text: plainText, styles }
}
