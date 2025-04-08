
<script lang="ts">
import { HTMLAttributes, computed, defineComponent, getCurrentInstance, h, nextTick } from 'vue';
import type { Style, Block, Decorator, Renderer } from './TextEditorStore';
import type { TextParser } from './TextEditor.vue';

type Props = {
  block: Block, 
  slots: Record<string, any>, 
  static?: boolean,
  decorator?: Decorator, 
  renderer?: Renderer,
  parser?: TextParser
}

export default defineComponent({
  props: [ "block", "slots", "static", "decorator", "renderer", "parser" ],
  emits: [ "postrender" ],
  setup(props: Props, { emit }) {
    const slot = computed(() => {
      if (!props.block.type) return props.slots['default'] ?? null
      return props.slots[props.block.type] ?? null
    })

    const instance = getCurrentInstance()
    const getRef = () => {
      if (!instance) return null
      const el = instance.vnode.el as HTMLElement
      if (!el) return null
      if (el.nodeType === Node.TEXT_NODE && el.nextSibling !== null) {
        return el.nextSibling as HTMLElement
      }
      return el
    }

    const cacheNodes: Node[] = []
    let cacheEl: Node | null = null
    const cleanTree = (count: number) => {
      if (props.static === true) return
      const el = getRef()
      if (!el) return
      
      if (el === cacheEl && cacheNodes.length > 0) {
        el.prepend(cacheNodes[0])
        el.append(cacheNodes[1])
      }

      nextTick(() => {
        cacheEl = getRef()
        if (el === cacheEl) {
          if (el.childNodes.length > count+2) {
            // Remove <br/> tags and contenteditable text nodes
            for (let i = 0; i < el.childNodes.length; i++) {
              const child = el.childNodes[i]
              if (i === 0 && child.nodeType === Node.TEXT_NODE && child.textContent === '') continue
              if ("__vnode" in child) continue
              if (child.nodeType === Node.TEXT_NODE && child.textContent?.endsWith("\n")) continue
              el.removeChild(child)
              break
            }
          }
        }
        if (cacheEl) {
          cacheNodes[0] = cacheEl.childNodes[0]
          cacheNodes[1] = cacheEl.childNodes[cacheEl.childNodes.length-1]
        } else {
          cacheNodes.length === 0
        }
        emit("postrender")
      })
    }

    const content = () => {
      const block = props.block
      if (block.editable === false) return []
      if (block.text.length === 0) {
        cleanTree(1)
        return [h("br")]
      }
      let text = block.text
      if (text.endsWith("\n")) {
        text = text + "\n"
      }
      const markers: [ number, Style ][] = []
      if (block.styles) {
        for (let style of block.styles) {
          if (style.end <= style.start) continue
          markers.push([style.start, style])
          markers.push([style.end, style])
        }
      }
      if (props.parser) {
        for (let style of props.parser(text)) {
          if (style.end <= style.start) continue
          markers.push([ style.start, style ])
          markers.push([ style.end, style ])
        }
      }
      markers.sort((a, b) => a[0] - b[0])
      
      let currentIndex = 0
      const activeStyles = new Set<Style>()
      const blocks = []
      for (let marker of markers) {
        if (currentIndex !== marker[0]) {
          const str = text.slice(currentIndex, marker[0])
          blocks.push(renderBlockPart(str, Array.from(activeStyles.values())))
          currentIndex = marker[0]
        }

        if (marker[0] === marker[1].start) {
          activeStyles.add(marker[1])
        } 
        if (marker[0] === marker[1].end) {
          activeStyles.delete(marker[1])
        }
      }

      if (currentIndex !== text.length) {
        const str = text.slice(currentIndex, text.length)
        blocks.push(renderBlockPart(str, Array.from(activeStyles.values())))
      }
      cleanTree(blocks.length)
      return blocks
    }


    const renderBlockPart = (text: string, styles: Style[]) => {
      if (!props.decorator) return text

      let elementTag = "span"
      const attrs: HTMLAttributes = {}
      for (let style of styles) {
        const partProps = props.decorator(style)
        if (!partProps) continue
        const { class: _class, style: _style, tag, ...otherProps } = partProps
        Object.assign(attrs, otherProps)
        if (_class) {
          attrs.class = attrs.class? attrs.class + " " + _class: _class
        }
        if (_style) {
          attrs.style = attrs.style? attrs.style + " " + _style: _style
        }
        if (tag) {
          elementTag = tag
        }
      }
      if (Object.keys(attrs).length === 0 && elementTag === 'span') return text
      return h(elementTag, attrs, text)
    }

    return () => {
      let elementTag = 'div'
      const blockProps: Record<string, string> = {
        "data-vw-block-id": props.block.id
      }

      const additionalProps = props.renderer && props.renderer(props.block)
      if (additionalProps) {
        if (additionalProps.tag) {
          elementTag = additionalProps.tag
          delete additionalProps.tag
        }
        Object.assign(blockProps, additionalProps)
      }

      if (slot.value) {
        const component = slot.value({ content, props: blockProps, block: props.block })
        if (Array.isArray(component) && component.length === 1) return component[0]
        return component
      } 
      return h(elementTag, blockProps, content())
    }
  }
})

</script>

<style lang="sass">

</style>