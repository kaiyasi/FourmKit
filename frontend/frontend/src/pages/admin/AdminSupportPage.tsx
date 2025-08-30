import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  MessageCircle, 
  Plus, 
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  Paperclip,
  X,
  Eye,
  MessageSquare,
  User,
  Calendar,
  Tag,
  ArrowLeft,
  Settings,
  Search
} from 'lucide-react'

interface Ticket {
  id: number
  public_id: string
  subject: string
  status: string
  category: string
  priority: string
  created_at: string
  last_activity_at: string
  message_count: number
  user_display_name?: string
  guest_email?: string
  assigned_to?: string
  assigned_user_name?: string
}

interface Message {
  id: string
  author_type: string
  author_display_name: string
  body: string
  created_at: string
  attachments?: any
}

interface TicketDetail extends Ticket {
  messages: Message[]
}

export default function AdminSupportPage() {
  const navigate = useNavigate()
  const { isLoggedIn, username, role } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Reply form state
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [showStatusActions, setShowStatusActions] = useState(false)

  // 檢查是否為管理員
  useEffect(() => {
    if (!isLoggedIn || !['dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator'].includes(role || '')) {
      navigate('/403')
      return
    }
    
    fetchTickets()
  }, [isLoggedIn, role, navigate])

  const fetchTickets = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/admin/support/tickets', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setTickets(data.tickets || [])
      } else {
        throw new Error('載入支援單失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const fetchTicketDetail = async (ticketId: string) => {
    setError(null)
    setReplyText('') // 清空回覆文字
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setSelectedTicket(data.ticket)
      } else {
        throw new Error('載入支援單詳情失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    }
  }

  const handleReply = async () => {
    if (!selectedTicket || !selectedTicket.public_id || !replyText.trim()) {
      setError('請輸入回覆內容')
      return
    }

    setReplyLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
             const response = await fetch(`/api/admin/support/tickets/${selectedTicket.public_id || ''}/reply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: replyText,
          internal: false // 設為 false 表示用戶可見
        })
      })

      if (response.ok) {
        setReplyText('')
        await fetchTicketDetail(selectedTicket.public_id || '')
        await fetchTickets() // 更新列表
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '發送回覆失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setReplyLoading(false)
    }
  }

  const updateTicketStatus = async (status: string) => {
    if (!selectedTicket || !selectedTicket.public_id) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/support/tickets/${selectedTicket.public_id || ''}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      })

      if (response.ok) {
        await fetchTicketDetail(selectedTicket.public_id || '')
        await fetchTickets()
        setShowStatusActions(false)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '更新狀態失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    }
  }

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      'open': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      'awaiting_admin': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      'awaiting_user': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      'resolved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      'closed': 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
    }
    return colors[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
  }

  const getPriorityColor = (priority: string) => {
    const colors: { [key: string]: string } = {
      'low': 'text-green-600 dark:text-green-400',
      'medium': 'text-yellow-600 dark:text-yellow-400',
      'high': 'text-orange-600 dark:text-orange-400',
      'urgent': 'text-red-600 dark:text-red-400'
    }
    return colors[priority] || 'text-gray-600 dark:text-gray-400'
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus
    const matchesPriority = filterPriority === 'all' || ticket.priority === filterPriority
    const matchesSearch = !searchQuery || 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.public_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ticket.user_display_name && ticket.user_display_name.toLowerCase().includes(searchQuery.toLowerCase()))
    
    return matchesStatus && matchesPriority && matchesSearch
  })

  if (selectedTicket && selectedTicket.public_id) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar pathname="/admin/support" />
        <MobileBottomNav />
        
        <div className="max-w-4xl mx-auto p-6 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-2 hover:bg-surface-2 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
                             <div>
                 <h1 className="text-xl font-bold">支援單詳情</h1>
                 <p className="text-sm text-muted">#{selectedTicket.public_id?.slice(-6) || 'N/A'}</p>
               </div>
            </div>
            
                         <div className="flex items-center gap-2">
                              <button
                  onClick={() => setShowStatusActions(!showStatusActions)}
                  className="px-4 py-2 bg-surface border border-border text-fg rounded-xl text-sm hover:bg-surface-hover transition-colors inline-flex items-center"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  狀態操作
                </button>
             </div>
          </div>

          {/* 支援單資訊卡片 */}
          <div className="bg-surface border border-border rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h2 className="font-semibold mb-2">{selectedTicket.subject}</h2>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status === 'open' ? '開啟' :
                       selectedTicket.status === 'awaiting_user' ? '等待用戶回覆' :
                       selectedTicket.status === 'awaiting_admin' ? '等待處理' :
                       selectedTicket.status === 'resolved' ? '已解決' : '已關閉'}
                    </span>
                    <span className={`text-sm ${getPriorityColor(selectedTicket.priority)}`}>
                      {selectedTicket.priority === 'low' ? '低' : 
                       selectedTicket.priority === 'medium' ? '中' : 
                       selectedTicket.priority === 'high' ? '高' : '緊急'}優先級
                    </span>
                  </div>
                  <p><strong>分類：</strong>{selectedTicket.category}</p>
                  <p><strong>提交者：</strong>{selectedTicket.user_display_name || selectedTicket.guest_email || '匿名'}</p>
                </div>
              </div>
              <div className="text-sm text-muted space-y-1">
                <p><strong>創建時間：</strong>{formatDate(selectedTicket.created_at)}</p>
                <p><strong>最後活動：</strong>{formatDate(selectedTicket.last_activity_at)}</p>
                                 <p><strong>回覆數量：</strong>{selectedTicket.messages?.length || 0} 個</p>
                {selectedTicket.assigned_user_name && (
                  <p><strong>處理人：</strong>{selectedTicket.assigned_user_name}</p>
                )}
              </div>
            </div>
          </div>

          {/* 狀態操作面板 */}
          {showStatusActions && (
            <div className="bg-surface border border-border rounded-lg p-4 mb-6">
              <h3 className="font-medium mb-3">狀態操作</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateTicketStatus('awaiting_user')}
                  className="px-3 py-1 bg-amber-100 text-amber-700 rounded text-sm hover:bg-amber-200 transition-colors"
                >
                  標記為等待用戶回覆
                </button>
                <button
                  onClick={() => updateTicketStatus('resolved')}
                  className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded text-sm hover:bg-emerald-200 transition-colors"
                >
                  標記為已解決
                </button>
                <button
                  onClick={() => updateTicketStatus('closed')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
                >
                  關閉支援單
                </button>
                <button
                  onClick={() => updateTicketStatus('open')}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200 transition-colors"
                >
                  重新開啟
                </button>
              </div>
            </div>
          )}

          {/* 訊息列表 */}
          <div className="space-y-4 mb-6">
            {selectedTicket.messages?.map((message, index) => (
              <div
                key={message.id}
                className={`p-4 rounded-lg ${
                  message.author_type === 'ADMIN' 
                    ? 'bg-blue-50 border-l-4 border-blue-500 dark:bg-blue-900/20' 
                    : 'bg-surface border border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      message.author_type === 'ADMIN' 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                    }`}>
                      {message.author_type === 'ADMIN' ? '管理員' : '用戶'}
                    </span>
                    <span className="text-sm font-medium">{message.author_display_name}</span>
                  </div>
                  <span className="text-xs text-muted">{formatDate(message.created_at)}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm">{message.body}</div>
              </div>
            ))}
          </div>

                     {/* 回覆表單 */}
           <div className="bg-surface border border-border rounded-xl p-6">
             <h3 className="font-medium mb-4">回覆支援單</h3>
             <textarea
               id={`reply-${selectedTicket.public_id || 'unknown'}`}
               value={replyText}
               onChange={(e) => setReplyText(e.target.value)}
               placeholder="輸入您的回覆..."
               rows={4}
               className="w-full p-4 bg-background border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
               maxLength={10000}
             />
             <div className="flex justify-between items-center mt-4">
               <span className="text-xs text-muted">{replyText.length}/10000</span>
                               <button
                  onClick={handleReply}
                  disabled={replyLoading || !replyText.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center"
                >
                  {replyLoading ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {replyLoading ? '發送中...' : '發送回覆'}
                </button>
             </div>
           </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

    return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/support" />
      <MobileBottomNav />
      
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-12">
        {/* 標題區 */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link
              to="/admin"
              className="p-3 hover:bg-surface-hover rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold">客服管理</h1>
              <p className="text-muted mt-2">管理和回覆用戶支援單，提供專業協助</p>
            </div>
          </div>
          
          {/* 統計卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-muted">總支援單</p>
                  <p className="text-2xl font-bold">{tickets.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-muted">等待處理</p>
                  <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'awaiting_admin').length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-muted">等待用戶回覆</p>
                  <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'awaiting_user').length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-muted">已解決</p>
                  <p className="text-2xl font-bold">{tickets.filter(t => t.status === 'resolved').length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* 搜尋和篩選 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-xl font-semibold flex-1">支援單列表</h2>
              <button
                onClick={fetchTickets}
                disabled={loading}
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="text"
                  placeholder="搜尋支援單標題、編號或用戶..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
                />
              </div>
              
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg text-center min-w-[140px]"
              >
                <option value="all">全部狀態</option>
                <option value="open">開啟</option>
                <option value="awaiting_admin">等待處理</option>
                <option value="awaiting_user">等待用戶回覆</option>
                <option value="resolved">已解決</option>
                <option value="closed">已關閉</option>
              </select>

              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg text-center min-w-[120px]"
              >
                <option value="all">全部優先級</option>
                <option value="urgent">緊急</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>

          {/* 支援單列表 */}
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted" />
                <h3 className="font-medium mb-2">
                  {tickets.length === 0 ? '尚無支援單記錄' : '沒有符合條件的支援單'}
                </h3>
                <p className="text-sm text-muted">
                  {tickets.length === 0 ? '當有用戶提交支援單時，將在此顯示' : '試著調整搜尋條件'}
                </p>
              </div>
            ) : (
              filteredTickets.map(ticket => (
                <div
                  key={ticket.public_id}
                  className="p-6 cursor-pointer transition-colors hover:bg-surface-hover"
                  onClick={() => fetchTicketDetail(ticket.public_id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-sm px-3 py-1.5 bg-primary/10 text-primary rounded-full">
                          #{ticket.public_id.slice(-6)}
                        </span>
                        <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                          {ticket.status === 'open' ? '開啟' :
                           ticket.status === 'awaiting_user' ? '等待用戶回覆' :
                           ticket.status === 'awaiting_admin' ? '等待處理' :
                           ticket.status === 'resolved' ? '已解決' : '已關閉'}
                        </span>
                        <span className={`text-sm ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority === 'low' ? '低' : 
                           ticket.priority === 'medium' ? '中' : 
                           ticket.priority === 'high' ? '高' : '緊急'}優先級
                        </span>
                      </div>
                      
                      <h3 className="font-medium text-lg mb-3 line-clamp-1">{ticket.subject}</h3>
                      
                      <div className="flex items-center gap-4 text-sm text-muted">
                        <div className="flex items-center gap-1.5">
                          <User className="w-4 h-4" />
                          <span>{ticket.user_display_name || ticket.guest_email || '匿名'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-4 h-4" />
                          <span>{ticket.category}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4" />
                          <span>{ticket.message_count} 個回覆</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(ticket.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <button className="p-2 text-muted hover:text-fg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}