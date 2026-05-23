import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:9002',
        changeOrigin: true,
        ws: true, // 支持 WebSocket 代理
      },
      '/health': {
        target: 'http://localhost:9002',
        changeOrigin: true,
      },
    },
  },
})