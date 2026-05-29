import { markdownToBlocks, blocksToMarkdown } from './index.ts'

const SAMPLE_MD = `# Hello World

This is a paragraph with **bold**, *italic*, and __underline__ text.

- First item
- Second item with **bold**
- Third item

1. Ordered one
2. Ordered two

A [link to example](https://example.com) and \`inline code\`.

***Bold and italic together***

\`\`\`
function hello() {
  console.log("world")
}
\`\`\``

console.log('=== markdownToBlocks ===')
const blocks = markdownToBlocks(SAMPLE_MD)
console.log(JSON.stringify(blocks, null, 2))

console.log('\n=== blocksToMarkdown ===')
const markdown = blocksToMarkdown(blocks)
console.log(markdown)

console.log('\n=== Round-trip check ===')
const blocks2 = markdownToBlocks(markdown)
const markdown2 = blocksToMarkdown(blocks2)
const roundTripOk = markdown === markdown2
console.log('Round-trip stable:', roundTripOk)
if (!roundTripOk) {
  console.log('First pass:\n', markdown)
  console.log('Second pass:\n', markdown2)
}
