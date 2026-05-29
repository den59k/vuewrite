import TextEditor from './components/TextEditor/TextEditor.vue'
import TextEditorView from './components/TextEditor/TextEditorView.vue'
import type { TextEditorRef } from './components/TextEditor/TextEditor.vue'
import { Block, Style, Decorator, uid } from './components/TextEditor/TextEditorStore'

export { TextEditor, TextEditorView, uid }
export type { TextEditorRef, Block, Style, Decorator }
