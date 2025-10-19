import React, { useState, useEffect } from 'react'
import {
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Type,
  FileText,
  Plus,
  X,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Clock,
  Send,
  User,
  XCircle,
  ArrowLeft,
  Filter,
  Server,
  Zap
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface FontFile {
  id: number
  font_family: string
  display_name: string
  description?: string
  filename: string
  file_size: number
  file_format: string
  is_chinese_supported: boolean
  weight: string
  style: string
  is_active: boolean
  is_system_font: boolean
  usage_count: number
  created_at: string
  last_used_at?: string
  file_exists: boolean
}

interface FontRequest {
  id: number
  font_name: string
  description: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requester: {
    id: number
    username: string
    school_name?: string
  }
  reviewer?: {
    id: number
    username: string
  }
  created_at: string
  reviewed_at?: string
  review_reason?: string
}

interface FontManagementProps {
  isOpen: boolean
  onClose: () => void
}

export default function FontManagement({ isOpen, onClose }: FontManagementProps) {
  const { role } = useAuth()
  const isDev = role === 'dev_admin'
  const isCampus = role === 'campus_admin'
  const isCross = role === 'cross_admin'

  const [fonts, setFonts] = useState<FontFile[]>([])
  const [requests, setRequests] = useState<FontRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [previewFont, setPreviewFont] = useState<FontFile | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('這是字體預覽文字 ABC 123')
  const [previewSize, setPreviewSize] = useState(32)
  const [previewBackground, setPreviewBackground] = useState('#ffffff')
  const [previewTextColor, setPreviewTextColor] = useState('#333333')
  const [previewSample, setPreviewSample] = useState('custom')

  const fontSamples = {
    custom: previewText,
    chinese: '這是中文字體測試，包含繁體與簡體字。',
    english: 'The quick brown fox jumps over the lazy dog.',
    numbers: '0123456789 +-*/=%$@#&()[]{}',
    mixed: '混合測試 Mixed Test 123 ！？@#$',
    lorem: '在這個美麗的世界裡，我們用最好的字體展現文字之美。Typography matters in design.'
  }
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({})
  const [selectedRequest, setSelectedRequest] = useState<FontRequest | null>(null)
  const [selectedFont, setSelectedFont] = useState<FontFile | null>(null)

  // 過濾器狀態
  const [filters, setFilters] = useState({
    view: 'fonts' as 'fonts' | 'requests',
    status: 'all' as 'all' | 'active' | 'inactive',
    type: 'all' as 'all' | 'chinese' | 'system'
  })

  // 表單狀態
  const [uploadForm, setUploadForm] = useState({
    font_file: null as File | null,
    font_family: '',
    display_name: '',
    description: '',
    is_chinese_supported: false,
    weight: 'normal',
    style: 'normal'
  })

  const [requestForm, setRequestForm] = useState({
    font_name: '',
    description: '',
    reason: ''
  })

  useEffect(() => {
    if (isOpen) {
      fetchFonts()
      if (isDev || isCampus) fetchRequests()
    }
  }, [isOpen])

  const fetchFonts = async () => {
    try {
      const response = await fetch('/api/admin/fonts/list', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        console.error('獲取字體列表 HTTP 失敗:', response.status, response.statusText)
        setFonts([])
        return
      }

      const result = await response.json()
      console.log('字體列表 API 回應:', result)

      if (result.success) {
        // 修復：API 回應結構是 result.data.fonts
        const fontList = result.data?.fonts || result.fonts || []
        setFonts(fontList)
        console.log('設定字體列表:', fontList.length, '個字體')
        console.log('字體資料:', fontList)
      } else {
        console.error('獲取字體列表失敗:', result.error || result.message)
        setFonts([])
      }
    } catch (error) {
      console.error('獲取字體列表失敗:', error)
      setFonts([])
    } finally {
      setLoading(false)
    }
  }

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/admin/fonts/requests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const result = await response.json()
      if (result.success) {
        setRequests(result.requests || [])
      }
    } catch (error) {
      console.error('獲取字體申請失敗:', error)
      setRequests([])
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const fileName = file.name.split('.')[0]
      setUploadForm(prev => ({
        ...prev,
        font_file: file,
        font_family: prev.font_family || fileName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        display_name: prev.display_name || fileName
      }))
    }
  }

  const handleUpload = async () => {
    if (!uploadForm.font_file) {
      alert('請選擇字體檔案')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('font_file', uploadForm.font_file)
      formData.append('font_family', uploadForm.font_family)
      formData.append('display_name', uploadForm.display_name)
      formData.append('description', uploadForm.description)
      formData.append('is_chinese_supported', uploadForm.is_chinese_supported.toString())
      formData.append('weight', uploadForm.weight)
      formData.append('style', uploadForm.style)

      const response = await fetch('/api/admin/fonts/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      if (!response.ok) {
        // 如果響應不是 2xx，嘗試解析錯誤信息
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorResult = await response.json()
          errorMessage = errorResult.error || errorResult.message || errorMessage
        } catch {
          // 如果解析 JSON 失敗，使用原始錯誤信息
        }
        alert(`上傳失敗: ${errorMessage}`)
        console.error('Upload failed:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        })
        return
      }

      const result = await response.json()
      if (result.success) {
        alert('字體上傳成功！')
        setShowUploadForm(false)
        setUploadForm({
          font_file: null,
          font_family: '',
          display_name: '',
          description: '',
          is_chinese_supported: false,
          weight: 'normal',
          style: 'normal'
        })
        fetchFonts()
      } else {
        alert(`上傳失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('字體上傳失敗:', error)
      alert('字體上傳失敗，請稍後再試')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmitRequest = async () => {
    if (!requestForm.font_name.trim() || !requestForm.reason.trim()) {
      alert('請填寫字體名稱和申請理由')
      return
    }

    try {
      const response = await fetch('/api/admin/fonts/requests', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestForm)
      })

      const result = await response.json()
      if (result.success) {
        alert('字體申請已提交，等待審核')
        setShowRequestForm(false)
        setRequestForm({
          font_name: '',
          description: '',
          reason: ''
        })
        fetchRequests()
      } else {
        alert(`申請失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('字體申請失敗:', error)
      alert('字體申請失敗，請稍後再試')
    }
  }

  const handleToggleStatus = async (fontId: number) => {
    const loadingKey = `toggle-${fontId}`
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }))

    try {
      const response = await fetch(`/api/admin/fonts/${fontId}/toggle`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const result = await response.json()
      if (result.success) {
        fetchFonts()
      } else {
        alert(`操作失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('切換字體狀態失敗:', error)
      alert('操作失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleDeleteFont = async (fontId: number, displayName: string) => {
    if (!confirm(`確定要刪除字體 "${displayName}" 嗎？此操作無法恢復。`)) {
      return
    }

    const loadingKey = `delete-${fontId}`
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }))

    try {
      const response = await fetch(`/api/admin/fonts/${fontId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const result = await response.json()
      if (result.success) {
        alert('字體刪除成功')
        fetchFonts()
      } else {
        alert(`刪除失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('字體刪除失敗:', error)
      alert('刪除失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleRequestAction = async (requestId: number, action: 'approve' | 'reject', reason?: string) => {
    const loadingKey = `request-${action}-${requestId}`
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }))

    try {
      const response = await fetch(`/api/admin/fonts/requests/${requestId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      })

      const result = await response.json()
      if (result.success) {
        alert(`申請已${action === 'approve' ? '核准' : '拒絕'}`)
        fetchRequests()
        setSelectedRequest(null)
      } else {
        alert(`操作失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('處理申請失敗:', error)
      alert('操作失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handlePreviewFont = async (font: FontFile) => {
    setPreviewFont(font)
    setPreviewImage(null)

    try {
      const response = await fetch(`/api/admin/fonts/${font.id}/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: previewText,
          font_size: 32
        })
      })

      const result = await response.json()
      if (result.success) {
        setPreviewImage(result.preview_image)
      } else {
        alert(`預覽失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('字體預覽失敗:', error)
      alert('預覽失敗，請稍後再試')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 過濾字體和申請
  const filteredFonts = (fonts || []).filter(font => {
    if (filters.status !== 'all') {
      if (filters.status === 'active' && !font.is_active) return false
      if (filters.status === 'inactive' && font.is_active) return false
    }
    if (filters.type !== 'all') {
      if (filters.type === 'chinese' && !font.is_chinese_supported) return false
      if (filters.type === 'system' && !font.is_system_font) return false
    }
    return true
  })

  const filteredRequests = (requests || []).filter(request => {
    // 可以添加更多過濾條件
    return true
  })

  if (!isOpen) return null

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁面標題 - 比照審核管理 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text flex items-center gap-3">
                <Type className="w-6 h-6 text-primary" />
                字體管理
                {isCross && <span className="text-xs px-2 py-1 bg-muted text-muted rounded-full">唯讀模式</span>}
              </h1>
              <p className="text-sm text-muted mt-1">
                {isDev && '管理系統字體檔案，支援模板圖片生成'}
                {isCampus && '申請新字體與檢視可用字體'}
                {isCross && '檢視可用字體列表'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  fetchFonts()
                  if (isDev || isCampus) fetchRequests()
                }}
                className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted hover:bg-opacity-50 transition-colors"
                title="重新載入"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              {isDev && (
                <button
                  onClick={() => setShowUploadForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary hover:bg-opacity-90 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">上傳字體</span>
                </button>
              )}

              {isCampus && (
                <button
                  onClick={() => setShowRequestForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary hover:bg-opacity-90 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">申請字體</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主內容區 - 字體列表/申請列表 */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                {filters.view === 'fonts' ? <Type className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                {filters.view === 'fonts' ? '字體列表' : '申請列表'}
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>

              {/* 視圖切換 */}
              {(isDev || isCampus) && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, view: 'fonts' }))}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      filters.view === 'fonts'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:text-fg hover:bg-surface-hover'
                    }`}
                  >
                    字體
                  </button>
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, view: 'requests' }))}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      filters.view === 'requests'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:text-fg hover:bg-surface-hover'
                    }`}
                  >
                    申請
                    {(requests || []).filter(r => r.status === 'pending').length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-danger text-danger-foreground text-xs rounded-full">
                        {(requests || []).filter(r => r.status === 'pending').length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* 過濾器 - 比照審核管理 */}
            {filters.view === 'fonts' && (
              <div className="mb-4 p-3 bg-surface-hover rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <select
                    className="form-control form-control--compact flex-1"
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                  >
                    <option value="all">所有狀態</option>
                    <option value="active">已啟用</option>
                    <option value="inactive">已停用</option>
                  </select>
                  <select
                    className="form-control form-control--compact flex-1"
                    value={filters.type}
                    onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as any }))}
                  >
                    <option value="all">所有類型</option>
                    <option value="chinese">中文字體</option>
                    <option value="system">系統字體</option>
                  </select>
                  <div className="text-xs text-muted flex items-center">
                    共 {filteredFonts?.length || 0} 個字體
                  </div>
                </div>
              </div>
            )}

            {/* 內容列表 */}
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                  載入中...
                </div>
              ) : filters.view === 'fonts' ? (
                filteredFonts.length === 0 ? (
                  <div className="text-center py-8 text-muted">
                    {filters.status === 'all' && filters.type === 'all'
                      ? '尚未上傳任何字體檔案'
                      : '沒有符合條件的字體'}
                  </div>
                ) : (
                  filteredFonts.map((font) => (
                    <div
                      key={font.id}
                      className={`p-4 rounded-xl border border-border cursor-pointer transition-colors ${
                        selectedFont?.id === font.id
                          ? 'ring-2 ring-primary'
                          : 'bg-surface-hover hover:bg-surface'
                      }`}
                      onClick={() => setSelectedFont(font)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            font.is_active
                              ? 'bg-success-bg text-success-text'
                              : 'bg-surface-hover text-muted'
                          }`}>
                            {font.is_active ? '已啟用' : '已停用'}
                          </span>
                          {font.is_chinese_supported && (
                            <span className="text-xs px-2 py-1 bg-info-bg text-info-text rounded-full">
                              中文
                            </span>
                          )}
                          {font.is_system_font && (
                            <span className="text-xs px-2 py-1 bg-accent text-surface rounded-full">
                              系統
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {formatDate(font.created_at)}
                        </span>
                      </div>

                      <div className="mb-2">
                        <h3 className="font-semibold text-lg text-fg mb-1">{font.display_name}</h3>
                        <code className="text-sm text-muted bg-surface px-2 py-1 rounded">
                          {font.font_family}
                        </code>
                      </div>

                      <div className="text-sm text-muted">
                        {font.filename} • {formatFileSize(font.file_size)} • {font.file_format.toUpperCase()}
                      </div>

                      {font.description && (
                        <div className="mt-2 text-sm text-muted">{font.description}</div>
                      )}
                    </div>
                  ))
                )
              ) : (
                filteredRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted">
                    尚無字體申請
                  </div>
                ) : (
                  filteredRequests.map((request) => (
                    <div
                      key={request.id}
                      className={`p-4 rounded-xl border border-border cursor-pointer transition-colors ${
                        selectedRequest?.id === request.id
                          ? 'ring-2 ring-primary'
                          : request.status === 'pending'
                            ? 'bg-surface border-primary border-opacity-20 hover:bg-primary hover:bg-opacity-5'
                            : 'bg-surface-hover border-border hover:bg-surface'
                      }`}
                      onClick={() => setSelectedRequest(request)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            request.status === 'pending' ? 'bg-warning-bg text-warning-text' :
                            request.status === 'approved' ? 'bg-success-bg text-success-text' :
                            'bg-danger-bg text-danger-text'
                          }`}>
                            {request.status === 'pending' ? '待審核' :
                             request.status === 'approved' ? '已核准' : '已拒絕'}
                          </span>
                          {request.requester.school_name && (
                            <span className="text-xs px-2 py-1 bg-primary bg-opacity-10 text-primary rounded-full">
                              {request.requester.school_name}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {formatDate(request.created_at)}
                        </span>
                      </div>

                      <div className="mb-2">
                        <h3 className="font-semibold text-lg text-fg mb-1">{request.font_name}</h3>
                        <div className="text-sm text-muted line-clamp-2">{request.reason}</div>
                      </div>

                      {isDev && (
                        <div className="text-xs text-muted">
                          申請人: {request.requester.username}
                          {request.requester.school_name && ` (${request.requester.school_name})`}
                        </div>
                      )}
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          {/* 右側邊欄 - 詳情和統計 */}
          <div className="space-y-6">
            {/* 選中項目詳情 */}
            {(selectedFont || selectedRequest) && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">
                  {selectedFont ? '字體詳情' : '申請詳情'}
                </h3>

                {selectedFont ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-fg text-lg">{selectedFont.display_name}</h4>
                      <code className="text-sm text-muted bg-surface-hover px-2 py-1 rounded mt-1 inline-block">
                        {selectedFont.font_family}
                      </code>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-muted">檔案名稱: </span>
                        <span className="text-fg">{selectedFont.filename}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted">檔案大小: </span>
                        <span className="text-fg">{formatFileSize(selectedFont.file_size)}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted">格式: </span>
                        <span className="text-fg">{selectedFont.file_format.toUpperCase()}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted">樣式: </span>
                        <span className="text-fg">{selectedFont.weight} {selectedFont.style}</span>
                      </div>
                    </div>

                    {selectedFont.description && (
                      <div>
                        <div className="text-sm text-muted">描述</div>
                        <div className="mt-1 p-3 bg-surface-hover rounded-lg text-sm">
                          {selectedFont.description}
                        </div>
                      </div>
                    )}

                    {/* 操作按鈕 */}
                    <div className="space-y-2 mt-4">
                      <button
                        onClick={() => handlePreviewFont(selectedFont)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary hover:bg-opacity-90 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        預覽字體
                      </button>

                      {isDev && !selectedFont.is_system_font && (
                        <>
                          <button
                            onClick={() => handleToggleStatus(selectedFont.id)}
                            disabled={actionLoading[`toggle-${selectedFont.id}`]}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                              selectedFont.is_active
                                ? 'bg-warning text-warning-foreground hover:bg-warning-hover'
                                : 'bg-success text-success-foreground hover:bg-success-hover'
                            }`}
                          >
                            {actionLoading[`toggle-${selectedFont.id}`] ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : selectedFont.is_active ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            {selectedFont.is_active ? '停用字體' : '啟用字體'}
                          </button>

                          <button
                            onClick={() => handleDeleteFont(selectedFont.id, selectedFont.display_name)}
                            disabled={actionLoading[`delete-${selectedFont.id}`]}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-danger text-danger-foreground rounded-lg hover:bg-danger-hover transition-colors"
                          >
                            {actionLoading[`delete-${selectedFont.id}`] ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            刪除字體
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : selectedRequest ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-fg text-lg">{selectedRequest.font_name}</h4>
                      <div className={`text-xs px-2 py-1 rounded-full inline-block mt-2 ${
                        selectedRequest.status === 'pending' ? 'bg-warning-bg text-warning-text' :
                        selectedRequest.status === 'approved' ? 'bg-success-bg text-success-text' :
                        'bg-danger-bg text-danger-text'
                      }`}>
                        {selectedRequest.status === 'pending' ? '待審核' :
                         selectedRequest.status === 'approved' ? '已核准' : '已拒絕'}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-muted">申請理由</div>
                      <div className="mt-1 p-3 bg-surface-hover rounded-lg text-sm">
                        {selectedRequest.reason}
                      </div>
                    </div>

                    {selectedRequest.description && (
                      <div>
                        <div className="text-sm text-muted">字體描述</div>
                        <div className="mt-1 p-3 bg-surface-hover rounded-lg text-sm">
                          {selectedRequest.description}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-muted">申請人: </span>
                        <span className="text-fg">{selectedRequest.requester.username}</span>
                        {selectedRequest.requester.school_name && (
                          <span className="text-xs px-2 py-1 bg-primary bg-opacity-10 text-primary rounded ml-2">
                            {selectedRequest.requester.school_name}
                          </span>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted">申請時間: </span>
                        <span className="text-fg">{formatDate(selectedRequest.created_at)}</span>
                      </div>
                    </div>

                    {/* 審核資訊 */}
                    {selectedRequest.status !== 'pending' && (
                      <div className="border-t pt-4">
                        {selectedRequest.reviewer && (
                          <div className="text-sm mb-2">
                            <span className="text-muted">審核人: </span>
                            <span className="text-fg">{selectedRequest.reviewer.username}</span>
                          </div>
                        )}
                        {selectedRequest.reviewed_at && (
                          <div className="text-sm mb-2">
                            <span className="text-muted">審核時間: </span>
                            <span className="text-fg">{formatDate(selectedRequest.reviewed_at)}</span>
                          </div>
                        )}
                        {selectedRequest.review_reason && (
                          <div>
                            <div className="text-sm text-muted">審核備註</div>
                            <div className="mt-1 p-3 bg-surface-hover rounded-lg text-sm">
                              {selectedRequest.review_reason}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 操作按鈕 */}
                    {isDev && selectedRequest.status === 'pending' && (
                      <div className="space-y-2 mt-4 border-t pt-4">
                        <button
                          onClick={() => handleRequestAction(selectedRequest.id, 'approve')}
                          disabled={actionLoading[`request-approve-${selectedRequest.id}`]}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-success text-success-foreground rounded-lg hover:bg-success-hover transition-colors"
                        >
                          {actionLoading[`request-approve-${selectedRequest.id}`] ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                          核准申請
                        </button>

                        <button
                          onClick={() => {
                            const reason = prompt('請輸入拒絕理由:')
                            if (reason) {
                              handleRequestAction(selectedRequest.id, 'reject', reason)
                            }
                          }}
                          disabled={actionLoading[`request-reject-${selectedRequest.id}`]}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-danger text-danger-foreground rounded-lg hover:bg-danger-hover transition-colors"
                        >
                          {actionLoading[`request-reject-${selectedRequest.id}`] ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          拒絕申請
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* 統計資訊 */}
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <h3 className="text-lg font-semibold text-fg mb-4">統計資訊</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted">總字體數</span>
                  <span className="text-sm font-medium">{fonts?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted">已啟用</span>
                  <span className="text-sm font-medium text-success">
                    {(fonts || []).filter(f => f.is_active).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted">中文字體</span>
                  <span className="text-sm font-medium text-info">
                    {(fonts || []).filter(f => f.is_chinese_supported).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted">系統字體</span>
                  <span className="text-sm font-medium text-accent">
                    {(fonts || []).filter(f => f.is_system_font).length}
                  </span>
                </div>
                {(isDev || isCampus) && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待審申請</span>
                    <span className="text-sm font-medium text-warning">
                      {(requests || []).filter(r => r.status === 'pending').length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Upload Form Modal */}
      {isDev && showUploadForm && (
        <div className="fixed inset-0 bg-fg bg-opacity-50 flex items-center justify-center z-[9999] p-4"
             onClick={(e) => {
               if (e.target === e.currentTarget) {
                 setShowUploadForm(false)
               }
             }}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-info-bg rounded-lg">
                <Upload className="w-5 h-5 text-info" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-fg">上傳字體檔案</h3>
                <p className="text-sm text-muted">新增字體到系統中</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dual-text mb-2">字體檔案</label>
                <div className="relative">
                  <label className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-surface-hover border border-border rounded-full cursor-pointer hover:bg-surface transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-opacity-20">
                    <Upload className="w-4 h-4 text-muted" />
                    <span className="text-sm text-muted">
                      {uploadForm.font_file ? uploadForm.font_file.name : '點擊選擇字體檔案'}
                    </span>
                    <input
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                </div>
                <p className="text-xs text-muted mt-1">
                  支援格式: TTF, OTF, WOFF, WOFF2 (最大 10MB)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">字體族群名稱</label>
                <input
                  type="text"
                  value={uploadForm.font_family}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, font_family: e.target.value }))}
                  placeholder="font_family (用於程式識別)"
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary"
                />
                <p className="text-xs text-muted mt-1">
                  用於程式識別，建議使用英文小寫和底線，如: noto_sans_tc
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">顯示名稱</label>
                <input
                  type="text"
                  value={uploadForm.display_name}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="字體顯示名稱"
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">描述</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="字體描述（可選）"
                  rows={2}
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium dual-text mb-2">字體粗細</label>
                  <select
                    value={uploadForm.weight}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, weight: e.target.value }))}
                    className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary"
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="light">Light</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">字體樣式</label>
                  <select
                    value={uploadForm.style}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, style: e.target.value }))}
                    className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary"
                  >
                    <option value="normal">Normal</option>
                    <option value="italic">Italic</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_chinese_supported"
                  checked={uploadForm.is_chinese_supported}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, is_chinese_supported: e.target.checked }))}
                  className="w-4 h-4 text-primary bg-surface-hover border-border rounded focus:ring-primary focus:ring-2"
                />
                <label htmlFor="is_chinese_supported" className="text-sm dual-text">
                  支援中文字符
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadForm.font_file || !uploadForm.font_family.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary hover:bg-opacity-90 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    上傳中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    上傳
                  </>
                )}
              </button>
              <button
                onClick={() => setShowUploadForm(false)}
                className="px-4 py-2 bg-surface-hover text-fg border border-border rounded-lg hover:bg-muted transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Form Modal */}
      {isCampus && showRequestForm && (
        <div className="fixed inset-0 bg-fg bg-opacity-50 flex items-center justify-center z-[9999] p-4"
             onClick={(e) => {
               if (e.target === e.currentTarget) {
                 setShowRequestForm(false)
               }
             }}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-success-bg rounded-lg">
                <Send className="w-5 h-5 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-fg">申請新字體</h3>
                <p className="text-sm text-muted">提交字體申請給系統管理員</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dual-text mb-2">字體名稱 *</label>
                <input
                  type="text"
                  value={requestForm.font_name}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, font_name: e.target.value }))}
                  placeholder="例如：思源黑體、Noto Sans TC"
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">字體描述</label>
                <input
                  type="text"
                  value={requestForm.description}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="字體的簡短描述（可選）"
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">申請理由 *</label>
                <textarea
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="請說明為什麼需要這個字體，以及預期的使用場景..."
                  rows={4}
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSubmitRequest}
                disabled={!requestForm.font_name.trim() || !requestForm.reason.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary hover:bg-opacity-90 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                提交申請
              </button>
              <button
                onClick={() => setShowRequestForm(false)}
                className="px-4 py-2 bg-surface-hover text-fg border border-border rounded-lg hover:bg-muted transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Preview Modal */}
      {previewFont && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
             onClick={(e) => {
               if (e.target === e.currentTarget) {
                 setPreviewFont(null)
                 setPreviewImage(null)
               }
             }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Type className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">字體預覽</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{previewFont.display_name}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewFont(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Sample Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">文字樣本</label>
                  <select
                    value={previewSample}
                    onChange={(e) => setPreviewSample(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="custom">自定義</option>
                    <option value="chinese">中文樣本</option>
                    <option value="english">英文樣本</option>
                    <option value="numbers">數字符號</option>
                    <option value="mixed">混合樣本</option>
                    <option value="lorem">段落樣本</option>
                  </select>
                </div>

                {/* Font Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">字體大小</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="12"
                      max="72"
                      value={previewSize}
                      onChange={(e) => setPreviewSize(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-8">{previewSize}</span>
                  </div>
                </div>

                {/* Background Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">背景色</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={previewBackground}
                      onChange={(e) => setPreviewBackground(e.target.value)}
                      className="w-8 h-8 rounded border"
                    />
                    <div className="flex gap-1">
                      {['#ffffff', '#f3f4f6', '#1f2937', '#000000'].map(color => (
                        <button
                          key={color}
                          onClick={() => setPreviewBackground(color)}
                          className="w-6 h-6 rounded border-2 border-gray-300"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Text Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">文字色</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={previewTextColor}
                      onChange={(e) => setPreviewTextColor(e.target.value)}
                      className="w-8 h-8 rounded border"
                    />
                    <div className="flex gap-1">
                      {['#000000', '#374151', '#6b7280', '#ffffff'].map(color => (
                        <button
                          key={color}
                          onClick={() => setPreviewTextColor(color)}
                          className="w-6 h-6 rounded border-2 border-gray-300"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom Text Input */}
              {previewSample === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">自定義文字</label>
                  <textarea
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    rows={3}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="輸入要預覽的文字..."
                  />
                </div>
              )}

              {/* Preview Area */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">即時預覽</h4>
                </div>
                <div
                  className="p-8 min-h-[200px] flex items-center justify-center"
                  style={{ backgroundColor: previewBackground }}
                >
                  <div
                    style={{
                      fontFamily: `"${previewFont.font_family}", system-ui, sans-serif`,
                      fontSize: `${previewSize}px`,
                      color: previewTextColor,
                      lineHeight: 1.4,
                      textAlign: 'center',
                      maxWidth: '100%',
                      wordBreak: 'break-word'
                    }}
                  >
                    {fontSamples[previewSample as keyof typeof fontSamples]}
                  </div>
                </div>
              </div>

              {/* Font Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">字體資訊</h5>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <div>家族名稱：{previewFont.font_family}</div>
                    <div>檔案格式：{previewFont.file_format.toUpperCase()}</div>
                    <div>檔案大小：{(previewFont.file_size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">字體特性</h5>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <div>粗細：{previewFont.weight}</div>
                    <div>樣式：{previewFont.style}</div>
                    <div>中文支援：{previewFont.is_chinese_supported ? '是' : '否'}</div>
                  </div>
                </div>
              </div>

              {/* Server Preview (Optional) */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">服務器渲染預覽</h4>
                  <button
                    onClick={() => handlePreviewFont(previewFont)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    生成圖片
                  </button>
                </div>
                {previewImage ? (
                  <div className="bg-white dark:bg-gray-700 p-4 rounded-lg">
                    <img src={previewImage} alt="服務器預覽" className="max-w-full rounded" />
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 p-8 rounded-lg text-center text-gray-500 dark:text-gray-400">
                    點擊上方按鈕生成服務器渲染的預覽圖片
                    <p className="text-muted">生成預覽中...</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => handlePreviewFont(previewFont)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary hover:bg-opacity-90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                重新生成預覽
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}