# 會員管理功能

## 概述

ForumKit 會員管理功能提供完整的會員訂閱管理和廣告貼文審核系統，僅限 `dev_admin` 角色訪問。

## 功能特點

### 1. 會員管理
- **會員狀態管理**：管理用戶的訂閱狀態（已訂閱/未訂閱）
- **角色權限**：管理組（除 dev_admin 外）自動顯示為已訂閱
- **訂閱期限**：支持設置會員訂閱到期時間
- **用戶搜尋**：支持按用戶名稱、Email、角色、訂閱狀態篩選

### 2. 廣告貼文管理
- **廣告貼文審核**：審核 dev_admin 發布的廣告貼文
- **狀態管理**：核准/拒絕廣告貼文
- **內容審查**：查看廣告貼文內容和發布者資訊
- **事件記錄**：記錄所有廣告貼文操作事件

### 3. 廣告貼文特性
- **發布權限**：僅 `dev_admin` 可發布廣告貼文
- **顯示範圍**：無視瀏覽範圍限制，所有人可見
- **會員過濾**：會員用戶不顯示廣告貼文
- **刪除保護**：廣告貼文不可申請刪除

## 技術實現

### 前端組件

#### 1. MemberManagementPage.tsx
```typescript
// 會員管理頁面
- 會員列表管理
- 廣告貼文審核
- 搜尋和篩選功能
- 權限控制（僅 dev_admin）
```

#### 2. 貼文發布組件更新
```typescript
// PostComposer.tsx
- 添加廣告貼文選項（僅 dev_admin 可見）
- 廣告貼文標識顯示
```

#### 3. 帳號資訊更新
```typescript
// SettingsPage.tsx
- 將「已驗證」改為「已訂閱」
- 顯示會員狀態和到期時間
```

### 後端 API

#### 1. 會員管理 API (`/api/admin/members`)
```python
# 獲取所有用戶列表
GET /api/admin/members

# 更新用戶會員狀態
PATCH /api/admin/members/{user_id}/premium
```

#### 2. 廣告貼文 API (`/api/admin/advertisements`)
```python
# 獲取所有廣告貼文
GET /api/admin/advertisements

# 審核廣告貼文
PATCH /api/admin/advertisements/{post_id}/review
```

#### 3. 帳號資訊 API 更新
```python
# 返回會員狀態資訊
GET /api/account/profile
# 新增 is_premium, premium_until 欄位
```

### 數據庫模型

#### 1. User 模型更新
```python
class User(Base):
    # 會員相關欄位
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    premium_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

#### 2. Post 模型
```python
class Post(Base):
    # 廣告貼文標記
    is_advertisement: Mapped[bool] = mapped_column(Boolean, default=False)
```

### 事件記錄

#### 1. 會員相關事件
```python
# 事件類型
"member.premium_status_changed": "會員狀態變更"
"member.subscription_created": "會員訂閱創建"
"member.subscription_cancelled": "會員訂閱取消"
"member.subscription_expired": "會員訂閱過期"
```

#### 2. 廣告相關事件
```python
# 事件類型
"advertisement.created": "廣告貼文創建"
"advertisement.reviewed": "廣告貼文審核"
"advertisement.approved": "廣告貼文核准"
"advertisement.rejected": "廣告貼文拒絕"
```

## 使用流程

### 1. 會員管理
1. 登入 `dev_admin` 帳號
2. 進入管理後台 → 會員管理
3. 查看所有用戶列表
4. 使用搜尋和篩選功能找到目標用戶
5. 點擊「設為訂閱」或「取消訂閱」按鈕
6. 系統自動記錄事件並更新用戶狀態

### 2. 廣告貼文發布
1. 登入 `dev_admin` 帳號
2. 進入發文頁面
3. 勾選「廣告貼文」選項
4. 填寫內容並發布
5. 貼文進入待審核狀態

### 3. 廣告貼文審核
1. 登入 `dev_admin` 帳號
2. 進入管理後台 → 會員管理 → 廣告貼文標籤
3. 查看待審核的廣告貼文
4. 點擊「核准」或「拒絕」按鈕
5. 系統記錄審核事件並更新貼文狀態

## 權限控制

### 1. 訪問權限
- **會員管理頁面**：僅 `dev_admin` 可訪問
- **廣告貼文發布**：僅 `dev_admin` 可發布
- **廣告貼文審核**：僅 `dev_admin` 可審核

### 2. 顯示權限
- **會員狀態**：管理組（除 dev_admin 外）自動顯示為已訂閱
- **廣告貼文**：會員用戶不顯示廣告貼文
- **刪除保護**：廣告貼文不可申請刪除

## 配置選項

### 1. 環境變數
```bash
# 會員相關配置
MEMBER_PREMIUM_DEFAULT=false
MEMBER_AUTO_EXPIRE_DAYS=365

# 廣告貼文配置
ADVERTISEMENT_REVIEW_REQUIRED=true
ADVERTISEMENT_AUTO_APPROVE=false
```

### 2. 系統設定
```python
# 會員狀態自動檢查
def check_premium_expiration():
    """檢查會員到期時間並自動更新狀態"""
    pass

# 廣告貼文自動標記
def mark_advertisement_posts():
    """自動標記廣告貼文"""
    pass
```

## 安全考量

### 1. 權限驗證
- 所有 API 端點都進行 JWT 驗證
- 角色權限檢查確保只有 `dev_admin` 可訪問
- 前端路由保護防止未授權訪問

### 2. 數據驗證
- 輸入數據驗證和清理
- SQL 注入防護
- XSS 攻擊防護

### 3. 事件記錄
- 所有操作都記錄在系統事件中
- 審計追蹤支持
- 異常操作監控

## 未來改進

### 1. 功能擴展
- [ ] 會員等級系統（金卡、銀卡等）
- [ ] 自動續費功能
- [ ] 會員專屬內容
- [ ] 廣告貼文統計分析

### 2. 用戶體驗
- [ ] 會員狀態通知
- [ ] 到期提醒功能
- [ ] 會員權益說明頁面
- [ ] 廣告貼文預覽功能

### 3. 管理功能
- [ ] 批量會員管理
- [ ] 會員統計報表
- [ ] 廣告效果分析
- [ ] 自動審核規則

## 相關文件

- [用戶角色權限說明](./USER_ROLES_PERMISSIONS.md)
- [事件記錄系統](./EVENT_LOGGING_SYSTEM.md)
- [管理後台功能](./ADMIN_DASHBOARD.md)
- [貼文管理系統](./POST_MANAGEMENT.md)
