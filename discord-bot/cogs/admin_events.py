from __future__ import annotations
import os
import json
import logging
import discord
from discord.ext import commands, tasks
from discord import app_commands

try:
    import redis.asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore

log = logging.getLogger(__name__)


class AdminEventsCog(commands.Cog):
    """接收後端事件（Redis 佇列）並轉發至指定頻道。提供測試用斜線指令。"""

    def __init__(self, bot: commands.Bot, *, alert_channel_id: int | None = None, redis_url: str | None = None):
        self.bot = bot
        self.alert_channel_id = int(alert_channel_id or int(os.getenv('DISCORD_ALERT_CHANNEL_ID', '0') or '0'))
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://redis:80/0')
        self._redis = None
        # 以 Cog 方式管理背景任務
        self._task = self._admin_event_listener

    async def cog_load(self):
        # 啟動背景佇列監聽
        if not self._task.is_running():
            self._task.start()

    async def cog_unload(self):
        if self._task.is_running():
            self._task.cancel()
        try:
            if self._redis:
                await self._redis.close()
        except Exception:
            pass

    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        if aioredis is None:
            return None
        try:
            self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
            return self._redis
        except Exception:
            return None

    async def _dispatch_embed(self, payload: dict):
        if not self.alert_channel_id:
            return
        ch = self.bot.get_channel(self.alert_channel_id)
        if not ch or not isinstance(ch, (discord.TextChannel, discord.Thread)):
            return
        title = payload.get('title') or '通知'
        description = payload.get('description') or ''
        actor = payload.get('actor')
        footer = payload.get('footer')
        fields = payload.get('fields') or []
        color = payload.get('color') or 0x5865F2
        embed = discord.Embed(title=title, description=description, color=color)
        if actor:
            embed.set_author(name=str(actor))
        if footer:
            embed.set_footer(text=str(footer))
        try:
            for f in fields:
                name = str(f.get('name', ''))[:256]
                value = str(f.get('value', ''))[:1024]
                inline = bool(f.get('inline', True))
                if name and value:
                    embed.add_field(name=name, value=value, inline=inline)
        except Exception:
            pass
        await ch.send(embed=embed)

    @tasks.loop(seconds=2.0)
    async def _admin_event_listener(self):
        try:
            if not self.alert_channel_id:
                return
            r = await self._get_redis()
            if not r:
                return
            for _ in range(10):
                item = await r.lpop('fk:admin_events')
                if not item:
                    break
                try:
                    payload = json.loads(item)
                except Exception:
                    continue
                await self._dispatch_embed(payload)
        except Exception as e:
            log.warning(f"admin_event_listener error: {e}")

    @_admin_event_listener.before_loop
    async def _wait_ready(self):
        await self.bot.wait_until_ready()

    # 斜線指令群組（管理）
    admin = app_commands.Group(name='admin', description='ForumKit 管理輔助', default_permissions=discord.Permissions(administrator=True))

    @admin.command(name='notify_test', description='發送一則測試通知到告警頻道')
    async def notify_test(self, interaction: discord.Interaction, title: str = '測試通知', message: str = '這是一則測試訊息'):  # type: ignore[override]
        await interaction.response.defer(ephemeral=True)
        await self._dispatch_embed({'title': title, 'description': message})
        await interaction.followup.send('✅ 已送出測試通知', ephemeral=True)
