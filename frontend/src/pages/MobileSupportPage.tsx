import React, { useState, useEffect, useMemo } from 'react'
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

  // 附件上傳相關狀態
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // 使用 useMemo 優化字數計算，避免不必要的重新渲染
  const subjectLength = useMemo(() => createForm.subject.length, [createForm.subject])
  const bodyLength = useMemo(() => createForm.body.length, [createForm.body])

  // 檔案處理函數
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setSelectedFiles(prev => [...prev, ...files])
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 拖拉處理函數
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    setSelectedFiles(prev => [...prev, ...files])
  }

  const getToken = (): string | null => {
    try {
      return localStorage.getItem('token') || localStorage.getItem('access_token') || sessionStorage.getItem('token') || null
    } catch {
      try { return sessionStorage.getItem('token') } catch { return null }
    }
  }

  useEffect(() => {
    // 檢查登入狀態
    const token = getToken()
    setIsLoggedIn(!!token)
    
    if (token) {
      fetchMyTickets()
    }
  }, [])

  const fetchMyTickets = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const response = await fetch('/api/support/my-tickets', {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
      const token = getToken()
      
      // 如果有附件，使用 FormData；否則使用 JSON
      let response: Response
      
      if (selectedFiles.length > 0) {
        // 使用 FormData 上傳附件
        const formData = new FormData()
        formData.append('subject', createForm.subject)
        formData.append('body', createForm.body)
        formData.append('category', createForm.category)
        formData.append('priority', createForm.priority)
        if (!isLoggedIn) {
          formData.append('email', createForm.email || '')
        }
        
        // 添加附件
        selectedFiles.forEach((file, index) => {
          formData.append(`attachments`, file)
        })

        const headers: Record<string, string> = {}
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        response = await fetch('/api/support/tickets', {
          method: 'POST',
          headers,
          body: formData
        })
      } else {
        // 沒有附件，使用 JSON
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        response = await fetch('/api/support/tickets', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...createForm,
            email: isLoggedIn ? undefined : createForm.email
          })
        })
      }

      if (response.ok) {
        const data = await response.json()
        
        // 重置表單和附件
        setCreateForm({
          subject: '',
          body: '',
          category: 'other',
          priority: 'medium',
          email: ''
        })
        setSelectedFiles([])
        setCreateStep(1)
        
        // 顯示成功訊息（採用後端新回應欄位）
        const ticketId = data.ticket_id || data.public_id || data.id
        const subject = data.subject || createForm.subject
        const status = data.status || 'open'
        const category = data.category || createForm.category

        const successMsg = isLoggedIn 
          ? `✅ 支援單已成功建立！\n\n📋 工單編號：#${ticketId}\n• 狀態：${status === 'open' ? '已開啟' : status}\n• 分類：${category}\n\n您可以在工單列表中查看進度。`
          : `✅ 支援單已建立！\n\n📋 工單編號：#${ticketId}\n• 狀態：${status === 'open' ? '已開啟' : status}\n• 分類：${category}\n\n請記住您的工單編號以便日後追蹤。`;
        
        alert(successMsg)
        
        // 如果已登入，重新載入支援單列表
        if (isLoggedIn) {
          setCurrentView('list')
          fetchMyTickets()
        } else {
          // 訪客：導向追蹤頁面（有 guest_token 則帶 sig）
          if (data.guest_token) {
            window.location.href = `/support/track?ticket=${encodeURIComponent(String(ticketId))}&sig=${encodeURIComponent(data.guest_token)}`
          } else {
            setCurrentView('track')
          }
        }
      } else {
        const errorData = await response.json().catch(()=>({}))
        throw new Error(errorData?.msg || errorData?.error || '建立支援單失敗')
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
      {/* 手機安全區域留空 */}
      <div className="pt-safe-top" />
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {currentView !== 'list' && (
            <button
              onClick={() => setCurrentView('list')}
              className="p-3 hover:bg-surface-2 rounded-lg transition-colors touch-manipulation active:scale-95"
              type="button"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-fg">
            {currentView === 'list' && '我的支援'}
            {currentView === 'create' && '提交支援單'}
            {currentView === 'track' && '追蹤支援單'}
          </h1>
        </div>
        
        {currentView === 'list' && (
          <button
            onClick={fetchMyTickets}
            disabled={loading}
            className="p-3 hover:bg-surface-2 rounded-lg transition-colors disabled:opacity-50 touch-manipulation active:scale-95"
            type="button"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  )

  const renderBottomNav = () => (
    <div className="sticky bottom-0 bg-surface/80 backdrop-blur-md border-t border-border">
      <div className="flex items-center justify-around py-3">
        <button
          onClick={() => {
            setCurrentView('list')
            setError(null) // 清除錯誤
          }}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all duration-200 touch-manipulation active:scale-95 ${
            currentView === 'list' ? 'text-primary bg-primary/10' : 'text-muted hover:text-fg hover:bg-surface-hover'
          }`}
          type="button"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs font-medium">我的支援單</span>
        </button>
        
        <button
          onClick={() => {
            setCurrentView('create')
            setError(null) // 清除錯誤
            setCreateStep(1) // 重置步驟
          }}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all duration-200 touch-manipulation active:scale-95 ${
            currentView === 'create' ? 'text-primary bg-primary/10' : 'text-muted hover:text-fg hover:bg-surface-hover'
          }`}
          type="button"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-medium">新支援單</span>
        </button>
        
        {!isLoggedIn && (
          <button
            onClick={() => {
              setCurrentView('track')
              setError(null) // 清除錯誤
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-all duration-200 touch-manipulation active:scale-95 ${
              currentView === 'track' ? 'text-primary bg-primary/10' : 'text-muted hover:text-fg hover:bg-surface-hover'
            }`}
            type="button"
          >
            <Search className="w-5 h-5" />
            <span className="text-xs font-medium">追蹤</span>
          </button>
        )}
      </div>
      {/* 手機底部安全區域留空 */}
      <div className="pb-safe-bottom" />
    </div>
  )

  const renderTicketList = () => (
    <div className="flex flex-col h-full">
      {/* 搜尋和篩選 */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <input
            type="text"
            placeholder="搜尋支援單..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg mobile-input text-base"
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
                  : 'bg-surface-hover text-muted hover:text-fg'
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
          <div className="mb-4 p-3 bg-danger-bg border border-danger-border rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-danger-text" />
              <span className="text-sm text-danger-text">{error}</span>
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
                  scope: '我的支援單',
                  updated_at: ticket.last_activity_at || ticket.created_at
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
          <div className="mb-4 p-3 bg-danger-bg border border-danger-border rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-danger-text" />
              <span className="text-sm text-danger-text">{error}</span>
            </div>
          </div>
        )}

        {/* 步驟指示器 */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3].map(step => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === createStep ? 'bg-primary text-primary-foreground' :
                step < createStep ? 'bg-success text-success-foreground' :
                'bg-surface-hover text-muted'
              }`}>
                {step < createStep ? <CheckCircle2 className="w-4 h-4" /> : step}
              </div>
              {step < 3 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  step < createStep ? 'bg-success' : 'bg-surface-hover'
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
                className="w-full p-3 border border-border rounded-lg"
              >
                <option value="technical">技術問題</option>
                <option value="account">帳戶問題</option>
                <option value="feature">功能建議</option>
                <option value="bug">錯誤回報</option>
                <option value="abuse">濫用檢舉</option>
                <option value="other">其他問題</option>
              </select>
            </div>



// ... (其他代碼)

    formData.append('subject', createForm.subject);
    formData.append('category', createForm.category);
    formData.append('body', createForm.body);

// ... (其他代碼)

        const successMessage = resp.ok && resp.ticket?.public_id
          ? `✅ 支援單已成功建立！\n\n📋 工單編號：#${resp.ticket?.public_id}\n\n您可以在工單列表中查看進度。`
          : `✅ 支援單已建立！\n\n📋 工單編號：#${resp.ticket?.public_id}\n\n請記住您的工單編號以便日後追蹤。`;

// ... (其他代碼)

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">分類</label>
                <select 
                  value={createForm.category}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, category: e.target.value }))}
                  className="support-input w-full"
                >
                  <option value="other">其他問題</option>
                  <option value="technical">技術問題</option>
                  <option value="account">帳戶問題</option>
                  <option value="feature">功能建議</option>
                  <option value="bug">錯誤回報</option>
                  <option value="abuse">濫用檢舉</option>
                </select>
              </div>

// ... (其他代碼)

              <div><strong>主旨：</strong>{createForm.subject}</div>
              <div><strong>分類：</strong>{createForm.category}</div>
              <div><strong>內容：</strong><pre className="whitespace-pre-wrap font-sans">{createForm.body}</pre></div>

            <div>
              <label className="block text-sm font-medium mb-2">問題主題</label>
              <input
                type="text"
                placeholder="請簡要描述您的問題"
                value={createForm.subject}
                onChange={(e) => setCreateForm(prev => ({ ...prev, subject: e.target.value }))}
                className="w-full p-3 border border-border rounded-lg mobile-input text-base"
                maxLength={500}
              />
                                 <p className="text-xs text-muted mt-1">{subjectLength}/500</p>
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
                className="w-full p-3 border border-border rounded-lg bg-surface resize-none mobile-input text-base"
                maxLength={10000}
              />
                                 <p className="text-xs text-muted mt-1">{bodyLength}/10000</p>
            </div>

            <div className="bg-info-bg border border-info-border p-3 rounded-lg">
              <h3 className="text-sm font-medium text-info-text mb-1">💡 提示</h3>
              <p className="text-xs text-info-text">
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
                  className="w-full p-3 border border-border rounded-lg mobile-input text-base"
                />
                <p className="text-xs text-muted mt-1">
                  我們會將支援單追蹤連結發送到這個 Email 地址
                </p>
              </div>
            )}

            {/* 附件上傳 */}
            <div>
              <label className="block text-sm font-medium mb-2">附件（可選）</label>
              <div 
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  isDragOver 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                  id="mobile-file-upload"
                />
                <label htmlFor="mobile-file-upload" className="cursor-pointer">
                  <Paperclip className="w-8 h-8 mx-auto mb-2 text-muted" />
                  <p className="text-sm text-muted mb-1">點擊上傳檔案或拖拽檔案到此處</p>
                  <p className="text-xs text-muted">支援圖片、PDF、Word 文件等格式，單檔最大 10MB</p>
                </label>
              </div>
              
              {/* 已選擇的檔案列表 */}
              {selectedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium">已選擇的檔案：</p>
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-surface-hover rounded-lg">
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-muted" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-muted">({formatFileSize(file.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface-hover p-4 rounded-lg">
              <h3 className="font-medium mb-2">支援單摘要</h3>
              <div className="space-y-2 text-sm text-muted">
                <div><strong>分類：</strong>{createForm.category}</div>
                <div><strong>優先級：</strong>{createForm.priority}</div>
                <div><strong>主題：</strong>{createForm.subject}</div>
                <div><strong>內容：</strong>{createForm.body.substring(0, 100)}...</div>
                {selectedFiles.length > 0 && (
                  <div><strong>附件：</strong>{selectedFiles.length} 個檔案</div>
                )}
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
              onClick={() => {
                setCreateStep(prev => prev - 1)
                setError(null) // 清除錯誤
              }}
              className="flex-1 py-4 border border-border rounded-lg text-center font-medium hover:bg-surface-hover transition-all duration-200 touch-manipulation active:scale-95 min-h-[44px]"
              type="button"
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
            className="flex-1 py-4 bg-primary text-primary-foreground rounded-lg text-center font-medium hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:scale-95 min-h-[44px]"
            type="button"
          >
            {submitLoading ? (
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>提交中...</span>
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
    <div className="max-w-md mx-auto p-6">
      <div className="bg-surface border border-border rounded-lg p-6 mobile-card w-full">
        <div className="text-center mb-6">
          <Search className="w-12 h-12 mx-auto text-muted mb-4" />
          <h1 className="text-xl font-bold mb-2">追蹤支援單</h1>
          <p className="text-muted">輸入支援單編號或 Email 來查看工單狀態</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger-bg border border-danger-border rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-danger-text" />
              <span className="text-sm text-danger-text">{error}</span>
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
              className="w-full p-3 border border-border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email 地址</label>
            <input
              type="email"
              placeholder="提交支援單時使用的 Email"
              value={trackForm.email}
              onChange={(e) => setTrackForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full p-3 border border-border rounded-lg"
            />
          </div>

          <button
            onClick={handleTrackTicket}
            disabled={submitLoading || !trackForm.ticket_id.trim() || !trackForm.email.trim()}
            className="w-full py-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation active:scale-95 min-h-[44px]"
            type="button"
          >
            {submitLoading ? (
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>追蹤中...</span>
              </div>
            ) : (
              '追蹤支援單'
            )}
          </button>
        </div>

        <div className="mt-6 p-4 bg-info-bg border border-info-border rounded-lg">
          <h3 className="text-sm font-medium text-info-text mb-2">如何找到支援單編號？</h3>
          <div className="text-xs text-info-text space-y-1">
            <p>• 建立支援單後會收到確認 Email，其中包含支援單編號</p>
            <p>• 支援單編號格式為 SUP-XXXXXX</p>
            <p>• Email 主旨通常包含支援單編號</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-background mobile-full-height">
      {renderTopBar()}
      
      <div className="flex-1 overflow-y-auto mobile-scroll-smooth">
        {currentView === 'list' && renderTicketList()}
        {currentView === 'create' && renderCreateForm()}
        {currentView === 'track' && renderTrackForm()}
      </div>

      {renderBottomNav()}
    </div>
  )
}
