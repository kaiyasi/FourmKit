# Instagram 整合系統實作 TODO

**專案代號：** ForumKit IG Integration System
**版本：** V2.2.0
**開始日期：** 2025-09-30
**預計完成：** 2025-10-21（21 天）
**狀態：** 🟡 規劃中

---

## 總覽

### 核心功能
- ✅ 多帳號支援（每校專屬 + 跨校帳號）
- ✅ 自動化發布（即時/批次/排程）
- ✅ 輪播貼文生成（每 10 篇一組）
- ✅ 模板系統（公告/一般）
- ✅ 即時預覽（Pillow 渲染）
- ✅ 字體管理（申請審核機制）
- ✅ 權限控制（Dev Admin / Campus Admin）

### 技術棧
- **後端：** Flask, SQLAlchemy, Celery, Pillow
- **前端：** React, TypeScript, TailwindCSS
- **API：** Instagram Graph API v23.0
- **資料庫：** PostgreSQL

---

## Phase 1: 基礎架構（3 天）

### 1.1 資料模型設計
- [ ] **InstagramAccount 模型**
  - [ ] 基本欄位（school_id, ig_user_id, username）
  - [ ] Token 管理欄位（access_token 加密, expires_at, last_refresh）
  - [ ] 發布模式配置（publish_mode, batch_count, scheduled_times）
  - [ ] 模板綁定（announcement_template_id, general_template_id）
  - [ ] 狀態欄位（is_active, last_publish_at, last_error）
  - [ ] 關聯設定（School 關聯）

- [ ] **IGTemplate 模型**
  - [ ] 基本欄位（template_id, name, description, school_id, template_type）
  - [ ] Canvas 配置（canvas_config JSON）
  - [ ] 文字配置（text_with_attachment, text_without_attachment）
  - [ ] 圖片配置（attachment_config）
  - [ ] Logo/浮水印配置（logo_config, watermark_config）
  - [ ] Caption 配置（caption_template JSON）
  - [ ] 狀態欄位（is_active, usage_count）

- [ ] **InstagramPost 模型**
  - [ ] 基本欄位（public_id, forum_post_id, ig_account_id, template_id）
  - [ ] 渲染結果（rendered_image_cdn_path, rendered_caption）
  - [ ] 輪播資訊（carousel_group_id, carousel_position, carousel_total）
  - [ ] Instagram 資訊（ig_media_id, ig_container_id, ig_permalink）
  - [ ] 狀態管理（status, publish_mode, scheduled_at, published_at）
  - [ ] 錯誤處理（error_message, error_code, retry_count, last_retry_at）

- [ ] **FontFile 模型**
  - [ ] 基本欄位（font_family, display_name, description）
  - [ ] 檔案資訊（filename, file_path, file_size, file_format）
  - [ ] 字體特性（is_chinese_supported, weight, style）
  - [ ] 權限管理（scope, school_id）
  - [ ] 狀態欄位（is_active, usage_count）

- [ ] **FontRequest 模型**
  - [ ] 申請資訊（font_name, font_url, description, reason）
  - [ ] 申請人資訊（requester_id, school_id）
  - [ ] 審核資訊（status, reviewer_id, reviewed_at, review_reason）
  - [ ] 關聯欄位（font_file_id）

**檔案：**
- `backend/models/instagram.py`
- `backend/models/fonts.py`

---

### 1.2 資料庫遷移
- [ ] 創建 Alembic 遷移文件
  - [ ] 創建 `instagram_accounts` 表
  - [ ] 創建 `ig_templates` 表
  - [ ] 創建 `instagram_posts` 表
  - [ ] 創建 `font_files` 表
  - [ ] 創建 `font_requests` 表
  - [ ] 創建索引（public_id, status, carousel_group_id, scheduled_at）
  - [ ] 創建外鍵約束

- [ ] 測試遷移
  - [ ] 執行 `alembic upgrade head`
  - [ ] 驗證表結構
  - [ ] 測試回滾 `alembic downgrade -1`

**檔案：**
- `backend/migrations/versions/2025_10_01_add_instagram_system.py`

---

### 1.3 Token 管理工具
- [ ] **Token 加密/解密**
  - [ ] 使用 `cryptography.fernet` 實作加密
  - [ ] 環境變數管理加密金鑰（`IG_TOKEN_ENCRYPTION_KEY`）
  - [ ] `encrypt_token(token: str) -> str`
  - [ ] `decrypt_token(encrypted: str) -> str`

- [ ] **Token 驗證**
  - [ ] `validate_token(account_id: int) -> bool`
  - [ ] 測試 Instagram API 連線
  - [ ] 記錄驗證結果

- [ ] **Token 自動刷新**
  - [ ] `refresh_token(account_id: int) -> bool`
  - [ ] 呼叫 Instagram API 刷新 Token
  - [ ] 更新資料庫記錄
  - [ ] Celery 定時任務（每天檢查即將過期的 Token）

**檔案：**
- `backend/utils/ig_crypto.py`
- `backend/services/ig_token_manager.py`

---

### 1.4 權限控制系統
- [ ] **權限檢查裝飾器**
  - [ ] `@require_ig_permission(resource_type: str)`
  - [ ] 支援 resource_type: account, template, post, font
  - [ ] Dev Admin 擁有所有權限
  - [ ] Campus Admin 只能操作自己學校的資源

- [ ] **權限檢查函式**
  - [ ] `check_ig_permission(resource_type, resource_id, action) -> bool`
  - [ ] 根據用戶角色與資源歸屬判斷權限

**檔案：**
- `backend/utils/ig_permissions.py`

---

### 1.5 基本 API 骨架
- [ ] **帳號管理 API（骨架）**
  - [ ] `GET /api/admin/ig/accounts` - 列出帳號
  - [ ] `POST /api/admin/ig/accounts` - 創建帳號
  - [ ] `GET /api/admin/ig/accounts/<id>` - 查看帳號
  - [ ] `PUT /api/admin/ig/accounts/<id>` - 更新帳號
  - [ ] `DELETE /api/admin/ig/accounts/<id>` - 刪除帳號

- [ ] **模板管理 API（骨架）**
  - [ ] `GET /api/admin/ig/templates` - 列出模板
  - [ ] `POST /api/admin/ig/templates` - 創建模板
  - [ ] `GET /api/admin/ig/templates/<id>` - 查看模板
  - [ ] `PUT /api/admin/ig/templates/<id>` - 更新模板
  - [ ] `DELETE /api/admin/ig/templates/<id>` - 刪除模板

- [ ] **發布管理 API（骨架）**
  - [ ] `GET /api/admin/ig/posts` - 列出發布記錄
  - [ ] `GET /api/admin/ig/posts/<id>` - 查看發布詳情
  - [ ] `POST /api/admin/ig/posts/<id>/retry` - 重試失敗貼文

**檔案：**
- `backend/routes/routes_ig_accounts.py`
- `backend/routes/routes_ig_templates.py`
- `backend/routes/routes_ig_posts.py`

---

### 1.6 註冊藍圖到 Flask
- [ ] 在 `backend/app.py` 註冊 IG 相關藍圖
  - [ ] `app.register_blueprint(ig_accounts_bp)`
  - [ ] `app.register_blueprint(ig_templates_bp)`
  - [ ] `app.register_blueprint(ig_posts_bp)`

**檔案：**
- `backend/app.py`

---

## Phase 2: 字體管理系統（2 天）

### 2.1 字體申請 API
- [ ] **提交字體申請（Campus Admin）**
  - [ ] `POST /api/admin/ig/fonts/requests`
  - [ ] 驗證申請資料（font_name, reason 必填）
  - [ ] 記錄申請人與學校資訊
  - [ ] 返回申請 ID

- [ ] **查看申請狀態（Campus Admin）**
  - [ ] `GET /api/admin/ig/fonts/requests?school_id={id}`
  - [ ] 過濾只顯示自己學校的申請

- [ ] **列出所有申請（Dev Admin）**
  - [ ] `GET /api/admin/ig/fonts/requests`
  - [ ] 支援 status 過濾（pending, approved, rejected）

**檔案：**
- `backend/routes/routes_ig_fonts.py`

---

### 2.2 字體審核與上傳
- [ ] **審核申請（Dev Admin）**
  - [ ] `POST /api/admin/ig/fonts/requests/<id>/approve`
  - [ ] `POST /api/admin/ig/fonts/requests/<id>/reject`
  - [ ] 更新申請狀態與審核資訊

- [ ] **上傳字體檔案（Dev Admin）**
  - [ ] `POST /api/admin/ig/fonts/upload`
  - [ ] 支援 TTF, OTF, WOFF2 格式
  - [ ] 檔案大小限制：10MB
  - [ ] 存儲至 `/fonts/{font_family}_{timestamp}.{ext}`
  - [ ] 自動檢測中文支援（嘗試渲染測試字元）
  - [ ] 創建 FontFile 記錄

- [ ] **字體存儲服務**
  - [ ] 檔案上傳處理
  - [ ] CDN 路徑管理
  - [ ] 字體檔案驗證

**檔案：**
- `backend/services/font_manager.py`

---

### 2.3 字體列表與權限
- [ ] **列出可用字體（Campus Admin）**
  - [ ] `GET /api/admin/ig/fonts/available`
  - [ ] 返回：全域字體 + 自己學校的字體
  - [ ] 過濾 `is_active=True`

- [ ] **列出所有字體（Dev Admin）**
  - [ ] `GET /api/admin/ig/fonts/all`
  - [ ] 包含使用統計

- [ ] **刪除字體（Dev Admin）**
  - [ ] `DELETE /api/admin/ig/fonts/<id>`
  - [ ] 軟刪除（設為 `is_active=False`）

---

### 2.4 前端字體管理介面
- [ ] **字體申請表單組件**
  - [ ] 字體名稱輸入
  - [ ] 字體來源 URL 輸入
  - [ ] 申請理由文字框
  - [ ] 提交按鈕

- [ ] **字體申請列表組件**
  - [ ] 顯示申請狀態（pending / approved / rejected）
  - [ ] 審核資訊顯示
  - [ ] Dev Admin 可審核

- [ ] **字體上傳組件（Dev Admin）**
  - [ ] 檔案上傳拖拉區
  - [ ] 字體資訊表單
  - [ ] Scope 選擇（global / school）
  - [ ] 即時預覽（Canvas 渲染測試文字）

- [ ] **字體管理頁面**
  - [ ] 整合所有組件
  - [ ] 路由設定 `/admin/ig/fonts`

**檔案：**
- `frontend/src/components/ig/FontRequestForm.tsx`
- `frontend/src/components/ig/FontRequestList.tsx`
- `frontend/src/components/ig/FontUploadForm.tsx`
- `frontend/src/pages/admin/ig/FontManagementPage.tsx`

---

## Phase 3: 模板系統（4 天）

### 3.1 模板 CRUD API
- [ ] **創建模板**
  - [ ] `POST /api/admin/ig/templates`
  - [ ] 驗證必填欄位
  - [ ] 驗證 JSON 結構
  - [ ] 生成唯一 template_id

- [ ] **更新模板**
  - [ ] `PUT /api/admin/ig/templates/<template_id>`
  - [ ] 權限檢查
  - [ ] 版本控制（可選）

- [ ] **刪除模板**
  - [ ] `DELETE /api/admin/ig/templates/<template_id>`
  - [ ] 檢查是否有帳號綁定
  - [ ] 軟刪除

- [ ] **列出模板**
  - [ ] `GET /api/admin/ig/templates`
  - [ ] 支援過濾（template_type, school_id）
  - [ ] 權限過濾

**檔案：**
- `backend/routes/routes_ig_templates.py`

---

### 3.2 即時預覽 API
- [ ] **模板預覽端點**
  - [ ] `POST /api/admin/ig/templates/preview`
  - [ ] 接收模板配置 JSON + 測試貼文 ID
  - [ ] 使用 Pillow 即時渲染
  - [ ] 返回預覽圖片 URL（臨時 CDN 路徑）

- [ ] **預覽圖片清理**
  - [ ] Celery 定時任務清理超過 1 小時的預覽圖片

**檔案：**
- `backend/services/ig_preview.py`

---

### 3.3 模板編輯表單（前端）
- [ ] **基本資訊表單**
  - [ ] 模板名稱
  - [ ] 模板類型（announcement / general）
  - [ ] 描述

- [ ] **Canvas 配置表單**
  - [ ] 背景類型選擇（純色 / 圖片）
  - [ ] 純色選擇器
  - [ ] 背景圖片上傳

- [ ] **文字配置表單（帶圖/不帶圖分開）**
  - [ ] 字體選擇（從可用字體列表）
  - [ ] 字體大小滑桿
  - [ ] 顏色選擇器
  - [ ] 每行字數輸入
  - [ ] 最多行數輸入
  - [ ] 截斷文字輸入
  - [ ] 對齊方式選擇（left / center / right）
  - [ ] 起始 Y 座標輸入
  - [ ] 行距輸入

- [ ] **圖片配置表單**
  - [ ] 啟用開關
  - [ ] 基礎尺寸輸入
  - [ ] 圓角輸入
  - [ ] 間距輸入
  - [ ] X/Y 位置輸入

- [ ] **Logo 配置表單**
  - [ ] 啟用開關
  - [ ] 來源選擇（school_logo / platform_logo / custom）
  - [ ] 自訂圖片上傳
  - [ ] X/Y 位置輸入
  - [ ] 寬度/高度輸入
  - [ ] 透明度滑桿
  - [ ] 圖層順序輸入

- [ ] **浮水印配置表單**
  - [ ] 啟用開關
  - [ ] 文字內容輸入
  - [ ] 字體選擇
  - [ ] 字體大小
  - [ ] 顏色選擇
  - [ ] 透明度滑桿
  - [ ] X/Y 位置輸入
  - [ ] 圖層順序輸入

- [ ] **Caption 配置表單**
  - [ ] 結構區塊列表（可拖拉排序）
  - [ ] 每個區塊的啟用開關
  - [ ] Footer 文字輸入
  - [ ] Post ID 格式輸入
  - [ ] Hashtags 輸入（多行）
  - [ ] Divider 文字輸入

**檔案：**
- `frontend/src/components/ig/TemplateEditForm.tsx`
- `frontend/src/components/ig/CanvasConfigForm.tsx`
- `frontend/src/components/ig/TextConfigForm.tsx`
- `frontend/src/components/ig/AttachmentConfigForm.tsx`
- `frontend/src/components/ig/LogoConfigForm.tsx`
- `frontend/src/components/ig/WatermarkConfigForm.tsx`
- `frontend/src/components/ig/CaptionConfigForm.tsx`

---

### 3.4 IG 預覽視窗組件
- [ ] **預覽視窗布局**
  - [ ] Instagram 手機框樣式
  - [ ] 固定比例 1080x1080
  - [ ] 響應式設計

- [ ] **即時渲染邏輯**
  - [ ] 參數變更時 debounce 300ms
  - [ ] 呼叫預覽 API
  - [ ] 顯示 Loading 狀態
  - [ ] 顯示渲染時間

- [ ] **測試貼文選擇**
  - [ ] 下拉選單選擇論壇貼文
  - [ ] 顯示貼文內容預覽

**檔案：**
- `frontend/src/components/ig/IGPreviewWindow.tsx`

---

### 3.5 模板編輯頁面整合
- [ ] **頁面布局**
  - [ ] 左側：參數表單（可滾動）
  - [ ] 右側：IG 預覽視窗（固定）
  - [ ] 底部：儲存/取消按鈕

- [ ] **狀態管理**
  - [ ] 使用 React Context 或 Redux
  - [ ] 表單狀態同步

- [ ] **路由設定**
  - [ ] `/admin/ig/templates/new` - 新增模板
  - [ ] `/admin/ig/templates/:id/edit` - 編輯模板

**檔案：**
- `frontend/src/pages/admin/ig/TemplateEditorPage.tsx`
- `frontend/src/contexts/TemplateEditorContext.tsx`

---

## Phase 4: 渲染引擎（3 天）

### 4.1 Pillow 渲染核心
- [ ] **IGRenderer 類別**
  - [ ] `render_post(post: InstagramPost, template: IGTemplate) -> str`
  - [ ] 主渲染流程控制
  - [ ] CDN 上傳整合

- [ ] **Canvas 創建**
  - [ ] `_create_canvas(config: dict) -> Image`
  - [ ] 支援純色背景
  - [ ] 支援圖片背景

**檔案：**
- `backend/services/ig_renderer.py`

---

### 4.2 圖片排列邏輯
- [ ] **圖片排列實作**
  - [ ] `_render_attachments(canvas, media_list, config)`
  - [ ] 1 張：填滿正方形
  - [ ] 2 張：左右長方形
  - [ ] 3 張：左兩則正方形 + 右一則長條
  - [ ] 4 張：四格正方形

- [ ] **圖片處理工具**
  - [ ] `_load_and_resize(media, width, height) -> Image`
  - [ ] `_add_rounded_corners(image, radius) -> Image`
  - [ ] 支援圖片下載（從 CDN）

---

### 4.3 文字截斷與換行
- [ ] **文字處理**
  - [ ] `_render_text(canvas, content, config)`
  - [ ] `_wrap_text(text, max_chars, max_lines, truncate) -> list[str]`
  - [ ] 支援中文換行
  - [ ] 自動添加截斷提示

- [ ] **字體載入**
  - [ ] 從 `/fonts/` 目錄載入字體檔案
  - [ ] 字體快取機制

---

### 4.4 Logo 與浮水印渲染
- [ ] **Logo 渲染**
  - [ ] `_render_logo(canvas, config, account)`
  - [ ] 支援 school_logo / platform_logo / custom
  - [ ] 透明度處理
  - [ ] 圖層順序控制

- [ ] **浮水印渲染**
  - [ ] `_render_watermark(canvas, config)`
  - [ ] 半透明文字
  - [ ] 圖層合成

---

### 4.5 Caption 生成邏輯
- [ ] **Caption 生成器**
  - [ ] `generate_caption(post, template) -> str`
  - [ ] 支援單篇貼文
  - [ ] 支援輪播貼文（10 篇合併）

- [ ] **智能長度控制**
  - [ ] 計算 Header/Footer/Hashtags 固定長度
  - [ ] 剩餘字元均分給各貼文
  - [ ] 預留截斷提示文字長度
  - [ ] 確保總長度 ≤ 2200 字元

- [ ] **Post ID 格式化**
  - [ ] `format_post_id(post, format_template, style) -> str`
  - [ ] 支援變數替換（school_short_name, post_type, post_id）
  - [ ] Hashtag 格式

**檔案：**
- `backend/services/ig_caption_generator.py`

---

### 4.6 渲染測試
- [ ] **單元測試**
  - [ ] 測試各種圖片數量組合
  - [ ] 測試文字截斷邏輯
  - [ ] 測試 Caption 長度控制

- [ ] **整合測試**
  - [ ] 使用真實論壇貼文測試
  - [ ] 驗證輸出圖片尺寸
  - [ ] 驗證 Caption 格式

**檔案：**
- `backend/tests/test_ig_renderer.py`

---

## Phase 5: 發布系統（4 天）

### 5.1 Instagram Graph API v23 整合
- [ ] **API 客戶端**
  - [ ] `IGAPIClient` 類別
  - [ ] Token 管理整合
  - [ ] 錯誤處理與重試

- [ ] **Media Container 創建**
  - [ ] `create_media_container(ig_user_id, image_url, caption) -> str`
  - [ ] 單圖發布
  - [ ] 輪播 Item 創建（`is_carousel_item=True`）

- [ ] **Carousel Container 創建**
  - [ ] `create_carousel_container(ig_user_id, children_ids, caption) -> str`
  - [ ] 支援最多 10 張圖片

- [ ] **發布 Container**
  - [ ] `publish_media(ig_user_id, creation_id) -> dict`
  - [ ] 返回 media_id 與 permalink

**檔案：**
- `backend/services/ig_api_client.py`

---

### 5.2 發布調度器
- [ ] **IGPublisher 類別**
  - [ ] `publish_single_post(post_id) -> bool`
  - [ ] `publish_carousel(account_id, post_ids) -> bool`
  - [ ] 狀態更新邏輯

- [ ] **發布流程**
  1. [ ] 檢查帳號 Token 有效性
  2. [ ] 上傳圖片至公開 CDN
  3. [ ] 創建 Media Container
  4. [ ] 發布 Container
  5. [ ] 更新 InstagramPost 狀態
  6. [ ] 記錄 ig_media_id 與 ig_permalink

- [ ] **錯誤處理**
  - [ ] API 錯誤分類（Token 過期 / 限流 / 內容違規）
  - [ ] 自動重試機制（最多 3 次）
  - [ ] 記錄錯誤訊息與錯誤碼

**檔案：**
- `backend/services/ig_publisher.py`

---

### 5.3 發布佇列管理
- [ ] **佇列模型設計**
  - [ ] 使用 Redis 或資料庫實作佇列
  - [ ] 佇列狀態：pending / processing / completed / failed

- [ ] **佇列管理器**
  - [ ] `add_to_queue(post_ids, account_id, publish_at) -> str`
  - [ ] `get_next_batch(account_id) -> list[InstagramPost]`
  - [ ] `mark_as_completed(queue_id)`

- [ ] **輪播組管理**
  - [ ] 生成 carousel_group_id
  - [ ] 批次渲染（10 篇一組）
  - [ ] 批次發布

**檔案：**
- `backend/services/ig_queue_manager.py`

---

### 5.4 Celery 定時任務
- [ ] **批次發布任務**
  - [ ] `@celery.task check_batch_publish()`
  - [ ] 每 5 分鐘執行一次
  - [ ] 檢查各帳號累積貼文數
  - [ ] 達到 batch_count 時創建輪播並加入佇列

- [ ] **排程發布任務**
  - [ ] `@celery.task check_scheduled_publish()`
  - [ ] 每分鐘執行一次
  - [ ] 檢查 scheduled_times
  - [ ] 觸發時中斷當前發布任務並啟動新週期

- [ ] **佇列處理任務**
  - [ ] `@celery.task process_publish_queue()`
  - [ ] 每 30 分鐘執行一次
  - [ ] 從佇列取出一個輪播發布

- [ ] **Token 自動刷新任務**
  - [ ] `@celery.task auto_refresh_tokens()`
  - [ ] 每天執行一次
  - [ ] 刷新即將過期的 Token（7 天內）

- [ ] **清理任務**
  - [ ] `@celery.task cleanup_preview_images()`
  - [ ] 每小時執行一次
  - [ ] 刪除超過 1 小時的預覽圖片

**檔案：**
- `backend/services/tasks/ig_tasks.py`

---

### 5.5 即時發布（公告專用）
- [ ] **公告發布觸發**
  - [ ] 論壇貼文審核通過時檢查類型
  - [ ] 如果是公告 → 立即觸發發布
  - [ ] 全平台公告 → 觸發所有帳號

- [ ] **即時發布邏輯**
  - [ ] 不進入佇列
  - [ ] 立即渲染 + 發布
  - [ ] 發布完成後通知

**檔案：**
- `backend/services/ig_instant_publisher.py`

---

### 5.6 通知系統整合
- [ ] **平台內通知**
  - [ ] 發布成功通知（Campus Admin）
  - [ ] 發布失敗通知（Campus Admin + Dev Admin）
  - [ ] 使用現有通知系統

- [ ] **Discord Webhook 通知**
  - [ ] 發布成功：簡要通知（貼文 ID + IG 連結）
  - [ ] 發布失敗：詳細錯誤資訊
  - [ ] 配置 Webhook URL（環境變數）

**檔案：**
- `backend/services/ig_notification.py`

---

## Phase 6: 管理介面（3 天）

### 6.1 帳號管理頁面
- [ ] **帳號列表組件**
  - [ ] 顯示所有帳號（Dev Admin）或自己學校帳號（Campus Admin）
  - [ ] 帳號基本資訊（學校、用戶名、發布模式）
  - [ ] Token 狀態指示器
  - [ ] 最後發布時間
  - [ ] 錯誤狀態顯示

- [ ] **帳號創建/編輯表單**
  - [ ] 學校選擇（Dev Admin）
  - [ ] IG User ID 輸入
  - [ ] Username 輸入
  - [ ] Access Token 輸入（帶遮罩）
  - [ ] 發布模式選擇（instant / batch / scheduled）
  - [ ] 批次數量輸入（batch 模式）
  - [ ] 排程時間選擇（scheduled 模式，多選）
  - [ ] 模板綁定選擇（公告模板 + 一般模板）

- [ ] **帳號操作**
  - [ ] 測試連接按鈕
  - [ ] 刷新 Token 按鈕
  - [ ] 啟用/停用開關
  - [ ] 刪除帳號（僅 Dev Admin）

**檔案：**
- `frontend/src/components/ig/AccountList.tsx`
- `frontend/src/components/ig/AccountForm.tsx`
- `frontend/src/pages/admin/ig/AccountManagementPage.tsx`

---

### 6.2 模板管理頁面
- [ ] **模板列表組件**
  - [ ] 顯示所有模板（Dev Admin）或自己學校模板（Campus Admin）
  - [ ] 模板類型標籤（公告 / 一般）
  - [ ] 使用次數統計
  - [ ] 最後使用時間
  - [ ] 啟用狀態

- [ ] **模板操作**
  - [ ] 新增模板按鈕 → 導航至模板編輯器
  - [ ] 編輯按鈕
  - [ ] 複製模板
  - [ ] 刪除模板（僅 Dev Admin）

- [ ] **快速預覽**
  - [ ] 滑鼠懸停顯示預覽縮圖

**檔案：**
- `frontend/src/components/ig/TemplateList.tsx`
- `frontend/src/pages/admin/ig/TemplateManagementPage.tsx`

---

### 6.3 發布監控儀表板
- [ ] **統計概覽組件**
  - [ ] 今日發布數量
  - [ ] 待發布數量
  - [ ] 失敗數量
  - [ ] 成功率（7 天）

- [ ] **發布記錄列表**
  - [ ] 顯示最近 50 筆發布記錄
  - [ ] 狀態過濾（pending / rendering / ready / publishing / published / failed）
  - [ ] 發布模式過濾
  - [ ] 時間排序

- [ ] **發布詳情**
  - [ ] 點擊展開查看詳細資訊
  - [ ] 渲染後的圖片預覽
  - [ ] Caption 預覽
  - [ ] Instagram 連結（已發布）
  - [ ] 錯誤訊息（失敗）

- [ ] **佇列監控**
  - [ ] 顯示當前佇列狀態
  - [ ] 下次發布時間倒數
  - [ ] 各帳號待發布數量

**檔案：**
- `frontend/src/components/ig/PublishStats.tsx`
- `frontend/src/components/ig/PublishRecordList.tsx`
- `frontend/src/components/ig/PublishDetails.tsx`
- `frontend/src/components/ig/QueueMonitor.tsx`
- `frontend/src/pages/admin/ig/PublishDashboardPage.tsx`

---

### 6.4 錯誤通知與重試
- [ ] **錯誤通知組件**
  - [ ] 即時顯示發布失敗通知（Toast）
  - [ ] 錯誤列表頁面
  - [ ] 錯誤詳情（錯誤碼、錯誤訊息、堆疊追蹤）

- [ ] **重試操作**
  - [ ] 單篇重試按鈕
  - [ ] 批次重試按鈕
  - [ ] 重試計數顯示
  - [ ] 重試歷史記錄

- [ ] **錯誤分析**
  - [ ] 錯誤類型統計（Token 過期 / API 限流 / 內容違規）
  - [ ] 建議修復方案顯示

**檔案：**
- `frontend/src/components/ig/ErrorNotification.tsx`
- `frontend/src/components/ig/ErrorList.tsx`
- `frontend/src/components/ig/RetryButton.tsx`

---

### 6.5 路由與導航整合
- [ ] **路由配置**
  - [ ] `/admin/ig` - IG 系統總覽（重定向至儀表板）
  - [ ] `/admin/ig/dashboard` - 發布監控儀表板
  - [ ] `/admin/ig/accounts` - 帳號管理
  - [ ] `/admin/ig/templates` - 模板管理
  - [ ] `/admin/ig/templates/new` - 新增模板
  - [ ] `/admin/ig/templates/:id/edit` - 編輯模板
  - [ ] `/admin/ig/fonts` - 字體管理

- [ ] **導航選單**
  - [ ] 在管理後台側邊欄新增「Instagram 整合」選單
  - [ ] 子選單：儀表板 / 帳號 / 模板 / 字體

- [ ] **權限守衛**
  - [ ] 僅 Dev Admin 與 Campus Admin 可進入
  - [ ] 非權限用戶導向 403 頁面

**檔案：**
- `frontend/src/main.tsx`（路由配置）
- `frontend/src/components/layout/AdminSidebar.tsx`（導航選單）

---

## Phase 7: 測試與優化（2 天）

### 7.1 單元測試
- [ ] **渲染引擎測試**
  - [ ] 測試圖片排列邏輯
  - [ ] 測試文字截斷
  - [ ] 測試 Caption 生成
  - [ ] 測試長度控制

- [ ] **API 客戶端測試**
  - [ ] Mock Instagram API
  - [ ] 測試錯誤處理
  - [ ] 測試重試機制

- [ ] **權限測試**
  - [ ] 測試 Dev Admin 權限
  - [ ] 測試 Campus Admin 權限
  - [ ] 測試越權訪問

**檔案：**
- `backend/tests/test_ig_renderer.py`
- `backend/tests/test_ig_api_client.py`
- `backend/tests/test_ig_permissions.py`

---

### 7.2 整合測試
- [ ] **完整發布流程測試**
  - [ ] 測試即時發布（公告）
  - [ ] 測試批次發布（輪播）
  - [ ] 測試排程發布
  - [ ] 測試錯誤重試

- [ ] **多帳號測試**
  - [ ] 測試各校帳號隔離
  - [ ] 測試跨校帳號

- [ ] **模板測試**
  - [ ] 測試各種模板配置
  - [ ] 測試字體載入
  - [ ] 測試 Logo 與浮水印

**檔案：**
- `backend/tests/test_ig_integration.py`

---

### 7.3 效能優化
- [ ] **渲染效能**
  - [ ] 圖片快取機制
  - [ ] 字體快取機制
  - [ ] 批次渲染優化

- [ ] **API 效能**
  - [ ] 查詢優化（使用 JOIN 減少查詢次數）
  - [ ] 分頁實作
  - [ ] 索引優化

- [ ] **前端效能**
  - [ ] 圖片懶載入
  - [ ] 虛擬滾動（長列表）
  - [ ] 表單狀態優化

---

### 7.4 文檔撰寫
- [ ] **API 文檔**
  - [ ] 使用 Swagger/OpenAPI
  - [ ] 所有端點說明
  - [ ] 請求/回應範例

- [ ] **使用文檔**
  - [ ] 帳號設定指南
  - [ ] 模板編輯教學
  - [ ] 發布模式說明
  - [ ] 常見問題

- [ ] **開發文檔**
  - [ ] 系統架構圖
  - [ ] 資料流程圖
  - [ ] 部署指南

**檔案：**
- `documentation/ig_system/API_DOCS.md`
- `documentation/ig_system/USER_GUIDE.md`
- `documentation/ig_system/DEVELOPER_GUIDE.md`

---

## 部署準備

### 環境變數配置
- [ ] `IG_TOKEN_ENCRYPTION_KEY` - Token 加密金鑰
- [ ] `INSTAGRAM_API_VERSION` - API 版本（v23.0）
- [ ] `IG_WEBHOOK_URL` - Discord Webhook URL
- [ ] `IG_CDN_BASE_URL` - CDN 基礎 URL
- [ ] `IG_FONTS_PATH` - 字體檔案存儲路徑

### Celery Beat 配置
- [ ] 配置所有定時任務
- [ ] 設定執行頻率
- [ ] 監控任務執行狀態

### 資料庫備份
- [ ] 執行遷移前備份
- [ ] 設定自動備份

---

## 驗收標準

### 功能驗收
- [ ] 可創建多個 Instagram 帳號（各校 + 跨校）
- [ ] 可創建與編輯模板（公告 + 一般）
- [ ] 即時預覽正常運作
- [ ] 輪播貼文成功發布（10 篇一組）
- [ ] 三種發布模式正常運作（即時 / 批次 / 排程）
- [ ] 字體管理系統正常（申請 / 審核 / 上傳）
- [ ] 權限控制正確（Dev Admin / Campus Admin）
- [ ] 錯誤通知與重試正常

### 效能驗收
- [ ] 單圖渲染 < 2 秒
- [ ] 輪播渲染（10 張）< 15 秒
- [ ] 預覽 API 響應 < 3 秒
- [ ] 發布 API 響應 < 5 秒

### 安全驗收
- [ ] Token 加密存儲
- [ ] 越權訪問被阻擋
- [ ] SQL 注入防護
- [ ] XSS 防護

---

## 風險與應對

### 風險 1: Instagram API 限流
- **應對：** 實作請求佇列，控制發布頻率（每 30 分鐘一次）

### 風險 2: Token 過期導致發布失敗
- **應對：** 自動刷新機制 + 即時通知

### 風險 3: 渲染效能瓶頸
- **應對：** 使用 Celery 背景任務 + 圖片快取

### 風險 4: Caption 超過長度限制
- **應對：** 智能截斷邏輯 + 預先計算長度

### 風險 5: 字體檔案過大
- **應對：** 限制上傳大小（10MB）+ 字體格式限制（TTF/OTF/WOFF2）

---

## 版本記錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2025-09-30 | 初始版本 |

---

## 相關文檔

- [系統架構設計](./SYSTEM_CLEANUP_AND_REDESIGN.md)
- [API 設計文檔](./documentation/ig_system/API_DOCS.md)（待建立）
- [使用指南](./documentation/ig_system/USER_GUIDE.md)（待建立）

---

**Next Action:** 開始 Phase 1.1 - 創建資料模型文件