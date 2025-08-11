# ForumKit 開發環境概述

## 架構
- 前端: React + Vite + TypeScript + Tailwind (容器內建置，Nginx 提供 dist)
- 後端: Flask 3 (Gunicorn) 服務 API，提供 /healthz 與維護模式攔截
- 反向代理: Nginx (同時提供前端靜態資源與 proxy /api -> backend)
- 資料服務: Postgres, Redis (目前程式尚未接線，只在 compose 中可用)

埠號 (避免 80 / 8000 / 8080 / 8081)：
- 前端 / Nginx: 12005
- 後端 API: 12006

## 主題系統
使用 `data-theme` 屬性於 `<html>`，並針對五種主題定義 CSS 變數：
| key | 顯示名稱 | 說明 |
|-----|----------|------|
| default | 米白 | 預設柔和米白底，白色卡片覆蓋 |
| ocean   | 霧藍 | 淺霧藍清爽感 |
| forest  | 霧綠 | 淺霧綠自然感 |
| mist    | 灰白 | 低彩度灰白 |
| dark    | 灰黑 | 深色模式 |

Dark 僅該主題會加上 `class="dark"` 供 Tailwind dark: 樣式使用。

### 背景
`index.css` 針對每個 `data-theme` 設置：
- 漸層半透明覆蓋 + 對應背景圖 (例: `/images/bg-forest.jpg`)
- 若無對應圖，可放置佔位或改為純漸層。

### 切換機制
`ThemeToggle`：
- 單一按鈕依序循環五主題
- localStorage key: `fk.theme`
- 避免 FOUC：載入後 `requestAnimationFrame` 加上 `html.theme-ready`，CSS 以 opacity 淡入。

## 對比工具類別
- `.dual-btn`：自動依主題 (特別是 dark) 反轉按鈕底色與字色
- `.dual-text`：文本在深色 / 亮色間保持對比

## 新增主題步驟 (範例)
1. 在 `src/styles/theme.css` 增加 `:root[data-theme='newName']` 區塊與變數
2. 在 `lib/theme.ts` 的 `THEME_ORDER` 插入新名稱
3. 在 `ThemeToggle` 增加圖示與顯示名稱 (NAME_MAP)
4. 為背景在 `index.css` 添加對應 selector 與圖片/漸層

## 開發流程
1. 啟動：`docker compose up --build`
2. 前端存取：http://localhost:12005
3. API 健康檢查：http://localhost:12006/healthz

## 維護模式
設定環境變數 `MAINTENANCE_MODE=1`（backend 容器）會使非 /healthz 請求返回 503 JSON。

## 待辦建議 (下一步)
- 前端路由 (React Router) 與實際頁面
- 後端整合 Postgres / Redis
- 單元測試 / CI
- 鍵盤可及性強化 (FAB / ThemeToggle focus trap)
- 影像資源壓縮 (webp) 與 lazy loading

---
此 README 會隨後續功能擴增再更新。
