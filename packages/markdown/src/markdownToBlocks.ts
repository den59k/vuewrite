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
export interface MarkdownToBlocksOptions {
  /** When true, single newlines merge consecutive plain lines into one paragraph block,
   *  and blank lines act as paragraph separators without producing empty blocks. */
  softBreaks?: boolean
}

export function markdownToBlocks(
  markdown: string,
  previousBlocks: Block[] = [],
  options: MarkdownToBlocksOptions = {},
): Block[] {
  const raw = parseBlocks(markdown.split('\n'), options.softBreaks ?? false)
  return reconcileIds(raw, previousBlocks)
}

// ── Block parsing ─────────────────────────────────────────────────────────────

function parseBlocks(lines: string[], softBreaks: boolean): Block[] {
  const blocks: Block[] = []
  const push = (block: Omit<Block, 'id'>) => blocks.push({ id: '', ...block } as Block)
  let i = 0
  let prevWasBlank = false

  while (i < lines.length) {
    const line = lines[i]
    const wasBlank = prevWasBlank
    prevWasBlank = line === ''

    // Custom fenced block: ::: type ... :::
    const fenceMatch = line.match(/^:::\s*(\S+)/)
    if (fenceMatch) {
      const body: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++])
      push({ type: fenceMatch[1], ...withStyles(parseInline(body.join('\n'))) })
      i++ // skip closing :::
      continue
    }

    // XML paired: <tag attrs>text</tag>
    const xmlPaired = line.match(/^<(\w[\w-]*)(\s[^>]*)?>(.+)<\/\1>$/)
    if (xmlPaired) {
      push({ type: xmlPaired[1], ...parseAttributes(xmlPaired[2] ?? ''), ...withStyles(parseInline(xmlPaired[3])) })
      i++
      continue
    }

    // XML self-closing: <tag attrs/> or <tag attrs>
    const xmlSelf = line.match(/^<(\w[\w-]*)(\s[^>]*)?\s*\/?>$/)
    if (xmlSelf) {
      push({ text: '', type: xmlSelf[1], editable: false, ...parseAttributes(xmlSelf[2] ?? '') })
      i++
      continue
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) codeLines.push(lines[i++])
      push({ text: codeLines.join('\n'), type: 'code', editable: false })
      i++ // skip closing ```
      continue
    }

    // Heading: # / ## / ###
    const headingMatch = line.match(/^(#{1,3}) (.+)$/)
    if (headingMatch) {
      push({ type: `h${headingMatch[1].length}`, ...withStyles(parseInline(headingMatch[2])) })
      i++
      continue
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*] (.+)$/)
    if (ulMatch) {
      push({ type: 'li', ...withStyles(parseInline(ulMatch[1])) })
      i++
      continue
    }

    // Ordered list item
    const olMatch = line.match(/^\d+\. (.+)$/)
    if (olMatch) {
      push({ type: 'ol', ...withStyles(parseInline(olMatch[1])) })
      i++
      continue
    }

    // Empty line
    if (line === '') {
      if (!softBreaks && blocks.length > 0 && i < lines.length - 1) push({ text: '' })
      i++
      continue
    }

    // Plain paragraph (or soft-break continuation)
    const parsed = parseInline(line)
    const last = blocks[blocks.length - 1]
    if (softBreaks && !wasBlank && last?.type === undefined && last?.text) {
      appendToLastParagraph(last, parsed)
    } else {
      push(withStyles(parsed))
    }
    i++
  }

  if (blocks.length === 0) push({ text: '' })
  return blocks
}

type InlineParsed = ReturnType<typeof parseInline>

function withStyles({ text, styles }: InlineParsed): { text: string; styles?: Style[] } {
  return styles.length > 0 ? { text, styles } : { text }
}

function appendToLastParagraph(block: Block, { text, styles }: InlineParsed) {
  const offset = block.text.length + 1
  block.text += '\n' + text
  if (styles.length > 0) {
    if (!block.styles) block.styles = []
    for (const s of styles) block.styles.push({ ...s, start: s.start + offset, end: s.end + offset })
  }
}

// ── ID reconciliation ─────────────────────────────────────────────────────────

function reconcileIds(blocks: Block[], previousBlocks: Block[]): Block[] {
  if (previousBlocks.length === 0) return blocks.map(b => ({ ...b, id: uid() }))
  const idMap = buildIdMap(blocks, previousBlocks)
  return blocks.map((b, j) => ({ ...b, id: idMap.get(j) ?? uid() }))
}

function buildIdMap(blocks: Block[], previousBlocks: Block[]): Map<number, string> {
  const oldKeys = previousBlocks.map(contentKey)
  const newKeys = blocks.map(contentKey)
  const pairs = lcsIndices(oldKeys, newKeys)
  const map = new Map(pairs.map(([i, j]) => [j, previousBlocks[i].id]))

  // Preserve the last block's ID when only its text changed (not type).
  const lastJ = blocks.length - 1
  const lastOld = previousBlocks[previousBlocks.length - 1]
  const lastNew = blocks[lastJ]
  if (lastNew && lastOld && !map.has(lastJ) && lastNew.type === lastOld.type) {
    const usedIds = new Set(map.values())
    if (!usedIds.has(lastOld.id)) map.set(lastJ, lastOld.id)
  }

  return map
}

function contentKey({ id: _id, ...rest }: Block): string {
  return JSON.stringify(rest)
}

function lcsIndices(oldKeys: string[], newKeys: string[]): Array<[number, number]> {
  const m = oldKeys.length
  const n = newKeys.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldKeys[i - 1] === newKeys[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const pairs: Array<[number, number]> = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (oldKeys[i - 1] === newKeys[j - 1]) {
      pairs.unshift([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return pairs
}

// ── Inline parsing ────────────────────────────────────────────────────────────

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
    if (boldItalicM) { recurse(boldItalicM[1], ['bold', 'italic']); i += boldItalicM[0].length; continue }

    // Bold: **text**
    const boldM = rest.match(/^\*\*([\s\S]*?)\*\*/)
    if (boldM) { recurse(boldM[1], ['bold']); i += boldM[0].length; continue }

    // Underline: __text__ (must come before single _ italic)
    const underlineM = rest.match(/^__([\s\S]*?)__/)
    if (underlineM) { recurse(underlineM[1], ['underline']); i += underlineM[0].length; continue }

    // Italic: *text* or _text_
    const italicAsteriskM = rest.match(/^\*([\s\S]*?)\*/)
    if (italicAsteriskM) { recurse(italicAsteriskM[1], ['italic']); i += italicAsteriskM[0].length; continue }

    const italicUnderscoreM = rest.match(/^_([\s\S]*?)_/)
    if (italicUnderscoreM) { recurse(italicUnderscoreM[1], ['italic']); i += italicUnderscoreM[0].length; continue }

    // Inline code: `text`
    const codeM = rest.match(/^`([\s\S]*?)`/)
    if (codeM) {
      const start = plainText.length
      plainText += codeM[1]
      styles.push({ start, end: plainText.length, style: 'code' })
      i += codeM[0].length
      continue
    }

    // Link: [text](url)
    const linkM = rest.match(/^\[([\s\S]*?)\]\(([\s\S]*?)\)/)
    if (linkM) { recurse(linkM[1], ['link'], { href: linkM[2] }); i += linkM[0].length; continue }

    // Escaped character: \X → X
    if (md[i] === '\\' && i + 1 < md.length) { plainText += md[i + 1]; i += 2; continue }

    plainText += md[i]
    i++
  }

  return { text: plainText, styles }
}

function parseAttributes(attrStr: string): Record<string, string | true> {
  const result: Record<string, string | true> = {}
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) result[m[1]] = m[2] ?? m[3] ?? m[4] ?? true
  return result
}
