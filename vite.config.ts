import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: "./src/export.ts",
      name: "vuewrite",
      formats: [ "es" ],
    },
    minify: false,
    rollupOptions: {
      external: [ "vue" ]
    }
  }
})
