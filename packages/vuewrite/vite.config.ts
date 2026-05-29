import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [vue(), dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: "./src/index.ts",
      name: "vuewrite",
      formats: [ "es" ],
    },
    minify: false,
    rollupOptions: {
      external: [ "vue" ]
    }
  }
})
