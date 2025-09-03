# ForumKit 多資料庫架構

## 資料庫分離說明

為了提高系統穩定性和維護性，ForumKit 採用多資料庫架構：

### CORE
- **檔案**: `forumkit_core.db`
- **描述**: 核心論壇功能（用戶、貼文、留言等）
- **表格**: users, posts, delete_requests, comments, post_reactions, comment_reactions, media, user_roles

### SUPPORT
- **檔案**: `forumkit_support.db`
- **描述**: 客服支援系統
- **表格**: support_tickets, support_messages

### CHAT
- **檔案**: `forumkit_chat.db`
- **描述**: 聊天室系統
- **表格**: chat_messages, chat_rooms, chat_room_members

### MODERATION
- **檔案**: `forumkit_moderation.db`
- **描述**: 審核和管理系統
- **表格**: moderation_logs, system_events, notification_preferences

### ORGANIZATION
- **檔案**: `forumkit_organization.db`
- **描述**: 組織管理（學校、公告等）
- **表格**: schools, school_settings, announcements, announcement_reads

## 優勢

1. **服務隔離**: 不同功能使用獨立資料庫，避免相互干擾
2. **備份靈活**: 可以針對不同服務進行獨立備份
3. **擴展性強**: 未來可以輕鬆將不同服務部署到不同伺服器
4. **故障隔離**: 單個服務的資料庫問題不會影響其他服務

## 使用方法

```python
from utils.db_multi import get_core_session, get_support_session

# 獲取核心功能資料庫會話
core_db = get_core_session()

# 獲取支援系統資料庫會話
support_db = get_support_session()
```
