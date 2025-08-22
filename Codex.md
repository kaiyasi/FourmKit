# Codex 協作手冊（工作習慣與紀錄）

本文件用來：
- 記錄平時對 Codex 的使用偏好與提示語（prompt）。
- 保留每次開發的關鍵決策與修改摘要，減少重複對齊成本。
- 提供快速的查找索引（路徑、腳本、慣例）。

---

## 偏好與提示語
- 語言風格：幽默風趣的繁體中文，口吻輕鬆但精準。
- 回覆長度：預設精煉（除非主動要求詳述）。
- 命名慣例：沿用現有專案風格；新檔使用 kebab-case（文件）或現有前端目錄慣例（TSX/TS）。
- 互動習慣：
  - 先描述要做的事，再批次執行（建立共同上下文）。
  - 重要變更前提出選項與影響，避免驚喜工程。
  - 盡量以最小變更達成需求，避免牽動太多無關檔案。

建議常用提示（可複製貼上）：
- 「使用幽默風趣的繁體中文與我對話。」
- 「在修改前先列計畫；變更後給出差異摘要。」
- 「對前端錯誤訊息進行集中化與本地化優化。」
- 「行動版介面優化為重點（安全區、可及性、可點範圍）。」

---

## 開發進度

完成 - 內容審核系統 - 待審佇列、核准/退件、審核日誌與 CSV 匯出（文章+媒體一起審）
完成 - 安全強化 - 限流/封鎖、上傳魔數嗅探、安全標頭與 CSP
完成 - 模式管理 - Normal/Maintenance/Development/Test 與 /mode 管理頁（含發文字數規則）
完成 - 即時互動監看 - 房間列表/在線/清空/匯出/搜尋（/admin/rooms）
開發中 - 後台詳情體驗 - 單筆詳情面板（全文/媒體）、上一/下一筆導覽與快捷鍵
規劃中 - 圖片縮圖與掃描 - 多尺寸縮圖、ClamAV 掃描與前端載入優化

---

## 專案快速索引（核心路徑）
- 前端根：`frontend/`
  - API 包裝：`frontend/src/services/api.ts`
  - HTTP 包裝與錯誤：`frontend/src/lib/http.ts`
  - 錯誤訊息工具：`frontend/src/utils/errors.ts`
  - 主要佈局：`frontend/src/App.tsx`
  - 導覽列（桌面）：`frontend/src/components/layout/NavBar.tsx`
  - 導覽列（行動）：`frontend/src/components/layout/MobileFabNav.tsx`
- 路由錯誤頁：`frontend/src/components/ui/RouteError.tsx`
  - 一般管理頁（暫時版）：`frontend/src/pages/GeneralAdminPage.tsx`
  - 模式管理頁：`frontend/src/pages/ModePage.tsx`
  - 主題工具：`frontend/src/components/ui/ThemeToggle.tsx`, `frontend/src/lib/theme.ts`

後端根：`backend/`
  - Flask App 入口：`backend/app.py`
  - 模式 API：`backend/routes/routes_mode.py`
  - 發文/上傳 API：`backend/routes/routes_posts.py`
  - 審核 API：`backend/routes/routes_moderation.py`
  - 濫用/封鎖與稽核 API：`backend/routes/routes_abuse.py`
  - 限流與封鎖：`backend/utils/ratelimit.py`
  - 內容清洗：`backend/utils/sanitize.py`
  - 上傳驗證：`backend/utils/upload_validation.py`
  - 資料模型：`backend/models/*`

---

## 現況快照（Day 9）

本輪重點（精簡）：
- 基建與上線：新增 `cdn` 服務（Nginx）提供 `uploads/public/`（預設埠 12002，`CDN_PORT` 可覆寫）；README 補 Port 表與驗證步驟。
- 遷移穩定：Alembic `create_table` 以 SAVEPOINT 包裹，避免舊表導致交易中毒；新增 `posts/media` 的 `client_id`/`ip` 欄位。
- 權限對齊：審核佇列允許 admin/dev_admin/campus_admin/cross_admin/moderator 類查看；核准/退件/日誌限各類 admin。
- 體驗一致：Navbar 統一圖標＋文字；ModePage 加返回鍵；全域輸入框（input/textarea/select）隨主題樣式；HTTP 包裝相容 data/直傳兩種回傳。
- 進度頁：`/api/progress` 解析接受「# 開發進度 / # 開發紀錄」（容忍 `#` 後空白），找不到則以 DEVELOPMENT_RECORD.md 備援抽取更新。
- Webhook：映射 `DISCORD_THEME_WEBHOOK`、`DISCORD_REPORT_WEBHOOK` 至容器（delivery=discord/local_only 透明回報）。
- 運維：`dev_full_rebuild.sh` / `prod_maintenance_restart.sh` 等候就緒＋遷移 fallback；新增 `scripts/diagnose_502.sh`。

已知後續：
- 後台加入來源篩選（client_id/ip）；稽核報告改 DB 與狀態欄位；WebSocket 房間化與連線監控（Day 10）。
- 建議正式環境設 `REDIS_URL`；CDN 埠衝突時用 `.env` 設 `CDN_PORT` 變更。

---

## 現況快照（Day 10）

本輪重點（精簡）：
- 審核一起審：核准文章時自動核准整篇媒體並移至 `uploads/public/`；退件文章時同步退件媒體並嘗試刪除已公開檔。
- 後台媒體預覽：新增保護預覽 API（支援 pending/public），管理頁以帶授權 blob 顯示，不受瀏覽器 `<img>/<video>` 限制。
- 即時監看：新增 `/admin/rooms`（房間搜尋、清空 backlog、匯出 CSV、可選 5 秒自動刷新）。
- 錯誤體驗：統一 ErrorPage（路由/詳情/後台/未登入發文），錯誤狀態視覺一致。
- 規則設定：/mode 增加「發文內容規則」開關與字數設定；with‑media 可略過最小字數（仍保留安全檢查）。
- Nginx：主站反代 `/uploads/` → cdn 容器；pending 媒體僅透過後台 API 預覽。

已知後續：
- 列表封面：最新貼文卡片封面/張數徽章可於 Day 11 與縮圖一併實作。
- 後台詳情：媒體資訊徽章、預覽 skeleton/重試、面板內 j/k 導覽可加強。

## 風格與可及性指引（行動）
- 觸控目標：最小 44×44 px。
- 色彩對比：至少 4.5:1 於主要文字／圖示。
- 安全區：使用 `env(safe-area-inset-*)` 以適配瀏海與底部手勢列。
- 高亮規則：當前路由以字重、底線或背景微強調顯示。

---

## 變更紀錄模板（未來複製使用）
- 需求：
- 範圍：
- 設計決策：
- 影響面：
- 變更檔案：
- 風險與回滾：

> 更新規則：每次合併實作後，追加一則紀錄，保持精簡但可追溯。

---

## 開啟新一輪開發對話（快捷）

在終端輸入：

1) `read Code.md` 開啟「本次開發引導」檔，裡面有建議下一步與快捷提示語。
2) 接著直接輸入你的需求或從 Code.md 的「建議提示」複製貼上即可。

---

## 建議提示語（可直接複製貼上）
- Day 11：
  - 「建立縮圖服務與多尺寸產生，前端列表優先載入縮圖；影片封面與多媒體徽章。」
  - 「上傳流程加入 ClamAV 掃描與隔離，檔案通過後再發佈到 public。」
- Day 12：
  - 「新增平台設定頁（/settings/admin），整合發文字數/CSP/限流等設定與文件連結。」
  - 「使用者清單/搜尋、角色調整、封禁與解封、登入限速/嘗試鎖定。」
- Day 13：
  - 「串接 Discord/IG 自動發文：佇列、退避重試、手動重送，後台開關與日誌。」
  - 「API 錯誤統一與健康檢查/告警鈎子、README 維運補充。」

---

## 開發引導（本輪迭代）

這份章節整合自原 Code.md：快速開啟下一輪開發對話的導覽。

現況總結（重點）
- 模式：Normal / Maintenance / Development / Test（移除舊 dev）。
- 內容審核：發文預設 pending，僅 admin 核准才公開；未登入可匿名發文（X-Client-Id → anon_*）。
- 安全：限流（Redis/單機）、大小/字數限制、上傳魔數嗅探、安全標頭+CSP、IP 連續超限自動封鎖→稽核報告解封。
- 前端體驗：主題跟隨系統、行動版修復與健康檢查視覺優化；貼文卡片右下角僅本人顯示「送審中/時間」。
- 後台（暫版）：`/admin` 待審清單、批次審核、快捷鍵、媒體預覽、封鎖IP列表/解封、稽核報告、審核日誌匯出。

推薦下一步
- 來源追蹤：在 Post/Media 寫入 `client_id`/`ip`，管理頁支援來源篩選。
- 審核詳情頁：單筆全文/媒體預覽與快捷鍵；批次工具列。
- 稽核後台：稽核報告列表與狀態（open/closed），整合封鎖清單。
- Nginx 層限流：/api/posts/* 更嚴格，Access log 結構化。
- 依賴安全掃描：CI 警示改為必須通過；加 Snyk/Trivy（選配）。

建議提示語（複製貼上就能用）
- 「在 Post/Media 模型加入 client_id、ip 欄位，並於建立時寫入；更新 queue 與管理頁支援來源篩選。」
- 「將一般管理頁加入單筆詳情滑出面板，含全文與媒體預覽，並新增快捷鍵。」
- 「把稽核報告改為存 DB 並加入狀態欄位，提供後台列表與篩選。」
- 「對 /api/posts/* 路徑在 Nginx 加更嚴限流，並更新 README。」
- 「將 CI 的 Bandit/Flake8/pip-audit 設為必須通過，並修正現有警告。」

重要路徑速查
- 前端：
  - 一般管理：`frontend/src/pages/GeneralAdminPage.tsx`
  - 監看頁：`frontend/src/pages/AdminRoomsPage.tsx`
  - 錯誤頁：`frontend/src/components/ui/ErrorPage.tsx`, `frontend/src/components/ui/RouteError.tsx`
  - 應用與 HTTP：`frontend/src/App.tsx`, `frontend/src/lib/http.ts`
- 後端：
  - 發文/上傳：`backend/routes/routes_posts.py`
  - 審核/預覽：`backend/routes/routes_moderation.py`
  - 監看/清空：`backend/app.py`（/api/rooms/*）
  - 安全/限流：`backend/routes/routes_abuse.py`, `backend/utils/ratelimit.py`
  - 模式設定：`backend/routes/routes_mode.py`

小提醒
- 正式環境請設定 `REDIS_URL` 啟用一致限流與封鎖管理。
- 若啟用 HSTS，請確認為 HTTPS 與子網域策略。
- 匿名流量建議加總體風控（黑名單、指紋綁定、行為模型）。
