# backend/models/__init__.py
from .base import *
from .media import Media
from .school import School
from .school_setting import SchoolSetting
from .moderation import ModerationLog
from .comments import Comment, PostReaction, CommentReaction
from .admin_chat import (
    AdminChatRoom, AdminChatMessage, AdminChatMember, AdminChatVote,
    AdminChatVoteBallot, AdminChatMention, AdminChatFile
)
from .user_status import UserStatus, UserNotification, UserStatusEnum
from .announcement import Announcement, AnnouncementRead
from .events import SystemEvent, NotificationPreference
from .support import SupportTicket, SupportMessage
from .instagram import InstagramAccount, IGTemplate, InstagramPost, PublishMode, TemplateType, PostStatus
from .fonts import FontFile, FontRequest, FontScope, FontRequestStatus, FontWeight, FontStyle

# 提供向後兼容的別名（用於舊代碼）
ChatRoom = AdminChatRoom
ChatRoomMember = AdminChatMember
ChatMessage = AdminChatMessage

__all__ = [
    "User", "Post", "DeleteRequest", "UserRole",
    "Media", "ModerationLog", "School", "SchoolSetting",
    "Comment", "PostReaction", "CommentReaction",
    "UserStatus", "UserNotification", "UserStatusEnum",
    "Announcement", "AnnouncementRead",
    "AdminChatRoom", "AdminChatMessage", "AdminChatMember",
    "AdminChatVote", "AdminChatVoteBallot", "AdminChatMention", "AdminChatFile",
    "ChatRoom", "ChatRoomMember", "ChatMessage",  # 向後兼容的別名
    "SupportTicket", "SupportMessage",
    "InstagramAccount", "IGTemplate", "InstagramPost", "PublishMode", "TemplateType", "PostStatus",
    "FontFile", "FontRequest", "FontScope", "FontRequestStatus", "FontWeight", "FontStyle",
]
