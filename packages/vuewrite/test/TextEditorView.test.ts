// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TextEditorView from '../src/components/TextEditor/TextEditorView.vue'
import { calcNodeByOffset, calcOffsetToNode } from '../src/utils/richEditorUtils'
import type { Decorator, Renderer } from '../src/components/TextEditor/TextEditorStore'

// A decorator covering the common cases: tag (bold), class, and inline style (color).
const decorator: Decorator = (style) => {
  if (style.style === 'bold') return { tag: 'b' }
  if (style.style === 'italic') return { tag: 'i' }
  if (style.style === 'mark') return { class: 'hl' }
  if (style.style === 'color') return { style: `color: ${style.meta.color}` }
  return undefined
}

const renderer: Renderer = (block) => {
  if (block.type === 'h1') return { tag: 'h1' }
  if (block.type === 'li' || block.type === 'ol') return { tag: 'li' }
  if (block.type === 'hr') return { tag: 'hr' }
  return undefined
}

const view = (props: Record<string, unknown>) => mount(TextEditorView, { props })

// First block element (the one carrying data-vw-block-id) of the rendered output.
const blockEl = (wrapper: ReturnType<typeof view>, index = 0) =>
  wrapper.element.querySelectorAll('[data-vw-block-id]')[index] as HTMLElement

describe('TextEditorView — rendering', () => {
  it('renders one element per block with its id', () => {
    const wrapper = view({ modelValue: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }] })
    const blocks = wrapper.element.querySelectorAll('[data-vw-block-id]')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].getAttribute('data-vw-block-id')).toBe('a')
    expect(blocks[1].textContent).toBe('two')
  })

  it('renders an empty block as <br>', () => {
    const wrapper = view({ modelValue: [{ id: 'a', text: '' }] })
    expect(blockEl(wrapper).innerHTML).toBe('<br>')
  })

  it('splits text at a style boundary and wraps it via the decorator', () => {
    const wrapper = view({
      modelValue: [{ id: 'a', text: 'hello', styles: [{ start: 0, end: 2, style: 'bold' }] }],
      decorator,
    })
    expect(blockEl(wrapper).innerHTML).toBe('<b>he</b>llo')
  })

  it('nests overlapping styles', () => {
    const wrapper = view({
      modelValue: [{
        id: 'a', text: 'abc',
        styles: [{ start: 0, end: 3, style: 'bold' }, { start: 1, end: 2, style: 'italic' }],
      }],
      decorator,
    })
    // "a" bold, "b" bold+italic, "c" bold
    const html = blockEl(wrapper).innerHTML
    expect(html).toContain('<b>a</b>')
    expect(html).toContain('<i>b</i>') // inner italic span, itself inside a bold span
    expect(blockEl(wrapper).textContent).toBe('abc')
  })

  it('applies class and inline-style from the decorator', () => {
    const wrapper = view({
      modelValue: [{
        id: 'a', text: 'xy',
        styles: [{ start: 0, end: 1, style: 'mark' }, { start: 1, end: 2, style: 'color', meta: { color: 'red' } }],
      }],
      decorator,
    })
    const html = blockEl(wrapper).innerHTML
    expect(html).toContain('class="hl"')
    expect(html).toContain('color: red')
  })

  it('uses the renderer for the block-level tag', () => {
    const wrapper = view({ modelValue: [{ id: 'a', text: 'Title', type: 'h1' }], renderer })
    expect(blockEl(wrapper).tagName).toBe('H1')
    expect(blockEl(wrapper).textContent).toBe('Title')
  })

  it('renders an hr (non-editable) block as an empty element', () => {
    const wrapper = view({ modelValue: [{ id: 'a', text: '', type: 'hr', editable: false }], renderer })
    expect(blockEl(wrapper).tagName).toBe('HR')
    expect(blockEl(wrapper).textContent).toBe('')
  })

  it('applies inline styles produced by the parser prop', () => {
    const parser = (text: string) =>
      text.includes('hi') ? [{ start: text.indexOf('hi'), end: text.indexOf('hi') + 2, style: 'bold' }] : []
    const wrapper = view({ modelValue: [{ id: 'a', text: 'say hi now' }], decorator, parser })
    expect(blockEl(wrapper).innerHTML).toContain('<b>hi</b>')
  })
})

describe('TextEditorView — list wrapping', () => {
  const listParser = (block: { type?: string }) =>
    block.type === 'li' ? 'ul' : block.type === 'ol' ? 'ol' : undefined

  it('wraps consecutive list items in a single list element', () => {
    const wrapper = view({
      modelValue: [
        { id: '1', text: 'a', type: 'li' },
        { id: '2', text: 'b', type: 'li' },
        { id: '3', text: 'plain' },
      ],
      renderer,
      listParser,
    })
    const uls = wrapper.element.querySelectorAll('ul')
    expect(uls).toHaveLength(1)
    expect(uls[0].querySelectorAll('[data-vw-block-id]')).toHaveLength(2)
    expect(uls[0].querySelectorAll('li')).toHaveLength(2)
  })

  it('uses an <ol> when the listParser asks for one', () => {
    const wrapper = view({
      modelValue: [{ id: '1', text: 'a', type: 'ol' }],
      renderer,
      listParser,
    })
    expect(wrapper.element.querySelectorAll('ol')).toHaveLength(1)
  })
})

describe('TextEditorView — offset mapping against the real rendered DOM', () => {
  // Bridges richEditorUtils to actual render output: every offset must map to a
  // DOM node + local offset that round-trips back to the same global offset.
  const roundTrips = (el: HTMLElement, text: string) => {
    expect(calcNodeByOffset(el, 0)).toEqual([el, 0])
    for (let offset = 1; offset <= text.length; offset++) {
      const [node, local] = calcNodeByOffset(el, offset)
      expect(calcOffsetToNode(el, node) + local).toBe(offset)
    }
  }

  it('round-trips offsets for a plain block', () => {
    const wrapper = view({ modelValue: [{ id: 'a', text: 'hello' }] })
    roundTrips(blockEl(wrapper), 'hello')
  })

  it('round-trips offsets across style boundaries (multiple text nodes)', () => {
    const wrapper = view({
      modelValue: [{
        id: 'a', text: 'hello world',
        styles: [{ start: 0, end: 2, style: 'bold' }, { start: 6, end: 9, style: 'italic' }],
      }],
      decorator,
    })
    roundTrips(blockEl(wrapper), 'hello world')
  })
})
