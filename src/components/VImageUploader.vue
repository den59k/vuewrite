<template>
  <div class="v-image-uploader">
    <img v-if="props.modelValue" :src="props.modelValue.src" alt="Uploaded Image"/>
    <button v-else @click="inputRef?.click()">Upload image</button>
    <input ref="inputRef" type="file" accept="image/*" @change="onInputChange"/>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

const props = defineProps<{ modelValue?: { src: string, file?: File } | null }>()
const emit = defineEmits([ "update:modelValue" ])

const inputRef = ref<HTMLInputElement>()

const onInputChange = (e: Event) => {
  const target = e.currentTarget as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const src = URL.createObjectURL(target.files[0])
  emit("update:modelValue", { src, file: target.files[0] })
  target.value = ""
}

</script>

<style lang="sass">

.v-image-uploader
  height: 200px
  border: 1px solid #333333
  border-radius: 8px
  display: flex
  align-items: center
  justify-content: center
  width: 500px

  input
    display: none

  button
    width: 250px
    background-color: #222222
    border: none
    height: 40px
    color: white
    border-radius: 8px
    cursor: pointer

  img
    max-width: 200px
    max-height: 250px
</style>