import { describe, it, expect, beforeEach } from 'vitest'
import { TextEditorStore } from '../src/components/TextEditor/TextEditorStore'

// ── Helpers ─────────────────────────────────────────────────────────────────

const setCaret = (store: TextEditorStore, blockIndex: number, offset: number) => {
  const id = store.blocks[blockIndex].id
  store.selection.anchor = { blockId: id, offset }
  store.selection.focus = { blockId: id, offset }
}

const setRange = (
  store: TextEditorStore,
  aIdx: number, aOff: number,
  fIdx: number, fOff: number,
) => {
  store.selection.anchor = { blockId: store.blocks[aIdx].id, offset: aOff }
  store.selection.focus = { blockId: store.blocks[fIdx].id, offset: fOff }
}

const input = (store: TextEditorStore, inputType: string, data?: string) =>
  store.onInput({ inputType, data, defaultPrevented: false, preventDefault() {} } as any)

const type = (store: TextEditorStore, text: string) => {
  for (const ch of text) input(store, 'insertText', ch)
}

const texts = (store: TextEditorStore) => store.blocks.map(b => b.text)

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TextEditorStore — initial state', () => {
  it('starts with a single empty block and a collapsed selection', () => {
    const store = new TextEditorStore()
    expect(store.blocks).toHaveLength(1)
    expect(store.blocks[0].text).toBe('')
    expect(store.isCollapsed).toBe(true)
    expect(store.currentBlock).toBe(store.blocks[0])
  })
})

describe('TextEditorStore — text editing', () => {
  let store: TextEditorStore
  beforeEach(() => { store = new TextEditorStore() })

  it('inserts text at the caret and advances the offset', () => {
    setCaret(store, 0, 0)
    store.insertText('hello')
    expect(store.blocks[0].text).toBe('hello')
    expect(store.selection.anchor.offset).toBe(5)
    expect(store.selection.focus.offset).toBe(5)
  })

  it('inserts text in the middle of a block', () => {
    setCaret(store, 0, 0)
    store.insertText('hello')
    setCaret(store, 0, 2)
    store.insertText('XX')
    expect(store.blocks[0].text).toBe('heXXllo')
    expect(store.selection.focus.offset).toBe(4)
  })

  it('strips carriage returns on insert', () => {
    setCaret(store, 0, 0)
    store.insertText('a\r\nb')
    expect(store.blocks[0].text).toBe('a\nb')
  })

  it('deletes backward via onInput', () => {
    setCaret(store, 0, 0)
    type(store, 'hello')
    input(store, 'deleteContentBackward')
    expect(store.blocks[0].text).toBe('hell')
    expect(store.selection.focus.offset).toBe(4)
  })

  it('deletes forward via onInput', () => {
    setCaret(store, 0, 0)
    type(store, 'hello')
    setCaret(store, 0, 0)
    input(store, 'deleteContentForward')
    expect(store.blocks[0].text).toBe('ello')
  })

  it('typed input overwrites a non-collapsed selection', () => {
    setCaret(store, 0, 0)
    type(store, 'hello')
    setRange(store, 0, 1, 0, 4)
    input(store, 'insertText', 'X')
    expect(store.blocks[0].text).toBe('hXo')
  })
})

describe('TextEditorStore — block structure', () => {
  let store: TextEditorStore
  beforeEach(() => { store = new TextEditorStore() })

  it('splits a block on addNewLine', () => {
    setCaret(store, 0, 0)
    store.insertText('hello')
    setCaret(store, 0, 2)
    store.addNewLine()
    expect(texts(store)).toEqual(['he', 'llo'])
    expect(store.selection.anchor.blockId).toBe(store.blocks[1].id)
    expect(store.selection.anchor.offset).toBe(0)
  })

  it('distinguishes a soft break (insertText "\\n") from a new paragraph (addNewLine)', () => {
    // Shift+Enter → soft break: a "\n" stays inside one block.
    setCaret(store, 0, 0)
    store.insertText('ab')
    setCaret(store, 0, 1)
    store.insertText('\n')
    expect(store.blocks).toHaveLength(1)
    expect(store.blocks[0].text).toBe('a\nb')

    // Enter → new paragraph: the block is split in two.
    const other = new TextEditorStore()
    other.selection.anchor = { blockId: other.blocks[0].id, offset: 0 }
    other.selection.focus = { blockId: other.blocks[0].id, offset: 0 }
    other.insertText('ab')
    other.selection.anchor.offset = 1
    other.selection.focus.offset = 1
    other.addNewLine()
    expect(other.blocks.map(b => b.text)).toEqual(['a', 'b'])
  })

  it('inserts an empty block before the caret when at offset 0', () => {
    setCaret(store, 0, 0)
    store.insertText('hello')
    setCaret(store, 0, 0)
    store.addNewLine()
    expect(texts(store)).toEqual(['', 'hello'])
  })

  it('merges blocks with removeNewLine and preserves shifted styles', () => {
    setCaret(store, 0, 0)
    store.insertText('ab')
    store.addNewLineAfter()
    store.blocks[1].text = 'cd'
    store.blocks[1].styles = [{ start: 0, end: 2, style: 'bold' }]

    setCaret(store, 1, 0)
    store.removeNewLine()

    expect(texts(store)).toEqual(['abcd'])
    expect(store.blocks[0].styles).toEqual([{ start: 2, end: 4, style: 'bold' }])
  })

  it('removeCurrentBlock keeps at least one block', () => {
    const store2 = new TextEditorStore()
    setCaret(store2, 0, 0)
    store2.removeCurrentBlock()
    expect(store2.blocks).toHaveLength(1)
  })

  it('deletes a multi-block selection and joins the ends', () => {
    setCaret(store, 0, 0)
    store.insertText('hello')
    const second = store.addNewLineAfter()
    second.text = 'world'

    setRange(store, 0, 2, 1, 3)
    store.deleteSelected()

    expect(texts(store)).toEqual(['held'])
    expect(store.isCollapsed).toBe(true)
    expect(store.selection.anchor.offset).toBe(2)
  })
})

describe('TextEditorStore — styles', () => {
  let store: TextEditorStore
  beforeEach(() => {
    store = new TextEditorStore()
    setCaret(store, 0, 0)
    store.insertText('hello')
  })

  it('applies a style across the selection', () => {
    setRange(store, 0, 0, 0, 5)
    store.applyStyle('bold')
    expect(store.blocks[0].styles).toEqual([{ start: 0, end: 5, style: 'bold', meta: undefined }])
    expect(store.currentStyles.has('bold')).toBe(true)
  })

  it('toggleStyle adds then removes', () => {
    setRange(store, 0, 0, 0, 5)
    store.toggleStyle('bold')
    expect(store.currentStyles.has('bold')).toBe(true)
    store.toggleStyle('bold')
    expect(store.currentStyles.has('bold')).toBe(false)
    expect(store.blocks[0].styles).toBeUndefined()
  })

  it('splits a style when removing a middle range', () => {
    setRange(store, 0, 0, 0, 5)
    store.applyStyle('bold')
    store.removeStyleAt(store.blocks[0], 1, 3, 'bold')
    const styles = store.blocks[0].styles!.slice().sort((a, b) => a.start - b.start)
    expect(styles).toEqual([
      { start: 0, end: 1, style: 'bold', meta: undefined },
      { start: 3, end: 5, style: 'bold', meta: undefined },
    ])
  })

  it('toggling off a style with a collapsed caret strips the whole range', () => {
    setRange(store, 0, 0, 0, 5)
    store.applyStyle('bold') // "hello" is bold
    setCaret(store, 0, 2) // caret in the middle of the bold range
    expect(store.currentStyles.has('bold')).toBe(true)
    store.toggleStyle('bold')
    expect(store.blocks[0].styles).toBeUndefined()
    expect(store.currentStyles.has('bold')).toBe(false)
  })

  it('queues a style on a collapsed caret and paints the next typed text', () => {
    setCaret(store, 0, 5)
    store.toggleStyle('bold') // nothing selected → queued
    expect(store.currentStyles.has('bold')).toBe(true) // toolbar reflects it
    expect(store.blocks[0].styles ?? []).toEqual([]) // but nothing painted yet
    type(store, 'X')
    expect(store.blocks[0].text).toBe('helloX')
    expect(store.blocks[0].styles).toEqual([{ start: 5, end: 6, style: 'bold', meta: undefined }])
  })

  it('keeps painting queued style across several typed characters', () => {
    setCaret(store, 0, 5)
    store.toggleStyle('bold')
    type(store, 'abc')
    expect(store.blocks[0].text).toBe('helloabc')
    expect(store.blocks[0].styles).toEqual([{ start: 5, end: 8, style: 'bold', meta: undefined }])
  })

  it('toggling a queued style off again cancels it', () => {
    setCaret(store, 0, 5)
    store.toggleStyle('bold')
    expect(store.currentStyles.has('bold')).toBe(true)
    store.toggleStyle('bold') // cancel before typing
    expect(store.currentStyles.has('bold')).toBe(false)
    type(store, 'X')
    expect(store.blocks[0].styles ?? []).toEqual([])
  })

  it('drops a queued style when the caret moves away', () => {
    setCaret(store, 0, 5)
    store.toggleStyle('bold')
    setCaret(store, 0, 2) // caret moved
    store.syncPendingStyles()
    expect(store.currentStyles.has('bold')).toBe(false)
    type(store, 'X')
    expect(store.blocks[0].styles ?? []).toEqual([])
  })

  it('shifts styles left when earlier text is deleted', () => {
    setRange(store, 0, 2, 0, 5)
    store.applyStyle('bold') // bold on "llo" → { 2, 5 }
    setCaret(store, 0, 1)
    input(store, 'deleteContentBackward') // remove char at index 0
    expect(store.blocks[0].text).toBe('ello')
    expect(store.blocks[0].styles).toEqual([{ start: 1, end: 4, style: 'bold', meta: undefined }])
  })
})

describe('TextEditorStore — IME composition', () => {
  let store: TextEditorStore
  beforeEach(() => { store = new TextEditorStore() })

  it('does not touch the model or preventDefault during composition input', () => {
    let prevented = false
    const ev = { inputType: 'insertCompositionText', data: 'ね', defaultPrevented: false, preventDefault() { prevented = true } }
    setCaret(store, 0, 0)
    store.onInput(ev as any)
    expect(prevented).toBe(false)
    expect(store.blocks[0].text).toBe('')
  })

  it('ignores regular input while a composition is active', () => {
    setCaret(store, 0, 0)
    store.startComposition()
    let prevented = false
    store.onInput({ inputType: 'insertText', data: 'x', defaultPrevented: false, preventDefault() { prevented = true } } as any)
    expect(prevented).toBe(false)
    expect(store.blocks[0].text).toBe('')
  })

  it('commits composed text at the start position on compositionend', () => {
    setCaret(store, 0, 0)
    store.insertText('ab')
    setCaret(store, 0, 2)
    store.startComposition()
    expect(store.isComposing).toBe(true)
    store.endComposition('ねこ')
    expect(store.isComposing).toBe(false)
    expect(store.blocks[0].text).toBe('abねこ')
    expect(store.selection.focus.offset).toBe(4)
  })

  it('replaces a selection with the composed text', () => {
    setCaret(store, 0, 0)
    store.insertText('abc')
    setRange(store, 0, 0, 0, 3)
    store.startComposition()
    store.endComposition('X')
    expect(store.blocks[0].text).toBe('X')
  })

  it('a cancelled composition leaves the model and history untouched', () => {
    setCaret(store, 0, 0)
    store.insertText('ab')
    store.history.push('setText')
    const actionsBefore = store.history.actions.length
    setCaret(store, 0, 2)
    store.startComposition()
    store.endComposition('') // cancelled — no committed text
    expect(store.blocks[0].text).toBe('ab')
    expect(store.isComposing).toBe(false)
    expect(store.history.actions.length).toBe(actionsBefore)
  })
})

describe('TextEditorStore — selection queries', () => {
  let store: TextEditorStore
  beforeEach(() => {
    store = new TextEditorStore()
    setCaret(store, 0, 0)
    store.insertText('hello')
    const b = store.addNewLineAfter(); b.text = 'world'
  })

  it('selectedText spans multiple blocks', () => {
    setRange(store, 0, 2, 1, 3)
    expect(store.selectedText).toBe('llo\nwor')
  })

  it('selectAll covers the whole document', () => {
    store.selectAll()
    expect(store.selection.anchor.blockId).toBe(store.blocks[0].id)
    expect(store.selection.anchor.offset).toBe(0)
    expect(store.selection.focus.blockId).toBe(store.blocks[1].id)
    expect(store.selection.focus.offset).toBe(5)
  })

  it('getCurrentBlocks yields every block in the range', () => {
    setRange(store, 0, 1, 1, 1)
    expect([...store.getCurrentBlocks()].map(b => b.text)).toEqual(['hello', 'world'])
  })

  it('startAndEnd normalizes a backwards selection', () => {
    setRange(store, 1, 3, 0, 2) // anchor after focus
    const [start, end, startIndex, endIndex] = store.startAndEnd
    expect(startIndex).toBe(0)
    expect(endIndex).toBe(1)
    expect(start.offset).toBe(2)
    expect(end.offset).toBe(3)
  })
})
