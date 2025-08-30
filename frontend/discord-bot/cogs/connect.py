from __future__ import annotations
import os
import json
import asyncio
import logging
import discord
from discord.ext import commands, tasks
from discord import app_commands
import aiohttp

try:
    import redis.asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore

log = logging.getLogger(__name__)

FEED_HASH = 'fk:discord:feed:channels'  # channel_id -> json({ school?: slug|null })
FEED_LAST_PREFIX = 'fk:discord:feed:last:'  # + channel_id -> last_post_id


class ConnectCog(commands.Cog):
    """一般使用者可見：/connect 以訂閱平台貼文到目前頻道（可指定學校）。"""

    def __init__(self, bot: commands.Bot, *, api_base: str | None = None, redis_url: str | None = None):
        self.bot = bot
        self.api_base = (api_base or os.getenv('FORUMKIT_API_URL', 'http://localhost:12005/api')).rstrip('/')
        self.redis_url = redis_url or os.getenv('REDIS_URL', f"redis://localhost:{os.getenv('REDIS_PORT','12008')}/0")
        self._redis = None
        self._http: aiohttp.ClientSession | None = None
        self._loop = self._feed_loop

    async def cog_load(self):
        if not self._http or self._http.closed:
            self._http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20))
        if not self._loop.is_running():
            self._loop.start()

    async def cog_unload(self):
        if self._loop.is_running():
            self._loop.cancel()
        if self._http and not self._http.closed:
            await self._http.close()
        if self._redis:
            await self._redis.close()

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

    connect = app_commands.Group(name='connect', description='訂閱平台貼文到此頻道')

    @connect.command(name='start', description='開始訂閱（可選擇學校 slug；不填則為跨校）')
    async def start(self, interaction: discord.Interaction, school_slug: str | None = None):  # type: ignore[override]
        r = await self._get_redis()
        if not r:
            await interaction.response.send_message('❌ 無法連線訂閱服務', ephemeral=True)
            return
        payload = {'school': (school_slug or '').strip() or None}
        await r.hset(FEED_HASH, str(interaction.channel_id), json.dumps(payload))
        # 重置 last 指標，避免一次灌爆
        await r.delete(FEED_LAST_PREFIX + str(interaction.channel_id))
        await interaction.response.send_message(
            f"✅ 已在 <#{interaction.channel_id}> 訂閱貼文"
            + (f"（學校：{school_slug}）" if school_slug else "（跨校）"),
            ephemeral=True
        )

    @connect.command(name='stop', description='停止訂閱')
    async def stop(self, interaction: discord.Interaction):  # type: ignore[override]
        r = await self._get_redis()
        if not r:
            await interaction.response.send_message('❌ 無法連線訂閱服務', ephemeral=True)
            return
        await r.hdel(FEED_HASH, str(interaction.channel_id))
        await r.delete(FEED_LAST_PREFIX + str(interaction.channel_id))
        await interaction.response.send_message(f'🛑 已停止在 <#{interaction.channel_id}> 的訂閱', ephemeral=True)

    @connect.command(name='status', description='查看此頻道訂閱狀態')
    async def status(self, interaction: discord.Interaction):  # type: ignore[override]
        r = await self._get_redis()
        if not r:
            await interaction.response.send_message('❌ 無法連線訂閱服務', ephemeral=True)
            return
        data = await r.hget(FEED_HASH, str(interaction.channel_id))
        if not data:
            await interaction.response.send_message('ℹ️ 尚未訂閱', ephemeral=True)
            return
        try:
            payload = json.loads(data)
        except Exception:
            payload = {}
        school = payload.get('school')
        await interaction.response.send_message(f'📡 訂閱中（學校：{school or "跨校"}）', ephemeral=True)

    @tasks.loop(seconds=45)
    async def _feed_loop(self):
        try:
            r = await self._get_redis()
            if not r:
                return
            rows = await r.hgetall(FEED_HASH)
            if not rows:
                return
            for ch_id, conf in rows.items():
                try:
                    payload = json.loads(conf) if conf else {}
                except Exception:
                    payload = {}
                school = payload.get('school')
                last_key = FEED_LAST_PREFIX + str(ch_id)
                last_id_raw = await r.get(last_key)
                last_id = int(last_id_raw) if last_id_raw and last_id_raw.isdigit() else 0
                # 拉最新資料
                qs = f"?limit=5"
                if school:
                    qs += f"&school={school}"
                url = f"{self.api_base}/posts/list{qs}"
                if not self._http:
                    self._http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20))
                async with self._http.get(url) as resp:
                    if resp.status != 200:
                        continue
                    data = await resp.json()
                items = data.get('items') or []
                # 篩出新貼文（依 id 比較）
                new_items = [it for it in items if isinstance(it.get('id'), int) and it['id'] > last_id]
                if not new_items:
                    continue
                new_items.sort(key=lambda x: x['id'])
                channel = self.bot.get_channel(int(ch_id))
                if not channel or not isinstance(channel, (discord.TextChannel, discord.Thread)):
                    continue
                for it in new_items:
                    title = f"#{it.get('id')} 新貼文"
                    content = (it.get('excerpt') or it.get('content') or '')[:180]
                    # 粗略去 HTML
                    try:
                        import re
                        content = re.sub('<.*?>', '', content)
                    except Exception:
                        pass
                    embed = discord.Embed(title=title, description=content, color=0x2b90d9)
                    url_post = f"{self.api_base.replace('/api','')}/posts/{it.get('id')}"
                    embed.url = url_post
                    await channel.send(embed=embed)
                    last_id = max(last_id, int(it.get('id', last_id)))
                await r.set(last_key, str(last_id))
        except Exception as e:
            log.warning(f"feed_loop error: {e}")

    @_feed_loop.before_loop
    async def _ready(self):
        await self.bot.wait_until_ready()
