# 管理員聊天室權限控制文檔

## 概述

管理員聊天室系統實現了多層次的權限控制，包括訪問權限、發文權限、以及管理權限。

---

## 1. 訪問權限限制

### 1.1 角色訪問權限

不同的管理員角色可以訪問不同類型的聊天室：

| 角色 | 可訪問的聊天室類型 |
|------|-------------------|
| `dev_admin` | **所有聊天室** |
| `cross_admin` | 跨校管理員頻道、緊急事件頻道、總聊天群 |
| `campus_admin` | 自己學校的頻道、跨校管理員頻道、總聊天群 |
| `campus_moderator` | 自己學校的頻道、跨校管理員頻道、總聊天群 |

### 1.2 私有頻道

- 私有頻道 (`is_private=True`) 需要成為成員才能訪問
- 只有聊天室管理員或創建者可以邀請成員加入

### 1.3 API 端點

```
GET /api/admin/chat/rooms
```
自動根據用戶角色和權限返回可訪問的聊天室列表

---

## 2. 發文權限限制

### 2.1 基本發文權限

- 有訪問權限的用戶通常可以發送訊息
- 被禁言 (`is_muted=True`) 的用戶無法發送訊息

### 2.2 特殊頻道發文限制

| 頻道類型 | 發文權限 |
|---------|---------|
| **系統通知頻道** (`SYSTEM`) | 僅 `dev_admin` 可以發送訊息 |
| **開發人員頻道** (`DEVELOPER`) | 僅 `dev_admin` 可以發送訊息 |
| **其他頻道** | 所有有訪問權限且未被禁言的成員 |

### 2.3 API 端點

```
POST /api/admin/chat/rooms/:room_id/messages
```
自動檢查發文權限，若無權限則返回 403

---

## 3. 自訂聊天室權限機制

### 3.1 聊天室成員角色

自訂聊天室支援三種成員角色：

| 角色 | 權限 |
|------|------|
| `admin` | 完整管理權限：修改設置、邀請/移除成員、禁言、刪除聊天室 |
| `moderator` | 中等權限：邀請成員、禁言成員 |
| `member` | 基本權限：查看和發送訊息 |

### 3.2 創建者權限

- 創建聊天室時，創建者自動成為 `admin` 角色
- 創建者擁有完整的管理權限
- 創建者不能被移除或禁言

### 3.3 管理操作權限

#### 誰可以管理聊天室？

以下用戶可以執行管理操作（刪除、修改設置、管理成員）：

1. `dev_admin` 角色的用戶（可管理所有聊天室）
2. 聊天室創建者
3. 聊天室內角色為 `admin` 的成員

#### 限制

- 系統預設聊天室（`SYSTEM`、`DEVELOPER`、`GLOBAL`、`CROSS`、`EMERGENCY`）無法刪除
- 不能移除創建者
- 不能禁言創建者

---

## 4. 管理功能 API

### 4.1 創建自訂聊天室

```http
POST /api/admin/chat/rooms
Content-Type: application/json

{
  "name": "專案討論群",
  "description": "討論新專案的私密群組",
  "type": "custom",
  "is_private": true,
  "max_members": 50
}
```

**權限要求**：`dev_admin`、`campus_admin`、`cross_admin`

### 4.2 刪除聊天室

```http
DELETE /api/admin/chat/rooms/:room_id
```

**權限要求**：
- `dev_admin` 或
- 聊天室創建者 或
- 聊天室內 `admin` 角色成員

**限制**：無法刪除系統預設聊天室

### 4.3 更新聊天室設置

```http
PATCH /api/admin/chat/rooms/:room_id
Content-Type: application/json

{
  "name": "新名稱",
  "description": "新描述",
  "is_private": false,
  "max_members": 100
}
```

**權限要求**：與刪除相同

### 4.4 移除成員

```http
DELETE /api/admin/chat/rooms/:room_id/members/:user_id
```

**權限要求**：聊天室管理員或創建者

**限制**：不能移除創建者

### 4.5 更新成員角色

```http
PATCH /api/admin/chat/rooms/:room_id/members/:user_id/role
Content-Type: application/json

{
  "role": "moderator"  // 可選: admin, moderator, member
}
```

**權限要求**：聊天室管理員或創建者

### 4.6 禁言/解禁成員

```http
POST /api/admin/chat/rooms/:room_id/members/:user_id/mute
Content-Type: application/json

{
  "mute": true  // true=禁言, false=解禁
}
```

**權限要求**：聊天室 `admin` 或 `moderator` 角色

**限制**：不能禁言創建者

### 4.7 邀請成員加入

```http
POST /api/admin/chat/rooms/:room_id/invite
Content-Type: application/json

{
  "user_ids": [2, 3, 5]
}
```

**權限要求**：
- 聊天室 `admin` 或 `moderator` 角色 或
- 聊天室創建者 或
- `dev_admin`

**限制**：
- 只能邀請管理端用戶（`dev_admin`、`campus_admin`、`campus_moderator`、`cross_admin`、`cross_moderator`）
- 不能超過聊天室人數上限

---

## 5. 使用範例

### 5.1 創建私有專案討論群

```python
# 1. 創建聊天室
response = api.post('/api/admin/chat/rooms', {
    "name": "資安專案討論",
    "description": "資安專案團隊內部討論",
    "is_private": True,
    "max_members": 20
})
room_id = response['room']['id']

# 2. 邀請團隊成員
api.post(f'/api/admin/chat/rooms/{room_id}/invite', {
    "user_ids": [5, 7, 9, 12]
})

# 3. 設置某位成員為版主
api.patch(f'/api/admin/chat/rooms/{room_id}/members/7/role', {
    "role": "moderator"
})
```

### 5.2 管理聊天室成員

```python
# 禁言違規用戶
api.post(f'/api/admin/chat/rooms/{room_id}/members/15/mute', {
    "mute": True
})

# 解除禁言
api.post(f'/api/admin/chat/rooms/{room_id}/members/15/mute', {
    "mute": False
})

# 移除成員
api.delete(f'/api/admin/chat/rooms/{room_id}/members/15')
```

### 5.3 查詢權限

```python
# 檢查用戶是否可以訪問聊天室
can_access = AdminChatService.can_user_access_room(user_id, room_id)

# 檢查用戶是否可以發送訊息
can_send = AdminChatService.can_user_send_message(user_id, room_id)

# 檢查用戶是否可以管理聊天室
can_manage = AdminChatService.can_user_manage_room(user_id, room_id)

# 獲取用戶在聊天室中的角色
role = AdminChatService.get_user_room_role(user_id, room_id)
# 返回: "admin", "moderator", "member" 或 None
```

---

## 6. 權限檢查流程圖

```
發送訊息請求
    ↓
是否有訪問權限？
    ├─ 否 → 拒絕 (403)
    └─ 是
        ↓
    是否被禁言？
        ├─ 是 → 拒絕 (403)
        └─ 否
            ↓
        特殊頻道檢查
            ├─ 系統/開發人員頻道 → 是否為 dev_admin？
            │   ├─ 否 → 拒絕 (403)
            │   └─ 是 → 允許發送
            └─ 一般頻道 → 允許發送
```

---

## 7. 資料庫結構

### AdminChatRoom (聊天室)

```sql
CREATE TABLE admin_chat_rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL,  -- 'school', 'cross', 'emergency', 'system', 'developer', 'global', 'custom'
    school_id INTEGER REFERENCES schools(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    is_private BOOLEAN DEFAULT FALSE,
    max_members INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### AdminChatMember (成員)

```sql
CREATE TABLE admin_chat_members (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES admin_chat_rooms(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member',  -- 'admin', 'moderator', 'member'
    is_muted BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 8. 錯誤代碼

| HTTP 狀態碼 | 錯誤訊息 | 原因 |
|------------|---------|------|
| 403 | "權限不足" | 沒有執行該操作的權限 |
| 403 | "只有系統管理員可以在系統通知頻道發送訊息" | 非 dev_admin 嘗試在系統頻道發文 |
| 400 | "聊天室不存在" | 聊天室 ID 無效 |
| 400 | "該用戶不是成員" | 目標用戶不在聊天室中 |
| 400 | "不能移除創建者" | 嘗試移除聊天室創建者 |
| 400 | "不能禁言創建者" | 嘗試禁言聊天室創建者 |
| 400 | "系統預設聊天室不能刪除" | 嘗試刪除系統預設聊天室 |
| 400 | "無效的角色" | 提供的角色不是 admin/moderator/member |

---

## 9. 安全考量

### 9.1 權限提升防護

- 所有管理操作都會檢查操作者的權限
- 不能透過 API 將自己提升為管理員
- 創建者和 dev_admin 的特殊保護

### 9.2 級聯刪除保護

- 使用軟刪除（設置 `is_active=False`）而非硬刪除
- 保留歷史訊息和成員記錄

### 9.3 Rate Limiting

所有 API 端點都有速率限制：
- 一般操作：10-20 次/分鐘
- 創建操作：5 次/分鐘
- 刪除操作：5 次/分鐘

---

## 10. 測試建議

### 10.1 權限測試案例

```python
def test_permissions():
    # 測試 1: 非管理員無法刪除聊天室
    assert not AdminChatService.can_user_manage_room(member_id, room_id)

    # 測試 2: 創建者可以刪除聊天室
    assert AdminChatService.can_user_manage_room(creator_id, room_id)

    # 測試 3: 被禁言的用戶無法發送訊息
    AdminChatService.mute_member(room_id, admin_id, member_id, True)
    assert not AdminChatService.can_user_send_message(member_id, room_id)

    # 測試 4: 非 dev_admin 無法在系統頻道發送訊息
    assert not AdminChatService.can_user_send_message(campus_admin_id, system_room_id)
    assert AdminChatService.can_user_send_message(dev_admin_id, system_room_id)
```

---

## 總結

✅ **已實現功能**：
1. 多層次訪問權限控制
2. 角色基礎的發文權限
3. 完整的聊天室管理功能
4. 創建者自動獲得管理權限
5. 三級成員角色系統（admin/moderator/member）
6. 禁言功能
7. 私有頻道支援
8. 系統預設頻道保護

📋 **權限等級**：
- `dev_admin`：系統最高權限，可管理所有聊天室
- 聊天室創建者：對自己創建的聊天室有完整管理權限
- 聊天室 `admin`：可管理聊天室設置和成員
- 聊天室 `moderator`：可邀請成員和禁言
- 聊天室 `member`：基本訪問和發文權限
