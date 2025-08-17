# 修復驗證清單

## 已實施的修復

### 1. ✅ 後端雙重初始化修復
- 移除模組層級的 `app = create_app()`
- SocketIO 只在 `create_app()` 中初始化一次
- 事件註冊使用防重複旗標
- 心跳服務避免重複啟動

### 2. ✅ 前端客戶端追蹤系統
- 添加 `getClientId()` 和 `newTxId()` 函數
- 每次發文攜帶客戶端ID和交易ID
- 實現穩定的 `tempKey` 生成
- 添加 `upsertByIdOrTemp()` 智能合併邏輯

### 3. ✅ Socket.IO 事件管理重構
- 實現 `ensurePostListener()` 防重綁定
- Socket連線次數追蹤 (`window.__SOCKET_NEW_COUNT`)
- 統一的實時事件管理系統

### 4. ✅ 雙路徑注入修復
- **樂觀插入**：立即顯示暫時貼文（使用 tempKey）
- **伺服器回應**：替換同一筆樂觀項目（使用 client_tx_id 匹配）
- **Socket廣播**：
  - 自己的發文 → 用於替換樂觀項目
  - 他人發文 → 新增到列表

### 5. ✅ 渲染Key修復
- 使用 `p.id ?? p.tempKey` 作為 React key
- 避免樂觀項目和正式項目產生雙卡片

### 6. ✅ 列表去重邏輯
- `dedup()` 函數處理載入更多時的重複
- 基於 id/tempKey/client_tx_id 的智能去重
- 合併 injected items 與載入的資料

## 驗證檢查項目

### 後端檢查
```bash
# 1. 檢查容器日誌，應該只看到一次：
# - "[ForumKit] DB init ok"
# - "[ForumKit][routes] ..."
# - "heartbeat server started on port 12007"（不會跳到 12008）

docker-compose logs backend | grep -E "(DB init|routes|heartbeat)"
```

### 前端檢查
```javascript
// 2. 打開瀏覽器 DevTools Console，重新整理頁面
// 應該只看到：
// [socket] new instance count = 1

// 檢查連線次數
console.log('Socket instances:', window.__SOCKET_NEW_COUNT)
```

### 發文流程檢查
1. **樂觀插入**：點擊發文，列表立刻出現一筆貼文（顯示"發布中..."）
2. **伺服器替換**：2-3秒後，同一張卡片更新為正式內容（顯示刪文連結）
3. **無重複**：整個過程只有一張卡片，不會出現兩張

### 多用戶檢查
1. 開啟兩個瀏覽器窗口
2. 在窗口A發文，窗口B應該收到即時更新
3. 每個窗口的每篇貼文都只顯示一次

### WebSocket連線檢查
```bash
# 3. 檢查 Nginx 日誌，重新整理頁面時
# 應該只看到一次 WebSocket 101 升級請求，不會成對出現

docker-compose logs nginx | grep "101"
```

## 預期行為

### ✅ 正確行為
- Console 顯示 `[socket] new instance count = 1`
- 發文後立刻出現一張暫時卡片
- 2-3秒後同一張卡片更新為正式內容
- 他人發文時收到即時通知和列表更新
- 載入更多時無重複貼文

### ❌ 錯誤行為（已修復）
- Console 顯示 `new instance count = 2` 或更多
- 發文後短時間內出現兩張相同內容的卡片
- Nginx 日誌每次頁面載入都有成對的 101 請求
- 後端日誌出現兩次 DB init 或 routes 列表

## 技術總結

核心問題是「雙路徑注入」：
1. **樂觀插入路徑**：PostForm → handleNewPost → injectedItems
2. **Socket廣播路徑**：後端 emit → ensurePostListener → handleNewPost → injectedItems

解決方案是讓兩條路徑在 `handleNewPost` 中匯合，使用 `upsertByIdOrTemp` 智能合併：
- 相同來源（client_tx_id 匹配）→ 替換樂觀項目
- 不同來源 → 新增貼文
- 所有項目使用 `id ?? tempKey` 作為 React key，確保渲染一致性

這樣無論是本地樂觀插入、伺服器回應還是Socket廣播，都會正確處理，不會產生重複。
