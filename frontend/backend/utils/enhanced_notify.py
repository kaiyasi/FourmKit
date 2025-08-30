"""
Enhanced Webhook Notification System
統一的伺服器狀態回報格式 - 使用裝飾性符號和結構化資訊
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union
import json
import socket
import psutil
import os
from urllib.parse import urlparse

# ============== 裝飾性符號定義 ==============
DECORATIONS = {
    "system": {
        "header": "═══════════════════════════════════════════════════════",
        "section": "───────────────────────────────────────────────────────",
        "subsection": "┌─────────────────────────────────────────────────────┐",
        "end_section": "└─────────────────────────────────────────────────────┘",
        "bullet": "▶",
        "status_ok": "✅",
        "status_warn": "⚠️", 
        "status_error": "❌",
        "status_info": "ℹ️",
        "performance": "⚡",
        "security": "🔒",
        "network": "🌐",
        "database": "💾",
        "memory": "🧠",
        "cpu": "⚙️",
        "technical": "🔧"
    },
    "content": {
        "header": "🏛️ ════════════ FORUMKIT 內容管理系統 ════════════ 🏛️",
        "post": "📝",
        "comment": "💬", 
        "media": "🖼️",
        "approve": "✅",
        "reject": "❌",
        "moderate": "⚖️"
    },
    "user": {
        "header": "👥 ═══════════ FORUMKIT 用戶管理系統 ═══════════ 👥",
        "login": "🔑",
        "logout": "🚪",
        "register": "📋",
        "role_change": "⚡",
        "profile": "👤",
        "security": "🛡️"
    },
    "theme": {
        "header": "🎨 ═══════════ FORUMKIT 主題設計系統 ═══════════ 🎨",
        "colors": "🌈",
        "fonts": "📝", 
        "layout": "📐",
        "animation": "✨",
        "proposal": "💡",
        "approved": "✅"
    },
    "school": {
        "header": "🏫 ═══════════ FORUMKIT 學校管理系統 ═══════════ 🏫",
        "create": "➕",
        "update": "📝",
        "delete": "🗑️",
        "settings": "⚙️"
    },
    "technical": {
        "header": "⚙️ ════════════ SYSTEM TECHNICAL STATUS ════════════ ⚙️",
        "webhook": "🔗",
        "database": "💾",
        "redis": "📊",
        "api": "🔌",
        "performance": "⚡"
    }
}

def get_system_metrics() -> Dict[str, Any]:
    """獲取系統性能指標"""
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)
        uptime = datetime.now(timezone.utc) - boot_time
        
        return {
            "cpu_usage": f"{cpu_percent:.1f}%",
            "memory_usage": f"{memory.percent:.1f}%",
            "memory_available": f"{memory.available / (1024**3):.2f} GB",
            "disk_usage": f"{disk.percent:.1f}%",
            "disk_free": f"{disk.free / (1024**3):.2f} GB",
            "uptime_hours": int(uptime.total_seconds() / 3600),
            "load_avg": os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
        }
    except Exception:
        return {"error": "unable_to_collect_metrics"}

def format_server_status_header(event_category: str = "system") -> str:
    """生成伺服器狀態標頭"""
    now = datetime.now(timezone.utc)
    hostname = socket.gethostname()
    metrics = get_system_metrics()
    
    decorations = DECORATIONS.get(event_category, DECORATIONS["system"])
    
    if "error" not in metrics:
        status_indicator = DECORATIONS["system"]["status_ok"]
        performance_status = f"{DECORATIONS['system']['performance']} CPU: {metrics['cpu_usage']} | {DECORATIONS['system']['memory']} MEM: {metrics['memory_usage']}"
    else:
        status_indicator = DECORATIONS["system"]["status_warn"]
        performance_status = f"{DECORATIONS['system']['status_warn']} System metrics unavailable"
    
    return f"""
{decorations.get('header', DECORATIONS['system']['header'])}
{status_indicator} **FORUMKIT SERVER STATUS REPORT** {status_indicator}
{DECORATIONS['system']['section']}
🏛️ **Hostname**: {hostname}
📅 **Timestamp**: {now.strftime('%Y-%m-%d %H:%M:%S')} UTC
⏰ **Uptime**: {metrics.get('uptime_hours', 0)} hours
{performance_status}
{DECORATIONS['system']['section']}
"""

def build_enhanced_theme_webhook(
    theme_name: str,
    description: str,
    colors: Dict[str, str],
    fonts: Dict[str, Any],
    layout: Dict[str, Any],
    author: str,
    **kwargs: Any
) -> Dict[str, Any]:
    """增強版主題提案 Webhook - 包含完整資訊和裝飾格式"""
    
    header = format_server_status_header("theme")
    
    # 構建詳細的主題資訊
    theme_details = f"""
{DECORATIONS['theme']['proposal']} **主題提案**: {theme_name}
{DECORATIONS['theme']['proposal']} **描述**: {description}
{DECORATIONS['theme']['proposal']} **設計者**: {author}

{DECORATIONS['system']['subsection']}
{DECORATIONS['theme']['colors']} **色彩配置**
{DECORATIONS['system']['bullet']} 主色調: {colors.get('primary', 'N/A')}
{DECORATIONS['system']['bullet']} 輔助色: {colors.get('secondary', 'N/A')} 
{DECORATIONS['system']['bullet']} 強調色: {colors.get('accent', 'N/A')}
{DECORATIONS['system']['bullet']} 背景色: {colors.get('background', 'N/A')}
{DECORATIONS['system']['bullet']} 表面色: {colors.get('surface', 'N/A')}
{DECORATIONS['system']['bullet']} 文字色: {colors.get('text', 'N/A')}
{DECORATIONS['system']['bullet']} 次文字: {colors.get('textMuted', 'N/A')}
{DECORATIONS['system']['bullet']} 邊框色: {colors.get('border', 'N/A')}
{DECORATIONS['system']['bullet']} 成功色: {colors.get('success', 'N/A')}
{DECORATIONS['system']['bullet']} 警告色: {colors.get('warning', 'N/A')}
{DECORATIONS['system']['bullet']} 錯誤色: {colors.get('error', 'N/A')}

{DECORATIONS['theme']['fonts']} **字體配置**
{DECORATIONS['system']['bullet']} 標題字體: {fonts.get('heading', 'N/A')}
{DECORATIONS['system']['bullet']} 內文字體: {fonts.get('body', 'N/A')}
{DECORATIONS['system']['bullet']} 等寬字體: {fonts.get('mono', 'N/A')}
{DECORATIONS['system']['bullet']} 字重設定: {fonts.get('weights', 'N/A')}
{DECORATIONS['system']['bullet']} 行高設定: {fonts.get('lineHeight', 'N/A')}

{DECORATIONS['theme']['layout']} **佈局配置**
{DECORATIONS['system']['bullet']} 圓角設定: {layout.get('borderRadius', 'N/A')}
{DECORATIONS['system']['bullet']} 間距系統: {layout.get('spacing', 'N/A')}
{DECORATIONS['system']['bullet']} 陰影效果: {layout.get('shadows', 'N/A')}

{DECORATIONS['theme']['animation']} **動畫配置**
{DECORATIONS['system']['bullet']} 動畫時長: {kwargs.get('animations', {}).get('duration', 'N/A')}
{DECORATIONS['system']['bullet']} 緩動函數: {kwargs.get('animations', {}).get('easing', 'N/A')}
{DECORATIONS['system']['end_section']}
"""
    
    from utils.notify import build_embed, color_for_kind
    
    embed = build_embed(
        kind="theme_proposal",
        title="🎨 主題設計提案",
        description=theme_details,
        color=color_for_kind("theme_proposal")
    )
    
    return {"content": header, "embeds": [embed]}

def build_enhanced_system_webhook(
    event_type: str,
    title: str, 
    description: str,
    severity: str = "medium",
    **kwargs: Any
) -> Dict[str, Any]:
    """增強版系統事件 Webhook"""
    
    category = event_type.split('.')[0] if '.' in event_type else 'system'
    header = format_server_status_header(category)
    
    # 嚴重程度指標
    severity_indicators = {
        "low": DECORATIONS["system"]["status_info"],
        "medium": DECORATIONS["system"]["status_warn"], 
        "high": DECORATIONS["system"]["status_error"],
        "critical": "🚨"
    }
    
    severity_icon = severity_indicators.get(severity, DECORATIONS["system"]["status_info"])
    
    # 系統狀態詳情
    system_details = f"""
{severity_icon} **事件**: {title}
{severity_icon} **類型**: {event_type}
{severity_icon} **嚴重程度**: {severity.upper()}
{severity_icon} **描述**: {description}

{DECORATIONS['system']['subsection']}
{DECORATIONS['system']['technical']} **技術細節**
{DECORATIONS['system']['bullet']} 事件 ID: {kwargs.get('event_id', 'N/A')}
{DECORATIONS['system']['bullet']} 請求 ID: {kwargs.get('request_id', 'N/A')}
{DECORATIONS['system']['bullet']} 客戶端 IP: {kwargs.get('client_ip', 'N/A')}
{DECORATIONS['system']['bullet']} User Agent: {kwargs.get('user_agent', 'N/A')[:50]}{'...' if len(kwargs.get('user_agent', '')) > 50 else ''}
{DECORATIONS['system']['bullet']} 操作者: {kwargs.get('actor', 'System')}
{DECORATIONS['system']['bullet']} 目標: {kwargs.get('target', 'N/A')}
{DECORATIONS['system']['end_section']}
"""
    
    from utils.notify import build_embed, color_for_kind
    
    embed = build_embed(
        kind=event_type,
        title=f"{severity_icon} 系統事件報告",
        description=system_details,
        color=color_for_kind(event_type)
    )
    
    return {"content": header, "embeds": [embed]}

def build_enhanced_content_webhook(
    action: str,
    content_type: str,  # post, comment, media
    content_id: Union[int, str],
    title: str,
    author: str,
    school: Optional[str] = None,
    **kwargs: Any
) -> Dict[str, Any]:
    """增強版內容管理 Webhook"""
    
    header = format_server_status_header("content")
    
    # 動作指標
    action_indicators = {
        "created": DECORATIONS["content"]["post"],
        "approved": DECORATIONS["content"]["approve"],
        "rejected": DECORATIONS["content"]["reject"],
        "deleted": "🗑️",
        "moderated": DECORATIONS["content"]["moderate"]
    }
    
    action_icon = action_indicators.get(action, DECORATIONS["content"]["post"])
    content_icon = DECORATIONS["content"].get(content_type, "📄")
    
    content_details = f"""
{action_icon} **內容{action}**: {title}
{content_icon} **類型**: {content_type.upper()}
{DECORATIONS['user']['profile']} **作者**: {author}
{DECORATIONS['school']['create']} **學校**: {school or '跨校'}

{DECORATIONS['system']['subsection']}
{DECORATIONS['system']['database']} **內容資訊**
{DECORATIONS['system']['bullet']} 內容 ID: #{content_id}
{DECORATIONS['system']['bullet']} 字數: {kwargs.get('word_count', 'N/A')}
{DECORATIONS['system']['bullet']} 媒體數量: {kwargs.get('media_count', 0)}
{DECORATIONS['system']['bullet']} 審核狀態: {kwargs.get('moderation_status', 'N/A')}
{DECORATIONS['system']['bullet']} 標籤: {', '.join(kwargs.get('tags', [])) if kwargs.get('tags') else 'N/A'}
{DECORATIONS['system']['end_section']}
"""
    
    from utils.notify import build_embed, color_for_kind
    
    embed = build_embed(
        kind=f"content.{content_type}.{action}",
        title=f"{action_icon} 內容管理報告", 
        description=content_details,
        color=color_for_kind("moderation")
    )
    
    return {"content": header, "embeds": [embed]}

def build_enhanced_user_webhook(
    action: str,
    user_id: Union[int, str], 
    username: str,
    role: str,
    school: Optional[str] = None,
    **kwargs: Any
) -> Dict[str, Any]:
    """增強版用戶管理 Webhook"""
    
    header = format_server_status_header("user")
    
    # 用戶動作指標
    action_indicators = {
        "registered": DECORATIONS["user"]["register"],
        "login": DECORATIONS["user"]["login"],
        "logout": DECORATIONS["user"]["logout"],
        "role_changed": DECORATIONS["user"]["role_change"],
        "profile_updated": DECORATIONS["user"]["profile"],
        "security_event": DECORATIONS["user"]["security"]
    }
    
    action_icon = action_indicators.get(action, DECORATIONS["user"]["profile"])
    
    user_details = f"""
{action_icon} **用戶{action}**: {username}
{DECORATIONS['user']['role_change']} **角色**: {role}
{DECORATIONS['school']['create']} **學校**: {school or '跨校'}

{DECORATIONS['system']['subsection']}
{DECORATIONS['system']['security']} **用戶資訊**  
{DECORATIONS['system']['bullet']} 用戶 ID: #{user_id}
{DECORATIONS['system']['bullet']} 註冊時間: {kwargs.get('registered_at', 'N/A')}
{DECORATIONS['system']['bullet']} 最後登入: {kwargs.get('last_login', 'N/A')}
{DECORATIONS['system']['bullet']} 登入次數: {kwargs.get('login_count', 'N/A')}
{DECORATIONS['system']['bullet']} 發文數: {kwargs.get('post_count', 'N/A')}
{DECORATIONS['system']['bullet']} 留言數: {kwargs.get('comment_count', 'N/A')}
{DECORATIONS['system']['end_section']}
"""
    
    from utils.notify import build_embed, color_for_kind
    
    embed = build_embed(
        kind=f"user.{action}",
        title=f"{action_icon} 用戶管理報告",
        description=user_details, 
        color=color_for_kind("user")
    )
    
    return {"content": header, "embeds": [embed]}

# =============== 統一發送介面 ===============
def send_enhanced_webhook(webhook_type: str, **kwargs: Any) -> Dict[str, Any]:
    """統一的增強版 Webhook 發送介面"""
    
    webhook_builders = {
        "theme_proposal": build_enhanced_theme_webhook,
        "system_event": build_enhanced_system_webhook, 
        "content_event": build_enhanced_content_webhook,
        "user_event": build_enhanced_user_webhook
    }
    
    builder = webhook_builders.get(webhook_type)
    if not builder:
        raise ValueError(f"Unknown webhook type: {webhook_type}")
    
    payload = builder(**kwargs)
    
    # 使用現有的發送機制
    from utils.notify import post_discord, get_admin_webhook_url
    
    webhook_url = get_admin_webhook_url()
    if not webhook_url:
        return {"ok": False, "error": "no_webhook_url"}
    
    return post_discord(webhook_url, payload)

# =============== 批次事件補丁 ===============  
def patch_missing_webhooks():
    """為缺失的事件類型添加 Webhook 支援"""
    
    missing_events = [
        "chat.message_sent",
        "chat.room_created", 
        "chat.user_joined",
        "chat.user_left",
        "websocket.connection_opened",
        "websocket.connection_closed", 
        "realtime.room_activity",
        "performance.high_cpu_usage",
        "performance.memory_warning",
        "performance.slow_query"
    ]
    
    # 這裡可以加入自動註冊缺失事件的 webhook 處理器
    print(f"[INFO] Need to implement webhooks for: {missing_events}")
    
    return missing_events

