import React, { useState, useEffect } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { 
  MessageSquare,
  Plus, 
  Settings, 
  Activity, 
  Users, 
  Shield,
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  BarChart3,
  RefreshCw,
  ArrowLeft,
  Hash,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Edit,
  Play,
  Square,
  Command
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface DiscordServerConfig {
  id: number;
  server_id: string;
  server_name: string;
  bot_token?: string;
  bot_user_id?: string;
  bot_nickname?: string;
  webhook_url?: string;
  webhook_name?: string;
  integration_type: 'webhook_only' | 'bot_basic' | 'bot_advanced' | 'full_integration';
  is_active: boolean;
  auto_sync: boolean;
  default_channel_id?: string;
  admin_channel_id?: string;
  log_channel_id?: string;
  moderation_channel_id?: string;
  admin_role_id?: string;
  moderator_role_id?: string;
  user_role_id?: string;
  created_at: string;
  last_connected?: string;
}

interface DiscordCommand {
  id: number;
  command_name: string;
  description: string;
  category: 'system' | 'moderation' | 'user' | 'content' | 'stats' | 'config' | 'utility';
  required_permission: 'owner' | 'dev_admin' | 'admin' | 'moderator' | 'user' | 'guest';
  is_enabled: boolean;
  usage_count: number;
  last_used?: string;
  cooldown_seconds: number;
  max_uses_per_hour: number;
}

interface DiscordUser {
  id: number;
  discord_user_id: string;
  discord_username: string;
  permission_level: 'owner' | 'dev_admin' | 'admin' | 'moderator' | 'user' | 'guest';
  forumkit_user_id?: number;
  forumkit_role?: string;
  is_active: boolean;
  is_banned: boolean;
  ban_reason?: string;
  ban_expires_at?: string;
  last_activity?: string;
}

interface DiscordStats {
  period: {
    start: string;
    end: string;
  };
  commands: {
    total: number;
    successful: number;
    failed: number;
    by_category: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    banned: number;
  };
  activities: {
    total: number;
    by_type: Record<string, number>;
  };
}

const DiscordPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = ['dev_admin', 'admin'].includes(role || '');
  
  const [activeTab, setActiveTab] = useState('overview');
  const [servers, setServers] = useState<DiscordServerConfig[]>([]);
  const [commands, setCommands] = useState<DiscordCommand[]>([]);
  const [users, setUsers] = useState<DiscordUser[]>([]);
  const [stats, setStats] = useState<DiscordStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 配置編輯狀態
  const [showAddServer, setShowAddServer] = useState(false);
  const [editingServer, setEditingServer] = useState<DiscordServerConfig | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const html = document.documentElement;
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige');
    html.classList.add('theme-ready');
    return () => html.classList.remove('theme-ready');
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [activeTab, isAdmin]);

  const loadData = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      
      if (activeTab === 'overview' || activeTab === 'servers') {
        const response = await fetch('/api/discord/servers', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
        const data = await response.json();
        if (data.success) {
          setServers(data.data);
        } else {
          throw new Error(data.error || '載入伺服器配置失敗');
        }
      }
      
      if (activeTab === 'commands') {
        const response = await fetch('/api/discord/commands', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
        const data = await response.json();
        if (data.success) {
          setCommands(data.data);
        } else {
          throw new Error(data.error || '載入指令配置失敗');
        }
      }
      
      if (activeTab === 'users') {
        const response = await fetch('/api/discord/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
        const data = await response.json();
        if (data.success) {
          setUsers(data.data);
        } else {
          throw new Error(data.error || '載入用戶權限失敗');
        }
      }
      
      if (activeTab === 'stats') {
        const response = await fetch('/api/discord/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API 錯誤: ${response.status}`);
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        } else {
          throw new Error(data.error || '載入統計數據失敗');
        }
      }
    } catch (error) {
      console.error('載入數據失敗:', error);
      setError(error instanceof Error ? error.message : '載入數據失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleServerAction = async (action: string, serverId?: number, data?: any) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/discord/servers${serverId ? `/${serverId}` : ''}`, {
        method: action === 'delete' ? 'DELETE' : serverId ? 'PUT' : 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: data ? JSON.stringify(data) : undefined
      });
      
      if (!response.ok) throw new Error(`操作失敗: ${response.status}`);
      const result = await response.json();
      
      if (result.success) {
        await loadData(); // 重新載入數據
        setShowAddServer(false);
        setEditingServer(null);
      } else {
        throw new Error(result.error || '操作失敗');
      }
    } catch (error) {
      console.error('操作失敗:', error);
      alert(error instanceof Error ? error.message : '操作失敗');
    }
  };

  const toggleServerStatus = async (serverId: number, isActive: boolean) => {
    await handleServerAction('update', serverId, { is_active: !isActive });
  };

  const toggleToken = (serverId: string) => {
    setShowTokens(prev => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  const getIntegrationTypeText = (type: string) => {
    const types = {
      webhook_only: '僅 Webhook',
      bot_basic: '基本 Bot',
      bot_advanced: '進階 Bot',
      full_integration: '完整整合'
    };
    return types[type as keyof typeof types] || type;
  };

  const getPermissionText = (level: string) => {
    const levels = {
      owner: '擁有者',
      dev_admin: '開發管理員',
      admin: '管理員',
      moderator: '版主',
      user: '用戶',
      guest: '訪客'
    };
    return levels[level as keyof typeof levels] || level;
  };

  const getCategoryText = (category: string) => {
    const categories = {
      system: '系統',
      moderation: '審核',
      user: '用戶',
      content: '內容',
      stats: '統計',
      config: '配置',
      utility: '工具'
    };
    return categories[category as keyof typeof categories] || category;
  };

  // 權限檢查
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-fg mb-2">權限不足</h1>
          <p className="text-muted">只有管理員可以訪問 Discord 管理功能</p>
        </div>
      </div>
    );
  }

  // 錯誤顯示
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar pathname="/admin/discord" />
        <MobileBottomNav />
        <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-fg mb-2">載入失敗</h1>
              <p className="text-muted mb-4">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                重試
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/discord" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500" />
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold dual-text">Discord 管理</h1>
              </div>
              <p className="text-sm text-muted">
                管理 Discord Bot 配置、權限控制和自動化功能
              </p>
            </div>
          </div>
        </div>

        {/* 頁籤導航 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
          <div className="border-b border-border">
            <nav className="flex space-x-8 p-4" aria-label="頁籤">
              {[
                { id: 'overview', name: '概覽', icon: BarChart3 },
                { id: 'servers', name: '伺服器配置', icon: Settings },
                { id: 'commands', name: '指令管理', icon: Command },
                { id: 'users', name: '用戶權限', icon: Users },
                { id: 'stats', name: '統計報告', icon: Activity },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg hover:border-border'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* 內容區域 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
              <p className="text-muted">載入中...</p>
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'servers' && renderServers()}
              {activeTab === 'commands' && renderCommands()}
              {activeTab === 'users' && renderUsers()}
              {activeTab === 'stats' && renderStats()}
            </div>
          )}
        </div>
      </main>
    </div>
  );

  function renderOverview() {
    const activeServers = servers.filter(s => s.is_active);
    const totalCommands = commands.length;
    const enabledCommands = commands.filter(c => c.is_enabled).length;
    const totalUsers = users.length;
    const bannedUsers = users.filter(u => u.is_banned).length;

    return (
      <div className="space-y-6">
        {/* 快速統計 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">活躍伺服器</p>
                <p className="text-2xl font-bold text-fg">
                  {activeServers.length}/{servers.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Command className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">可用指令</p>
                <p className="text-2xl font-bold text-fg">
                  {enabledCommands}/{totalCommands}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">註冊用戶</p>
                <p className="text-2xl font-bold text-fg">
                  {totalUsers}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <Shield className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">封鎖用戶</p>
                <p className="text-2xl font-bold text-fg">
                  {bannedUsers}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 伺服器狀態 */}
        <div className="bg-surface-hover rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">伺服器狀態</h3>
          {servers.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>尚未配置任何 Discord 伺服器</p>
              <button
                onClick={() => setShowAddServer(true)}
                className="mt-3 btn-primary px-4 py-2 text-sm"
              >
                新增伺服器
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.slice(0, 5).map(server => (
                <div key={server.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      server.is_active ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="font-medium text-fg">{server.server_name}</div>
                      <div className="text-sm text-muted">
                        {getIntegrationTypeText(server.integration_type)}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted">
                    {server.last_connected ? 
                      `最後連線: ${new Date(server.last_connected).toLocaleDateString()}` : 
                      '尚未連線'
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderServers() {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-fg">Discord 伺服器管理</h2>
          <button
            onClick={() => setShowAddServer(true)}
            className="btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新增伺服器
          </button>
        </div>

        <div className="space-y-4">
          {servers.map(server => (
            <div key={server.id} className="bg-surface-hover border border-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${
                    server.is_active ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <h3 className="text-lg font-semibold text-fg">{server.server_name}</h3>
                    <p className="text-sm text-muted">伺服器 ID: {server.server_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleServerStatus(server.id, server.is_active)}
                    className={`p-2 rounded-lg transition-colors ${
                      server.is_active 
                        ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                    title={server.is_active ? '停用' : '啟用'}
                  >
                    {server.is_active ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setEditingServer(server)}
                    className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                    title="編輯"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">整合類型</label>
                  <div className="text-sm text-fg">{getIntegrationTypeText(server.integration_type)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Bot 狀態</label>
                  <div className="text-sm text-fg">
                    {server.bot_user_id ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        已連線
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <XCircle className="w-3 h-3" />
                        未連線
                      </span>
                    )}
                  </div>
                </div>
                {server.webhook_url && (
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">Webhook</label>
                    <div className="text-sm text-fg">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        已配置
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">最後連線</label>
                  <div className="text-sm text-fg">
                    {server.last_connected ? 
                      new Date(server.last_connected).toLocaleString('zh-TW') : 
                      '從未連線'
                    }
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {servers.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 text-muted mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-fg mb-2">尚未配置伺服器</h3>
            <p className="text-muted mb-6">開始設定您的第一個 Discord 伺服器整合</p>
            <button
              onClick={() => setShowAddServer(true)}
              className="btn-primary px-6 py-3 font-medium"
            >
              新增 Discord 伺服器
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderCommands() {
    const groupedCommands = commands.reduce((acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    }, {} as Record<string, DiscordCommand[]>);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-fg">指令管理</h2>
          <div className="text-sm text-muted">
            總共 {commands.length} 個指令，{commands.filter(c => c.is_enabled).length} 個已啟用
          </div>
        </div>

        {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
          <div key={category} className="bg-surface-hover border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
              <Hash className="w-5 h-5" />
              {getCategoryText(category)} ({categoryCommands.length})
            </h3>
            
            <div className="space-y-3">
              {categoryCommands.map(command => (
                <div key={command.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      command.is_enabled ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="font-medium text-fg">!fk {command.command_name}</div>
                      <div className="text-sm text-muted">{command.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-muted">
                      權限: {getPermissionText(command.required_permission)}
                    </div>
                    <div className="text-xs text-muted">
                      使用: {command.usage_count} 次
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs ${
                      command.is_enabled 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {command.is_enabled ? '已啟用' : '已停用'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {commands.length === 0 && (
          <div className="text-center py-12">
            <Command className="w-16 h-16 text-muted mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-fg mb-2">尚無可用指令</h3>
            <p className="text-muted">請先配置 Discord 伺服器以載入預設指令</p>
          </div>
        )}
      </div>
    );
  }

  function renderUsers() {
    const groupedUsers = users.reduce((acc, user) => {
      if (!acc[user.permission_level]) acc[user.permission_level] = [];
      acc[user.permission_level].push(user);
      return acc;
    }, {} as Record<string, DiscordUser[]>);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-fg">用戶權限管理</h2>
          <div className="text-sm text-muted">
            總共 {users.length} 個用戶，{users.filter(u => u.is_banned).length} 個被封鎖
          </div>
        </div>

        {Object.entries(groupedUsers).map(([level, levelUsers]) => (
          <div key={level} className="bg-surface-hover border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {getPermissionText(level)} ({levelUsers.length})
            </h3>
            
            <div className="space-y-3">
              {levelUsers.map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      user.is_banned ? 'bg-red-500' : 
                      user.is_active ? 'bg-green-500' : 'bg-gray-400'
                    }`}>
                      {user.discord_username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-fg">{user.discord_username}</div>
                      <div className="text-sm text-muted">
                        Discord ID: {user.discord_user_id}
                        {user.forumkit_role && ` • ForumKit: ${user.forumkit_role}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {user.last_activity && (
                      <div className="text-xs text-muted">
                        最後活動: {new Date(user.last_activity).toLocaleDateString()}
                      </div>
                    )}
                    <div className={`px-2 py-1 rounded-full text-xs ${
                      user.is_banned ? 'bg-red-100 text-red-800' :
                      user.is_active ? 'bg-green-100 text-green-800' : 
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {user.is_banned ? '已封鎖' : user.is_active ? '正常' : '未啟用'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-muted mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-fg mb-2">尚無註冊用戶</h3>
            <p className="text-muted">用戶在使用 Discord Bot 指令後會自動註冊</p>
          </div>
        )}
      </div>
    );
  }

  function renderStats() {
    if (!stats) {
      return (
        <div className="text-center py-12">
          <BarChart3 className="w-16 h-16 text-muted mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-fg mb-2">統計數據載入中</h3>
          <p className="text-muted">請稍等片刻...</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-fg">統計報告</h2>
          <div className="text-sm text-muted">
            統計期間: {new Date(stats.period.start).toLocaleDateString()} - {new Date(stats.period.end).toLocaleDateString()}
          </div>
        </div>

        {/* 指令統計 */}
        <div className="bg-surface-hover border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">指令執行統計</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.commands.total}</div>
              <div className="text-sm text-muted">總執行次數</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.commands.successful}</div>
              <div className="text-sm text-muted">成功執行</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.commands.failed}</div>
              <div className="text-sm text-muted">執行失敗</div>
            </div>
          </div>
          
          <h4 className="font-medium text-fg mb-3">各分類執行次數</h4>
          <div className="space-y-2">
            {Object.entries(stats.commands.by_category).map(([category, count]) => (
              <div key={category} className="flex justify-between items-center">
                <span className="text-sm text-fg">{getCategoryText(category)}</span>
                <span className="text-sm font-medium text-fg">{count} 次</span>
              </div>
            ))}
          </div>
        </div>

        {/* 用戶統計 */}
        <div className="bg-surface-hover border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">用戶統計</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.users.total}</div>
              <div className="text-sm text-muted">註冊用戶</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.users.active}</div>
              <div className="text-sm text-muted">活躍用戶</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.users.banned}</div>
              <div className="text-sm text-muted">封鎖用戶</div>
            </div>
          </div>
        </div>

        {/* 活動統計 */}
        <div className="bg-surface-hover border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">活動統計</h3>
          <div className="mb-4">
            <div className="text-2xl font-bold text-purple-600">{stats.activities.total}</div>
            <div className="text-sm text-muted">總活動次數</div>
          </div>
          
          <h4 className="font-medium text-fg mb-3">活動類型分布</h4>
          <div className="space-y-2">
            {Object.entries(stats.activities.by_type).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center">
                <span className="text-sm text-fg">{type}</span>
                <span className="text-sm font-medium text-fg">{count} 次</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
};

export default DiscordPage;