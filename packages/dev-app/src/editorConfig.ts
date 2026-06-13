import type { Block, Style } from 'vuewrite'

export const renderer = (block: Block) => {
  if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3' || block.type === 'li')
    return { tag: block.type }
  if (block.type === 'ol') return { tag: 'li', className: 'ol' }
  if (block.type === 'hr') return { tag: 'hr' }
  if (block.type === 'callout') return { tag: 'div', className: 'callout' }
}

export const decorator = (style: Style) => {
  if (style.style === 'color') return { style: `color: ${style.meta!.color};` }
  if (style.style === 'bold') return { tag: 'b' }
  if (style.style === 'underline') return { tag: 'u' }
  if (style.style === 'italic') return { tag: 'i' }
}

export const htmlParser = (el: Element) => {
  if (el.tagName === 'H1') return 'h1'
  if (el.tagName === 'H2') return 'h2'
  if (el.tagName === 'H3') return 'h3'
  if (el.tagName === 'LI') return 'li'
  if (el.tagName === 'HR') return 'hr'
}

export const listCreator = (block: Block) => {
  if (block.type === 'li') return 'ul'
  if (block.type === 'ol') return 'ol'
}
