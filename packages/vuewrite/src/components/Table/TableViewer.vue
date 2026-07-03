<template>
  <div class="vw-table vw-table-static">
    <div class="vw-table-scroll">
      <table class="vw-table-grid">
        <thead v-if="rows.length > 0">
          <tr>
            <th v-for="(cell, c) in rows[0]" :key="c" class="vw-table-cell" :style="alignStyle(c)">
              <TextViewer :model-value="cell.text" :styles="cell.styles ?? []" :decorator="decorator" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in rows.slice(1)" :key="r">
            <td v-for="(cell, c) in row" :key="c" class="vw-table-cell" :style="alignStyle(c)">
              <TextViewer :model-value="cell.text" :styles="cell.styles ?? []" :decorator="decorator" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import TextViewer from '../TextEditor/TextViewer.vue'
import type { Block, Decorator } from '../TextEditor/TextEditorStore'
import { useTableBlock } from './tableBlock'

const props = defineProps<{ block: Block; decorator?: Decorator }>()

const { rows, alignStyle } = useTableBlock(props)
</script>
