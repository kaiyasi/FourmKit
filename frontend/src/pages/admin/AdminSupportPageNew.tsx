import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { 
  ArrowLeft,
  MessageSquare, 
  RefreshCw,
  LifeBuoy,
  Send,
  X,
  Calendar,
  Tag,
  Star,
  Clock,
  User,
  UserCheck,
  UserX,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MoreVertical,
  FileText,
  TrendingUp,
  Users,
  Search,
  Filter,
  Plus,
  Eye,
  Trash2
} from 'lucide-react';
import { api } from '@/services/api';

interface AdminTicket {
  id: string;
  ticket_id: string;
  subject: string;
  status: 'open' | 'awaiting_user' | 'awaiting_admin' | 'resolved' | 'closed';
  category: 'technical' | 'account' | 'feature' | 'bug' | 'abuse' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  last_activity_at: string;
  message_count: number;
  user_name: string;
  user_email?: string;
  assigned_to?: string;
  assignee_name?: string;
  school?: string;
  labels?: string[];
  processing?: boolean;
}

interface TicketMessage {
  id: string;
  body: string;
  author_type: 'user' | 'admin' | 'system';
  author_display_name: string;
  created_at: string;
}

interface AdminTicketDetail extends AdminTicket {
  messages: TicketMessage[];
  user_info?: {
    id: string;
    username: string;
    email: string;
    role: string;
    created_at: string;
    last_login_at?: string;
  };
}

interface TicketStats {
  total: number;
  open: number;
  awaiting_admin: number;
  awaiting_user: number;
  resolved: number;
  closed: number;
  unassigned: number;
  overdue: number;
}

const AdminSupportPageNew: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 狀態管理
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<AdminTicketDetail | null>(null);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    category: 'all',
    priority: 'all',
    assignee: 'all',
    page: 1,
    per_page: 20
  });
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showTicketActions, setShowTicketActions] = useState(false);
  
  // 響應式檢測
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 從 URL 參數讀取選中的工單
  const selectedTicketId = searchParams.get('ticket');

  // 載入數據
  useEffect(() => {
    loadData();
  }, [filters.page, filters.per_page, filters.status, filters.category, filters.priority, filters.assignee]);

  // 載入選中的工單詳情
  useEffect(() => {
    if (selectedTicketId) {
      loadTicketDetail(selectedTicketId);
    } else {
      setSelectedTicket(null);
    }
  }, [selectedTicketId]);

  const loadData = useCallback(async () => {
    await Promise.all([loadTickets(), loadStats()]);
  }, []);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/support/tickets', { params: filters });
      if (response.success) {
        setTickets(response.data);
      }
    } catch (error) {
      console.error('載入工單失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/admin/support/stats');
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('載入統計失敗:', error);
    }
  };

  const loadTicketDetail = async (ticketId: string) => {
    try {
      const response = await api.get(`/admin/support/tickets/${ticketId}`);
      if (response.success) {
        setSelectedTicket(response.data);
      }
    } catch (error) {
      console.error('載入工單詳情失敗:', error);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
    if (selectedTicketId) {
      await loadTicketDetail(selectedTicketId);
    }
    setRefreshing(false);
  };

  // 篩選工單
  const filteredTickets = tickets.filter(ticket => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = ticket.subject.toLowerCase().includes(searchLower) ||
                          ticket.ticket_id.toLowerCase().includes(searchLower) ||
                          ticket.user_name.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }
    
    if (filters.status !== 'all' && ticket.status !== filters.status) return false;
    if (filters.category !== 'all' && ticket.category !== filters.category) return false;
    if (filters.priority !== 'all' && ticket.priority !== filters.priority) return false;
    if (filters.assignee === 'unassigned' && ticket.assigned_to) return false;
    if (filters.assignee === 'me' && ticket.assigned_to !== user?.id.toString()) return false;
    if (filters.assignee !== 'all' && filters.assignee !== 'unassigned' && filters.assignee !== 'me' && ticket.assigned_to !== filters.assignee) return false;
    
    return true;
  });

  const selectTicket = (ticketId: string) => {
    setSearchParams({ ticket: ticketId });
  };

  const goBack = () => {
    setSearchParams({});
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    
    try {
      setSendingMessage(true);
      const response = await api.post(`/admin/support/tickets/${selectedTicket.id}/messages`, {
        body: newMessage.trim()
      });
      
      if (response.success) {
        setNewMessage('');
        await loadTicketDetail(selectedTicket.id);
      }
    } catch (error) {
      console.error('發送訊息失敗:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const updateTicketStatus = async (status: string) => {
    if (!selectedTicket) return;
    
    try {
      const response = await api.patch(`/admin/support/tickets/${selectedTicket.id}`, { status });
      if (response.success) {
        await Promise.all([loadTicketDetail(selectedTicket.id), loadData()]);
        setShowTicketActions(false);
        
        // 顯示成功通知
        showNotification('工單狀態已更新');
      }
    } catch (error) {
      console.error('更新狀態失敗:', error);
    }
  };

  const assignTicket = async (assigneeId?: string) => {
    if (!selectedTicket) return;
    
    try {
      const response = await api.patch(`/admin/support/tickets/${selectedTicket.id}`, { 
        assigned_to: assigneeId || null 
      });
      if (response.success) {
        await Promise.all([loadTicketDetail(selectedTicket.id), loadTickets()]);
        showNotification(assigneeId ? '工單已分配' : '工單分配已取消');
      }
    } catch (error) {
      console.error('分配工單失敗:', error);
    }
  };

  const showNotification = (message: string) => {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = 'fixed top-4 right-4 bg-success text-success-foreground px-4 py-2 rounded-xl shadow-lg z-50';
    document.body.appendChild(notification);
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  };

  const updateFilters = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1 // 重置頁面
    }));
  };

  // 狀態顯示組件
  const StatusBadge = ({ status }: { status: string }) => {
    const statusConfig = {
      open: { icon: MessageSquare, text: '開啟', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
      awaiting_user: { icon: Clock, text: '等待用戶', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
      awaiting_admin: { icon: AlertTriangle, text: '等待管理員', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
      resolved: { icon: CheckCircle2, text: '已解決', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
      closed: { icon: XCircle, text: '已關閉', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium ${config.className}`}>
        <Icon className="w-3.5 h-3.5" />
        {config.text}
      </span>
    );
  };

  // 優先級顯示組件
  const PriorityBadge = ({ priority }: { priority: string }) => {
    const priorityConfig = {
      low: { text: '低', className: 'text-green-600 dark:text-green-400' },
      medium: { text: '中', className: 'text-yellow-600 dark:text-yellow-400' },
      high: { text: '高', className: 'text-orange-600 dark:text-orange-400' },
      urgent: { text: '緊急', className: 'text-red-600 dark:text-red-400 font-semibold' }
    };

    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;

    return (
      <span className={`inline-flex items-center gap-1 text-sm font-medium ${config.className}`}>
        <Star className="w-3.5 h-3.5" />
        {config.text}
      </span>
    );
  };

  // 分類顯示組件
  const CategoryBadge = ({ category }: { category: string }) => {
    const categoryConfig = {
      technical: { text: '技術問題', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
      account: { text: '帳號問題', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
      feature: { text: '功能建議', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
      bug: { text: '錯誤報告', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
      abuse: { text: '濫用舉報', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
      other: { text: '其他', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' }
    };

    const config = categoryConfig[category as keyof typeof categoryConfig] || categoryConfig.other;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
        <Tag className="w-3 h-3" />
        {config.text}
      </span>
    );
  };

  // 統計卡片組件 - 採用審核管理的風格
  const StatsCard = ({ title, value, color, icon: Icon, description }: { 
    title: string; 
    value: number; 
    color: string; 
    icon: any; 
    description?: string;
  }) => (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-soft hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-2xl font-bold text-fg">{value}</span>
      </div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {description && <div className="text-xs text-muted mt-1">{description}</div>}
    </div>
  );

  // 工單操作菜單
  const TicketActionsMenu = () => (
    <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-lg z-50 py-2">
      <div className="px-4 py-2 text-sm font-medium text-muted border-b border-border">
        狀態操作
      </div>
      {[
        { status: 'open', label: '設為開啟', icon: MessageSquare },
        { status: 'awaiting_user', label: '等待用戶回應', icon: Clock },
        { status: 'resolved', label: '標記已解決', icon: CheckCircle2 },
        { status: 'closed', label: '關閉工單', icon: XCircle },
      ].map(({ status, label, icon: Icon }) => (
        <button
          key={status}
          onClick={() => updateTicketStatus(status)}
          className="w-full px-4 py-2 text-sm text-left hover:bg-surface-hover flex items-center gap-3 transition-colors"
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
      
      <div className="px-4 py-2 text-sm font-medium text-muted border-b border-t border-border mt-2">
        分配操作
      </div>
      <button
        onClick={() => assignTicket(user?.id.toString())}
        className="w-full px-4 py-2 text-sm text-left hover:bg-surface-hover flex items-center gap-3 transition-colors"
      >
        <UserCheck className="w-4 h-4" />
        分配給我
      </button>
      <button
        onClick={() => assignTicket()}
        className="w-full px-4 py-2 text-sm text-left hover:bg-surface-hover flex items-center gap-3 transition-colors"
      >
        <UserX className="w-4 h-4" />
        取消分配
      </button>
    </div>
  );

  // 工單詳情視圖
  if (selectedTicket) {
    return (
      <div className="min-h-screen bg-bg">
        <NavBar pathname="/admin/support" />
        <div className="page-content">
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* 返回按鈕和標題 */}
            <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={goBack}
                  className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  返回列表
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-fg">工單 #{selectedTicket.ticket_id}</h1>
                  <p className="text-muted mt-1">{selectedTicket.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => loadTicketDetail(selectedTicket.id)}
                    className="form-control form-control--compact flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    重新載入
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowTicketActions(!showTicketActions)}
                      className="form-control form-control--compact flex items-center gap-2"
                    >
                      <MoreVertical className="w-4 h-4" />
                      操作
                    </button>
                    {showTicketActions && <TicketActionsMenu />}
                  </div>
                </div>
              </div>
            </div>

            {/* 主內容區域 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 對話區域 */}
              <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h2 className="text-lg font-semibold text-fg flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5" />
                  對話記錄
                </h2>
                
                <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                  {selectedTicket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.author_type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="max-w-[80%]">
                        <div
                          className={`p-4 rounded-xl ${
                            message.author_type === 'user'
                              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300'
                              : message.author_type === 'admin'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">
                            {message.body}
                          </div>
                          <div className="text-xs mt-2 opacity-70">
                            {message.author_display_name} • {new Date(message.created_at).toLocaleString('zh-TW')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 發送訊息 */}
                {selectedTicket.status !== 'closed' && (
                  <div className="p-4 bg-surface-hover rounded-lg">
                    <div className="flex gap-3">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="輸入管理員回應..."
                        rows={3}
                        className="form-control flex-1 resize-none"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={sendingMessage || !newMessage.trim()}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {sendingMessage ? '發送中...' : '發送'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 資訊側欄 */}
              <div className="space-y-6">
                {/* 工單資訊 */}
                <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                  <h3 className="text-lg font-semibold text-fg mb-4">工單資訊</h3>
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={selectedTicket.status} />
                      <CategoryBadge category={selectedTicket.category} />
                      <PriorityBadge priority={selectedTicket.priority} />
                    </div>
                    
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted" />
                        <span className="text-muted">建立於:</span>
                        <span className="text-fg">{new Date(selectedTicket.created_at).toLocaleDateString('zh-TW')}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-muted" />
                        <span className="text-muted">訊息數:</span>
                        <span className="text-fg">{selectedTicket.messages.length}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted" />
                        <span className="text-muted">分配給:</span>
                        <span className="text-fg">
                          {selectedTicket.assignee_name || '未分配'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 用戶資訊 */}
                {selectedTicket.user_info && (
                  <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                    <h3 className="text-lg font-semibold text-fg mb-4">用戶資訊</h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-muted">用戶名:</span>
                        <span className="text-fg ml-2">{selectedTicket.user_info.username}</span>
                      </div>
                      <div>
                        <span className="text-muted">郵箱:</span>
                        <span className="text-fg ml-2">{selectedTicket.user_info.email}</span>
                      </div>
                      <div>
                        <span className="text-muted">角色:</span>
                        <span className="text-fg ml-2">{selectedTicket.user_info.role}</span>
                      </div>
                      <div>
                        <span className="text-muted">註冊時間:</span>
                        <span className="text-fg ml-2">
                          {new Date(selectedTicket.user_info.created_at).toLocaleDateString('zh-TW')}
                        </span>
                      </div>
                      {selectedTicket.user_info.last_login_at && (
                        <div>
                          <span className="text-muted">最後登入:</span>
                          <span className="text-fg ml-2">
                            {new Date(selectedTicket.user_info.last_login_at).toLocaleDateString('zh-TW')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {isMobile && <MobileBottomNav />}
      </div>
    );
  }

  // 工單列表視圖 - 採用審核管理的布局風格
  return (
    <div className="min-h-screen bg-bg">
      <NavBar pathname="/admin/support" />
      <div className="page-content">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* 頁面標題 */}
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-fg">客服管理</h1>
                <p className="text-muted mt-1">管理和回應用戶支援工單</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={refreshData}
                  disabled={refreshing}
                  className="form-control form-control--compact flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? '載入中...' : '重新載入'}
                </button>
                <button className="form-control form-control--compact flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  導出報告
                </button>
              </div>
            </div>
          </div>

          {/* 統計概覽 */}
          {stats && (
            <div className="mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <StatsCard title="總計" value={stats.total} color="bg-blue-500" icon={LifeBuoy} />
                <StatsCard title="開啟" value={stats.open} color="bg-green-500" icon={MessageSquare} />
                <StatsCard title="等待管理員" value={stats.awaiting_admin} color="bg-orange-500" icon={AlertTriangle} />
                <StatsCard title="等待用戶" value={stats.awaiting_user} color="bg-yellow-500" icon={Clock} />
                <StatsCard title="已解決" value={stats.resolved} color="bg-emerald-500" icon={CheckCircle2} />
                <StatsCard title="已關閉" value={stats.closed} color="bg-gray-500" icon={XCircle} />
                <StatsCard title="未分配" value={stats.unassigned} color="bg-purple-500" icon={Users} />
                <StatsCard title="逾期" value={stats.overdue} color="bg-red-500" icon={TrendingUp} />
              </div>
            </div>
          )}

          {/* 主內容區域 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 工單列表 */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                  <LifeBuoy className="w-5 h-5" />
                  工單列表
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">{filteredTickets.length} 個工單</span>
                </div>
              </div>

              {/* 篩選器 */}
              <div className="mb-4 p-3 bg-surface-hover rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                      type="text"
                      placeholder="搜尋工單..."
                      value={filters.search}
                      onChange={(e) => updateFilters('search', e.target.value)}
                      className="form-control form-control--compact flex-1 pl-10"
                    />
                  </div>

                  <select
                    value={filters.status}
                    onChange={(e) => updateFilters('status', e.target.value)}
                    className="form-control form-control--compact flex-1"
                  >
                    <option value="all">所有狀態</option>
                    <option value="open">開啟</option>
                    <option value="awaiting_admin">等待管理員</option>
                    <option value="awaiting_user">等待用戶</option>
                    <option value="resolved">已解決</option>
                    <option value="closed">已關閉</option>
                  </select>

                  <select
                    value={filters.category}
                    onChange={(e) => updateFilters('category', e.target.value)}
                    className="form-control form-control--compact flex-1"
                  >
                    <option value="all">所有分類</option>
                    <option value="technical">技術問題</option>
                    <option value="account">帳號問題</option>
                    <option value="feature">功能建議</option>
                    <option value="bug">錯誤報告</option>
                    <option value="abuse">濫用舉報</option>
                    <option value="other">其他</option>
                  </select>

                  <select
                    value={filters.assignee}
                    onChange={(e) => updateFilters('assignee', e.target.value)}
                    className="form-control form-control--compact flex-1"
                  >
                    <option value="all">所有分配</option>
                    <option value="me">分配給我</option>
                    <option value="unassigned">未分配</option>
                  </select>
                </div>
              </div>

              {/* 工單列表 */}
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-muted mb-2" />
                    <p className="text-muted">載入中...</p>
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="text-center py-8">
                    <LifeBuoy className="w-12 h-12 mx-auto text-muted mb-4" />
                    <p className="text-fg font-medium">找不到符合條件的工單</p>
                    <p className="text-muted">試試調整搜尋條件或篩選器</p>
                  </div>
                ) : (
                  filteredTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => selectTicket(ticket.id)}
                      className={`p-4 border border-border rounded-xl hover:bg-surface-hover transition-colors cursor-pointer ${
                        ticket.processing ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-fg truncate">
                              {ticket.subject}
                            </h3>
                            <span className="text-xs text-muted font-mono">
                              #{ticket.ticket_id}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={ticket.status} />
                            <CategoryBadge category={ticket.category} />
                            <PriorityBadge priority={ticket.priority} />
                          </div>
                        </div>
                        <div className="text-right text-sm text-muted">
                          <div className="flex items-center gap-1 mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(ticket.created_at).toLocaleDateString('zh-TW')}
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            {ticket.message_count} 則訊息
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted">
                          <User className="w-3.5 h-3.5" />
                          {ticket.user_name}
                        </div>
                        <div className="flex items-center gap-2 text-muted">
                          <UserCheck className="w-3.5 h-3.5" />
                          {ticket.assignee_name || '未分配'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 統計和快速操作側欄 */}
            <div className="space-y-6">
              {/* 快速統計 */}
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">快速統計</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      需要處理
                    </span>
                    <span className="text-lg font-semibold text-orange-600">
                      {stats ? stats.awaiting_admin + stats.open : 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      未分配
                    </span>
                    <span className="text-lg font-semibold text-purple-600">
                      {stats?.unassigned || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      逾期工單
                    </span>
                    <span className="text-lg font-semibold text-red-600">
                      {stats?.overdue || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* 快速操作 */}
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">快速操作</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => updateFilters('assignee', 'me')}
                    className="w-full form-control form-control--compact flex items-center gap-2 justify-start"
                  >
                    <UserCheck className="w-4 h-4" />
                    我的工單
                  </button>
                  <button
                    onClick={() => updateFilters('status', 'awaiting_admin')}
                    className="w-full form-control form-control--compact flex items-center gap-2 justify-start"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    等待處理
                  </button>
                  <button
                    onClick={() => updateFilters('assignee', 'unassigned')}
                    className="w-full form-control form-control--compact flex items-center gap-2 justify-start"
                  >
                    <Users className="w-4 h-4" />
                    未分配工單
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {isMobile && <MobileBottomNav />}
    </div>
  );
};

export default AdminSupportPageNew;