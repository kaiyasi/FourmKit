"""
Discord 管理 API 路由
提供 Discord Bot 配置、權限管理和指令控制的 REST API
"""

from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone, timedelta
from functools import wraps
from typing import Dict, Any, List, Optional
import json

from services.discord_service import discord_service, DiscordPermissionLevel, DiscordCommandCategory, DiscordIntegrationType
from models.discord_config import DiscordServerConfig, DiscordCommand, DiscordUserPermission, DiscordActivityLog
from utils.db import get_session
from utils.auth import get_user_info, require_auth, admin_required
from utils.notify import send_admin_event

discord_bp = Blueprint('discord', __name__, url_prefix='/api/discord')

# ===================== 權限檢查裝飾器 =====================

def discord_admin_required(f):
    """要求 Discord 管理員權限"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_info = get_user_info()
        if not user_info:
            return jsonify({'success': False, 'error': '未登入'}), 401
        
        role = user_info.get('role')
        if role not in ['dev_admin', 'admin']:
            return jsonify({'success': False, 'error': 'Discord 管理功能需要管理員權限'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

# ===================== 伺服器配置 API =====================

@discord_bp.route('/servers', methods=['GET'])
@require_auth
@discord_admin_required
def get_servers():
    """獲取所有 Discord 伺服器配置"""
    try:
        with get_session() as session:
            servers = session.query(DiscordServerConfig).order_by(DiscordServerConfig.created_at.desc()).all()
            
            server_list = []
            for server in servers:
                server_dict = {
                    'id': server.id,
                    'server_id': server.server_id,
                    'server_name': server.server_name,
                    'bot_user_id': server.bot_user_id,
                    'bot_nickname': server.bot_nickname,
                    'integration_type': server.integration_type,
                    'is_active': server.is_active,
                    'auto_sync': server.auto_sync,
                    'default_channel_id': server.default_channel_id,
                    'admin_channel_id': server.admin_channel_id,
                    'log_channel_id': server.log_channel_id,
                    'moderation_channel_id': server.moderation_channel_id,
                    'admin_role_id': server.admin_role_id,
                    'moderator_role_id': server.moderator_role_id,
                    'user_role_id': server.user_role_id,
                    'created_at': server.created_at.isoformat() if server.created_at else None,
                    'last_connected': server.last_connected.isoformat() if server.last_connected else None,
                    'webhook_configured': bool(server.webhook_url),
                    'bot_configured': bool(server.bot_token),
                }
                server_list.append(server_dict)
            
            return jsonify({'success': True, 'data': server_list})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'獲取伺服器配置失敗: {str(e)}'}), 500

@discord_bp.route('/servers', methods=['POST'])
@require_auth
@discord_admin_required
def create_server():
    """創建 Discord 伺服器配置"""
    try:
        data = request.get_json()
        required_fields = ['server_id', 'server_name']
        
        # 驗證必填欄位
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'缺少必填欄位: {field}'}), 400
        
        # 驗證整合類型
        integration_type = data.get('integration_type', 'webhook_only')
        if integration_type not in [e.value for e in DiscordIntegrationType]:
            return jsonify({'success': False, 'error': '無效的整合類型'}), 400
        
        with get_session() as session:
            # 檢查伺服器 ID 是否已存在
            existing = discord_service.get_server_config(session, data['server_id'])
            if existing:
                return jsonify({'success': False, 'error': '該 Discord 伺服器已配置'}), 409
            
            # 創建配置
            config_data = {
                'bot_token': data.get('bot_token'),
                'bot_nickname': data.get('bot_nickname'),
                'webhook_url': data.get('webhook_url'),
                'webhook_name': data.get('webhook_name'),
                'integration_type': integration_type,
                'auto_sync': data.get('auto_sync', False),
                'default_channel_id': data.get('default_channel_id'),
                'admin_channel_id': data.get('admin_channel_id'),
                'log_channel_id': data.get('log_channel_id'),
                'moderation_channel_id': data.get('moderation_channel_id'),
                'admin_role_id': data.get('admin_role_id'),
                'moderator_role_id': data.get('moderator_role_id'),
                'user_role_id': data.get('user_role_id'),
                'notification_settings': data.get('notification_settings'),
            }
            
            server_config = discord_service.create_server_config(
                session, 
                data['server_id'], 
                data['server_name'],
                **config_data
            )
            
            # 設置預設指令
            default_commands = discord_service.setup_default_commands(session, server_config.id)
            
            # 記錄活動
            user_info = get_user_info()
            discord_service.log_activity(
                session, server_config.id, "server_created",
                f"創建 Discord 伺服器配置: {data['server_name']}",
                forumkit_user_id=user_info.get('user_id'),
                metadata={'integration_type': integration_type, 'default_commands': len(default_commands)}
            )
            
            # 發送通知
            send_admin_event(
                "discord.server_created",
                f"Discord 伺服器配置已創建",
                f"伺服器 {data['server_name']} 已成功配置，整合類型: {integration_type}",
                actor=user_info.get('username', 'System'),
                source="Discord管理"
            )
            
            return jsonify({
                'success': True, 
                'data': {
                    'id': server_config.id,
                    'default_commands_created': len(default_commands)
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'創建伺服器配置失敗: {str(e)}'}), 500

@discord_bp.route('/servers/<int:server_id>', methods=['PUT'])
@require_auth
@discord_admin_required
def update_server(server_id: int):
    """更新 Discord 伺服器配置"""
    try:
        data = request.get_json()
        
        with get_session() as session:
            server = session.query(DiscordServerConfig).filter_by(id=server_id).first()
            if not server:
                return jsonify({'success': False, 'error': '伺服器配置不存在'}), 404
            
            # 更新欄位
            updatable_fields = [
                'server_name', 'bot_token', 'bot_nickname', 'webhook_url', 'webhook_name',
                'integration_type', 'is_active', 'auto_sync', 'default_channel_id',
                'admin_channel_id', 'log_channel_id', 'moderation_channel_id',
                'admin_role_id', 'moderator_role_id', 'user_role_id', 'notification_settings'
            ]
            
            updates = {}
            for field in updatable_fields:
                if field in data:
                    updates[field] = data[field]
            
            updated_server = discord_service.update_server_config(
                session, server.server_id, **updates
            )
            
            if updated_server:
                # 記錄活動
                user_info = get_user_info()
                discord_service.log_activity(
                    session, server.id, "server_updated",
                    f"更新 Discord 伺服器配置: {server.server_name}",
                    forumkit_user_id=user_info.get('user_id'),
                    metadata={'updated_fields': list(updates.keys())}
                )
                
                return jsonify({'success': True, 'data': {'updated_fields': list(updates.keys())}})
            else:
                return jsonify({'success': False, 'error': '更新失敗'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'更新伺服器配置失敗: {str(e)}'}), 500

@discord_bp.route('/servers/<int:server_id>', methods=['DELETE'])
@require_auth
@discord_admin_required
def delete_server(server_id: int):
    """刪除 Discord 伺服器配置"""
    try:
        with get_session() as session:
            server = session.query(DiscordServerConfig).filter_by(id=server_id).first()
            if not server:
                return jsonify({'success': False, 'error': '伺服器配置不存在'}), 404
            
            server_name = server.server_name
            session.delete(server)
            session.commit()
            
            # 記錄活動
            user_info = get_user_info()
            send_admin_event(
                "discord.server_deleted",
                f"Discord 伺服器配置已刪除",
                f"伺服器 {server_name} 的配置已被刪除",
                actor=user_info.get('username', 'System'),
                source="Discord管理"
            )
            
            return jsonify({'success': True})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'刪除伺服器配置失敗: {str(e)}'}), 500

# ===================== 指令管理 API =====================

@discord_bp.route('/commands', methods=['GET'])
@require_auth
@discord_admin_required
def get_commands():
    """獲取所有 Discord 指令"""
    try:
        server_id = request.args.get('server_id', type=int)
        category = request.args.get('category')
        enabled_only = request.args.get('enabled_only', 'false').lower() == 'true'
        
        with get_session() as session:
            if server_id:
                # 獲取特定伺服器的指令
                commands = discord_service.get_server_commands(
                    session, server_id, category=category, enabled_only=enabled_only
                )
            else:
                # 獲取所有指令
                query = session.query(DiscordCommand)
                if category:
                    query = query.filter_by(category=category)
                if enabled_only:
                    query = query.filter_by(is_enabled=True)
                commands = query.order_by(DiscordCommand.category, DiscordCommand.command_name).all()
            
            command_list = []
            for cmd in commands:
                command_dict = {
                    'id': cmd.id,
                    'server_id': cmd.server_id,
                    'command_name': cmd.command_name,
                    'description': cmd.description,
                    'category': cmd.category,
                    'required_permission': cmd.required_permission,
                    'is_enabled': cmd.is_enabled,
                    'is_hidden': cmd.is_hidden,
                    'usage_count': cmd.usage_count,
                    'last_used': cmd.last_used.isoformat() if cmd.last_used else None,
                    'cooldown_seconds': cmd.cooldown_seconds,
                    'max_uses_per_hour': cmd.max_uses_per_hour,
                    'allowed_roles': cmd.allowed_roles,
                    'allowed_users': cmd.allowed_users,
                    'denied_users': cmd.denied_users,
                    'require_channel_ids': cmd.require_channel_ids,
                    'command_action': cmd.command_action,
                    'response_template': cmd.response_template,
                }
                command_list.append(command_dict)
            
            return jsonify({'success': True, 'data': command_list})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'獲取指令列表失敗: {str(e)}'}), 500

@discord_bp.route('/commands', methods=['POST'])
@require_auth
@discord_admin_required
def create_command():
    """創建 Discord 指令"""
    try:
        data = request.get_json()
        required_fields = ['server_id', 'command_name', 'description']
        
        # 驗證必填欄位
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'缺少必填欄位: {field}'}), 400
        
        with get_session() as session:
            command_data = {
                'category': data.get('category', 'utility'),
                'required_permission': data.get('required_permission', 'user'),
                'is_enabled': data.get('is_enabled', True),
                'is_hidden': data.get('is_hidden', False),
                'cooldown_seconds': data.get('cooldown_seconds', 0),
                'max_uses_per_hour': data.get('max_uses_per_hour', 0),
                'allowed_roles': data.get('allowed_roles'),
                'allowed_users': data.get('allowed_users'),
                'denied_users': data.get('denied_users'),
                'require_channel_ids': data.get('require_channel_ids'),
                'command_action': data.get('command_action'),
                'action_params': data.get('action_params'),
                'response_template': data.get('response_template'),
            }
            
            command = discord_service.create_command(
                session,
                data['server_id'],
                data['command_name'],
                data['description'],
                **command_data
            )
            
            # 記錄活動
            user_info = get_user_info()
            discord_service.log_activity(
                session, data['server_id'], "command_created",
                f"創建指令: {data['command_name']}",
                forumkit_user_id=user_info.get('user_id'),
                command_name=data['command_name'],
                metadata={'category': data.get('category')}
            )
            
            return jsonify({'success': True, 'data': {'id': command.id}})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'創建指令失敗: {str(e)}'}), 500

@discord_bp.route('/commands/<int:command_id>', methods=['PUT'])
@require_auth
@discord_admin_required
def update_command(command_id: int):
    """更新 Discord 指令"""
    try:
        data = request.get_json()
        
        with get_session() as session:
            command = session.query(DiscordCommand).filter_by(id=command_id).first()
            if not command:
                return jsonify({'success': False, 'error': '指令不存在'}), 404
            
            updated_command = discord_service.update_command(session, command_id, **data)
            
            if updated_command:
                # 記錄活動
                user_info = get_user_info()
                discord_service.log_activity(
                    session, command.server_id, "command_updated",
                    f"更新指令: {command.command_name}",
                    forumkit_user_id=user_info.get('user_id'),
                    command_name=command.command_name,
                    metadata={'updated_fields': list(data.keys())}
                )
                
                return jsonify({'success': True})
            else:
                return jsonify({'success': False, 'error': '更新失敗'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'更新指令失敗: {str(e)}'}), 500

@discord_bp.route('/commands/<int:command_id>', methods=['DELETE'])
@require_auth
@discord_admin_required
def delete_command(command_id: int):
    """刪除 Discord 指令"""
    try:
        with get_session() as session:
            command = session.query(DiscordCommand).filter_by(id=command_id).first()
            if not command:
                return jsonify({'success': False, 'error': '指令不存在'}), 404
            
            command_name = command.command_name
            server_id = command.server_id
            
            success = discord_service.delete_command(session, command_id)
            
            if success:
                # 記錄活動
                user_info = get_user_info()
                discord_service.log_activity(
                    session, server_id, "command_deleted",
                    f"刪除指令: {command_name}",
                    forumkit_user_id=user_info.get('user_id'),
                    command_name=command_name
                )
                
                return jsonify({'success': True})
            else:
                return jsonify({'success': False, 'error': '刪除失敗'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'刪除指令失敗: {str(e)}'}), 500

# ===================== 用戶權限管理 API =====================

@discord_bp.route('/users', methods=['GET'])
@require_auth
@discord_admin_required
def get_users():
    """獲取 Discord 用戶權限"""
    try:
        server_id = request.args.get('server_id', type=int)
        permission_level = request.args.get('permission_level')
        active_only = request.args.get('active_only', 'false').lower() == 'true'
        
        with get_session() as session:
            query = session.query(DiscordUserPermission)
            
            if server_id:
                query = query.filter_by(server_id=server_id)
            if permission_level:
                query = query.filter_by(permission_level=permission_level)
            if active_only:
                query = query.filter_by(is_active=True, is_banned=False)
            
            users = query.order_by(DiscordUserPermission.permission_level, DiscordUserPermission.discord_username).all()
            
            user_list = []
            for user in users:
                user_dict = {
                    'id': user.id,
                    'server_id': user.server_id,
                    'discord_user_id': user.discord_user_id,
                    'discord_username': user.discord_username,
                    'discriminator': user.discriminator,
                    'permission_level': user.permission_level,
                    'custom_permissions': user.custom_permissions,
                    'forumkit_user_id': user.forumkit_user_id,
                    'forumkit_role': user.forumkit_role,
                    'is_active': user.is_active,
                    'is_banned': user.is_banned,
                    'ban_reason': user.ban_reason,
                    'ban_expires_at': user.ban_expires_at.isoformat() if user.ban_expires_at else None,
                    'last_activity': user.last_activity.isoformat() if user.last_activity else None,
                    'created_at': user.created_at.isoformat() if user.created_at else None,
                }
                user_list.append(user_dict)
            
            return jsonify({'success': True, 'data': user_list})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'獲取用戶權限失敗: {str(e)}'}), 500

@discord_bp.route('/users', methods=['POST'])
@require_auth
@discord_admin_required
def set_user_permission():
    """設定用戶權限"""
    try:
        data = request.get_json()
        required_fields = ['server_id', 'discord_user_id', 'permission_level']
        
        # 驗證必填欄位
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'error': f'缺少必填欄位: {field}'}), 400
        
        # 驗證權限等級
        try:
            permission_level = DiscordPermissionLevel(data['permission_level'])
        except ValueError:
            return jsonify({'success': False, 'error': '無效的權限等級'}), 400
        
        with get_session() as session:
            user_perm = discord_service.set_user_permission(
                session,
                data['server_id'],
                data['discord_user_id'],
                permission_level,
                discord_username=data.get('discord_username', ''),
                forumkit_user_id=data.get('forumkit_user_id'),
                forumkit_role=data.get('forumkit_role')
            )
            
            # 記錄活動
            user_info = get_user_info()
            discord_service.log_activity(
                session, data['server_id'], "user_permission_set",
                f"設定用戶權限: {data.get('discord_username', data['discord_user_id'])} -> {permission_level.value}",
                forumkit_user_id=user_info.get('user_id'),
                discord_user_id=data['discord_user_id'],
                discord_username=data.get('discord_username'),
                metadata={'permission_level': permission_level.value}
            )
            
            return jsonify({'success': True, 'data': {'id': user_perm.id}})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'設定用戶權限失敗: {str(e)}'}), 500

@discord_bp.route('/users/<int:user_id>/ban', methods=['POST'])
@require_auth
@discord_admin_required
def ban_user(user_id: int):
    """封鎖用戶"""
    try:
        data = request.get_json()
        ban_reason = data.get('ban_reason', '違反使用規定')
        ban_duration_hours = data.get('ban_duration_hours')  # None = 永久封鎖
        
        with get_session() as session:
            user_perm = session.query(DiscordUserPermission).filter_by(id=user_id).first()
            if not user_perm:
                return jsonify({'success': False, 'error': '用戶不存在'}), 404
            
            success = discord_service.ban_user(
                session,
                user_perm.server_id,
                user_perm.discord_user_id,
                ban_reason,
                ban_duration_hours
            )
            
            if success:
                # 記錄活動
                user_info = get_user_info()
                discord_service.log_activity(
                    session, user_perm.server_id, "user_banned",
                    f"封鎖用戶: {user_perm.discord_username}",
                    forumkit_user_id=user_info.get('user_id'),
                    discord_user_id=user_perm.discord_user_id,
                    discord_username=user_perm.discord_username,
                    metadata={'ban_reason': ban_reason, 'duration_hours': ban_duration_hours}
                )
                
                return jsonify({'success': True})
            else:
                return jsonify({'success': False, 'error': '封鎖失敗'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'封鎖用戶失敗: {str(e)}'}), 500

@discord_bp.route('/users/<int:user_id>/unban', methods=['POST'])
@require_auth
@discord_admin_required
def unban_user(user_id: int):
    """解除用戶封鎖"""
    try:
        with get_session() as session:
            user_perm = session.query(DiscordUserPermission).filter_by(id=user_id).first()
            if not user_perm:
                return jsonify({'success': False, 'error': '用戶不存在'}), 404
            
            success = discord_service.unban_user(
                session,
                user_perm.server_id,
                user_perm.discord_user_id
            )
            
            if success:
                # 記錄活動
                user_info = get_user_info()
                discord_service.log_activity(
                    session, user_perm.server_id, "user_unbanned",
                    f"解除封鎖: {user_perm.discord_username}",
                    forumkit_user_id=user_info.get('user_id'),
                    discord_user_id=user_perm.discord_user_id,
                    discord_username=user_perm.discord_username
                )
                
                return jsonify({'success': True})
            else:
                return jsonify({'success': False, 'error': '解除封鎖失敗'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'解除封鎖失敗: {str(e)}'}), 500

# ===================== 統計和日誌 API =====================

@discord_bp.route('/stats', methods=['GET'])
@require_auth
@discord_admin_required
def get_stats():
    """獲取 Discord 統計數據"""
    try:
        server_id = request.args.get('server_id', type=int)
        days = request.args.get('days', 30, type=int)
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        end_date = datetime.now(timezone.utc)
        
        with get_session() as session:
            if server_id:
                stats = discord_service.get_server_stats(session, server_id, start_date, end_date)
            else:
                # 獲取所有伺服器的統計
                servers = session.query(DiscordServerConfig).all()
                combined_stats = {
                    "period": {
                        "start": start_date.isoformat(),
                        "end": end_date.isoformat()
                    },
                    "commands": {"total": 0, "successful": 0, "failed": 0, "by_category": {}},
                    "users": {"total": 0, "active": 0, "banned": 0},
                    "activities": {"total": 0, "by_type": {}}
                }
                
                for server in servers:
                    server_stats = discord_service.get_server_stats(session, server.id, start_date, end_date)
                    
                    # 合併統計
                    combined_stats["commands"]["total"] += server_stats["commands"]["total"]
                    combined_stats["commands"]["successful"] += server_stats["commands"]["successful"]
                    combined_stats["commands"]["failed"] += server_stats["commands"]["failed"]
                    combined_stats["users"]["total"] += server_stats["users"]["total"]
                    combined_stats["users"]["banned"] += server_stats["users"]["banned"]
                    combined_stats["activities"]["total"] += server_stats["activities"]["total"]
                    
                    # 合併分類統計
                    for category, count in server_stats["commands"]["by_category"].items():
                        combined_stats["commands"]["by_category"][category] = \
                            combined_stats["commands"]["by_category"].get(category, 0) + count
                    
                    for activity_type, count in server_stats["activities"]["by_type"].items():
                        combined_stats["activities"]["by_type"][activity_type] = \
                            combined_stats["activities"]["by_type"].get(activity_type, 0) + count
                
                stats = combined_stats
            
            return jsonify({'success': True, 'data': stats})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'獲取統計數據失敗: {str(e)}'}), 500

@discord_bp.route('/logs', methods=['GET'])
@require_auth
@discord_admin_required
def get_activity_logs():
    """獲取 Discord 活動記錄"""
    try:
        server_id = request.args.get('server_id', type=int)
        activity_type = request.args.get('activity_type')
        discord_user_id = request.args.get('discord_user_id')
        command_name = request.args.get('command_name')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # 限制查詢數量
        limit = min(limit, 500)
        
        with get_session() as session:
            if server_id:
                logs = discord_service.get_activity_logs(
                    session, server_id, activity_type, discord_user_id, command_name, limit, offset
                )
            else:
                # 查詢所有伺服器的日誌
                query = session.query(DiscordActivityLog)
                
                if activity_type:
                    query = query.filter_by(activity_type=activity_type)
                if discord_user_id:
                    query = query.filter_by(discord_user_id=discord_user_id)
                if command_name:
                    query = query.filter_by(command_name=command_name)
                
                logs = query.order_by(DiscordActivityLog.created_at.desc()).limit(limit).offset(offset).all()
            
            log_list = []
            for log in logs:
                log_dict = {
                    'id': log.id,
                    'server_id': log.server_id,
                    'activity_type': log.activity_type,
                    'activity_description': log.activity_description,
                    'discord_user_id': log.discord_user_id,
                    'discord_username': log.discord_username,
                    'forumkit_user_id': log.forumkit_user_id,
                    'command_name': log.command_name,
                    'command_args': log.command_args,
                    'command_result': log.command_result,
                    'channel_id': log.channel_id,
                    'message_id': log.message_id,
                    'is_success': log.is_success,
                    'error_message': log.error_message,
                    'metadata': log.metadata,
                    'created_at': log.created_at.isoformat() if log.created_at else None,
                }
                log_list.append(log_dict)
            
            return jsonify({'success': True, 'data': log_list})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'獲取活動記錄失敗: {str(e)}'}), 500

# ===================== 系統狀態 API =====================

@discord_bp.route('/status', methods=['GET'])
@require_auth
@discord_admin_required
def get_system_status():
    """獲取 Discord 系統狀態"""
    try:
        with get_session() as session:
            # 統計基本信息
            total_servers = session.query(DiscordServerConfig).count()
            active_servers = session.query(DiscordServerConfig).filter_by(is_active=True).count()
            total_commands = session.query(DiscordCommand).count()
            enabled_commands = session.query(DiscordCommand).filter_by(is_enabled=True).count()
            total_users = session.query(DiscordUserPermission).count()
            banned_users = session.query(DiscordUserPermission).filter_by(is_banned=True).count()
            
            # 最近活動
            recent_logs = session.query(DiscordActivityLog).order_by(
                DiscordActivityLog.created_at.desc()
            ).limit(10).all()
            
            recent_activities = []
            for log in recent_logs:
                recent_activities.append({
                    'activity_type': log.activity_type,
                    'description': log.activity_description,
                    'discord_username': log.discord_username,
                    'is_success': log.is_success,
                    'created_at': log.created_at.isoformat() if log.created_at else None
                })
            
            status = {
                'servers': {
                    'total': total_servers,
                    'active': active_servers,
                    'inactive': total_servers - active_servers
                },
                'commands': {
                    'total': total_commands,
                    'enabled': enabled_commands,
                    'disabled': total_commands - enabled_commands
                },
                'users': {
                    'total': total_users,
                    'active': total_users - banned_users,
                    'banned': banned_users
                },
                'recent_activities': recent_activities,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            return jsonify({'success': True, 'data': status})
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'獲取系統狀態失敗: {str(e)}'}), 500