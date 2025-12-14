import { TextEditorStore } from "./TextEditorStore"

export const createClipboardEvents = (store: TextEditorStore, props: { 
  preventMultiline?: boolean, 
  htmlParser?: (el: Element) => string | null | void
}) => {

  const getSelected = () => {

    const [ start, end, startIndex, endIndex ] = store.startAndEnd

    if (startIndex === endIndex) {
      const text = store.blocks[startIndex].text.slice(start.offset, end.offset)
      return [
        new ClipboardItem({
          "text/plain": new Blob([ text ], { type: "text/plain" })
        })
      ]
    }

    const startText = store.blocks[startIndex].text.slice(start.offset)
    const endText = store.blocks[endIndex].text.slice(0, end.offset)

    const arr = [
      { type: store.blocks[startIndex].type, text: startText },
      ...store.blocks.slice(startIndex+1, endIndex),
      { type: store.blocks[endIndex].type, text: endText },
    ]
    const html = arr.map(item => `<div>${item.text}</div>`).join("\n")
    const text = arr.map(item => item.text).join("\n")

    return [
      new ClipboardItem({
        "text/html":  new Blob([ html ], { type: "text/html" }),
        "text/plain": new Blob([ text ], { type: "text/plain" })
      })
    ]
  }

  const onCopy = (e: ClipboardEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    navigator.clipboard.write(getSelected())
    store.history.push("setText")
  }

  const onCut = (e: ClipboardEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    navigator.clipboard.write(getSelected())
    store.deleteSelected()
    store.history.push("setText")
  }

  const insertText = (text: string, type?: string) => {
    if (props.preventMultiline) {
      const blocks = text.split("\n")
      store.insertText(blocks[0])
      for (let i = 1; i < blocks.length; i++) {
        store.addNewLine()
        store.insertText(blocks[i])
      }
    } else {
      if (type && store.currentBlock) {
        store.currentBlock.type = type
      }
      store.insertText(text)
    }
  }

  const parseHtml = (node: HTMLElement, type?: string) => {
    let isTextNode = false
    for (let _node of node.childNodes) {
      if ((_node.nodeType === Node.TEXT_NODE && _node.textContent?.trim()) || 
          (_node.nodeType == Node.ELEMENT_NODE && (_node as HTMLElement).tagName === "SPAN" )) {
        isTextNode = true
        break;
      }
    }
    if (isTextNode) {
      const text = node.textContent
      if (!text) return
      insertText(text, type ?? props.htmlParser?.(node) ?? undefined)
      store.addNewLine()
      return
    }
    for (let child of node.children) {
      if (child.tagName === "DIV") {
        parseHtml(child as HTMLDivElement, type)
      } else if (child.tagName === "UL") {
        for (let li of child.children) {
          parseHtml(li as HTMLDivElement, props.htmlParser?.(li) ?? undefined)
        }
      } else {
        insertText(child.textContent ?? "", type ?? props.htmlParser?.(child) ?? undefined)
        store.addNewLine()
      }
    }
  }

  const parser = new DOMParser()
  const onPaste = (e: ClipboardEvent) => {
    if (e.defaultPrevented) return
    e.preventDefault()
    const html = e.clipboardData?.getData("text/html")
    
    if (html) {
      store.deleteSelected()
      const dom = parser.parseFromString(html, "text/html")
      parseHtml(dom.body)
    } else {
      const text = e.clipboardData?.getData("text")
      if (!text) return
      store.deleteSelected()
      insertText(text)
    }

    store.history.push("setText")
  }

  return {
    onCopy,
    onCut,
    onPaste
  }
}