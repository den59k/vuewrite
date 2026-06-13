import TextEditor from './components/TextEditor/TextEditor.vue'
import TextEditorView from './components/TextEditor/TextEditorView.vue'
import type { TextEditorRef, TextParser } from './components/TextEditor/TextEditor.vue'
import { Block, Style, Decorator, Renderer, uid } from './components/TextEditor/TextEditorStore'

export { TextEditor, TextEditorView, uid }
export type { TextEditorRef, TextParser, Block, Style, Decorator, Renderer }
