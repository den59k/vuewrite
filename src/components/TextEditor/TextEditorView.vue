<script lang="ts">
import { computed, defineComponent, h } from 'vue';
import TextEditorBlock from './TextEditorBlock.vue';
import type { Block, Decorator, Renderer, Style } from './TextEditorStore';
import type { TextParser } from './TextEditor.vue';
import { wrapLists } from './listCreator';

type Props = { 
  modelValue: Block[] | string,
  decorator?: Decorator, 
  renderer?: Renderer,
  parser?: TextParser,
  styles?: Style[],
  listParser?: (block: Block) => string | undefined | void
}

export default defineComponent({
  props: [ "modelValue", "decorator", "parser", "styles", "renderer", "listParser" ],
  setup(props: Props, { slots }) {

    const blocks = computed<(Block | Block[])[]>(() => {
      if (Array.isArray(props.modelValue)) {
        if (props.listParser && props.modelValue.some(i => props.listParser!(i))) {
          return wrapLists(props.modelValue, props.listParser)
        }
        return props.modelValue
      }
      return [{ text: props.modelValue, styles: props.styles ?? [] }] as Block[]
    })

    return () => h('div', blocks.value.map(block => Array.isArray(block)? 
      h(props.listParser?.(block[0]) ?? 'ul', { key: block[0].id }, block.map(block => h(TextEditorBlock, { 
        key: block.id,
        block: block,
        slots,
        decorator: props.decorator,
        renderer: props.renderer,
        parser: props.parser,
        static: true
      })))
    : h(TextEditorBlock, { 
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