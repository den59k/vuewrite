export const findParent = (el: Node, callback: (el: HTMLElement) => boolean): HTMLElement | null => {
  if (!el) return null
  if (el.nodeType === Node.ELEMENT_NODE) {
    if (callback(el as HTMLElement)) return el as HTMLElement
  }
  if (!el.parentElement) return null
  return findParent(el.parentElement, callback)
}


export const createNode = (tag: string, props: { [ key: string ]: string }, text: string) => {
  const textNode = document.createTextNode(text)
  const element = document.createElement(tag)
  for (let [ key, value ] of Object.entries(props)) {
    if (!value) continue
    element.setAttribute(key, value)
  }
  element.appendChild(textNode)
  return element
}

/** Check nodes by tagname and classname */
export const nodeTypeEq = (a: Node, b: Node) => {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType !== 1) return true
  const _a = a as HTMLElement
  const _b = b as HTMLElement
  if (_a.tagName !== _b.tagName) return false
  if (_a.className !== _b.className) return false
  return true
}

const assign = (target: Node, source: Node) => {
  if (target.nodeType === 3) {
    target.nodeValue = source.nodeValue
  } else {
    const _target = target as HTMLElement
    const _source = source as HTMLElement

    const style = _source.getAttribute("style")
    const className = _source.getAttribute("class")
    if (style) _target.setAttribute("style", style)
    if (className) _target.setAttribute("class", className)

    if (_target.textContent !== _source.textContent) {
      _target.textContent = _source.textContent
    }
  }   
}
  

export const updateNode = (element: Node, nodes: Node[]) => {
  for (let i = 0; i < nodes.length; i++) {
    const childNode = element.childNodes[i]
    if (!childNode || !nodeTypeEq(childNode, nodes[i])) {
      if (childNode) {
        element.insertBefore(nodes[i], childNode)
      } else {
        element.appendChild(nodes[i])
      }
    } else {
      assign(childNode, nodes[i])
    }
  }

  for (let i = element.childNodes.length-1; i >= nodes.length; i--) {
    element.childNodes[i].remove()
  }
}

export const calcOffsetToNode = (parent: Node, target: Node) => {
  let offset = 0
  for (let child of parent.childNodes) {
    if (child.nodeName === "BR") continue
    const ch = child.nodeType === Node.TEXT_NODE? child as Text: child.childNodes[0] as Text
    if (ch === target) return offset
    offset += ch.length
  }
  return offset
}

export const calcNodeByOffset = (parent: Node, offset: number): [ Node, number ] => {
  let currentOffset = offset
  if (offset === 0) return [ parent, 0 ]

  for (let child of parent.childNodes) {
    if (child.nodeName === "BR") continue
    const ch = child.nodeType === Node.TEXT_NODE? child as Text: child.childNodes[0] as Text
    if (currentOffset - ch.length <= 0) {
      return [ ch, currentOffset ]
    } 
    currentOffset -= ch.length
  }
  return [ parent, 0 ]
}