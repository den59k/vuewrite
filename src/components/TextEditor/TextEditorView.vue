
<script lang="ts">
import { computed, defineComponent, h } from 'vue';
import TextEditorBlock from './TextEditorBlock.vue';
import type { Block, Decorator, Renderer, Style } from './TextEditorStore';
import type { TextParser } from './TextEditor.vue';

type Props = { 
  modelValue: { text: string, styles?: Style[], type?: string }[] | string,
  decorator?: Decorator, 
  renderer?: Renderer,
  parser?: TextParser,
  styles?: Style[],
}

export default defineComponent({
  props: [ "modelValue", "decorator", "parser", "styles", "renderer" ],
  setup(props: Props, { slots }) {

    const blocks = computed<Block[]>(() => {
      if (Array.isArray(props.modelValue)) {
        return props.modelValue as Block[]
      }
      return [{ text: props.modelValue, styles: props.styles ?? [] }] as Block[]
    })

    return () => h('div', blocks.value.map(block => h(TextEditorBlock, { 
      key: block.id,
      block: block,
      slots,
      decorator: props.decorator,
      renderer: props.renderer,
      parser: props.parser,
      static: true
    })))
  }
})

</script>