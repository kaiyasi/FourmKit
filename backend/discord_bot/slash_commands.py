"""
Discord Slash Commands using @app_commands
現代化斜線指令實現
"""

import discord
from discord import app_commands
from discord.ext import commands
from typing import Optional, Literal
import asyncio
import sys
import os
from datetime import datetime

# 添加父目錄到路徑
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from ui_components import (
    TerminalEmbed, CommandSelectMenu, ModerationActionSelect, 
    ConfigurationSelect, UserManagementModal, PermissionManagementView
)
from services.discord_service import DiscordService
from models.discord_config import DiscordPermissionLevel

class SlashCommandCog(commands.Cog):
    """斜線指令 Cog"""
    
    def __init__(self, bot):
        self.bot = bot
        self.discord_service = DiscordService()
    
    # ===================== 系統指令 =====================
    
    @app_commands.command(name="ping", description="🏓 測試機器人延遲")
    async def ping_slash(self, interaction: discord.Interaction):
        """Ping 指令"""
        latency = round(self.bot.latency * 1000)
        
        embed = TerminalEmbed.create(
            title="Ping Test",
            command="ping",
            output=f"🏓 Pong!\n延遲: {latency}ms\nAPI 延遲: {latency}ms",
            color='success' if latency < 100 else 'warning'
        )
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="status", description="📊 檢視系統狀態")
    async def status_slash(self, interaction: discord.Interaction):
        """系統狀態指令"""
        import psutil
        import platform
        
        # 獲取系統資訊
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        
        output = f"""🖥️ **系統資訊**
OS: {platform.system()} {platform.release()}
CPU 使用率: {cpu_percent}%
記憶體: {memory.percent}% ({memory.used // (1024**3)}GB / {memory.total // (1024**3)}GB)
啟動時間: {boot_time.strftime('%Y-%m-%d %H:%M:%S')}

🤖 **Bot 資訊**
延遲: {round(self.bot.latency * 1000)}ms
伺服器數量: {len(self.bot.guilds)}
用戶數量: {len(self.bot.users)}"""
        
        embed = TerminalEmbed.create(
            title="System Status",
            command="systemctl status forumkit-bot",
            output=output,
            color='success'
        )
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="help", description="❓ 顯示幫助選單")
    async def help_slash(self, interaction: discord.Interaction):
        """幫助指令 - 使用選擇選單"""
        
        embed = TerminalEmbed.create(
            title="ForumKit Bot 幫助系統",
            description="選擇下方的指令分類來檢視可用指令",
            command="help --interactive",
            output="🔧 系統指令\n👮 審核指令\n👥 用戶管理\n📊 統計指令\n⚙️ 配置指令\n🛠️ 工具指令",
            color='info'
        )
        
        # 創建選擇選單視圖
        view = HelpMenuView()
        await interaction.response.send_message(embed=embed, view=view)
    
    # ===================== 審核指令 =====================
    
    @app_commands.command(name="moderation", description="👮 開啟審核管理面板")
    async def moderation_slash(self, interaction: discord.Interaction):
        """審核管理主面板"""
        
        # 權限檢查
        # has_permission = await self._check_permission(interaction, DiscordPermissionLevel.MODERATOR)
        # if not has_permission:
        #     return
        
        embed = TerminalEmbed.create(
            title="審核管理面板",
            description="選擇要執行的審核操作",
            command="sudo moderation-panel",
            output="📋 待審核項目: 12\n✅ 今日已批准: 45\n❌ 今日已拒絕: 8\n⏱️ 平均處理時間: 5.2分",
            color='moderator'
        )
        
        # 創建審核動作選單
        view = ModerationPanelView()
        await interaction.response.send_message(embed=embed, view=view)
    
    @app_commands.command(name="pending", description="⏳ 檢視待審核內容")
    @app_commands.describe(limit="顯示數量限制 (1-50)")
    async def pending_slash(self, interaction: discord.Interaction, limit: Optional[int] = 10):
        """檢視待審核內容"""
        
        if limit and (limit < 1 or limit > 50):
            embed = TerminalEmbed.create(
                title="參數錯誤",
                error="limit 必須在 1-50 之間",
                color='error'
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # 模擬待審核數據
        pending_items = [
            {"id": 1001, "type": "貼文", "author": "user123", "preview": "這是一個測試貼文..."},
            {"id": 1002, "type": "回覆", "author": "user456", "preview": "回覆內容預覽..."},
            {"id": 1003, "type": "貼文", "author": "user789", "preview": "另一個待審核內容..."},
        ]
        
        output = "📋 **待審核項目**\n"
        for item in pending_items[:limit]:
            output += f"├─ #{item['id']} [{item['type']}] @{item['author']}\n"
            output += f"│  └─ {item['preview'][:50]}...\n"
        
        embed = TerminalEmbed.create(
            title="待審核內容",
            command=f"pending --limit={limit}",
            output=output,
            color='warning'
        )
        
        # 添加快速操作按鈕
        view = PendingItemsView(pending_items[:limit])
        await interaction.response.send_message(embed=embed, view=view)
    
    @app_commands.command(name="approve", description="✅ 批准內容")
    @app_commands.describe(content_id="要批准的內容 ID")
    async def approve_slash(self, interaction: discord.Interaction, content_id: int):
        """批准內容"""
        
        embed = TerminalEmbed.create(
            title="內容批准",
            command=f"approve {content_id}",
            output=f"✅ 內容 #{content_id} 已批准\n操作者: {interaction.user.display_name}\n時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            color='success'
        )
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="reject", description="❌ 拒絕內容")
    @app_commands.describe(
        content_id="要拒絕的內容 ID",
        reason="拒絕原因"
    )
    async def reject_slash(self, interaction: discord.Interaction, content_id: int, reason: Optional[str] = None):
        """拒絕內容"""
        
        if not reason:
            # 如果沒有提供原因，打開 Modal
            from ui_components import RejectReasonModal
            modal = RejectReasonModal()
            modal.content_id = content_id
            await interaction.response.send_modal(modal)
        else:
            embed = TerminalEmbed.create(
                title="內容拒絕",
                command=f"reject {content_id} \"{reason}\"",
                output=f"❌ 內容 #{content_id} 已拒絕\n原因: {reason}\n操作者: {interaction.user.display_name}",
                color='error'
            )
            
            await interaction.response.send_message(embed=embed)
    
    # ===================== 用戶管理指令 =====================
    
    @app_commands.command(name="users", description="👥 檢視用戶列表")
    @app_commands.describe(
        status="用戶狀態篩選",
        limit="顯示數量限制"
    )
    async def users_slash(
        self, 
        interaction: discord.Interaction, 
        status: Optional[Literal["active", "banned", "all"]] = "all",
        limit: Optional[int] = 20
    ):
        """檢視用戶列表"""
        
        # 模擬用戶數據
        users_data = [
            {"username": "user123", "status": "active", "join_date": "2023-01-15", "posts": 45},
            {"username": "user456", "status": "banned", "join_date": "2023-02-20", "posts": 12},
            {"username": "user789", "status": "active", "join_date": "2023-03-10", "posts": 78},
        ]
        
        filtered_users = users_data if status == "all" else [u for u in users_data if u["status"] == status]
        
        output = f"👥 **用戶列表 ({status})** \n"
        for user in filtered_users[:limit]:
            status_emoji = "🟢" if user["status"] == "active" else "🔴"
            output += f"{status_emoji} @{user['username']} | {user['posts']} 貼文 | {user['join_date']}\n"
        
        embed = TerminalEmbed.create(
            title="用戶管理",
            command=f"users --status={status} --limit={limit}",
            output=output,
            color='info'
        )
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="ban", description="🔨 封鎖用戶")
    @app_commands.describe(
        user="要封鎖的用戶",
        reason="封鎖原因",
        duration="封鎖時長 (例如: 7d, 24h, 30m)"
    )
    async def ban_slash(
        self, 
        interaction: discord.Interaction, 
        user: discord.User,
        reason: str,
        duration: Optional[str] = None
    ):
        """封鎖用戶"""
        
        embed = TerminalEmbed.create(
            title="用戶封鎖",
            command=f"ban @{user.display_name} \"{reason}\" {duration or 'permanent'}",
            output=f"🔨 用戶已封鎖\n用戶: @{user.display_name} ({user.id})\n原因: {reason}\n時長: {duration or '永久'}\n操作者: {interaction.user.display_name}",
            color='error'
        )
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="unban", description="🕊️ 解除封鎖")
    @app_commands.describe(user="要解除封鎖的用戶")
    async def unban_slash(self, interaction: discord.Interaction, user: discord.User):
        """解除用戶封鎖"""
        
        embed = TerminalEmbed.create(
            title="解除封鎖",
            command=f"unban @{user.display_name}",
            output=f"🕊️ 用戶封鎖已解除\n用戶: @{user.display_name}\n操作者: {interaction.user.display_name}",
            color='success'
        )
        
        await interaction.response.send_message(embed=embed)
    
    # ===================== 統計指令 =====================
    
    @app_commands.command(name="stats", description="📊 檢視統計數據")
    @app_commands.describe(
        period="統計期間",
        category="統計類別"
    )
    async def stats_slash(
        self, 
        interaction: discord.Interaction,
        period: Optional[Literal["today", "week", "month", "all"]] = "today",
        category: Optional[Literal["posts", "users", "moderation", "all"]] = "all"
    ):
        """檢視統計數據"""
        
        stats_data = {
            "posts": {"new": 45, "approved": 40, "rejected": 5},
            "users": {"new": 12, "active": 150, "banned": 3},
            "moderation": {"actions": 48, "avg_time": "5.2min"}
        }
        
        if category == "all":
            output = "📊 **今日統計概覽**\n"
            output += f"📝 貼文: {stats_data['posts']['new']} 新 | {stats_data['posts']['approved']} 批准 | {stats_data['posts']['rejected']} 拒絕\n"
            output += f"👥 用戶: {stats_data['users']['new']} 新註冊 | {stats_data['users']['active']} 活躍\n"
            output += f"👮 審核: {stats_data['moderation']['actions']} 操作 | 平均 {stats_data['moderation']['avg_time']}"
        else:
            cat_data = stats_data[category]
            output = f"📊 **{category.title()} 統計 ({period})**\n"
            for key, value in cat_data.items():
                output += f"{key}: {value}\n"
        
        embed = TerminalEmbed.create(
            title=f"統計報告",
            command=f"stats --period={period} --category={category}",
            output=output,
            color='info'
        )
        
        await interaction.response.send_message(embed=embed)
    
    # ===================== 配置指令 =====================
    
    @app_commands.command(name="config", description="⚙️ 開啟配置面板")
    async def config_slash(self, interaction: discord.Interaction):
        """配置管理面板"""
        
        embed = TerminalEmbed.create(
            title="配置管理面板",
            description="選擇要配置的項目",
            command="sudo config-panel",
            output="🤖 Bot 設定\n🔐 權限管理\n📺 頻道設定\n⚡ 自動化規則",
            color='admin'
        )
        
        # 創建配置選單
        view = ConfigurationPanelView()
        await interaction.response.send_message(embed=embed, view=view)
    
    @app_commands.command(name="sync", description="🔄 同步斜線指令")
    async def sync_slash(self, interaction: discord.Interaction):
        """同步斜線指令"""
        
        await interaction.response.defer(thinking=True)
        
        try:
            synced = await self.bot.tree.sync()
            embed = TerminalEmbed.create(
                title="指令同步",
                command="bot tree sync",
                output=f"✅ 成功同步 {len(synced)} 個斜線指令",
                color='success'
            )
        except Exception as e:
            embed = TerminalEmbed.create(
                title="指令同步",
                command="bot tree sync",
                error=f"同步失敗: {str(e)}",
                color='error'
            )
        
        await interaction.followup.send(embed=embed)
    
    # ===================== 工具方法 =====================
    
    async def _check_permission(self, interaction: discord.Interaction, required_level: DiscordPermissionLevel) -> bool:
        """檢查用戶權限"""
        # 這裡實現權限檢查邏輯
        # 暫時返回 True，實際應該調用 discord_service
        return True

# ===================== UI 視圖類別 =====================

class HelpMenuView(discord.ui.View):
    """幫助選單視圖"""
    
    def __init__(self):
        super().__init__(timeout=300)
        
        # 指令分類數據
        self.commands_categories = {
            "system": {
                "ping": {"description": "測試機器人延遲"},
                "status": {"description": "檢視系統狀態"}, 
                "help": {"description": "顯示幫助資訊"}
            },
            "moderation": {
                "pending": {"description": "檢視待審核內容"},
                "approve": {"description": "批准內容"},
                "reject": {"description": "拒絕內容"}
            },
            "user": {
                "users": {"description": "檢視用戶列表"},
                "ban": {"description": "封鎖用戶"},
                "unban": {"description": "解除封鎖"}
            }
        }
        
        # 添加選擇選單
        self.add_item(CategorySelect(self.commands_categories))

class CategorySelect(discord.ui.Select):
    """指令分類選擇"""
    
    def __init__(self, categories):
        self.categories = categories
        
        options = [
            discord.SelectOption(label="系統指令", description="基本系統功能", emoji="🔧", value="system"),
            discord.SelectOption(label="審核指令", description="內容審核管理", emoji="👮", value="moderation"), 
            discord.SelectOption(label="用戶管理", description="用戶和權限管理", emoji="👥", value="user")
        ]
        
        super().__init__(placeholder="選擇指令分類...", options=options)
    
    async def callback(self, interaction: discord.Interaction):
        category = self.values[0]
        commands_data = self.categories[category]
        
        # 創建指令選單
        view = discord.ui.View(timeout=300)
        view.add_item(CommandSelectMenu(category, commands_data))
        
        embed = TerminalEmbed.create(
            title=f"{category.title()} 指令",
            output=f"選擇要檢視的 {category} 指令",
            color='info'
        )
        
        await interaction.response.edit_message(embed=embed, view=view)

class ModerationPanelView(discord.ui.View):
    """審核面板視圖"""
    
    def __init__(self):
        super().__init__(timeout=300)
    
    @discord.ui.button(label="檢視待審核", style=discord.ButtonStyle.secondary, emoji="📋")
    async def view_pending(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = TerminalEmbed.create(
            title="待審核內容",
            output="📋 目前有 12 個項目待審核\n使用 /pending 查看詳細清單",
            color='warning'
        )
        await interaction.response.edit_message(embed=embed, view=self)
    
    @discord.ui.button(label="快速審核", style=discord.ButtonStyle.primary, emoji="⚡")
    async def quick_review(self, interaction: discord.Interaction, button: discord.ui.Button):
        # 創建審核動作選單
        view = discord.ui.View()
        view.add_item(ModerationActionSelect())
        
        embed = TerminalEmbed.create(
            title="快速審核模式",
            description="選擇審核動作",
            color='moderator'
        )
        
        await interaction.response.edit_message(embed=embed, view=view)

class PendingItemsView(discord.ui.View):
    """待審核項目視圖"""
    
    def __init__(self, items):
        super().__init__(timeout=300)
        self.items = items
    
    @discord.ui.button(label="批准全部", style=discord.ButtonStyle.success, emoji="✅")
    async def approve_all(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = TerminalEmbed.create(
            title="批量批准",
            command="approve --all",
            output=f"✅ 已批准 {len(self.items)} 個項目",
            color='success'
        )
        await interaction.response.edit_message(embed=embed, view=None)
    
    @discord.ui.button(label="選擇性審核", style=discord.ButtonStyle.secondary, emoji="🔍")
    async def selective_review(self, interaction: discord.Interaction, button: discord.ui.Button):
        # 創建項目選擇選單
        options = []
        for item in self.items[:10]:  # Discord 限制最多 25 個選項
            options.append(
                discord.SelectOption(
                    label=f"#{item['id']} - {item['type']}",
                    description=f"@{item['author']}: {item['preview'][:50]}...",
                    value=str(item['id'])
                )
            )
        
        select = ItemSelect(options, self.items)
        view = discord.ui.View()
        view.add_item(select)
        
        embed = TerminalEmbed.create(
            title="選擇審核項目",
            output="選擇要審核的具體項目",
            color='info'
        )
        
        await interaction.response.edit_message(embed=embed, view=view)

class ItemSelect(discord.ui.Select):
    """項目選擇選單"""
    
    def __init__(self, options, items):
        self.items = items
        super().__init__(placeholder="選擇要審核的項目...", options=options)
    
    async def callback(self, interaction: discord.Interaction):
        selected_id = int(self.values[0])
        selected_item = next(item for item in self.items if item['id'] == selected_id)
        
        # 創建審核動作選單
        view = discord.ui.View()
        view.add_item(ModerationActionSelect())
        
        embed = TerminalEmbed.create(
            title=f"審核項目 #{selected_id}",
            output=f"類型: {selected_item['type']}\n作者: @{selected_item['author']}\n內容: {selected_item['preview']}",
            color='info'
        )
        
        await interaction.response.edit_message(embed=embed, view=view)

class ConfigurationPanelView(discord.ui.View):
    """配置面板視圖"""
    
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(ConfigurationSelect())

async def setup(bot):
    """載入 Cog"""
    await bot.add_cog(SlashCommandCog(bot))