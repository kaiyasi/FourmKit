// @ts-nocheck
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM 取得 __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 避免 TS 對 Node 環境變數型別報錯（僅用於設定檔）
declare const process: any

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:12005'
  return {
    plugins: [react()],
    base: '/',
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiBase, changeOrigin: true },
        '/socket.io': { target: apiBase, ws: true, changeOrigin: true },
      },
    },
  }
})
