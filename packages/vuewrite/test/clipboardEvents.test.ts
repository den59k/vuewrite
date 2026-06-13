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
})
