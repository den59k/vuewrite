// @vitest-environment happy-dom
// The HTML paste parser walks a real DOM, so it runs under happy-dom.
import { describe, it, expect } from 'vitest'
import { htmlToBlocks, createClipboardEvents } from '../src/components/TextEditor/clipboardEvents'
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

  it('uses htmlParser to map element types', () => {
    const htmlParser = (el: Element) => (el.tagName === 'H1' ? 'h1' : undefined)
    expect(parse('<h1>Title</h1><p>body</p>', htmlParser)).toEqual([
      { text: 'Title', type: 'h1' },
      { text: 'body' },
    ])
  })

  it('folds inline elements together and collapses formatting whitespace', () => {
    expect(parse('<p>a <b>bold</b> c</p>')).toEqual([{ text: 'a bold c' }])
    expect(parse('<p>  spaced   out  </p>')).toEqual([{ text: 'spaced out' }])
  })

  it('recurses into nested block containers', () => {
    expect(parse('<div><div>a</div><div>b</div></div>')).toEqual([{ text: 'a' }, { text: 'b' }])
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
})
