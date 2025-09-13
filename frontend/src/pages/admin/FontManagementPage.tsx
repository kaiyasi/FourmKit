import React, { useState, useEffect } from 'react'
import {
  Upload,
  Download,
  Trash2,
  Eye,
  FileText,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Plus
} from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

interface FontFile {
  filename: string
  name: string
  path: string
  size: number
  valid: boolean
  error?: string
}

export default function FontManagementPage() {
  const [fonts, setFonts] = useState<FontFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [previewFont, setPreviewFont] = useState<FontFile | null>(null)
  const [previewText, setPreviewText] = useState('中文字體預覽測試 ABC 123')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // 載入字體列表
  const loadFonts = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/fonts/list', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const result = await response.json()
      if (result.success) {
        setFonts(result.data.fonts)
      } else {
        showMessage('error', result.message || '載入字體列表失敗')
      }
    } catch (error) {
      showMessage('error', '載入字體列表失敗')
      console.error('載入字體失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  // 上傳字體
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 檢查檔案格式
    const allowedExtensions = ['.ttf', '.otf', '.ttc', '.woff', '.woff2']
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    
    if (!allowedExtensions.includes(fileExtension)) {
      showMessage('error', `不支援的檔案格式，僅支援: ${allowedExtensions.join(', ')}`)
      return
    }

    // 檢查檔案大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showMessage('error', '檔案過大，最大支援 10MB')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('font_file', file)

      const response = await fetch('/api/admin/fonts/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      const result = await response.json()
      if (result.success) {
        showMessage('success', result.data.message)
        loadFonts() // 重新載入列表
      } else {
        showMessage('error', result.message || '上傳失敗')
      }
    } catch (error) {
      showMessage('error', '上傳失敗')
      console.error('上傳失敗:', error)
    } finally {
      setUploading(false)
      // 清空 input
      event.target.value = ''
    }
  }

  // 刪除字體
  const handleDeleteFont = async (filename: string) => {
    if (!confirm(`確定要刪除字體 "${filename}" 嗎？`)) return

    try {
      const response = await fetch(`/api/admin/fonts/delete/${filename}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const result = await response.json()
      if (result.success) {
        showMessage('success', result.data.message)
        loadFonts() // 重新載入列表
      } else {
        showMessage('error', result.message || '刪除失敗')
      }
    } catch (error) {
      showMessage('error', '刪除失敗')
      console.error('刪除失敗:', error)
    }
  }

  // 預覽字體
  const handlePreviewFont = async (font: FontFile) => {
    try {
      const response = await fetch('/api/admin/fonts/preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          font_name: font.filename,
          text: previewText
        })
      })

      const result = await response.json()
      if (result.success) {
        setPreviewImage(result.data.preview_url)
      } else {
        showMessage('error', result.message || '預覽生成失敗')
      }
    } catch (error) {
      showMessage('error', '預覽生成失敗')
      console.error('預覽失敗:', error)
    }
  }

  // 安裝預設字體
  const handleInstallDefaultFonts = async () => {
    setInstalling(true)
    try {
      const response = await fetch('/api/admin/fonts/install-default', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      const result = await response.json()
      if (result.success) {
        showMessage('success', result.data.message)
        loadFonts() // 重新載入列表
      } else {
        showMessage('error', result.message || '安裝失敗')
      }
    } catch (error) {
      showMessage('error', '安裝失敗')
      console.error('安裝失敗:', error)
    } finally {
      setInstalling(false)
    }
  }

  // 顯示訊息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  // 格式化檔案大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  useEffect(() => {
    loadFonts()
  }, [])

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/fonts" />
      <MobileBottomNav />
      
      <div className="container mx-auto px-4 py-6" style={{ marginTop: 'var(--fk-navbar-offset, 80px)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold dual-text">字體管理</h1>
          <p className="text-muted text-sm mt-1">管理系統字體檔案，支援圖片生成使用</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleInstallDefaultFonts}
            disabled={installing}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {installing ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            安裝預設字體
          </button>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors cursor-pointer">
            {uploading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            上傳字體
            <input
              type="file"
              accept=".ttf,.otf,.ttc,.woff,.woff2"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          
          <button
            onClick={loadFonts}
            disabled={loading}
            className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 訊息提示 */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' 
            ? 'bg-success/10 text-success border border-success/20' 
            : 'bg-danger/10 text-danger border border-danger/20'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="flex-1">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="p-1 hover:bg-black/10 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 字體列表 */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold dual-text">已安裝字體 ({fonts.length})</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-muted">載入中...</p>
          </div>
        ) : fonts.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted" />
            <p className="text-muted mb-4">尚未安裝任何字體</p>
            <p className="text-sm text-muted">
              請點擊「安裝預設字體」或「上傳字體」來新增字體檔案
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {fonts.map((font) => (
              <div key={font.filename} className="p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${
                      font.valid ? 'bg-success' : 'bg-danger'
                    }`} />
                    
                    <div>
                      <h3 className="font-medium dual-text">{font.name}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted mt-1">
                        <span>{font.filename}</span>
                        <span>{formatFileSize(font.size)}</span>
                        {!font.valid && font.error && (
                          <span className="text-danger">錯誤: {font.error}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {font.valid && (
                      <button
                        onClick={() => {
                          setPreviewFont(font)
                          handlePreviewFont(font)
                        }}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="預覽字體"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDeleteFont(font.filename)}
                      className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      title="刪除字體"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 預覽對話框 */}
      {previewFont && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold dual-text">
                字體預覽: {previewFont.name}
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
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                重新生成預覽
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
