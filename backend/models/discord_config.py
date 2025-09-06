"""
Discord 管理服務資料模型
提供完整的 Discord Bot 配置、權限管理和指令控制功能
"""

from __future__ import annotations
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
from typing import Dict, Any, List, Optional
from enum import Enum

Base = declarative_base()

class DiscordPermissionLevel(str, Enum):
    """Discord 權限等級"""
    OWNER = "owner"           # 系統擁有者
    DEV_ADMIN = "dev_admin"   # 開發管理員
    ADMIN = "admin"           # 普通管理員
    MODERATOR = "moderator"   # 版主
    USER = "user"             # 普通用戶
    GUEST = "guest"           # 訪客

class DiscordCommandCategory(str, Enum):
    """Discord 指令分類"""
    SYSTEM = "system"         # 系統管理指令
    MODERATION = "moderation" # 內容審核指令
    USER = "user"            # 用戶管理指令
    CONTENT = "content"      # 內容管理指令
    STATS = "stats"          # 統計查詢指令
    CONFIG = "config"        # 配置管理指令
    UTILITY = "utility"      # 工具指令

class DiscordIntegrationType(str, Enum):
    """Discord 整合類型"""
    WEBHOOK_ONLY = "webhook_only"     # 僅 Webhook 通知
    BOT_BASIC = "bot_basic"           # 基本 Bot 功能
    BOT_ADVANCED = "bot_advanced"     # 進階 Bot 功能
    FULL_INTEGRATION = "full_integration"  # 完整整合

# ===================== 核心配置模型 =====================

class DiscordServerConfig(Base):
    """Discord 伺服器配置"""
    __tablename__ = 'discord_server_configs'
    
    id = Column(Integer, primary_key=True)
    
    # Discord 伺服器資訊
    server_id = Column(String(20), nullable=False, unique=True, comment="Discord 伺服器 ID")
    server_name = Column(String(100), nullable=False, comment="伺服器名稱")
    
    # Bot 配置
    bot_token = Column(Text, comment="Bot Token (加密存儲)")
    bot_user_id = Column(String(20), comment="Bot 用戶 ID")
    bot_nickname = Column(String(32), comment="Bot 暱稱")
    
    # Webhook 配置  
    webhook_url = Column(Text, comment="Webhook URL")
    webhook_name = Column(String(80), comment="Webhook 名稱")
    
    # 整合設定
    integration_type = Column(String(20), default=DiscordIntegrationType.WEBHOOK_ONLY, comment="整合類型")
    is_active = Column(Boolean, default=True, comment="是否啟用")
    auto_sync = Column(Boolean, default=False, comment="自動同步用戶角色")
    
    # 頻道配置
    default_channel_id = Column(String(20), comment="預設通知頻道 ID")
    admin_channel_id = Column(String(20), comment="管理員頻道 ID")  
    log_channel_id = Column(String(20), comment="日誌頻道 ID")
    moderation_channel_id = Column(String(20), comment="審核頻道 ID")
    
    # 角色配置
    admin_role_id = Column(String(20), comment="管理員角色 ID")
    moderator_role_id = Column(String(20), comment="版主角色 ID")
    user_role_id = Column(String(20), comment="用戶角色 ID")
    
    # 通知設定
    notification_settings = Column(JSON, comment="通知設定 JSON")
    
    # 時間戳記
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_connected = Column(DateTime(timezone=True), comment="最後連線時間")
    
    # 關聯關係
    commands = relationship("DiscordCommand", back_populates="server", cascade="all, delete-orphan")
    permissions = relationship("DiscordUserPermission", back_populates="server", cascade="all, delete-orphan")
    logs = relationship("DiscordActivityLog", back_populates="server", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<DiscordServerConfig(id={self.id}, server_name='{self.server_name}', active={self.is_active})>"


class DiscordCommand(Base):
    """Discord 指令配置"""
    __tablename__ = 'discord_commands'
    
    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey('discord_server_configs.id', ondelete='CASCADE'))
    
    # 指令基本資訊
    command_name = Column(String(32), nullable=False, comment="指令名稱")
    command_alias = Column(String(100), comment="指令別名 (JSON 陣列)")
    description = Column(Text, comment="指令描述")
    category = Column(String(20), default=DiscordCommandCategory.UTILITY, comment="指令分類")
    
    # 權限設定
    required_permission = Column(String(20), default=DiscordPermissionLevel.USER, comment="最低權限要求")
    allowed_roles = Column(JSON, comment="允許的角色 ID 列表")
    allowed_users = Column(JSON, comment="允許的用戶 ID 列表") 
    denied_users = Column(JSON, comment="拒絕的用戶 ID 列表")
    
    # 指令限制
    cooldown_seconds = Column(Integer, default=0, comment="冷卻時間(秒)")
    max_uses_per_hour = Column(Integer, default=0, comment="每小時最大使用次數")
    require_channel_ids = Column(JSON, comment="限制頻道 ID 列表")
    
    # 指令行為
    command_action = Column(String(50), comment="指令動作類型")
    action_params = Column(JSON, comment="動作參數")
    response_template = Column(Text, comment="回應模板")
    
    # 狀態管理
    is_enabled = Column(Boolean, default=True, comment="是否啟用")
    is_hidden = Column(Boolean, default=False, comment="是否隱藏")
    
    # 統計資訊
    usage_count = Column(Integer, default=0, comment="使用次數")
    last_used = Column(DateTime(timezone=True), comment="最後使用時間")
    
    # 時間戳記
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 關聯關係
    server = relationship("DiscordServerConfig", back_populates="commands")
    
    # 索引
    __table_args__ = (
        UniqueConstraint('server_id', 'command_name', name='uix_server_command'),
        Index('idx_discord_command_category', 'category'),
        Index('idx_discord_command_permission', 'required_permission'),
    )
    
    def __repr__(self):
        return f"<DiscordCommand(id={self.id}, name='{self.command_name}', enabled={self.is_enabled})>"


class DiscordUserPermission(Base):
    """Discord 用戶權限配置"""
    __tablename__ = 'discord_user_permissions'
    
    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey('discord_server_configs.id', ondelete='CASCADE'))
    
    # 用戶資訊
    discord_user_id = Column(String(20), nullable=False, comment="Discord 用戶 ID")
    discord_username = Column(String(32), comment="Discord 用戶名")
    discriminator = Column(String(4), comment="Discord 辨識碼")
    
    # 權限設定
    permission_level = Column(String(20), default=DiscordPermissionLevel.USER, comment="權限等級")
    custom_permissions = Column(JSON, comment="自訂權限列表")
    
    # ForumKit 關聯
    forumkit_user_id = Column(Integer, comment="ForumKit 用戶 ID")
    forumkit_role = Column(String(20), comment="ForumKit 角色")
    
    # 狀態管理
    is_active = Column(Boolean, default=True, comment="是否啟用")
    is_banned = Column(Boolean, default=False, comment="是否被封鎖")
    ban_reason = Column(Text, comment="封鎖原因")
    ban_expires_at = Column(DateTime(timezone=True), comment="封鎖到期時間")
    
    # 時間戳記
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_activity = Column(DateTime(timezone=True), comment="最後活動時間")
    
    # 關聯關係
    server = relationship("DiscordServerConfig", back_populates="permissions")
    
    # 索引
    __table_args__ = (
        UniqueConstraint('server_id', 'discord_user_id', name='uix_server_user'),
        Index('idx_discord_user_permission_level', 'permission_level'),
        Index('idx_discord_user_forumkit_id', 'forumkit_user_id'),
    )
    
    def __repr__(self):
        return f"<DiscordUserPermission(id={self.id}, discord_user='{self.discord_username}', level='{self.permission_level}')>"


# ===================== 活動記錄模型 =====================

class DiscordActivityLog(Base):
    """Discord 活動記錄"""
    __tablename__ = 'discord_activity_logs'
    
    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey('discord_server_configs.id', ondelete='CASCADE'))
    
    # 活動資訊
    activity_type = Column(String(50), nullable=False, comment="活動類型")
    activity_description = Column(Text, comment="活動描述")
    
    # 執行者資訊
    discord_user_id = Column(String(20), comment="Discord 用戶 ID")
    discord_username = Column(String(32), comment="Discord 用戶名")
    forumkit_user_id = Column(Integer, comment="ForumKit 用戶 ID")
    
    # 指令資訊 (如果是指令執行)
    command_name = Column(String(32), comment="執行的指令名稱")
    command_args = Column(JSON, comment="指令參數")
    command_result = Column(Text, comment="指令執行結果")
    
    # 額外資訊
    channel_id = Column(String(20), comment="頻道 ID")
    message_id = Column(String(20), comment="訊息 ID")
    metadata = Column(JSON, comment="其他元數據")
    
    # 狀態
    is_success = Column(Boolean, comment="是否成功")
    error_message = Column(Text, comment="錯誤訊息")
    
    # 時間戳記
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 關聯關係
    server = relationship("DiscordServerConfig", back_populates="logs")
    
    # 索引
    __table_args__ = (
        Index('idx_discord_activity_type', 'activity_type'),
        Index('idx_discord_activity_user', 'discord_user_id'),
        Index('idx_discord_activity_command', 'command_name'),
        Index('idx_discord_activity_created', 'created_at'),
    )
    
    def __repr__(self):
        return f"<DiscordActivityLog(id={self.id}, type='{self.activity_type}', user='{self.discord_username}')>"


# ===================== 自動化規則模型 =====================

class DiscordAutomationRule(Base):
    """Discord 自動化規則"""
    __tablename__ = 'discord_automation_rules'
    
    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey('discord_server_configs.id', ondelete='CASCADE'))
    
    # 規則基本資訊
    rule_name = Column(String(100), nullable=False, comment="規則名稱")
    rule_description = Column(Text, comment="規則描述")
    
    # 觸發條件
    trigger_type = Column(String(50), nullable=False, comment="觸發類型")
    trigger_conditions = Column(JSON, comment="觸發條件 JSON")
    
    # 執行動作
    action_type = Column(String(50), nullable=False, comment="動作類型")
    action_params = Column(JSON, comment="動作參數 JSON")
    
    # 規則設定
    is_enabled = Column(Boolean, default=True, comment="是否啟用")
    priority = Column(Integer, default=100, comment="優先級")
    
    # 限制條件
    cooldown_minutes = Column(Integer, default=0, comment="冷卻時間(分鐘)")
    max_executions_per_day = Column(Integer, default=0, comment="每日最大執行次數")
    
    # 統計資訊
    execution_count = Column(Integer, default=0, comment="執行次數")
    last_executed = Column(DateTime(timezone=True), comment="最後執行時間")
    
    # 時間戳記
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 索引
    __table_args__ = (
        Index('idx_discord_automation_trigger', 'trigger_type'),
        Index('idx_discord_automation_enabled', 'is_enabled'),
    )
    
    def __repr__(self):
        return f"<DiscordAutomationRule(id={self.id}, name='{self.rule_name}', enabled={self.is_enabled})>"


# ===================== 統計模型 =====================

class DiscordServerStats(Base):
    """Discord 伺服器統計"""
    __tablename__ = 'discord_server_stats'
    
    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey('discord_server_configs.id', ondelete='CASCADE'))
    
    # 統計日期
    stats_date = Column(DateTime(timezone=True), nullable=False, comment="統計日期")
    
    # 用戶統計
    total_members = Column(Integer, default=0, comment="總成員數")
    active_members = Column(Integer, default=0, comment="活躍成員數")
    new_members = Column(Integer, default=0, comment="新成員數")
    
    # 指令統計
    commands_executed = Column(Integer, default=0, comment="指令執行次數")
    successful_commands = Column(Integer, default=0, comment="成功指令次數")
    failed_commands = Column(Integer, default=0, comment="失敗指令次數")
    
    # 通知統計
    notifications_sent = Column(Integer, default=0, comment="發送通知數")
    webhooks_delivered = Column(Integer, default=0, comment="Webhook 成功投遞數")
    
    # 自動化統計
    automation_executions = Column(Integer, default=0, comment="自動化規則執行次數")
    
    # 時間戳記
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 索引
    __table_args__ = (
        UniqueConstraint('server_id', 'stats_date', name='uix_server_stats_date'),
        Index('idx_discord_stats_date', 'stats_date'),
    )
    
    def __repr__(self):
        return f"<DiscordServerStats(id={self.id}, date='{self.stats_date}', members={self.total_members})>"