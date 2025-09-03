# Socket 與 HTTP 交互序列圖

本文檔描述 ForumKit 系統中 Socket 和 HTTP 服務之間的交互流程。

## 系統交互概覽

ForumKit 採用雙通道通訊架構：
- **HTTP API**: 用於標準的 CRUD 操作
- **Socket.IO**: 用於即時通訊和狀態廣播
- **原生 Socket**: 用於健康檢查和系統監控

## 核心交互流程

### 1. 用戶登入與連接建立

```mermaid
sequenceDiagram
    participant C as 客戶端
    participant F as Frontend
    participant B as Backend API
    participant S as Socket.IO
    participant R as Redis
    participant D as Database
    
    C->>F: 訪問網站
    F->>B: POST /api/auth/login
    B->>D: 驗證用戶憑證
    D-->>B: 用戶信息
    B->>R: 存儲會話
    B-->>F: JWT Token
    F-->>C: 登入成功
    
    C->>S: WebSocket 連接
    S->>S: 驗證 JWT Token
    S->>S: join_room("global")
    S-->>C: 連接確認 {hello}
```

### 2. 貼文創建與審核流程

```mermaid
sequenceDiagram
    participant U as 用戶
    participant F as Frontend
    participant B as Backend API
    participant S as Socket.IO
    participant D as Database
    participant A as 管理員
    
    U->>F: 創建貼文
    F->>B: POST /api/posts/create
    B->>D: 儲存貼文 (status: pending)
    B-->>F: 創建成功
    F-->>U: 提示等待審核
    
    Note over B,S: 管理員接收通知
    B->>S: emit("moderation_update")
    S->>A: 新貼文待審核通知
    
    A->>F: 審核頁面
    A->>B: POST /api/moderation/post/{id}/approve
    B->>D: 更新貼文狀態
    B->>S: emit("post_approved", {post_data})
    S->>U: 貼文已核准通知
    S->>F: 更新貼文列表
```

### 3. Instagram 自動發布流程

```mermaid
sequenceDiagram
    participant T as 定時器
    participant IS as Instagram服務
    participant B as Backend API
    participant IG as Instagram API
    participant S as Socket.IO
    participant D as Discord Bot
    
    T->>IS: 觸發排程檢查
    IS->>B: 獲取待發布貼文
    B-->>IS: 已審核貼文列表
    
    loop 每篇貼文
        IS->>IS: 生成圖片卡片
        IS->>IG: 發布到 Instagram
        IG-->>IS: 發布結果
        IS->>B: 更新發布狀態
        IS->>S: emit("instagram_posted")
    end
    
    IS->>D: Discord 通知
    S->>F: 前端狀態更新
```

### 4. 媒體上傳與審核流程

```mermaid
sequenceDiagram
    participant U as 用戶
    participant F as Frontend
    participant B as Backend API
    participant FS as 檔案系統
    participant S as Socket.IO
    participant A as 管理員
    participant CDN as CDN服務
    
    U->>F: 選擇檔案上傳
    F->>B: POST /api/posts/upload
    B->>B: 檔案安全檢查
    B->>FS: 儲存到 pending/
    B-->>F: 上傳成功
    
    B->>S: emit("media_pending")
    S->>A: 新媒體待審核
    
    A->>B: POST /api/moderation/media/{id}/approve
    B->>FS: 移動到 public/
    B->>S: emit("media_approved")
    S->>CDN: 檔案可供存取
    S->>F: 更新媒體狀態
```

### 5. 健康檢查機制

```mermaid
sequenceDiagram
    participant M as 監控系統
    participant H as HTTP健康檢查
    participant B as Backend API
    participant S as Socket健康檢查
    participant D as Database
    participant R as Redis
    
    M->>H: GET /api/healthz
    H->>D: 檢查資料庫連接
    H->>R: 檢查 Redis 連接
    H-->>M: HTTP 200 + 健康狀態
    
    M->>S: Socket連接 :9101
    S->>S: ping
    S-->>M: pong
    
    Note over M: 綜合健康狀態評估
```

### 6. 錯誤處理與重試機制

```mermaid
sequenceDiagram
    participant C as 客戶端
    participant F as Frontend
    participant B as Backend API
    participant S as Socket.IO
    participant E as 錯誤處理
    
    C->>F: 用戶操作
    F->>B: API 請求
    B->>E: 發生錯誤
    E->>E: 記錄錯誤日誌
    E-->>B: 錯誤響應
    B-->>F: HTTP 4xx/5xx
    F->>F: 用戶友好錯誤顯示
    
    Note over F: 如果是網路錯誤
    F->>F: 自動重試機制
    F->>B: 重新發送請求
    
    Note over S: Socket 連接斷線
    S->>S: 自動重連
    S->>F: 連接狀態更新
```

### 7. 即時聊天功能

```mermaid
sequenceDiagram
    participant U1 as 用戶1
    participant U2 as 用戶2
    participant F1 as Frontend1
    participant F2 as Frontend2
    participant S as Socket.IO
    participant B as Backend API
    participant D as Database
    
    U1->>F1: 加入聊天室
    F1->>S: join_room("chat_room_1")
    S-->>F1: 加入成功
    
    U2->>F2: 加入聊天室
    F2->>S: join_room("chat_room_1")
    S-->>F2: 加入成功
    
    U1->>F1: 發送訊息
    F1->>S: emit("chat_message", {room, message})
    S->>B: 儲存訊息
    B->>D: 持久化儲存
    S->>F2: broadcast to room
    F2-->>U2: 顯示新訊息
```

## Socket 事件類型

### 客戶端事件
- `connect`: WebSocket 連接建立
- `disconnect`: WebSocket 連接斷開
- `join_room`: 加入特定房間
- `leave_room`: 離開特定房間
- `chat_message`: 發送聊天訊息

### 服務端廣播事件
- `hello`: 連接確認
- `post_approved`: 貼文已核准
- `post_rejected`: 貼文被退件
- `media_approved`: 媒體已核准
- `moderation_update`: 審核狀態更新
- `instagram_posted`: Instagram 發布完成
- `system_announcement`: 系統公告

## HTTP API 端點

### 認證相關
- `POST /api/auth/login`: 用戶登入
- `POST /api/auth/logout`: 用戶登出
- `GET /api/auth/google`: Google OAuth 登入

### 內容管理
- `POST /api/posts/create`: 創建貼文
- `GET /api/posts/list`: 獲取貼文列表
- `GET /api/posts/{id}`: 獲取單個貼文
- `POST /api/posts/upload`: 上傳媒體檔案

### 審核管理
- `GET /api/moderation/queue`: 獲取待審核項目
- `POST /api/moderation/post/{id}/approve`: 核准貼文
- `POST /api/moderation/post/{id}/reject`: 退件貼文

### 系統監控
- `GET /api/status`: 基本狀態檢查
- `GET /api/healthz`: 詳細健康檢查

## 性能優化策略

### 1. 連接管理
- Socket 連接池管理
- 自動重連機制
- 心跳檢測 (ping/pong)

### 2. 資料快取
- Redis 會話快取
- API 響應快取
- Socket 房間狀態快取

### 3. 負載均衡
- Socket.IO 黏性會話
- API 無狀態設計
- 資料庫連接池

## 安全考量

### 1. WebSocket 安全
- JWT Token 驗證
- Origin 來源檢查
- Rate Limiting

### 2. API 安全
- CSRF 防護
- SQL 注入防護
- XSS 過濾

### 3. 資料傳輸安全
- HTTPS/WSS 加密
- 敏感資料脫敏
- 日誌安全處理

---

本序列圖文檔展示了 ForumKit 系統的核心交互流程。詳細的 API 文檔請參考 [架構文檔](./architecture.md)。