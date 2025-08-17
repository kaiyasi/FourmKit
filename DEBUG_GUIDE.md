# 🐛 ForumKit 無限複製調試指南

不再需要錄影！透過詳細的日誌追蹤，你可以直接在控制台看到「鬼打牆」的完整過程。

## 🔧 調試工具清單

### 1. 後端追蹤
- ✅ Socket.IO 連線/斷線日誌
- ✅ 廣播事件完整追蹤 
- ✅ 客戶端連線數量監控
- ✅ 發文 API 詳細日誌

### 2. 前端追蹤  
- ✅ Socket 實例建立計數
- ✅ 事件綁定追蹤
- ✅ 事件接收計數
- ✅ Upsert 操作詳細日誌

### 3. 資料庫驗證
- ✅ 實際記錄數檢查
- ✅ 重複內容檢測
- ✅ 頻繁發文檢測

### 4. 自動化測試
- ✅ 重複廣播檢測
- ✅ 多客戶端模擬
- ✅ 快速發文測試

---

## 🕵️ 調試步驟

### Step 1: 啟動系統並開啟日誌追蹤

```bash
# 啟動系統
docker-compose up -d

# 監控後端日誌
docker-compose logs backend -f
```

### Step 2: 開啟瀏覽器 DevTools

1. 打開 http://localhost:3000
2. F12 開啟 DevTools → Console 標籤
3. 重新整理頁面

**正常情況應該看到：**
```
[socket] created instance #1 at 2024-01-01T12:00:00.000Z
[realtime] removing existing post_created listeners...
[realtime] registering new post_created listener at 2024-01-01T12:00:00.000Z  
[realtime] post_created listener registered successfully
[WS] connected abc123
```

**異常情況會看到：**
```
[socket] created instance #1 at 2024-01-01T12:00:00.000Z
[socket] created instance #2 at 2024-01-01T12:00:00.100Z  // 🚨 重複建立!
[realtime] ensurePostListener called again at ..., already registered  // 🚨 重複綁定!
```

### Step 3: 測試發文流程

1. 發布一篇測試貼文
2. 觀察 Console 輸出

**正常流程：**
```
[handleNewPost] direct post at ...: optimistic id=undefined tx_id=abc-123
[upsert] prepended new item: id=none sig=tmp_xyz...
[realtime] received post_created #1: post_id=42 origin=my-client-id tx_id=abc-123
[handleNewPost] own post - replacing optimistic item  
[upsert] replaced by signature: abc-123
```

**異常流程：**
```
[handleNewPost] direct post at ...: optimistic id=undefined tx_id=abc-123
[upsert] prepended new item: id=none sig=tmp_xyz...
[realtime] received post_created #1: post_id=42 origin=my-client-id tx_id=abc-123
[realtime] received post_created #2: post_id=42 origin=my-client-id tx_id=abc-123  // 🚨 重複接收!
[handleNewPost] own post - replacing optimistic item
[handleNewPost] own post - replacing optimistic item  // 🚨 重複處理!
```

### Step 4: 檢查後端日誌

**正常後端日誌：**
```
[SocketIO] client connected: sid=abc123 addr=127.0.0.1 ua='Mozilla/5.0...'
[SocketIO] emit post_created: post_id=42 origin=client-xyz tx_id=abc-123 content_preview='測試內容...'
[SocketIO] broadcasting to 1 connected clients
[SocketIO] post_created broadcast completed for post 42
```

**異常後端日誌：**
```
[SocketIO] client connected: sid=abc123 addr=127.0.0.1 ua='Mozilla/5.0...'
[SocketIO] client connected: sid=def456 addr=127.0.0.1 ua='Mozilla/5.0...'  // 🚨 同一瀏覽器雙連線!
[SocketIO] broadcasting to 2 connected clients  // 🚨 客戶端數量異常!
```

---

## 🧪 進階調試

### 資料庫驗證
```bash
# 檢查資料庫實際記錄
docker exec -it forumkit-backend-1 python debug_db.py
```

### 重複廣播測試
```bash
# 進入後端容器
docker exec -it forumkit-backend-1 bash

# 安裝測試依賴
pip install python-socketio aiohttp

# 運行重複廣播檢測
python test_duplicate_broadcast.py
```

### 手動 SQL 檢查
```bash
# 進入資料庫
docker exec -it forumkit-backend-1 sqlite3 /app/forumkit.db

# 檢查最近貼文
.headers on
SELECT id, substr(content, 1, 30) as content_preview, created_at 
FROM posts 
ORDER BY created_at DESC 
LIMIT 10;

# 檢查重複內容
SELECT content, COUNT(*) as count 
FROM posts 
GROUP BY content 
HAVING COUNT(*) > 1;
```

---

## 🎯 診斷指標

### ✅ 健康狀態指標
- Console: `[socket] created instance #1` (只出現一次)
- 後端: `broadcasting to 1 connected clients`
- 發文流程: 每次只有一組 `post_created` 事件
- 資料庫: 無重複內容記錄

### 🚨 異常狀態指標  
- Console: `created instance #2` 或更高數字
- Console: `ensurePostListener called again` 警告
- 後端: `broadcasting to N connected clients` (N > 實際客戶端數)
- 發文: 同一 post_id 收到多次 `post_created` 事件
- 資料庫: 發現重複內容記錄

---

## 🔍 常見問題診斷

### Q: 前端收到重複事件
**檢查項目：**
1. Socket 實例是否重複建立？
2. 事件監聽器是否重複綁定？
3. React StrictMode 是否造成雙重載入？

### Q: 後端廣播給多個客戶端
**檢查項目：**
1. 是否有多個 Socket 連線？
2. 連線是否正確斷開？
3. 是否有殭屍連線？

### Q: 資料庫有重複記錄
**檢查項目：**
1. API 是否被重複調用？
2. 表單提交是否有防重複機制？
3. 網路重試是否造成重複？

---

## 📊 調試檢查清單

- [ ] 後端日誌：只有一次 DB init
- [ ] 後端日誌：Socket 連線數量正確
- [ ] 前端 Console：Socket 實例計數 = 1
- [ ] 前端 Console：無重複事件接收
- [ ] 資料庫：無重複內容記錄
- [ ] 測試：自動化檢測通過

當所有指標都正常時，「無限城」就徹底消失了！ 🎉
