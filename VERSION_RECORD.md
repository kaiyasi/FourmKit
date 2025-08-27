# ForumKit Version Record

> **Serelix Studio 校園匿名討論平台更新日誌**

---

## 版本號規則（Semantic Versioning）

* **主版本號 (Major)**：重大功能或架構變動，可能造成相容性斷裂。
* **次版本號 (Minor)**：新增功能或重要優化，不影響原功能使用。
* **修訂號 (Patch)**：小修正或漏洞補丁，僅影響細節或 bug。

例如 **V1.0.0**：

* `1`：第一次正式公開的大版本
* `0`：目前還沒加入新功能
* `0`：目前還沒修正小 bug

---

## 最新版本（現行：V1.1.0）

### 主要特性

* **完整匿名討論系統**：支援匿名發文、留言、即時互動
* **智慧內容審核**：AI 輔助 + 人工審核雙重把關
* **多校園支援**：Google OAuth 校園帳號驗證，支援跨校討論
* **即時通訊**：Flask-SocketIO 實時更新，Heartbeat 心跳監控
* **媒體安全**：pending/public 兩階段存儲，CDN 整合，副檔名/大小限制
* **主題系統**：多種內建主題 + 自訂主題設計工具（行動版/桌面版一致）
* **Discord 整合**：Webhook / Bot / Both 模式，回報、主題提案、公告、學校入駐通知
* **行動體驗**：統一 MobileBottomNav、安全區域留白、學校切換、觸控優化

### 安全性

* **權限管理**：分級權限（開發者、校園管理員、審核員、用戶）
* **企業級防護**：CORS 限制、CSP、HSTS、速率限制、自動封鎖
* **資料保護**：JWT 認證、輸入驗證、SQL 注入防護、內容清洗
* **隱私工具**：使用者亂碼 ID（HMAC），支援複製；個人 webhook 綁定

### 管理功能

* **內容審核**：pending → approved/rejected，審核日誌追蹤、批次操作
* **刪文請求審核**：API 查詢/核准/拒絕
* **用戶管理**：帳號、角色、違規處理
* **學校管理**：多校設定、統計分析、校徽上傳
* **系統監控**：健康檢查 `/api/healthz`、整合狀態 `/api/status/integrations`、錯誤追蹤

### 技術架構

* **前端**：React 18 + TypeScript + Tailwind CSS
* **後端**：Flask + SQLAlchemy + Socket.IO
* **資料庫**：PostgreSQL + Redis
* **部署**：Docker Compose + Nginx（HTTPS/CDN/健康檢查整合）

### 運維/部署

* 一鍵重建/維護腳本
* Docker Compose 健康檢查與依賴管理
* 外部 Nginx 反代、CDN 配置
* FAQ/排查/安全環境變數文件

---

## 版本歷史

### V1.0.0（初始公開版）

* 匿名討論、留言、媒體上傳
* 完整審核流程（pending → approved/rejected）
* 權限分級（admin/moderator/user）
* JWT 認證 + Flask-SocketIO 即時互動
* Google OAuth（僅限 .edu 網域）
* Docker 一鍵部署 + 運維腳本
* API 文件、常見問題、MIT 授權條款

### V1.1.0（現行）

* **Discord/IG/Webhook 整合**：事件型別、投遞模式、Redis 佇列
* **前端主題設計器**：支援 webhook 提交
* **刪文請求審核 API**
* **健康檢查與狀態 API**
* **安全性強化**：速率限制封鎖、內容清洗、CSP/HSTS
* **行動體驗優化**：統一 UI、學校切換、MobileBottomNav
* **Webhook 自綁功能**：用戶可綁定個人 webhook，選擇推送類型（新貼文/留言/公告）
* **新增環境變數**：`ADMIN_NOTIFY_DELIVERY`、`USER_WEBHOOK_FEED_INTERVAL`、`PUBLIC_BASE_URL`、`PUBLIC_CDN_URL`、`APP_BUILD_VERSION`

---

*📅 最後更新：2025-08-27*
*🏢 開發團隊：Serelix Studio*
*📧 技術支援：透過平台內建支援系統*

---
