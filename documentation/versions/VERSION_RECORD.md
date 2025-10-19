# ForumKit Version Record

> **Serelix Studio 校園匿名討論平台更新日誌**

---

## 版本號規則（Semantic Versioning）

* **主版本號 (Major)**：重大功能或架構變動，可能造成相容性斷裂。
* **次版本號 (Minor)**：新增功能或重要優化，不影響原功能使用。
* **修訂號 (Patch)**：小修正或漏洞補丁，僅影響細節或 bug。

---

<<<<<<< Updated upstream
## 最新版本（現行：V3.0.0）
### V3.0.0
*🗓️ 發布日期：2025-10-10*

- 行動端支援中心與管理介面重構：混合式設計、底部 NavBar 遮擋與間距優化、對話紀錄資訊簡化。
- 客服聊天室治理：邀請/移除成員、刪除頻道，並統一端點規格。
- Nginx Permissions-Policy 清空，避免瀏覽器對未支援 features 的警示。
- 修正多處構建/壓縮後錯誤，提高穩定性。

---

## 版本歷史

### 🔒 安全強化 / 反逆向

- Admin / Public 兩套入口：新增 `admin.html`（dev_admin 專用）與 `index.html`（一般使用者）；Nginx 依 `fk_admin=1` cookie 分流。
- 受保護 Admin 資產：`/assets/admin/*` 由 Nginx 反代至後端 `/protected-assets/admin/*`，需 `fk_admin_token` 簽名通過才回檔，未授權 403。
- 反檢視（前端阻嚇）：非管理員阻擋右鍵、F12/Ctrl+Shift+I/J/C、開啟 DevTools 顯示「安全提醒」。dev_admin 自動豁免（localStorage 角色 / JWT 角色 / 管理員 cookie 任一命中），登入後動態解除；保留緊急豁免開關 `FK_ANTI_INSPECT_EXEMPT=1`。
- 掃描/爆破防護：在 `app.before_request` 攔截常見探測路徑（/.env, /wp-*, *.php…）→ 回 451/SECURITY_WARNING 並記一次 strike 以進入處罰流程。

### 🛡️ 濫用對抗 / 速限

- 兩段式處罰：第一次觸發速限 → 回 `CAPTCHA_REQUIRED`；再次觸發 → 暫封 IP（TTL），事件紀錄；dev_admin/admin 豁免。
- 24 小時多 IP 移動偵測：`USER_IP_24H_LIMIT`（預設 5），超過回 429/`TOO_MANY_IPS`。
- 多鍵限流：在登入與發文路由疊加 `user + client + ip` rate limit，VPN 切換 IP 也無法繞過；支援 `CF-Connecting-IP` 取得真實來源 IP。
- Admin 解除封鎖：`/api/admin/users/unblock-ip` 預設「解除該使用者所有曾出現過的 IP」，亦可指定 `ip` 或 `all:false` 僅解最近。

### 🧩 Nginx / CDN 修正

- `/uploads` → CDN 反代修復：移除前綴 `/uploads` 再轉發至 CDN；解決 `cross.png` 404。
- Logo 發佈路徑對齊：`logo_handler` 的一般 Logo 發佈子目錄調整到 `public/logos/{category}`，與 `/uploads/public/...` 路徑一致。

### 🖥️ 前端體驗

- `/boards` 列表新增「圖片附件」綠色標籤（桌機＋手機），影片則顯示紅色「影片」標記。
- 手機發文頁重整：沿用桌機首頁風格，頁首主副標為「ForumKit / Post IDEA」，編輯卡片化、保留行動底部送出列。

### ⚙️ 新／調整環境變數

- CAPTCHA：`CAPTCHA_PROVIDER`(turnstile|hcaptcha|dummy), `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`, `CAPTCHA_VERIFY_TIMEOUT`
- 濫用控制：`IP_CAPTCHA_STRIKES_THRESHOLD`(預設1), `IP_BLOCK_STRIKES_THRESHOLD`(預設2), `IP_CAPTCHA_TTL_SECONDS`(預設900), `IP_STRIKE_TTL_SECONDS`(預設1800), `USER_IP_24H_LIMIT`(預設5)
- 安全防護：`SECURITY_PROBE_GUARD`(預設1)
- Admin 分流/資產：`ADMIN_ASSET_COOKIE_MAXAGE`(預設1800), `FRONTEND_DIST_ROOT`(後端讀取 dist 用)

### 🔄 升級指引

1) 前端：`npm run build`（已調整 Vite 多入口與 admin chunk 輸出）
2) Docker：`docker compose build backend nginx && docker compose up -d backend nginx`
3) 設定 CAPTCHA 與安全相關環境變數（至少 provider/secret/sitekey）
4) 檢查 Nginx 設定生效：`/assets/admin/*` 透過後端保護、`/` 分流至 admin/index
=======
## 最新版本（現行：V3.1.0）
### V3.1.0
*🗓️ 發布日期：2025-10-11*

- 留言監控統計強化：後端 /api/admin/comments/stats 新增 `warning`（警告數）；前端監控頁新增「警告」統計卡與型別欄位，支援 `warned=1` 篩選。
- 支援工單詳情一致化：
  - 桌面版改用訪客風格樣式；手機版沿用 Mobile 模板。
  - 資訊列統一為「分類／提交者／建立時間」，移除「經手人」與「優先級」。
  - 訊息泡泡行距更緊湊；回覆框預設單行、輸入自動增高，與發送鈕高度一致。
- 設定頁精簡與修正：
  - 頭像 URL 統一以 `/uploads/` 前綴處理相對路徑，避免出現 `public/avatars/...`。
  - 移除「個人卡片」區塊與「保存個人卡片到 CDN」按鈕；上傳輸入框寬度與卡片一致並保留安全間距。
- 管理員聊天室（手機）投票：新增投票卡片渲染與投票操作（顯示選項、票數/百分比、我已投、總票數、到期時間；整合 `/api/admin/chat/votes/{id}/cast`）。
- 修正：補齊 `SupportPage.tsx` 的 `User` 圖示匯入以解決 `ReferenceError: User is not defined`。
>>>>>>> Stashed changes

---

## 版本歷史

### V3.0.0
*🗓️ 發布日期：2025-10-10*

- 行動端支援中心與管理介面重構：混合式設計、底部 NavBar 遮擋與間距優化、對話紀錄資訊簡化。
- 客服聊天室治理：邀請/移除成員、刪除頻道，並統一端點規格。
- Nginx Permissions-Policy 清空，避免瀏覽器對未支援 features 的警示。
- 修正多處構建/壓縮後錯誤，提高穩定性。
- 更新 React 至 18.2.0，解決部分相容性問題。

### V2.2.0

*🗓️ 發布日期：2025-09-24*

重大模板系統重構版本。完全移除硬編碼模板參數，實現純資料庫驅動的 Instagram 發布系統，修復時間戳顯示問題，並建立統一的圖片渲染架構。此版本解決了模板系統的根本性問題，確保所有配置都來自資料庫而非程式碼預設值。

### 🔥 重大變更

* **📦 模板系統完全重構**
  * **移除所有硬編碼預設值** - `TemplateConfig` 類別不再提供任何預設參數
  * **純資料庫驅動** - 所有模板配置必須來自資料庫 IGTemplate 記錄
  * **統一渲染架構** - IG 發布和手機預覽使用相同的 `unified_post_renderer`
  * **嚴格參數驗證** - 缺少必要參數時直接報錯，不再提供回退值

* **🕒 時間戳系統修復**
  * **UTC+8 時區正確顯示** - 修復 am/pm 格式仍顯示 UTC+0 的問題
  * **時區轉換完善** - 所有 `datetime.now()` 調用都使用 Asia/Taipei 時區
  * **格式化邏輯統一** - 確保所有時間戳都經過正確的時區轉換

### 🛠️ 技術改進

* **🎨 渲染系統統一**
  * **configuration path 修正** - 從 `image.cards` 改為讀取 `post.metadata` 配置
  * **重複渲染消除** - 移除舊的 overlay 邏輯，避免時間戳/貼文ID重複顯示
  * **語法錯誤修復** - 修復 `content_generator.py` 中的孤立 except 語句

* **🔧 系統穩定性**
  * **容器重啟優化** - 修復語法錯誤後正確重建 backend 容器
  * **錯誤處理改進** - 移除錯誤的 try-except 結構，確保程式正常運行

### 📋 自動偵測機制說明

* **貼文自動偵測邏輯**
  * 需要貼文狀態為 `approved`
  * 需要對應學校的活躍 Instagram 帳號
  * 基於 `school_id` 進行自動匹配
  * 符合條件的貼文會自動加入發布佇列

---

### V2.1.2

*🗓️ 發布日期：2025-09-20*

專注於「Instagram 模板系統修復」與「前端體驗優化」的緊急修復版本。解決了 Instagram 自動發布的模板配置問題，修復了前端 JavaScript 錯誤，並針對管理功能進行了體驗優化。

#### 主要修復

* **📸 Instagram 模板系統完全修復**
  * **模板優先級問題修復** - 解決 multipost 配置覆蓋 caption 模板的核心問題
  * **圖片生成元素修復** - LOGO、時間戳、貼文 ID 元素全部啟用並正確顯示
  * **CDN 配置修復** - 解決環境變數未載入導致的 CDN 上傳失敗
  * **模板配置清理** - 移除衝突的 multipost 配置，確保 caption 模板正確套用

* **🛠️ 前端 JavaScript 錯誤修復**
  * **heroLoaded 未定義錯誤修復** - 修正變數作用域問題
  * **Home Hero 區塊還原** - 從動態載入改回固定格式，提升穩定性
  * **管理頁面增強** - 新增 home-hero 編輯選項到管理後台

#### 技術改進

* **🔧 ContentGenerator 重寫**
  * 完全重寫 `_generate_caption` 方法，僅使用 caption 配置
  * 移除 multipost 配置干擾，確保模板格式正確套用
  * 修復模板合併邏輯：`config = {**caption_config, **multipost_config}` → 僅使用 caption

* **📦 環境變數管理優化**
  * 所有 Python 腳本統一載入 `.env` 檔案
  * 確保 `PUBLIC_CDN_URL` 等關鍵配置正確載入

#### 修正的具體問題

* Instagram 貼文模板從 `##044\n{content}\n---` 修正為 `📝 {content}\n\n#校園生活 #{school_name}`
* 圖片生成正確顯示 LOGO、時間戳、貼文 ID 元素
* 前端 ReferenceError: heroLoaded is not defined 完全解決
* Admin 頁面新增 home-hero 編輯功能
* CDN 上傳失敗問題完全修復

---

### V2.1.1

*🗓️ 發布日期：2025-09-18*

以「主畫面體驗」與「設計一致性」為核心的調整版。重點聚焦 Hero/Composer 體驗、權限規則、版面自適應與 Token 管理工具的主題對齊。

### 主要特性

* **🖼️ 首頁 Hero + Composer 重設計**
  * Hero = Title(Playfair Display) + Slogan(Monsieur La Doulaise)，字級依裝置自適應。
  * Composer（首頁專用款）：發佈範圍 + Segmented Tabs（一般/公告/廣告）、自動伸縮文字框（3–10 行）、2×2 縮圖、字數統計、行動端底部固定送出列。
  * 上傳區與輸入框統一透明背景、主題化邊框/hover/focus 樣式。

* **👮 權限與規則（首頁發文）**
  * 非管理者：隱藏 Tabs，僅一般貼文。
  * campus_admin：公告僅能「學校」；範圍固定自己的學校。
  * cross_admin：公告僅能「跨校」；範圍固定跨校。
  * dev_admin：公告類型隨發佈範圍同步（跨校→cross、指定學校→school）；廣告僅 dev_admin 可見。

* **🧭 版面自適應與無捲動**
  * 首頁使用 min-h: 100dvh + overflow hidden；量測 Hero 高度與視窗高度，計算 paddingTop，讓「發文卡上緣 ≈ 視窗中線」。
  * 在可視高度不足時，動態縮放 Hero（手機最小 0.8、桌機 0.85），避免出現捲動條。

* **🗂️ Token 管理工具主題化**
  * 參考「內容審核」的設計語言，統一 PageLayout、字體階層、按鈕（btn-primary/ghost）與卡片（bg-surface/border-border/shadow-soft）。

* **🔤 字體與 CSP**
  * 於 index.html 加入 Google Fonts 預連線與載入（Playfair/Monsieur），並加入 ALLOW_GOOGLE_FONTS 控制項以放行 CSP。

### 修正與最佳化

* **📦 API 與相容性**
  * MobilePostList 學校清單端點修正為 `/api/schools`（移除 `/list`）。
  * 貼文列表 500 容錯：若校別查詢失敗，自動回退跨校。

* **🧱 後端資料欄位**
  * 新增 `posts.reply_to_post_id`，支援 `#<id>` 語法「回覆為新貼文」；請執行 Alembic 升級。

* **🎛️ UI 細節**
  * Tabs/Select 高度統一為 32px（select-compact），透明背景與膠囊形外觀。
  * 上傳區 Dropzone 改透明，拖曳高亮與主題化邊框。

---

### V2.0.0
*🗓️ 發布日期：2025-09-16*

此版本正式推出了完整的 Instagram 自動化內容發布系統，是對 V1.6.x 系列功能的整合與最終實現。

#### 主要特性

* **📸 Instagram 自動化發布系統**：
  * **支援輪播（Carousel）貼文**：可將多張獨立貼文圖片聚合成一則輪播貼文。
  * **自動化發布管道**：基於 Redis 佇列，由 `forumkit` 核心模組驅動，實現事件驅動與排程發布。
  * **手動權杖配置**：依賴管理員手動配置長期有效的存取權杖。
  * **狀態監控與修復**：提供管理後台追蹤發布日誌，並包含 `fix_carousel_groups.py` 等維護工具。

#### 技術架構

* **核心模組**：正式啟用 `forumkit` 獨立套件，其中 `pipeline.py` 和 `page_poster.py` 封裝了所有發布邏輯。
* **API 流程**：實現了輪播發布所需的多步驟 API 呼叫（上傳子項目、建立容器、發布容器）。

#### 管理與維護

* **管理功能**：管理後台提供發布日誌檢視、手動觸發與重發功能。
* **維護工具**：提供 `fix_carousel_groups.py` 腳本用於診斷和修復卡住的輪播任務。

---

### V1.6.1
*🗓️ 發布日期：2025-09-13*

* **📦 ForumKit 核心模組建立**
  * **新增獨立 ForumKit 模組** - 建立 `forumkit/` 套件，提供核心功能抽象層
  * **Socket 通訊核心** - `server.py` 和 `client.py` 實現高效能 Socket 通訊機制
  * **管道處理系統** - `pipeline.py` 提供資料處理管道，支援 Facebook/Instagram 發布流程
  * **頁面發布器** - `page_poster.py` 整合 Facebook Page API，支援自動內容發布

* **🔧 技術架構優化**
  * **模組化重構** - 將核心功能從主應用分離，提升代碼可維護性和重用性
  * **統一錯誤處理** - 完善的異常捕獲和錯誤日誌記錄機制
  * **配置管理改進** - 環境變數統一管理，支援開發和生產環境切換
  * **Socket 連接池** - 高效能的連接管理，支援併發請求處理

* **📸 Instagram 發布系統穩定性提升**
  * **發布服務改進** - platform_publishers 和 instagram_page_publisher 穩定性增強
  * **內容處理優化** - 圖片處理和模板系統性能提升
  * **錯誤恢復機制** - 發布失敗時的自動重試和錯誤追蹤
  * **監控和日誌** - 詳細的發布狀態記錄和性能監控

---

### V1.6.0
*🗓️ 發布日期：2025-09-06*

* **📸 Instagram 模板前置設定作業**
  * **Google Fonts 直接整合** - 動態字體載入機制，支援多語系字體
  * **HTML 轉圖片引擎** - 模板化建構器，支援響應式畫布設計
  * **中文字體渲染優化** - 完美解決中文亂碼問題
  * **四重字體回退機制** - 遠端字體 → Google Fonts → 本地字體 → 系統字體

* **🔧 技術架構改進**
  * **字體安全控制機制** - 主機白名單、檔案大小限制、HTTPS 強制驗證
  * **智慧記憶體管理** - 字體和圖片資源快取，定期清理機制
  * **完整測試驗證系統** - 字體系統測試、圖片生成測試、視覺效果驗證
  * **環境變數控制** - `IG_CANVAS_SIZE`、`FONT_ALLOWED_HOSTS` 等靈活配置

---

### V1.5.0
*🗓️ 發布日期：2025-09-03*

* **📋 版本記錄系統**
  * **統一的版本追蹤機制**
  * 詳細的升級指南
  * 變更歷史記錄
  * 版本比較功能

* **🛠️ 系統優化**
  * 多資料庫系統穩定性提升
  * 資料庫連接池優化
  * 自動備份機制改善
  * 文檔系統完善

* **📊 監控改善**
  * 資料庫健康檢查增強
  * 系統狀態監控優化
  * 錯誤追蹤改進
  * 性能指標追蹤

---

### V1.4.0
*🗓️ 發布日期：2025-09-03*

* **🗑️ Instagram 服務移除**
  * **完全移除 Instagram 相關功能和程式碼**
  * 移除 `routes/routes_cdn.py` 中的 Instagram 預覽路由
  * 移除 `utils/sanitize.py` 中的 Instagram 特定註解
  * 更新 `check_db_state.py` 和 `update_to_latest.py`
  * 清理 `app.py` 中的 Instagram 註解

* **🏗️ 多資料庫架構實施**
  * **服務分離的多資料庫系統**
  * 核心功能 (forumkit_core.db)
  * 支援系統 (forumkit_support.db)
  * 聊天室 (forumkit_chat.db)
  * 審核管理 (forumkit_moderation.db)
  * 組織管理 (forumkit_organization.db)

* **📁 文檔結構重整**
  * 重新整理 `documentation/` 資料夾結構
  * 分類至 `features/`, `architecture/`, `guides/`, `versions/`
  * 舊文檔歸檔至 `documentation_archive/`

---

### V1.3.3
*🗓️ 發布日期：2025-09-02*

* **🐛 留言監控 API 錯誤修復**
  * **500 內部伺服器錯誤修復** - 解決留言監控頁面的系統錯誤
  * **跨校查詢邏輯優化** - 修復 NULL 值比較導致的查詢錯誤
  * **學校過濾邏輯改進** - 正確處理 `__ALL__` 參數的過濾邏輯
  * **錯誤處理增強** - 添加詳細的錯誤日誌和堆疊追蹤

---

### V1.3.2
*🗓️ 發布日期：2025-09-01*

* **📱 通知系統響應式設計優化**
  * **小螢幕適配** - 通知中心面板在小螢幕設備上的位置和尺寸調整
  * **NavBar 重疊修復** - 解決通知面板與導航欄重疊的問題
  * **響應式佈局** - 桌面端和移動端不同的顯示策略
  * **觸控優化** - 移動端按鈕大小和間距優化

---

### V1.3.1
*🗓️ 發布日期：2025-08-30*

* **📢 公告通知系統整合**
  * **WebSocket 即時公告推送** - 新公告發布時即時推送到所有在線用戶
  * **公告通知 Hook** - `useAnnouncementNotifications` 整合到前端通知系統
  * **後端公告事件廣播** - `broadcast_announcement` 函數實現 WebSocket 事件推送

---

### V1.3.0
*🗓️ 發布日期：2025-08-29*

* **📸 Instagram 整合系統**
  * **自動化內容發布** - 每 10 篇貼文或每 6 小時自動發布到 Instagram
  * **多校帳號管理** - 總平台 IG 帳號和校園 IG 帳號分離管理
  * **模板編輯系統** - 文字、校徽、背景、時間戳、Caption 模板自訂
  * **發布記錄追蹤** - 完整的發布狀態和錯誤記錄
  * **權杖管理** - 加密儲存、自動刷新、到期提醒

* **🎛️ 管理後台改進**
  * **Instagram 管理頁面** - 帳號管理、發布記錄、統計分析、操作工具
  * **刪文請求快捷卡片** - 顯示待審數量和今日處理數量

---

### V1.2.0
*🗓️ 發布日期：2025-08-28*

* **🚀 重大升級：企業級支援工單系統**
  * **完全重新設計的支援系統** - 從簡單回報升級為完整工單管理平台
  * **雙重身份支援** - 登入用戶和訪客皆可建立、追蹤、回覆工單
  * **智慧工單編號** - SUP-XXXXXX 格式，便於識別和管理
  * **完整狀態機** - open → awaiting_user/admin → resolved → closed → reopened
  * **事件審計系統** - 完整追蹤所有工單操作和狀態變更

---

### V1.1.6
*🗓️ 發布日期：2025-08-28*

* **🎫 全新工單系統**
  * **完整工單生命週期管理** - 從提交到解決的完整追蹤
  * **智慧身份識別碼** - 已登入用戶自動獲得追蹤碼，匿名用戶可用Email追蹤
  * **雙重追蹤機制** - 支援已登入用戶站內查詢 + 未登入用戶追蹤碼查詢

---

### V1.1.5
*🗓️ 發布日期：2025-08-28*

* **重大改進**
  * **移除手機臨時頁功能** - 不再顯示「手機版開發中」頁面
  * **直接導向 boards 頁面** - 手機用戶訪問首頁自動重導向至貼文列表
  * **修復 React Error #300** - 解決手機版 minified React 錯誤

---

### V1.1.4
*🗓️ 發布日期：2025-08-28*

* **錯誤修復**
  * 修復 React Router 相關穩定性問題
  * 解決部分邊界情況的異常處理

---

### V1.1.3
*🗓️ 發布日期：2025-08-27*

* **手機版優化**
  * MobileBottomNav 統一化設計
  * SchoolSwitcher 行動版體驗調整
  * 行動版 UI 一致性大幅提升

---

### V1.1.2
*🗓️ 發布日期：2025-08-27*

* **即時功能增強**
  * 實現用戶在線狀態追蹤
  * 新增線上/離線狀態顯示
  * 即時訊息同步機制優化

---

### V1.1.1
*🗓️ 發布日期：2025-08-27*

* **UI 介面改進**
  * Navbar 改為圖標＋文字設計，提升視覺識別度
  * 新增返回按鈕至模式管理頁面
  * 主題切換功能優化，切換更流暢

---

### V1.1.0

* **Discord/IG/Webhook 整合**：事件型別、投遞模式、Redis 佇列
* **前端主題設計器**：支援 webhook 提交
* **刪文請求審核 API**
* **健康檢查與狀態 API**
* **安全性強化**：速率限制封鎖、內容清洗、CSP/HSTS

---

### V1.0.0

* **匿名討論、留言、媒體上傳**
* **完整審核流程（pending → approved/rejected）**
* **權限分級（admin/moderator/user）**
* **JWT 認證 + Flask-SocketIO 即時互動**
* **Google OAuth（僅限 .edu 網域）**
* **Docker 一鍵部署 + 運維腳本**

---

*📅 最後更新：2025-10-11*
*🏢 開發團隊：Serelix Studio*
*📧 技術支援：透過平台內建支援系統*

---
