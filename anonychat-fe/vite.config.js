import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/ws': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../public',
    emptyOutDir: true
  }
})
