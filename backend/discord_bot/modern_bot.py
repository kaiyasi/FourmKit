"""
現代化 Discord Bot - 使用斜線指令和 UI 組件
"""

import asyncio
import logging
import os
import sys
from datetime import datetime
from typing import Optional, Dict, Any

# 添加父目錄到路徑
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import discord
from discord import app_commands
from discord.ext import commands

from ui_components import TerminalEmbed
from config import init_config
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

# 設置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('discord_bot.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

class ForumKitBot(commands.Bot):
    """ForumKit Discord Bot 主類別"""
    
    def __init__(self, **kwargs):
        # 設置所需的 intents
        intents = discord.Intents.default()
        intents.message_content = True
        intents.guilds = True
        intents.guild_messages = True
        intents.members = True
        
        super().__init__(
            command_prefix='/',  # 斜線指令不需要前綴，但保留以防萬一
            intents=intents,
            help_command=None,  # 停用預設幫助指令
            **kwargs
        )
        
        self.config = init_config()
        self.synced = False  # 防止重複同步
    
    async def setup_hook(self):
        """Bot 設置鉤子 - 載入 cogs 和同步指令"""
        logger.info("正在設置 Bot...")
        
        try:
            # 載入斜線指令 cog
            await self.load_extension('slash_commands')
            logger.info("✅ 斜線指令 Cog 載入成功")
            
            # 檢查指令樹內容
            commands = self.tree.get_commands()
            logger.info(f"📋 指令樹中有 {len(commands)} 個指令")
            for cmd in commands:
                logger.info(f"  • /{cmd.name}: {cmd.description}")
                
        except Exception as e:
            logger.error(f"❌ Bot 設置失敗: {e}", exc_info=True)
    
    async def sync_commands_to_guilds(self):
        """同步指令到所有伺服器"""
        if self.synced:
            logger.info("⏭️ 指令已同步，跳過")
            return
            
        try:
            logger.info("🔄 開始同步斜線指令...")
            
            # 全域同步
            synced_global = await self.tree.sync()
            logger.info(f"✅ 全域同步: {len(synced_global)} 個指令")
            
            # 為每個伺服器同步
            for guild in self.guilds:
                try:
                    synced_guild = await self.tree.sync(guild=guild)
                    logger.info(f"✅ {guild.name}: {len(synced_guild)} 個指令")
                except Exception as e:
                    logger.error(f"❌ {guild.name} 同步失敗: {e}")
            
            self.synced = True
            logger.info("🎉 所有指令同步完成!")
            
        except Exception as e:
            logger.error(f"❌ 指令同步失敗: {e}", exc_info=True)
    
    async def on_ready(self):
        """Bot 準備就緒事件"""
        logger.info(f'🤖 {self.user} 已上線!')
        logger.info(f'🆔 Bot ID: {self.user.id}')
        logger.info(f'🌐 已連接到 {len(self.guilds)} 個伺服器')
        
        # 設置 Bot 狀態
        activity = discord.Activity(
            type=discord.ActivityType.watching,
            name=self.config.get('activity_name', 'ForumKit 管理')
        )
        await self.change_presence(activity=activity)
        
        # 載入完成後顯示伺服器資訊
        for guild in self.guilds:
            logger.info(f"  📍 {guild.name} (ID: {guild.id}, 成員: {guild.member_count})")
        
        # 自動同步指令到所有伺服器
        await self.sync_commands_to_guilds()
    
    async def on_guild_join(self, guild):
        """加入新伺服器事件"""
        logger.info(f"🆕 加入新伺服器: {guild.name} (ID: {guild.id})")
        
        # 發送歡迎訊息到伺服器
        try:
            # 嘗試找到合適的頻道發送歡迎訊息
            channel = None
            
            # 優先尋找系統頻道或第一個可發言的文字頻道
            if guild.system_channel and guild.system_channel.permissions_for(guild.me).send_messages:
                channel = guild.system_channel
            else:
                for c in guild.text_channels:
                    if c.permissions_for(guild.me).send_messages:
                        channel = c
                        break
            
            if channel:
                embed = TerminalEmbed.create(
                    title="ForumKit Bot 已加入伺服器",
                    description=f"感謝邀請 ForumKit Bot 到 **{guild.name}**！",
                    command="bot join-guild",
                    output=f"🎉 成功加入伺服器\n📋 使用 `/help` 檢視可用指令\n⚙️ 使用 `/config` 進行設定",
                    color='success'
                )
                
                await channel.send(embed=embed)
                
        except Exception as e:
            logger.error(f"發送歡迎訊息失敗: {e}")
    
    async def on_guild_remove(self, guild):
        """離開伺服器事件"""
        logger.info(f"👋 離開伺服器: {guild.name} (ID: {guild.id})")
    
    async def on_app_command_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError):
        """斜線指令錯誤處理"""
        
        if isinstance(error, app_commands.CommandOnCooldown):
            embed = TerminalEmbed.create(
                title="指令冷卻中",
                error=f"指令冷卻中，請等待 {error.retry_after:.1f} 秒",
                color='warning'
            )
        elif isinstance(error, app_commands.MissingPermissions):
            embed = TerminalEmbed.create(
                title="權限不足",
                error="您沒有執行此指令的權限",
                color='error'
            )
        elif isinstance(error, app_commands.BotMissingPermissions):
            embed = TerminalEmbed.create(
                title="Bot 權限不足",
                error="Bot 缺少執行此指令所需的權限",
                color='error'
            )
        else:
            embed = TerminalEmbed.create(
                title="指令執行錯誤",
                error=f"發生未預期的錯誤: {str(error)}",
                color='error'
            )
            logger.error(f"斜線指令錯誤: {error}", exc_info=True)
        
        try:
            if interaction.response.is_done():
                await interaction.followup.send(embed=embed, ephemeral=True)
            else:
                await interaction.response.send_message(embed=embed, ephemeral=True)
        except Exception as e:
            logger.error(f"發送錯誤訊息失敗: {e}")
    
    async def on_error(self, event, *args, **kwargs):
        """一般錯誤處理"""
        logger.error(f"Bot 事件錯誤 ({event})", exc_info=True)

# ===================== 全域指令 (不需要 Cog) =====================

@app_commands.command(name="sync", description="🔄 手動同步斜線指令")
async def manual_sync_command(interaction: discord.Interaction):
    """手動同步指令"""
    
    # 檢查權限 - 只有 Bot 擁有者可以使用
    app_info = await interaction.client.application_info()
    if interaction.user.id != app_info.owner.id:
        embed = TerminalEmbed.create(
            title="權限拒絕",
            error="只有 Bot 擁有者可以使用此指令",
            color='error'
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        return
    
    await interaction.response.defer(thinking=True)
    
    try:
        # 全域同步
        synced_global = await interaction.client.tree.sync()
        
        # 當前伺服器同步
        synced_guild = await interaction.client.tree.sync(guild=interaction.guild)
        
        embed = TerminalEmbed.create(
            title="指令同步完成",
            command="bot sync --global --guild",
            output=f"✅ 全域指令: {len(synced_global)} 個\n✅ 伺服器指令: {len(synced_guild)} 個\n\n⏰ 指令可能需要 1-5 分鐘才會在 Discord 中出現",
            color='success'
        )
        
        await interaction.followup.send(embed=embed)
        
    except Exception as e:
        embed = TerminalEmbed.create(
            title="同步失敗",
            error=f"同步過程中發生錯誤: {str(e)}",
            color='error'
        )
        await interaction.followup.send(embed=embed)

@app_commands.command(name="botinfo", description="🤖 顯示 Bot 資訊")
async def botinfo_command(interaction: discord.Interaction):
    """Bot 資訊指令"""
    bot = interaction.client
    
    # 計算運行時間
    if hasattr(bot, 'start_time'):
        uptime = datetime.now() - bot.start_time
        uptime_str = f"{uptime.days}天 {uptime.seconds//3600}小時 {(uptime.seconds//60)%60}分"
    else:
        uptime_str = "未知"
    
    embed = TerminalEmbed.create(
        title="ForumKit Discord Bot",
        command="botinfo --verbose",
        output=f"""🤖 **Bot 資訊**
名稱: {bot.user.name}
ID: {bot.user.id}
版本: v2.0.0 (現代化斜線指令版)

🌐 **連接資訊**  
伺服器數量: {len(bot.guilds)}
用戶數量: {len(bot.users)}
延遲: {round(bot.latency * 1000)}ms
運行時間: {uptime_str}

⚡ **技術資訊**
Discord.py: {discord.__version__}
Python: {sys.version.split()[0]}
斜線指令: ✅ 已啟用""",
        color='info'
    )
    
    await interaction.response.send_message(embed=embed)

async def main():
    """主要啟動函數"""
    
    # 檢查必要的環境變數
    bot_token = os.getenv('DISCORD_BOT_TOKEN')
    if not bot_token:
        logger.error("❌ 錯誤: 未找到 DISCORD_BOT_TOKEN 環境變數")
        logger.error("請檢查 .env 檔案是否已正確設定")
        return
    
    # 初始化並啟動 Bot
    try:
        bot = ForumKitBot()
        bot.start_time = datetime.now()  # 記錄啟動時間
        
        # 添加全域指令
        bot.tree.add_command(manual_sync_command)
        bot.tree.add_command(botinfo_command)
        
        logger.info("🚀 正在啟動 ForumKit Discord Bot...")
        
        async with bot:
            await bot.start(bot_token)
            
    except discord.LoginFailure:
        logger.error("❌ Bot 登入失敗，請檢查 DISCORD_BOT_TOKEN 是否正確")
    except discord.HTTPException as e:
        logger.error(f"❌ Discord API 錯誤: {e}")
    except Exception as e:
        logger.error(f"❌ 啟動失敗: {e}", exc_info=True)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("👋 Bot 已停止")