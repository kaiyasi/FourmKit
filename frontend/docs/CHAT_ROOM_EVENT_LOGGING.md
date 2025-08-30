# 聊天室事件記錄系統

## 概述

聊天室事件記錄系統已經完全實現，所有聊天室相關操作都會自動記錄到系統事件日誌中，提供完整的審計追蹤功能。

## 實現的功能

### 1. 事件類型定義

在 `EventService` 中添加了以下聊天室相關事件類型：

- `chat.room.created` - 聊天室創建
- `chat.room.deleted` - 聊天室刪除
- `chat.room.member.added` - 聊天室成員加入
- `chat.room.member.removed` - 聊天室成員移除
- `chat.room.invitation.sent` - 聊天室邀請發送

### 2. 數據庫模型

#### ChatRoomMember 模型
新增了 `ChatRoomMember` 模型來持久化聊天室成員關係：

```python
class ChatRoomMember(Base):
    __tablename__ = "chat_room_members"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("chat_rooms.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
```

### 3. API 更新

#### 聊天室創建 API (`POST /api/admin/chat-rooms/create`)
- 創建聊天室時自動添加創建者和邀請的用戶為成員
- 記錄詳細的創建事件，包括邀請目標信息

#### 聊天室刪除 API (`DELETE /api/chat/rooms/<room_id>`)
- 刪除前獲取聊天室信息用於事件記錄
- 記錄刪除事件，包含被刪除聊天室的詳細信息

#### 成員管理 API
- `POST /api/admin/chat-rooms/custom/<room_id>/members` - 添加成員
- `DELETE /api/admin/chat-rooms/custom/<room_id>/members/<user_id>` - 移除成員

### 4. 事件記錄內容

每個聊天室事件記錄包含：

#### 基本信息
- 事件類型 (`event_type`)
- 事件標題 (`title`)
- 事件描述 (`description`)
- 嚴重程度 (`severity`)

#### 操作者信息
- 操作者用戶ID (`actor_id`)
- 操作者用戶名 (`actor_name`)
- 操作者角色 (`actor_role`)

#### 目標對象信息
- 目標類型 (`target_type`)
- 目標ID (`target_id`)
- 目標名稱 (`target_name`)

#### 上下文信息
- 相關學校ID (`school_id`)
- 客戶端IP (`client_ip`)
- 用戶代理 (`user_agent`)
- 詳細元數據 (`metadata`)

### 5. 權限控制

#### 創建權限
- `dev_admin`: 可以創建任何聊天室
- `campus_admin`: 只能創建自己學校的聊天室

#### 管理權限
- `dev_admin`: 可以管理所有聊天室
- `campus_admin`: 只能管理自己創建的聊天室

#### 成員管理權限
- 只有聊天室擁有者或 `dev_admin` 可以添加/移除成員
- 防止重複添加成員
- 軟刪除成員（設置 `is_active = False`）

## 事件記錄示例

### 聊天室創建事件
```json
{
  "event_type": "chat.room.created",
  "title": "創建聊天室: 技術討論群",
  "description": "管理員 admin 創建了聊天室「技術討論群」\n描述: 討論技術相關話題\n類型: public\n邀請目標: 角色組: 開發管理員, 學校: 台大",
  "severity": "medium",
  "actor_id": 1,
  "actor_name": "admin",
  "actor_role": "dev_admin",
  "target_type": "chat_room",
  "target_id": "custom:abc12345",
  "target_name": "技術討論群",
  "metadata": {
    "room_id": "custom:abc12345",
    "room_name": "技術討論群",
    "room_description": "討論技術相關話題",
    "room_type": "public",
    "invite_targets": [...],
    "invited_users": [2, 3, 4],
    "invite_count": 3
  }
}
```

### 成員添加事件
```json
{
  "event_type": "chat.room.member.added",
  "title": "添加聊天室成員: user123",
  "description": "管理員 admin 將用戶 user123 添加到聊天室「技術討論群」",
  "severity": "medium",
  "actor_id": 1,
  "actor_name": "admin",
  "actor_role": "dev_admin",
  "target_type": "user",
  "target_id": "5",
  "target_name": "user123",
  "metadata": {
    "room_id": "custom:abc12345",
    "room_name": "技術討論群",
    "target_user_id": 5,
    "target_username": "user123",
    "target_role": "user"
  }
}
```

## 查看事件記錄

管理員可以在事件記錄頁面查看所有聊天室相關操作：

1. 進入管理員後台
2. 點擊「事件記錄」頁面
3. 使用過濾器：
   - 事件類型：選擇 `chat.room.*`
   - 嚴重程度：選擇相應級別
   - 時間範圍：選擇查看時間段

## 數據庫遷移

創建了新的遷移文件 `2025_08_29_add_chat_room_member.py` 來添加 `chat_room_members` 表。

## 注意事項

1. **事件記錄失敗不影響主要功能**：如果事件記錄失敗，不會影響聊天室操作的正常執行
2. **權限檢查**：所有操作都有適當的權限檢查
3. **軟刪除**：成員移除使用軟刪除，保留歷史記錄
4. **重複檢查**：防止重複添加相同的成員
5. **詳細記錄**：記錄足夠的信息用於審計和問題排查

## 未來改進

1. 添加聊天室消息審核事件記錄
2. 支持聊天室權限變更事件記錄
3. 添加聊天室統計事件記錄
4. 支持批量操作的事件記錄
5. 添加事件導出功能
