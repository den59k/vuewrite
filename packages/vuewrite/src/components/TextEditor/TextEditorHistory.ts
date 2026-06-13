import { Block, Style, TextEditorSelection, TextEditorStore } from "./TextEditorStore";

type HistoryAction = {
  type: string,
  blocks: Block[],
  fullUpdate: boolean,
  selection: TextEditorSelection
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const cloneStyle = (style: Style): Style => {
  const out: Style = { start: style.start, end: style.end, style: style.style }
  if (style.meta !== undefined) out.meta = deepClone(style.meta)
  return out
}

/**
 * Clones a single block. Mirrors the omit-undefined behaviour of a JSON
 * round-trip (so `applyAction` keeps behaving as before) while avoiding the
 * cost of serializing the whole document on every keystroke.
 */
const cloneBlock = (block: Block): Block => {
  const out: Block = { id: block.id, text: block.text }
  if (block.type !== undefined) out.type = block.type
  if (block.editable !== undefined) out.editable = block.editable
  if (block.styles) out.styles = block.styles.map(cloneStyle)
  return out
}

const cloneBlocks = (blocks: Block[]): Block[] => blocks.map(cloneBlock)

const cloneSelection = (selection: TextEditorSelection): TextEditorSelection => ({
  anchor: { blockId: selection.anchor.blockId, offset: selection.anchor.offset },
  focus: { blockId: selection.focus.blockId, offset: selection.focus.offset }
})

export class TextEditorHistory {

  actions: HistoryAction[] = []
  currentCursor = 0

  /** Block ids as of the last full snapshot — used to detect structural changes. */
  private cachedBlockIds: string[] = []
  /** Independent deep copy of the document as of the previous push. */
  private cachedBlocks: Block[] = []

  private store: TextEditorStore
  constructor(store: TextEditorStore) {
    this.store = store
  }

  private cacheBlockIds() {
    this.cachedBlockIds = this.store.blocks.map(item => item.id)
  }
  private blockIdsChanged() {
    const blocks = this.store.blocks
    if (blocks.length !== this.cachedBlockIds.length) return true
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].id !== this.cachedBlockIds[i]) return true
    }
    return false
  }

  /** Keep the cached document copy in sync after an incremental, single-block edit. */
  private syncCachedBlock(block: Block) {
    const idx = this.cachedBlocks.findIndex(item => item.id === block.id)
    if (idx >= 0) this.cachedBlocks[idx] = cloneBlock(block)
  }

  push(type: HistoryAction["type"]) {
    if (this.currentCursor + 1 < this.actions.length) {
      this.actions.length = this.currentCursor + 1
    }
    const lastAction = this.actions.length > 0 ? this.actions[this.actions.length - 1] : null
    const selection = cloneSelection(this.store.selection)

    // Structural edits (added/removed/reordered blocks) need a full snapshot;
    // plain text edits only touch the current block and stay incremental.
    const fullUpdate = type === "setText" || type === "addNewLine" || this.blockIdsChanged()

    if (!fullUpdate && this.store.currentBlock) {
      const currentBlock = cloneBlock(this.store.currentBlock)
      const canCoalesce = lastAction !== null && lastAction.type === type &&
        lastAction.blocks[0]?.id === currentBlock.id &&
        (type === 'insertText' || type === 'deleteContentBackward' || type === 'deleteContentForward')

      if (canCoalesce) {
        lastAction!.blocks = [ currentBlock ]
        lastAction!.selection = selection
      } else {
        this.actions.push({ type, blocks: [ currentBlock ], selection, fullUpdate: false })
      }
      // Only the current block changed, so refresh just that entry in the cache.
      this.syncCachedBlock(currentBlock)
    } else {
      this.actions.push({ type, blocks: cloneBlocks(this.store.blocks), selection, fullUpdate: true })

      // The previous action must carry a full snapshot so undo can restore the
      // document structure that this fullUpdate is about to change.
      if (lastAction && !lastAction.fullUpdate) {
        lastAction.fullUpdate = true
        lastAction.blocks = this.cachedBlocks
      }
      this.cachedBlocks = cloneBlocks(this.store.blocks)
      this.cacheBlockIds()
    }

    this.currentCursor = this.actions.length - 1
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
    if (this.currentCursor >= this.actions.length - 1) return
    this.currentCursor++
    this.applyAction(this.actions[this.currentCursor])
  }

}
