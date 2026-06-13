import type { Block, Style } from './types.ts'

const MARKERS: Record<string, { open: string; close: string }> = {
  bold:      { open: '**', close: '**' },
  italic:    { open: '*',  close: '*'  },
  underline: { open: '__', close: '__' },
  code:      { open: '`',  close: '`'  },
}

/**
 * Converts an array of Vuewrite Block objects to a Markdown string.
 *
 * Block type mapping:
 *   { type: "h1" }               → # text
 *   { type: "h2" }               → ## text
 *   { type: "h3" }               → ### text
 *   { type: "li" }               → - text
 *   { type: "ol" }               → 1. text  (auto-numbered per consecutive run)
 *   { type: "code", ... }        → ```\ntext\n```
 *   { type: "hr" }               → ---
 *   { type: undefined/default }  → text (or empty line)
 *   { type: "custom" }          → ::: custom\ntext\n:::
 *
 * Inline style mapping:
 *   bold      → **text**
 *   italic    → *text*
 *   underline → __text__
 *   code      → `text`
 *   link      → [text](href)
 *   color     → plain text (no Markdown equivalent)
 */
const STANDARD_FIELDS = new Set(['id', 'text', 'type', 'styles', 'editable'])

export interface BlocksToMarkdownOptions {
  /** When true, each block is emitted as a real paragraph — separated by a blank
   *  line — while a "\n" inside a block stays a soft line break. This is the
   *  inverse of markdownToBlocks({ softBreaks: true }). Consecutive list items
   *  stay tight (single newline). When false (default), blocks are joined by a
   *  single newline and empty blocks act as blank-line separators. */
  softBreaks?: boolean
}

const isListType = (type?: string) => type === 'li' || type === 'ol'

/** Markdown for a single block, paired with its type so the join step can decide
 *  the separator (blank line between paragraphs, single newline between list items). */
type RenderedBlock = { md: string; type?: string }

export function blocksToMarkdown(blocks: Block[], options: BlocksToMarkdownOptions = {}): string {
  const parts: RenderedBlock[] = []
  let olCounter = 0

  for (const block of blocks) {
    if (block.type === 'code') {
      parts.push({ md: '```\n' + block.text + '\n```', type: 'code' })
      olCounter = 0
      continue
    }

    if (block.type === 'hr') {
      parts.push({ md: '---', type: 'hr' })
      olCounter = 0
      continue
    }

    // Blocks with extra (non-standard) props serialize as XML elements
    const extraKeys = Object.keys(block).filter(k => !STANDARD_FIELDS.has(k))
    if (block.type && extraKeys.length > 0) {
      const attrStr = extraKeys.map(k => {
        const v = block[k]
        return v === true ? k : `${k}="${v}"`
      }).join(' ')
      const prefix = attrStr ? ` ${attrStr}` : ''
      if (block.editable === false || !block.text) {
        parts.push({ md: `<${block.type}${prefix}/>`, type: block.type })
      } else {
        parts.push({ md: `<${block.type}${prefix}>${renderInline(block.text, block.styles ?? [])}</${block.type}>`, type: block.type })
      }
      olCounter = 0
      continue
    }

    const inline = renderInline(block.text, block.styles ?? [])

    switch (block.type) {
      case 'h1': parts.push({ md: `# ${inline}`,  type: 'h1' }); olCounter = 0; break
      case 'h2': parts.push({ md: `## ${inline}`, type: 'h2' }); olCounter = 0; break
      case 'h3': parts.push({ md: `### ${inline}`, type: 'h3' }); olCounter = 0; break
      case 'li': parts.push({ md: `- ${inline}`,  type: 'li' }); olCounter = 0; break
      case 'ol': parts.push({ md: `${++olCounter}. ${inline}`, type: 'ol' }); break
      default:
        if (block.type) {
          parts.push({ md: `:::${block.type}\n${inline}\n:::`, type: block.type })
        } else {
          parts.push({ md: inline, type: undefined })
        }
        olCounter = 0
        break
    }
  }

  // Legacy mode: blocks joined by a single newline; empty blocks act as blank lines.
  if (!options.softBreaks) return parts.map(p => p.md).join('\n')

  // softBreaks mode: separate blocks are real paragraphs (blank line between),
  // except consecutive list items which stay tight.
  let result = ''
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const tight = isListType(parts[i - 1].type) && isListType(parts[i].type)
      result += tight ? '\n' : '\n\n'
    }
    result += parts[i].md
  }
  return result
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_`\[\]]/g, '\\$&')
}

type Segment = { start: number; end: number; formats: string[]; linkHref?: string }

function buildSegments(text: string, styles: Style[]): Segment[] {
  const linkStyles = styles.filter(s => s.style === 'link')
  const formatStyles = styles.filter(s => s.style in MARKERS)

  const bpSet = new Set([0, text.length])
  for (const s of [...linkStyles, ...formatStyles]) {
    bpSet.add(s.start)
    bpSet.add(s.end)
  }
  const breakpoints = [...bpSet].sort((a, b) => a - b)

  const segments: Segment[] = []
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const start = breakpoints[i]
    const end = breakpoints[i + 1]

    const formats = formatStyles
      .filter(s => s.start <= start && s.end >= end)
      .map(s => s.style)
      // Sort by marker length descending so longer markers nest outermost
      .sort((a, b) => MARKERS[b].open.length - MARKERS[a].open.length)

    const link = linkStyles.find(l => l.start <= start && l.end >= end)
    segments.push({ start, end, formats, linkHref: link?.meta?.href as string | undefined })
  }

  return segments
}

function renderSegments(
  text: string,
  segments: Array<{ start: number; end: number; formats: string[] }>
): string {
  let result = ''
  let activeFormats: string[] = []

  for (const seg of segments) {
    const toClose = activeFormats.filter(f => !seg.formats.includes(f))

    if (toClose.length > 0) {
      // Close all active formats, then reopen those that should continue.
      // This handles overlapping styles at the cost of `**...**` adjacency for bold.
      for (const f of [...activeFormats].reverse()) result += MARKERS[f].close
      for (const f of seg.formats) result += MARKERS[f].open
    } else {
      for (const f of seg.formats) {
        if (!activeFormats.includes(f)) result += MARKERS[f].open
      }
    }

    activeFormats = seg.formats
    // Verbatim inside code spans; escape everywhere else
    result += seg.formats.includes('code')
      ? text.slice(seg.start, seg.end)
      : escapeMarkdown(text.slice(seg.start, seg.end))
  }

  for (const f of [...activeFormats].reverse()) result += MARKERS[f].close

  return result
}

function renderInline(text: string, styles: Style[]): string {
  if (styles.length === 0) return escapeMarkdown(text)

  const segments = buildSegments(text, styles)

  let result = ''
  let i = 0

  while (i < segments.length) {
    const seg = segments[i]

    if (seg.linkHref !== undefined) {
      const href = seg.linkHref
      const linkSegs: typeof segments = []
      while (i < segments.length && segments[i].linkHref === href) {
        linkSegs.push(segments[i])
        i++
      }
      result += `[${renderSegments(text, linkSegs)}](${href})`
    } else {
      const plainSegs: typeof segments = []
      while (i < segments.length && segments[i].linkHref === undefined) {
        plainSegs.push(segments[i])
        i++
      }
      result += renderSegments(text, plainSegs)
    }
  }

  return result
}
