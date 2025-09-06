"""
Discord Bot 執行引擎
處理 Discord Bot 的連線、指令執行和事件處理
"""

import asyncio
import json
import os
import sys
from typing import Dict, Any, List, Optional, Union, Callable
from datetime import datetime, timezone
import logging
from dataclasses import dataclass

# Discord.py imports
try:
    import discord
    from discord.ext import commands, tasks
    DISCORD_AVAILABLE = True
except ImportError:
    DISCORD_AVAILABLE = False
    print("警告: discord.py 未安裝，Discord Bot 功能將無法使用")

# Redis imports for event queue
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from services.discord_service import discord_service, DiscordPermissionLevel
from utils.db import get_session
from models.discord_config import DiscordServerConfig, DiscordCommand


@dataclass
class BotContext:
    """Bot 執行上下文"""
    server_id: str
    channel_id: str
    user_id: str
    username: str
    message_id: str
    command_name: str
    args: List[str]
    raw_message: str


class DiscordBotEngine:
    """Discord Bot 執行引擎"""
    
    def __init__(self):
        self.bot: Optional[commands.Bot] = None
        self.redis_client: Optional[redis.Redis] = None
        self.active_servers: Dict[str, DiscordServerConfig] = {}
        self.command_handlers: Dict[str, Callable] = {}
        self.logger = logging.getLogger(__name__)
        
        # 設置日誌
        logging.basicConfig(level=logging.INFO)
        
        if not DISCORD_AVAILABLE:
            self.logger.error("Discord.py 未安裝，Bot 功能無法使用")
            return
        
        self._setup_command_handlers()
    
    async def initialize(self) -> bool:
        """初始化 Bot"""
        if not DISCORD_AVAILABLE:
            return False
        
        try:
            # 初始化 Redis 連線
            if REDIS_AVAILABLE:
                redis_url = os.getenv("REDIS_URL", "redis://redis:80/0")
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                await self.redis_client.ping()
                self.logger.info("Redis 連線成功")
            
            # 載入伺服器配置
            await self._load_server_configs()
            
            # 啟動事件處理器
            if self.redis_client:
                self._event_processor.start()
            
            self.logger.info("Discord Bot 引擎初始化完成")
            return True
            
        except Exception as e:
            self.logger.error(f"Bot 初始化失敗: {e}")
            return False
    
    async def _load_server_configs(self):
        """載入所有啟用的伺服器配置"""
        try:
            with get_session() as session:
                configs = discord_service.get_active_servers(session)
                
                for config in configs:
                    if config.integration_type in ['bot_basic', 'bot_advanced', 'full_integration']:
                        self.active_servers[config.server_id] = config
                        
                self.logger.info(f"載入了 {len(self.active_servers)} 個伺服器配置")
                
        except Exception as e:
            self.logger.error(f"載入伺服器配置失敗: {e}")
    
    def _setup_command_handlers(self):
        """設置指令處理器"""
        self.command_handlers = {
            # 系統指令
            "status": self._handle_status,
            "info": self._handle_info,
            "ping": self._handle_ping,
            
            # 審核指令
            "pending": self._handle_pending,
            "approve": self._handle_approve,
            "reject": self._handle_reject,
            
            # 用戶管理
            "users": self._handle_users,
            "ban": self._handle_ban,
            "unban": self._handle_unban,
            
            # 統計指令
            "stats": self._handle_stats,
            
            # 工具指令
            "help": self._handle_help,
        }
    
    async def create_bot_instance(self, server_config: DiscordServerConfig) -> Optional[commands.Bot]:
        """為特定伺服器創建 Bot 實例"""
        if not DISCORD_AVAILABLE:
            return None
        
        try:
            # 解密 Token
            token = discord_service._decrypt_token(server_config.bot_token)
            
            # 設置 Bot 意圖
            intents = discord.Intents.default()
            intents.message_content = True
            intents.guilds = True
            intents.members = True
            
            # 創建 Bot 實例
            bot = commands.Bot(
                command_prefix='!fk ',
                intents=intents,
                help_command=None  # 使用自訂幫助指令
            )
            
            @bot.event
            async def on_ready():
                self.logger.info(f'Bot 已連線到伺服器: {bot.user} (ID: {bot.user.id})')
                
                # 更新伺服器配置
                with get_session() as session:
                    discord_service.update_server_config(
                        session, 
                        server_config.server_id,
                        bot_user_id=str(bot.user.id),
                        last_connected=datetime.now(timezone.utc)
                    )
            
            @bot.event
            async def on_message(message):
                # 忽略 Bot 自己的訊息
                if message.author == bot.user:
                    return
                
                # 處理指令
                await self._process_command(bot, message, server_config)
            
            return bot
            
        except Exception as e:
            self.logger.error(f"創建 Bot 實例失敗: {e}")
            return None
    
    async def _process_command(self, bot: commands.Bot, message: discord.Message, server_config: DiscordServerConfig):
        """處理指令訊息"""
        
        # 檢查是否為指令
        prefix = "!fk "
        if not message.content.startswith(prefix):
            return
        
        # 解析指令
        content = message.content[len(prefix):].strip()
        if not content:
            return
        
        parts = content.split()
        command_name = parts[0].lower()
        args = parts[1:] if len(parts) > 1 else []
        
        # 創建執行上下文
        context = BotContext(
            server_id=str(message.guild.id),
            channel_id=str(message.channel.id),
            user_id=str(message.author.id),
            username=str(message.author),
            message_id=str(message.id),
            command_name=command_name,
            args=args,
            raw_message=message.content
        )
        
        try:
            # 權限檢查和指令執行
            await self._execute_command(context, message, server_config)
            
        except Exception as e:
            self.logger.error(f"指令執行失敗: {e}")
            await message.channel.send(f"❌ 指令執行失敗: {str(e)}")
    
    async def _execute_command(self, context: BotContext, message: discord.Message, server_config: DiscordServerConfig):
        """執行指令"""
        
        with get_session() as session:
            # 獲取指令配置
            command = discord_service.get_command(session, server_config.id, context.command_name)
            if not command:
                await message.channel.send(f"❓ 未知指令: `{context.command_name}`")
                return
            
            if not command.is_enabled:
                await message.channel.send(f"⚠️ 指令 `{context.command_name}` 已停用")
                return
            
            # 權限檢查
            required_permission = DiscordPermissionLevel(command.required_permission)
            has_permission, reason = discord_service.check_user_permission(
                session, server_config.id, context.user_id, required_permission, context.command_name
            )
            
            if not has_permission:
                await message.channel.send(f"🚫 {reason}")
                
                # 記錄權限拒絕
                discord_service.log_activity(
                    session, server_config.id, "command_permission_denied",
                    f"用戶 {context.username} 嘗試執行指令 {context.command_name} 被拒絕",
                    discord_user_id=context.user_id,
                    discord_username=context.username,
                    command_name=context.command_name,
                    is_success=False,
                    error_message=reason
                )
                return
            
            # 冷卻時間檢查
            if command.cooldown_seconds > 0:
                # TODO: 實現冷卻時間檢查邏輯
                pass
            
            # 頻道限制檢查
            if command.require_channel_ids:
                allowed_channels = command.require_channel_ids
                if context.channel_id not in allowed_channels:
                    await message.channel.send(f"📍 此指令只能在特定頻道使用")
                    return
            
            # 執行指令
            start_time = datetime.now(timezone.utc)
            try:
                handler = self.command_handlers.get(command.command_action)
                if handler:
                    result = await handler(context, message, command, session)
                    success = True
                    error_msg = None
                else:
                    result = f"⚠️ 指令處理器 `{command.command_action}` 未實現"
                    success = False
                    error_msg = "Handler not implemented"
                
                # 發送結果
                if result:
                    if len(str(result)) > 2000:
                        # Discord 訊息長度限制
                        result = str(result)[:1997] + "..."
                    await message.channel.send(result)
                
                # 更新使用統計
                command.usage_count = (command.usage_count or 0) + 1
                command.last_used = datetime.now(timezone.utc)
                session.commit()
                
                # 記錄活動
                discord_service.log_activity(
                    session, server_config.id, "command_executed",
                    f"用戶 {context.username} 執行指令 {context.command_name}",
                    discord_user_id=context.user_id,
                    discord_username=context.username,
                    command_name=context.command_name,
                    command_args={"args": context.args},
                    command_result=str(result)[:500] if result else None,
                    is_success=success,
                    error_message=error_msg
                )
                
            except Exception as e:
                error_msg = f"❌ 執行錯誤: {str(e)}"
                await message.channel.send(error_msg)
                
                # 記錄錯誤
                discord_service.log_activity(
                    session, server_config.id, "command_error",
                    f"指令 {context.command_name} 執行失敗",
                    discord_user_id=context.user_id,
                    discord_username=context.username,
                    command_name=context.command_name,
                    command_args={"args": context.args},
                    is_success=False,
                    error_message=str(e)
                )
    
    # ===================== 指令處理器實現 =====================
    
    async def _handle_status(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        """處理 status 指令"""
        try:
            import psutil
            cpu_usage = f"{psutil.cpu_percent(interval=1)}%"
            memory = psutil.virtual_memory()
            memory_usage = f"{memory.percent}%"
            
            # 使用模板回應
            if command.response_template:
                return command.response_template.format(
                    cpu_usage=cpu_usage,
                    memory_usage=memory_usage
                )
            else:
                return f"🟢 **系統狀態**\\n⚡ CPU: {cpu_usage}\\n🧠 記憶體: {memory_usage}"
                
        except ImportError:
            return "⚠️ 系統監控功能不可用"
    
    async def _handle_info(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        """處理 info 指令"""
        guild = message.guild
        return f"""📊 **伺服器資訊**
🏛️ 名稱: {guild.name}
👥 成員數: {guild.member_count}
📅 創建時間: {guild.created_at.strftime('%Y-%m-%d')}
🌐 地區: {guild.region if hasattr(guild, 'region') else 'N/A'}
🔒 驗證等級: {guild.verification_level}"""
    
    async def _handle_ping(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        """處理 ping 指令"""
        # 計算延遲
        latency = round(message.guild.shard_id * 1000) if hasattr(message.guild, 'shard_id') else 0
        
        if command.response_template:
            return command.response_template.format(latency=latency)
        else:
            return f"🏓 Pong! 延遲: {latency}ms"
    
    async def _handle_help(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        """處理 help 指令"""
        
        # 獲取用戶可用的指令
        server_config = None
        for config in self.active_servers.values():
            if config.server_id == context.server_id:
                server_config = config
                break
        
        if not server_config:
            return "❌ 伺服器配置未找到"
        
        commands = discord_service.get_server_commands(session, server_config.id, enabled_only=True)
        
        # 按分類整理指令
        categories = {}
        for cmd in commands:
            # 檢查用戶是否有權限使用此指令
            required_perm = DiscordPermissionLevel(cmd.required_permission)
            has_perm, _ = discord_service.check_user_permission(
                session, server_config.id, context.user_id, required_perm
            )
            
            if has_perm:
                category = cmd.category or 'other'
                if category not in categories:
                    categories[category] = []
                categories[category].append(cmd)
        
        # 生成幫助訊息
        help_text = "📖 **可用指令**\\n\\n"
        
        category_names = {
            'system': '⚙️ 系統',
            'moderation': '⚖️ 審核',
            'user': '👥 用戶',
            'content': '📝 內容',
            'stats': '📊 統計',
            'config': '🔧 配置',
            'utility': '🛠️ 工具'
        }
        
        for category, cmds in categories.items():
            category_name = category_names.get(category, category.title())
            help_text += f"**{category_name}**\\n"
            
            for cmd in cmds:
                help_text += f"`!fk {cmd.command_name}` - {cmd.description or '無描述'}\\n"
            
            help_text += "\\n"
        
        help_text += "💡 使用 `!fk <指令名稱>` 執行指令"
        
        return help_text
    
    async def _handle_stats(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        """處理 stats 指令"""
        
        server_config = None
        for config in self.active_servers.values():
            if config.server_id == context.server_id:
                server_config = config
                break
        
        if not server_config:
            return "❌ 伺服器配置未找到"
        
        stats = discord_service.get_server_stats(session, server_config.id)
        
        return f"""📊 **伺服器統計 (近30天)**

👥 **用戶統計**
總用戶: {stats['users']['total']}
封鎖用戶: {stats['users']['banned']}

🤖 **指令統計**  
總執行: {stats['commands']['total']}
成功: {stats['commands']['successful']}
失敗: {stats['commands']['failed']}

📈 **活動統計**
總活動: {stats['activities']['total']}"""
    
    # 其他指令處理器的佔位符實現
    async def _handle_pending(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        return "🔄 查詢待審核內容功能開發中..."
    
    async def _handle_approve(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        return "✅ 內容批准功能開發中..."
    
    async def _handle_reject(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        return "❌ 內容拒絕功能開發中..."
    
    async def _handle_users(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        return "👥 用戶列表功能開發中..."
    
    async def _handle_ban(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        return "🔨 用戶封鎖功能開發中..."
    
    async def _handle_unban(self, context: BotContext, message: discord.Message, command: DiscordCommand, session) -> str:
        return "🕊️ 解除封鎖功能開發中..."
    
    # ===================== 事件處理器 =====================
    
    @tasks.loop(seconds=5)
    async def _event_processor(self):
        """處理來自 Redis 佇列的事件"""
        if not self.redis_client:
            return
        
        try:
            # 從佇列中獲取事件
            event_data = await self.redis_client.lpop("fk:admin_events")
            
            if event_data:
                event = json.loads(event_data)
                await self._process_forumkit_event(event)
                
        except Exception as e:
            self.logger.error(f"事件處理失敗: {e}")
    
    async def _process_forumkit_event(self, event: Dict[str, Any]):
        """處理來自 ForumKit 的事件"""
        
        # 根據事件類型處理
        event_type = event.get("kind", "")
        title = event.get("title", "")
        description = event.get("description", "")
        
        # 構建 Discord 嵌入訊息
        embed = discord.Embed(
            title=title,
            description=description,
            color=0x3498db,
            timestamp=datetime.now(timezone.utc)
        )
        
        # 添加額外欄位
        if "actor" in event:
            embed.add_field(name="操作者", value=event["actor"], inline=True)
        if "source" in event:
            embed.add_field(name="來源", value=event["source"], inline=True)
        
        embed.set_footer(text="ForumKit 通知系統")
        
        # 發送到所有配置的頻道
        for server_config in self.active_servers.values():
            try:
                bot = await self.create_bot_instance(server_config)
                if bot and server_config.default_channel_id:
                    channel = bot.get_channel(int(server_config.default_channel_id))
                    if channel:
                        await channel.send(embed=embed)
                        
            except Exception as e:
                self.logger.error(f"發送事件通知失敗: {e}")
    
    async def shutdown(self):
        """關閉 Bot 引擎"""
        if self._event_processor.is_running():
            self._event_processor.stop()
        
        if self.redis_client:
            await self.redis_client.close()
        
        self.logger.info("Discord Bot 引擎已關閉")


# ===================== 全域實例和啟動函數 =====================

bot_engine = DiscordBotEngine()

async def start_discord_bot():
    """啟動 Discord Bot"""
    if not DISCORD_AVAILABLE:
        print("Discord.py 未安裝，跳過 Bot 啟動")
        return
    
    success = await bot_engine.initialize()
    if not success:
        print("Discord Bot 初始化失敗")
        return
    
    print("Discord Bot 引擎啟動成功")
    
    # 保持運行
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        await bot_engine.shutdown()


if __name__ == "__main__":
    # 直接運行 Bot
    asyncio.run(start_discord_bot())