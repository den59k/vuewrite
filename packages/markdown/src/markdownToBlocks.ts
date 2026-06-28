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
 *   ---           → { type: "hr", editable: false }  (thematic break / separator)
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

    // Custom fenced block: ::: type [attrs] … ::: (multi-line body + attributes)
    const fenceMatch = line.match(/^:::\s*(\S+)\s*(.*)$/)
    if (fenceMatch) {
      const attrs = parseAttributes(fenceMatch[2] ?? '')
      const body: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++])
      push({ type: fenceMatch[1], ...attrs, ...withStyles(parseInline(body.join('\n'))) })
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

    // Fenced code block, with an optional language info string: ```ts
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) codeLines.push(lines[i++])
      push({ text: codeLines.join('\n'), type: 'code', editable: false, ...(lang ? { lang } : {}) })
      i++ // skip closing ```
      continue
    }

    // Thematic break / separator: --- (3 or more dashes)
    if (/^-{3,}$/.test(line)) {
      push({ text: '', type: 'hr', editable: false })
      i++
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

// ── Inline emphasis (delimiter-stack with CommonMark flanking) ──────────────────
// Emphasis runs (`*`, `_`, `~`) only open/close when they "flank" non-whitespace
// per CommonMark's rules, so `2 * 3` and `snake_case` are left as plain text
// instead of being mis-parsed as italics. Code spans and links bind tighter and
// are resolved first (links recursively, so their text can carry its own styles).
//
// vuewrite's marker scheme is custom: `*`→italic, `**`→bold, `_`→italic,
// `__`→underline, `~~`→strikethrough, `` ` ``→code, `[t](url)`→link.

const ASCII_PUNCT = /[!-/:-@[-`{-~]/

const isWs = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch)
const isPunct = (ch: string | undefined): boolean => ch !== undefined && ASCII_PUNCT.test(ch)

interface Delim {
  char: string
  /** Live [start, end) of the run's chars in the output buffer; shrinks as consumed. */
  start: number
  end: number
  canOpen: boolean
  canClose: boolean
}

/** Left/right-flanking test (with the intraword-underscore restriction for `_`). */
function flanking(char: string, before: string | undefined, after: string | undefined): { canOpen: boolean; canClose: boolean } {
  const beforeWs = isWs(before)
  const afterWs = isWs(after)
  const beforePunct = isPunct(before)
  const afterPunct = isPunct(after)
  const left = !afterWs && (!afterPunct || beforeWs || beforePunct)
  const right = !beforeWs && (!beforePunct || afterWs || afterPunct)
  if (char === '_') {
    return { canOpen: left && (!right || beforePunct), canClose: right && (!left || afterPunct) }
  }
  return { canOpen: left, canClose: right }
}

/** Style name + how many delimiter chars it consumes, for a `count`-long match. */
function styleFor(char: string, count: number): { style: string; consume: number } {
  if (char === '*') return count >= 2 ? { style: 'bold', consume: 2 } : { style: 'italic', consume: 1 }
  if (char === '_') return count >= 2 ? { style: 'underline', consume: 2 } : { style: 'italic', consume: 1 }
  return { style: 'strikethrough', consume: 2 } // '~' (GFM: `~~` only)
}

/** Match `[text](url "title")` at `i` (balanced brackets/parens); title is dropped. */
function matchLink(md: string, i: number): { text: string; href: string; next: number } | null {
  let depth = 0
  let j = i
  for (; j < md.length; j++) {
    const c = md[j]
    if (c === '\\') { j++; continue }
    if (c === '[') depth++
    else if (c === ']') { depth--; if (depth === 0) break }
  }
  if (md[j] !== ']' || md[j + 1] !== '(') return null
  const text = md.slice(i + 1, j)

  let k = j + 2
  let paren = 1
  let url = ''
  for (; k < md.length; k++) {
    const c = md[k]
    if (c === '\\') { url += md[k + 1] ?? ''; k++; continue }
    if (c === '(') paren++
    else if (c === ')') { paren--; if (paren === 0) break }
    url += c
  }
  if (md[k] !== ')') return null

  // A space separates an (optional) title from the destination; keep only the dest.
  const href = url.trim().split(/\s+/)[0] ?? ''
  return { text, href, next: k + 1 }
}

function parseInline(md: string): { text: string; styles: Style[] } {
  const out: string[] = []
  const styles: Style[] = []
  const delims: Delim[] = []

  let i = 0
  while (i < md.length) {
    const ch = md[i]

    // Escaped character: \X → literal X (never a delimiter).
    if (ch === '\\' && i + 1 < md.length) { out.push(md[i + 1]); i += 2; continue }

    // Inline code: a run of N backticks closed by the next run of exactly N.
    if (ch === '`') {
      let n = 0
      while (md[i + n] === '`') n++
      const fence = '`'.repeat(n)
      const close = md.indexOf(fence, i + n)
      if (close !== -1) {
        const start = out.length
        for (const c of md.slice(i + n, close)) out.push(c)
        styles.push({ start, end: out.length, style: 'code' })
        i = close + n
        continue
      }
      for (let k = 0; k < n; k++) out.push('`')
      i += n
      continue
    }

    // Link: [text](url) — text is parsed recursively so it can carry styles.
    if (ch === '[') {
      const link = matchLink(md, i)
      if (link) {
        const inner = parseInline(link.text)
        const start = out.length
        for (const c of inner.text) out.push(c)
        const end = out.length
        for (const s of inner.styles) styles.push({ ...s, start: s.start + start, end: s.end + start })
        styles.push({ start, end, style: 'link', meta: { href: link.href } })
        i = link.next
        continue
      }
      out.push('[')
      i++
      continue
    }

    // Emphasis delimiter run.
    if (ch === '*' || ch === '_' || ch === '~') {
      let n = 0
      while (md[i + n] === ch) n++
      const { canOpen, canClose } = flanking(ch, i > 0 ? md[i - 1] : undefined, md[i + n])
      const start = out.length
      for (let k = 0; k < n; k++) out.push(ch)
      delims.push({ char: ch, start, end: out.length, canOpen, canClose })
      i += n
      continue
    }

    out.push(ch)
    i++
  }

  const deletions = resolveEmphasis(delims, styles)
  return applyDeletions(out, styles, deletions)
}

/** Pair openers/closers into styles; return the delimiter-char ranges to remove. */
function resolveEmphasis(delims: Delim[], styles: Style[]): Array<[number, number]> {
  const deletions: Array<[number, number]> = []
  const len = (d: Delim): number => d.end - d.start

  for (let ci = 0; ci < delims.length; ci++) {
    const closer = delims[ci]
    if (!closer.canClose || len(closer) === 0) continue

    for (let oi = ci - 1; oi >= 0; oi--) {
      const opener = delims[oi]
      if (opener.char !== closer.char || !opener.canOpen || len(opener) === 0) continue
      if (closer.char === '~' && (len(opener) < 2 || len(closer) < 2)) continue

      // Emit styles from the outer edges inward until one side is exhausted.
      while (len(opener) > 0 && len(closer) > 0 && !(closer.char === '~' && (len(opener) < 2 || len(closer) < 2))) {
        const { style, consume } = styleFor(closer.char, Math.min(len(opener), len(closer)))
        const take = Math.min(consume, len(opener), len(closer))
        styles.push({ start: opener.end, end: closer.start, style })
        deletions.push([opener.end - take, opener.end])
        deletions.push([closer.start, closer.start + take])
        opener.end -= take
        closer.start += take
      }

      // Delimiters strictly between a matched pair can't cross it.
      for (let m = oi + 1; m < ci; m++) {
        delims[m].canOpen = false
        delims[m].canClose = false
      }
      break
    }
  }
  return deletions
}

/** Remove consumed delimiter chars and remap all style offsets through the gaps. */
function applyDeletions(out: string[], styles: Style[], deletions: Array<[number, number]>): { text: string; styles: Style[] } {
  if (deletions.length === 0) return { text: out.join(''), styles }

  const removed = new Array<boolean>(out.length).fill(false)
  for (const [a, b] of deletions) for (let k = a; k < b; k++) removed[k] = true

  // shift[p] = number of removed chars before index p.
  const shift = new Array<number>(out.length + 1)
  let d = 0
  for (let k = 0; k <= out.length; k++) {
    shift[k] = d
    if (k < out.length && removed[k]) d++
  }

  const text = out.filter((_, k) => !removed[k]).join('')
  const mapped = styles
    .map((s) => ({ ...s, start: s.start - shift[s.start], end: s.end - shift[s.end] }))
    .filter((s) => s.end > s.start)
  return { text, styles: mapped }
}

function parseAttributes(attrStr: string): Record<string, string | true> {
  const result: Record<string, string | true> = {}
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) result[m[1]] = m[2] ?? m[3] ?? m[4] ?? true
  return result
}
