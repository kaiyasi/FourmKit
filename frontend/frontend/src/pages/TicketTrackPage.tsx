import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Search,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  MessageCircle,
  Clock,
  User,
  Tag,
  Send,
  ArrowLeft
} from 'lucide-react'

interface TicketDetail {
  id: string
  subject: string
  status: string
  category: string
  priority: string
  submitter: string
  created_at: string
  updated_at: string
  last_activity_at: string
  message_count: number
  messages: Array<{
    id: number
    body: string
    author_type: string
    author_name: string
    created_at: string
    attachments?: any
  }>
}

export default function TicketTrackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { id: ticketIdParam } = useParams()
  const { isLoggedIn } = useAuth()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  
  // 追蹤表單狀態
  const [trackForm, setTrackForm] = useState({
    ticket_id: '',
    email: ''
  })

  // 從 URL 參數獲取 token 和 ticket ID
  const token = searchParams.get('token') || searchParams.get('sig')
  const ticketId = ticketIdParam || searchParams.get('ticket_id')

  useEffect(() => {
    if (ticketId) {
      if (token) {
        // 訪客模式：使用 token 訪問
        fetchTicketByToken(ticketId, token)
      } else if (isLoggedIn) {
        // 登入用戶模式：直接訪問
        fetchTicketByAuth(ticketId)
      }
    }
  }, [token, ticketId, isLoggedIn])

  const fetchTicketByToken = async (id: string, tokenParam: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/support/tickets/${id}?sig=${tokenParam}`)
      
      if (response.ok) {
        const data = await response.json()
        setTicket(data.ticket)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '無法載入工單')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const fetchTicketByAuth = async (id: string) => {
    setLoading(true)
    setError(null)
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/support/tickets/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setTicket(data.ticket)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '無法載入工單')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const handleTrackTicket = async () => {
    if (!trackForm.ticket_id && !trackForm.email) {
      setError('請填寫工單編號或 Email')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/support/guest/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(trackForm)
      })

      if (response.ok) {
        const data = await response.json()
        if (data.tracking_url) {
          window.location.href = data.tracking_url
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '追蹤工單失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const handleReply = async () => {
    if (!replyText.trim() || !ticket) {
      return
    }

    setReplyLoading(true)
    setError(null)

    try {
      let response
      if (token) {
        // 訪客模式
        response = await fetch(`/api/support/tickets/${ticket.id}/messages?sig=${token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            body: replyText,
            sig: token
          })
        })
      } else if (isLoggedIn) {
        // 登入用戶模式
        const authToken = localStorage.getItem('token')
        response = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            body: replyText
          })
        })
      } else {
        throw new Error('無法回覆：請登入或使用有效的追蹤連結')
      }

      if (response.ok) {
        // 重新載入工單以顯示新回覆
        if (token) {
          fetchTicketByToken(ticket.id, token)
        } else {
          fetchTicketByAuth(ticket.id)
        }
        setReplyText('')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '回覆失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setReplyLoading(false)
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

  // 如果沒有 token，顯示追蹤表單
  if (!token || !ticketId) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-md mx-auto pt-20 p-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="text-center mb-6">
            <Search className="w-12 h-12 mx-auto text-muted mb-4" />
            <h1 className="text-xl font-bold mb-2">追蹤工單</h1>
            <p className="text-muted">輸入工單編號或 Email 來查看工單狀態</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">工單編號</label>
              <input
                type="text"
                placeholder="例如：SUP-ABC123"
                value={trackForm.ticket_id}
                onChange={(e) => setTrackForm(prev => ({ ...prev, ticket_id: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email 地址</label>
              <input
                type="email"
                placeholder="提交工單時使用的 Email"
                value={trackForm.email}
                onChange={(e) => setTrackForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg"
              />
            </div>

            <button
              onClick={handleTrackTicket}
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  追蹤中...
                </div>
              ) : (
                '追蹤工單'
              )}
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">如何找到工單編號？</h3>
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p>• 建立工單後會收到確認 Email，其中包含工單編號</p>
              <p>• 工單編號格式為 SUP-XXXXXX</p>
              <p>• Email 主旨通常包含工單編號</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    )
  }

  // 載入中
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto pt-20 p-6">
        <div className="flex justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-muted" />
        </div>
      </div>
    </div>
    )
  }

  // 錯誤狀態
  if (error && !ticket) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto pt-20 p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-900">載入失敗</span>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
                     <button
             onClick={() => navigate('/support')}
             className="px-4 py-2 border border-red-300 rounded-lg text-red-700 hover:bg-red-100 transition-colors"
           >
                         <ArrowLeft className="w-4 h-4 mr-2" />
             返回支援中心
          </button>
        </div>
      </div>
    </div>
    )
  }

  // 顯示工單詳情
  if (!ticket) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto pt-20 p-6">
      {/* 工單資訊標題 */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-lg font-bold text-primary">#{ticket.id.slice(-6)}</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(ticket.status)}`}>
                {ticket.status === 'open' ? '開啟' :
                 ticket.status === 'awaiting_user' ? '等待您的回覆' :
                 ticket.status === 'awaiting_admin' ? '等待管理員處理' :
                 ticket.status === 'resolved' ? '已解決' : '已關閉'}
              </span>
            </div>
            <h1 className="text-xl font-bold mb-2">{ticket.subject}</h1>
          </div>
          
          <div className="text-right">
            <div className={`text-sm ${getPriorityColor(ticket.priority)} font-medium`}>
              {ticket.priority === 'low' ? '低' : 
               ticket.priority === 'medium' ? '中' : 
               ticket.priority === 'high' ? '高' : '緊急'}優先級
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <span>分類：{ticket.category}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span>提交者：{ticket.submitter}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>建立時間：{formatDate(ticket.created_at)}</span>
          </div>
        </div>
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
        </div>
      )}

      {/* 對話記錄 */}
      <div className="bg-surface border border-border rounded-lg">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            對話記錄 ({ticket.messages.length})
          </h2>
        </div>

        <div className="divide-y divide-border">
          {ticket.messages.map((message, index) => (
            <div key={message.id} className="p-6">
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  message.author_type === 'admin' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                }`}>
                  {message.author_name.charAt(0).toUpperCase()}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{message.author_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      message.author_type === 'admin' 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                    }`}>
                      {message.author_type === 'admin' ? '管理員' : '用戶'}
                    </span>
                    <span className="text-xs text-muted">{formatDate(message.created_at)}</span>
                  </div>
                  
                  <div className="prose prose-sm max-w-none text-fg">
                    <div className="whitespace-pre-wrap break-words">
                      {message.body}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 回覆表單 */}
        {ticket.status !== 'closed' && (
          <div className="p-6 border-t border-border bg-surface/50">
            <div className="space-y-4">
              <label className="block text-sm font-medium">新增回覆</label>
              <textarea
                placeholder="輸入您的回覆..."
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full p-3 border border-border rounded-lg resize-none"
                maxLength={10000}
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted">{replyText.length}/10000</span>
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || replyLoading}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {replyLoading ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      發送中...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      發送回覆
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
                 )}
       </div>
     </div>
   </div>
   )
}