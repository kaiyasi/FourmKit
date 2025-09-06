"""
Discord 管理服務
提供完整的 Discord Bot 管理、權限控制和自動化功能
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Union, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, func

from models.discord_config import (
    DiscordServerConfig, DiscordCommand, DiscordUserPermission, 
    DiscordActivityLog, DiscordAutomationRule, DiscordServerStats,
    DiscordPermissionLevel, DiscordCommandCategory, DiscordIntegrationType
)
from utils.db import get_session
import json
import hashlib
import os
from cryptography.fernet import Fernet


class DiscordPermissionError(Exception):
    """Discord 權限錯誤"""
    pass

class DiscordConfigError(Exception):
    """Discord 配置錯誤"""
    pass

class DiscordCommandError(Exception):
    """Discord 指令錯誤"""
    pass


class DiscordService:
    """Discord 管理服務核心類"""
    
    def __init__(self):
        self.encryption_key = self._get_encryption_key()
        self.cipher_suite = Fernet(self.encryption_key) if self.encryption_key else None
    
    def _get_encryption_key(self) -> bytes:
        """獲取加密密鑰"""
        key = os.getenv("DISCORD_ENCRYPTION_KEY", "")
        if not key:
            # 生成預設密鑰 (生產環境應使用環境變數)
            key = Fernet.generate_key().decode()
        if isinstance(key, str):
            key = key.encode()
        return key[:44]  # Fernet 密鑰必須是 44 字節
    
    def _encrypt_token(self, token: str) -> str:
        """加密 Bot Token"""
        if not self.cipher_suite:
            return token  # 如果沒有加密密鑰，直接返回
        return self.cipher_suite.encrypt(token.encode()).decode()
    
    def _decrypt_token(self, encrypted_token: str) -> str:
        """解密 Bot Token"""
        if not self.cipher_suite:
            return encrypted_token  # 如果沒有加密密鑰，直接返回
        try:
            return self.cipher_suite.decrypt(encrypted_token.encode()).decode()
        except Exception:
            return encrypted_token  # 解密失敗，可能是明文
    
    # ===================== 伺服器配置管理 =====================
    
    def get_server_config(self, session: Session, server_id: str) -> Optional[DiscordServerConfig]:
        """獲取伺服器配置"""
        return session.query(DiscordServerConfig).filter_by(server_id=server_id).first()
    
    def create_server_config(
        self, 
        session: Session,
        server_id: str,
        server_name: str,
        **config_data: Any
    ) -> DiscordServerConfig:
        """創建伺服器配置"""
        
        # 檢查是否已存在
        existing = self.get_server_config(session, server_id)
        if existing:
            raise DiscordConfigError(f"Server {server_id} already configured")
        
        # 加密 Bot Token
        if 'bot_token' in config_data and config_data['bot_token']:
            config_data['bot_token'] = self._encrypt_token(config_data['bot_token'])
        
        config = DiscordServerConfig(
            server_id=server_id,
            server_name=server_name,
            **config_data
        )
        
        session.add(config)
        session.commit()
        return config
    
    def update_server_config(
        self, 
        session: Session,
        server_id: str, 
        **updates: Any
    ) -> Optional[DiscordServerConfig]:
        """更新伺服器配置"""
        config = self.get_server_config(session, server_id)
        if not config:
            return None
        
        # 加密 Bot Token
        if 'bot_token' in updates and updates['bot_token']:
            updates['bot_token'] = self._encrypt_token(updates['bot_token'])
        
        for key, value in updates.items():
            if hasattr(config, key):
                setattr(config, key, value)
        
        config.updated_at = datetime.now(timezone.utc)
        session.commit()
        return config
    
    def get_active_servers(self, session: Session) -> List[DiscordServerConfig]:
        """獲取所有啟用的伺服器配置"""
        return session.query(DiscordServerConfig).filter_by(is_active=True).all()
    
    # ===================== 指令管理 =====================
    
    def create_command(
        self, 
        session: Session,
        server_id: int,
        command_name: str,
        description: str = "",
        **command_data: Any
    ) -> DiscordCommand:
        """創建指令"""
        
        # 檢查指令名稱是否已存在
        existing = session.query(DiscordCommand).filter_by(
            server_id=server_id,
            command_name=command_name
        ).first()
        
        if existing:
            raise DiscordCommandError(f"Command '{command_name}' already exists")
        
        command = DiscordCommand(
            server_id=server_id,
            command_name=command_name,
            description=description,
            **command_data
        )
        
        session.add(command)
        session.commit()
        return command
    
    def get_server_commands(
        self, 
        session: Session,
        server_id: int,
        category: Optional[str] = None,
        enabled_only: bool = True
    ) -> List[DiscordCommand]:
        """獲取伺服器指令列表"""
        query = session.query(DiscordCommand).filter_by(server_id=server_id)
        
        if category:
            query = query.filter_by(category=category)
        if enabled_only:
            query = query.filter_by(is_enabled=True)
        
        return query.order_by(DiscordCommand.category, DiscordCommand.command_name).all()
    
    def get_command(
        self, 
        session: Session,
        server_id: int,
        command_name: str
    ) -> Optional[DiscordCommand]:
        """獲取特定指令"""
        return session.query(DiscordCommand).filter_by(
            server_id=server_id,
            command_name=command_name
        ).first()
    
    def update_command(
        self, 
        session: Session,
        command_id: int,
        **updates: Any
    ) -> Optional[DiscordCommand]:
        """更新指令配置"""
        command = session.query(DiscordCommand).filter_by(id=command_id).first()
        if not command:
            return None
        
        for key, value in updates.items():
            if hasattr(command, key):
                setattr(command, key, value)
        
        command.updated_at = datetime.now(timezone.utc)
        session.commit()
        return command
    
    def delete_command(self, session: Session, command_id: int) -> bool:
        """删除指令"""
        command = session.query(DiscordCommand).filter_by(id=command_id).first()
        if not command:
            return False
        
        session.delete(command)
        session.commit()
        return True
    
    # ===================== 權限管理 =====================
    
    def check_user_permission(
        self, 
        session: Session,
        server_id: int,
        discord_user_id: str,
        required_permission: DiscordPermissionLevel,
        command_name: Optional[str] = None
    ) -> Tuple[bool, str]:
        """檢查用戶權限"""
        
        # 獲取用戶權限配置
        user_perm = session.query(DiscordUserPermission).filter_by(
            server_id=server_id,
            discord_user_id=discord_user_id,
            is_active=True
        ).first()
        
        if not user_perm:
            # 未配置的用戶默認為 USER 權限
            user_level = DiscordPermissionLevel.USER
        else:
            # 檢查是否被封鎖
            if user_perm.is_banned:
                if user_perm.ban_expires_at and user_perm.ban_expires_at > datetime.now(timezone.utc):
                    return False, f"用戶被封鎖至 {user_perm.ban_expires_at}"
                elif not user_perm.ban_expires_at:
                    return False, "用戶被永久封鎖"
                else:
                    # 封鎖已過期，自動解除
                    user_perm.is_banned = False
                    user_perm.ban_expires_at = None
                    session.commit()
            
            user_level = DiscordPermissionLevel(user_perm.permission_level)
        
        # 權限等級檢查
        permission_hierarchy = {
            DiscordPermissionLevel.GUEST: 0,
            DiscordPermissionLevel.USER: 1,
            DiscordPermissionLevel.MODERATOR: 2,
            DiscordPermissionLevel.ADMIN: 3,
            DiscordPermissionLevel.DEV_ADMIN: 4,
            DiscordPermissionLevel.OWNER: 5,
        }
        
        user_level_value = permission_hierarchy.get(user_level, 0)
        required_level_value = permission_hierarchy.get(required_permission, 0)
        
        if user_level_value < required_level_value:
            return False, f"權限不足：需要 {required_permission.value}，當前為 {user_level.value}"
        
        # 特定指令權限檢查
        if command_name and user_perm:
            command = self.get_command(session, server_id, command_name)
            if command:
                # 檢查拒絕列表
                denied_users = command.denied_users or []
                if discord_user_id in denied_users:
                    return False, "用戶在指令拒絕列表中"
                
                # 檢查允許列表（如果設定了允許列表，則只有列表中的用戶可以使用）
                allowed_users = command.allowed_users or []
                if allowed_users and discord_user_id not in allowed_users:
                    return False, "用戶不在指令允許列表中"
        
        return True, "權限檢查通過"
    
    def set_user_permission(
        self, 
        session: Session,
        server_id: int,
        discord_user_id: str,
        permission_level: DiscordPermissionLevel,
        discord_username: str = "",
        forumkit_user_id: Optional[int] = None,
        forumkit_role: Optional[str] = None
    ) -> DiscordUserPermission:
        """設定用戶權限"""
        
        user_perm = session.query(DiscordUserPermission).filter_by(
            server_id=server_id,
            discord_user_id=discord_user_id
        ).first()
        
        if user_perm:
            # 更新現有權限
            user_perm.permission_level = permission_level.value
            user_perm.discord_username = discord_username or user_perm.discord_username
            if forumkit_user_id:
                user_perm.forumkit_user_id = forumkit_user_id
            if forumkit_role:
                user_perm.forumkit_role = forumkit_role
            user_perm.updated_at = datetime.now(timezone.utc)
        else:
            # 創建新權限記錄
            user_perm = DiscordUserPermission(
                server_id=server_id,
                discord_user_id=discord_user_id,
                discord_username=discord_username,
                permission_level=permission_level.value,
                forumkit_user_id=forumkit_user_id,
                forumkit_role=forumkit_role
            )
            session.add(user_perm)
        
        session.commit()
        return user_perm
    
    def ban_user(
        self, 
        session: Session,
        server_id: int,
        discord_user_id: str,
        ban_reason: str,
        ban_duration_hours: Optional[int] = None
    ) -> bool:
        """封鎖用戶"""
        
        user_perm = session.query(DiscordUserPermission).filter_by(
            server_id=server_id,
            discord_user_id=discord_user_id
        ).first()
        
        if not user_perm:
            # 創建封鎖記錄
            user_perm = DiscordUserPermission(
                server_id=server_id,
                discord_user_id=discord_user_id,
                permission_level=DiscordPermissionLevel.USER.value
            )
            session.add(user_perm)
        
        user_perm.is_banned = True
        user_perm.ban_reason = ban_reason
        
        if ban_duration_hours:
            user_perm.ban_expires_at = datetime.now(timezone.utc) + timedelta(hours=ban_duration_hours)
        else:
            user_perm.ban_expires_at = None  # 永久封鎖
        
        session.commit()
        return True
    
    def unban_user(
        self, 
        session: Session,
        server_id: int,
        discord_user_id: str
    ) -> bool:
        """解除用戶封鎖"""
        
        user_perm = session.query(DiscordUserPermission).filter_by(
            server_id=server_id,
            discord_user_id=discord_user_id
        ).first()
        
        if not user_perm:
            return False
        
        user_perm.is_banned = False
        user_perm.ban_reason = None
        user_perm.ban_expires_at = None
        session.commit()
        return True
    
    # ===================== 活動記錄 =====================
    
    def log_activity(
        self, 
        session: Session,
        server_id: int,
        activity_type: str,
        activity_description: str,
        discord_user_id: Optional[str] = None,
        discord_username: Optional[str] = None,
        command_name: Optional[str] = None,
        command_args: Optional[Dict[str, Any]] = None,
        command_result: Optional[str] = None,
        is_success: Optional[bool] = None,
        error_message: Optional[str] = None,
        **metadata: Any
    ) -> DiscordActivityLog:
        """記錄活動"""
        
        log = DiscordActivityLog(
            server_id=server_id,
            activity_type=activity_type,
            activity_description=activity_description,
            discord_user_id=discord_user_id,
            discord_username=discord_username,
            command_name=command_name,
            command_args=command_args,
            command_result=command_result,
            is_success=is_success,
            error_message=error_message,
            metadata=metadata if metadata else None
        )
        
        session.add(log)
        session.commit()
        return log
    
    def get_activity_logs(
        self, 
        session: Session,
        server_id: int,
        activity_type: Optional[str] = None,
        discord_user_id: Optional[str] = None,
        command_name: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[DiscordActivityLog]:
        """獲取活動記錄"""
        
        query = session.query(DiscordActivityLog).filter_by(server_id=server_id)
        
        if activity_type:
            query = query.filter_by(activity_type=activity_type)
        if discord_user_id:
            query = query.filter_by(discord_user_id=discord_user_id)
        if command_name:
            query = query.filter_by(command_name=command_name)
        
        return query.order_by(desc(DiscordActivityLog.created_at)).limit(limit).offset(offset).all()
    
    # ===================== 統計功能 =====================
    
    def get_server_stats(
        self, 
        session: Session,
        server_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """獲取伺服器統計"""
        
        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)
        
        # 基本統計
        stats = {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "commands": {
                "total": 0,
                "successful": 0,
                "failed": 0,
                "by_category": {}
            },
            "users": {
                "total": 0,
                "active": 0,
                "banned": 0
            },
            "activities": {
                "total": 0,
                "by_type": {}
            }
        }
        
        # 指令統計
        commands = self.get_server_commands(session, server_id, enabled_only=False)
        for cmd in commands:
            category = cmd.category or 'other'
            if category not in stats["commands"]["by_category"]:
                stats["commands"]["by_category"][category] = 0
            stats["commands"]["by_category"][category] += cmd.usage_count or 0
            stats["commands"]["total"] += cmd.usage_count or 0
        
        # 用戶統計
        users = session.query(DiscordUserPermission).filter_by(server_id=server_id).all()
        stats["users"]["total"] = len(users)
        stats["users"]["banned"] = len([u for u in users if u.is_banned])
        
        # 活動統計
        activities = session.query(DiscordActivityLog).filter(
            and_(
                DiscordActivityLog.server_id == server_id,
                DiscordActivityLog.created_at >= start_date,
                DiscordActivityLog.created_at <= end_date
            )
        ).all()
        
        stats["activities"]["total"] = len(activities)
        stats["commands"]["successful"] = len([a for a in activities if a.is_success is True])
        stats["commands"]["failed"] = len([a for a in activities if a.is_success is False])
        
        # 按活動類型統計
        for activity in activities:
            activity_type = activity.activity_type
            if activity_type not in stats["activities"]["by_type"]:
                stats["activities"]["by_type"][activity_type] = 0
            stats["activities"]["by_type"][activity_type] += 1
        
        return stats
    
    # ===================== 預設指令和配置 =====================
    
    def setup_default_commands(self, session: Session, server_id: int) -> List[DiscordCommand]:
        """設置預設指令"""
        
        default_commands = [
            # 系統指令
            {
                "command_name": "status",
                "description": "查看系統狀態",
                "category": DiscordCommandCategory.SYSTEM,
                "required_permission": DiscordPermissionLevel.USER,
                "command_action": "system_status",
                "response_template": "🟢 系統運行正常\n⚡ CPU: {cpu_usage}\n🧠 記憶體: {memory_usage}"
            },
            {
                "command_name": "info",
                "description": "查看伺服器資訊",
                "category": DiscordCommandCategory.SYSTEM,
                "required_permission": DiscordPermissionLevel.USER,
                "command_action": "server_info"
            },
            
            # 審核指令
            {
                "command_name": "pending",
                "description": "查看待審核內容",
                "category": DiscordCommandCategory.MODERATION,
                "required_permission": DiscordPermissionLevel.MODERATOR,
                "command_action": "list_pending_content"
            },
            {
                "command_name": "approve",
                "description": "批准內容",
                "category": DiscordCommandCategory.MODERATION,
                "required_permission": DiscordPermissionLevel.MODERATOR,
                "command_action": "approve_content"
            },
            {
                "command_name": "reject",
                "description": "拒絕內容",
                "category": DiscordCommandCategory.MODERATION,
                "required_permission": DiscordPermissionLevel.MODERATOR,
                "command_action": "reject_content"
            },
            
            # 用戶管理指令
            {
                "command_name": "users",
                "description": "列出用戶",
                "category": DiscordCommandCategory.USER,
                "required_permission": DiscordPermissionLevel.MODERATOR,
                "command_action": "list_users"
            },
            {
                "command_name": "ban",
                "description": "封鎖用戶",
                "category": DiscordCommandCategory.USER,
                "required_permission": DiscordPermissionLevel.ADMIN,
                "command_action": "ban_user"
            },
            {
                "command_name": "unban",
                "description": "解除封鎖",
                "category": DiscordCommandCategory.USER,
                "required_permission": DiscordPermissionLevel.ADMIN,
                "command_action": "unban_user"
            },
            
            # 統計指令
            {
                "command_name": "stats",
                "description": "查看統計資料",
                "category": DiscordCommandCategory.STATS,
                "required_permission": DiscordPermissionLevel.MODERATOR,
                "command_action": "show_stats"
            },
            
            # 工具指令
            {
                "command_name": "help",
                "description": "顯示幫助資訊",
                "category": DiscordCommandCategory.UTILITY,
                "required_permission": DiscordPermissionLevel.USER,
                "command_action": "show_help"
            },
            {
                "command_name": "ping",
                "description": "測試連線",
                "category": DiscordCommandCategory.UTILITY,
                "required_permission": DiscordPermissionLevel.USER,
                "command_action": "ping",
                "response_template": "🏓 Pong! 延遲: {latency}ms"
            }
        ]
        
        created_commands = []
        for cmd_data in default_commands:
            try:
                # 檢查是否已存在
                existing = self.get_command(session, server_id, cmd_data["command_name"])
                if not existing:
                    command = self.create_command(session, server_id, **cmd_data)
                    created_commands.append(command)
            except DiscordCommandError:
                # 指令已存在，跳過
                continue
        
        return created_commands


# ===================== 全域服務實例 =====================
discord_service = DiscordService()