import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PageLayout } from '@/components/layout/PageLayout'
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
import { api } from '@/services/api'
import MobileSupportDetailPage from './MobileSupportDetailPage'

interface TicketDetail {
  id: number
  ticket_id: string
  subject: string
  status: string
  category: string
  priority: string
  submitter: string
  created_at: string
  last_activity_at: string
  message_count: number
  messages: Array<{
    id: number
    body: string
    author_type: string
    author_display_name: string
    created_at: string
    is_internal: boolean
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
  // 登入者列表模式（無 token/無單號時顯示）
  const [myTickets, setMyTickets] = useState<Array<{ id:string; subject:string; status:string; last_activity_at:string }>>([])
  const [myLoading, setMyLoading] = useState(false)
  const reloadMyTickets = async () => {
    try {
      setMyLoading(true)
      setError(null)
      const resp = await api<{ ok:boolean; tickets: Array<{ id:string; subject:string; status:string; priority:string; last_activity_at:string }>}>(`/api/support/my-tickets?limit=100&_=${Date.now()}`)
      const items = (resp?.tickets||[]).map(t=>({ id:t.id, subject:t.subject, status:t.status, priority:t.priority, last_activity_at:t.last_activity_at }))
      setMyTickets(items)
    } catch (e:any) {
      setError(e?.message||'載入失敗')
    } finally {
      setMyLoading(false)
    }
  }
  
  // 追蹤表單狀態
  const [trackForm, setTrackForm] = useState({
    ticket_id: '',
    email: ''
  })

  // 從 URL 參數獲取 token 和 ticket ID
  const token = searchParams.get('token') || searchParams.get('sig')
  const ticketId = ticketIdParam || searchParams.get('ticket') || searchParams.get('ticket_id')

  // 僅有 token（沒有 ticketId）時，先向後端驗證以取得正確的 redirect_url
  useEffect(() => {
    if (token && !ticketId) {
      (async () => {
        try {
          setLoading(true)
          setError(null)
          const r = await fetch('/api/support/guest/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && j?.redirect_url) {
            navigate(j.redirect_url, { replace: true })
            return
          }
          throw new Error(j?.msg || '無法驗證追蹤連結，請改用工單編號或 Email 追蹤')
        } catch (e:any) {
          setError(e?.message || '驗證失敗')
        } finally {
          setLoading(false)
        }
      })()
    }
  }, [token, ticketId])

  useEffect(() => {
    if (ticketId) {
      if (token) {
        // 訪客模式：使用 token 訪問
        fetchTicketByToken(ticketId, token)
      } else if (isLoggedIn) {
        // 登入用戶模式：直接訪問
        fetchTicketByAuth(ticketId)
      }
    } else if (!token && isLoggedIn) {
      // 無 token/單號：載入我的工單列表（就地顯示，不跳頁）
      ;(async () => {
        try {
          setMyLoading(true)
          setError(null)
          const resp = await api<{ ok:boolean; tickets: Array<{ id:string; subject:string; status:string; priority:string; last_activity_at:string }>}>(`/api/support/my-tickets?limit=100&_=${Date.now()}`)
          const items = (resp?.tickets||[]).map(t=>({ id:t.id, subject:t.subject, status:t.status, priority:t.priority, last_activity_at:t.last_activity_at }))
          setMyTickets(items)
        } catch (e:any) {
          setError(e?.message||'載入失敗')
        } finally {
          setMyLoading(false)
        }
      })()
    }
  }, [token, ticketId, isLoggedIn])

  // 剛建立的工單提示（若列表暫時還沒刷新）
  useEffect(() => {
    if (!isLoggedIn || myTickets.length > 0) return
    const lastId = localStorage.getItem('fk_last_ticket_id')
    if (lastId) {
      // 嘗試直接帶使用者進該單
      try {
        navigate(`/support/ticket/${lastId}`, { replace: false })
      } catch {}
    }
  }, [isLoggedIn, myTickets.length])

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

      const data = await response.json()

      if (response.ok) {
        // 檢查是否返回多個工單
        if (data.multiple && data.tickets) {
          // 顯示工單列表讓用戶選擇
          const ticketList = data.tickets.map((t: any) =>
            `${t.ticket_id} - ${t.subject} (${t.status})`
          ).join('\n')

          alert(`找到 ${data.tickets.length} 個工單，請選擇一個：\n\n${ticketList}\n\n請在工單編號欄位輸入完整的工單編號後重試。`)
          setError(null)
        } else if (data.tracking_url) {
          // 單一工單，直接跳轉
          window.location.href = data.tracking_url
        }
      } else {
        throw new Error(data.msg || '追蹤工單失敗')
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
      'open': 'bg-info-bg text-info-text border border-info-border',
      'awaiting_admin': 'bg-warning-bg text-warning-text border border-warning-border',
      'awaiting_user': 'bg-warning-bg text-warning-text border border-warning-border',
      'resolved': 'bg-success-bg text-success-text border border-success-border',
      'closed': 'bg-surface text-muted border border-border'
    }
    return colors[status] || 'bg-surface text-fg border border-border'
  }

  const getPriorityColor = (priority: string) => {
    const colors: { [key: string]: string } = {
      'low': 'text-success',
      'medium': 'text-warning',
      'high': 'text-warning hover:text-warning-hover',
      'urgent': 'text-danger'
    }
    return colors[priority] || 'text-muted'
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

  // 顯示追蹤提示頁的條件：
  // 1) token 與 ticketId 皆缺；或 2) 僅有 ticketId 但未登入（需要憑證）
  if (!token && (!ticketId || !isLoggedIn)) {
    return (
      <PageLayout pathname="/support/track" maxWidth="max-w-3xl">
        <div className="max-w-md mx-auto pt-6 sm:pt-8 md:pt-10 p-4">
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="text-center mb-6">
              <Search className="w-12 h-12 mx-auto text-muted mb-4" />
              <h1 className="text-xl font-bold mb-1">追蹤工單</h1>
              {isLoggedIn
                ? <p className="text-muted">已登入，以下為您的工單列表。</p>
                : <p className="text-muted">輸入工單編號或 Email 來查看工單狀態</p>}
            </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            </div>
          )}

          {!isLoggedIn ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">工單編號</label>
                <input
                  type="text"
                  placeholder="例如：TEC-A1B2 或 BUG-U42-C3D4"
                  value={trackForm.ticket_id}
                  onChange={(e) => setTrackForm(prev => ({ ...prev, ticket_id: e.target.value }))}
                  className="w-full p-3 bg-surface border border-border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email 地址</label>
                <input
                  type="email"
                  placeholder="提交工單時使用的 Email"
                  value={trackForm.email}
                  onChange={(e) => setTrackForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-3 bg-surface border border-border rounded-lg"
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
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted">我的支援單</div>
                <button
                  className="px-2 py-1 text-xs rounded border hover:bg-surface"
                  onClick={reloadMyTickets}
                >
                  重新整理
                </button>
              </div>
              {myLoading ? (
                <div className="text-center py-4 text-muted">載入我的支援單中…</div>
              ) : myTickets.length === 0 ? (
                <div className="text-center py-4 text-muted">{error ? error : '尚無支援單'}</div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {myTickets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/support/ticket/${t.id}`)}
                      className="w-full text-left p-3 hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{t.subject}</div>
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(t.status)}`}>{
                          t.status === 'open' ? '開啟' : t.status === 'awaiting_user' ? '等待您的回覆' : t.status === 'awaiting_admin' ? '等待管理員處理' : t.status === 'resolved' ? '已解決' : '已關閉'
                        }</span>
                      </div>
                      <div className="text-xs text-muted mt-1">#{t.id.slice(-6)} · 最後更新 {formatDate(t.last_activity_at)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
      </PageLayout>
    )
  }

  // 僅 token（無 ticketId）階段：顯示驗證狀態或錯誤
  if (token && !ticketId) {
    return (
      <PageLayout pathname="/support/track" maxWidth="max-w-3xl">
        <div className="max-w-md mx-auto pt-10 p-4">
          <div className="bg-surface border border-border rounded-lg p-6 text-center">
            {loading ? (
              <>
                <RefreshCw className="w-6 h-6 mx-auto animate-spin text-muted mb-3" />
                <div className="text-fg font-medium">驗證追蹤連結中...</div>
              </>
            ) : error ? (
              <>
                <AlertCircle className="w-6 h-6 mx-auto text-danger mb-3" />
                <div className="text-danger font-medium mb-2">{error}</div>
                <button
                  onClick={() => navigate('/support/track', { replace: true })}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-surface-hover"
                >
                  回到追蹤頁
                </button>
              </>
            ) : null}
          </div>
        </div>
      </PageLayout>
    )
  }

  // 載入中
  if (loading) {
    return (
      <PageLayout pathname={`/support/ticket/${ticketId || ''}`} maxWidth="max-w-4xl">
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted" />
        </div>
      </PageLayout>
    )
  }

  // 錯誤狀態
  if (error && !ticket) {
    return (
      <PageLayout pathname={`/support/ticket/${ticketId || ''}`} maxWidth="max-w-4xl">
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
      </PageLayout>
    )
  }

  // 顯示工單詳情
  if (!ticket) {
    return null
  }
  // 行動裝置：使用專屬詳情介面（混合式）
  if (ticket && window.innerWidth <= 768) {
    return (
      <MobileSupportDetailPage
        ticket={{
          ticket_id: ticket.ticket_id,
          subject: ticket.subject,
          status: ticket.status,
          category: ticket.category,
          created_at: ticket.created_at,
          messages: ticket.messages as any,
        }}
        newMessage={replyText}
        setNewMessage={setReplyText}
        sending={replyLoading}
        onSend={handleReply}
        onBack={() => navigate('/support')}
        refreshing={loading}
        onReload={() => {
          if (token) fetchTicketByToken(ticket.ticket_id, token)
          else if (isLoggedIn) fetchTicketByAuth(ticket.ticket_id)
        }}
      />
    )
  }


  return (
    <PageLayout pathname={`/support/ticket/${ticketId || ''}`} maxWidth="max-w-4xl">
      {/* 返回鍵區塊 */}
      <div className="pt-4 pb-2">
        <button
          onClick={() => {
            try {
              if (window.history.length > 1) navigate(-1)
              else navigate('/support')
            } catch {
              navigate('/support')
            }
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-muted hover:text-fg hover:bg-surface-hover transition-colors"
          title="返回"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-0">
      {/* 工單資訊標題 */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-lg font-bold text-primary">#{ticket.ticket_id}</span>
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
                  {message.author_display_name.charAt(0).toUpperCase()}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{message.author_display_name}</span>
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
    </PageLayout>
  )
}
