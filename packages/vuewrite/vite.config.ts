import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [vue(), dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: {
        vuewrite: "./src/index.ts",
        markdown: "./src/markdown.ts",
        table: "./src/table.ts",
      },
      formats: [ "es" ],
    },
    minify: false,
    rollupOptions: {
      external: [ "vue" ]
    }
  }
})
