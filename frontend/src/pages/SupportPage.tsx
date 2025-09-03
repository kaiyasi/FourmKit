import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'

// 將 Portal 提升為模組層級，避免每次父層重繪都被當成新元件而卸載/重建，導致輸入焦點丟失
function BodyPortal({ children }: { children: React.ReactNode }) {
  const elRef = useRef<HTMLDivElement | null>(null)
  if (!elRef.current && typeof document !== 'undefined') {
    elRef.current = document.createElement('div')
  }
  useEffect(() => {
    const el = elRef.current!
    document.body.appendChild(el)
    return () => { try { document.body.removeChild(el) } catch {} }
  }, [])
  return elRef.current ? createPortal(children, elRef.current) : null
}
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PageLayout } from '@/components/layout/PageLayout'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  MessageCircle, 
  Plus, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Eye,
  MessageSquare,
  Calendar,
  Tag,
  LogIn,
  ArrowLeft,
  Search,
  TrendingUp,
  Zap,
  Shield,
  FileText,
  Bug,
  Lightbulb,
  HelpCircle,
  UserX,
  Settings,
  ChevronRight,
  Filter,
  Paperclip
} from 'lucide-react'

interface Ticket {
  id: string
  subject: string
  status: string
  category: string
  priority: string
  created_at: string
  last_activity_at: string
  message_count: number
}

interface CreateTicketData {
  subject: string
  body: string
  category: string
  priority: string
  email?: string
}

export default function SupportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn, username } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Create ticket form state
  const [createForm, setCreateForm] = useState<CreateTicketData>({
    subject: '',
    body: '',
    category: 'other',
    priority: 'medium',
    email: ''
  })
  const [submitLoading, setSubmitLoading] = useState(false)
  
  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  // Track ticket form state for guests
  const [showTrackForm, setShowTrackForm] = useState(false)
  const [trackForm, setTrackForm] = useState({
    ticket_id: '',
    email: ''
  })
  const [trackLoading, setTrackLoading] = useState(false)

  // 使用 useMemo 優化字數計算，避免不必要的重新渲染
  const subjectLength = useMemo(() => createForm.subject.length, [createForm.subject])
  const bodyLength = useMemo(() => createForm.body.length, [createForm.body])

  useEffect(() => {
    // 處理預填資訊
    const urlParams = new URLSearchParams(location.search)
    const prefillParam = urlParams.get('prefill')
    
    if (prefillParam) {
      try {
        const prefillData = JSON.parse(decodeURIComponent(prefillParam))
        setCreateForm(prev => ({
          ...prev,
          subject: prefillData.title || prev.subject,
          body: prefillData.description || prev.body,
          category: prefillData.type === 'system_error' ? 'technical' : prev.category,
          priority: prefillData.error_code >= 500 ? 'high' : 'medium'
        }))
        
        // 自動顯示創建表單
        setShowCreateForm(true)
        
        // 清除 URL 參數
        navigate(location.pathname, { replace: true })
      } catch (error) {
        console.error('解析預填資訊失敗:', error)
      }
    }
    
    if (isLoggedIn) {
      fetchMyTickets()
    }
  }, [location.search, navigate, location.pathname, isLoggedIn])

  const fetchMyTickets = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
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

  // File handling functions
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    // 檢查檔案大小限制（10MB）
    const maxSize = 10 * 1024 * 1024 // 10MB
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        alert(`檔案 ${file.name} 超過 10MB 限制`)
        return false
      }
      return true
    })
    
    // 檢查檔案類型
    const allowedTypes = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/']
    const typeValidFiles = validFiles.filter(file => {
      const isValid = allowedTypes.some(type => file.type.startsWith(type))
      if (!isValid) {
        alert(`檔案 ${file.name} 格式不支援`)
        return false
      }
      return true
    })
    
    setSelectedFiles(prev => [...prev, ...typeValidFiles])
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
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
      const token = localStorage.getItem('token')
      let response: Response

      if (selectedFiles.length > 0) {
        const formData = new FormData()
        formData.append('subject', createForm.subject)
        formData.append('body', createForm.body)
        formData.append('category', createForm.category)
        formData.append('priority', createForm.priority)
        if (!isLoggedIn && createForm.email) formData.append('email', createForm.email)
        selectedFiles.forEach(file => formData.append('files', file))
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        response = await fetch('/api/support/tickets', { method: 'POST', headers, body: formData })
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        response = await fetch('/api/support/tickets', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...createForm,
            email: isLoggedIn ? undefined : createForm.email
          })
        })
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any))
        throw new Error((errorData as any).msg || '建立支援單失敗')
      }

      const data = await response.json()
      // 重置表單/檔案/視圖
      setCreateForm({ subject: '', body: '', category: 'other', priority: 'medium', email: '' })
      setSelectedFiles([])
      setShowCreateForm(false)

      // 已登入：直接導向該工單詳情（免等列表刷新）
      if (isLoggedIn) {
        try { localStorage.setItem('fk_last_ticket_id', String(data?.ticket?.id || '')) } catch {}
        navigate(`/support/ticket/${data.ticket.id}`)
        return
      }

      // 未登入（訪客）：若有 tracking_url 直接導向；否則顯示提示
      if (data?.tracking_url) {
        window.location.href = data.tracking_url
      } else {
        alert(`支援單已建立！\n支援單編號：${data.ticket.id}\n\n請記下此編號，您可以用它來追蹤處理進度。`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleTrackTicket = async () => {
    if (!trackForm.ticket_id.trim() && !trackForm.email.trim()) {
      setError('請填寫支援單編號或 Email')
      return
    }

    setTrackLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/support/guest/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ticket_id: trackForm.ticket_id.trim().toUpperCase(),
          email: trackForm.email.trim().toLowerCase()
        })
      })

      if (response.ok) {
        const data = await response.json()
        // 導向到工單詳情頁面
        window.location.href = data.tracking_url
      } else {
        const errorData = await response.json()
        throw new Error(errorData.msg || '查詢失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '查詢發生錯誤')
    } finally {
      setTrackLoading(false)
    }
  }

  const getStatusConfig = (status: string) => {
    const configs: { [key: string]: { bg: string; text: string; label: string; icon: any } } = {
      'open': { 
        bg: 'bg-blue-50 dark:bg-blue-900/20', 
        text: 'text-blue-700 dark:text-blue-300', 
        label: '進行中',
        icon: TrendingUp
      },
      'awaiting_admin': { 
        bg: 'bg-orange-50 dark:bg-orange-900/20', 
        text: 'text-orange-700 dark:text-orange-300', 
        label: '等待回覆',
        icon: Clock
      },
      'awaiting_user': { 
        bg: 'bg-amber-50 dark:bg-amber-900/20', 
        text: 'text-amber-700 dark:text-amber-300', 
        label: '需要回覆',
        icon: MessageCircle
      },
      'resolved': { 
        bg: 'bg-emerald-50 dark:bg-emerald-900/20', 
        text: 'text-emerald-700 dark:text-emerald-300', 
        label: '已解決',
        icon: CheckCircle2
      },
      'closed': { 
        bg: 'bg-gray-50 dark:bg-gray-900/20', 
        text: 'text-gray-700 dark:text-gray-300', 
        label: '已關閉',
        icon: X
      }
    }
    return configs[status] || configs['open']
  }

  const getCategoryConfig = (category: string) => {
    const configs: { [key: string]: { icon: any; label: string; color: string } } = {
      'technical': { icon: Settings, label: '技術問題', color: 'text-blue-600 dark:text-blue-400' },
      'account': { icon: Shield, label: '帳戶問題', color: 'text-purple-600 dark:text-purple-400' },
      'feature': { icon: Lightbulb, label: '功能建議', color: 'text-green-600 dark:text-green-400' },
      'bug': { icon: Bug, label: '錯誤回報', color: 'text-red-600 dark:text-red-400' },
      'abuse': { icon: UserX, label: '濫用檢舉', color: 'text-orange-600 dark:text-orange-400' },
      'other': { icon: HelpCircle, label: '其他問題', color: 'text-gray-600 dark:text-gray-400' }
    }
    return configs[category] || configs['other']
  }

  const getPriorityConfig = (priority: string) => {
    const configs: { [key: string]: { color: string; label: string; dot: string } } = {
      'low': { color: 'text-green-600 dark:text-green-400', label: '低', dot: 'bg-green-500' },
      'medium': { color: 'text-yellow-600 dark:text-yellow-400', label: '中', dot: 'bg-yellow-500' },
      'high': { color: 'text-orange-600 dark:text-orange-400', label: '高', dot: 'bg-orange-500' },
      'urgent': { color: 'text-red-600 dark:text-red-400', label: '緊急', dot: 'bg-red-500' }
    }
    return configs[priority] || configs['medium']
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) {
      return '今天 ' + date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 2) {
      return '昨天 ' + date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays <= 7) {
      return `${diffDays}天前`
    } else {
      return date.toLocaleDateString('zh-TW')
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus
    const matchesSearch = !searchQuery || 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesStatus && matchesSearch
  })

  // 手機版佈局（記憶化，避免無關狀態更新時重繪）
  const mobileLayout = useMemo(() => (
    <PageLayout pathname="/support" maxWidth="max-w-3xl">
      {/* 手機版標題區（使用 PageLayout 的動態留白，額外加些呼吸感） */}
      <div className="pt-4 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-surface-hover rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">支援中心</h1>
            <p className="text-sm text-muted">
              {isLoggedIn ? "管理您的支援請求" : "提交問題或追蹤進度"}
            </p>
          </div>
        </div>
        
        {/* 手機版快速操作 */}
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center justify-between p-4 bg-surface border border-border rounded-2xl shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium text-fg">提交新問題</div>
                <div className="text-sm text-muted">快速獲得協助</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted" />
          </button>
          
          {!isLoggedIn && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowTrackForm(true)}
                className="flex items-center justify-center gap-2 p-4 bg-surface border border-border rounded-2xl shadow-soft"
              >
                <Eye className="w-4 h-4" />
                <span className="font-medium">追蹤支援單</span>
              </button>
              <button
                onClick={() => navigate('/auth')}
                className="flex items-center justify-center gap-2 p-4 bg-surface border border-border rounded-2xl shadow-soft"
              >
                <LogIn className="w-4 h-4" />
                <span className="font-medium">登入管理</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 手機版支援單列表 */}
      {isLoggedIn && (
        <div>
          {/* 搜尋和篩選 */}
          <div className="flex gap-3 mb-4">
                        <div className="flex-1 relative">
              <input
                id="search_query"
                name="search_query"
                type="text"
                placeholder="搜尋支援單..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
              />
            </div>
            <button className="p-3 bg-surface border border-border rounded-xl">
              <Filter className="w-4 h-4" />
            </button>
            <button 
              onClick={fetchMyTickets}
              disabled={loading}
              className="p-3 bg-surface border border-border rounded-xl"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* 支援單卡片 */}
          <div className="space-y-3 pb-24">
            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted" />
                <p className="text-muted">
                  {tickets.length === 0 ? '尚無支援單' : '無符合條件的支援單'}
                </p>
              </div>
            ) : (
              filteredTickets.map(ticket => {
                const statusConfig = getStatusConfig(ticket.status)
                const categoryConfig = getCategoryConfig(ticket.category)
                const priorityConfig = getPriorityConfig(ticket.priority)
                const StatusIcon = statusConfig.icon
                const CategoryIcon = categoryConfig.icon
                
                return (
                                     <div
                     key={ticket.id}
                     className="bg-surface border border-border rounded-2xl p-4 shadow-soft active:scale-[0.98] transition-transform"
                     onClick={() => navigate(`/support/ticket/${ticket.id}`)}
                   >
                    {/* 狀態和優先級 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig.bg}`}>
                        <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.text}`} />
                        <span className={`text-xs font-medium ${statusConfig.text}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${priorityConfig.dot}`} />
                        <span className={`text-xs ${priorityConfig.color}`}>
                          {priorityConfig.label}優先級
                        </span>
                      </div>
                    </div>
                    
                    {/* 標題 */}
                    <h3 className="font-medium text-base mb-2 line-clamp-2">
                      {ticket.subject}
                    </h3>
                    
                    {/* 資訊列 */}
                    <div className="flex items-center justify-between text-xs text-muted">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <CategoryIcon className={`w-3.5 h-3.5 ${categoryConfig.color}`} />
                          <span>{categoryConfig.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{ticket.message_count}</span>
                        </div>
                      </div>
                      <span>#{ticket.id.slice(-6)}</span>
                    </div>
                    
                    {/* 時間 */}
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">最後活動</span>
                        <span className="font-medium">{formatDate(ticket.last_activity_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </PageLayout>
  ), [isLoggedIn, searchQuery, filterStatus, loading, tickets, filteredTickets])

  // 電腦版佈局（記憶化，避免無關狀態更新時重繪）
  const desktopLayout = useMemo(() => (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/support" />
      <MobileBottomNav />
      
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-12">
        {/* 電腦版標題區 */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="p-3 hover:bg-surface-hover rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold">支援中心</h1>
              <p className="text-muted mt-2">
                {isLoggedIn ? "管理您的支援請求和獲得專業協助" : "提交問題、追蹤進度，獲得快速回應"}
              </p>
            </div>
          </div>
          
          {/* 電腦版快速操作卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div 
              onClick={() => setShowCreateForm(true)}
              className="bg-surface border border-border text-fg rounded-2xl p-6 cursor-pointer hover:shadow-lg transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 text-primary rounded-xl group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">提交新問題</h3>
                  <p className="text-sm text-muted">快速獲得專業協助</p>
                </div>
              </div>
            </div>
            
            {!isLoggedIn && (
              <>
                <div 
                  onClick={() => setShowTrackForm(true)}
                  className="bg-surface border border-border text-fg rounded-2xl p-6 cursor-pointer hover:shadow-lg transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-110 transition-transform">
                      <Eye className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">追蹤支援單</h3>
                      <p className="text-sm text-muted">查看問題處理進度</p>
                    </div>
                  </div>
                </div>
                
                <div 
                  onClick={() => navigate('/auth')}
                  className="bg-surface border border-border text-fg rounded-2xl p-6 cursor-pointer hover:shadow-lg transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl group-hover:scale-110 transition-transform">
                      <LogIn className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">登入管理</h3>
                      <p className="text-sm text-muted">統一管理所有支援單</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 電腦版支援單管理 */}
        {isLoggedIn && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 左側：支援單列表 */}
            <div className="lg:col-span-2">
              <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
                {/* 搜尋和操作列 */}
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <h2 className="text-xl font-semibold flex-1">我的支援單</h2>
                    <button 
                      onClick={fetchMyTickets}
                      disabled={loading}
                      className="p-2 hover:bg-surface-hover rounded-xl transition-colors"
                    >
                      <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  
                  <div className="flex gap-3">
                                        <div className="flex-1 relative">
                      <input
                        id="desktop_search_query"
                        name="desktop_search_query"
                        type="text"
                        placeholder="搜尋支援單標題或編號..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
                      />
                    </div>
                                                                                   <select
                        id="filter_status"
                        name="filter_status"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
                      >
                      <option value="all">全部狀態</option>
                      <option value="open">進行中</option>
                      <option value="awaiting_user">需要回覆</option>
                      <option value="awaiting_admin">等待回覆</option>
                      <option value="resolved">已解決</option>
                      <option value="closed">已關閉</option>
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
                        {tickets.length === 0 ? '尚無支援單' : '無符合條件的支援單'}
                      </h3>
                      <p className="text-sm text-muted">
                        {tickets.length === 0 ? '點擊上方「提交新問題」來建立您的第一個支援單' : '試著調整搜尋條件'}
                      </p>
                    </div>
                  ) : (
                    filteredTickets.map(ticket => {
                      const statusConfig = getStatusConfig(ticket.status)
                      const categoryConfig = getCategoryConfig(ticket.category)
                      const priorityConfig = getPriorityConfig(ticket.priority)
                      const StatusIcon = statusConfig.icon
                      const CategoryIcon = categoryConfig.icon
                      
                      return (
                                                 <div
                           key={ticket.id}
                           className="p-6 cursor-pointer transition-colors hover:bg-surface-hover"
                           onClick={() => navigate(`/support/ticket/${ticket.id}`)}
                         >
                          {/* 狀態和編號 */}
                          <div className="flex items-center justify-between mb-3">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig.bg}`}>
                              <StatusIcon className={`w-4 h-4 ${statusConfig.text}`} />
                              <span className={`text-sm font-medium ${statusConfig.text}`}>
                                {statusConfig.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <div className={`w-2.5 h-2.5 rounded-full ${priorityConfig.dot}`} />
                                <span className={`text-sm ${priorityConfig.color}`}>
                                  {priorityConfig.label}
                                </span>
                              </div>
                              <span className="text-sm text-muted font-mono">
                                #{ticket.id.slice(-6)}
                              </span>
                            </div>
                          </div>
                          
                          {/* 標題 */}
                          <h3 className="font-medium text-lg mb-3 line-clamp-1">
                            {ticket.subject}
                          </h3>
                          
                          {/* 資訊列 */}
                          <div className="flex items-center justify-between text-sm text-muted">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <CategoryIcon className={`w-4 h-4 ${categoryConfig.color}`} />
                                <span>{categoryConfig.label}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <MessageSquare className="w-4 h-4" />
                                <span>{ticket.message_count} 回覆</span>
                              </div>
                            </div>
                            <span>{formatDate(ticket.last_activity_at)}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* 右側：統計和快速操作 */}
            <div className="space-y-6">
              {/* 統計卡片 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <h3 className="font-semibold mb-4">支援單概覽</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">總計</span>
                    <span className="font-medium">{tickets.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">進行中</span>
                    <span className="font-medium text-blue-600">
                      {tickets.filter(t => t.status === 'open').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">等待回覆</span>
                    <span className="font-medium text-orange-600">
                      {tickets.filter(t => t.status === 'awaiting_admin').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">已解決</span>
                    <span className="font-medium text-green-600">
                      {tickets.filter(t => t.status === 'resolved').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* 快速操作 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <h3 className="font-semibold mb-4">快速操作</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-hover rounded-xl transition-colors"
                  >
                    <Plus className="w-5 h-5 text-primary" />
                    <span>提交新問題</span>
                  </button>
                  <button
                    onClick={() => setFilterStatus('awaiting_user')}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-hover rounded-xl transition-colors"
                  >
                    <MessageCircle className="w-5 h-5 text-amber-600" />
                    <span>需要我回覆的</span>
                  </button>
                  <button
                    onClick={() => setFilterStatus('open')}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-hover rounded-xl transition-colors"
                  >
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    <span>進行中的問題</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

             {/* 創建工單對話框 */}
      {showCreateForm && (
        <BodyPortal>
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4" onMouseDown={e=>e.stopPropagation()}>
           <div className="bg-surface border border-border rounded-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-semibold">提交新支援單</h2>
                <p className="text-sm text-muted mt-1">詳細描述您的問題，我們會盡快回覆</p>
              </div>
              <button
                onClick={() => setShowCreateForm(false)}
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

                         <div className="p-6 space-y-6">
               {/* 問題主題 */}
               <div>
                 <label className="block text-sm font-medium mb-3">問題主題</label>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    placeholder="請用一句話簡要描述您的問題"
                    autoFocus
                    value={createForm.subject}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="form-control text-base"
                    maxLength={200}
                  />
                 <div className="flex justify-between items-center mt-2">
                   <p className="text-xs text-muted">簡潔明確的標題有助於更快獲得回覆</p>
                   <p className="text-xs text-muted">{subjectLength}/200</p>
                 </div>
               </div>

               {/* Email 欄位 - 僅未登入用戶顯示 */}
               {!isLoggedIn && (
                 <div>
                   <label className="block text-sm font-medium mb-3">
                     聯絡 Email <span className="text-red-500">*</span>
                   </label>
                  <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={createForm.email}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                      className="form-control text-base"
                      required={!isLoggedIn}
                    />
                   <p className="text-xs text-muted mt-2">
                     我們會將支援單編號和處理進度發送到此 Email
                   </p>
                 </div>
               )}

               {/* 問題詳情 */}
               <div>
                 <label className="block text-sm font-medium mb-3">問題詳情</label>
                  <textarea
                    id="body"
                    name="body"
                    placeholder="請詳細描述您遇到的問題：&#10;&#10;• 具體的錯誤訊息&#10;• 重現問題的步驟&#10;• 您期望的結果&#10;• 相關的螢幕截圖或錯誤代碼"
                    rows={8}
                    value={createForm.body}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, body: e.target.value }))}
                    className="form-control text-base resize-none min-h-[160px]"
                    maxLength={5000}
                  />
                 <div className="flex justify-between items-center mt-2">
                   <p className="text-xs text-muted">詳細的描述能幫助我們更準確地診斷問題</p>
                   <p className="text-xs text-muted">{bodyLength}/5000</p>
                 </div>
               </div>

               {/* 附件上傳 */}
               <div>
                 <label className="block text-sm font-medium mb-3">附件（可選）</label>
                 <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                   <input
                     type="file"
                     multiple
                     accept="image/*,.pdf,.doc,.docx,.txt"
                     onChange={handleFileChange}
                     className="hidden"
                     id="file-upload"
                   />
                   <label htmlFor="file-upload" className="cursor-pointer">
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
                           className="text-red-500 hover:text-red-700"
                         >
                           <X className="w-4 h-4" />
                         </button>
                       </div>
                     ))}
                   </div>
                 )}
               </div>


              {/* 錯誤顯示 */}
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
                  </div>
                </div>
              )}

              {/* 操作按鍵 */}
              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-4 px-6 bg-surface border border-border text-fg rounded-xl font-medium hover:bg-surface-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateTicket}
                  disabled={submitLoading || !createForm.subject.trim() || !createForm.body.trim()}
                  className="flex-1 py-4 px-6 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      提交中...
                    </div>
                  ) : (
                    '提交支援單'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        </BodyPortal>
      )}

      {/* 追蹤支援單對話框 */}
      {showTrackForm && (
        <BodyPortal>
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4" onMouseDown={e=>e.stopPropagation()}>
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-semibold">追蹤支援單</h2>
                <p className="text-sm text-muted mt-1">輸入編號或Email查看處理進度</p>
              </div>
              <button
                onClick={() => setShowTrackForm(false)}
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3">支援單編號</label>
                                 <input
                   id="ticket_id"
                   name="ticket_id"
                   type="text"
                   placeholder="SUP-ABC123"
                   value={trackForm.ticket_id}
                   onChange={(e) => setTrackForm(prev => ({ ...prev, ticket_id: e.target.value }))}
                   className="w-full p-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg font-mono"
                 />
                <p className="text-xs text-muted mt-2">請輸入支援單編號（可選）</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3">聯絡 Email</label>
                                                   <input
                    id="track_email"
                    name="track_email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={trackForm.email}
                    onChange={(e) => setTrackForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-4 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
                  />
                <p className="text-xs text-muted mt-2">請輸入提交支援單時使用的Email（可選）</p>
              </div>

              {/* 錯誤顯示 */}
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowTrackForm(false)}
                  className="flex-1 py-4 px-6 bg-surface border border-border text-fg rounded-xl font-medium hover:bg-surface-hover transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleTrackTicket}
                  disabled={trackLoading || (!trackForm.ticket_id.trim() && !trackForm.email.trim())}
                  className="flex-1 py-4 px-6 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {trackLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      查詢中...
                    </div>
                  ) : (
                    '查詢支援單'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        </BodyPortal>
      )}
    </div>
  ), [isLoggedIn, searchQuery, filterStatus, loading, tickets, filteredTickets])

  // 根據螢幕尺寸選擇佈局
  return (
    <>
      {/* 手機版 */}
      <div className="block lg:hidden">{mobileLayout}</div>
      
      {/* 電腦版 */}
      <div className="hidden lg:block">{desktopLayout}</div>
    </>
  )
}
