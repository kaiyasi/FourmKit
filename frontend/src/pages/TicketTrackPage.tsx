import { useState, useEffect } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { Search, Ticket, Clock, User, MessageCircle, ArrowLeft, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { api } from '@/services/api'

interface TrackedTicket {
  ticket_number: string
  subject: string
  category: string
  status: string
  priority: string
  created_at: string
  updated_at: string
  response_count: number
  scope: string
  replies?: Array<{
    message: string
    timestamp: string
    by: string
  }>
}

interface TrackingResult {
  ok: boolean
  tracking_code?: string
  tickets?: TrackedTicket[]
  total_tickets?: number
  msg?: string
}

export default function TicketTrackPage() {
  const [trackingCode, setTrackingCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<TrackingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const handleSearch = async () => {
    if (!trackingCode.trim()) {
      setError('請輸入追蹤碼')
      return
    }

    setSearching(true)
    setError(null)
    setResult(null)

    try {
      const response = await api<TrackingResult>(`/api/support/track/${trackingCode.trim()}`, {
        method: 'GET'
      })

      if (response.ok && response.tickets) {
        setResult(response)
        if (response.tickets.length === 0) {
          setError('此追蹤碼暫無工單記錄')
        }
      } else {
        setError(response.msg || '查詢失敗')
      }
    } catch (e: any) {
      setError(e.message || '查詢失敗，請稍後重試')
    } finally {
      setSearching(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string, color: string } } = {
      '開啟': { label: '開啟', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' },
      '已指派': { label: '已指派', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
      '處理中': { label: '處理中', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' },
      '等待回覆': { label: '等待回覆', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' },
      '已解決': { label: '已解決', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' },
      '已關閉': { label: '已關閉', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200' }
    }
    
    const statusInfo = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const priorityMap: { [key: string]: { label: string, color: string } } = {
      'low': { label: '低', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
      'medium': { label: '中', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' },
      'high': { label: '高', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' },
      'urgent': { label: '緊急', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' }
    }
    
    const priorityInfo = priorityMap[priority] || { label: priority, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityInfo.color}`}>
        優先級：{priorityInfo.label}
      </span>
    )
  }

  return (
    <div className=\"min-h-screen\">
      <NavBar pathname=\"/track\" />
      <MobileBottomNav />
      <main className=\"mx-auto max-w-4xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8\">
        {/* 返回按鈕 */}
        <div className=\"bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6\">
          <div className=\"flex items-center gap-3 mb-2\">
            <button onClick={() => window.history.back()} className=\"flex items-center gap-2 text-muted hover:text-fg transition-colors\">
              <ArrowLeft className=\"w-4 h-4\" /> 返回
            </button>
          </div>
          <h1 className=\"text-xl sm:text-2xl font-semibold dual-text\">工單追蹤</h1>
          <p className=\"text-sm text-muted mt-1\">使用您的追蹤碼查詢工單處理進度</p>
        </div>

        {/* 搜索區域 */}
        <div className=\"bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6\">
          <div className=\"space-y-4\">
            <div>
              <label className=\"block text-sm font-medium text-fg mb-2\">追蹤碼</label>
              <div className=\"flex gap-3\">
                <input
                  type=\"text\"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder=\"請輸入您的追蹤碼，例如：FK12345ABCDE\"
                  className=\"form-control flex-1\"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className=\"btn-primary px-4 py-2 flex items-center gap-2 whitespace-nowrap\"
                >
                  <Search className={`w-4 h-4 ${searching ? 'animate-pulse' : ''}`} />
                  {searching ? '搜索中...' : '查詢'}
                </button>
              </div>
            </div>

            {/* 使用說明 */}
            <div className=\"bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4\">
              <div className=\"flex items-start gap-3\">
                <AlertCircle className=\"w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0\" />
                <div className=\"text-sm\">
                  <div className=\"font-medium text-blue-900 dark:text-blue-100 mb-1\">使用說明</div>
                  <ul className=\"text-blue-800 dark:text-blue-200 space-y-1\">
                    <li>• 追蹤碼通常以 \"FK\" 開頭，例如：FK12345ABCDE</li>
                    <li>• 追蹤碼會在您提交工單後提供給您</li>
                    <li>• 如果您是已登入用戶，可直接在支援頁面查看工單歷史</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && (
              <div className=\"bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4\">
                <div className=\"flex items-center gap-3\">
                  <AlertCircle className=\"w-5 h-5 text-red-600 dark:text-red-400\" />
                  <span className=\"text-red-800 dark:text-red-200\">{error}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 搜索結果 */}
        {result && result.tickets && result.tickets.length > 0 && (
          <div className=\"bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft\">
            <div className=\"flex items-center gap-3 mb-4\">
              <Ticket className=\"w-5 h-5 text-primary\" />
              <h2 className=\"text-lg font-semibold dual-text\">
                找到 {result.total_tickets} 個工單
              </h2>
            </div>

            <div className=\"space-y-4\">
              {result.tickets.map((ticket, index) => (
                <div key={ticket.ticket_number} className=\"border border-border rounded-xl overflow-hidden\">
                  {/* 工單標題區域 */}
                  <div className=\"p-4 bg-surface-hover cursor-pointer\" onClick={() => 
                    setExpandedTicket(expandedTicket === ticket.ticket_number ? null : ticket.ticket_number)
                  }>
                    <div className=\"flex items-start justify-between gap-4\">
                      <div className=\"flex-1\">
                        <div className=\"flex items-center gap-3 mb-2\">
                          <span className=\"font-mono text-sm text-primary font-medium\">
                            #{ticket.ticket_number}
                          </span>
                          {getStatusBadge(ticket.status)}
                          {getPriorityBadge(ticket.priority)}
                        </div>
                        
                        <h3 className=\"text-base font-medium text-fg mb-2\">
                          {ticket.subject}
                        </h3>
                        
                        <div className=\"flex items-center gap-4 text-xs text-muted\">
                          <div className=\"flex items-center gap-1\">
                            <Clock className=\"w-3 h-3\" />
                            提交於 {new Date(ticket.created_at).toLocaleString()}
                          </div>
                          <div className=\"flex items-center gap-1\">
                            <User className=\"w-3 h-3\" />
                            {ticket.scope}
                          </div>
                          {ticket.response_count > 0 && (
                            <div className=\"flex items-center gap-1\">
                              <MessageCircle className=\"w-3 h-3\" />
                              {ticket.response_count} 個回覆
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className=\"text-xs text-muted\">
                        分類：{ticket.category}
                      </div>
                    </div>
                  </div>

                  {/* 展開的詳細內容 */}
                  {expandedTicket === ticket.ticket_number && (
                    <div className=\"border-t border-border bg-surface\">
                      <div className=\"p-4\">
                        <div className=\"space-y-4\">
                          {/* 工單資訊 */}
                          <div>
                            <div className=\"text-sm text-muted mb-2\">最後更新：{new Date(ticket.updated_at).toLocaleString()}</div>
                          </div>

                          {/* 回覆列表 */}
                          {ticket.replies && ticket.replies.length > 0 ? (
                            <div>
                              <h4 className=\"text-sm font-medium text-fg mb-3 flex items-center gap-2\">
                                <MessageCircle className=\"w-4 h-4\" />
                                回覆記錄 ({ticket.replies.length})
                              </h4>
                              <div className=\"space-y-3\">
                                {ticket.replies.map((reply, replyIndex) => (
                                  <div key={replyIndex} className=\"bg-surface-hover rounded-lg p-3\">
                                    <div className=\"flex items-center justify-between mb-2\">
                                      <div className=\"flex items-center gap-2\">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                          reply.by === '管理員' 
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                                        }`}>
                                          {reply.by}
                                        </span>
                                      </div>
                                      <span className=\"text-xs text-muted\">
                                        {new Date(reply.timestamp).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className=\"text-sm text-fg whitespace-pre-wrap break-words\">
                                      {reply.message}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className=\"text-center py-6 text-muted text-sm\">
                              暫無回覆
                            </div>
                          )}

                          {/* 工單狀態說明 */}
                          {ticket.status === '已解決' && (
                            <div className=\"bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3\">
                              <div className=\"flex items-center gap-2 text-emerald-800 dark:text-emerald-200\">
                                <CheckCircle className=\"w-4 h-4\" />
                                <span className=\"text-sm font-medium\">此工單已解決</span>
                              </div>
                              <p className=\"text-xs text-emerald-700 dark:text-emerald-300 mt-1\">
                                如果問題仍未解決，請提交新的工單。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 追蹤碼資訊 */}
            <div className=\"mt-6 pt-4 border-t border-border\">
              <div className=\"flex items-center justify-between text-sm text-muted\">
                <span>追蹤碼：{result.tracking_code}</span>
                <a href=\"/support\" className=\"flex items-center gap-1 text-primary hover:text-primary-dark transition-colors\">
                  提交新工單 <ExternalLink className=\"w-3 h-3\" />
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}