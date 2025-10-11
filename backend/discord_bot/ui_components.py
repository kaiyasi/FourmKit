"""
Discord UI Components - Select Menus, Modals, Views
"""

import discord
from discord import app_commands
from discord.ext import commands
from typing import Dict, List, Optional, Callable, Any
import datetime

class TerminalEmbed:
    """終端風格的 Embed 生成器"""
    
    COLORS = {
        'success': 0x00FF00,    # 綠色
        'error': 0xFF0000,      # 紅色  
        'warning': 0xFFFF00,    # 黃色
        'info': 0x00FFFF,       # 青色
        'system': 0x808080,     # 灰色
        'admin': 0xFF6B00,      # 橙色
        'moderator': 0x9932CC,  # 紫色
    }
    
    @staticmethod
    def create(
        title: str,
        description: str = "",
        color: str = 'info',
        command: str = None,
        output: str = None,
        error: str = None,
        footer: str = None
    ) -> discord.Embed:
        """創建終端風格的 Embed"""
        
        embed = discord.Embed(
            title=f"```ansi\n\u001b[1;32m{title}\u001b[0m\n```",
            color=TerminalEmbed.COLORS.get(color, TerminalEmbed.COLORS['info']),
            timestamp=datetime.datetime.now()
        )
        
        if command:
            embed.add_field(
                name="```bash\n$ Command```", 
                value=f"```bash\n{command}\n```",
                inline=False
            )
        
        if description:
            embed.description = f"```ansi\n{description}\n```"
        
        if output:
            embed.add_field(
                name="```bash\n📤 Output```",
                value=f"```ansi\n{output}\n```",
                inline=False
            )
        
        if error:
            embed.add_field(
                name="```bash\n❌ Error```",
                value=f"```diff\n- {error}\n```",
                inline=False
            )
        
        embed.set_footer(
            text=footer or "ForumKit Terminal • 使用 /help 查看指令",
            icon_url="https://cdn.discordapp.com/emojis/1234567890123456789.png"
        )
        
        return embed

class CommandSelectMenu(discord.ui.Select):
    """指令選擇選單"""
    
    def __init__(self, category: str, commands_data: Dict[str, Dict]):
        self.category = category
        self.commands_data = commands_data
        
        options = []
        for cmd_name, cmd_info in commands_data.items():
            emoji = self._get_command_emoji(cmd_name)
            options.append(
                discord.SelectOption(
                    label=cmd_name,
                    description=cmd_info.get('description', '無描述'),
                    emoji=emoji,
                    value=cmd_name
                )
            )
        
        super().__init__(
            placeholder=f"選擇 {category} 指令...",
            options=options,
            min_values=1,
            max_values=1
        )
    
    def _get_command_emoji(self, cmd_name: str) -> str:
        """根據指令名稱返回對應的 emoji"""
        emoji_map = {
            'ping': '🏓', 'status': '📊', 'info': 'ℹ️', 'help': '❓',
            'pending': '⏳', 'approve': '✅', 'reject': '❌', 'queue': '📋',
            'users': '👥', 'ban': '🔨', 'unban': '🕊️', 'permission': '🔑',
            'stats': '📈', 'activity': '📊', 'logs': '📄',
            'config': '⚙️', 'reload': '🔄', 'sync': '🔗',
            'version': '📦'
        }
        return emoji_map.get(cmd_name, '🔧')
    
    async def callback(self, interaction: discord.Interaction):
        """選擇指令時的回調"""
        selected_cmd = self.values[0]
        cmd_info = self.commands_data[selected_cmd]
        
        embed = TerminalEmbed.create(
            title=f"{self.category.title()} / {selected_cmd}",
            description=cmd_info.get('description', '無描述'),
            command=f"/{selected_cmd}",
            output=f"權限等級: {cmd_info.get('permission_level', 'user')}\n冷卻時間: {cmd_info.get('cooldown', 0)} 秒",
            color='info'
        )
        
        view = None
        if cmd_info.get('usage_example'):
            view = CommandExampleView(selected_cmd, cmd_info)
        
        await interaction.response.edit_message(embed=embed, view=view)

class CommandExampleView(discord.ui.View):
    """指令範例展示"""
    
    def __init__(self, command: str, cmd_info: Dict):
        super().__init__(timeout=300)
        self.command = command
        self.cmd_info = cmd_info
    
    @discord.ui.button(label="查看範例", style=discord.ButtonStyle.secondary, emoji="📝")
    async def show_example(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = TerminalEmbed.create(
            title=f"指令範例: /{self.command}",
            command=self.cmd_info.get('usage_example', f"/{self.command}"),
            output="點擊「執行指令」來執行此範例",
            color='info'
        )
        await interaction.response.edit_message(embed=embed, view=self)
    
    @discord.ui.button(label="執行指令", style=discord.ButtonStyle.primary, emoji="▶️")
    async def execute_command(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message(
            f"執行指令: `/{self.command}`", 
            ephemeral=True
        )

class ModerationActionSelect(discord.ui.Select):
    """審核動作選擇選單"""
    
    def __init__(self):
        options = [
            discord.SelectOption(
                label="批准內容", 
                description="批准待審核的內容", 
                emoji="✅", 
                value="approve"
            ),
            discord.SelectOption(
                label="拒絕內容", 
                description="拒絕待審核的內容", 
                emoji="❌", 
                value="reject"
            ),
            discord.SelectOption(
                label="標記為垃圾訊息", 
                description="標記內容為垃圾訊息", 
                emoji="🗑️", 
                value="spam"
            ),
            discord.SelectOption(
                label="移至待討論", 
                description="移至需要討論的項目", 
                emoji="💬", 
                value="discuss"
            ),
        ]
        
        super().__init__(
            placeholder="選擇審核動作...",
            options=options,
            min_values=1,
            max_values=1
        )
    
    async def callback(self, interaction: discord.Interaction):
        action = self.values[0]
        
        if action == "reject":
            modal = RejectReasonModal()
            await interaction.response.send_modal(modal)
        elif action == "approve":
            embed = TerminalEmbed.create(
                title="內容審核",
                output="✅ 內容已批准",
                color='success'
            )
            await interaction.response.edit_message(embed=embed, view=None)
        else:
            embed = TerminalEmbed.create(
                title="內容審核",
                output=f"📝 動作已執行: {action}",
                color='info'
            )
            await interaction.response.edit_message(embed=embed, view=None)

class RejectReasonModal(discord.ui.Modal, title="拒絕內容"):
    """拒絕內容的原因輸入 Modal"""
    
    reason = discord.ui.TextInput(
        label="拒絕原因",
        placeholder="請輸入拒絕此內容的原因...",
        required=True,
        max_length=500,
        style=discord.TextStyle.paragraph
    )
    
    additional_notes = discord.ui.TextInput(
        label="附加說明 (可選)",
        placeholder="給用戶的額外說明或建議...",
        required=False,
        max_length=300,
        style=discord.TextStyle.paragraph
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        embed = TerminalEmbed.create(
            title="內容審核 - 已拒絕",
            command=f"reject --reason=\"{self.reason.value}\"",
            output=f"❌ 內容已拒絕\n理由: {self.reason.value}",
            color='error'
        )
        
        if self.additional_notes.value:
            embed.add_field(
                name="```bash\n📝 附加說明```",
                value=f"```\n{self.additional_notes.value}\n```",
                inline=False
            )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

class UserManagementModal(discord.ui.Modal, title="用戶管理"):
    """用戶管理的 Modal"""
    
    user_id = discord.ui.TextInput(
        label="用戶 ID 或提及",
        placeholder="@username 或 123456789012345678",
        required=True,
        max_length=100
    )
    
    action_reason = discord.ui.TextInput(
        label="操作原因",
        placeholder="請輸入執行此操作的原因...",
        required=True,
        max_length=500,
        style=discord.TextStyle.paragraph
    )
    
    duration = discord.ui.TextInput(
        label="持續時間 (可選)",
        placeholder="例如: 7d, 24h, 30m (留空為永久)",
        required=False,
        max_length=20
    )
    
    def __init__(self, action_type: str):
        self.action_type = action_type
        super().__init__(title=f"用戶管理 - {action_type}")
    
    async def on_submit(self, interaction: discord.Interaction):
        embed = TerminalEmbed.create(
            title=f"用戶管理 - {self.action_type}",
            command=f"{self.action_type.lower()} {self.user_id.value} \"{self.action_reason.value}\"",
            output=f"✅ 用戶 {self.action_type.lower()} 操作已執行",
            color='success'
        )
        
        embed.add_field(
            name="```bash\n📋 操作詳情```",
            value=f"```\n用戶: {self.user_id.value}\n原因: {self.action_reason.value}\n時長: {self.duration.value or '永久'}\n```",
            inline=False
        )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

class ConfigurationSelect(discord.ui.Select):
    """配置選擇選單"""
    
    def __init__(self):
        options = [
            discord.SelectOption(
                label="Bot 設定", 
                description="檢視和修改 Bot 基本設定", 
                emoji="🤖", 
                value="bot_config"
            ),
            discord.SelectOption(
                label="權限設定", 
                description="管理用戶權限和角色", 
                emoji="🔐", 
                value="permissions"
            ),
            discord.SelectOption(
                label="頻道設定", 
                description="設定通知和日誌頻道", 
                emoji="📺", 
                value="channels"
            ),
            discord.SelectOption(
                label="自動化規則", 
                description="設定自動審核和回應規則", 
                emoji="⚡", 
                value="automation"
            ),
        ]
        
        super().__init__(
            placeholder="選擇配置類型...",
            options=options,
            min_values=1,
            max_values=1
        )
    
    async def callback(self, interaction: discord.Interaction):
        config_type = self.values[0]
        
        if config_type == "bot_config":
            embed = TerminalEmbed.create(
                title="Bot 配置",
                output="🤖 當前 Bot 配置\n前綴: /\n狀態: 運行中\n命令總數: 25",
                color='info'
            )
        elif config_type == "permissions":
            view = PermissionManagementView()
            embed = TerminalEmbed.create(
                title="權限管理",
                output="🔐 選擇要管理的權限類型",
                color='admin'
            )
            await interaction.response.edit_message(embed=embed, view=view)
            return
        else:
            embed = TerminalEmbed.create(
                title=f"配置: {config_type}",
                output=f"⚙️ {config_type} 配置頁面",
                color='info'
            )
        
        await interaction.response.edit_message(embed=embed, view=None)

class PermissionManagementView(discord.ui.View):
    """權限管理視圖"""
    
    def __init__(self):
        super().__init__(timeout=300)
    
    @discord.ui.button(label="設定用戶權限", style=discord.ButtonStyle.secondary, emoji="👤")
    async def set_user_permission(self, interaction: discord.Interaction, button: discord.ui.Button):
        modal = UserPermissionModal()
        await interaction.response.send_modal(modal)
    
    @discord.ui.button(label="設定角色權限", style=discord.ButtonStyle.secondary, emoji="🎭")
    async def set_role_permission(self, interaction: discord.Interaction, button: discord.ui.Button):
        modal = RolePermissionModal()
        await interaction.response.send_modal(modal)
    
    @discord.ui.button(label="檢視權限清單", style=discord.ButtonStyle.primary, emoji="📋")
    async def view_permissions(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = TerminalEmbed.create(
            title="權限清單",
            output="👤 用戶權限:\n├─ @admin#1234 → admin\n├─ @mod#5678 → moderator\n└─ @user#9012 → user\n\n🎭 角色權限:\n├─ @管理員 → admin\n└─ @版主 → moderator",
            color='info'
        )
        await interaction.response.edit_message(embed=embed, view=self)

class UserPermissionModal(discord.ui.Modal, title="設定用戶權限"):
    """用戶權限設定 Modal"""
    
    user = discord.ui.TextInput(
        label="用戶",
        placeholder="@username 或 123456789012345678",
        required=True
    )
    
    permission_level = discord.ui.TextInput(
        label="權限等級",
        placeholder="user / moderator / admin / dev_admin",
        required=True
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        embed = TerminalEmbed.create(
            title="權限設定完成",
            command=f"permission set {self.user.value} {self.permission_level.value}",
            output=f"✅ 用戶權限已更新\n用戶: {self.user.value}\n權限: {self.permission_level.value}",
            color='success'
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)

class RolePermissionModal(discord.ui.Modal, title="設定角色權限"):
    """角色權限設定 Modal"""
    
    role = discord.ui.TextInput(
        label="角色",
        placeholder="@role_name 或角色 ID",
        required=True
    )
    
    permission_level = discord.ui.TextInput(
        label="權限等級",
        placeholder="user / moderator / admin",
        required=True
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        embed = TerminalEmbed.create(
            title="角色權限設定完成",
            command=f"role permission {self.role.value} {self.permission_level.value}",
            output=f"✅ 角色權限已更新\n角色: {self.role.value}\n權限: {self.permission_level.value}",
            color='success'
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)