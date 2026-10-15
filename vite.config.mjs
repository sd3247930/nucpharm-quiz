import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'

const uni = uniModule.default || uniModule
export default defineConfig({
  base: './',
  plugins: [uni()],
  build: { sourcemap: false }
})
