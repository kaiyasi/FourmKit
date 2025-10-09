# Instagram 自動發布系統 - 當前狀態

## ✅ 已完成

### 1. 資料模型 (Models)
- ✅ `InstagramAccount` - IG 帳號管理
- ✅ `IGTemplate` - 渲染模板
- ✅ `InstagramPost` - 發布記錄
- ✅ `FontFile` - 字體管理

### 2. API 路由
- ✅ `/api/admin/ig/accounts` - 帳號管理 CRUD
- ✅ `/api/admin/ig/templates` - 模板管理 CRUD
- ✅ `/api/admin/ig/fonts` - 字體管理 (上傳、編輯、刪除、下載)
- ✅ `/api/admin/ig/queue` - 發布佇列查詢
- ✅ `/api/admin/ig/posts` - 發布記錄查詢、重試、統計

### 3. 前端頁面
- ✅ 帳號管理頁面
- ✅ 模板管理頁面（含即時預覽）
- ✅ 字體管理頁面（含預覽、語言支援標籤）
- ✅ 發布佇列頁面
- ✅ 發布記錄頁面

### 4. 核心功能
- ✅ Post Approval Hook - 審核通過自動建立 Instagram 發布記錄
  - 一般貼文 → BATCH 模式 + GENERAL 模板
  - 公告貼文 → INSTANT 模式 + ANNOUNCEMENT 模板
  - 優先選擇學校專屬帳號/模板，回退至全域
- ✅ 權限系統 (`require_ig_permission`)
- ✅ Token 加密 (AES-256-GCM)
- ✅ 時區修復（API 回傳帶 UTC 標記的 ISO 8601 時間）

## ⏳ 待實現

### 1. 渲染服務 (`services/ig_renderer.py`)
**功能：**
- 讀取 `InstagramPost` (status=PENDING)
- 根據模板配置渲染貼文為圖片
- 上傳圖片至 CDN
- 生成 caption
- 更新狀態：PENDING → RENDERING → READY

**相關文件：**
- `backend/services/ig_renderer.py` (部分完成，需整合)
- `backend/services/ig_caption_generator.py` (已存在)

### 2. 發布服務 (`services/ig_publisher.py`)
**功能：**
- 監控 READY 狀態的貼文
- 根據 publish_mode 決定發布時機：
  - **INSTANT**: 立即發布
  - **BATCH**: 累積 N 筆後批次發布（輪播）
  - **SCHEDULED**: 定時發布
- 調用 Instagram Graph API 發布
- 更新狀態：READY → PUBLISHING → PUBLISHED
- 錯誤處理和重試機制

**相關文件：**
- `backend/services/ig_publisher.py` (部分完成)
- `backend/services/ig_api_client.py` (API 客戶端)

### 3. 佇列管理服務
**功能：**
- 背景任務調度（Celery/定時輪詢）
- 批次偵測（BATCH 模式達到數量觸發）
- 排程檢查（SCHEDULED 模式時間到達觸發）
- 錯誤監控和通知

### 4. 管理功能增強
- ⏳ 手動觸發渲染
- ⏳ 手動觸發發布
- ⏳ 批次取消
- ⏳ 發布預覽（渲染後查看圖片）

## 📊 當前狀態

**測試資料：**
- 3 筆 InstagramPost 記錄（ID: 2, 3, 4）
- 狀態: 全部為 PENDING
- 發布模式: 全部為 BATCH
- 等待渲染服務處理

**時區問題：**
- ✅ 已修復：API 現在回傳 `2025-10-04T14:21:34.461019+00:00` 格式
- 前端使用 `toLocaleString('zh-TW')` 自動轉換為本地時區

## 🎯 下一步建議

1. **實現渲染服務** - 讓 PENDING 貼文能被渲染為圖片
2. **實現發布服務** - 處理 BATCH 模式的批次發布
3. **建立背景任務** - 定時執行渲染和發布
4. **完善錯誤處理** - 失敗重試、通知機制
5. **測試完整流程** - 從審核通過到 Instagram 發布成功
