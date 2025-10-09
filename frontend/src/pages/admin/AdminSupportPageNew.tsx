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
import { QueueTabs } from '@/components/support/admin/QueueTabs';
import { FilterBar } from '@/components/support/admin/FilterBar';
import { TicketList } from '@/components/support/admin/TicketList';
import { StatusBadge, CategoryBadge, PriorityBadge } from '@/components/support/SupportComponents';
import { useAdminSupportSocket } from '@/hooks/useAdminSupportSocket';

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

  // 即時事件：刷新列表或當前詳情，並處理提及通知
  useAdminSupportSocket((ev) => {
    try {
      // 提及通知邏輯
      if (ev.event_type === 'message_sent' && ev.payload && user) {
        const messageBody = ev.payload.body || '';
        const authorUserId = ev.payload.author_user_id;
        
        // 檢查是否提及當前用戶，且不是自己提及自己
        if (authorUserId !== user.id) {
          const mentionPattern = new RegExp(`@${user.username}\b`, 'i');
          if (mentionPattern.test(messageBody)) {
            const authorName = ev.payload.author_name || '某人';
            showNotification(`${authorName} 在工單 #${ev.ticket_id} 中提及了你`);
          }
        }
      }

      // 更新工單列表或詳情
      if (selectedTicket && ev.ticket_id === selectedTicket.ticket_id) {
        loadTicketDetail(selectedTicket.id);
      } else {
        // 優化：僅在列表可見時刷新，或根據事件類型決定是否刷新
        // 為簡化，暫時保留原邏輯
        loadTickets();
      }
    } catch (e) {
      console.warn('[support] event handler failed', e);
    }
  });

  const loadData = useCallback(async () => {
    await Promise.all([loadTickets(), loadStats()]);
  }, []);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.search) params.set('q', filters.search);
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.category && filters.category !== 'all') params.set('category', filters.category);
      // 這裡暫不傳 priority/assignee（保持前端篩選），僅做最小修復
      const limit = filters.per_page || 20; const page = filters.page || 1;
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const resp = await api<any>(`/api/admin/support/tickets?${params.toString()}`);
      if (resp?.ok && Array.isArray(resp.tickets)) {
        // 後端欄位 public_id/id 混用，這裡做基本映射以符合現有 UI 使用
        const list = resp.tickets.map((t: any) => ({
          id: t.public_id || t.id,
          ticket_id: t.public_id || t.id,
          subject: t.subject,
          status: t.status,
          category: t.category,
          priority: t.priority,
          created_at: t.created_at,
          last_activity_at: t.last_activity_at,
          message_count: t.message_count,
          user_name: t.submitter,
          assigned_to: t.assigned_to,
          assignee_name: t.assignee,
        }))
        setTickets(list)
      }
    } catch (error) {
      console.error('載入工單失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const resp = await api<any>('/api/admin/support/stats');
      if (resp?.ok && resp.stats) {
        setStats(resp.stats);
      }
    } catch (error) {
      console.error('載入統計失敗:', error);
    }
  };

  const loadTicketDetail = async (ticketId: string) => {
    try {
      const resp = await api<any>(`/api/admin/support/tickets/${ticketId}`);
      if (resp?.ok && resp.ticket) {
        const t = resp.ticket
        setSelectedTicket({
          ...t,
          id: t.public_id || t.id,
          ticket_id: t.public_id || t.id,
          assignee_name: t.assignee_name || t.assignee || undefined,
          user_name: t.submitter,
          messages: t.messages || [],
        });
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
      const response = await api<any>(`/api/admin/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: newMessage.trim() })
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
      const response = await api<any>(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
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
      const response = await api<any>(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: assigneeId || null })
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

  // 使用共用的 StatusBadge / PriorityBadge / CategoryBadge（來自 SupportComponents）

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
          <Icon className={`w-5 h-5 ${color === 'bg-surface' ? 'text-fg' : 'text-white'}`} />
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
                              ? 'bg-info-bg text-info-text border border-info-border'
                              : message.author_type === 'admin'
                              ? 'bg-primary-100 text-primary border border-primary'
                              : 'bg-warning-bg text-warning-text border border-warning-border'
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
                  className="form-control form-control--compact support-control flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? '載入中...' : '重新載入'}
                </button>
                <button className="form-control form-control--compact support-control flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  導出報告
                </button>
              </div>
            </div>
          </div>

          {/* Queue 分頁 + 統計概覽（簡化） */}
          {stats && (
            <div className="mb-6">
              <div className="mb-4">
                <QueueTabs
                  current={filters.assignee === 'me' ? 'mine' : filters.assignee === 'unassigned' ? 'unassigned' : filters.status === 'resolved' ? 'resolved' : filters.status === 'closed' ? 'closed' : 'inbox'}
                  counts={{
                    inbox: stats.open + stats.awaiting_admin + stats.awaiting_user,
                    resolved: stats.resolved,
                    closed: stats.closed,
                    unassigned: stats.unassigned,
                  }}
                  onChange={(key)=>{
                    switch(key){
                      case 'mine': updateFilters('assignee','me'); break;
                      case 'unassigned': updateFilters('assignee','unassigned'); break;
                      case 'resolved': updateFilters('status','resolved'); break;
                      case 'closed': updateFilters('status','closed'); break;
                      default:
                        setFilters(prev=>({ ...prev, assignee:'all', status:'all', page:1 }))
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <StatsCard title="總計" value={stats.total} color="bg-info" icon={LifeBuoy} />
                <StatsCard title="開啟" value={stats.open} color="bg-success" icon={MessageSquare} />
                <StatsCard title="等待管理員" value={stats.awaiting_admin} color="bg-warning" icon={AlertTriangle} />
                <StatsCard title="等待用戶" value={stats.awaiting_user} color="bg-warning" icon={Clock} />
                <StatsCard title="已解決" value={stats.resolved} color="bg-success" icon={CheckCircle2} />
                <StatsCard title="已關閉" value={stats.closed} color="bg-surface" icon={XCircle} />
                <StatsCard title="未分配" value={stats.unassigned} color="bg-accent" icon={Users} />
                <StatsCard title="逾期" value={stats.overdue} color="bg-danger" icon={TrendingUp} />
              </div>
            </div>
          )}

          {/* FilterBar */}
          <div className="mb-4">
            <FilterBar
              search={filters.search}
              onSearch={(v)=>updateFilters('search', v)}
              status={filters.status}
              onStatus={(v)=>updateFilters('status', v)}
              category={filters.category}
              onCategory={(v)=>updateFilters('category', v)}
              priority={filters.priority}
              onPriority={(v)=>updateFilters('priority', v)}
              assignee={filters.assignee}
              onAssignee={(v)=>updateFilters('assignee', v)}
            />
          </div>

          {/* 主內容區域 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 工單列表 */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                  <LifeBuoy className="w-5 h-5" />
                  工單列表
                </h2>
                <div className="text-sm text-muted">{filteredTickets.length} 個工單</div>
              </div>
              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-muted mb-2" />
                  <p className="text-muted">載入中...</p>
                </div>
              ) : (
                <TicketList items={filteredTickets as any} onSelect={(id)=>selectTicket(id)} />
              )}
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
                    <span className="text-lg font-semibold text-warning">
                      {stats ? stats.awaiting_admin + stats.open : 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      未分配
                    </span>
                    <span className="text-lg font-semibold text-accent">
                      {stats?.unassigned || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      逾期工單
                    </span>
                    <span className="text-lg font-semibold text-danger">
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
                    className="w-full form-control form-control--compact support-control flex items-center gap-2 justify-start"
                  >
                    <UserCheck className="w-4 h-4" />
                    我的工單
                  </button>
                  <button
                    onClick={() => updateFilters('status', 'awaiting_admin')}
                    className="w-full form-control form-control--compact support-control flex items-center gap-2 justify-start"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    等待處理
                  </button>
                  <button
                    onClick={() => updateFilters('assignee', 'unassigned')}
                    className="w-full form-control form-control--compact support-control flex items-center gap-2 justify-start"
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
