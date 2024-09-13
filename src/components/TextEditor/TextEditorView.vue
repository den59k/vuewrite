<template>
  <div>
    <TextEditorBlock 
      v-for="block in blocks" 
      :key="block.id" 
      :block="block" 
      :slots="slots"
      :decorator="props.decorator"
      :parser="props.parser"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, useSlots } from 'vue';
import TextEditorBlock from './TextEditorBlock.vue';
import type { Block, Decorator, Style } from './TextEditorStore';
import type { TextParser } from './TextEditor.vue';

const props = defineProps<{ 
  modelValue: { text: string, styles?: Style[], type?: string }[] | string,
  decorator?: Decorator, 
  parser?: TextParser,
  styles?: Style[],
}>()

const slots = useSlots()

const blocks = computed<Block[]>(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue as Block[]
  }
  return [{ text: props.modelValue, styles: props.styles ?? [] }] as Block[]
})

</script>

<style lang="sass">

</style>