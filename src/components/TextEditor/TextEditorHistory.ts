import { Block, TextEditorSelection, TextEditorStore } from "./TextEditorStore";

type HistoryAction = {
  type: string,
  blocks: Block[],
  fullUpdate: boolean,
  selection: TextEditorSelection
}

export class TextEditorHistory {

  actions: HistoryAction[] = []
  currentCursor = 0
  private blocksIds = ""
  private cachedBlocksJson = ""

  private store: TextEditorStore
  constructor(store: TextEditorStore) {
    this.store = store

    ;(window as any).showHistory = () => console.log(this.actions)
  }

  private cacheBlockIds() {
    this.blocksIds = this.store.blocks.map(item => item.id).join(",")
  }
  private blockIdsChanged() {
    return this.blocksIds !== this.store.blocks.map(item => item.id).join(",")
  }
  
  tickStarted = false
  push(type: HistoryAction["type"]) {
    if (this.currentCursor+1 < this.actions.length) {
      this.actions.length = this.currentCursor+1
    }
    const lastAction = this.actions.length > 0? this.actions[this.actions.length-1]: null
    const selection = JSON.parse(JSON.stringify(this.store.selection))

    const fullUpdate = type === "setText" || type === "addNewLine" || this.blockIdsChanged()
    const blocksJson = JSON.stringify(this.store.blocks)

    if (!fullUpdate && this.store.currentBlock) {
      const currentBlock = JSON.parse(JSON.stringify(this.store.currentBlock))
      if (lastAction && lastAction.type === type && lastAction.blocks[0]?.id === currentBlock.id &&
          (lastAction.type === 'insertText' || lastAction.type === 'deleteContentBackward' || lastAction.type === 'deleteContentForward')) {
        lastAction.blocks = [currentBlock] 
        lastAction.selection = selection
      } else {
        this.actions.push({ type, blocks: [ currentBlock ], selection, fullUpdate })
      }
    } else {
      this.actions.push({ type, blocks: JSON.parse(blocksJson), selection, fullUpdate })
    }

    this.currentCursor = this.actions.length-1
    
    if (fullUpdate) {
      if (lastAction && !lastAction.fullUpdate) {
        lastAction.fullUpdate = true
        lastAction.blocks = JSON.parse(this.cachedBlocksJson)
      }
      this.cacheBlockIds()
    }

    this.cachedBlocksJson = blocksJson
  }

  private applyAction(action: HistoryAction) {
    if (action.fullUpdate) {
      for (let i = 0; i < action.blocks.length; i++) {
        if (i >= this.store.blocks.length) {
          this.store.blocks.push({ ...action.blocks[i] })
        } else {
          Object.assign(this.store.blocks[i], action.blocks[i])
          this.store.blocks[i].type = action.blocks[i].type
        }
      }
      if (this.store.blocks.length > action.blocks.length) {
        this.store.blocks.length = action.blocks.length
      }
    } else {
      for (let _block of action.blocks) {
        const block = this.store.blocks.find(block => block.id === _block.id)
        if (block) {
          block.text = _block.text
          block.styles = _block.styles
          block.type = _block.type
        }
      }
    }
    Object.assign(this.store.selection, action.selection)
    this.cacheBlockIds()
  }

  undo() {
    if (this.currentCursor === 0) return
    this.currentCursor--
    this.applyAction(this.actions[this.currentCursor])
  }

  redo() {
    if (this.currentCursor >= this.actions.length-1) return
    this.currentCursor++
    this.applyAction(this.actions[this.currentCursor])
  }

}