import { describe, it, expect } from 'vitest'
import { markdownToBlocks, blocksToMarkdown } from '../src/index.ts'
import type { Block } from '../src/index.ts'

const strip = (blocks: Block[]) => blocks.map(({ id: _id, ...rest }) => rest)
const table = (md: string) => markdownToBlocks(md)[0]

const BASIC = ['| Name | Age |', '| --- | --- |', '| Alice | 30 |', '| Bob | 25 |'].join('\n')

describe('markdownToBlocks — tables', () => {
  it('parses a basic pipe table (row 0 is the header)', () => {
    expect(strip(markdownToBlocks(BASIC))).toEqual([
      {
        type: 'table',
        editable: false,
        text: '',
        rows: [
          [{ text: 'Name' }, { text: 'Age' }],
          [{ text: 'Alice' }, { text: '30' }],
          [{ text: 'Bob' }, { text: '25' }],
        ],
      },
    ])
  })

  it('requires a leading pipe — a heading or paragraph with pipes stays what it is', () => {
    // Conservative on purpose: table rows must start with `|` (which is what
    // blocksToMarkdown emits), so '# a | b' above a delimiter row stays a heading.
    const md = ['Name | Age', '--- | ---', 'Alice | 30'].join('\n')
    expect(strip(markdownToBlocks(md)).every(b => b.type !== 'table')).toBe(true)
    const heading = ['# Results | 2024', '| --- | --- |', 'text'].join('\n')
    expect(strip(markdownToBlocks(heading))[0]).toMatchObject({ type: 'h1', text: 'Results | 2024' })
  })

  it('does not merge adjacent tables (or swallow a following paragraph)', () => {
    const two = ['| a |', '| --- |', '| 1 |', '| b |', '| --- |', '| 2 |'].join('\n')
    const blocks = strip(markdownToBlocks(two))
    expect(blocks.filter(b => b.type === 'table')).toHaveLength(2)
    expect((blocks[0] as any).rows).toEqual([[{ text: 'a' }], [{ text: '1' }]])
    expect((blocks[1] as any).rows).toEqual([[{ text: 'b' }], [{ text: '2' }]])

    const withParagraph = ['| a |', '| --- |', '| 1 |', 'plain a | b text'].join('\n')
    const blocks2 = strip(markdownToBlocks(withParagraph))
    expect((blocks2[0] as any).rows).toHaveLength(2)
    expect(blocks2[1]).toMatchObject({ text: 'plain a | b text' })
  })

  it('parses column alignment from the delimiter row', () => {
    const md = ['| L | C | R | D |', '| :--- | :---: | ---: | --- |', '| a | b | c | d |'].join('\n')
    expect((table(md) as any).align).toEqual(['left', 'center', 'right', null])
  })

  it('omits the align array when every column is default', () => {
    expect((table(BASIC) as any).align).toBeUndefined()
  })

  it('parses inline styles inside cells', () => {
    const md = ['| a | b |', '| --- | --- |', '| **bold** | [x](http://y) |'].join('\n')
    const rows = (table(md) as any).rows
    expect(rows[1][0]).toEqual({ text: 'bold', styles: [{ start: 0, end: 4, style: 'bold' }] })
    expect(rows[1][1]).toEqual({ text: 'x', styles: [{ start: 0, end: 1, style: 'link', meta: { href: 'http://y' } }] })
  })

  it('unescapes \\| inside a cell into a literal pipe', () => {
    const md = ['| a | b |', '| --- | --- |', String.raw`| x \| y | z |`].join('\n')
    expect((table(md) as any).rows[1][0]).toEqual({ text: 'x | y' })
  })

  it('turns <br> inside a cell into a newline', () => {
    const md = ['| a |', '| --- |', '| one<br>two |'].join('\n')
    expect((table(md) as any).rows[1][0]).toEqual({ text: 'one\ntwo' })
  })

  it('pads and truncates ragged body rows to the header width', () => {
    const md = ['| a | b | c |', '| --- | --- | --- |', '| 1 |', '| 1 | 2 | 3 | 4 |'].join('\n')
    const rows = (table(md) as any).rows
    expect(rows[1]).toEqual([{ text: '1' }, { text: '' }, { text: '' }])
    expect(rows[2]).toEqual([{ text: '1' }, { text: '2' }, { text: '3' }])
  })

  it('does NOT treat a pipe line without a delimiter row as a table', () => {
    const blocks = strip(markdownToBlocks('| just | text |\nnot a table'))
    expect(blocks.every(b => b.type !== 'table')).toBe(true)
  })

  it('does not confuse a thematic break with a delimiter row', () => {
    expect(strip(markdownToBlocks('---'))).toEqual([{ text: '', type: 'hr', editable: false }])
  })
})

describe('blocksToMarkdown — tables', () => {
  const block = (rows: unknown, extra: Record<string, unknown> = {}): Block =>
    ({ id: '1', type: 'table', editable: false, text: '', rows, ...extra }) as Block

  it('serializes a table to a GFM pipe table', () => {
    const md = blocksToMarkdown([block([[{ text: 'Name' }, { text: 'Age' }], [{ text: 'Alice' }, { text: '30' }]])])
    expect(md).toBe(['| Name | Age |', '| --- | --- |', '| Alice | 30 |'].join('\n'))
  })

  it('emits alignment markers from the align array', () => {
    const md = blocksToMarkdown([block([[{ text: 'a' }, { text: 'b' }, { text: 'c' }]], { align: ['left', 'center', 'right'] })])
    expect(md.split('\n')[1]).toBe('| :--- | :---: | ---: |')
  })

  it('escapes pipes and encodes hard newlines as <br>', () => {
    const md = blocksToMarkdown([block([[{ text: 'a' }], [{ text: 'x | y\nz' }]])])
    expect(md.split('\n')[2]).toBe(String.raw`| x \| y<br>z |`)
  })

  it('renders inline styles in cells', () => {
    const md = blocksToMarkdown([block([[{ text: 'bold', styles: [{ start: 0, end: 4, style: 'bold' }] }]])])
    expect(md.split('\n')[0]).toBe('| **bold** |')
  })
})

describe('table round-trip', () => {
  const roundTrip = (md: string) => blocksToMarkdown(markdownToBlocks(md))

  it('round-trips a basic table', () => {
    expect(roundTrip(BASIC)).toBe(BASIC)
  })

  it('round-trips alignment', () => {
    const md = ['| L | C | R |', '| :--- | :---: | ---: |', '| a | b | c |'].join('\n')
    expect(roundTrip(md)).toBe(md)
  })

  it('round-trips multi-line cells via <br>', () => {
    const md = ['| a |', '| --- |', '| one<br>two |'].join('\n')
    expect(roundTrip(md)).toBe(md)
  })

  it('round-trips styled cells and escaped pipes', () => {
    const md = ['| h |', '| --- |', String.raw`| **b** \| *i* |`].join('\n')
    expect(roundTrip(md)).toBe(md)
  })

  it('round-trips two adjacent tables in default (single-newline) mode', () => {
    const md = ['| a |', '| --- |', '| 1 |', '| b |', '| --- |', '| 2 |'].join('\n')
    expect(roundTrip(md)).toBe(md)
  })

  it('serializes a degenerate rows:[] table to a re-parsable 1x1 table', () => {
    const md = blocksToMarkdown([{ id: '1', type: 'table', editable: false, text: '', rows: [] } as Block])
    expect(md).toBe('|  |\n| --- |')
    expect(markdownToBlocks(md)[0].type).toBe('table')
  })

  it('keeps a table block id stable across an unchanged re-parse', () => {
    const first = markdownToBlocks('intro\n\n' + BASIC)
    const tableId = first.find(b => b.type === 'table')!.id
    const second = markdownToBlocks('intro changed\n\n' + BASIC, first)
    expect(second.find(b => b.type === 'table')!.id).toBe(tableId)
  })
})
