import React, { useState, useEffect } from 'react'
import { MobileAdminLayout } from './MobileAdminLayout'
import { MobileAdminCard, MobileAdminStatCard } from './MobileAdminCard'
import { 
  LifeBuoy, 
  MessageSquare, 
  User, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Send,
  Tag,
  AlertTriangle,
  UserCheck,
  UserX,
  Filter,
  RefreshCw
} from 'lucide-react'

interface SupportTicket {
  id: number
  publicId: string
  subject: string
  status: 'open' | 'awaiting_admin' | 'awaiting_user' | 'resolved' | 'closed'
  category: 'technical' | 'account' | 'feature' | 'bug' | 'abuse' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  createdAt: string
  lastActivity: string
  messageCount: number
  submitter: string
  submitterType: 'user' | 'guest'
  assignedTo?: string
  school?: string
  processing?: boolean
}

interface SupportStats {
  total: number
  open: number
  awaitingAdmin: number
  awaitingUser: number
  resolved: number
  closed: number
}

export function MobileAdminSupport() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [stats, setStats] = useState<SupportStats>({
    total: 0,
    open: 0,
    awaitingAdmin: 0,
    awaitingUser: 0,
    resolved: 0,
    closed: 0
  })
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    status: 'all' as 'all' | SupportTicket['status'],
    priority: 'all' as 'all' | SupportTicket['priority'],
    category: 'all' as 'all' | SupportTicket['category']
  })
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [replyText, setReplyText] = useState('')

  useEffect(() => {
    loadSupportData()
  }, [filter])

  const loadSupportData = async () => {
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 模擬數據
    const mockTickets: SupportTicket[] = [
      {
        id: 1,
        publicId: 'SUP-ABC123',
        subject: '登入問題無法解決',
        status: 'awaiting_admin',
        category: 'technical',
        priority: 'high',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 3,
        submitter: 'user123',
        submitterType: 'user',
        school: '台灣大學'
      },
      {
        id: 2,
        publicId: 'SUP-DEF456',
        subject: '帳號被誤封申請解封',
        status: 'awaiting_user',
        category: 'account',
        priority: 'urgent',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 5,
        submitter: 'guest@example.com',
        submitterType: 'guest',
        assignedTo: '管理員A'
      },
      {
        id: 3,
        publicId: 'SUP-GHI789',
        subject: '建議新增黑暗模式',
        status: 'open',
        category: 'feature',
        priority: 'low',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 1,
        submitter: 'user456',
        submitterType: 'user',
        school: '清華大學'
      }
    ]

    setTickets(mockTickets)
    setStats({
      total: 25,
      open: 8,
      awaitingAdmin: 5,
      awaitingUser: 7,
      resolved: 12,
      closed: 3
    })
    setLoading(false)
  }

  const handleStatusChange = async (ticketId: number, newStatus: SupportTicket['status']) => {
    setTickets(prev => prev.map(ticket => 
      ticket.id === ticketId 
        ? { ...ticket, processing: true }
        : ticket
    ))

    await new Promise(resolve => setTimeout(resolve, 1000))

    setTickets(prev => prev.map(ticket => 
      ticket.id === ticketId 
        ? { ...ticket, status: newStatus, processing: false }
        : ticket
    ))

    // 更新統計
    loadSupportData()
  }

  const handleReply = async (ticketId: number) => {
    if (!replyText.trim()) return

    setTickets(prev => prev.map(ticket => 
      ticket.id === ticketId 
        ? { ...ticket, processing: true }
        : ticket
    ))

    await new Promise(resolve => setTimeout(resolve, 1000))

    setTickets(prev => prev.map(ticket => 
      ticket.id === ticketId 
        ? { 
            ...ticket, 
            messageCount: ticket.messageCount + 1,
            lastActivity: new Date().toISOString(),
            status: 'awaiting_user',
            processing: false
          }
        : ticket
    ))

    setReplyText('')
    setSelectedTicket(null)
  }

  const getStatusLabel = (status: string) => {
    const labels = {
      open: '進行中',
      awaiting_admin: '等待回覆',
      awaiting_user: '等待用戶',
      resolved: '已解決',
      closed: '已關閉'
    }
    return labels[status as keyof typeof labels] || status
  }

  const getStatusBadge = (status: SupportTicket['status']) => {
    switch (status) {
      case 'awaiting_admin':
        return { text: getStatusLabel(status), variant: 'danger' as const }
      case 'awaiting_user':
        return { text: getStatusLabel(status), variant: 'warning' as const }
      case 'open':
        return { text: getStatusLabel(status), variant: 'info' as const }
      case 'resolved':
        return { text: getStatusLabel(status), variant: 'success' as const }
      case 'closed':
        return { text: getStatusLabel(status), variant: 'neutral' as const }
      default:
        return { text: getStatusLabel(status), variant: 'neutral' as const }
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600'
      case 'high': return 'text-orange-600'
      case 'medium': return 'text-yellow-600'
      case 'low': return 'text-green-600'
      default: return 'text-muted'
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'technical': return '🔧'
      case 'account': return '👤'
      case 'feature': return '💡'
      case 'bug': return '🐛'
      case 'abuse': return '⚠️'
      default: return '❓'
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return '剛剛'
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小時前`
    return `${Math.floor(diffInMinutes / 1440)} 天前`
  }

  const filteredTickets = tickets.filter(ticket => {
    if (filter.status !== 'all' && ticket.status !== filter.status) return false
    if (filter.priority !== 'all' && ticket.priority !== filter.priority) return false
    if (filter.category !== 'all' && ticket.category !== filter.category) return false
    return true
  })

  const urgentTickets = tickets.filter(t => 
    (t.status === 'awaiting_admin' && t.priority === 'urgent') ||
    (t.status === 'awaiting_admin' && t.priority === 'high')
  )

  return (
    <MobileAdminLayout
      title="客服管理"
      subtitle={`${stats.awaitingAdmin} 項等待回覆`}
      showSearch={true}
      actions={
        <button 
          onClick={loadSupportData}
          disabled={loading}
          className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
      bottomContent={selectedTicket ? (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg">
              回覆工單 #{selectedTicket.publicId}
            </span>
            <button
              onClick={() => setSelectedTicket(null)}
              className="p-1 text-muted hover:text-fg"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="輸入回覆內容..."
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background resize-none text-sm"
          />
          
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedTicket(null)}
              className="flex-1 py-2 text-sm font-medium text-muted border border-border rounded-lg"
            >
              取消
            </button>
            <button
              onClick={() => handleReply(selectedTicket.id)}
              disabled={!replyText.trim() || selectedTicket.processing}
              className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50"
            >
              {selectedTicket.processing ? '發送中...' : '發送回覆'}
            </button>
          </div>
        </div>
      ) : undefined}
    >
      {/* 統計概覽 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <MobileAdminStatCard
          title="等待回覆"
          value={stats.awaitingAdmin}
          change={stats.awaitingAdmin > 3 ? '+2' : undefined}
          trend={stats.awaitingAdmin > 3 ? 'up' : 'neutral'}
        />
        <MobileAdminStatCard
          title="今日解決"
          value={8}
          change="+3"
          trend="up"
        />
      </div>

      {/* 緊急工單提醒 */}
      {urgentTickets.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 dark:bg-red-900/10 dark:border-red-800/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">
                緊急工單
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                有 {urgentTickets.length} 個高優先級工單需要立即處理
              </p>
              <button
                onClick={() => setFilter({ ...filter, priority: 'urgent' })}
                className="text-sm font-medium text-red-600 dark:text-red-400"
              >
                立即查看 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 篩選器 */}
      <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Filter className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium text-fg">篩選條件</span>
        </div>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-2">狀態</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
              >
                <option value="all">全部狀態</option>
                <option value="awaiting_admin">等待回覆</option>
                <option value="awaiting_user">等待用戶</option>
                <option value="open">進行中</option>
                <option value="resolved">已解決</option>
                <option value="closed">已關閉</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs text-muted mb-2">優先級</label>
              <select
                value={filter.priority}
                onChange={(e) => setFilter(prev => ({ ...prev, priority: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
              >
                <option value="all">全部優先級</option>
                <option value="urgent">緊急</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-xs text-muted mb-2">類別</label>
            <select
              value={filter.category}
              onChange={(e) => setFilter(prev => ({ ...prev, category: e.target.value as any }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="all">全部類別</option>
              <option value="technical">技術問題</option>
              <option value="account">帳號問題</option>
              <option value="feature">功能建議</option>
              <option value="bug">錯誤回報</option>
              <option value="abuse">濫用檢舉</option>
              <option value="other">其他</option>
            </select>
          </div>
        </div>
      </div>

      {/* 支援工單列表 */}
      <div className="space-y-3">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <MobileAdminCard key={i} title="" loading={true} />
          ))
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-8">
            <LifeBuoy className="w-12 h-12 mx-auto text-muted mb-3" />
            <h3 className="font-medium text-fg mb-1">沒有支援工單</h3>
            <p className="text-sm text-muted">
              {filter.status === 'all' ? '目前沒有任何工單' : '沒有符合條件的工單'}
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <MobileAdminCard
              key={ticket.id}
              title={
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCategoryIcon(ticket.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-fg truncate">
                      {ticket.subject}
                    </div>
                    <div className="text-xs text-muted">
                      #{ticket.publicId}
                    </div>
                  </div>
                </div>
              }
              subtitle={
                <div className="flex items-center gap-2 text-xs text-muted">
                  <User className="w-3 h-3" />
                  <span>{ticket.submitter}</span>
                  {ticket.school && (
                    <>
                      <span>•</span>
                      <span>{ticket.school}</span>
                    </>
                  )}
                  <span>•</span>
                  <span className={getPriorityColor(ticket.priority)}>
                    {ticket.priority.toUpperCase()}
                  </span>
                  <span>•</span>
                  <span>{formatTimeAgo(ticket.lastActivity)}</span>
                </div>
              }
              status={ticket.priority === 'urgent' ? 'danger' : 
                     ticket.status === 'awaiting_admin' ? 'warning' : 'neutral'}
              badge={getStatusBadge(ticket.status)}
              loading={ticket.processing}
              actions={
                !ticket.processing && ticket.status === 'awaiting_admin' ? (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedTicket(ticket)
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStatusChange(ticket.id, 'resolved')
                      }}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : undefined
              }
              onClick={() => {
                console.log('查看工單詳情:', ticket.id)
              }}
            />
          ))
        )}
      </div>
    </MobileAdminLayout>
  )
}