import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  MessageCircle, 
  Plus, 
  Search, 
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Send,
  Paperclip,
  X
} from 'lucide-react'
import { MobileTicketCard } from '../components/mobile/MobileTicketCard'

interface Ticket {
  id: string
  subject: string
  status: string
  category: string
  priority: string
  created_at: string
  last_activity_at: string
  message_count: number
  ticket_id?: string
  response_count?: number
  scope?: string
  is_urgent?: boolean
  handler?: string
  replies?: Array<{
    message: string
    timestamp: string
    by: string
    author?: string
  }>
}

interface CreateTicketData {
  subject: string
  body: string
  category: string
  priority: string
  email?: string
}

export default function MobileSupportPage() {
  const navigate = useNavigate()
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'track'>('list')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // Create ticket form state
  const [createForm, setCreateForm] = useState<CreateTicketData>({
    subject: '',
    body: '',
    category: 'other',
    priority: 'medium',
    email: ''
  })
  const [createStep, setCreateStep] = useState(1)
  const [submitLoading, setSubmitLoading] = useState(false)

  // Track ticket state
  const [trackForm, setTrackForm] = useState({
    ticket_id: '',
    email: ''
  })

  useEffect(() => {
    // 檢查登入狀態
    const token = localStorage.getItem('access_token')
    setIsLoggedIn(!!token)
    
    if (token) {
      fetchMyTickets()
    }
  }, [])

  const fetchMyTickets = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/support/my-tickets', {
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

  const handleCreateTicket = async () => {
    if (!createForm.subject.trim() || !createForm.body.trim()) {
      setError('請填寫主題和內容')
      return
    }

    if (!isLoggedIn && !createForm.email) {
      setError('請填寫聯絡 Email')
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const token = localStorage.getItem('access_token')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...createForm,
          email: isLoggedIn ? undefined : createForm.email
        })
      })

      if (response.ok) {
        const data = await response.json()
        
        // 重置表單
        setCreateForm({
          subject: '',
          body: '',
          category: 'other',
          priority: 'medium',
          email: ''
        })
        setCreateStep(1)
        
        // 顯示成功訊息
        alert(isLoggedIn ? '支援單已成功建立！' : '支援單已建立！請查看 Email 中的追蹤連結。')
        
        // 如果已登入，重新載入支援單列表
        if (isLoggedIn) {
          setCurrentView('list')
          fetchMyTickets()
        } else {
          setCurrentView('track')
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '建立支援單失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleTrackTicket = async () => {
    if (!trackForm.ticket_id || !trackForm.email) {
      setError('請填寫支援單編號和 Email')
      return
    }

    setSubmitLoading(true)
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
        throw new Error(errorData.msg || '追蹤支援單失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setSubmitLoading(false)
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus
    const matchesSearch = !searchQuery || 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesStatus && matchesSearch
  })

  const renderTopBar = () => (
    <div className="sticky top-0 bg-surface/80 backdrop-blur-md border-b border-border z-10">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {currentView !== 'list' && (
            <button
              onClick={() => setCurrentView('list')}
              className="p-2 hover:bg-surface-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold">
            {currentView === 'list' && '我的支援'}
            {currentView === 'create' && '提交支援單'}
            {currentView === 'track' && '追蹤支援單'}
          </h1>
        </div>
        
        {currentView === 'list' && (
          <button
            onClick={fetchMyTickets}
            disabled={loading}
            className="p-2 hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  )

  const renderBottomNav = () => (
    <div className="sticky bottom-0 bg-surface/80 backdrop-blur-md border-t border-border">
      <div className="flex items-center justify-around py-2">
        <button
          onClick={() => setCurrentView('list')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
            currentView === 'list' ? 'text-primary bg-primary/10' : 'text-muted hover:text-fg'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs">我的支援單</span>
        </button>
        
        <button
          onClick={() => setCurrentView('create')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
            currentView === 'create' ? 'text-primary bg-primary/10' : 'text-muted hover:text-fg'
          }`}
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs">新支援單</span>
        </button>
        
        {!isLoggedIn && (
          <button
            onClick={() => setCurrentView('track')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
              currentView === 'track' ? 'text-primary bg-primary/10' : 'text-muted hover:text-fg'
            }`}
          >
            <Search className="w-5 h-5" />
            <span className="text-xs">追蹤</span>
          </button>
        )}
      </div>
    </div>
  )

  const renderTicketList = () => (
    <div className="flex flex-col h-full">
      {/* 搜尋和篩選 */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="搜尋支援單..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-2 border border-border rounded-lg text-sm"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', 'open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === status 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-surface-2 text-muted hover:text-fg'
              }`}
            >
              {status === 'all' ? '全部' : 
               status === 'open' ? '開啟' :
               status === 'awaiting_user' ? '等待回覆' :
               status === 'awaiting_admin' ? '等待處理' :
               status === 'resolved' ? '已解決' : '已關閉'}
            </button>
          ))}
        </div>
      </div>

      {/* 支援單列表 */}
      <div className="flex-1 px-4 pb-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 mx-auto text-muted mb-3" />
            <p className="text-sm text-muted">
              {tickets.length === 0 ? '尚無支援單記錄' : '沒有符合條件的支援單'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map(ticket => (
              <MobileTicketCard 
                key={ticket.id}
                ticket={{
                  ...ticket,
                  ticket_id: ticket.id,
                  response_count: ticket.message_count || 0,
                  scope: '我的支援單'
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderCreateForm = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          </div>
        )}

        {/* 步驟指示器 */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3].map(step => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === createStep ? 'bg-primary text-primary-foreground' :
                step < createStep ? 'bg-green-500 text-white' :
                'bg-surface-2 text-muted'
              }`}>
                {step < createStep ? <CheckCircle2 className="w-4 h-4" /> : step}
              </div>
              {step < 3 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  step < createStep ? 'bg-green-500' : 'bg-surface-2'
                }`} />
              )}
            </div>
          ))}
        </div>

        {createStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium mb-4">1. 基本資訊</h2>
            
            <div>
              <label className="block text-sm font-medium mb-2">問題分類</label>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg bg-surface"
              >
                <option value="technical">技術問題</option>
                <option value="account">帳戶問題</option>
                <option value="feature">功能建議</option>
                <option value="bug">錯誤回報</option>
                <option value="abuse">濫用檢舉</option>
                <option value="other">其他問題</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">優先級</label>
              <select
                value={createForm.priority}
                onChange={(e) => setCreateForm(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg bg-surface"
              >
                <option value="low">低優先級</option>
                <option value="medium">中優先級</option>
                <option value="high">高優先級</option>
                <option value="urgent">緊急</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">問題主題</label>
              <input
                type="text"
                placeholder="請簡要描述您的問題"
                value={createForm.subject}
                onChange={(e) => setCreateForm(prev => ({ ...prev, subject: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg bg-surface"
                maxLength={500}
              />
              <p className="text-xs text-muted mt-1">{createForm.subject.length}/500</p>
            </div>
          </div>
        )}

        {createStep === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium mb-4">2. 詳細描述</h2>
            
            <div>
              <label className="block text-sm font-medium mb-2">問題詳情</label>
              <textarea
                placeholder="請詳細描述您遇到的問題，包括：&#10;- 具體的錯誤訊息&#10;- 重現步驟&#10;- 預期行為&#10;- 實際行為"
                rows={8}
                value={createForm.body}
                onChange={(e) => setCreateForm(prev => ({ ...prev, body: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg bg-surface resize-none"
                maxLength={10000}
              />
              <p className="text-xs text-muted mt-1">{createForm.body.length}/10000</p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">💡 提示</h3>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                提供詳細資訊能幫助我們更快解決您的問題。可以包含截圖、錯誤訊息或操作步驟。
              </p>
            </div>
          </div>
        )}

        {createStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium mb-4">3. 提交確認</h2>
            
            {!isLoggedIn && (
              <div>
                <label className="block text-sm font-medium mb-2">聯絡 Email *</label>
                <input
                  type="email"
                  placeholder="用於接收工單更新通知"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-3 border border-border rounded-lg bg-surface"
                />
                <p className="text-xs text-muted mt-1">
                  我們會將支援單追蹤連結發送到這個 Email 地址
                </p>
              </div>
            )}

            <div className="bg-surface-2 p-4 rounded-lg">
              <h3 className="font-medium mb-2">支援單摘要</h3>
              <div className="space-y-2 text-sm text-muted">
                <div><strong>分類：</strong>{createForm.category}</div>
                <div><strong>優先級：</strong>{createForm.priority}</div>
                <div><strong>主題：</strong>{createForm.subject}</div>
                <div><strong>內容：</strong>{createForm.body.substring(0, 100)}...</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部按鈕 */}
      <div className="p-4 border-t border-border bg-surface">
        <div className="flex gap-3">
          {createStep > 1 && (
            <button
              onClick={() => setCreateStep(prev => prev - 1)}
              className="flex-1 py-3 border border-border rounded-lg text-center font-medium hover:bg-surface-2 transition-colors"
            >
              上一步
            </button>
          )}
          
          <button
            onClick={() => {
              if (createStep < 3) {
                if (createStep === 1 && (!createForm.subject.trim() || !createForm.category)) {
                  setError('請填寫問題主題和選擇分類')
                  return
                }
                if (createStep === 2 && !createForm.body.trim()) {
                  setError('請填寫問題詳情')
                  return
                }
                setError(null)
                setCreateStep(prev => prev + 1)
              } else {
                handleCreateTicket()
              }
            }}
            disabled={submitLoading}
            className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg text-center font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitLoading ? (
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                提交中...
              </div>
            ) : (
              createStep < 3 ? '下一步' : '提交支援單'
            )}
          </button>
        </div>
      </div>
    </div>
  )

  const renderTrackForm = () => (
    <div className="p-4">
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
          <label className="block text-sm font-medium mb-2">支援單編號</label>
          <input
            type="text"
            placeholder="例如：SUP-ABC123"
            value={trackForm.ticket_id}
            onChange={(e) => setTrackForm(prev => ({ ...prev, ticket_id: e.target.value }))}
            className="w-full p-3 border border-border rounded-lg bg-surface"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Email 地址</label>
          <input
            type="email"
            placeholder="提交支援單時使用的 Email"
            value={trackForm.email}
            onChange={(e) => setTrackForm(prev => ({ ...prev, email: e.target.value }))}
            className="w-full p-3 border border-border rounded-lg bg-surface"
          />
        </div>

        <button
          onClick={handleTrackTicket}
          disabled={submitLoading}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitLoading ? (
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              追蹤中...
            </div>
          ) : (
            '追蹤支援單'
          )}
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">如何找到支援單編號？</h3>
        <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p>• 建立支援單後會收到確認 Email，其中包含支援單編號</p>
          <p>• 支援單編號格式為 SUP-XXXXXX</p>
          <p>• Email 主旨通常包含支援單編號</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-background">
      {renderTopBar()}
      
      <div className="flex-1 overflow-y-auto">
        {currentView === 'list' && renderTicketList()}
        {currentView === 'create' && renderCreateForm()}
        {currentView === 'track' && renderTrackForm()}
      </div>

      {renderBottomNav()}
    </div>
  )
}