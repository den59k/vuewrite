// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TextEditor from '../src/components/TextEditor/TextEditor.vue'
import type { Decorator } from '../src/components/TextEditor/TextEditorStore'

const decorator: Decorator = (style) => (style.style === 'bold' ? { tag: 'b' } : undefined)

const editor = (props: Record<string, unknown> = {}) =>
  mount(TextEditor, { props: { decorator, ...props } })

const blocks = (wrapper: ReturnType<typeof editor>) =>
  wrapper.element.querySelectorAll('[data-vw-block-id]')

// Place the caret on a rendered block — the editor normally derives the selection
// from real focus/selectionchange events, which don't fire under happy-dom.
const placeCaret = (wrapper: ReturnType<typeof editor>, index: number, anchor: number, focus = anchor) => {
  const id = blocks(wrapper)[index].getAttribute('data-vw-block-id')!
  const vm = wrapper.vm as any
  vm.selection.anchor = { blockId: id, offset: anchor }
  vm.selection.focus = { blockId: id, offset: focus }
}

describe('TextEditor (editable mount)', () => {
  it('renders blocks from modelValue', () => {
    const wrapper = editor({ modelValue: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }] })
    expect(blocks(wrapper)).toHaveLength(2)
    expect(blocks(wrapper)[1].textContent).toBe('two')
  })

  it('re-renders when modelValue changes', async () => {
    const wrapper = editor({ modelValue: [{ id: 'a', text: 'one' }] })
    await wrapper.setProps({ modelValue: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }] })
    await nextTick()
    expect(blocks(wrapper)).toHaveLength(2)
  })

  it('reflects model edits made through the exposed API in the DOM', async () => {
    const wrapper = editor({ modelValue: [{ id: 'a', text: '' }] })
    placeCaret(wrapper, 0, 0)
    ;(wrapper.vm as any).insertText('hi')
    await nextTick()
    expect(blocks(wrapper)[0].textContent).toBe('hi')
  })

  it('renders styles applied through the exposed API via the decorator', async () => {
    const wrapper = editor({ modelValue: [{ id: 'a', text: 'hello' }] })
    placeCaret(wrapper, 0, 0, 2) // select "he"
    ;(wrapper.vm as any).applyStyle('bold')
    await nextTick()
    expect(blocks(wrapper)[0].innerHTML).toContain('<b>he</b>')
  })

  it('emits update:modelValue when the content changes', async () => {
    const wrapper = editor({ modelValue: [{ id: 'a', text: '' }] })
    placeCaret(wrapper, 0, 0)
    ;(wrapper.vm as any).insertText('x')
    await nextTick()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })
})
