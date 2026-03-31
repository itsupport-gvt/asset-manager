import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api':     { target: 'http://localhost:8000', secure: false, changeOrigin: true },
      '/ws':      { target: 'ws://localhost:8000',   secure: false, ws: true },
      '/scanner': { target: 'http://localhost:8000', secure: false },
      '/health':  { target: 'http://localhost:8000', secure: false },
    },
  },
})
