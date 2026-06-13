import { describe, it, expect } from 'vitest'
import { wrapLists } from '../src/components/TextEditor/listCreator'
import type { Block } from '../src/components/TextEditor/TextEditorStore'

const block = (id: string, type?: string): Block => ({ id, text: id, type })
const tagOf = (b: Block) => (b.type === 'li' ? 'ul' : b.type === 'ol' ? 'ol' : undefined)

describe('wrapLists', () => {
  it('returns the input unchanged when there are no list items', () => {
    const blocks = [block('a'), block('b')]
    expect(wrapLists(blocks, tagOf)).toBe(blocks)
  })

  it('groups consecutive list items into one array', () => {
    const blocks = [block('1', 'li'), block('2', 'li'), block('3', 'li')]
    const result = wrapLists(blocks, tagOf)
    expect(result).toHaveLength(1)
    expect(Array.isArray(result[0])).toBe(true)
    expect((result[0] as Block[]).map(b => b.id)).toEqual(['1', '2', '3'])
  })

  it('splits groups when the list tag changes', () => {
    const blocks = [block('1', 'li'), block('2', 'ol')]
    const result = wrapLists(blocks, tagOf)
    expect(result).toHaveLength(2)
    expect((result[0] as Block[]).map(b => b.id)).toEqual(['1'])
    expect((result[1] as Block[]).map(b => b.id)).toEqual(['2'])
  })

  it('separates lists divided by a plain block', () => {
    const blocks = [block('1', 'li'), block('p'), block('2', 'li')]
    const result = wrapLists(blocks, tagOf)
    expect(result).toHaveLength(3)
    expect(Array.isArray(result[0])).toBe(true)
    expect(result[1]).toBe(blocks[1]) // plain block passes through untouched
    expect(Array.isArray(result[2])).toBe(true)
  })
})
