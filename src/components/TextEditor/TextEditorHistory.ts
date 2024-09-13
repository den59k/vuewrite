import { nextTick } from "vue";
import { Block, TextEditorSelection, TextEditorStore } from "./TextEditorStore";

type HistoryAction = {
  type: "insertText" | "setText",
  blocks: Block[],
  selection: TextEditorSelection
}

export class TextEditorHistory {

  actions: HistoryAction[] = []
  currentCursor = 0
  private store: TextEditorStore
  constructor(store: TextEditorStore) {
    this.store = store

    ;(window as any).showHistory = () => console.log(this.actions)
  }
  
  tickStarted = false
  push(type: HistoryAction["type"]) {
    if (this.currentCursor+1 < this.actions.length) {
      this.actions.length = this.currentCursor+1
    }

    const lastAction = this.actions.length > 0 && this.currentCursor === this.actions.length-1? this.actions[this.actions.length-1]: null
    const selection = JSON.parse(JSON.stringify(this.store.selection))

    if (type === "insertText") {
      const currentBlock = JSON.parse(JSON.stringify(this.store.currentBlock!))

      if (lastAction && lastAction.type === type && lastAction.blocks[0]?.id === currentBlock.id) {
        lastAction.blocks = [currentBlock] 
        lastAction.selection = selection
      } else {
        this.actions.push({ type, blocks: [ currentBlock ], selection })
      }
    } else if (type === "setText") {
      const blocks = JSON.parse(JSON.stringify(this.store.blocks))
      if (this.tickStarted && lastAction) {
        lastAction.blocks = blocks
        lastAction.selection = selection
      } else {
        this.actions.push({ type: "setText", blocks, selection })
      }
    }
    
    this.currentCursor = this.actions.length-1

    if (!this.tickStarted && type === "setText") {
      this.tickStarted = true
      nextTick(() => {
        this.tickStarted = false
      })
    }
  }

  private applyAction(action: HistoryAction) {
    if (action.type === "setText") {
      for (let i = 0; i < action.blocks.length; i++) {
        if (i >= this.store.blocks.length) {
          this.store.blocks.push({ ...action.blocks[i] })
        } else {
          Object.assign(this.store.blocks[i], action.blocks[i])
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
        }
      }
    }
    Object.assign(this.store.selection, action.selection)
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