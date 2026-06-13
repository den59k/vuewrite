import { describe, it, expect, beforeEach } from 'vitest'
import { TextEditorStore } from '../src/components/TextEditor/TextEditorStore'

// The history is pure JS (no browser APIs), so it can be exercised directly by
// driving real store operations and asserting undo/redo behaviour.

const setCaret = (store: TextEditorStore, blockIndex: number, offset: number) => {
  const id = store.blocks[blockIndex].id
  store.selection.anchor = { blockId: id, offset }
  store.selection.focus = { blockId: id, offset }
}

const input = (store: TextEditorStore, inputType: string, data?: string) =>
  store.onInput({ inputType, data, defaultPrevented: false, preventDefault() {} } as any)

const type = (store: TextEditorStore, text: string) => {
  for (const ch of text) input(store, 'insertText', ch)
}

const texts = (store: TextEditorStore) => store.blocks.map(b => b.text)

describe('TextEditorHistory', () => {
  let store: TextEditorStore
  beforeEach(() => {
    store = new TextEditorStore()
    setCaret(store, 0, 0)
    store.history.push('setText') // baseline snapshot, mirrors onMounted
  })

  it('coalesces a typing run into a single undo step', () => {
    type(store, 'abc')
    expect(store.blocks[0].text).toBe('abc')
    // setText baseline + one coalesced insertText action
    expect(store.history.actions).toHaveLength(2)

    store.history.undo()
    expect(store.blocks[0].text).toBe('')

    store.history.redo()
    expect(store.blocks[0].text).toBe('abc')
  })

  it('does nothing when undoing past the start or redoing past the end', () => {
    type(store, 'x')
    store.history.undo()
    store.history.undo() // already at start
    expect(store.blocks[0].text).toBe('')
    store.history.redo()
    store.history.redo() // already at end
    expect(store.blocks[0].text).toBe('x')
  })

  it('restores document structure across a structural change', () => {
    type(store, 'hello')
    setCaret(store, 0, 5)
    store.addNewLine() // structural: now two blocks

    expect(texts(store)).toEqual(['hello', ''])

    store.history.undo() // undo the new line → back to one block "hello"
    expect(texts(store)).toEqual(['hello'])

    store.history.undo() // undo the typing → empty
    expect(texts(store)).toEqual([''])

    store.history.redo()
    expect(texts(store)).toEqual(['hello'])

    store.history.redo()
    expect(texts(store)).toEqual(['hello', ''])
  })

  it('keeps the full document in sync across edits to multiple blocks', () => {
    // This guards the incremental cache: edits land on different blocks before
    // a structural change forces the previous incremental action to a snapshot.
    type(store, 'aa')          // edit block 0
    setCaret(store, 0, 2)
    store.addNewLine()         // structural → block 1 created

    setCaret(store, 1, 0)
    type(store, 'bb')          // edit block 1 (separate incremental action)
    setCaret(store, 1, 2)
    store.addNewLine()         // structural → upgrades the "bb" action to a snapshot

    expect(texts(store)).toEqual(['aa', 'bb', ''])

    store.history.undo()       // must restore BOTH "aa" and "bb"
    expect(texts(store)).toEqual(['aa', 'bb'])

    store.history.undo()
    expect(texts(store)).toEqual(['aa', ''])

    store.history.undo()
    expect(texts(store)).toEqual(['aa'])

    store.history.undo()
    expect(texts(store)).toEqual([''])
  })

  it('truncates the redo stack when a new edit follows an undo', () => {
    type(store, 'abc')
    store.history.undo()       // back to empty, redo of "abc" available
    setCaret(store, 0, 0)
    type(store, 'z')           // new branch — "abc" redo is discarded

    expect(store.blocks[0].text).toBe('z')
    store.history.redo()       // nothing to redo
    expect(store.blocks[0].text).toBe('z')

    store.history.undo()
    expect(store.blocks[0].text).toBe('')
  })

  it('undoes and redoes a style change', () => {
    type(store, 'hello')
    store.selection.anchor = { blockId: store.blocks[0].id, offset: 0 }
    store.selection.focus = { blockId: store.blocks[0].id, offset: 5 }
    store.applyStyle('bold')
    expect(store.blocks[0].styles).toEqual([{ start: 0, end: 5, style: 'bold', meta: undefined }])

    store.history.undo()
    // The block was created with styles: [], which is what the snapshot restores.
    expect(store.blocks[0].styles).toEqual([])
    expect(store.blocks[0].text).toBe('hello')

    store.history.redo()
    expect(store.blocks[0].styles).toEqual([{ start: 0, end: 5, style: 'bold', meta: undefined }])
  })

  it('does not let undo mutate a sibling history snapshot (no aliasing)', () => {
    type(store, 'hello')
    setCaret(store, 0, 5)
    store.addNewLine()
    type(store, 'world')

    store.history.undo() // remove "world"
    store.history.undo() // remove the new line
    expect(texts(store)).toEqual(['hello'])

    // Re-edit, then redo forward; snapshots must remain independent.
    store.history.redo()
    store.history.redo()
    expect(texts(store)).toEqual(['hello', 'world'])
  })
})
