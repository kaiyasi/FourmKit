#!/usr/bin/env python3
"""
ForumKit Discord 管理機器人
提供遠程管理 ForumKit 系統的功能，包括 Instagram 整合管理
"""
import discord
from discord.ext import commands, tasks
import aiohttp
import asyncio
import os
from pathlib import Path
try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover
    load_dotenv = None  # type: ignore
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import io
import base64
import json

import redis.asyncio as aioredis
from cogs.admin_events import AdminEventsCog
from cogs.me import MeCog
from cogs.connect import ConnectCog

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 優先嘗試載入根目錄與本目錄 .env（若安裝了 python-dotenv）
if load_dotenv is not None:
    try:
        load_dotenv(dotenv_path=str(Path(__file__).resolve().parent.parent / '.env'), override=False)
        load_dotenv(dotenv_path=str(Path(__file__).resolve().parent / '.env'), override=False)
    except Exception:
        pass

# 機器人設定
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', '')
FORUMKIT_API_URL = os.getenv('FORUMKIT_API_URL', 'http://localhost:12005/api')
ADMIN_TOKEN = os.getenv('FORUMKIT_ADMIN_TOKEN', '')
ALLOWED_GUILD_IDS = list(map(int, os.getenv('ALLOWED_GUILD_IDS', '').split(',') if os.getenv('ALLOWED_GUILD_IDS') else []))
ADMIN_ROLE_NAME = os.getenv('ADMIN_ROLE_NAME', 'ForumKit Admin')
DISCORD_ALERT_CHANNEL_ID = int(os.getenv('DISCORD_ALERT_CHANNEL_ID', '0') or '0')
# Bot 預設連本機 Redis（對應 compose 對外 ${REDIS_PORT:-12008}）
REDIS_URL = os.getenv('REDIS_URL', f"redis://localhost:{os.getenv('REDIS_PORT', '12008')}/0")

# 機器人設定
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!fk ', intents=intents, case_insensitive=True)


class ForumKitAPI:
    """ForumKit API 客戶端"""
    
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self.session = None
    
    async def ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={'Authorization': f'Bearer {self.token}'},
                timeout=aiohttp.ClientTimeout(total=30)
            )
    
    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()
    
    async def request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        await self.ensure_session()
        url = f"{self.base_url}{endpoint}"
        
        try:
            async with self.session.request(method, url, **kwargs) as response:
                data = await response.json()
                if response.status >= 400:
                    raise Exception(f"API Error {response.status}: {data.get('error', {}).get('message', 'Unknown error')}")
                return data
        except aiohttp.ClientError as e:
            raise Exception(f"Network error: {str(e)}")
    
    # Instagram API 方法
    async def get_instagram_stats(self) -> Dict[str, Any]:
        return await self.request('GET', '/instagram/stats')
    
    async def get_instagram_accounts(self) -> List[Dict[str, Any]]:
        result = await self.request('GET', '/instagram/accounts')
        return result.get('data', [])
    
    async def get_instagram_templates(self) -> List[Dict[str, Any]]:
        result = await self.request('GET', '/instagram/templates')
        return result.get('data', [])
    
    async def get_instagram_schedulers(self) -> List[Dict[str, Any]]:
        result = await self.request('GET', '/instagram/schedulers')
        return result.get('data', [])
    
    async def get_instagram_posts(self) -> List[Dict[str, Any]]:
        result = await self.request('GET', '/instagram/posts')
        return result.get('data', [])
    
    async def queue_posts(self, post_ids: List[int], scheduler_id: int) -> Dict[str, Any]:
        return await self.request('POST', '/instagram/queue-posts', 
                                json={'post_ids': post_ids, 'scheduler_id': scheduler_id})
    
    async def generate_preview(self, post_ids: List[int], template_id: int) -> bytes:
        await self.ensure_session()
        url = f"{self.base_url}/instagram/generate-preview"
        
        async with self.session.post(url, json={
            'post_ids': post_ids,
            'template_id': template_id
        }) as response:
            if response.status >= 400:
                raise Exception(f"Preview generation failed: {response.status}")
            return await response.read()
    
    # 一般 API 方法
    async def get_posts(self, limit: int = 10) -> List[Dict[str, Any]]:
        result = await self.request('GET', f'/posts?per_page={limit}')
        return result.get('data', {}).get('items', [])
    
    async def get_system_stats(self) -> Dict[str, Any]:
        return await self.request('GET', '/healthz')


# 全局 API 客戶端
api = ForumKitAPI(FORUMKIT_API_URL, ADMIN_TOKEN)

# Redis client (async)
redis_cli: Optional[aioredis.Redis] = None

async def get_redis() -> Optional[aioredis.Redis]:
    global redis_cli
    try:
        if redis_cli is None or redis_cli.connection is None:
            redis_cli = aioredis.from_url(REDIS_URL, decode_responses=True)
        return redis_cli
    except Exception:
        return None


def is_admin():
    """檢查是否為管理員"""
    async def predicate(ctx):
        if ALLOWED_GUILD_IDS and ctx.guild.id not in ALLOWED_GUILD_IDS:
            await ctx.send("❌ 此機器人只能在授權的伺服器中使用")
            return False
        
        if discord.utils.get(ctx.author.roles, name=ADMIN_ROLE_NAME):
            return True
        
        if ctx.author.guild_permissions.administrator:
            return True
        
        await ctx.send("❌ 您沒有權限使用此指令")
        return False
    
    return commands.check(predicate)


@bot.event
async def on_ready():
    logger.info(f'{bot.user} 已上線!')
    logger.info(f'已連接到 {len(bot.guilds)} 個伺服器')
    
    # 同步斜線指令（優先同步到授權伺服器，否則全域）
    try:
        if ALLOWED_GUILD_IDS:
            for gid in ALLOWED_GUILD_IDS:
                await bot.tree.sync(guild=discord.Object(id=gid))
        else:
            await bot.tree.sync()
        logger.info('Slash 指令已同步')
    except Exception as e:
        logger.warning(f'Sync slash 指令失敗: {e}')
    # 啟動定期任務
    status_monitor.start()


@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CheckFailure):
        return  # 權限檢查失敗已經在 is_admin() 中處理
    
    logger.error(f"指令錯誤: {error}")
    await ctx.send(f"❌ 指令執行失敗: {str(error)}")


# 後台事件處理改由 AdminEventsCog 管理


# 使用者綁定改由 MeCog (Slash) 提供


# ===============================================================================
# Instagram 管理指令
# ===============================================================================

@bot.group(name='instagram', aliases=['ig'], invoke_without_command=True)
@is_admin()
async def instagram_group(ctx):
    """Instagram 整合管理"""
    embed = discord.Embed(
        title="📱 Instagram 整合管理",
        description="管理 ForumKit 的 Instagram 自動發布功能",
        color=0xe91e63
    )
    
    embed.add_field(
        name="可用指令",
        value="""
        `!fk ig status` - 查看 IG 整合狀態
        `!fk ig accounts` - 管理 IG 帳號
        `!fk ig templates` - 管理貼文模板
        `!fk ig schedulers` - 管理自動排程
        `!fk ig posts` - 查看發送記錄
        `!fk ig queue <post_ids> <scheduler_id>` - 手動排入佇列
        `!fk ig preview <post_ids> <template_id>` - 預覽貼文圖片
        """,
        inline=False
    )
    
    await ctx.send(embed=embed)


@instagram_group.command(name='status')
@is_admin()
async def ig_status(ctx):
    """查看 Instagram 整合狀態"""
    try:
        stats = await api.get_instagram_stats()
        data = stats.get('data', {})
        
        embed = discord.Embed(
            title="📊 Instagram 整合狀態",
            color=0xe91e63,
            timestamp=datetime.utcnow()
        )
        
        # 帳號統計
        accounts = data.get('accounts', {})
        embed.add_field(
            name="📱 Instagram 帳號",
            value=f"活躍: {accounts.get('active', 0)}\n總計: {accounts.get('total', 0)}",
            inline=True
        )
        
        # 貼文統計
        posts = data.get('posts', {})
        embed.add_field(
            name="📝 貼文統計",
            value=f"已發布: {posts.get('total_published', 0)}\n7天內: {posts.get('recent_7days', 0)}\n待處理: {posts.get('pending', 0)}",
            inline=True
        )
        
        # 佇列統計
        queue = data.get('queue', {})
        embed.add_field(
            name="⏳ 發送佇列",
            value=f"等待中: {queue.get('pending', 0)}",
            inline=True
        )
        
        # 模板統計
        templates = data.get('templates', {})
        embed.add_field(
            name="🎨 可用模板",
            value=f"{templates.get('total', 0)} 個模板",
            inline=True
        )
        
        await ctx.send(embed=embed)
        
    except Exception as e:
        await ctx.send(f"❌ 獲取狀態失敗: {str(e)}")


@instagram_group.command(name='accounts')
@is_admin()
async def ig_accounts(ctx):
    """管理 Instagram 帳號"""
    try:
        accounts = await api.get_instagram_accounts()
        
        if not accounts:
            await ctx.send("📱 目前沒有設定 Instagram 帳號")
            return
        
        embed = discord.Embed(
            title="📱 Instagram 帳號列表",
            color=0xe91e63
        )
        
        for account in accounts[:5]:  # 最多顯示5個帳號
            status_icons = []
            if account['is_active']:
                status_icons.append("🟢 活躍")
            if account['has_token']:
                status_icons.append("🔗 已連接")
            
            status = " | ".join(status_icons) if status_icons else "⚪ 未設定"
            
            embed.add_field(
                name=f"@{account['username']}",
                value=f"**{account['account_name']}**\n{account['school_name']}\n{status}",
                inline=True
            )
        
        if len(accounts) > 5:
            embed.add_field(
                name="更多帳號",
                value=f"還有 {len(accounts) - 5} 個帳號...\n使用網頁管理界面查看完整列表",
                inline=False
            )
        
        await ctx.send(embed=embed)
        
    except Exception as e:
        await ctx.send(f"❌ 獲取帳號列表失敗: {str(e)}")


@instagram_group.command(name='queue')
@is_admin()
async def ig_queue(ctx, post_ids: str, scheduler_id: int):
    """手動將貼文加入發送佇列"""
    try:
        # 解析貼文ID
        ids = [int(x.strip()) for x in post_ids.split(',')]
        
        result = await api.queue_posts(ids, scheduler_id)
        data = result.get('data', {})
        
        embed = discord.Embed(
            title="✅ 貼文已加入佇列",
            description=data.get('message', '操作完成'),
            color=0x00ff00
        )
        
        embed.add_field(name="批次ID", value=data.get('batch_id', 'N/A'), inline=True)
        embed.add_field(name="加入數量", value=str(data.get('queued_count', 0)), inline=True)
        
        await ctx.send(embed=embed)
        
    except ValueError:
        await ctx.send("❌ 貼文ID格式錯誤，請使用逗號分隔的數字")
    except Exception as e:
        await ctx.send(f"❌ 加入佇列失敗: {str(e)}")


@instagram_group.command(name='preview')
@is_admin()
async def ig_preview(ctx, post_ids: str, template_id: int):
    """預覽貼文圖片"""
    try:
        # 解析貼文ID
        ids = [int(x.strip()) for x in post_ids.split(',')]
        
        if len(ids) > 5:
            await ctx.send("❌ 一次最多預覽 5 篇貼文")
            return
        
        await ctx.send("🎨 正在生成預覽圖片...")
        
        # 生成預覽
        image_bytes = await api.generate_preview(ids, template_id)
        
        # 發送圖片
        file = discord.File(io.BytesIO(image_bytes), filename="ig_preview.png")
        
        embed = discord.Embed(
            title="🖼️ Instagram 貼文預覽",
            description=f"貼文ID: {', '.join(map(str, ids))}\n模板ID: {template_id}",
            color=0x9c27b0
        )
        embed.set_image(url="attachment://ig_preview.png")
        
        await ctx.send(file=file, embed=embed)
        
    except ValueError:
        await ctx.send("❌ 貼文ID格式錯誤，請使用逗號分隔的數字")
    except Exception as e:
        await ctx.send(f"❌ 生成預覽失敗: {str(e)}")


# ===============================================================================
# 系統監控指令
# ===============================================================================

@bot.group(name='system', invoke_without_command=True)
@is_admin()
async def system_group(ctx):
    """系統監控"""
    embed = discord.Embed(
        title="🖥️ ForumKit 系統監控",
        description="監控和管理 ForumKit 系統狀態",
        color=0x2196f3
    )
    
    embed.add_field(
        name="可用指令",
        value="""
        `!fk system status` - 系統狀態
        `!fk system posts` - 最新貼文
        `!fk system health` - 健康檢查
        """,
        inline=False
    )
    
    await ctx.send(embed=embed)


@system_group.command(name='status')
@is_admin()
async def system_status(ctx):
    """系統狀態總覽"""
    try:
        # 並行獲取數據
        health_task = api.get_system_stats()
        ig_stats_task = api.get_instagram_stats()
        posts_task = api.get_posts(5)
        
        health, ig_stats, recent_posts = await asyncio.gather(
            health_task, ig_stats_task, posts_task
        )
        
        embed = discord.Embed(
            title="🖥️ ForumKit 系統狀態",
            color=0x00ff00,
            timestamp=datetime.utcnow()
        )
        
        # 系統健康狀態
        if health.get('ok'):
            embed.add_field(name="系統狀態", value="🟢 正常運行", inline=True)
        else:
            embed.add_field(name="系統狀態", value="🔴 異常", inline=True)
        
        # Instagram 狀態
        ig_data = ig_stats.get('data', {})
        ig_accounts = ig_data.get('accounts', {}).get('active', 0)
        ig_pending = ig_data.get('queue', {}).get('pending', 0)
        embed.add_field(
            name="Instagram", 
            value=f"帳號: {ig_accounts}\n佇列: {ig_pending}", 
            inline=True
        )
        
        # 最新貼文
        embed.add_field(
            name="最新貼文",
            value=f"{len(recent_posts)} 篇近期貼文",
            inline=True
        )
        
        await ctx.send(embed=embed)
        
    except Exception as e:
        await ctx.send(f"❌ 獲取系統狀態失敗: {str(e)}")


@system_group.command(name='posts')
@is_admin()
async def system_posts(ctx, limit: int = 5):
    """查看最新貼文"""
    try:
        if limit > 10:
            limit = 10
        
        posts = await api.get_posts(limit)
        
        if not posts:
            await ctx.send("📝 目前沒有貼文")
            return
        
        embed = discord.Embed(
            title=f"📝 最新 {len(posts)} 篇貼文",
            color=0x4caf50
        )
        
        for post in posts:
            # 截取內容
            content = post.get('content', '')[:100]
            if len(post.get('content', '')) > 100:
                content += "..."
            
            # 移除HTML標籤
            import re
            content = re.sub('<.*?>', '', content)
            
            status_emoji = {
                'pending': '⏳',
                'approved': '✅', 
                'rejected': '❌'
            }.get(post.get('status'), '❓')
            
            embed.add_field(
                name=f"#{post.get('id', 'N/A')} {status_emoji}",
                value=f"{content}\n`{post.get('created_at', 'N/A')}`",
                inline=False
            )
        
        await ctx.send(embed=embed)
        
    except Exception as e:
        await ctx.send(f"❌ 獲取貼文失敗: {str(e)}")


# ===============================================================================
# 定期任務
# ===============================================================================

@tasks.loop(minutes=30)
async def status_monitor():
    """定期狀態監控"""
    try:
        # 這裡可以加入定期檢查邏輯
        # 例如：檢查佇列堆積、失敗率等
        pass
    except Exception as e:
        logger.error(f"狀態監控錯誤: {e}")


# ===============================================================================
# 輔助指令
# ===============================================================================

@bot.command(name='helps')
async def help_command(ctx):
    """顯示幫助信息"""
    embed = discord.Embed(
        title="🤖 ForumKit 管理機器人",
        description="遠程管理 ForumKit 系統的 Discord 機器人",
        color=0x3f51b5
    )
    
    embed.add_field(
        name="Instagram 管理",
        value="`!fk instagram` - IG 整合管理\n`!fk ig status` - IG 狀態",
        inline=True
    )
    
    embed.add_field(
        name="系統監控",
        value="`!fk system status` - 系統狀態\n`!fk system posts` - 最新貼文",
        inline=True
    )
    
    embed.set_footer(text="使用 !fk <command> --help 查看詳細說明")
    
    await ctx.send(embed=embed)


@bot.command(name='ping')
async def ping(ctx):
    """檢查機器人延遲"""
    latency = round(bot.latency * 1000)
    embed = discord.Embed(
        title="🏓 Pong!",
        description=f"延遲: {latency}ms",
        color=0x00ff00
    )
    await ctx.send(embed=embed)


# ===============================================================================
# 啟動機器人
# ===============================================================================

async def main():
    """主函數"""
    try:
        # 掛載 Cogs（含 Slash 指令）
        await bot.add_cog(AdminEventsCog(bot, alert_channel_id=DISCORD_ALERT_CHANNEL_ID, redis_url=REDIS_URL))
        await bot.add_cog(MeCog(bot, redis_url=REDIS_URL))
        await bot.add_cog(ConnectCog(bot, api_base=FORUMKIT_API_URL, redis_url=REDIS_URL))
        await bot.start(BOT_TOKEN)
    except KeyboardInterrupt:
        logger.info("收到中斷信號，正在關閉...")
    finally:
        await api.close()
        await bot.close()


if __name__ == "__main__":
    if not BOT_TOKEN:
        logger.error("請設定 DISCORD_BOT_TOKEN 環境變數")
        exit(1)
    
    if not ADMIN_TOKEN:
        logger.error("請設定 FORUMKIT_ADMIN_TOKEN 環境變數")
        exit(1)
    
    asyncio.run(main())
