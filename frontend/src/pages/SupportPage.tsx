import React, { useState, useEffect } from 'react';
import MobileSupportDetailPage from './MobileSupportDetailPage'

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLayout } from '@/components/layout/PageLayout';
import MobileHeader from '@/components/MobileHeader'
import { 
  PageHeader, 
  Toolbar, 
  TicketCard, 
  EmptyState, 
  LoadingSpinner, 
  Button,
  StatusBadge,
  CategoryBadge,
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
  Clock,
  Search
} from 'lucide-react';
import { api } from '@/services/api';

interface Ticket {
  id: string;
  ticket_id: string;
  subject: string;
  status: 'open' | 'awaiting_user' | 'awaiting_admin' | 'resolved' | 'closed';
  category: 'technical' | 'account' | 'feature' | 'bug' | 'abuse' | 'other';
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

const VALID_CATEGORIES = ['technical', 'account', 'feature', 'bug', 'abuse', 'other'] as const;

type SupportCategory = typeof VALID_CATEGORIES[number];


interface TicketFormState {
  subject: string;
  category: SupportCategory;

  body: string;
  email: string;
}

type PrefillTicket = Partial<TicketFormState>;

const isValidCategory = (value: unknown): value is SupportCategory =>
  typeof value === 'string' && VALID_CATEGORIES.includes(value as SupportCategory);



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
  const [prefillTicketData, setPrefillTicketData] = useState<PrefillTicket | null>(null);

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

  useEffect(() => {
    const rawPrefill = searchParams.get('prefill');
    if (!rawPrefill) {
      return;
    }

    try {
      const parsed = JSON.parse(rawPrefill);
      const sanitized: PrefillTicket = {};

      if (typeof parsed?.subject === 'string') {
        sanitized.subject = parsed.subject.slice(0, 200);
      }
      if (typeof parsed?.body === 'string') {
        sanitized.body = parsed.body.slice(0, 4000);
      }
      if (isValidCategory(parsed?.category)) {
        sanitized.category = parsed.category;
      }

      if (typeof parsed?.email === 'string') {
        sanitized.email = parsed.email;
      }

      setPrefillTicketData(sanitized);
      setShowCreateModal(true);
    } catch (error) {
      console.error('解析支援預填資料失敗:', error);
    } finally {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('prefill');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      // 僅登入用戶可載入「我的工單」
      if (!isLoggedIn) {
        setTickets([]);
        return;
      }
      const resp = await api<{ ok: boolean; tickets: Ticket[] }>(`/api/support/my-tickets?limit=100&_=${Date.now()}`);
      if (resp?.ok && Array.isArray(resp.tickets)) {
        setTickets(resp.tickets as any);
      }
    } catch (error) {
      console.error('載入工單失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetail = async (ticketId: string) => {
    try {
      const resp = await api<{ ok: boolean; ticket: TicketDetail }>(`/api/support/tickets/${ticketId}`);
      if ((resp as any)?.ok && (resp as any)?.ticket) {
        setSelectedTicket((resp as any).ticket);
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
      const resp = await api<{ ok: boolean }>(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: newMessage.trim() })
      });
      if ((resp as any)?.ok) {
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
    const initialFormData: TicketFormState = {
      subject: typeof prefillTicketData?.subject === 'string' ? prefillTicketData.subject : '',
      category: isValidCategory(prefillTicketData?.category) ? prefillTicketData?.category as SupportCategory : 'technical',

      body: typeof prefillTicketData?.body === 'string' ? prefillTicketData.body : '',
      email: typeof prefillTicketData?.email === 'string' ? prefillTicketData.email : '',
    };
    const [formData, setFormData] = useState<TicketFormState>(initialFormData);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
      if (!prefillTicketData) return;
      setFormData(prev => ({
        subject: typeof prefillTicketData.subject === 'string' ? prefillTicketData.subject : prev.subject,
        category: isValidCategory(prefillTicketData.category) ? prefillTicketData.category : prev.category,
        body: typeof prefillTicketData.body === 'string' ? prefillTicketData.body : prev.body,
        email: !isLoggedIn && typeof prefillTicketData.email === 'string' ? prefillTicketData.email : prev.email,
      }));
    }, [prefillTicketData, isLoggedIn]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      e.stopPropagation(); // 手機瀏覽器額外阻止事件冒泡

      if (!formData.subject.trim() || !formData.body.trim()) return;

      try {
        setCreating(true);
        // 未登入用戶處理 email
        const payload: any = { subject: formData.subject, category: formData.category, body: formData.body }
        if (!isLoggedIn) {
          let email = (formData.email || '').trim();
          
          // 只在沒有輸入 email 時顯示錯誤
          if (!email) {
            alert('請輸入 Email 以便我們回覆您');
            return;
          }
          
          // 輕量自動補齊：輸入純字串 → 預設加上 @gmail.com；輸入 *@gmail → 補 .com
          if (email && !email.includes('@')) email = `${email}@gmail.com`;
          if (/^.+@gmail$/i.test(email)) email = `${email}.com`;
          
          // 與後端一致的格式驗證
          const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!EMAIL_RE.test(email)) {
            alert('Email 格式不正確，請輸入有效 Email（例如 name@gmail.com）');
            return;
          }
          payload.email = email;
        } else {
          delete payload.email;
        }

        const resp = await api<any>('/api/support/tickets', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (resp?.ok) {
          // 調整為後端實際回應欄位（ticket_id 等）
          const ticketId = resp.ticket_id || resp.public_id || resp.id
          const subject = resp.subject || payload.subject
          const status = resp.status || 'open'
          const category = resp.category || payload.category

          // 成功後直接進入對話視圖
          setShowCreateModal(false);
          setPrefillTicketData(null);

          if (isLoggedIn && ticketId) {
            try { localStorage.setItem('fk_last_ticket_id', String(ticketId)); } catch { try { sessionStorage.setItem('fk_last_ticket_id', String(ticketId)); } catch {} }
            await loadTickets();
            setSearchParams({ ticket: String(ticketId) });
            setTimeout(() => document.getElementById('support-messages-end')?.scrollIntoView({ behavior:'smooth' }), 80)
          } else if (resp.guest_token) {
            navigate(`/support/track?ticket=${encodeURIComponent(String(ticketId))}&sig=${encodeURIComponent(resp.guest_token)}`);
          }
        }
      } catch (error) {
        console.error('創建工單失敗:', error);

        // 手機瀏覽器特殊錯誤處理
        const errorMessage = error instanceof Error ? error.message : '創建工單失敗';

        // 檢查是否為網路錯誤或手機瀏覽器限制
        if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
          alert('網路連線問題，請檢查網路連線後重試');
        } else if (errorMessage.includes('localStorage') || errorMessage.includes('sessionStorage')) {
          alert('瀏覽器儲存空間問題，請嘗試清除瀏覽器快取');
        } else {
          alert(errorMessage.includes('HTTP') ? '伺服器回應錯誤，請稍後再試' : errorMessage);
        }
      } finally {
        setCreating(false);
      }
    };

    return (<>
      {/* 背景遮罩，阻擋互動 */}
      {/* 禁用觸控滾動（iOS） */}
      <div className="fixed inset-0 z-[96]" style={{ touchAction: 'none' }} />

      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[95]" />

      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-fg">建立新工單</h2>
            <button
              onClick={() => {

                setShowCreateModal(false);
                setPrefillTicketData(null);
              }}
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
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="請描述您的問題主題"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">分類</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        category: isValidCategory(value) ? value : prev.category,
                      }));
                    }}
                    className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="technical">技術問題</option>
                    <option value="account">帳號問題</option>
                    <option value="feature">功能建議</option>
                    <option value="bug">錯誤報告</option>
                    <option value="abuse">濫用舉報</option>
                    <option value="other">其他</option>
                  </select>
                </div>
              {!isLoggedIn && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="name@example.com"
                  />
                </div>
              )}

              </div>

              <div>
                <label className="block text-sm font-medium text-fg mb-2">詳細描述</label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  rows={6}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
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
                className="py-2.5"
              >
                取消
              </Button>
              <Button
                type="submit"
                loading={creating}
                icon={<Send className="w-4 h-4" />}
                className="py-2.5"
              >
                建立工單
              </Button>
            </div>
          </form>
        </div>
      </div>
      </>);
  };

  // 未登入狀態 - 支援匿名訪問
  if (!isLoggedIn) {
    return (
      <PageLayout pathname="/support">
        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Header：保留下方主要大標題，已移除最上層主副標 */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold dual-text mb-3">ForumKit</h1>
            <p className="text-xl text-muted">Support Center</p>
          </div>

          <div className="space-y-6">
            {/* Primary Action */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-soft">
              <h3 className="font-semibold dual-text mb-4 flex items-center">
                <Plus className="w-5 h-5 mr-2 text-primary" />
                建立支援工單
              </h3>
              <p className="text-muted text-sm mb-4 leading-relaxed">
                描述您遇到的問題，我們的技術團隊會盡快為您提供解決方案
              </p>
              <div className="text-center">
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="w-2/3 mb-3 mx-auto block text-center"
                >
                  尋求支援
                </Button>
                <p className="text-xs text-muted">
                  預計回覆時間：1-2 小時（工作日）
                </p>
              </div>
            </div>

            {/* Secondary Actions */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-surface border border-border rounded-xl p-6 shadow-soft hover:shadow-medium transition-shadow">
                <h3 className="font-semibold dual-text mb-4 flex items-center">
                  <Eye className="w-5 h-5 mr-2 text-primary" />
                  追蹤現有工單
                </h3>
                <p className="text-muted text-sm mb-4 leading-relaxed">
                  查看您提交工單的處理進度
                </p>
                <div className="text-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/support/track')}
                    className="w-2/3 mx-auto block"
                  >
                    追蹤工單
                  </Button>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-6 shadow-soft hover:shadow-medium transition-shadow">
                <h3 className="font-semibold dual-text mb-4 flex items-center">
                  <MessageSquare className="w-5 h-5 mr-2 text-primary" />
                  常見問題
                </h3>
                <p className="text-muted text-sm mb-4 leading-relaxed">
                  快速找到常見問題的解答
                </p>
                <div className="text-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/faq')}
                    className="w-2/3 mx-auto block"
                  >
                    瀏覽 FAQ
                  </Button>
                </div>
              </div>
            </div>

            {/* Tips Section */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-soft">
              <h4 className="font-medium dual-text mb-3 flex items-center">
                <Star className="w-4 h-4 mr-2 text-primary" />
                提交工單小技巧
              </h4>
              <ul className="text-sm text-muted space-y-2">
                <li className="flex items-start space-x-2">
                  <span className="text-primary mt-1">•</span>
                  <span>詳細描述問題發生的步驟和環境</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-primary mt-1">•</span>
                  <span>提供相關的錯誤訊息或截圖</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-primary mt-1">•</span>
                  <span>選擇正確的問題分類以加速處理</span>
                </li>
              </ul>
            </div>

            {/* Login Prompt */}
            <div className="bg-surface border border-border rounded-xl p-6 text-center shadow-soft">
              <h4 className="font-medium dual-text mb-2">已有帳號？</h4>
              <p className="text-sm text-muted mb-4">
                登入帳號後可以查看完整的支援歷史
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/auth')}
                className="w-2/3 mx-auto block"
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
  // 手機版：切換至獨立 MobileSupportDetailPage（混合式設計）
  if (selectedTicket && isMobile) {
    return (
      <MobileSupportDetailPage
        ticket={{
          ticket_id: selectedTicket.ticket_id,
          subject: selectedTicket.subject,
          status: selectedTicket.status,
          category: selectedTicket.category,
          created_at: selectedTicket.created_at,
          messages: selectedTicket.messages as any,
        }}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        sending={sendingMessage}
        onSend={sendMessage}
        onBack={() => setSearchParams({})}
        refreshing={refreshing}
        onReload={() => loadTicketDetail(selectedTicket.id)}
      />
    )
  }

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
                              </div>                <div className="flex items-center gap-6 text-sm text-muted">
                  <div className="flex items-center gap-1">
                    建立於 {new Date(selectedTicket.created_at).toLocaleDateString('zh-TW')}
                  </div>
                  <div className="flex items-center gap-1">
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
                        <div className={`text-xs mt-2 leading-tight ${message.author_type === 'user' ? 'text-primary-foreground/80' : 'text-muted'}`}>
                          <div className="font-medium">{message.author_display_name}</div>
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
                      className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
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
        <div className="min-h-screen">
          {/* Mobile header mimic homepage */}
          <div className="sm:hidden text-center py-2 mb-1">
            <div className="h-2" />
            <h1 className="text-3xl font-extrabold dual-text tracking-wide leading-tight">ForumKit</h1>
            <p className="text-base text-muted -mt-1">Support Center</p>
          </div>

          {/* Compact Header - 操作列（桌面優先） */}
          <div className="border-b border-border bg-surface/80 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="hidden sm:block">
                  <h1 className="text-xl font-semibold dual-text">Support Center</h1>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                    onClick={refreshTickets}
                    disabled={refreshing}
                  />
                  <Button
                    size="sm"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setShowCreateModal(true)}
                  >
                    新工單
                  </Button>
                </div>

                {/* Inline Stats */}
                {tickets.length > 0 && (
                  <div className="hidden sm:flex items-center gap-6 mt-3 text-sm text-muted">
                    <span>總共 <strong className="text-fg">{tickets.length}</strong> 個工單</span>
                    <span>進行中 <strong className="text-yellow-600 dark:text-yellow-400">{tickets.filter(t => ['open', 'awaiting_user', 'awaiting_admin'].includes(t.status)).length}</strong></span>
                    <span>已解決 <strong className="text-green-600 dark:text-green-400">{tickets.filter(t => t.status === 'resolved').length}</strong></span>
                  </div>
                )}

              </div>
            </div>
          </div>



          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Compact Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="sm:w-2/3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜尋工單..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              <div className="sm:w-1/3 grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                  className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            </div>

            {/* Mobile: 新工單白色長形按鈕（置於篩選與列表之間） */}
            {isMobile && (
              <div className="mb-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full py-3 rounded-lg border border-border bg-white dark:bg-surface text-fg shadow-sm active:scale-[0.99] transition-transform"
                >
                  新工單
                </button>
              </div>
            )}

            {/* Table-like Ticket List */}
            <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-soft">
              {loading ? (
                <div className="p-8 text-center">
                  <LoadingSpinner size="lg" />
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-12 text-center">
                  <LifeBuoy className="w-12 h-12 text-muted mx-auto mb-4" />
                  <h3 className="font-medium dual-text mb-2">
                    {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' ? '找不到符合條件的工單' : '還沒有工單'}
                  </h3>
                  <p className="text-sm text-muted mb-6">
                    {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' ? '試試調整搜尋條件或篩選器' : '點擊右上角的「新工單」按鈕來開始'}
                  </p>
                  {(!searchTerm && statusFilter === 'all' && categoryFilter === 'all') && (
                    <Button
                      size="sm"
                      icon={<Plus className="w-4 h-4" />}
                      onClick={() => setShowCreateModal(true)}
                    >
                      建立第一個工單
                    </Button>
                  )}
                </div>
              ) : (
                isMobile ? (
                  <div className="divide-y divide-border">
                    {filteredTickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        className="w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors"
                        onClick={() => selectTicket(ticket.ticket_id || ticket.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium dual-text truncate">{ticket.subject}</div>
                            <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                              <span>#{ticket.ticket_id}</span>
                              <span>•</span>
                              <span>{new Date(ticket.last_activity_at || ticket.created_at).toLocaleString('zh-TW')}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusBadge status={ticket.status} />
                              <CategoryBadge category={ticket.category} />
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted">
                            <div className="flex items-center gap-1">
                              <MessageSquare className="w-4 h-4 text-muted" />
                              <span>{ticket.message_count}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Table Header */}
                    <div className="px-6 py-3 border-b border-border bg-surface/50">
                      <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted uppercase tracking-wide">
                        <div className="col-span-6">工單</div>
                        <div className="col-span-2 text-center">狀態</div>
                        <div className="col-span-2 text-center">分類</div>
                        <div className="col-span-2 text-center">回覆</div>
                      </div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-border">
                      {filteredTickets.map((ticket, index) => (
                        <div
                          key={ticket.id}
                          className="px-6 py-4 hover:bg-surface-hover transition-colors cursor-pointer group"
                          onClick={() => selectTicket(ticket.ticket_id || ticket.id)}
                        >
                          <div className="grid grid-cols-12 gap-4 items-center">
                            {/* Ticket Info */}
                            <div className="col-span-6">
                              <div className="flex items-start space-x-3">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium dual-text group-hover:text-primary transition-colors truncate">
                                    {ticket.subject}
                                  </h4>
                                  <div className="flex items-center space-x-2 mt-1">
                                    <span className="text-xs text-muted">#{ticket.ticket_id}</span>
                                    <span className="text-xs text-muted">•</span>
                                    <span className="text-xs text-muted">{new Date(ticket.last_activity_at || ticket.created_at).toLocaleString('zh-TW')}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Status */}
                            <div className="col-span-2 text-center">
                              <StatusBadge status={ticket.status} />
                            </div>

                            {/* Category */}
                            <div className="col-span-2 text-center">
                              <CategoryBadge category={ticket.category} />
                            </div>

                            {/* Message Count */}
                            <div className="col-span-2 text-center">
                              <div className="flex items-center justify-center space-x-1">
                                <MessageSquare className="w-4 h-4 text-muted" />
                                <span className="text-sm text-muted">{ticket.message_count}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      
      {showCreateModal && <CreateTicketModal />}
    </PageLayout>
  );
};

export default SupportPage;
