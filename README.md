# ForumKit 開發文檔

## 專案概述

ForumKit 是一個現代化的論壇平台，採用 React + TypeScript + Tailwind CSS 前端技術棧，搭配 Flask 後端 API 和 Docker 容器化部署。

## 快速開始

### 環境需求
- Docker 和 Docker Compose
- Node.js 18+ (僅開發時需要)

### 啟動專案
```bash
# 複製專案
git clone <repository-url>
cd ForumKit

# 啟動所有服務
docker-compose up -d

# 訪問應用
http://localhost:12005
```

### 開發模式
```bash
# 訪問管理模式頁面
http://localhost:12005/mode

# 選擇 "development" 模式並保存
```

## 功能特色

### 🎨 主題系統
- **5 種預設主題**：米白、海霧、森雨、霧朦、暗夜
- **動態切換**：支援亮色/暗色模式
- **自定義配色**：顏色搭配器讓用戶提交配色方案
- **CSS 變數**：統一的主題管理系統

### 📱 響應式設計
- **桌面版**：傳統導覽列設計
- **手機版**：右下角浮動按鈕 (FAB) 導覽
- **適配性**：支援各種螢幕尺寸

### 🔧 開發工具
- **顏色搭配器**：即時預覽和提交配色方案
- **意見回饋**：多種回報類型的表單系統
- **開發進度**：動態顯示專案開發狀態
- **Discord 整合**：自動發送回饋到 Discord 頻道

### 🛡️ 平台模式
- **正常模式**：標準運行狀態
- **維護模式**：系統維護期間的友好提示
- **開發模式**：測試和預覽新功能

## 技術架構

### 前端技術棧
- **React 18**：現代化前端框架
- **TypeScript**：型別安全的 JavaScript
- **Tailwind CSS**：實用優先的 CSS 框架
- **Vite**：快速的建構工具

### 後端技術棧
- **Flask**：輕量級 Python Web 框架
- **SQLite**：嵌入式資料庫
- **Redis**：快取和會話存儲
- **PostgreSQL**：主要資料庫 (可選)

### 部署架構
- **Docker**：容器化部署
- **Nginx**：反向代理和靜態文件服務
- **Docker Compose**：多服務編排

## 開發進度

### ✅ 已完成
- 前端介面：React + TypeScript + Tailwind CSS
- 主題系統：5 種預設主題 + 動態切換
- 後端 API：Flask + Discord Webhook
- Docker 部署：容器化部署 + Nginx 反向代理
- Discord 整合：意見回饋和主題建議

### 🔄 開發中
- 用戶系統：註冊、登入、權限管理

### 📋 規劃中
- 討論功能：發文、回覆、投票系統
- 管理後台：內容管理、用戶管理

## 配置設定

### 環境變數

在 `docker-compose.yml` 中設定：

```yaml
backend:
  environment:
    # 基本設定
    FLASK_ENV: production
    SECRET_KEY: your-secret-key
    APP_MODE: normal  # normal/maintenance/development
    
    # 資料庫設定
    FORUMKIT_DB: sqlite:////data/forumkit.db
    REDIS_URL: redis://redis:6379/0
    
    # Discord Webhook (用於回饋通知)
    DISCORD_REPORT_WEBHOOK: https://discord.com/api/webhooks/your-webhook-url
    
    # SMTP 郵件設定 (可選)
    SMTP_HOST: smtp.gmail.com
    SMTP_PORT: 587
    SMTP_USER: your-email@gmail.com
    SMTP_PASSWORD: your-app-password
    SMTP_FROM: your-email@gmail.com
    REPORT_TO: admin@example.com
```

### Discord Webhook 設定

1. 在 Discord 伺服器中建立 Webhook
2. 複製 Webhook URL
3. 設定 `DISCORD_REPORT_WEBHOOK` 環境變數

### SMTP 郵件設定 (可選)

如果沒有設定 SMTP，系統會進入 "dry-run" 模式，只記錄內容而不實際發送郵件。

#### Gmail 設定範例：
```yaml
SMTP_HOST: smtp.gmail.com
SMTP_PORT: 587
SMTP_USER: your-email@gmail.com
SMTP_PASSWORD: your-16-digit-app-password
SMTP_FROM: your-email@gmail.com
REPORT_TO: admin@example.com
```

## 開發指南

### 本地開發
```bash
# 前端開發
cd frontend
npm install
npm run dev

# 後端開發
cd backend
pip install -r requirements.txt
python app.py
```

### 測試功能

#### 開發模式測試
1. 啟動開發模式：訪問 `/mode` 頁面
2. 測試顏色搭配器：調整顏色並提交
3. 測試意見回饋：填寫表單並送出
4. 查看開發進度：確認狀態顯示正確

#### Discord Webhook 測試
1. 提交意見回饋或顏色搭配方案
2. 檢查 Discord 頻道是否收到訊息
3. 查看後端日誌：`docker-compose logs backend`

### 除錯

#### 常見問題
1. **Discord 訊息未發送**：
   - 檢查 Webhook URL 是否正確（使用 `discord.com` 而非 `discordapp.com`）
   - 確認 Discord 伺服器權限設定
   - 檢查 Webhook 是否已過期或被刪除
   - 查看後端日誌中的錯誤訊息
   - 如果 Webhook 無效，系統會顯示「已記錄（未設定 Discord）」訊息

2. **手機版介面問題**：
   - 檢查 CSS 類別設定
   - 確認響應式設計規則
   - 測試不同螢幕尺寸

3. **權限問題**：
   - 在 Windows 上可能需要手動設定權限
   - 使用 Docker 構建而非 volume 掛載

#### 查看日誌
```bash
# 查看所有服務日誌
docker-compose logs

# 查看特定服務日誌
docker-compose logs backend
docker-compose logs frontend
docker-compose logs nginx
```

## 檔案結構

```
ForumKit/
├── backend/                 # Flask 後端
│   ├── app.py              # 主要應用程式
│   ├── requirements.txt    # Python 依賴
│   └── utils/              # 工具模組
├── frontend/               # React 前端
│   ├── src/
│   │   ├── App.tsx         # 主要組件
│   │   ├── components/     # 可重用組件
│   │   └── styles/         # 樣式檔案
│   └── package.json        # Node.js 依賴
├── nginx/                  # Nginx 配置
├── docker-compose.yml      # Docker 編排
└── README.md              # 專案文檔
```

## 貢獻指南

1. Fork 專案
2. 建立功能分支
3. 提交變更
4. 發起 Pull Request

## 授權

本專案採用 MIT 授權條款。詳見 [LICENSE](LICENSE) 檔案。

## 更新日誌

### 2024-08-14
- **文檔整合**：合併重複的 MD 文件，統一為 README.md
- **Discord Webhook 修正**：移除硬編碼的 Webhook URL，改為環境變數設定
- **手機版介面優化**：修正響應式設計，改善手機版的使用體驗
  - 顏色選擇器在手機版改為垂直排列
  - 意見回饋表單優化手機版佈局
  - 調整間距和字體大小以適應小螢幕
  - 快速配色方案在手機版改為 2 列顯示
- **深淺色模式自動化**：移除手動切換，改為根據背景顏色自動判斷
- **介面優化**：修正深色模式下的文字顏色顯示問題
- **管理模式改進**：儲存後自動跳轉回主畫面
- **錯誤處理改進**：增強 Discord Webhook 錯誤日誌，提供更詳細的除錯資訊
- **狀態管理修正**：修正配色方案提交後狀態重置問題
- **文字顏色修正**：確保回報表單在深色模式下文字可見
- **Socket 基礎通訊**：建立 Flask-SocketIO 與 React 的 WebSocket 連接
  - 後端導入 Flask-SocketIO 和 eventlet
  - Nginx 新增 WebSocket 代理支援
  - 前端新增 SocketBadge 組件顯示連線狀態
  - 支援 connect、ping/pong 等基本事件

### 2024-08-13
- 完成開發模式介面設計
- 實現顏色搭配器功能
- 修復 Docker 權限問題
- 優化主題切換體驗
- 修復開發進度資料讀取問題
