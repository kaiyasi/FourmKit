import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/layout/PageLayout';
import { 
  PageHeader, 
  Toolbar, 
  TicketCard, 
  EmptyState, 
  LoadingSpinner, 
  Button,
  StatusBadge,
  CategoryBadge,
  PriorityBadge
} from '@/components/support/SupportComponents';
import { 
  Plus, 
  MessageSquare, 
  Filter,
  RefreshCw,
  LifeBuoy,
  Send,
  X,
  Calendar,
  Tag,
  Star,
  ArrowLeft,
  Eye,
  Clock
} from 'lucide-react';
import { api } from '@/services/api';

interface Ticket {
  id: string;
  ticket_id: string;
  subject: string;
  status: 'open' | 'awaiting_user' | 'awaiting_admin' | 'resolved' | 'closed';
  category: 'technical' | 'account' | 'feature' | 'bug' | 'abuse' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  last_activity_at: string;
  message_count: number;
}

interface TicketMessage {
  id: string;
  body: string;
  author_type: 'user' | 'admin';
  author_display_name: string;
  created_at: string;
}

interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

const SupportPage: React.FC = () => {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 狀態管理
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

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
    loadTickets();
  }, []);

  // 載入選中的工單詳情
  useEffect(() => {
    if (selectedTicketId) {
      loadTicketDetail(selectedTicketId);
    } else {
      setSelectedTicket(null);
    }
  }, [selectedTicketId]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const response = await api.get('/support/tickets');
      if (response.success) {
        setTickets(response.data);
      }
    } catch (error) {
      console.error('載入工單失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetail = async (ticketId: string) => {
    try {
      const response = await api.get(`/support/tickets/${ticketId}`);
      if (response.success) {
        setSelectedTicket(response.data);
      }
    } catch (error) {
      console.error('載入工單詳情失敗:', error);
    }
  };

  const refreshTickets = async () => {
    setRefreshing(true);
    await loadTickets();
    if (selectedTicketId) {
      await loadTicketDetail(selectedTicketId);
    }
    setRefreshing(false);
  };

  // 篩選工單
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.ticket_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
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
      const response = await api.post(`/support/tickets/${selectedTicket.id}/messages`, {
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

  // 創建工單模態框
  const CreateTicketModal = () => {
    const [formData, setFormData] = useState({
      subject: '',
      category: 'technical',
      priority: 'medium',
      body: ''
    });
    const [creating, setCreating] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.subject.trim() || !formData.body.trim()) return;

      try {
        setCreating(true);
        const response = await api.post('/support/tickets', formData);
        if (response.success) {
          setShowCreateModal(false);
          await loadTickets();
          selectTicket(response.data.id);
        }
      } catch (error) {
        console.error('創建工單失敗:', error);
      } finally {
        setCreating(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-fg">建立新工單</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center text-muted hover:text-fg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-fg mb-2">主題</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="請描述您的問題主題"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">分類</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="technical">技術問題</option>
                    <option value="account">帳號問題</option>
                    <option value="feature">功能建議</option>
                    <option value="bug">錯誤報告</option>
                    <option value="abuse">濫用舉報</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">優先級</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">緊急</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-2">詳細描述</label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  rows={6}
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="請詳細描述您遇到的問題..."
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <Button
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                取消
              </Button>
              <Button
                type="submit"
                loading={creating}
                icon={<Send className="w-4 h-4" />}
              >
                建立工單
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // 未登入狀態 - 支援匿名訪問
  if (!isLoggedIn) {
    return (
      <PageLayout pathname="/support">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft mb-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold dual-text">技術支援</h1>
              <p className="text-sm text-muted mt-1">我們為您提供專業的技術支援服務</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-surface/50 border border-border rounded-xl p-4">
                <h3 className="font-semibold dual-text mb-2">建立新工單</h3>
                <p className="text-sm text-muted mb-3">提交您的問題或建議，我們會盡快回覆</p>
                <Button
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowCreateModal(true)}
                  className="w-full"
                >
                  建立工單
                </Button>
              </div>
              
              <div className="bg-surface/50 border border-border rounded-xl p-4">
                <h3 className="font-semibold dual-text mb-2">追蹤工單</h3>
                <p className="text-sm text-muted mb-3">使用追蹤碼查看工單狀態</p>
                <Button
                  variant="secondary"
                  icon={<Eye className="w-4 h-4" />}
                  onClick={() => navigate('/support/track')}
                  className="w-full"
                >
                  追蹤工單
                </Button>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted mb-3">
                已有帳號？登入後可查看完整的工單歷史
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/auth')}
              >
                登入帳號
              </Button>
            </div>
          </div>
        </div>
        
        {showCreateModal && <CreateTicketModal />}
      </PageLayout>
    );
  }

  // 工單詳情視圖
  if (selectedTicket) {
    return (
      <PageLayout pathname="/support">
          <div className="max-w-4xl mx-auto">
            <PageHeader
              title={`工單 #${selectedTicket.ticket_id}`}
              subtitle={selectedTicket.subject}
              showBackButton={true}
              onBack={goBack}
              isMobile={isMobile}
              actions={
                <Button
                  variant="secondary"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={() => loadTicketDetail(selectedTicket.id)}
                >
                  重新載入
                </Button>
              }
            />

            <div className="px-4 sm:px-6 py-6">
              {/* 工單資訊 */}
              <div className="bg-surface/70 backdrop-blur-md border border-border rounded-2xl p-6 mb-6">
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  <StatusBadge status={selectedTicket.status} />
                  <CategoryBadge category={selectedTicket.category} />
                  <PriorityBadge priority={selectedTicket.priority} />
                </div>
                <div className="flex items-center gap-6 text-sm text-muted">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    建立於 {new Date(selectedTicket.created_at).toLocaleDateString('zh-TW')}
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    {selectedTicket.messages.length} 則訊息
                  </div>
                </div>
              </div>

              {/* 對話記錄 */}
              <div className="space-y-4 mb-6">
                {selectedTicket.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.author_type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] ${isMobile ? 'max-w-[90%]' : ''}`}>
                      <div
                        className={`p-4 rounded-2xl ${
                          message.author_type === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface border border-border'
                        }`}
                      >
                        <div className="prose prose-sm max-w-none">
                          {message.body.split('\n').map((line, index) => (
                            <p key={index} className={message.author_type === 'user' ? 'text-primary-foreground' : 'text-fg'}>
                              {line}
                            </p>
                          ))}
                        </div>
                        <div className={`text-xs mt-2 ${message.author_type === 'user' ? 'text-primary-foreground/70' : 'text-muted'}`}>
                          {message.author_display_name} • {new Date(message.created_at).toLocaleString('zh-TW')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 發送訊息 */}
              {selectedTicket.status !== 'closed' && (
                <div className="bg-surface/70 backdrop-blur-md border border-border rounded-2xl p-4">
                  <div className="flex gap-3">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="輸入您的回應..."
                      rows={3}
                      className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                    />
                    <Button
                      onClick={sendMessage}
                      loading={sendingMessage}
                      disabled={!newMessage.trim()}
                      icon={<Send className="w-4 h-4" />}
                    >
                      發送
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
      </PageLayout>
    );
  }

  // 工單列表視圖
  return (
    <PageLayout pathname="/support">
        <div className="max-w-6xl mx-auto">
          <PageHeader
            title="技術支援"
            subtitle="查看和管理您的支援工單"
            isMobile={isMobile}
            actions={
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  icon={<RefreshCw className={refreshing ? 'animate-spin' : ''} />}
                  onClick={refreshTickets}
                  disabled={refreshing}
                />
                <Button
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowCreateModal(true)}
                >
                  建立工單
                </Button>
              </div>
            }
          />

          <Toolbar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            isMobile={isMobile}
            filterOptions={
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">所有狀態</option>
                  <option value="open">開啟</option>
                  <option value="awaiting_user">等待用戶</option>
                  <option value="awaiting_admin">等待管理員</option>
                  <option value="resolved">已解決</option>
                  <option value="closed">已關閉</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">所有分類</option>
                  <option value="technical">技術問題</option>
                  <option value="account">帳號問題</option>
                  <option value="feature">功能建議</option>
                  <option value="bug">錯誤報告</option>
                  <option value="abuse">濫用舉報</option>
                  <option value="other">其他</option>
                </select>
              </div>
            }
          />

          <div className="px-4 sm:px-6 py-6">
            {loading ? (
              <LoadingSpinner size="lg" />
            ) : filteredTickets.length === 0 ? (
              <EmptyState
                icon={<LifeBuoy className="w-12 h-12" />}
                title={searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' ? '找不到符合條件的工單' : '還沒有工單'}
                description={searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' ? '試試調整搜尋條件或篩選器' : '點擊上方的「建立工單」按鈕來開始'}
                action={
                  <Button
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setShowCreateModal(true)}
                  >
                    建立第一個工單
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {filteredTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => selectTicket(ticket.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      
      {showCreateModal && <CreateTicketModal />}
    </PageLayout>
  );
};

export default SupportPage;