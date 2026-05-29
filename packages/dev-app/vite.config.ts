import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1"
  },
  resolve: {
    alias: {
      'vuewrite/markdown': resolve(__dirname, '../vuewrite/src/markdown.ts'),
      'vuewrite': resolve(__dirname, '../vuewrite/src/index.ts'),
    }
  }
})
