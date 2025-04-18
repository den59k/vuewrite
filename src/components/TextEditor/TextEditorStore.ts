import { HTMLAttributes, computed, reactive, ref } from "vue"
import { clamp, isEqual } from "vuesix"
import { TextEditorHistory } from "./TextEditorHistory"

export type Style = { start: number, end: number, style: string, meta?: any }
export type Block = { id: string, text: string, type?: string, styles?: Style[], editable?: boolean }
export type Decorator = (style: Style) => HTMLAttributes & { tag?: string } | undefined
export type Renderer = (block: Block) => HTMLAttributes & { tag?: string } | undefined
export type TextEditorSelection = { anchor: { blockId: string, offset: number }, focus: { blockId: string, offset: number } }

export class TextEditorStore {

  history = new TextEditorHistory(this)
  blocks = reactive<Block[]>([{ id: uid(), text: "", styles: [] }])
  
  selection = reactive<TextEditorSelection>({ 
    anchor: { blockId: this.blocks[0].id, offset: 0 }, 
    focus: { blockId: this.blocks[0].id, offset: 0 } 
  })
  
  _isCollapsed = computed(() => {
    return this.selection.anchor.blockId === this.selection.focus.blockId && 
    this.selection.anchor.offset === this.selection.focus.offset
  })
  get isCollapsed() {
    return this._isCollapsed.value
  }
  isFocused = ref(false)

  _currentBlock = computed(() => {
    if (this.selection.anchor.blockId !== this.selection.focus.blockId) return null
    return this.blocks.find(item => item.id === this.selection.anchor.blockId) ?? null
  })
  get currentBlock() { 
    return this._currentBlock.value
  }

  _selectedText = computed(() => {
    if (this.isCollapsed) return ""
    const [ start, end, startIndex, endIndex ] = this.startAndEnd
    if (startIndex === endIndex) {
      return this.blocks[startIndex].text.slice(start.offset, end.offset)
    }
    const startText = this.blocks[startIndex].text.slice(start.offset)
    const endText = this.blocks[endIndex].text.slice(0, end.offset)
    const arr = [ startText, ...this.blocks.slice(startIndex+1, endIndex).map(block => block.text), endText ]
    return arr.join("\n")
  })
  
  get selectedText() {
    return this._selectedText.value
  }
  
  moveOffset(newOffset: number) {
    const delta = newOffset - this.selection.anchor.offset
    if (delta === 0) return
    this.moveStyles(this.currentBlock!, this.selection.focus.offset, -delta)

    this.selection.anchor.offset = newOffset
    this.selection.focus.offset = newOffset
  }
  
  private addStyleToBlock (block: Block, style: Style) {
    if (!block.styles) {
      block.styles = [ style]
    } else {
      block.styles.push(style)
    }
    block.styles.sort((a, b) => a.start - b.start)
  }

  concatBlocks(start: Block, end: Block) {
    if (end.styles) {
      for (let style of end.styles) {
        style.start += start.text.length
        style.end += start.text.length
        this.addStyleToBlock(start, style)
      }
    }
    start.text = start.text + end.text
  }

  removeCurrentBlock() {
    const blockIndex = this.blocks.findIndex(item => item.id === this.selection.anchor.blockId)
    if (blockIndex < 0) return
    this.blocks.splice(blockIndex, 1)

    if (this.blocks.length === 0) {
      this.blocks.push({ id: uid(), text: "" })
    }
    const newBlockIndex = Math.max(blockIndex-1, 0)
    this.selection.anchor.blockId = this.blocks[newBlockIndex].id
    this.selection.focus.blockId = this.blocks[newBlockIndex].id
    this.selection.anchor.offset = blockIndex === 0? 0: this.blocks[newBlockIndex].text.length
    this.selection.focus.offset = blockIndex === 0? 0: this.blocks[newBlockIndex].text.length
    this.history.push("removeBlock")
  }

  removeNewLine() {
    const blockIndex = this.blocks.findIndex(item => item.id === this.selection.anchor.blockId)
    if (blockIndex < 1) return

    if (this.blocks[blockIndex-1].editable === false) {
      if (this.blocks[blockIndex].text === "") {
        this.blocks.splice(blockIndex, 1)
      }
      this.selection.anchor.blockId = this.blocks[blockIndex-1].id
      this.selection.focus.blockId = this.blocks[blockIndex-1].id
      this.selection.anchor.offset = 0
      this.selection.focus.offset = 0
      // this.blocks.splice(blockIndex-1, 1)
    } else {
      this.selection.anchor.blockId = this.blocks[blockIndex-1].id
      this.selection.focus.blockId = this.blocks[blockIndex-1].id
      this.selection.anchor.offset = this.blocks[blockIndex-1].text.length
      this.selection.focus.offset = this.blocks[blockIndex-1].text.length
      this.concatBlocks(this.blocks[blockIndex-1], this.blocks[blockIndex])
      this.blocks.splice(blockIndex, 1)
    }
  }

  onInput (_e: Event) {
    const ev = _e as InputEvent
    if (ev.defaultPrevented) return
    ev.preventDefault()

    const collapsed = this.isCollapsed
    if (!collapsed) this.deleteSelected()
  
    const block = this.currentBlock
    if (!block) return
  
    if ((ev.inputType === 'deleteContentBackward' || ev.inputType === "deleteContentForward") && collapsed) {
      if (ev.inputType === 'deleteContentBackward') {
        if (this.selection.anchor.offset === 0) {
          if (block.type) {
            delete block.type
          } else {
            this.removeNewLine()
          }
        } else {
          const offset = Math.max(0, this.selection.focus.offset - 1)
          block.text = block.text.slice(0, offset) + block.text.slice(this.selection.focus.offset)
          this.moveOffset(offset)
        }
        this.history.push("deleteContentBackward")
      }
  
      if (ev.inputType === 'deleteContentForward') {
        const blockIndex = this.blocks.findIndex(item => item.id === this.selection.anchor.blockId)
        if (this.selection.anchor.offset === this.blocks[blockIndex].text.length) {
          const nextBlock = this.blocks[blockIndex+1]
          if (nextBlock) {
            this.blocks.splice(blockIndex+1, 1)
            this.concatBlocks(this.blocks[blockIndex], nextBlock)
          }
        } else {
          block.text = block.text.slice(0, this.selection.focus.offset) + block.text.slice(this.selection.focus.offset+1)
          this.moveStyles(block, this.selection.focus.offset+1, 1)
        }
        this.history.push("deleteContentForward")
      }
    }
    
    if (ev.inputType === 'insertText') {
      this.insertText(ev.data!)
      this.history.push("insertText")
    }
  }

  addNewLineBefore() {
    const index = this.blocks.findIndex(item => item.id === this.selection.anchor.blockId)
    const block = { id: uid(), text: "" }
    this.blocks.splice(index, 0, block)
    
    this.history.push("addNewLine")
  }

  addNewLine() {
    if (this.isCollapsed && this.selection.anchor.offset === 0 && this.currentBlock?.editable !== false) {
      this.addNewLineBefore()
      return
    }

    this.deleteSelected()

    if (!this.currentBlock) return

    const endText = this.currentBlock.editable === false? "": this.currentBlock.text.slice(this.selection.anchor.offset)
    this.currentBlock.text = this.currentBlock.text.slice(0, this.selection.anchor.offset)

    const block = { id: uid(), text: endText || "" }
    const index = this.blocks.findIndex(item => item.id === this.selection.anchor.blockId)
    this.blocks.splice(index+1, 0, block)
    this.selection.anchor = { blockId: block.id, offset: 0 }
    this.selection.focus = { blockId: block.id, offset: 0 }

    this.history.push("addNewLine")
  }

  addNewLineAfter() {
    const index = this.blocks.findIndex(item => item.id === this.selection.anchor.blockId)
    const block = { id: uid(), text: "" }
    this.blocks.splice(index+1, 0, block)
    return block
  }

  insertText(data: string) {
    const block = this.currentBlock
    if (!block) return
    const text = data.replace(/\r/g, "")
    block.text = block.text.slice(0, this.selection.focus.offset) + text + block.text.slice(this.selection.focus.offset)
    this.moveOffset(clamp(this.selection.focus.offset + text.length, 0, block.text.length))
  }

  insertBlock(blockData: Partial<Block>) {
    if (!this.currentBlock) return
    this.deleteSelected()
    if (this.currentBlock.text !== "") {
      this.addNewLine()
    }
    if (this.currentBlock.text !== "") {
      const selection = JSON.parse(JSON.stringify(this.selection))
      this.addNewLine()
      Object.assign(this.selection, selection)
    }
    Object.assign(this.currentBlock!, blockData)

    if (blockData.editable === false && this.currentBlock === this.blocks[this.blocks.length-1]) {
      const newLine = this.addNewLineAfter()
      this.selection.focus.blockId = newLine.id
      this.selection.focus.offset = 0
      this.selection.anchor.blockId = newLine.id
      this.selection.anchor.offset = 0
    }

    this.history.push("setText")
  }
  
  get startAndEnd(): [ { blockId: string, offset: number }, { blockId: string, offset: number }, number, number ] {
    const a = this.blocks.findIndex(block => block.id === this.selection.anchor.blockId)
    const f = this.blocks.findIndex(block => block.id === this.selection.focus.blockId)
    if (a < f || (a === f && this.selection.anchor.offset < this.selection.focus.offset)) {
      return [ this.selection.anchor, this.selection.focus, a, f ]
    } else {
      return [ this.selection.focus, this.selection.anchor, f, a ]
    }
  }

  private moveStyles(block: Block, offset: number, delta: number) {
    if (!block.styles) return
    for (let i = 0; i < block.styles.length; i++) {
      const style = block.styles[i]
      if (style.start >= offset) style.start -= delta
      if (style.end >= offset) style.end -= delta
      if (style.end <= style.start) {
        block.styles.splice(i, 1)
        i--
      }
    }
  }

  deleteSelected() {
    if (this.isCollapsed) return

    const [ start, end, startIndex, endIndex ] = this.startAndEnd
    const startText = this.blocks[startIndex].text.slice(0, start.offset)
    const endText = this.blocks[endIndex].text.slice(end.offset)
    this.removeAllStyles()

    const delta = end.offset - (startIndex === endIndex? start.offset: 0)
    this.moveStyles(this.blocks[endIndex], end.offset, delta)

    if (this.selection.anchor.blockId !== this.selection.focus.blockId) {
      this.blocks.splice(startIndex+1, endIndex-startIndex)
    }
  
    if (start !== this.selection.anchor) {
      this.selection.anchor = { ...start }
    }
    if (start !== this.selection.focus) {
      this.selection.focus = { ...start }
    }
    this.blocks[startIndex].text = startText+endText
  }

  _currentStyles = computed(() => {
    const [ start, end, startIndex, endIndex ] = this.startAndEnd
    const styles = new Map<string, Style>()
    if (startIndex < 0) return styles
    for (let i = startIndex; i <= endIndex; i++) {
      const blockStyles = this.blocks[i].styles
      if (!blockStyles) continue
      for (let style of blockStyles) {
        if (i === startIndex && start.offset < style.start) continue
        if (i === endIndex && end.offset > style.end) continue
        styles.set(style.style, style)
      }
    }
    return styles
  })
  get currentStyles() {
    return this._currentStyles.value
  }

  applyStyle(_style: string, meta?: any) {
    if (this.isCollapsed) return
    const [ start, end, startIndex, endIndex ] = this.startAndEnd
    for (let i = startIndex; i <= endIndex; i++) {
      const block = this.blocks[i]

      const _start = i === startIndex? start.offset: 0
      const _end = i === endIndex? end.offset: block.text.length

      let createNewStyle = true
      if (block.styles) {
        for (let style of block.styles) {
          if (style.style !== _style) continue
          if (style.start > _end || style.end < _start) continue
  
          if (meta && !isEqual(meta, style.meta) && (style.start !== _start || style.end !== _end)) {
            if (_start === style.end || _end === style.start) continue
            this.removeStyleAt(block, _start, _end, _style)
          } else {
            style.start = Math.min(style.start, _start)
            style.end = Math.max(style.end, _end)
            createNewStyle = false
            style.meta = meta
          }
        }
      }
      if (createNewStyle) {
        const newStyle: Style = { 
          start: i === startIndex? start.offset: 0, 
          end: i === endIndex? end.offset: block.text.length, 
          style: _style,
          meta
        }
        this.addStyleToBlock(block, newStyle)
      }
    }
    this.history.push("applyStyle")
  }

  removeStyleAt(block: Block, _start: number, _end: number, _style?: string) {
    const removeAll = typeof _style !== "string"
    if (!block.styles) return
    for (let i = 0; i < block.styles.length; i++) {
      const style = block.styles[i]
      if (!removeAll && style.style !== _style) continue
      if (style.start > _end || style.end < _start) continue

      if (style.start >= _start && style.end <= _end) {
        block.styles.splice(i, 1)
        i--
      } else if (style.start < _start && style.end > _end) {
        block.styles.push({ ...style, start: _end })
        style.end = _start
      } else if (style.start < _start) {
        style.end = _start
      } else if (style.end > _end) {
        style.start = _end
      }
    }
    if (block.styles.length === 0) {
      delete block.styles
    }
  }

  removeStyle(_style: string) {
    const [ start, end, startIndex, endIndex ] = this.startAndEnd
    for (let i = startIndex; i <= endIndex; i++) {
      const block = this.blocks[i]
      const _start = i === startIndex? start.offset: 0
      const _end = i === endIndex? end.offset: block.text.length
      this.removeStyleAt(block, _start, _end, _style)
    }
    this.history.push("applyStyle")
  }
  
  removeAllStyles() {
    const [ start, end, startIndex, endIndex ] = this.startAndEnd
    for (let i = startIndex; i <= endIndex; i++) {
      const block = this.blocks[i]
      if (i > startIndex && i < endIndex) {
        delete block.styles
        return
      }
      const _start = i === startIndex? start.offset: 0
      const _end = i === endIndex? end.offset: block.text.length
      this.removeStyleAt(block, _start, _end)
    }
  }

  toggleStyle(style: string) {
    if (this.currentStyles.has(style)) {
      this.removeStyle(style)
    } else {
      this.applyStyle(style)
    }
  }

  selectAll() {
    this.selection.anchor = { blockId: this.blocks[0].id, offset: 0 }
    const lastBlock = this.blocks[this.blocks.length-1]
    this.selection.focus = { blockId: lastBlock.id, offset: lastBlock.text.length }
  }
}

let uidCounter = 0
export const uid = () => (uidCounter++).toString()