// @vitest-environment happy-dom
// These utilities bridge the model to a contenteditable DOM; the happy-dom
// environment above provides document/window/Node/Range so they run headless.
import { describe, it, expect } from 'vitest'
import {
  findParent,
  createNode,
  nodeTypeEq,
  updateNode,
  calcOffsetToNode,
  calcNodeByOffset,
} from '../src/utils/richEditorUtils'

// Builds: <div>"he"<span>"llo"</span></div> — the shape a styled block renders.
const buildBlock = () => {
  const parent = document.createElement('div')
  const t1 = document.createTextNode('he')
  const span = document.createElement('span')
  const t2 = document.createTextNode('llo')
  span.appendChild(t2)
  parent.append(t1, span)
  return { parent, t1, span, t2 }
}

describe('findParent', () => {
  it('walks up to the matching ancestor', () => {
    const { parent, t2 } = buildBlock()
    const found = findParent(t2, el => el.tagName === 'DIV')
    expect(found).toBe(parent)
  })

  it('returns null when no ancestor matches', () => {
    const { t2 } = buildBlock()
    expect(findParent(t2, el => el.tagName === 'ARTICLE')).toBeNull()
  })
})

describe('calcOffsetToNode', () => {
  it('sums the lengths of preceding text up to the target node', () => {
    const { parent, t1, t2 } = buildBlock()
    expect(calcOffsetToNode(parent, t1)).toBe(0)
    expect(calcOffsetToNode(parent, t2)).toBe(2)
  })

  it('skips <br> nodes', () => {
    const parent = document.createElement('div')
    const t1 = document.createTextNode('ab')
    const br = document.createElement('br')
    const t2 = document.createTextNode('cd')
    parent.append(t1, br, t2)
    expect(calcOffsetToNode(parent, t2)).toBe(2)
  })
})

describe('calcNodeByOffset', () => {
  it('returns the parent at offset 0', () => {
    const { parent } = buildBlock()
    expect(calcNodeByOffset(parent, 0)).toEqual([parent, 0])
  })

  it('locates the text node and local offset for a global offset', () => {
    const { t2 } = buildBlock()
    const [node, offset] = calcNodeByOffset(buildBlock().parent, 4)
    expect((node as Text).textContent).toBe('llo')
    expect(offset).toBe(2)
    // sanity: the node is a text node, not the span wrapper
    expect(node.nodeType).toBe(Node.TEXT_NODE)
    expect(t2.textContent).toBe('llo')
  })
})

describe('nodeTypeEq', () => {
  it('treats two text nodes as equal', () => {
    expect(nodeTypeEq(document.createTextNode('a'), document.createTextNode('b'))).toBe(true)
  })

  it('distinguishes text from element nodes', () => {
    expect(nodeTypeEq(document.createTextNode('a'), document.createElement('span'))).toBe(false)
  })

  it('compares tag name and class for elements', () => {
    const a = document.createElement('span'); a.className = 'x'
    const b = document.createElement('span'); b.className = 'x'
    const c = document.createElement('span'); c.className = 'y'
    const d = document.createElement('b'); d.className = 'x'
    expect(nodeTypeEq(a, b)).toBe(true)
    expect(nodeTypeEq(a, c)).toBe(false)
    expect(nodeTypeEq(a, d)).toBe(false)
  })
})

describe('createNode', () => {
  it('creates an element with text and non-empty attributes only', () => {
    const el = createNode('a', { href: 'https://x', 'data-empty': '' }, 'link')
    expect(el.tagName).toBe('A')
    expect(el.textContent).toBe('link')
    expect(el.getAttribute('href')).toBe('https://x')
    expect(el.hasAttribute('data-empty')).toBe(false)
  })
})

describe('updateNode', () => {
  it('appends, patches in place, and trims extra children', () => {
    const el = document.createElement('div')
    updateNode(el, [document.createTextNode('a'), document.createTextNode('b')])
    expect(el.textContent).toBe('ab')
    expect(el.childNodes).toHaveLength(2)

    // Fewer nodes: patch the first, drop the rest.
    updateNode(el, [document.createTextNode('x')])
    expect(el.textContent).toBe('x')
    expect(el.childNodes).toHaveLength(1)
  })
})
