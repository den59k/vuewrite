<template>
  <VPopover v-model:open="opened" class="v-select__menu" placement="bottom-stretch">
    <template #activator="{ props }">
      <button v-bind="props" class="v-select" :class="{ opened }">
        {{ currentValue?.title }}
        <ArrowSelectIcon />
      </button>
    </template>
    <button v-for="item in props.items" @click="onItemClick(item)">
      {{ item.title }}
    </button>
  </VPopover>
</template>

<script lang="ts" setup>
import { useVModel } from '@vueuse/core';
import VPopover from './VPopover.vue';
import ArrowSelectIcon from './icons/ArrowSelectIcon.vue'
import { computed, ref } from 'vue';

const props = defineProps<{ items: Item[], modelValue?: string | null }>()
const emit = defineEmits([ "update:modelValue" ])

const opened = ref(false)

const vModel = useVModel(props, "modelValue", emit, { passive: true, defaultValue: props.items[0]?.id })

const currentValue = computed(() => {
  return props.items.find(item => item.id === vModel.value)
})

const onItemClick = (item: Item) => {
  vModel.value = item.id
  opened.value = false
}

</script>

<script lang="ts">

export type Item = {
  id: string,
  title: string
}

</script>

<style lang="sass">
.v-select
  white-space: nowrap
  height: 32px
  border: 1px solid #2D2D2D
  background: none
  color: white
  border-radius: 8px
  padding: 0 12px
  cursor: pointer
  display: flex
  align-items: center
  gap: 8px
  box-sizing: border-box

  svg
    margin-right: -6px
    margin-left: auto

  &.opened
    border-color: #4A4A4A
    svg
      transform: rotate(180deg)

.v-select__menu
  display: flex
  flex-direction: column
  background-color: #131415
  padding: 8px 0
  border-radius: 8px
  white-space: nowrap
  button
    background: none
    color: white
    border: none
    height: 32px
    cursor: pointer
    text-align: left
    padding: 0 16px

    &:hover
      background-color: rgba(255, 255, 255, 0.1)

</style>