import { useEffect, useState } from 'react'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { MobileSupportForm } from '@/components/mobile/MobileSupportForm'
import { MobileTicketCard } from '@/components/mobile/MobileTicketCard'
import { ArrowLeft, Plus, Search, Ticket, MessageSquare } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AccountAPI, api } from '@/services/api'

export default function MobileSupportPage() {
  const { isLoggedIn } = useAuth()
  const [activeTab, setActiveTab] = useState<'submit' | 'track' | 'history'>('submit')
  const [personalId, setPersonalId] = useState<string | null>(null)
  const [mySchool, setMySchool] = useState<{ slug: string; name: string } | null>(null)
  
  // 提交工單相關狀態
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<'ok' | 'err' | null>(null)
  const [submitMsg, setSubmitMsg] = useState('')

  // 追蹤工單相關狀態
  const [trackingCode, setTrackingCode] = useState('')
  const [trackingResult, setTrackingResult] = useState<any>(null)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  // 歷史工單相關狀態
  const [myTickets, setMyTickets] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 獲取用戶資訊
  useEffect(() => {
    if (isLoggedIn) {
      (async () => {
        try {
          const profile = await AccountAPI.profile()
          const pid = profile?.personal_id || ''
          setPersonalId(pid || null)
          const school = profile?.school ? { slug: profile.school.slug, name: profile.school.name } : null
          setMySchool(school)
        } catch {}
      })()
    }
  }, [isLoggedIn])

  // 加載歷史工單
  const loadMyTickets = async () => {
    if (!isLoggedIn) return
    
    setLoadingHistory(true)
    try {
      const response = await api<{ ok: boolean; items: any[] }>('/api/support/my?limit=20')
      if (response.ok) {
        setMyTickets(response.items || [])
      }
    } catch (error) {
      console.error('Failed to load tickets:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'history' && isLoggedIn) {
      loadMyTickets()
    }
  }, [activeTab, isLoggedIn])

  const handleSubmit = async (data: any) => {
    setSubmitting(true)
    setSubmitResult(null)
    setSubmitMsg('')

    try {
      const response = await api<{ ok: boolean; msg?: string; details?: any }>('/api/support/report', {
        method: 'POST',
        body: JSON.stringify(data)
      })

      if (response.ok) {
        const details = response.details
        let successMsg = response.msg || '已送出！我們會盡快回覆'
        if (details) {
          const category = details.category || '一般問題'
          const method = details.contact_method || (isLoggedIn ? '站內通知' : 'Email')
          const trackingCode = details.tracking_code
          successMsg = `✅ ${successMsg}\\n類別：${category}\\n回覆方式：${method}`
          if (trackingCode) {
            successMsg += `\\n追蹤碼：${trackingCode}`
          }
        }
        
        setSubmitResult('ok')
        setSubmitMsg(successMsg)
      } else {
        throw new Error(response.msg || '提交失敗')
      }
    } catch (e: any) {
      setSubmitResult('err')
      setSubmitMsg(e?.message || '提交失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTrack = async () => {
    if (!trackingCode.trim()) {
      setTrackingError('請輸入追蹤碼')
      return
    }

    setSearching(true)
    setTrackingError(null)
    setTrackingResult(null)

    try {
      const response = await api<any>(`/api/support/track/${trackingCode.trim()}`)
      
      if (response.ok && response.tickets) {
        setTrackingResult(response)
        if (response.tickets.length === 0) {
          setTrackingError('此追蹤碼暫無工單記錄')
        }
      } else {
        setTrackingError(response.msg || '查詢失敗')
      }
    } catch (e: any) {
      setTrackingError(e.message || '查詢失敗，請稍後重試')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className=\"min-h-screen bg-bg pb-20\">
      <MobileBottomNav />
      
      {/* 頂部導航 */}
      <div className=\"bg-surface border-b border-border sticky top-0 z-10\">
        <div className=\"flex items-center justify-between p-4\">
          <button onClick={() => window.history.back()} className=\"flex items-center gap-2 text-muted hover:text-fg transition-colors\">
            <ArrowLeft className=\"w-5 h-5\" /> 返回
          </button>
          <h1 className=\"text-lg font-semibold text-fg\">客服支援</h1>
          <div className=\"w-10\"></div>
        </div>
        
        {/* 標籤頁 */}
        <div className=\"flex border-t border-border\">
          <button
            onClick={() => setActiveTab('submit')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'submit'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Plus className=\"w-4 h-4\" />
            提交工單
          </button>
          <button
            onClick={() => setActiveTab('track')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'track'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Search className=\"w-4 h-4\" />
            追蹤工單
          </button>
          {isLoggedIn && (
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted hover:text-fg'
              }`}
            >
              <Ticket className=\"w-4 h-4\" />
              我的工單
            </button>
          )}
        </div>
      </div>

      {/* 內容區域 */}
      <div className=\"p-4\">
        {/* 提交工單 */}
        {activeTab === 'submit' && (
          <div>
            <div className=\"mb-4\">
              <h2 className=\"text-base font-medium text-fg mb-1\">提交新工單</h2>
              <p className=\"text-sm text-muted\">遇到問題或有建議？告訴我們吧！</p>
            </div>
            <MobileSupportForm
              isLoggedIn={isLoggedIn}
              personalId={personalId}
              mySchool={mySchool}
              onSubmit={handleSubmit}
              isSubmitting={submitting}
              result={submitResult}
              message={submitMsg}
            />
          </div>
        )}

        {/* 追蹤工單 */}
        {activeTab === 'track' && (
          <div>
            <div className=\"mb-4\">
              <h2 className=\"text-base font-medium text-fg mb-1\">追蹤工單進度</h2>
              <p className=\"text-sm text-muted\">使用追蹤碼查看工單狀態</p>
            </div>
            
            <div className=\"space-y-4\">
              <div>
                <label className=\"block text-sm font-medium text-fg mb-2\">追蹤碼</label>
                <div className=\"flex gap-2\">
                  <input
                    type=\"text\"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder=\"FK12345ABCDE\"
                    className=\"form-control flex-1\"
                    onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                  />
                  <button
                    onClick={handleTrack}
                    disabled={searching}
                    className=\"btn-primary px-4 py-2 flex items-center gap-1 whitespace-nowrap\"
                  >
                    <Search className={`w-4 h-4 ${searching ? 'animate-pulse' : ''}`} />
                    {searching ? '搜索中' : '查詢'}
                  </button>
                </div>
              </div>

              {trackingError && (
                <div className=\"bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3\">
                  <div className=\"text-sm text-red-800 dark:text-red-200\">{trackingError}</div>
                </div>
              )}

              {trackingResult && trackingResult.tickets && (
                <div className=\"space-y-3\">
                  <div className=\"text-sm text-muted\">
                    找到 {trackingResult.total_tickets} 個工單
                  </div>
                  {trackingResult.tickets.map((ticket: any, index: number) => (
                    <MobileTicketCard key={`${ticket.ticket_number}-${index}`} ticket={{
                      ticket_id: ticket.ticket_number,
                      subject: ticket.subject,
                      category: ticket.category,
                      status: ticket.status,
                      priority: ticket.priority,
                      created_at: ticket.created_at,
                      updated_at: ticket.updated_at,
                      response_count: ticket.response_count,
                      scope: ticket.scope,
                      replies: ticket.replies
                    }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 我的工單 */}
        {activeTab === 'history' && isLoggedIn && (
          <div>
            <div className=\"flex items-center justify-between mb-4\">
              <div>
                <h2 className=\"text-base font-medium text-fg mb-1\">我的工單</h2>
                <p className=\"text-sm text-muted\">您提交的工單列表</p>
              </div>
              <button
                onClick={loadMyTickets}
                disabled={loadingHistory}
                className=\"text-primary hover:text-primary-dark text-sm font-medium\"
              >
                {loadingHistory ? '載入中...' : '刷新'}
              </button>
            </div>

            {loadingHistory ? (
              <div className=\"text-center py-8 text-muted\">
                <MessageSquare className=\"w-8 h-8 mx-auto mb-2 animate-pulse\" />
                <div>載入中...</div>
              </div>
            ) : myTickets.length === 0 ? (
              <div className=\"text-center py-8 text-muted\">
                <Ticket className=\"w-8 h-8 mx-auto mb-2\" />
                <div className=\"text-sm\">暫無工單記錄</div>
              </div>
            ) : (
              <div className=\"space-y-3\">
                {myTickets.map((ticket, index) => (
                  <MobileTicketCard key={`${ticket.ticket_id}-${index}`} ticket={ticket} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 未登入用戶的歷史工單提示 */}
        {activeTab === 'history' && !isLoggedIn && (
          <div className=\"text-center py-8 text-muted\">
            <Ticket className=\"w-8 h-8 mx-auto mb-2\" />
            <div className=\"text-sm mb-2\">請登入以查看您的工單歷史</div>
            <a href=\"/auth\" className=\"text-primary hover:text-primary-dark text-sm font-medium\">
              立即登入
            </a>
          </div>
        )}
      </div>
    </div>
  )
}