import { Block } from "./TextEditorStore";

export const wrapLists = (blocks: Block[], creator: (block: Block) => string | undefined | void) => {
  if (!blocks.some(i => !!creator(i))) {
    return blocks
  }

  const arr: (Block | Block[])[] = []
  let liArray: Block[] = []
  let currentListTag: string | null = null

  for (let i of blocks) {
    let listTag = creator(i)
    if (listTag) {
      if (currentListTag == null || listTag !== currentListTag) {
        liArray = []
        arr.push(liArray)
        currentListTag = listTag
      }
      liArray.push(i)
    } else {
      arr.push(i)
      currentListTag = null
    }
  }

  return arr
}