import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // 確保使用相對路徑
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
