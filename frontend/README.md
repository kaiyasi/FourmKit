# ForumKit - 校園匿名討論平台

> **由 Serelix Studio 開發的校園匿名論壇系統，具備完整內容審核功能**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat\&logo=docker\&logoColor=white)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/postgres-%23316192.svg?style=flat\&logo=postgresql\&logoColor=white)](https://postgresql.org/)

---

## 🌟 特色功能

### 📋 審核模型

* **物件管理**：支援 `Post`、`Media` 審核（未來可擴展 `Comment`）
* **狀態流轉**：`pending`（預設）→ `approved`／`rejected`（含退件理由）
* **顯示控制**：前台只顯示已核准內容；後台可操作所有狀態
* **完整審核紀錄**：`moderation_logs` 記錄所有審核活動（誰、何時、舊→新、理由）

### 🔐 權限系統

* **角色分級**：`admin`、`moderator`、`user`
* **JWT 認證**：token 包含 `role` claim + `@require_role()` 裝飾器保護
* **API 保護**：只有管理員和審核員可執行審核操作

### 🛡️ 媒體安全

* **分階段存儲**：上傳先落 `uploads/pending/`；核准後移至 `uploads/public/`
* **CDN 整合**：現有 CDN 服務只掛載 `public` 目錄
* **檔案限制**：阻擋可執行副檔名（`.php`、`.py`、`.sh` 等）和目錄跳脫（path traversal）

### ⚡ 即時通知

* **Flask-SocketIO**：廣播審核事件（`post.approved|rejected`、`media.approved|rejected`）
* **擴展性**：Day 10 可串接 Redis 進行分散式部署
* **健康檢查服務**：TCP 9101 提供 Python socket 原生 ping/pong 服務

---

## 🏗️ 系統架構

### 🌐 Port 配置

| 服務        | 對外 Port | 容器內 Port | 說明                       |
| --------- | ------- | -------- | ------------------------ |
| Web/Nginx | 12005   | 80       | 前端 + API 反代              |
| CDN       | 12002   | 80       | 上傳公開檔案 `uploads/public/` |
| Postgres  | 12007   | 80       | 資料庫，內部通訊                 |
| Redis     | 12008   | 80       | Pub/Sub, cache           |
| Health    | 9101    | 9101     | Python socket ping/pong  |

> CDN 服務已內建於 docker compose（可選用）。生產環境亦可替換為既有外部 CDN，只需指向主機的 `uploads/public/` 目錄。

### 📁 目錄結構

```
ForumKit/
├─ docker/
│  └─ nginx/                 # Nginx 配置和 Dockerfile
├─ backend/                  # Flask 後端應用
│  ├─ models/               # 資料庫模型
│  ├─ routes/               # API 路由
│  ├─ utils/                # 工具模組
│  ├─ migrations/           # Alembic 遷移
│  ├─ app.py               # 主應用檔案
│  ├─ heartbeat.py         # 健康檢查服務
│  └─ manage.py            # 用戶管理腳本
├─ frontend/                # React 前端
│  └─ src/
│     ├─ api/              # API 呼叫模組
│     ├─ pages/admin/      # 管理頁面
│     └─ components/       # 可重用元件
├─ uploads/                 # 媒體檔案存儲
│  ├─ pending/             # 待審核檔案
│  └─ public/              # 已核准檔案
├─ tests/                  # 測試檔案
├─ docker-compose.yml      # Docker 編排
└─ scripts/
   ├─ dev/demo.sh         # 端到端測試腳本（示範流程）
   └─ ops/
      ├─ deploy.sh        # 一鍵部署（compose + alembic + 健康檢查）
      └─ fix-permissions.sh # 修復前端 dist 權限的小工具
```

---

## 🚀 快速開始

### 📋 前置要求

* Docker & Docker Compose
* 現有的 CDN 服務（用於提供 `uploads/public/` 內容）

### 🛠️ 部署步驟

1. **複製專案並進入目錄**

   ```bash
   git clone <repository>
   cd ForumKit
   ```

2. **配置環境變數**

   ```bash
   cp .env.example .env
   # 編輯 .env 設定 JWT_SECRET_KEY 等
   ```

3. **啟動所有服務**

   ```bash
   docker compose up -d --build
   ```

4. **初始化資料庫**

   ```bash
   docker compose exec backend alembic upgrade head
   ```

5. **建立管理帳號**

   ```bash
   docker compose exec backend python manage.py
   ```

6. **健康檢查**

   ```bash
   curl -i http://localhost:12005/api/healthz
   ```

7. **驗證 CDN**（可選）

   ```bash
   # 放一個測試檔到 uploads/public
   echo hello > uploads/public/hello.txt
   # 透過 CDN 取檔
   curl -fsS http://localhost:12002/hello.txt
   ```

> 若 12002 已被占用，可在 `.env` 設定 `CDN_PORT=12012`（或其他可用埠），
> 之後 `docker compose up -d --build` 會使用該埠對外提供 CDN。
> 查占用程式：`lsof -i :12002 -nP` 或 `ss -lntp | grep 12002`。

### 🧪 執行測試

```bash
# 端到端測試
bash ./scripts/dev/demo.sh

# 單元測試
docker compose exec backend pytest -q
```

---

## Google OAuth（校園帳號）設定

* 目的：允許使用者以 Google 校園信箱登入（僅允許 `.edu` 類網域，明確拒絕 `gmail.com`）。
* 步驟：

  * 於 Google Cloud Console 建立 OAuth 2.0 Client（Application type: Web application）。
  * 授權重新導向 URI 新增：`http://localhost:12005/api/auth/google/callback`
  * 於 `.env` 設定：

    * `GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID`
    * `GOOGLE_OAUTH_CLIENT_SECRET=YOUR_CLIENT_SECRET`
    * `OAUTH_REDIRECT_URL=http://localhost:12005/api/auth/google/callback`
* `ADMIN_NOTIFY_WEBHOOK=...`（可選；後台統一通知端口：回報/主題提案/學校入駐等）
* 使用方式：

  * 前往 `http://localhost:12005/auth` 點選「使用 Google 校園帳號登入」。
  * 首次使用該校園網域登入時，系統會依網域推導 `school_slug`，若資料庫尚無該學校即自動建立暫存學校並（若設定 Webhook）發送入駐通知。

小提醒：若遇到 403，請確認使用的帳號不是 `gmail.com`，且屬於 `.edu*` 網域。

## 🔔 Webhook 整合（Morandi 版）

* 環境變數：

  * `ADMIN_NOTIFY_WEBHOOK`: Discord 相容的 Webhook URL（統一路徑）。
  * 相容舊變數：`DISCORD_REPORT_WEBHOOK`、`DISCORD_THEME_WEBHOOK`（未設定統一路徑時作為後援）。
* 訊息格式：

  * 使用 Discord embed，色系採用「莫蘭迪」調色盤，依事件型別穩定配色。
  * 標準欄位：`Event`、`Actor`、`Source`，頁尾自動附 `req`/`ticket`/`ts`。
  * 端點：

    * `POST /api/report` → kind=`issue_report`
    * `POST /api/color_vote` → kind=`simple_choice` 或 `theme_proposal`
  * 回傳包含 `delivery` 欄位（`discord` 或 `local_only`）。

### 測試與診斷

* 一鍵測試腳本：`bash scripts/test_admin_webhook.sh [api|direct|all] [--endpoint URL] [--webhook URL] [--dry-run]`

  * 範例：`bash scripts/test_admin_webhook.sh all`
  * 樣本檔位於 `scripts/webhooks/*.json`，涵蓋 issue/theme/moderation/system。
* 狀態檢視：`GET /api/status/integrations`（不含敏感資訊，回報 webhook 是否設定、主機名與最近投遞結果摘要）。
* 管理測試：`POST /api/admin/webhook/test`（需 admin/dev\_admin）

  * body: `{ "title"?: string, "description"?: string }`

## 🧰 運維腳本（精簡）

* 開發用全平台重建：`bash scripts/dev_full_rebuild.sh`

  * 停止與清空 docker 資料卷 → 重建前端 → 重新 build/up → 套用遷移 → 健康檢查。
  * 可用環境變數：

    * `ENFORCE_SINGLE_ADMIN=0` 可在開發時播種帳號（避免單一管理模式擋住）。
    * `ADMIN_USER`、`ADMIN_PASS` 自訂建立/提升的總管理員帳密。

* 上架後維護重啟：`bash scripts/prod_maintenance_restart.sh`

  * 保留資料卷，重建映像與前端資產 → 啟動 → 套用遷移 → 健康檢查。

* 服務狀態檢查（含 API）：`bash scripts/health_check.sh`

  * 顯示 compose 狀態並呼叫 `GET /api/healthz`；可用 `API_ENDPOINT` 覆寫預設位址。

---

## 📎 檔案整理說明

* `scripts/dev_full_rebuild.sh`: 開發環境的一鍵重建。
* `scripts/prod_maintenance_restart.sh`: 正式環境維護重啟。
* `scripts/health_check.sh`: 服務狀態檢查（含 API）。
* `docs/samples/cf403/`: 403 樣本（Cloudflare/Nginx）留存備查；純參考用，非執行檔。

## 📚 API 文檔

### 🔐 認證

```bash
# 登入
POST /api/auth/login
Content-Type: application/json
{
  "username": "admin",
  "password": "admin123"
}
```

### 📝 貼文管理

```bash
# 建立貼文（需登入）
POST /api/posts/create
Authorization: Bearer <JWT>
{
  "content": "待審核的貼文內容"
}

# 列出已核准貼文
GET /api/posts/list?limit=20
```

### 📎 媒體上傳

```bash
# 上傳媒體檔案（需登入）
POST /api/posts/upload
Authorization: Bearer <JWT>
Content-Type: multipart/form-data
{
  "file": <檔案>,
  "post_id": 123
}
```

### 🛡️ 審核管理（僅一般管理員）

```bash
# 取得待審核佇列（需一般管理員 admin）
GET /api/moderation/queue
Authorization: Bearer <ADMIN_JWT>

# 核准貼文（僅 admin）
POST /api/moderation/post/{id}/approve
Authorization: Bearer <ADMIN_JWT>

# 退件貼文（僅 admin）
POST /api/moderation/post/{id}/reject
Authorization: Bearer <ADMIN_JWT>
{
  "reason": "不符合社群規範"
}

# 核准媒體檔案（僅 admin）
POST /api/moderation/media/{id}/approve
Authorization: Bearer <ADMIN_JWT>

# 退件媒體檔案（僅 admin）
POST /api/moderation/media/{id}/reject
Authorization: Bearer <ADMIN_JWT>
{
  "reason": "內容不當"
}
```

---

## 🔒 安全設計

### 📁 檔案安全

* 兩階段存儲：`pending` → `public`
* 路徑驗證：防止 `../` 攻擊
* 副檔名過濾 + 檔案內容檢測：阻擋可執行檔案，對 JPEG/PNG/WebP/MP4/WebM 做快速檢查
* 檔案大小限制：預設單檔 ≤ `UPLOAD_MAX_SIZE_MB`（預設 10MB）
* 權限控制：檔案權限設為 `644`

### 🛡️ Web/API 安全

* 安全標頭：`X-Content-Type-Options=nosniff`、`X-Frame-Options=DENY`、`Referrer-Policy=no-referrer`、`Permissions-Policy`
* CSP：預設 `default-src 'self'`，開放最小必要來源（可用 `CONTENT_SECURITY_POLICY` 覆寫）
* CORS：限制允許的來源（`ALLOWED_ORIGINS`），Socket.IO 亦可設定 `SOCKETIO_ORIGINS`
* 速率限制：對發文與上傳 API 做 Token Bucket 限流（每裝置/每 IP）

  * 若設定 `REDIS_URL`：改用 Redis 計數（多機一致）；未設定時使用單機記憶體方案
* 自動封鎖：同一 IP 在短時間內被限流阻擋達 2 次（可調）→ 自動封鎖（預設 1 天）

  * 封鎖期間，所有 `/api/*`（除 `/api/audit_report`）回傳 451，要求提交稽核報告以解除
  * 稽核報告：`POST /api/audit_report { contact?, reason?, message }`（成功即解除封鎖）
* 請求體大小：全域 `MAX_CONTENT_LENGTH`（預設 16MB，可調整）
* 內容清洗：貼文內容使用 Bleach 允許清單清理

### 👤 匿名與半匿名

* 完整匿名：未登入時以 `X-Client-Id` 建立/辨識匿名使用者（`anon_<clientId>`）
* 半匿名：可透過學校信箱註冊後綁定匿名 ID（未來擴充），不影響未登入發文

### 📊 審核追蹤

* **操作記錄**：所有審核動作都記錄在 `moderation_logs`
* **狀態追蹤**：記錄狀態變更的前後對比
* **責任歸屬**：記錄操作人員和時間戳

---

## 🧪 測試指南

### 🔍 基本功能測試

1. **登入測試**

   ```bash
   curl -s -X POST http://localhost:12005/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"帳號或Email","password":"密碼"}'
   ```

2. **建立貼文**

   ```bash
   curl -s -X POST http://localhost:12005/api/posts/create \
     -H "Authorization: Bearer <JWT>" \
     -H 'Content-Type: application/json' \
     -d '{"content":"Hello pending"}'
   ```

3. **審核流程**

   ```bash
   # 查看待審核項目
   curl -s http://localhost:12005/api/moderation/queue \
     -H "Authorization: Bearer <ADMIN_JWT>"

   # 核准貼文
   curl -s -X POST http://localhost:12005/api/moderation/post/1/approve \
     -H "Authorization: Bearer <ADMIN_JWT]"
   ```

4. **心跳測試**

   ```bash
   echo "ping" | nc 127.0.0.1 9101
   # 應該回傳: pong
   ```

### 🎯 檔案上傳測試

```bash
# 上傳圖片到 pending
curl -s -X POST http://localhost:12005/api/posts/upload \
  -H "Authorization: Bearer <USER_JWT>" \
  -F file=@demo.jpg -F post_id=1

# 核准後檔案移動到 public
curl -s -X POST http://localhost:12005/api/moderation/media/1/approve \
  -H "Authorization: Bearer <ADMIN_JWT]"

# 確認可透過 CDN 訪問
# curl -I http://your-cdn-url/1/<uuid>.jpg
```

---

## 🚨 常見問題排查

### ❌ 403 權限拒絕

* **檢查項目**：確認登入帳號是否為 `admin` 或 `moderator` 角色
* **解決方案**：使用 `manage.py` 建立管理帳號

### 📁 媒體檔案無法存取

* **檢查項目**：檔案是否還在 `pending/` 目錄
* **解決方案**：必須先通過審核才能公開存取

### 🔌 Socket.IO 連線問題

* **檢查項目**：CSP 標頭是否允許 `ws:`/`wss:` 連線
* **解決方案**：確認 Nginx 配置正確

### 🗄️ 資料庫連線失敗

* **檢查項目**：確認 Docker Compose 是否使用 `:80` 而不是 `:5432`
* **解決方案**：檢查 `DATABASE_URL` 環境變數

---

## 🛠️ 進階配置

### 🌍 生產環境部署

1. **環境變數設定**

   ```env
   JWT_SECRET_KEY=your-super-secure-key-here
   APP_MODE=production
   DATABASE_URL=postgresql+psycopg2://user:pass@db:80/forumkit
   UPLOAD_ROOT=/data/uploads
   ```

2. **外部 Nginx 反代理**

   ```nginx
   server {
       listen 443 ssl;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:12005;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **CDN 整合**

   * 將現有 CDN 指向 `uploads/public/` 目錄
   * 確保 CDN 配置阻擋可執行檔案副檔名

### 📊 監控與維護

* **日誌查看**：`docker compose logs -f backend`
* **資料庫備份**：定期備份 PostgreSQL 資料
* **檔案清理**：定期清理被退件的 `pending` 檔案

### 🔐 登入與帳號

* 帳密登入支援「帳號或 Email」；登入頁輸入框標示「帳號/Email」。
* Google 校園登入：非校園網域回傳 JSON `{"msg":"僅限校園網域登入"}`（HTTP 403）。
* 重設密碼：

  * `docker compose exec backend python manage.py set-password <username> <password>`
  * 例：`docker compose exec backend python manage.py set-password Kaiyasi mabuchi_0315`

### 🔔 Webhook 測試與狀態

* 一鍵測試：`bash scripts/test_admin_webhook.sh [api|direct|all] [--dry-run]`
* 狀態檢視：`GET /api/status/integrations`
* 管理測試：`POST /api/admin/webhook/test`（需 admin/dev\_admin）

---

## 📄 授權條款

MIT License - 詳見 [LICENSE](LICENSE) 檔案

---

## 🤝 貢獻指南

1. Fork 此專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

---

## 💾 版本紀錄

* 詳見 [VERSION\_RECORD.md](./VERSION_RECORD.md)

---

## 📞 支援與聯繫

* 🐛 **問題回報**
* 💬 **討論交流**
* 📧 **安全問題**
  加入DC頻道開單與我們聯繫
* 📢 **官方 Discord 群組**：[SerelixStudio\_Discord](https://discord.gg/eRfGKepusP)
* 📸 **官方 IG**：[SerelixStudio\_IG](https://www.instagram.com/serelix_studio?igsh=eGM1anl3em1xaHZ6&utm_source=qr)
* 📸 **匿名 IG**：[https://www.instagram.com/forumkit.serelix?igsh=MThtNDRzMGZqMnRhdw%3D%3D\&utm\_source=qr](https://www.instagram.com/forumkit.serelix?igsh=MThtNDRzMGZqMnRhdw%3D%3D&utm_source=qr)
* 📧 **官方 Gmail**：[serelixstudio@gmail.com](mailto:serelixstudio@gmail.com)

---

### 🔧 安全相關環境變數

* `ALLOWED_ORIGINS`: 允許 CORS 的前端來源（逗號分隔）
* `SOCKETIO_ORIGINS`: 允許的 Socket.IO 來源（逗號分隔）
* `MAX_CONTENT_MB`: 全域請求體大小上限（預設 16）
* `UPLOAD_MAX_SIZE_MB`: 單檔上傳大小上限（預設 10）
* `POST_MAX_CHARS`: 貼文內容字數上限（預設 5000）
* `CONTENT_SECURITY_POLICY`: 自訂 CSP 字串（預設為嚴格的 self 政策）
* `SECURITY_HEADERS_DISABLED`: 設為 `1` 可停用安全標頭（不建議）
* `ENABLE_HSTS`: 設為 `1` 啟用 HSTS（僅 https）
* `REDIS_URL`: 啟用 Redis 限流（如 `redis://redis:6379/0`）
* `IP_BLOCK_STRIKES_THRESHOLD`: 觸發自動封鎖的次數（預設 2）
* `IP_STRIKE_TTL_SECONDS`: 計算「短時間內」的視窗秒數（預設 1800）
* `IP_BLOCK_TTL_SECONDS`: 自動封鎖持續秒數（預設 86400）

---

*ForumKit by Serelix Studio - 安全可靠的校園匿名討論平台* 🛡️

---
