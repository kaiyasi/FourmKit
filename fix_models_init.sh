#!/bin/bash
# 修復 models/__init__.py 以移除已刪除的 chat 模組導入

cat > /app/models/__init__.py << 'EOF'
# backend/models/__init__.py
from .base import *
from .media import Media
from .school import School
from .school_setting import SchoolSetting
from .moderation import ModerationLog
from .comments import Comment, PostReaction, CommentReaction
from .user_status import UserStatus, UserNotification, UserStatusEnum
from .announcement import Announcement, AnnouncementRead
from .events import SystemEvent, NotificationPreference
from .support import SupportTicket, SupportMessage

__all__ = [
    "User", "Post", "DeleteRequest", "UserRole",
    "Media", "ModerationLog", "School", "SchoolSetting",
    "Comment", "PostReaction", "CommentReaction",
    "UserStatus", "UserNotification", "UserStatusEnum",
    "Announcement", "AnnouncementRead",
    "SystemEvent", "NotificationPreference",
    "SupportTicket", "SupportMessage",
]
EOF

find /app -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find /app -type f -name "*.pyc" -delete 2>/dev/null || true

echo "修復完成"