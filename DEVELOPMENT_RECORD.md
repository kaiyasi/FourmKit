## Day 1 — 基礎架構建立
日期：2025-08-10  
時數：約 3 小時  
狀態：已完成  

### 目標
- 建立專案基礎環境（前後端分離 + Docker Compose）
- 前端：React + TypeScript + Vite
- 後端：Flask API + CORS
- Nginx 作為反向代理與靜態檔案伺服
- 預留 Postgres 與 Redis 服務

### 達成情況
- 完成 Docker Compose 設定（nginx / backend / postgres / redis）
- Nginx 靜態檔案目錄配置
- Flask 啟動 API `/api/healthz` 測試通過
- 預留 DB 與快取服務

---

## Day 2 — Navbar 完成與多主題系統
日期：2025-08-12  
時數：約 2 小時  
狀態：已完成  

### 目標
- 建立導覽列（桌面版 / 手機 FAB）
- 多主題與亮暗模式切換
- 主題設定記錄於 localStorage

### 達成情況
- 桌面版 Navbar 置中橫排，當前頁高亮
- 手機版 FAB 展開選單
- 新增海霧、森雨、暮霞等主題
- 主題即時切換並記錄至 localStorage

---

## Day 3 — 平台模式管理
日期：2025-08-13  
時數：約 2 小時  
狀態：已完成  

### 目標
- 後端模式管理 API
- 前端模式切換 UI（normal / maintenance / development）

### 達成情況
- `/api/mode` GET/POST 實作完成
- 前端平台模式管理頁完成
- 模式切換時可即時影響全站行為（維護模式阻擋 API）

---

## Day 4 — 回報表單與郵件通知
日期：2025-08-14  
時數：約 2.5 小時  
狀態：已完成  

### 目標
- 維護模式下提供回報表單
- 後端寄送郵件至管理員信箱

### 達成情況
- `/api/report` 實作完成，整合 `utils/mailer.py`
- 支援 email / 類別 / 訊息 / 自動附帶 UA 與 IP
- Nginx、後端全服務啟動並健康檢查通過

---

## Day 5 — 發文系統（後端基礎）
日期：2025-08-15  
時數：約 3 小時  
狀態：已完成  

### 目標
- 後端新增發文 API
- 權限驗證與模式限制
- 預留圖片與附件欄位

### 達成情況
- `/api/post/create` 已建立，支援標題 / 內容 / 附件 URL
- 維護模式下禁止發文
- 權限驗證（需登入）
- 預留後續與 SocketIO 整合

---

## Day 6 — 發文列表與顯示
日期：2025-08-15  
時數：約 2 小時  
狀態：已完成  

### 目標
- 前端建立發文列表頁
- 後端提供分頁 API

### 達成情況
- `/api/post/list` 提供分頁與排序
- 前端渲染文章卡片樣式（含標題 / 摘要 / 時間）
- 發文後可即時刷新列表（暫時透過 API 重新抓取）

---

## Day 7 — 登入系統與模式保護
日期：2025-08-16  
時數：約 3 小時  
狀態：已完成  

### 目標
- 建立登入介面
- 串接後端 `/api/auth/login`
- 將模式切換功能改為需登入後才能操作

### 達成情況
- 前端新增登入頁（React + Tailwind），輸入帳密後可獲取 JWT
- Token 儲存於 localStorage，後續 API 請求帶入認證
- 模式切換與公告 API 已加上角色驗證（需管理員身分）
- 修正前端白畫面問題（Nginx 靜態資源配置缺失）

---

## Day 8 — 多媒體上傳
日期：2025-08-17
時數：約 N 小時
狀態：已完成

### 目標
- 發文/留言支援圖片與影片
- 圖片縮圖自動產生
- 前端附件選擇、拖拉、預覽、刪除

### 達成情況
- 後端 /api/posts 支援 multipart 多檔上傳
- Pillow + libmagic 實作縮圖與 MIME 雙檢查
- Nginx 公開 /uploads，限制 client_max_body_size
- 前端完成 UploadArea + PostComposer 串接與驗證

---

## Day 9 — 上線整備（CDN、遷移穩定性、權限與體驗）
日期：2025-08-21  
時數：約 5 小時  
狀態：已完成（結算至 Day 9）

### 需求
- 為上線做整備：提供公開媒體服務（CDN）、穩定資料庫遷移流程、前後端權限與體驗對齊、強化運維腳本，並補齊文件與開發紀錄。

### 範圍
- DevOps：docker compose 服務、CDN Nginx、健康檢查與診斷腳本、環境變數映射。
- 後端：Alembic 遷移穩定化（SAVEPOINT）、新增 posts/media 欄位遷移、角色權限放寬、Discord Webhook 設定、進度 API 解析韌性。
- 前端：Navbar 統一樣式、ModePage 返回鍵、HTTP 包裝相容兩種 API 回傳、表單輸入統一主題樣式、後台守衛放寬。

### 設計決策
- CDN：以獨立容器（Nginx）掛載 `uploads/public/`，預設對外埠 `12002`；安全標頭 + 危險副檔名阻擋；Cache-Control 1 週。
- 遷移穩定性：`create_table` 包 SAVEPOINT（begin_nested），即使重複/型別衝突也不會毒化外層交易，後續 `has_table/has_index` 仍可運行。
- 欄位擴充：為 `posts` 與 `media` 新增 `client_id`/`ip`，支援來源追蹤與後台展示。
- 權限對齊：審核佇列允許 admin/dev_admin/campus_admin/cross_admin/moderator 類型查看；核准/退件/日誌限 admin/各類 admin。
- 體驗一致：
  - Navbar 一律「圖標＋文字」。
  - ModePage 左上加入返回鈕（history.back；無前頁則回首頁）。
  - 全域 input/textarea/select 與 `.form-control` 統一主題樣式。
  - 前端 HTTP 包裝支援「直接物件」與「包在 data」兩種回傳，避免 undefined。
- 進度頁：後端 `/api/progress` 解析接受「# 開發進度」與「# 開發紀錄」（允許 `#` 後空白），並以 DEVELOPMENT_RECORD.md 備援抽取更新。

### 影響面
- 上線拓撲：新增 `cdn` 服務；README 加入 Port 表與 CDN 驗證步驟；CDN 埠可自 `.env` 覆寫 `CDN_PORT`。
- 安全：CDN 預設阻擋可執行副檔名；主站 Nginx 維持嚴格 CSP/CORS；後端安全標頭預設開啟。
- 相依：docker-compose 需載入 `.env` 中的 `DISCORD_*`、`ALLOWED_ORIGINS`、`SOCKETIO_ORIGINS`；Alembic 在既有資料表亦可安全執行。

### 變更檔案（主要）
- DevOps / 文件：
  - `docker-compose.yml`：新增 `cdn` 服務；`CDN_PORT` 可覆寫；擴充 backend 環境變數映射（DISCORD_*、ALLOWED_ORIGINS、SOCKETIO_ORIGINS）。
  - `docker/cdn/`：新增 `Dockerfile`、`default.conf`（安全標頭 + 快取 + 阻擋危險副檔名）。
  - `README.md`：補 Port 表、CDN 驗證步驟與埠衝突說明。
  - `scripts/dev_full_rebuild.sh`：等待 backend 就緒、遷移 fallback（`exec`→`run --rm`）。
  - `scripts/prod_maintenance_restart.sh`：等候就緒、遷移 fallback。
  - `scripts/diagnose_502.sh`：新增 502 診斷（compose 狀態、Nginx↔backend 連通、/healthz、backend 日誌）。
- 後端：
  - `backend/migrations/2025_08_19_add_moderation.py`：以 SAVEPOINT 包裹 create_table；失敗不毒化外層交易。
  - `backend/migrations/2025_08_21_add_client_ip_fields.py`：新增 `posts.media` 的 `client_id`/`ip` 欄位（存在檢查）。
  - `backend/app.py`：
    - `new_ticket_id` 抽至 `utils/ticket.py`（避免循環匯入）。
    - `/api/progress` 標題解析支援「# 開發進度 / # 開發紀錄」與空白。
    - `/api/report`、`/api/color_vote` Discord 回傳結果標示 delivery（discord/local_only）。
  - `backend/routes/routes_moderation.py`、`routes_admin.py`：放寬角色。
- 前端：
  - `frontend/src/components/layout/NavBar.tsx`：統一圖標＋文字。
  - `frontend/src/pages/ModePage.tsx`：加入返回鍵；維護欄位使用 `.form-control`。
  - `frontend/src/lib/http.ts`：回傳相容（有 data 用 data；否則回整體 body）。
  - `frontend/src/pages/GeneralAdminPage.tsx`：後台篩選輸入統一樣式。
  - `frontend/src/index.css`：新增全域 input/textarea/select 與 `.form-control` 主題樣式。

### 風險與回滾
- 風險：
  - 舊實例曾以 `create_all` 建表，可能與 Alembic 初始化重疊；現以 SAVEPOINT 容忍，風險已大幅降低。
  - CDN 埠衝突：`12002` 被占用時 compose 啟動失敗。
- 回滾：
  - 遷移：本次僅新增欄位（可逆性高）；必要時以 `alembic downgrade -1` 回退欄位，或以備份還原。
  - CDN：移除 `cdn` 服務或改 `.env` 內 `CDN_PORT`。

### 驗證步驟
1. 重建：`docker compose up -d --build`（或 `bash scripts/dev_full_rebuild.sh`）。
2. 遷移：`docker compose exec -T backend alembic upgrade head || docker compose run --rm backend alembic upgrade head`。
3. 健康：`curl -fsS http://localhost:12005/api/healthz | jq .`（DB/Redis/模式）。
4. CDN：`echo hello > uploads/public/hello.txt && curl -fsS http://localhost:${CDN_PORT:-12002}/hello.txt`。
5. 報表：`/api/report` 回傳 `delivery=discord`（需正確設定 `DISCORD_REPORT_WEBHOOK`）。
6. 後台：以最高權限登入 `/auth` → `/admin` 可見待審佇列；審核操作可成功。

### 已知限制與後續（Day 10）
- 來源篩選尚未加到後台 UI/查詢參數（僅資料有欄位）：Day 10 補 UI 與 API。
- `/api/progress` 的「項目進度」需維護 `# 開發進度` 清單：已於 Codex.md 補模板。
- WebSocket 房間化與連線監控待 Day 10 展開。

---

## Day 10 — 審核體驗強化與即時監看
日期：2025-08-22  
時數：約 6 小時  
狀態：已完成

### 需求
- 審核流程不要分開操作媒體與文章，統一「一起審」。
- 待審媒體（pending）在後台可直接預覽（圖片/影片）。
- 增加聊天室監看與管控能力（清空、匯出、搜尋）。
- 全站錯誤視圖設計化，改善失敗時體驗。
- 發文最小字數規則移至後台設定（with‑media 可略過）。

### 達成情況
- 一起審：
  - 核准文章 → 同步核准該文所有媒體並移至 `public/`，寫入審核日誌。
  - 退件文章 → 同步退件所有媒體，嘗試刪除已公開檔案，避免遺留。
- 後台媒體預覽：
  - 新增管理端保護預覽 API：`GET /api/moderation/media/:id/file`，支援 `pending/` 與 `public/` 檔案回傳。
  - 後台列表與詳情滑出面板可直接預覽（pending 走帶授權的 blob，public 走 `/uploads/public/...`）。
- 聊天室監看（/admin/rooms）：
  - 房間搜尋、清空訊息（`POST /api/rooms/:room/clear`）、匯出 CSV（room/client_id/ts/message）、可選每 5 秒自動刷新。
- 設計化錯誤頁：
  - 新增 `ErrorPage` 元件，統一套用於路由錯誤、貼文詳情、後台頁面、未登入發文頁。
- 規則設定：
  - /mode 新增「發文內容規則」區塊：`enforce_min_post_chars`、`min_post_chars` 可保存。
  - 純文字發文依規則檢查；with‑media 路由可略過最小字數（但仍走 sanitize 與安全檢查）。

### 影響面
- 後端：moderation 路由（文章核准/退件同步處理媒體）、新增媒體預覽與清空房間 API、mode 讀寫增加內容規則欄位。
- 前端：GeneralAdminPage 增加預覽與詳情導覽；AdminRoomsPage 新增搜尋/清空/匯出；ErrorPage 套用多處；PostForm 有附件時不再前端卡字數（交由後端統一）。
- Nginx：主站反代 `/uploads/` → `cdn`，public 媒體以同網域服務；避免 pending 被直接公開。

### 驗收
- 後台可直接預覽待審媒體；核准文章即公開媒體；退件文章清理已公開檔案。
- /admin/rooms 可搜尋、清空並匯出訊息；錯誤頁面顯示一致、可讀性佳。
- /mode 可保存最小字數規則；純文字短於閥值會被阻擋，有附件可送出。
