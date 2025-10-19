"""
Discord Bot 配置文件
"""

import os
from typing import Dict, Any, List


BOT_CONFIG = {
    "command_prefix": "!fk ",
    "description": "ForumKit Discord Bot - 校園論壇管理助手",
    "activity_name": "ForumKit 管理",
    "activity_type": "watching",
    
    "owner_ids": [],
    "admin_guild_ids": [],
    
    "enable_slash_commands": True,
    "enable_message_commands": True,
    "enable_auto_sync": True,
    "enable_debug_logging": False,
    
    "max_command_cooldown": 300,
    "max_uses_per_hour_global": 1000,
    "enable_rate_limiting": True,
    
    "notification_channels": {},
    "embed_color": 0x3498db,
    "footer_text": "ForumKit Discord Bot",
}


def load_config_from_env():
    """從環境變數載入配置"""
    
    owner_ids_str = os.getenv("DISCORD_OWNER_IDS", "")
    if owner_ids_str:
        BOT_CONFIG["owner_ids"] = [int(uid.strip()) for uid in owner_ids_str.split(",") if uid.strip()]
    
    admin_guilds_str = os.getenv("DISCORD_ADMIN_GUILDS", "")
    if admin_guilds_str:
        BOT_CONFIG["admin_guild_ids"] = [int(gid.strip()) for gid in admin_guilds_str.split(",") if gid.strip()]
    
    BOT_CONFIG["enable_slash_commands"] = os.getenv("DISCORD_ENABLE_SLASH", "true").lower() == "true"
    BOT_CONFIG["enable_message_commands"] = os.getenv("DISCORD_ENABLE_MESSAGE", "true").lower() == "true" 
    BOT_CONFIG["enable_debug_logging"] = os.getenv("DISCORD_DEBUG_LOGGING", "false").lower() == "true"
    
    custom_prefix = os.getenv("DISCORD_COMMAND_PREFIX")
    if custom_prefix:
        BOT_CONFIG["command_prefix"] = custom_prefix
    
    custom_color = os.getenv("DISCORD_EMBED_COLOR")
    if custom_color:
        try:
            BOT_CONFIG["embed_color"] = int(custom_color, 16)
        except ValueError:
            pass


DEFAULT_COMMANDS_CONFIG = {
    "system": {
        "status": {
            "description": "查看系統狀態",
            "permission_level": "user",
            "cooldown": 30,
            "response_template": "🟢 **系統狀態**\\n⚡ CPU: {cpu_usage}\\n🧠 記憶體: {memory_usage}\\n📊 運行時間: {uptime}"
        },
        "info": {
            "description": "查看伺服器資訊", 
            "permission_level": "user",
            "cooldown": 60
        },
        "ping": {
            "description": "測試連線延遲",
            "permission_level": "user",
            "cooldown": 10,
            "response_template": "🏓 Pong! 延遲: {latency}ms"
        }
    },
    
    "moderation": {
        "pending": {
            "description": "查看待審核內容",
            "permission_level": "moderator", 
            "cooldown": 30
        },
        "approve": {
            "description": "批准內容 - 用法: !fk approve <ID>",
            "permission_level": "moderator",
            "cooldown": 5
        },
        "reject": {
            "description": "拒絕內容 - 用法: !fk reject <ID> [原因]",
            "permission_level": "moderator", 
            "cooldown": 5
        },
        "queue": {
            "description": "查看審核佇列",
            "permission_level": "moderator",
            "cooldown": 30
        }
    },
    
    "user": {
        "users": {
            "description": "列出註冊用戶",
            "permission_level": "moderator",
            "cooldown": 60
        },
        "ban": {
            "description": "封鎖用戶 - 用法: !fk ban <@用戶> [時長] [原因]",
            "permission_level": "admin",
            "cooldown": 10
        },
        "unban": {
            "description": "解除封鎖 - 用法: !fk unban <@用戶>",
            "permission_level": "admin", 
            "cooldown": 10
        },
        "permission": {
            "description": "設定用戶權限 - 用法: !fk permission <@用戶> <權限等級>",
            "permission_level": "admin",
            "cooldown": 5
        }
    },
    
    "stats": {
        "stats": {
            "description": "查看統計資料",
            "permission_level": "moderator",
            "cooldown": 120
        },
        "activity": {
            "description": "查看活動記錄",
            "permission_level": "moderator", 
            "cooldown": 60
        },
        "logs": {
            "description": "查看操作日誌",
            "permission_level": "admin",
            "cooldown": 60
        }
    },
    
    "config": {
        "config": {
            "description": "查看 Bot 配置",
            "permission_level": "admin",
            "cooldown": 60
        },
        "reload": {
            "description": "重新載入配置",
            "permission_level": "dev_admin",
            "cooldown": 30
        },
        "sync": {
            "description": "同步斜線指令",
            "permission_level": "dev_admin", 
            "cooldown": 120
        }
    },
    
    "utility": {
        "help": {
            "description": "顯示幫助資訊",
            "permission_level": "user",
            "cooldown": 30
        },
        "version": {
            "description": "查看 Bot 版本",
            "permission_level": "user",
            "cooldown": 60,
            "response_template": "🤖 **ForumKit Discord Bot**\\n📦 版本: v1.0.0\\n🔧 Discord.py: {discord_version}\\n⚡ Python: {python_version}"
        }
    }
}


ERROR_MESSAGES = {
    "permission_denied": "🚫 權限不足：{reason}",
    "command_not_found": "❓ 未知指令：`{command}`\\n使用 `!fk help` 查看可用指令",
    "command_disabled": "⚠️ 指令 `{command}` 目前已停用",
    "cooldown_active": "⏰ 指令冷卻中，請等待 {remaining} 秒",
    "user_banned": "🚫 您已被封鎖：{reason}\\n到期時間: {expires}",
    "channel_restricted": "📍 此指令只能在特定頻道使用",
    "invalid_arguments": "❌ 參數錯誤：{error}\\n用法: `{usage}`",
    "api_error": "⚠️ API 錯誤：{error}",
    "database_error": "💾 資料庫錯誤，請稍後再試",
    "rate_limit_exceeded": "🚦 指令使用過於頻繁，請稍後再試",
    "server_error": "❌ 伺服器錯誤：{error}",
    "not_implemented": "🚧 此功能尚未實現，敬請期待",
}


SUCCESS_MESSAGES = {
    "command_executed": "✅ 指令執行成功",
    "permission_updated": "✅ 用戶權限已更新：{user} -> {level}",
    "user_banned": "🔨 用戶已封鎖：{user}\\n原因: {reason}",
    "user_unbanned": "🕊️ 用戶封鎖已解除：{user}",
    "content_approved": "✅ 內容已批准：#{id}",
    "content_rejected": "❌ 內容已拒絕：#{id}\\n原因: {reason}",
    "config_reloaded": "🔄 配置已重新載入",
    "commands_synced": "🔄 斜線指令已同步",
}


NOTIFICATION_TEMPLATES = {
    "content_posted": {
        "title": "📝 新貼文提交",
        "description": "**作者**: {author}\\n**學校**: {school}\\n**內容**: {content_preview}",
        "color": 0x3498db
    },
    "content_approved": {
        "title": "✅ 內容已批准", 
        "description": "**ID**: #{id}\\n**審核員**: {moderator}\\n**內容**: {content_preview}",
        "color": 0x27ae60
    },
    "content_rejected": {
        "title": "❌ 內容已拒絕",
        "description": "**ID**: #{id}\\n**審核員**: {moderator}\\n**原因**: {reason}\\n**內容**: {content_preview}",
        "color": 0xe74c3c
    },
    
    "user_registered": {
        "title": "👋 新用戶註冊",
        "description": "**用戶**: {username}\\n**學校**: {school}\\n**註冊時間**: {timestamp}",
        "color": 0x9b59b6
    },
    "user_banned": {
        "title": "🔨 用戶被封鎖",
        "description": "**用戶**: {username}\\n**執行者**: {moderator}\\n**原因**: {reason}\\n**到期**: {expires}",
        "color": 0xe67e22
    },
    
    "system_error": {
        "title": "⚠️ 系統錯誤",
        "description": "**錯誤**: {error}\\n**時間**: {timestamp}\\n**詳情**: {details}",
        "color": 0xe74c3c
    },
    "system_maintenance": {
        "title": "🔧 系統維護",
        "description": "**維護項目**: {item}\\n**預計時間**: {duration}\\n**影響範圍**: {scope}",
        "color": 0xf39c12
    }
}


def init_config():
    """初始化配置"""
    load_config_from_env()
    return BOT_CONFIG

load_config_from_env()