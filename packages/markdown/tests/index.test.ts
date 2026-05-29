import { describe, it, expect } from 'vitest'
import { markdownToBlocks, blocksToMarkdown, MarkdownParser } from '../src/index.ts'
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

describe('MarkdownParser', () => {
  it('preserves block ID when parsing identical markdown twice', () => {
    const parser = new MarkdownParser()
    const [first] = parser.parse('Hello')
    const [second] = parser.parse('Hello')
    expect(second.id).toBe(first.id)
  })

  it('preserves IDs for unchanged blocks when one block changes', () => {
    const parser = new MarkdownParser()
    const blocks1 = parser.parse('Hello\nWorld')
    const blocks2 = parser.parse('Hello\nWorld!')
    expect(blocks2[0].id).toBe(blocks1[0].id)       // "Hello" unchanged → same ID
    expect(blocks2[1].id).not.toBe(blocks1[1].id)   // "World!" changed → new ID
  })

  it('preserves IDs for surrounding blocks when a new block is inserted', () => {
    const parser = new MarkdownParser()
    const blocks1 = parser.parse('Hello\nWorld')
    const blocks2 = parser.parse('New\nHello\nWorld')
    expect(blocks2[1].id).toBe(blocks1[0].id)       // "Hello" shifted down → same ID
    expect(blocks2[2].id).toBe(blocks1[1].id)       // "World" shifted down → same ID
    expect(blocks2[0].id).not.toBe(blocks1[0].id)  // "New" is inserted → new ID
  })

  it('preserves IDs for remaining blocks after a block is deleted', () => {
    const parser = new MarkdownParser()
    const blocks1 = parser.parse('Hello\nDeleteMe\nWorld')
    const blocks2 = parser.parse('Hello\nWorld')
    expect(blocks2[0].id).toBe(blocks1[0].id)  // "Hello" preserved
    expect(blocks2[1].id).toBe(blocks1[2].id)  // "World" preserved
  })

  it('preserves IDs across many block types', () => {
    const parser = new MarkdownParser()
    const blocks1 = parser.parse('# Title\n\nPlain text\n\n- list item')
    const blocks2 = parser.parse('# Title\n\nChanged text\n\n- list item')
    // 5 blocks: heading, empty separator, paragraph, empty separator, list item
    expect(blocks2[0].id).toBe(blocks1[0].id)      // heading unchanged
    expect(blocks2[1].id).toBe(blocks1[1].id)      // empty separator unchanged
    expect(blocks2[2].id).not.toBe(blocks1[2].id)  // paragraph changed
    expect(blocks2[3].id).toBe(blocks1[3].id)      // empty separator unchanged
    expect(blocks2[4].id).toBe(blocks1[4].id)      // list item unchanged
  })
})
