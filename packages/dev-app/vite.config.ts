import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1"
  },
  resolve: {
    alias: {
      'vuewrite': resolve(__dirname, '../vuewrite/src/index.ts')
    }
  }
})
