// @vitest-environment happy-dom
// The HTML paste parser walks a real DOM, so it runs under happy-dom.
import { describe, it, expect } from 'vitest'
import { htmlToBlocks, stylesToHtml, createClipboardEvents } from '../src/components/TextEditor/clipboardEvents'
import { TextEditorStore } from '../src/components/TextEditor/TextEditorStore'

const parse = (html: string, htmlParser?: (el: Element) => string | null | void) => {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  return htmlToBlocks(body, htmlParser)
}

// Simulates a paste event carrying html (or plain text when html is empty).
const paste = (
  store: TextEditorStore,
  data: { html?: string; text?: string },
  props: { preventMultiline?: boolean; htmlParser?: (el: Element) => string | null | void } = {},
) => {
  const { onPaste } = createClipboardEvents(store, props)
  onPaste({
    defaultPrevented: false,
    preventDefault() {},
    clipboardData: {
      getData: (type: string) => (type === 'text/html' ? data.html ?? '' : data.text ?? ''),
    },
  } as any)
}

const dump = (store: TextEditorStore) =>
  store.blocks.map(b => ({ text: b.text, type: b.type, editable: b.editable }))

describe('htmlToBlocks', () => {
  it('splits top-level block elements without a trailing empty block', () => {
    expect(parse('<div>a</div><div>b</div>')).toEqual([{ text: 'a' }, { text: 'b' }])
    expect(parse('<p>one</p><p>two</p>')).toEqual([{ text: 'one' }, { text: 'two' }])
  })

  it('turns <br> into a newline within the same block', () => {
    expect(parse('Hello<br>World')).toEqual([{ text: 'Hello\nWorld' }])
    expect(parse('<div>a<br>b</div>')).toEqual([{ text: 'a\nb' }])
  })

  it('parses <hr> as an atomic hr block', () => {
    expect(parse('<hr>')).toEqual([{ text: '', type: 'hr', editable: false }])
    expect(parse('<p>a</p><hr><p>b</p>')).toEqual([
      { text: 'a' },
      { text: '', type: 'hr', editable: false },
      { text: 'b' },
    ])
  })

  it('expands lists to one block per item with a sensible default type', () => {
    expect(parse('<ul><li>x</li><li>y</li></ul>')).toEqual([
      { text: 'x', type: 'li' },
      { text: 'y', type: 'li' },
    ])
    expect(parse('<ol><li>first</li></ol>')).toEqual([{ text: 'first', type: 'ol' }])
  })

  it('lets htmlParser override the hr block type', () => {
    const htmlParser = (el: Element) => (el.tagName === 'HR' ? 'divider' : undefined)
    expect(parse('<hr>', htmlParser)).toEqual([{ text: '', type: 'divider', editable: false }])
  })

  it('uses htmlParser to map element types', () => {
    const htmlParser = (el: Element) => (el.tagName === 'H1' ? 'h1' : undefined)
    expect(parse('<h1>Title</h1><p>body</p>', htmlParser)).toEqual([
      { text: 'Title', type: 'h1' },
      { text: 'body' },
    ])
  })

  it('folds inline elements together and collapses formatting whitespace', () => {
    expect(parse('<p>a <b>bold</b> c</p>')).toEqual([
      { text: 'a bold c', styles: [{ start: 2, end: 6, style: 'bold' }] },
    ])
    expect(parse('<p>  spaced   out  </p>')).toEqual([{ text: 'spaced out' }])
  })

  it('recurses into nested block containers', () => {
    expect(parse('<div><div>a</div><div>b</div></div>')).toEqual([{ text: 'a' }, { text: 'b' }])
  })
})

describe('htmlToBlocks — inline styles', () => {
  it('parses bold/italic/underline/code tags into styles', () => {
    expect(parse('<p><b>a</b><i>b</i><u>c</u><code>d</code></p>')[0]).toEqual({
      text: 'abcd',
      styles: [
        { start: 0, end: 1, style: 'bold' },
        { start: 1, end: 2, style: 'italic' },
        { start: 2, end: 3, style: 'underline' },
        { start: 3, end: 4, style: 'code' },
      ],
    })
  })

  it('treats <strong>/<em> as bold/italic', () => {
    expect(parse('<strong>x</strong> <em>y</em>')[0].styles).toEqual([
      { start: 0, end: 1, style: 'bold' },
      { start: 2, end: 3, style: 'italic' },
    ])
  })

  it('parses links with href meta', () => {
    expect(parse('<a href="https://x.dev">link</a>')[0]).toEqual({
      text: 'link',
      styles: [{ start: 0, end: 4, style: 'link', meta: { href: 'https://x.dev' } }],
    })
  })

  it('parses inline color from a style attribute', () => {
    expect(parse('<span style="color: #ff0000">red</span>')[0]).toEqual({
      text: 'red',
      styles: [{ start: 0, end: 3, style: 'color', meta: { color: '#ff0000' } }],
    })
  })

  it('records nested styles with correct offsets', () => {
    const block = parse('plain <b>bold <i>both</i></b> end')[0]
    expect(block.text).toBe('plain bold both end')
    expect(block.styles).toEqual([
      { start: 11, end: 15, style: 'italic' }, // "both"
      { start: 6, end: 15, style: 'bold' },    // "bold both"
    ])
  })

  it('keeps style offsets correct after trimming surrounding whitespace', () => {
    expect(parse('<p>  <b>x</b>  </p>')[0]).toEqual({
      text: 'x',
      styles: [{ start: 0, end: 1, style: 'bold' }],
    })
  })
})

describe('htmlToBlocks — tables', () => {
  it('parses a basic <table> into an atomic table block', () => {
    const html = '<table><tr><th>H1</th><th>H2</th></tr><tr><td>a</td><td>b</td></tr></table>'
    expect(parse(html)).toEqual([
      {
        type: 'table',
        editable: false,
        text: '',
        rows: [
          [{ text: 'H1' }, { text: 'H2' }],
          [{ text: 'a' }, { text: 'b' }],
        ],
      },
    ])
  })

  it('parses styled cells', () => {
    const html = '<table><tr><td><b>bold</b></td><td><a href="http://x">link</a></td></tr></table>'
    const rows = (parse(html)[0] as any).rows
    expect(rows[0][0]).toEqual({ text: 'bold', styles: [{ start: 0, end: 4, style: 'bold' }] })
    expect(rows[0][1]).toEqual({ text: 'link', styles: [{ start: 0, end: 4, style: 'link', meta: { href: 'http://x' } }] })
  })

  it('reads Excel/Sheets-style markup with <tbody> and cell attributes', () => {
    const html =
      '<table border="1"><tbody><tr><td style="width:80px">1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>'
    expect((parse(html)[0] as any).rows).toEqual([
      [{ text: '1' }, { text: '2' }],
      [{ text: '3' }, { text: '4' }],
    ])
  })

  it('pads ragged rows to equal width', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>'
    expect((parse(html)[0] as any).rows).toEqual([
      [{ text: 'a' }, { text: 'b' }],
      [{ text: 'c' }, { text: '' }],
    ])
  })

  it('flattens a nested table into its cell text', () => {
    const html = '<table><tr><td>outer <table><tr><td>inner</td></tr></table></td></tr></table>'
    expect((parse(html)[0] as any).rows).toEqual([[{ text: 'outer inner' }]])
  })

  it('produces no block at all for an empty <table>', () => {
    expect(parse('<table></table>')).toEqual([])
    expect(parse('<table><tr></tr></table>')).toEqual([])
    expect(parse('<p>a</p><table></table><p>b</p>')).toEqual([{ text: 'a' }, { text: 'b' }])
  })

  it('reads column alignment from the first row (align attribute)', () => {
    const html = '<table><tr><th align="center">H1</th><th align="right">H2</th></tr></table>'
    expect((parse(html)[0] as any).align).toEqual(['center', 'right'])
  })

  it('omits align when no column declares one', () => {
    expect((parse('<table><tr><td>a</td></tr></table>')[0] as any).align).toBeUndefined()
  })
})

describe('stylesToHtml + round-trip', () => {
  it('serializes styles to inline tags', () => {
    expect(stylesToHtml('abc', [{ start: 0, end: 1, style: 'bold' }])).toBe('<b>a</b>bc')
    expect(stylesToHtml('link', [{ start: 0, end: 4, style: 'link', meta: { href: 'https://x.dev' } }]))
      .toBe('<a href="https://x.dev">link</a>')
    expect(stylesToHtml('red', [{ start: 0, end: 3, style: 'color', meta: { color: 'red' } }]))
      .toBe('<span style="color: red">red</span>')
  })

  it('escapes HTML-significant characters', () => {
    expect(stylesToHtml('a < b & c', [])).toBe('a &lt; b &amp; c')
  })

  it('round-trips non-overlapping text + styles through copy → paste', () => {
    const styles = [
      { start: 0, end: 3, style: 'bold' },
      { start: 4, end: 7, style: 'italic' },
      { start: 8, end: 11, style: 'link', meta: { href: 'https://x.dev' } },
    ]
    const html = stylesToHtml('aaa bbb ccc', styles)
    const block = parse(html)[0]
    expect(block.text).toBe('aaa bbb ccc')
    expect(block.styles).toEqual(styles)
  })

  it('preserves overlapping styles semantically (ranges may split at boundaries)', () => {
    // bold over [0,5] overlapping link [0,4] → bold comes back split as [0,4]+[4,5].
    const html = stylesToHtml('hello', [
      { start: 0, end: 5, style: 'bold' },
      { start: 0, end: 4, style: 'link', meta: { href: 'https://x.dev' } },
    ])
    const block = parse(html)[0]
    expect(block.text).toBe('hello')
    // every character that was bold is still covered by a bold range
    for (let i = 0; i < 5; i++) {
      expect(block.styles!.some(s => s.style === 'bold' && s.start <= i && s.end > i)).toBe(true)
    }
    expect(block.styles!.some(s => s.style === 'link' && s.start === 0 && s.end === 4)).toBe(true)
  })
})

describe('onPaste', () => {
  it('pastes multiple paragraphs without a trailing empty block', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<div>a</div><div>b</div>' })
    expect(store.blocks.map(b => b.text)).toEqual(['a', 'b'])
  })

  it('inserts an hr block and keeps an editable block after it', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<p>a</p><hr><p>b</p>' })
    expect(dump(store)).toEqual([
      { text: 'a', type: undefined, editable: undefined },
      { text: '', type: 'hr', editable: false },
      { text: 'b', type: undefined, editable: undefined },
    ])
  })

  it('appends a trailing editable block when paste ends on an hr', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<p>a</p><hr>' })
    const blocks = dump(store)
    expect(blocks[1]).toEqual({ text: '', type: 'hr', editable: false })
    // a fresh editable block follows the divider so the caret isn't stuck
    expect(blocks[blocks.length - 1].editable).not.toBe(false)
    expect(blocks[blocks.length - 1].text).toBe('')
  })

  it('keeps soft breaks inside a block by default', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<div>a<br>b</div>' })
    expect(store.blocks.map(b => b.text)).toEqual(['a\nb'])
  })

  it('splits soft breaks into separate blocks in preventMultiline mode', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<div>a<br>b</div>' }, { preventMultiline: true })
    expect(store.blocks.map(b => b.text)).toEqual(['a', 'b'])
  })

  it('falls back to plain text when no html is present', () => {
    const store = new TextEditorStore()
    paste(store, { text: 'plain text' })
    expect(store.blocks.map(b => b.text)).toEqual(['plain text'])
  })

  it('applies inline styles from pasted html to the block', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<p>a <b>bold</b> b</p>' })
    expect(store.blocks[0].text).toBe('a bold b')
    expect(store.blocks[0].styles).toEqual([{ start: 2, end: 6, style: 'bold' }])
  })

  it('rebases pasted styles by the caret offset when merging into existing text', () => {
    const store = new TextEditorStore()
    store.insertText('XY') // caret ends at offset 2
    paste(store, { html: '<b>bold</b>' })
    expect(store.blocks[0].text).toBe('XYbold')
    expect(store.blocks[0].styles).toEqual([{ start: 2, end: 6, style: 'bold' }])
  })

  it('pastes a <table> as an atomic table block with rows', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<table><tr><th>H</th></tr><tr><td>x</td></tr></table>' })
    const table = store.blocks.find(b => b.type === 'table')!
    expect(table.editable).toBe(false)
    expect(table.rows).toEqual([[{ text: 'H' }], [{ text: 'x' }]])
  })

  it('preserves the text after the caret when pasting a table mid-paragraph', () => {
    const store = new TextEditorStore()
    store.blocks[0].text = 'hello world'
    store.selection.anchor = { blockId: store.blocks[0].id, offset: 5 }
    store.selection.focus = { blockId: store.blocks[0].id, offset: 5 }
    paste(store, { html: '<table><tr><td>x</td></tr></table>' })
    expect(store.blocks.map(b => ({ text: b.text, type: b.type }))).toEqual([
      { text: 'hello', type: undefined },
      { text: '', type: 'table' },
      { text: ' world', type: undefined },
    ])
    // Caret lands on the surviving tail, not a fresh empty block.
    expect(store.selection.anchor).toEqual({ blockId: store.blocks[2].id, offset: 0 })
  })

  it('round-trips column alignment through paste', () => {
    const store = new TextEditorStore()
    paste(store, { html: '<table><tr><th align="center">H</th></tr></table>' })
    expect(store.blocks.find(b => b.type === 'table')!.align).toEqual(['center'])
  })
})

describe('onCopy — tables', () => {
  const withTableSelection = () => {
    const store = new TextEditorStore()
    store.blocks.splice(0, store.blocks.length,
      { id: 'a', text: 'before' },
      { id: 't', type: 'table', editable: false, text: '', rows: [[{ text: 'H1' }, { text: 'H2' }], [{ text: 'a' }, { text: 'b' }]] },
      { id: 'c', text: 'after' },
    )
    store.selection.anchor = { blockId: 'a', offset: 0 }
    store.selection.focus = { blockId: 'c', offset: 5 }
    return store
  }

  const copy = async (store: TextEditorStore) => {
    let written: any[] = []
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: (items: any[]) => { written = items } }, configurable: true,
    })
    try {
      createClipboardEvents(store, {}).onCopy({ defaultPrevented: false, preventDefault() {} } as any)
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
    }
    const item = written[0]
    return {
      html: await item.getType('text/html').then((b: Blob) => b.text()),
      text: await item.getType('text/plain').then((b: Blob) => b.text()),
    }
  }

  it('serializes a table in a multi-block selection as a real <table> (text/html)', async () => {
    const { html } = await copy(withTableSelection())
    expect(html).toContain('<table><thead><tr><th>H1</th><th>H2</th></tr></thead>')
    expect(html).toContain('<tbody><tr><td>a</td><td>b</td></tr></tbody></table>')
  })

  it('serializes the table as TSV in text/plain', async () => {
    const { text } = await copy(withTableSelection())
    expect(text).toBe(['before', 'H1\tH2\na\tb', 'after'].join('\n'))
  })

  it('emits align attributes for an aligned table', async () => {
    const store = new TextEditorStore()
    store.blocks.splice(0, store.blocks.length,
      { id: 't', type: 'table', editable: false, text: '', rows: [[{ text: 'H' }]], align: ['center'] },
    )
    store.selection.anchor = { blockId: 't', offset: 0 }
    store.selection.focus = { blockId: 't', offset: 0 }
    const { html } = await copy(store)
    expect(html).toContain('<th align="center">H</th>')
  })

  it('copies a non-table block with its own `rows` array prop as plain text (no crash)', async () => {
    const store = new TextEditorStore()
    store.blocks.splice(0, store.blocks.length, { id: 'p', type: 'poll', text: 'vote', rows: [10, 20] })
    store.selection.anchor = { blockId: 'p', offset: 0 }
    store.selection.focus = { blockId: 'p', offset: 4 }
    const { html, text } = await copy(store)
    expect(text).toBe('vote')
    expect(html).not.toContain('<table')
  })
})
