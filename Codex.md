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

完成 - 內容審核系統 - 待審佇列、核准/退件、審核日誌與 CSV 匯出
完成 - 安全強化 - 限流/封鎖、上傳魔數嗅探、安全標頭與 CSP
完成 - 模式管理 - Normal/Maintenance/Development/Test 與 /mode 管理頁
開發中 - 一般管理詳情 - 單筆詳情面板（全文/媒體）與更多快捷鍵
規劃中 - 來源篩選 - 依 client_id、ip 快速篩選風控報表

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

## 現況快照（2025-08-21）

已完成（重點）：
- 主題系統：支援「跟隨系統」、減少動態偏好、`color-scheme` 標頭。
- 行動版易用性：修正「更多」選單文字不可見；健康檢查在小螢幕自動換行。
- 模式管理：四模式 Normal / Maintenance / Development / Test；Test＝管理員看正常、其他人看開發頁；移除舊 `dev` 值。
- 發文審核流：新貼文預設 pending，僅 admin 核准後公開；未登入可匿名發文（`X-Client-Id` → `anon_*`）。
- 私有狀態顯示：發文者本機卡片右下角顯示「送審中/發布時間」，他人不可見；支援複製貼文連結（桌機按鈕、手機長按）。
- 安全強化：限流（Redis/單機）、全域大小限制、上傳副檔名白名單 + 魔數嗅探、安全標頭 + CSP + HSTS（可設定）、CORS 白名單。
- 反濫用：連續被限流達閾值自動封鎖 IP（451），強制送出稽核報告 `/api/audit_report` 後解封。
- 一般管理頁（暫版）：
  - 待審貼文/媒體清單、單筆/批次核准/退件、關鍵字 + 日期篩選、鍵盤快捷鍵（j/k/a/r）。
  - 媒體預覽（pending 圖片/影片）。
  - 封鎖中 IP 列表（Redis）＋一鍵解除；近期稽核報告顯示。
  - 審核日誌列表 + 匯出 CSV。

文件與 CI：
- README 安全章節與環境變數補齊、CI 工作流 `.github/workflows/security.yml`（Bandit/Flake8/pip-audit）。

限制與後續：
- 來源 IP/ClientId 篩選：目前後端未存來源欄位（僅稽核/封鎖模組掌握 IP）。若要支援，需擴增 Post/Media 來源欄位與寫入流程。
- 稽核報告目前寫入 JSONL（`uploads/audit_reports.jsonl`），日後可換 DB 或整合 Discord/Jira。
- 單機限流/封鎖有記憶體型紀錄限制，強烈建議正式環境設置 `REDIS_URL`。

---

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
- 「在 Post/Media 模型加入 client_id、ip 欄位，並於建立時寫入；更新 queue 與管理頁支援來源篩選。」
- 「將一般管理頁加入單筆詳情滑出面板，含全文與媒體預覽，並新增快捷鍵。」
- 「把稽核報告改為存 DB 並加入狀態欄位，提供後台列表與篩選。」
- 「對 /api/posts/* 路徑在 Nginx 加更嚴限流，並更新 README。」
- 「將 CI 的 Bandit/Flake8/pip-audit 設為必須通過，並修正現有警告。」

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
- 前端：`frontend/src/pages/GeneralAdminPage.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/http.ts`
- 後端：`backend/routes/routes_posts.py`, `backend/routes/routes_moderation.py`, `backend/routes/routes_abuse.py`, `backend/utils/ratelimit.py`, `backend/app.py`

小提醒
- 正式環境請設定 `REDIS_URL` 啟用一致限流與封鎖管理。
- 若啟用 HSTS，請確認為 HTTPS 與子網域策略。
- 匿名流量建議加總體風控（黑名單、指紋綁定、行為模型）。
