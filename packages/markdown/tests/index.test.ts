import { describe, it, expect } from 'vitest'
import { markdownToBlocks, blocksToMarkdown } from '../src/index.ts'
import type { Block } from '../src/index.ts'

// Strip generated ids so snapshots don't care about them
const strip = (blocks: Block[]) => blocks.map(({ id: _id, ...rest }) => rest)

describe('markdownToBlocks', () => {
  it('parses headings', () => {
    expect(strip(markdownToBlocks('# H1\n## H2\n### H3'))).toEqual([
      { text: 'H1', type: 'h1' },
      { text: 'H2', type: 'h2' },
      { text: 'H3', type: 'h3' },
    ])
  })

  it('parses unordered list items', () => {
    expect(strip(markdownToBlocks('- Foo\n- Bar'))).toEqual([
      { text: 'Foo', type: 'li' },
      { text: 'Bar', type: 'li' },
    ])
  })

  it('parses ordered list items', () => {
    expect(strip(markdownToBlocks('1. First\n2. Second'))).toEqual([
      { text: 'First', type: 'ol' },
      { text: 'Second', type: 'ol' },
    ])
  })

  it('parses a fenced code block', () => {
    const md = '```\nconsole.log("hi")\n```'
    expect(strip(markdownToBlocks(md))).toEqual([
      { text: 'console.log("hi")', type: 'code', editable: false },
    ])
  })

  it('parses bold inline style', () => {
    const [block] = markdownToBlocks('Hello **world**')
    expect(block.text).toBe('Hello world')
    expect(block.styles).toEqual([{ start: 6, end: 11, style: 'bold' }])
  })

  it('parses italic inline style', () => {
    const [block] = markdownToBlocks('*italic*')
    expect(block.text).toBe('italic')
    expect(block.styles).toEqual([{ start: 0, end: 6, style: 'italic' }])
  })

  it('parses underline inline style', () => {
    const [block] = markdownToBlocks('__under__')
    expect(block.text).toBe('under')
    expect(block.styles).toEqual([{ start: 0, end: 5, style: 'underline' }])
  })

  it('parses inline code style', () => {
    const [block] = markdownToBlocks('use `Array.from()` here')
    expect(block.text).toBe('use Array.from() here')
    expect(block.styles).toEqual([{ start: 4, end: 16, style: 'code' }])
  })

  it('parses bold+italic with ***', () => {
    const [block] = markdownToBlocks('***both***')
    expect(block.text).toBe('both')
    expect(block.styles).toEqual([
      { start: 0, end: 4, style: 'bold' },
      { start: 0, end: 4, style: 'italic' },
    ])
  })

  it('parses a link', () => {
    const [block] = markdownToBlocks('[Click here](https://example.com)')
    expect(block.text).toBe('Click here')
    expect(block.styles).toEqual([
      { start: 0, end: 10, style: 'link', meta: { href: 'https://example.com' } },
    ])
  })

  it('produces a single empty block for empty input', () => {
    expect(strip(markdownToBlocks(''))).toEqual([{ text: '' }])
  })

  it('unescapes backslash-escaped markdown characters', () => {
    expect(strip(markdownToBlocks('\\*not italic\\*'))).toEqual([{ text: '*not italic*' }])
  })

  it('parses --- as a thematic break (hr) block', () => {
    expect(strip(markdownToBlocks('---'))).toEqual([{ text: '', type: 'hr', editable: false }])
  })

  it('parses 3 or more dashes as a separator', () => {
    expect(strip(markdownToBlocks('-----'))).toEqual([{ text: '', type: 'hr', editable: false }])
  })

  it('separates paragraphs around a thematic break', () => {
    expect(strip(markdownToBlocks('above\n---\nbelow'))).toEqual([
      { text: 'above' },
      { text: '', type: 'hr', editable: false },
      { text: 'below' },
    ])
  })

  it('does not treat a list dash as a separator', () => {
    expect(strip(markdownToBlocks('- item'))).toEqual([{ text: 'item', type: 'li' }])
  })

  describe('softBreaks option', () => {
    it('merges consecutive plain lines into one block with a newline', () => {
      expect(strip(markdownToBlocks('Hello\nWorld', [], { softBreaks: true }))).toEqual([
        { text: 'Hello\nWorld' },
      ])
    })

    it('merges three consecutive plain lines', () => {
      expect(strip(markdownToBlocks('A\nB\nC', [], { softBreaks: true }))).toEqual([
        { text: 'A\nB\nC' },
      ])
    })

    it('treats blank line as paragraph separator (no empty block)', () => {
      expect(strip(markdownToBlocks('Hello\n\nWorld', [], { softBreaks: true }))).toEqual([
        { text: 'Hello' },
        { text: 'World' },
      ])
    })

    it('does not merge across a blank line', () => {
      expect(strip(markdownToBlocks('A\n\nB\nC', [], { softBreaks: true }))).toEqual([
        { text: 'A' },
        { text: 'B\nC' },
      ])
    })

    it('does not merge plain text into a preceding non-paragraph block', () => {
      expect(strip(markdownToBlocks('# Title\nPlain', [], { softBreaks: true }))).toEqual([
        { text: 'Title', type: 'h1' },
        { text: 'Plain' },
      ])
    })

    it('adjusts inline style offsets when merging', () => {
      const [block] = markdownToBlocks('Hello\n**world**', [], { softBreaks: true })
      expect(block.text).toBe('Hello\nworld')
      expect(block.styles).toEqual([{ start: 6, end: 11, style: 'bold' }])
    })

    it('does not affect default behavior when option is false', () => {
      expect(strip(markdownToBlocks('Hello\n\nWorld', [], { softBreaks: false }))).toEqual([
        { text: 'Hello' },
        { text: '' },
        { text: 'World' },
      ])
    })
  })
})

describe('blocksToMarkdown', () => {
  it('renders headings', () => {
    const blocks: Block[] = [
      { id: '1', text: 'H1', type: 'h1' },
      { id: '2', text: 'H2', type: 'h2' },
      { id: '3', text: 'H3', type: 'h3' },
    ]
    expect(blocksToMarkdown(blocks)).toBe('# H1\n## H2\n### H3')
  })

  it('renders ordered list with incrementing numbers', () => {
    const blocks: Block[] = [
      { id: '1', text: 'One', type: 'ol' },
      { id: '2', text: 'Two', type: 'ol' },
      { id: '3', text: 'Three', type: 'ol' },
    ]
    expect(blocksToMarkdown(blocks)).toBe('1. One\n2. Two\n3. Three')
  })

  it('resets ol counter after a non-ol block', () => {
    const blocks: Block[] = [
      { id: '1', text: 'A', type: 'ol' },
      { id: '2', text: '', },
      { id: '3', text: 'B', type: 'ol' },
    ]
    expect(blocksToMarkdown(blocks)).toBe('1. A\n\n1. B')
  })

  it('renders a code block', () => {
    const blocks: Block[] = [
      { id: '1', text: 'let x = 1', type: 'code', editable: false },
    ]
    expect(blocksToMarkdown(blocks)).toBe('```\nlet x = 1\n```')
  })

  it('renders an hr block as ---', () => {
    expect(blocksToMarkdown([{ id: '1', text: '', type: 'hr', editable: false }])).toBe('---')
  })

  it('resets ol counter after a thematic break', () => {
    const blocks: Block[] = [
      { id: '1', text: 'a', type: 'ol' },
      { id: '2', text: '', type: 'hr', editable: false },
      { id: '3', text: 'b', type: 'ol' },
    ]
    expect(blocksToMarkdown(blocks)).toBe('1. a\n---\n1. b')
  })

  it('renders bold style', () => {
    const blocks: Block[] = [
      { id: '1', text: 'Hello world', styles: [{ start: 6, end: 11, style: 'bold' }] },
    ]
    expect(blocksToMarkdown(blocks)).toBe('Hello **world**')
  })

  it('renders a link', () => {
    const blocks: Block[] = [
      {
        id: '1',
        text: 'Click here',
        styles: [{ start: 0, end: 10, style: 'link', meta: { href: 'https://example.com' } }],
      },
    ]
    expect(blocksToMarkdown(blocks)).toBe('[Click here](https://example.com)')
  })

  it('escapes markdown special characters in plain text', () => {
    const blocks: Block[] = [{ id: '1', text: 'price: *free*' }]
    expect(blocksToMarkdown(blocks)).toBe('price: \\*free\\*')
  })
})

describe('XML tags', () => {
  describe('markdownToBlocks', () => {
    it('parses a self-closing tag with attributes', () => {
      expect(strip(markdownToBlocks('<img src="photo.jpg" alt="A photo"/>'))).toEqual([
        { text: '', type: 'img', editable: false, src: 'photo.jpg', alt: 'A photo' },
      ])
    })

    it('parses an opening-only tag as self-closing', () => {
      expect(strip(markdownToBlocks('<img src="photo.jpg">'))).toEqual([
        { text: '', type: 'img', editable: false, src: 'photo.jpg' },
      ])
    })

    it('parses a paired tag with text content', () => {
      expect(strip(markdownToBlocks('<h1>Hello</h1>'))).toEqual([
        { text: 'Hello', type: 'h1' },
      ])
    })

    it('parses inline styles inside paired tag content', () => {
      const [block] = markdownToBlocks('<callout>Read **this** carefully</callout>')
      expect(block.text).toBe('Read this carefully')
      expect(block.styles).toEqual([{ start: 5, end: 9, style: 'bold' }])
    })

    it('parses paired tag with attributes', () => {
      expect(strip(markdownToBlocks('<note class="warning">Watch out</note>'))).toEqual([
        { text: 'Watch out', type: 'note', class: 'warning' },
      ])
    })

    it('parses a boolean attribute (no value)', () => {
      expect(strip(markdownToBlocks('<video autoplay src="clip.mp4"/>'))).toEqual([
        { text: '', type: 'video', editable: false, autoplay: true, src: 'clip.mp4' },
      ])
    })
  })

  describe('blocksToMarkdown', () => {
    it('serializes a self-closing block with extra props', () => {
      const blocks: Block[] = [
        { id: '1', text: '', type: 'img', editable: false, src: 'photo.jpg', alt: 'A photo' },
      ]
      expect(blocksToMarkdown(blocks)).toBe('<img src="photo.jpg" alt="A photo"/>')
    })

    it('serializes a paired block with extra props and text', () => {
      const blocks: Block[] = [
        { id: '1', text: 'Watch out', type: 'note', class: 'warning' },
      ]
      expect(blocksToMarkdown(blocks)).toBe('<note class="warning">Watch out</note>')
    })
  })

  describe('round-trip', () => {
    it('is stable for self-closing XML tags', () => {
      const md = '<img src="photo.jpg" alt="A photo"/>'
      expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md)
    })

    it('is stable for paired XML tags', () => {
      const md = '<note class="warning">Watch out</note>'
      expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md)
    })
  })
})

describe('round-trip', () => {
  it('is stable for a document with all block types', () => {
    const md = [
      '# Heading',
      '',
      'Plain **bold** and *italic* text.',
      '',
      '- item one',
      '- item two',
      '',
      '---',
      '',
      '1. first',
      '2. second',
      '',
      '[link](https://example.com)',
      '',
      '```',
      'code here',
      '```',
    ].join('\n')

    const once = blocksToMarkdown(markdownToBlocks(md))
    const twice = blocksToMarkdown(markdownToBlocks(once))
    expect(once).toBe(twice)
  })
})

describe('blocksToMarkdown softBreaks (paragraphs vs line breaks)', () => {
  it('separates paragraphs (blocks) with a blank line', () => {
    expect(blocksToMarkdown([{ id: '1', text: 'A' }, { id: '2', text: 'B' }], { softBreaks: true })).toBe('A\n\nB')
  })

  it('keeps a soft line break inside a block as a single newline', () => {
    expect(blocksToMarkdown([{ id: '1', text: 'A\nB' }], { softBreaks: true })).toBe('A\nB')
  })

  it('combines soft breaks within a block and blank lines between blocks', () => {
    expect(blocksToMarkdown([{ id: '1', text: 'A\nB' }, { id: '2', text: 'C' }], { softBreaks: true })).toBe('A\nB\n\nC')
  })

  it('keeps consecutive list items tight', () => {
    expect(blocksToMarkdown([{ id: '1', text: 'a', type: 'li' }, { id: '2', text: 'b', type: 'li' }], { softBreaks: true })).toBe('- a\n- b')
  })

  it('puts a blank line between a heading and a paragraph', () => {
    expect(blocksToMarkdown([{ id: '1', text: 'T', type: 'h1' }, { id: '2', text: 'P' }], { softBreaks: true })).toBe('# T\n\nP')
  })

  it('default mode is unchanged (single-newline join)', () => {
    expect(blocksToMarkdown([{ id: '1', text: 'A' }, { id: '2', text: 'B' }])).toBe('A\nB')
  })
})

describe('round-trip with softBreaks', () => {
  const cases = [
    'A\n\nB',
    'Line1\nLine2\n\nPara2',
    '# Heading\n\nBody text',
    '- a\n- b',
    'para one\n\n- item\n- item2\n\npara two',
  ]

  for (const md of cases) {
    it(`is stable: ${JSON.stringify(md)}`, () => {
      const blocks = markdownToBlocks(md, [], { softBreaks: true })
      expect(blocksToMarkdown(blocks, { softBreaks: true })).toBe(md)
    })
  }
})

describe('ID preservation (previousBlocks)', () => {
  it('preserves block ID for unchanged content', () => {
    const blocks1 = markdownToBlocks('Hello')
    const blocks2 = markdownToBlocks('Hello', blocks1)
    expect(blocks2[0].id).toBe(blocks1[0].id)
  })

  it('preserves IDs for unchanged blocks when one block changes', () => {
    const blocks1 = markdownToBlocks('Hello\nWorld')
    const blocks2 = markdownToBlocks('Hello\nWorld!', blocks1)
    expect(blocks2[0].id).toBe(blocks1[0].id)  // "Hello" unchanged
    expect(blocks2[1].id).toBe(blocks1[1].id)  // "World!" is the last block, same type → ID kept
  })

  it('preserves IDs for surrounding blocks when a new block is inserted', () => {
    const blocks1 = markdownToBlocks('Hello\nWorld')
    const blocks2 = markdownToBlocks('New\nHello\nWorld', blocks1)
    expect(blocks2[0].id).not.toBe(blocks1[0].id)  // "New" inserted
    expect(blocks2[1].id).toBe(blocks1[0].id)       // "Hello" shifted down
    expect(blocks2[2].id).toBe(blocks1[1].id)       // "World" shifted down
  })

  it('preserves IDs for remaining blocks after a block is deleted', () => {
    const blocks1 = markdownToBlocks('Hello\nDeleteMe\nWorld')
    const blocks2 = markdownToBlocks('Hello\nWorld', blocks1)
    expect(blocks2[0].id).toBe(blocks1[0].id)  // "Hello" preserved
    expect(blocks2[1].id).toBe(blocks1[2].id)  // "World" preserved
  })

  it('preserves last block ID when only its text changes', () => {
    const blocks1 = markdownToBlocks('Hello\nWorld')
    const blocks2 = markdownToBlocks('Hello\nWorld!', blocks1)
    expect(blocks2[1].id).toBe(blocks1[1].id)  // last block text changed but ID kept
  })

  it('does not preserve last block ID when its type changes', () => {
    const blocks1 = markdownToBlocks('Hello\nWorld')
    const blocks2 = markdownToBlocks('Hello\n# World', blocks1)
    expect(blocks2[1].id).not.toBe(blocks1[1].id)  // type changed: paragraph → h1
  })

  it('does not preserve old last block ID when a new block is appended', () => {
    const blocks1 = markdownToBlocks('Hello')
    const blocks2 = markdownToBlocks('Hello\nWorld', blocks1)
    expect(blocks2[0].id).toBe(blocks1[0].id)   // "Hello" preserved by LCS
    expect(blocks2[1].id).not.toBe(blocks1[0].id)  // "World" is a genuinely new block
  })

  it('preserves IDs across many block types', () => {
    const blocks1 = markdownToBlocks('# Title\n\nPlain text\n\n- list item')
    const blocks2 = markdownToBlocks('# Title\n\nChanged text\n\n- list item', blocks1)
    // 5 blocks: heading, empty separator, paragraph, empty separator, list item
    expect(blocks2[0].id).toBe(blocks1[0].id)      // heading unchanged
    expect(blocks2[1].id).toBe(blocks1[1].id)      // empty separator unchanged
    expect(blocks2[2].id).not.toBe(blocks1[2].id)  // paragraph changed
    expect(blocks2[3].id).toBe(blocks1[3].id)      // empty separator unchanged
    expect(blocks2[4].id).toBe(blocks1[4].id)      // list item unchanged
  })
})
