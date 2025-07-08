import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    // Performance optimizations
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          vendor: ['react', 'react-dom'],
          // Separate components chunk
          components: [
            './src/components/layout/container/ChatContainer.jsx',
            './src/components/chat/ChatLog.jsx',
            './src/components/layout/header/index.jsx',
            './src/components/input/MessageInput.jsx',
          ],
        },
      },
    },
    // Enable compression
    minify: 'esbuild',
    // Optimize CSS
    cssMinify: true,
    // Enable tree shaking
    target: 'esnext',
  },
  // Performance optimizations for dev
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@styles': resolve(__dirname, 'src/styles'),
      '@context': resolve(__dirname, 'src/context'),
      '@providers': resolve(__dirname, 'src/providers'),
    },
  },
});
