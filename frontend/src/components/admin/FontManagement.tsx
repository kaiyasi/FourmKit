import React, { useState, useEffect } from 'react'
import {
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Type,
  FileText,
  BarChart3,
  Plus,
  X,
  Settings,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react'

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

interface FontStats {
  total_fonts: number
  active_fonts: number
  chinese_fonts: number
  most_used_fonts: FontFile[]
  recent_fonts: FontFile[]
}

interface FontManagementProps {
  isOpen: boolean
  onClose: () => void
}

export default function FontManagement({ isOpen, onClose }: FontManagementProps) {
  const [fonts, setFonts] = useState<FontFile[]>([])
  const [stats, setStats] = useState<FontStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [previewFont, setPreviewFont] = useState<FontFile | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState('這是字體預覽文字 ABC 123')
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({})

  // 表單狀態
  const [uploadForm, setUploadForm] = useState({
    font_file: null as File | null,
    display_name: '',
    description: '',
    is_chinese_supported: false,
    weight: 'normal',
    style: 'normal'
  })

  useEffect(() => {
    if (isOpen) {
      fetchFonts()
      fetchStats()
    }
  }, [isOpen])

  const fetchFonts = async () => {
    try {
      const response = await fetch('/api/admin/fonts/list', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      const result = await response.json()
      if (result.success) {
        setFonts(result.fonts)
      } else {
        console.error('獲取字體列表失敗:', result.error)
      }
    } catch (error) {
      console.error('獲取字體列表失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/fonts/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      const result = await response.json()
      if (result.success) {
        setStats(result.stats)
      }
    } catch (error) {
      console.error('獲取字體統計失敗:', error)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setUploadForm(prev => ({
        ...prev,
        font_file: file,
        display_name: prev.display_name || file.name.split('.')[0]
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

      const result = await response.json()
      if (result.success) {
        alert('字體上傳成功！')
        setShowUploadForm(false)
        setUploadForm({
          font_file: null,
          display_name: '',
          description: '',
          is_chinese_supported: false,
          weight: 'normal',
          style: 'normal'
        })
        fetchFonts()
        fetchStats()
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
        fetchStats()
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold dual-text flex items-center gap-2">
              <Type className="w-6 h-6" />
              字體管理
            </h2>
            <p className="text-sm text-muted mt-1">
              管理系統字體檔案（僅限 dev_admin）
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUploadForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              上傳字體
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Stats */}
          <div className="w-80 border-r border-border bg-muted/30 p-4 overflow-y-auto">
            <h3 className="font-medium dual-text mb-3">字體統計</h3>
            
            {stats && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-lg font-semibold dual-text">{stats.total_fonts}</div>
                    <div className="text-xs text-muted">總字體數</div>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-lg font-semibold text-green-600">{stats.active_fonts}</div>
                    <div className="text-xs text-muted">啟用字體</div>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-lg font-semibold text-blue-600">{stats.chinese_fonts}</div>
                    <div className="text-xs text-muted">中文字體</div>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-lg font-semibold dual-text">
                      {stats.most_used_fonts.reduce((sum, font) => sum + font.usage_count, 0)}
                    </div>
                    <div className="text-xs text-muted">總使用次數</div>
                  </div>
                </div>

                {/* 最常用字體 */}
                <div className="bg-background rounded-lg p-3 border border-border">
                  <h4 className="font-medium dual-text mb-2 text-sm">最常用字體</h4>
                  <div className="space-y-2">
                    {stats.most_used_fonts.slice(0, 3).map((font) => (
                      <div key={font.id} className="flex justify-between items-center text-xs">
                        <span className="truncate">{font.display_name}</span>
                        <span className="text-primary">{font.usage_count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 最新字體 */}
                <div className="bg-background rounded-lg p-3 border border-border">
                  <h4 className="font-medium dual-text mb-2 text-sm">最新字體</h4>
                  <div className="space-y-2">
                    {stats.recent_fonts.slice(0, 3).map((font) => (
                      <div key={font.id} className="text-xs">
                        <div className="truncate font-medium">{font.display_name}</div>
                        <div className="text-muted">
                          {new Date(font.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                  <p className="text-muted">載入字體列表...</p>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="grid gap-4">
                  {fonts.map((font) => (
                    <div
                      key={font.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        font.is_active ? 'border-border bg-background' : 'border-border bg-muted/30'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium dual-text">{font.display_name}</h4>
                            <div className="flex items-center gap-2">
                              {font.is_system_font && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                  系統字體
                                </span>
                              )}
                              {font.is_chinese_supported && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                  支援中文
                                </span>
                              )}
                              {!font.file_exists && (
                                <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  檔案遺失
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-sm text-muted space-y-1">
                            <div>字體家族: <code className="bg-muted px-1 rounded">{font.font_family}</code></div>
                            <div>檔案: {font.filename} ({formatFileSize(font.file_size)})</div>
                            <div>格式: {font.file_format.toUpperCase()} | 樣式: {font.weight} {font.style}</div>
                            {font.description && <div>描述: {font.description}</div>}
                            <div>使用次數: {font.usage_count} | 創建時間: {new Date(font.created_at).toLocaleString()}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handlePreviewFont(font)}
                            className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                            title="預覽字體"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          {!font.is_system_font && (
                            <>
                              <button
                                onClick={() => handleToggleStatus(font.id)}
                                disabled={actionLoading[`toggle-${font.id}`]}
                                className={`p-2 rounded ${
                                  font.is_active
                                    ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                    : 'text-gray-600 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                                title={font.is_active ? '停用字體' : '啟用字體'}
                              >
                                {actionLoading[`toggle-${font.id}`] ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : font.is_active ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <EyeOff className="w-4 h-4" />
                                )}
                              </button>
                              
                              <button
                                onClick={() => handleDeleteFont(font.id, font.display_name)}
                                disabled={actionLoading[`delete-${font.id}`]}
                                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                                title="刪除字體"
                              >
                                {actionLoading[`delete-${font.id}`] ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {fonts.length === 0 && (
                    <div className="text-center py-12">
                      <Type className="w-12 h-12 text-muted mx-auto mb-4" />
                      <p className="text-muted">尚未上傳任何字體檔案</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Form Modal */}
      {showUploadForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold dual-text mb-4">上傳字體檔案</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dual-text mb-2">字體檔案</label>
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-xs text-muted mt-1">
                  支援格式: TTF, OTF, WOFF, WOFF2 (最大 10MB)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">顯示名稱</label>
                <input
                  type="text"
                  value={uploadForm.display_name}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="字體顯示名稱"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium dual-text mb-2">描述</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="字體描述（可選）"
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium dual-text mb-2">字體粗細</label>
                  <select
                    value={uploadForm.weight}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, weight: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                  className="rounded border-border focus:ring-primary/20 focus:border-primary"
                />
                <label htmlFor="is_chinese_supported" className="text-sm dual-text">
                  支援中文字符
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadForm.font_file}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
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
                className="px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFont && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold dual-text">
                字體預覽: {previewFont.display_name}
              </h3>
              <button
                onClick={() => setPreviewFont(null)}
                className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dual-text mb-2">預覽文字</label>
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="bg-muted/30 rounded-lg p-4 min-h-[200px] flex items-center justify-center">
                {previewImage ? (
                  <img src={previewImage} alt="字體預覽" className="max-w-full max-h-full rounded" />
                ) : (
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                    <p className="text-muted">生成預覽中...</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => handlePreviewFont(previewFont)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
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
