from __future__ import annotations
import os
import discord
from discord.ext import commands
from discord import app_commands

try:
    import redis.asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore

BIND_HASH = 'fk:discord:bindings'


class MeCog(commands.Cog):
    """使用者自助綁定（Slash 指令）"""

    def __init__(self, bot: commands.Bot, *, redis_url: str | None = None):
        self.bot = bot
        self.redis_url = redis_url or os.getenv('REDIS_URL', f"redis://localhost:{os.getenv('REDIS_PORT','12008')}/0")
        self._redis = None

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

    me = app_commands.Group(name='me', description='帳號綁定')

    @me.command(name='bind', description='綁定平台帳號（輸入使用者名稱或 ID）')
    async def bind(self, interaction: discord.Interaction, user_identifier: str):  # type: ignore[override]
        r = await self._get_redis()
        if not r:
            await interaction.response.send_message('❌ 綁定失敗：Redis 未就緒', ephemeral=True)
            return
        await r.hset(BIND_HASH, str(interaction.user.id), user_identifier)
        await interaction.response.send_message(f'✅ 已綁定 <@{interaction.user.id}> → `{user_identifier}`', ephemeral=True)

    @me.command(name='whoami', description='查詢目前綁定資訊')
    async def whoami(self, interaction: discord.Interaction):  # type: ignore[override]
        r = await self._get_redis()
        if not r:
            await interaction.response.send_message('❌ 查詢失敗：Redis 未就緒', ephemeral=True)
            return
        val = await r.hget(BIND_HASH, str(interaction.user.id))
        if not val:
            await interaction.response.send_message('ℹ️ 尚未綁定，使用 /me bind <username|user_id> 進行綁定', ephemeral=True)
        else:
            await interaction.response.send_message(f'🔎 目前綁定：<@{interaction.user.id}> → `{val}`', ephemeral=True)

    @me.command(name='unbind', description='解除綁定')
    async def unbind(self, interaction: discord.Interaction):  # type: ignore[override]
        r = await self._get_redis()
        if not r:
            await interaction.response.send_message('❌ 解除失敗：Redis 未就緒', ephemeral=True)
            return
        await r.hdel(BIND_HASH, str(interaction.user.id))
        await interaction.response.send_message('🧹 已解除綁定', ephemeral=True)
