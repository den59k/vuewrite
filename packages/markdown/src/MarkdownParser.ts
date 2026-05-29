import type { Block } from './types.ts'
import { markdownToBlocks } from './markdownToBlocks.ts'

function blockContentKey(block: Block): string {
  const { id: _id, ...rest } = block
  return JSON.stringify(rest)
}

function lcsIndices(oldKeys: string[], newKeys: string[]): Array<[number, number]> {
  const m = oldKeys.length
  const n = newKeys.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldKeys[i - 1] === newKeys[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const pairs: Array<[number, number]> = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (oldKeys[i - 1] === newKeys[j - 1]) {
      pairs.unshift([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return pairs
}

export class MarkdownParser {
  private previousBlocks: Block[] = []

  /** Call this whenever blocks are modified externally (e.g. via the editor) so
   *  the next parse() diffs against the current state instead of stale state. */
  sync(blocks: Block[]): void {
    this.previousBlocks = blocks
  }

  parse(markdown: string): Block[] {
    const newBlocks = markdownToBlocks(markdown)
    const oldKeys = this.previousBlocks.map(blockContentKey)
    const newKeys = newBlocks.map(blockContentKey)

    const pairs = lcsIndices(oldKeys, newKeys)
    const oldIdByNewIndex = new Map(pairs.map(([i, j]) => [j, this.previousBlocks[i].id]))

    const result = newBlocks.map((block, j) => {
      const oldId = oldIdByNewIndex.get(j)
      return oldId !== undefined ? { ...block, id: oldId } : block
    })

    this.previousBlocks = result
    return result
  }
}
