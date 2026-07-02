// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import TableEditor from '../src/components/Table/TableEditor.vue'
import TextEditor from '../src/components/TextEditor/TextEditor.vue'
import { createTableBlock } from '../src/table'
import type { Block, TableCell } from '../src/components/TextEditor/TextEditorStore'

const tableBlock = (rows: TableCell[][], extra: Record<string, unknown> = {}): Block =>
  reactive({ id: 't', type: 'table', editable: false, text: '', rows, ...extra }) as Block

const stubEditor = () => ({
  pushHistory: vi.fn(),
  removeCurrentBlock: vi.fn(),
  selection: { anchor: { blockId: '', offset: 0 }, focus: { blockId: '', offset: 0 } },
})

const mountEditor = (block: Block, editor?: any) =>
  mount(TableEditor, { props: { block, editor } })

const grid = () => [[{ text: 'a' }, { text: 'b' }], [{ text: 'c' }, { text: 'd' }]]

describe('createTableBlock', () => {
  it('builds an r×c grid of empty cells', () => {
    expect(createTableBlock(2, 3)).toEqual({
      type: 'table',
      editable: false,
      text: '',
      rows: [
        [{ text: '' }, { text: '' }, { text: '' }],
        [{ text: '' }, { text: '' }, { text: '' }],
      ],
    })
  })

  it('defaults to a 2×2 grid', () => {
    const block = createTableBlock()
    expect((block.rows as TableCell[][]).length).toBe(2)
    expect((block.rows as TableCell[][])[0].length).toBe(2)
  })
})

describe('TableEditor', () => {
  it('renders one cell editor per cell', () => {
    const wrapper = mountEditor(tableBlock(grid()))
    expect(wrapper.findAllComponents(TextEditor)).toHaveLength(4)
  })

  it('reflects a cell edit back onto the block', async () => {
    const block = tableBlock(grid())
    const wrapper = mountEditor(block)
    wrapper.findAllComponents(TextEditor)[0].vm.$emit('update:model-value', 'hello')
    await nextTick()
    expect((block.rows as TableCell[][])[0][0].text).toBe('hello')
  })

  it('adds a row and column, pushing to the editor history', async () => {
    const block = tableBlock(grid())
    const editor = stubEditor()
    const wrapper = mountEditor(block, editor)

    ;(wrapper.vm as any).addRow()
    expect((block.rows as TableCell[][]).length).toBe(3)
    expect((block.rows as TableCell[][])[2]).toEqual([{ text: '' }, { text: '' }])

    ;(wrapper.vm as any).addColumn()
    expect((block.rows as TableCell[][])[0].length).toBe(3)
    expect(editor.pushHistory).toHaveBeenCalledTimes(2)
  })

  it('removes a row and a column', () => {
    const block = tableBlock(grid())
    const editor = stubEditor()
    const wrapper = mountEditor(block, editor)

    ;(wrapper.vm as any).removeRow(1)
    expect((block.rows as TableCell[][]).length).toBe(1)

    ;(wrapper.vm as any).removeColumn(0)
    expect((block.rows as TableCell[][])[0]).toEqual([{ text: 'b' }])
  })

  it('keeps the align array in sync when a column is removed', () => {
    const block = tableBlock(grid(), { align: ['left', 'right'] })
    const wrapper = mountEditor(block, stubEditor())
    ;(wrapper.vm as any).removeColumn(0)
    expect(block.align).toEqual(['right'])
  })

  it('never removes the last remaining row or column', () => {
    const block = tableBlock([[{ text: 'only' }]])
    const wrapper = mountEditor(block, stubEditor())
    ;(wrapper.vm as any).removeRow(0)
    ;(wrapper.vm as any).removeColumn(0)
    expect(block.rows).toEqual([[{ text: 'only' }]])
  })

  it('Tab on the last cell appends a row', async () => {
    const block = tableBlock(grid())
    const wrapper = mountEditor(block, stubEditor())
    const cells = wrapper.findAllComponents(TextEditor)
    cells[3].vm.$emit('keydown', new KeyboardEvent('keydown', { code: 'Tab' }))
    await nextTick()
    expect((block.rows as TableCell[][]).length).toBe(3)
  })

  it('Backspace in an empty first cell deletes the table', () => {
    const block = tableBlock([[{ text: '' }, { text: '' }]])
    const editor = stubEditor()
    const wrapper = mountEditor(block, editor)
    wrapper.findAllComponents(TextEditor)[0].vm.$emit('keydown', new KeyboardEvent('keydown', { code: 'Backspace' }))
    expect(editor.removeCurrentBlock).toHaveBeenCalled()
  })

  it('does NOT delete the table on Backspace when a cell has content', () => {
    const block = tableBlock([[{ text: 'x' }, { text: '' }]])
    const editor = stubEditor()
    const wrapper = mountEditor(block, editor)
    wrapper.findAllComponents(TextEditor)[0].vm.$emit('keydown', new KeyboardEvent('keydown', { code: 'Backspace' }))
    expect(editor.removeCurrentBlock).not.toHaveBeenCalled()
  })
})
