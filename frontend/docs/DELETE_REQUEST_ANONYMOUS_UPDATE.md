# 刪文請求支持未登入用戶

## 概述

本次更新允許未登入用戶也可以提出刪文請求，提高了平台的可用性和內容管理效率。

## 修改內容

### 後端修改

1. **API 端點**: `/api/posts/{post_id}/delete_request`
   - 移除了強制登入要求
   - 添加了速率限制：5分鐘內最多3次請求
   - 支持可選的用戶認證（如果已登入則記錄用戶ID）

2. **DeleteService.create_delete_request()**
   - 支持 `requester_id=None`（未登入用戶）
   - 自動記錄請求者的 IP 地址和 User-Agent
   - 防止重複請求（同一貼文只能有一個待審核的刪文請求）

3. **DeleteRequest 模型**
   - `requester_ip` 和 `requester_user_agent` 欄位記錄請求者資訊
   - 支持未登入用戶的請求記錄

### 前端修改

1. **PostDetailPage.tsx**
   - 修改 `handleDeleteRequest` 函數
   - 可選發送 Authorization header（如果用戶已登入）

2. **PostList.tsx**
   - 修改 `handleDeleteRequest` 函數
   - 可選發送 Authorization header（如果用戶已登入）

## 功能特點

### 安全性
- **速率限制**: 防止濫用，5分鐘內最多3次請求
- **IP 記錄**: 自動記錄請求者 IP 地址
- **User-Agent 記錄**: 記錄瀏覽器資訊
- **重複請求防護**: 同一貼文只能有一個待審核的刪文請求

### 用戶體驗
- **無需登入**: 未登入用戶可以直接提出刪文請求
- **可選認證**: 已登入用戶的請求會記錄用戶ID
- **統一流程**: 登入和未登入用戶使用相同的請求流程

### 管理功能
- **完整記錄**: 管理員可以看到所有刪文請求的詳細資訊
- **審核流程**: 管理員可以批准或拒絕刪文請求
- **事件記錄**: 所有刪文請求都會記錄在系統事件中

## 使用方式

### 未登入用戶
```javascript
// 直接發送請求，無需 Authorization header
fetch('/api/posts/123/delete_request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ reason: '不當內容' })
})
```

### 已登入用戶
```javascript
// 可選發送 Authorization header
fetch('/api/posts/123/delete_request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token  // 可選
  },
  body: JSON.stringify({ reason: '不當內容' })
})
```

## 測試

新增了完整的測試套件 `test_delete_request_anonymous.py`，包含：

1. **未登入用戶功能測試**
   - 可以創建刪文請求
   - 不能創建重複請求
   - 不能對已刪除貼文創建請求

2. **已登入用戶功能測試**
   - 可以正常創建刪文請求
   - 記錄用戶ID和IP資訊

## 注意事項

1. **速率限制**: 未登入用戶受到相同的速率限制保護
2. **審核流程**: 所有刪文請求都需要管理員審核
3. **記錄完整性**: 系統會記錄所有必要的資訊用於審核
4. **向後兼容**: 已登入用戶的功能不受影響

## 未來改進

1. **驗證碼**: 考慮為未登入用戶添加驗證碼機制
2. **更嚴格的速率限制**: 根據IP地址實施更嚴格的限制
3. **自動審核**: 對於明顯的違規內容考慮自動審核機制
