import React, { useState, useEffect } from 'react'
import {
  X,
  Save,
  Eye,
  Type,
  Image,
  Palette,
  Layout,
  Settings,
  Hash,
  Upload,
  RotateCcw,
  Download,
  RefreshCw
} from 'lucide-react'

// 圖片預覽組件
const ImagePreview: React.FC<{
  content: any
  config?: any
  templateId?: number
  templateConfig?: any
}> = ({ content, config, templateId, templateConfig }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 預覽尺寸配置 - 設定為更大的固定尺寸
  const maxPreviewHeight = '1000px'

  const generatePreview = async () => {
    if (!templateId || loading) return

    setLoading(true)
    try {
      // 添加超時控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超時

      const response = await fetch('/api/admin/social/templates/preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_id: templateId,
          content_data: content,
          custom_options: {
            image: config,
            // 包含完整的模板配置以便生成格式化ID
            ...(templateConfig && {
              multipost: templateConfig.multipost,
              caption: templateConfig.caption
            })
          }
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      const result = await response.json()
      if (result.success && result.preview?.image_url) {
        setPreviewUrl(result.preview.image_url)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('預覽生成超時')
      } else {
        console.error('生成預覽失敗:', error)
      }
    } finally {
      setLoading(false)
    }
  }

  // 當內容或配置改變時重新生成預覽 (使用防抖避免過於頻繁的請求)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generatePreview()
    }, 300) // 300ms 防抖延遲

    return () => clearTimeout(timeoutId)
  }, [content, JSON.stringify(config), templateId, JSON.stringify(templateConfig)])

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="ml-2 text-xs">生成中...</span>
        </div>
      )}
      
      {previewUrl ? (
        <div className="relative group cursor-pointer" onClick={generatePreview}>
          <img 
            src={previewUrl} 
            alt="模板預覽"
            className="max-w-full h-auto rounded border border-border hover:opacity-80 transition-opacity"
            style={{ maxHeight: maxPreviewHeight, maxWidth: '100%' }}
            title="點擊重新生成預覽"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <RefreshCw className="w-6 h-6 text-white drop-shadow-lg" />
            <span className="ml-2 text-white text-sm font-medium drop-shadow-lg">點擊重新生成</span>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground">
          <div className="text-2xl mb-2">🖼️</div>
          <div className="text-xs">
            {loading ? '正在生成預覽...' : '點擊重新生成預覽圖片'}
          </div>
          {!loading && (
            <button
              onClick={generatePreview}
              className="mt-2 text-xs text-primary hover:text-primary/80"
            >
              生成預覽
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface TemplateConfig {
  image?: {
    width?: number
    height?: number
    background?: {
      type: 'color' | 'gradient' | 'image'
      value: string
      gradient?: { start: string; end: string; direction: string }
    }
    logo?: {
      enabled: boolean
      position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'center'
      size: number
      opacity?: number
    }
    text?: {
      font: string
      size: number
      color: string
      weight: 'normal' | 'bold'
      align: 'left' | 'center' | 'right'
      lineHeight?: number
      maxLines?: number
    }
    timestamp?: {
      enabled: boolean
      position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
      format: '12h' | '24h'
      showYear: boolean
      showSeconds: boolean
      font?: string
      size?: number
      color?: string
    }
    border?: {
      enabled: boolean
      width: number
      color: string
      radius: number
    }
  }
  caption?: {
    template: string
    maxLength: number
    autoHashtags: string[]
    emojiStyle: 'none' | 'minimal' | 'rich'
  }
  multipost?: {
    prefix?: string
    idFormat?: {
      prefix: string
      suffix?: string
      digits: number
    }
    template: string
    suffix?: string
    maxLength: number
    emojiStyle?: 'none' | 'minimal' | 'rich'
  }
}

interface SocialAccount {
  id: number
  platform_username: string
  display_name: string
}

interface FontFile {
  id: number
  font_family: string
  display_name: string
  is_active: boolean
  is_system_font: boolean
}

interface TemplateEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (template: any) => void
  accounts: SocialAccount[]
  editingTemplate?: any
}

const DEFAULT_CONFIG: TemplateConfig = {
  image: {
    width: 1080,
    height: 1080,
    background: {
      type: 'color',
      value: '#ffffff'
    },
    logo: {
      enabled: true,
      position: 'top-right',
      size: 80,
      opacity: 0.8
    },
    text: {
      font: 'Noto Sans TC',
      size: 32,
      color: '#333333',
      weight: 'bold',
      align: 'center',
      lineHeight: 1.4,
      maxLines: 6
    },
    timestamp: {
      enabled: true,
      position: 'bottom-right',
      format: '24h',
      showYear: false,
      showSeconds: false,
      font: 'Noto Sans TC',
      size: 18,
      color: '#666666'
    },
    postId: {
      enabled: false,
      position: 'top-left',
      size: 20,
      font: 'default',
      color: '#0066cc',
      opacity: 0.9
    },
    border: {
      enabled: false,
      width: 4,
      color: '#e5e7eb',
      radius: 16
    }
  },
  caption: {
    template: '📢 {title}\n\n{content}\n\n{hashtags}',
    maxLength: 2200,
    autoHashtags: ['#校園生活', '#學生分享'],
    emojiStyle: 'minimal'
  },
  multipost: {
    prefix: '[*]匿名內容不代表本版立場',
    idFormat: {
      prefix: '#內湖高中',
      suffix: '',
      digits: 0
    },
    template: '{id}\n{content}\n-----------------',
    suffix: '#內湖高中#台灣匿名聯合#匿名#黑特#靠北#告白#日更#內湖高中',
    maxLength: 2200,
    emojiStyle: 'minimal'
  }
}

export default function TemplateEditor({ isOpen, onClose, onSave, accounts, editingTemplate }: TemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'image' | 'caption'>('basic')
  const [templateData, setTemplateData] = useState({
    name: '',
    description: '',
    template_type: 'combined' as 'image' | 'text' | 'combined',
    account_id: accounts[0]?.id || 0,
    is_default: false,
    config: {
      ...DEFAULT_CONFIG,
      multipost: { ...DEFAULT_CONFIG.multipost }
    }
  })
  const [previewContent, setPreviewContent] = useState({
    title: '校園生活分享',
    content: '【論壇貼文內容將自動填入此處】\n這裡會顯示來自論壇的實際貼文內容，包含用戶發布的文字、圖片說明等。系統會自動將論壇貼文的內容替換 {content} 佔位符。',
    author: '小明',
    hashtags: ['#校園生活', '#健康生活', '#學生日常']
  })
  const [realPosts, setRealPosts] = useState<any[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fonts, setFonts] = useState<FontFile[]>([])
  const [loadingFonts, setLoadingFonts] = useState(false)

  const fetchRecentPosts = async () => {
    if (loadingPosts || realPosts.length > 0) return
    
    setLoadingPosts(true)
    try {
      const response = await fetch('/api/admin/social/posts/sample?limit=5', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.posts) {
          setRealPosts(result.posts)
          if (result.posts.length > 0) {
            const firstPost = result.posts[0]
            setPreviewContent({
              title: firstPost.title || '無標題',
              content: firstPost.content || '無內容',
              author: firstPost.author || '匿名用戶',  // 直接使用 author 字段
              hashtags: ['#校園生活', '#學生分享']
            })
          }
        }
      }
    } catch (error) {
      console.error('獲取論壇貼文失敗:', error)
    } finally {
      setLoadingPosts(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchRecentPosts()
      fetchFonts()
    }
  }, [isOpen])

  const fetchFonts = async () => {
    setLoadingFonts(true)
    try {
      const response = await fetch('/api/admin/fonts/list', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // 轉換字體列表格式
          const fontList = result.data.fonts.map((font: any) => ({
            id: font.filename,
            font_family: font.filename,
            display_name: font.name,
            is_active: font.valid,
            is_system_font: false
          }))
          
          // 添加預設系統字體選項
          const systemFonts = [
            {
              id: 'noto-sans-tc',
              font_family: 'Noto Sans TC',
              display_name: 'Noto Sans TC (繁體中文)',
              is_active: true,
              is_system_font: true
            },
            {
              id: 'arial',
              font_family: 'Arial',
              display_name: 'Arial',
              is_active: true,
              is_system_font: true
            }
          ]
          
          setFonts([...systemFonts, ...fontList.filter((font: FontFile) => font.is_active)])
        }
      }
    } catch (error) {
      console.error('獲取字體列表失敗:', error)
    } finally {
      setLoadingFonts(false)
    }
  }

  useEffect(() => {
    if (editingTemplate) {
      setTemplateData({
        name: editingTemplate.name || '',
        description: editingTemplate.description || '',
        template_type: editingTemplate.template_type || 'combined',
        account_id: editingTemplate.account_id || accounts[0]?.id || 0,
        is_default: editingTemplate.is_default || false,
        config: {
          ...DEFAULT_CONFIG,
          ...editingTemplate.config,
          multipost: {
            ...DEFAULT_CONFIG.multipost,
            ...editingTemplate.config?.multipost
          }
        }
      })
    } else {
      // 重置為預設值
      setTemplateData({
        name: '',
        description: '',
        template_type: 'combined',
        account_id: accounts[0]?.id || 0,
        is_default: false,
        config: DEFAULT_CONFIG
      })
    }
  }, [editingTemplate, accounts])

  const handleSave = async () => {
    if (!templateData.name.trim()) {
      alert('請輸入模板名稱')
      return
    }

    if (!templateData.account_id) {
      alert('請選擇要關聯的帳號')
      return
    }

    setSaving(true)
    try {
      await onSave(templateData)
      onClose()
    } catch (error) {
      console.error('Save template failed:', error)
      alert('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const updateImageConfig = (key: string, value: any) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        image: {
          ...prev.config.image,
          [key]: value
        }
      }
    }))
  }

  const updateCaptionConfig = (key: string, value: any) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        caption: {
          ...prev.config.caption,
          [key]: value
        }
      }
    }))
  }

  const updateMultipostConfig = (key: string, value: any) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        multipost: {
          ...prev.config.multipost,
          [key]: value
        }
      }
    }))
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 檢查檔案類型
    if (!file.type.startsWith('image/')) {
      alert('請選擇圖片檔案')
      return
    }

    // 檢查檔案大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('檔案過大，請選擇小於 5MB 的圖片')
      return
    }

    // 產生隨機雜湊字串（後端僅用於唯一檔名，無需真 Hash）
    const genHex = (bytes = 16) => {
      const arr = new Uint8Array(bytes)
      window.crypto.getRandomValues(arr)
      return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', file.name)
      formData.append('hash', `logo_${genHex(12)}`)
      formData.append('category', 'templates')
      formData.append('identifier', (file.name.split('.')[0] || 'logo').slice(0, 48))

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error('上傳失敗')
      }

      const result = await response.json()
      
      // 後端回傳格式：{ ok: true, url, path, info }
      if (result.ok && result.url) {
        // 更新 Logo URL
        updateImageConfig('logo', {
          ...templateData.config.image?.logo,
          url: result.url,
          enabled: true
        })
        
        alert('Logo 上傳成功！')
      } else {
        throw new Error(result.error || result.message || '上傳失敗')
      }
    } catch (error) {
      console.error('Logo 上傳失敗:', error)
      alert('Logo 上傳失敗，請稍後再試')
    }

    // 清空 input
    event.target.value = ''
  }

  const generatePreviewCaption = () => {
    // 統一使用多篇發布模板邏輯
    return generateMultiPostPreview()
  }

  const formatId = (id: number | string, idFormat: any) => {
    let formatted = id.toString()

    // 補零處理
    if (idFormat?.digits > 0) {
      formatted = formatted.padStart(idFormat.digits, '0')
    }

    // 加前後綴
    return (idFormat?.prefix || '') + formatted + (idFormat?.suffix || '')
  }

  const generateMultiPostPreview = () => {
    const multipostConfig = templateData.config.multipost || DEFAULT_CONFIG.multipost
    if (!multipostConfig || !multipostConfig.template) {
      return '請設定多篇發布模板'
    }

    // 使用真實貼文數據，如果沒有則使用模擬數據
    const postsToUse = realPosts.length > 0 ? realPosts.slice(0, 3) : [
      { id: 15523, title: '社團博覽會', content: '外迎好煩啊啊啊啊啊啊啊', author: '學生會' },
      { id: 15524, title: '圖書館新區', content: '所以你們在吵的總召是嘻研的那個粉毛嗎', author: '圖書館員' },
      { id: 15525, title: '學餐新菜', content: '那群隨便抨擊別人的你們真的很有事，你們在優越什麼', author: '美食達人' }
    ]

    let result = `🔄 多篇發布預覽 (會產生 ${postsToUse.length} 篇貼文):\n\n`

    if (realPosts.length > 0) {
      result += '📍 使用真實論壇貼文預覽:\n\n'
    } else if (loadingPosts) {
      result += '⏳ 載入真實貼文中...\n\n'
    } else {
      result += '🎭 使用模擬數據預覽:\n\n'
    }

    // 1. 開頭固定內容（只顯示一次）
    if (multipostConfig.prefix) {
      result += multipostConfig.prefix + '\n'
    }

    // 2. 重複每篇貼文內容
    postsToUse.forEach((post, index) => {
      const formattedId = formatId(post.id || `${15520 + index}`, multipostConfig.idFormat)
      let postContent = multipostConfig.template
        .replace('{id}', formattedId)
        .replace('{content}', post.content || '無內容')
        .replace('{title}', post.title || '無標題')
        .replace('{author}', post.author || '匿名用戶')

      result += postContent
      // 如果不是最後一篇且模板沒有換行，自動加換行
      if (index < postsToUse.length - 1 && !multipostConfig.template.endsWith('\n')) {
        result += '\n'
      }
    })

    // 3. 結尾固定內容（只顯示一次）
    if (multipostConfig.suffix) {
      result += '\n' + multipostConfig.suffix
    }

    // 4. 添加用戶自定義的標籤
    const autoHashtags = templateData.config.caption?.autoHashtags || []
    if (autoHashtags.length > 0) {
      result += '\n' + autoHashtags.join(' ')
    }

    result += '\n\n' + (realPosts.length > 0 ? '✅ 基於真實論壇貼文生成' : '※ 實際發布時會使用真實論壇貼文')

    return result
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-[95vw] h-[95vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold dual-text">
              {editingTemplate ? '編輯模板' : '新增模板'}
            </h2>
            <p className="text-sm text-muted mt-1">
              設計你的 Instagram 貼文模板
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              儲存模板
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
          {/* Left Sidebar - Settings Tabs */}
          <div className="w-56 border-r border-border bg-muted/30 p-4">
            <div className="space-y-2">
              {[
                { id: 'basic', label: '基本設定', icon: Settings },
                { id: 'image', label: '圖片設定', icon: Image },
                { id: 'caption', label: '文案設定', icon: Type }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                    activeTab === id
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'hover:bg-muted/50 text-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Middle - Settings Content */}
          <div className="w-1/2 overflow-y-auto border-r border-border">
            {activeTab === 'basic' && (
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium dual-text mb-2">模板名稱</label>
                  <input
                    type="text"
                    value={templateData.name}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="輸入模板名稱..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">模板描述</label>
                  <textarea
                    value={templateData.description}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="描述這個模板的用途..."
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">關聯帳號</label>
                  <select
                    value={templateData.account_id}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, account_id: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>
                        @{account.platform_username} - {account.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">模板類型</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'image', label: '純圖片', desc: '只生成圖片內容' },
                      { value: 'text', label: '純文字', desc: '只生成文案內容' },
                      { value: 'combined', label: '圖文並茂', desc: '圖片+文案組合' }
                    ].map(({ value, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setTemplateData(prev => ({ ...prev, template_type: value as any }))}
                        className={`p-4 border rounded-lg text-left transition-colors ${
                          templateData.template_type === value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border hover:border-muted hover:bg-muted/30'
                        }`}
                      >
                        <div className="font-medium text-sm">{label}</div>
                        <div className="text-xs text-muted mt-1">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={templateData.is_default}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, is_default: e.target.checked }))}
                    className="rounded border-border focus:ring-primary/20 focus:border-primary"
                  />
                  <label htmlFor="is_default" className="text-sm dual-text">
                    設為該帳號的預設模板
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'image' && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">圖片寬度</label>
                    <input
                      type="number"
                      value={templateData.config.image?.width || 1080}
                      onChange={(e) => updateImageConfig('width', parseInt(e.target.value))}
                      min="400"
                      max="2000"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">圖片高度</label>
                    <input
                      type="number"
                      value={templateData.config.image?.height || 1080}
                      onChange={(e) => updateImageConfig('height', parseInt(e.target.value))}
                      min="400"
                      max="2000"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">背景顏色</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={templateData.config.image?.background?.value || '#ffffff'}
                      onChange={(e) => updateImageConfig('background', {
                        ...templateData.config.image?.background,
                        value: e.target.value
                      })}
                      className="w-12 h-10 rounded-lg border border-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={templateData.config.image?.background?.value || '#ffffff'}
                      onChange={(e) => updateImageConfig('background', {
                        ...templateData.config.image?.background,
                        value: e.target.value
                      })}
                      placeholder="#ffffff"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                <div className="border border-border rounded-lg p-4">
                  <h3 className="font-medium dual-text mb-3">文字設定</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">字體</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={templateData.config.image?.text?.font || 'default'}
                          onChange={(e) => updateImageConfig('text', {
                            ...templateData.config.image?.text,
                            font: e.target.value
                          })}
                          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          <option value="default">系統預設字體</option>
                          {fonts.map(font => (
                            <option key={font.font_family} value={font.font_family}>
                              {font.display_name}
                              {font.is_system_font && ' (系統)'}
                            </option>
                          ))}
                        </select>
                        {loadingFonts && (
                          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">字體大小</label>
                      <input
                        type="number"
                        value={templateData.config.image?.text?.size || 32}
                        onChange={(e) => updateImageConfig('text', {
                          ...templateData.config.image?.text,
                          size: parseInt(e.target.value)
                        })}
                        min="12"
                        max="72"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">文字顏色</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={templateData.config.image?.text?.color || '#333333'}
                        onChange={(e) => updateImageConfig('text', {
                          ...templateData.config.image?.text,
                          color: e.target.value
                        })}
                        className="w-8 h-8 rounded border border-border cursor-pointer"
                      />
                      <input
                        type="text"
                        value={templateData.config.image?.text?.color || '#333333'}
                        onChange={(e) => updateImageConfig('text', {
                          ...templateData.config.image?.text,
                          color: e.target.value
                        })}
                        placeholder="#333333"
                        className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:ring-1 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">文字對齊</label>
                      <select
                        value={templateData.config.image?.text?.align || 'center'}
                        onChange={(e) => updateImageConfig('text', {
                          ...templateData.config.image?.text,
                          align: e.target.value
                        })}
                        className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:ring-1 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="left">左對齊</option>
                        <option value="center">置中</option>
                        <option value="right">右對齊</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">字體粗細</label>
                      <select
                        value={templateData.config.image?.text?.weight || 'bold'}
                        onChange={(e) => updateImageConfig('text', {
                          ...templateData.config.image?.text,
                          weight: e.target.value
                        })}
                        className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:ring-1 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="normal">一般</option>
                        <option value="bold">粗體</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">最多行數</label>
                      <input
                        type="number"
                        value={templateData.config.image?.text?.maxLines || 6}
                        onChange={(e) => updateImageConfig('text', {
                          ...templateData.config.image?.text,
                          maxLines: parseInt(e.target.value)
                        })}
                        min="1"
                        max="20"
                        className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:ring-1 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={templateData.config.image?.logo?.enabled || false}
                        onChange={(e) => updateImageConfig('logo', {
                          ...templateData.config.image?.logo,
                          enabled: e.target.checked
                        })}
                        className="rounded border-border focus:ring-primary/20 focus:border-primary"
                      />
                      <h3 className="font-medium dual-text">Logo 設定</h3>
                    </div>
                    
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors cursor-pointer text-sm">
                      <Upload className="w-4 h-4" />
                      上傳 Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  {templateData.config.image?.logo?.enabled && (
                    <>
                      {templateData.config.image?.logo?.url && (
                        <div className="mb-4 p-3 bg-muted/20 rounded-lg">
                          <div className="text-sm font-medium dual-text mb-2">目前的 Logo</div>
                          <div className="flex items-center gap-3">
                            <img 
                              src={templateData.config.image.logo.url} 
                              alt="Logo 預覽" 
                              className="w-16 h-16 object-contain bg-white border border-border rounded"
                            />
                            <div className="flex-1">
                              <div className="text-sm text-muted">已上傳 Logo</div>
                              <button
                                onClick={() => updateImageConfig('logo', {
                                  ...templateData.config.image?.logo,
                                  url: undefined
                                })}
                                className="text-sm text-red-600 hover:text-red-700 mt-1"
                              >
                                移除 Logo
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium dual-text mb-2">位置</label>
                        <select
                          value={templateData.config.image?.logo?.position || 'top-right'}
                          onChange={(e) => updateImageConfig('logo', {
                            ...templateData.config.image?.logo,
                            position: e.target.value
                          })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          <option value="top-left">左上角</option>
                          <option value="top-center">上方中間</option>
                          <option value="top-right">右上角</option>
                          <option value="bottom-left">左下角</option>
                          <option value="bottom-center">下方中間</option>
                          <option value="bottom-right">右下角</option>
                          <option value="center">中央</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium dual-text mb-2">大小</label>
                        <input
                          type="number"
                          value={templateData.config.image?.logo?.size || 80}
                          onChange={(e) => updateImageConfig('logo', {
                            ...templateData.config.image?.logo,
                            size: parseInt(e.target.value)
                          })}
                          min="20"
                          max="200"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                    </div>
                    </>
                  )}
                </div>

                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={templateData.config.image?.timestamp?.enabled || false}
                      onChange={(e) => updateImageConfig('timestamp', {
                        ...templateData.config.image?.timestamp,
                        enabled: e.target.checked
                      })}
                      className="rounded border-border focus:ring-primary/20 focus:border-primary"
                    />
                    <h3 className="font-medium dual-text">時間戳設定</h3>
                  </div>
                  
                  {templateData.config.image?.timestamp?.enabled && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">位置</label>
                          <select
                            value={templateData.config.image?.timestamp?.position || 'bottom-right'}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              position: e.target.value
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            <option value="top-left">左上角</option>
                            <option value="top-center">上方中間</option>
                            <option value="top-right">右上角</option>
                            <option value="bottom-left">左下角</option>
                            <option value="bottom-center">下方中間</option>
                            <option value="bottom-right">右下角</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">時間格式</label>
                          <select
                            value={templateData.config.image?.timestamp?.format || '24h'}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              format: e.target.value
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            <option value="24h">24小時制</option>
                            <option value="12h">12小時制 (AM/PM)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={templateData.config.image?.timestamp?.showYear || false}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              showYear: e.target.checked
                            })}
                            className="rounded border-border focus:ring-primary/20 focus:border-primary"
                          />
                          <label className="text-sm dual-text">顯示年份</label>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={templateData.config.image?.timestamp?.showSeconds || false}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              showSeconds: e.target.checked
                            })}
                            className="rounded border-border focus:ring-primary/20 focus:border-primary"
                          />
                          <label className="text-sm dual-text">顯示秒數</label>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">字體大小</label>
                          <input
                            type="number"
                            value={templateData.config.image?.timestamp?.size || 18}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              size: parseInt(e.target.value)
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">字體</label>
                          <select
                            value={templateData.config.image?.timestamp?.font || 'Noto Sans TC'}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              font: e.target.value
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            <option value="Noto Sans TC">Noto Sans TC</option>
                            {fonts.map(font => (
                              <option key={font.font_family} value={font.font_family}>
                                {font.display_name}
                                {font.is_system_font && ' (系統)'}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">顏色</label>
                          <input
                            type="color"
                            value={templateData.config.image?.timestamp?.color || '#666666'}
                            onChange={(e) => updateImageConfig('timestamp', {
                              ...templateData.config.image?.timestamp,
                              color: e.target.value
                            })}
                            className="w-full h-10 rounded-lg border border-border cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 貼文ID設定 */}
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={templateData.config.image?.postId?.enabled || false}
                      onChange={(e) => updateImageConfig('postId', {
                        ...templateData.config.image?.postId,
                        enabled: e.target.checked
                      })}
                      className="rounded border-border focus:ring-primary/20 focus:border-primary"
                    />
                    <h3 className="font-medium dual-text">貼文ID設定</h3>
                  </div>

                  {templateData.config.image?.postId?.enabled && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">位置</label>
                          <select
                            value={templateData.config.image?.postId?.position || 'top-left'}
                            onChange={(e) => updateImageConfig('postId', {
                              ...templateData.config.image?.postId,
                              position: e.target.value
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            <option value="top-left">左上角</option>
                            <option value="top-center">上方中間</option>
                            <option value="top-right">右上角</option>
                            <option value="bottom-left">左下角</option>
                            <option value="bottom-center">下方中間</option>
                            <option value="bottom-right">右下角</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">自定義文字</label>
                          <input
                            type="text"
                            value={templateData.config.image?.postId?.text || ''}
                            onChange={(e) => updateImageConfig('postId', {
                              ...templateData.config.image?.postId,
                              text: e.target.value
                            })}
                            placeholder="#匿名內中{id}"
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">字體大小</label>
                          <input
                            type="number"
                            value={templateData.config.image?.postId?.size || 18}
                            onChange={(e) => updateImageConfig('postId', {
                              ...templateData.config.image?.postId,
                              size: parseInt(e.target.value)
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">字體</label>
                          <select
                            value={templateData.config.image?.postId?.font || 'Noto Sans TC'}
                            onChange={(e) => updateImageConfig('postId', {
                              ...templateData.config.image?.postId,
                              font: e.target.value
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            <option value="Noto Sans TC">Noto Sans TC</option>
                            {fonts.map(font => (
                              <option key={font.font_family} value={font.font_family}>
                                {font.display_name}
                                {font.is_system_font && ' (系統)'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">顏色</label>
                          <input
                            type="color"
                            value={templateData.config.image?.postId?.color || '#666666'}
                            onChange={(e) => updateImageConfig('postId', {
                              ...templateData.config.image?.postId,
                              color: e.target.value
                            })}
                            className="w-full h-10 rounded-lg border border-border cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

            {activeTab === 'caption' && (
              <div className="p-6 space-y-6">
                {/* 文案模板設定 */}
                <div className="space-y-6">

                  {/* 開頭固定內容 */}
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">開頭內容 (只顯示一次)</label>
                    <input
                      type="text"
                      value={templateData.config.multipost?.prefix || ''}
                      onChange={(e) => updateMultipostConfig('prefix', e.target.value)}
                      placeholder="[*]匿名內容不代表本版立場"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>

                  {/* ID 格式設定 */}
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">ID 顯示格式</label>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium dual-text mb-2">ID 前綴</label>
                        <input
                          type="text"
                          value={templateData.config.multipost?.idFormat?.prefix || ''}
                          onChange={(e) => updateMultipostConfig('idFormat', {
                            ...templateData.config.multipost?.idFormat,
                            prefix: e.target.value
                          })}
                          placeholder="#匿名內中"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium dual-text mb-2">補零位數</label>
                        <input
                          type="number"
                          value={templateData.config.multipost?.idFormat?.digits || 0}
                          onChange={(e) => updateMultipostConfig('idFormat', {
                            ...templateData.config.multipost?.idFormat,
                            digits: parseInt(e.target.value) || 0
                          })}
                          min="0"
                          max="8"
                          placeholder="0"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                        <div className="text-xs text-muted-foreground mt-1">0 = 不補零</div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium dual-text mb-2">ID 後綴</label>
                        <input
                          type="text"
                          value={templateData.config.multipost?.idFormat?.suffix || ''}
                          onChange={(e) => updateMultipostConfig('idFormat', {
                            ...templateData.config.multipost?.idFormat,
                            suffix: e.target.value
                          })}
                          placeholder="(可選)"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">ℹ️ 使用說明</div>
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          文案中的 <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{"{id}"}</code> 會被替換為格式化後的貼文ID，
                          例如貼文15520會顯示為：<strong>{(templateData.config.multipost?.idFormat?.prefix || '#') + '15520'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 重複模板 */}
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">重複模板 (每篇貼文執行)</label>
                    <textarea
                      value={templateData.config.multipost?.template || ''}
                      onChange={(e) => updateMultipostConfig('template', e.target.value)}
                      placeholder="{id}&#10;{content}&#10;-----------------"
                      rows={4}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none font-mono text-sm"
                    />
                  </div>

                  {/* 結尾固定內容 */}
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">結尾內容 (只顯示一次)</label>
                    <input
                      type="text"
                      value={templateData.config.multipost?.suffix || ''}
                      onChange={(e) => updateMultipostConfig('suffix', e.target.value)}
                      placeholder="#匿名內中#台灣匿名聯合#匿名#黑特#靠北#告白#日更#內湖高中"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>

                  {/* Hashtag 設定 */}
                  <div>
                    <label className="block text-sm font-medium dual-text mb-2">新增標籤</label>
                    <p className="text-xs text-muted mb-2">
                      這些標籤會自動添加到所有從這個帳號發布的內容中。建議設定與你的學校或品牌相關的常用標籤。
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="輸入新標籤後按 Enter"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            let newTag = (e.target as HTMLInputElement).value.trim();
                            // 自動添加 # 符號如果沒有的話
                            if (newTag && !newTag.startsWith('#')) {
                              newTag = '#' + newTag;
                            }
                            if (newTag && !templateData.config.caption?.autoHashtags?.includes(newTag)) {
                              updateCaptionConfig('autoHashtags', [...(templateData.config.caption?.autoHashtags || []), newTag]);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(templateData.config.caption?.autoHashtags || []).map((tag, index) => (
                        <div key={index} className="flex items-center gap-1 bg-muted/50 text-foreground rounded-full px-3 py-1 text-sm">
                          <span>{tag}</span>
                          <button
                            onClick={() => {
                              const newTags = [...(templateData.config.caption?.autoHashtags || [])];
                              newTags.splice(index, 1);
                              updateCaptionConfig('autoHashtags', newTags);
                            }}
                            className="text-muted hover:text-foreground"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 共用說明 */}
                <div className="text-xs text-muted space-y-1">
                  <div>可使用變數：</div>
                  <div className="pl-2 space-y-1">
                    <div>• <code className="bg-gray-100 px-1 rounded">{'{title}'}</code> - 論壇貼文標題</div>
                    <div>• <code className="bg-gray-100 px-1 rounded">{'{content}'}</code> - 論壇貼文內容 (自動填入)</div>
                    <div>• <code className="bg-gray-100 px-1 rounded">{'{author}'}</code> - 貼文作者</div>
                    <div>• <code className="bg-gray-100 px-1 rounded">{'{id}'}</code> - 貼文編號</div>
                  </div>
                </div>

                {/* 字數限制 */}
                <div>
                  <label className="block text-sm font-medium dual-text mb-2">
                    最大字數限制：{templateData.config.multipost?.maxLength || 2200}
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="2200"
                    value={templateData.config.multipost?.maxLength || 2200}
                    onChange={(e) => updateMultipostConfig('maxLength', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>100</span>
                    <span>2200 (IG 限制)</span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Panel - Live Preview */}
          <div className="w-1/2 flex flex-col bg-muted/10">
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                <h3 className="font-medium dual-text">即時預覽</h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 自動真實數據預覽 */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <h4 className="font-medium dual-text text-sm">使用真實平台數據</h4>
                </div>
                
                {loadingPosts ? (
                  <div className="text-xs text-muted-foreground">正在載入真實貼文...</div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium dual-text mb-1">標題</label>
                      <div className="px-2 py-1.5 text-sm bg-muted/20 border border-border rounded">
                        {previewContent.title}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium dual-text mb-1">作者</label>
                      <div className="px-2 py-1.5 text-sm bg-muted/20 border border-border rounded">
                        {previewContent.author}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium dual-text mb-1">內容預覽</label>
                      <div className="px-2 py-1.5 text-sm bg-muted/20 border border-border rounded max-h-20 overflow-y-auto">
                        {previewContent.content.length > 100 
                          ? previewContent.content.substring(0, 100) + '...' 
                          : previewContent.content}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        setRealPosts([])
                        fetchRecentPosts()
                      }}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重新載入真實數據
                    </button>
                  </div>
                )}
              </div>

              {/* 文案預覽 */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium dual-text text-sm">文案預覽</h4>
                  <span className="text-xs text-muted">
                    {generatePreviewCaption().length} / {templateData.config.multipost?.maxLength || 2200}
                  </span>
                </div>
                
                <div className="bg-muted/20 rounded p-3 font-mono text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {generatePreviewCaption()}
                </div>
              </div>

              {/* 圖片預覽 */}
              <div className="bg-background rounded-lg p-6 border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium dual-text text-base">圖片預覽</h4>
                  <span className="text-sm text-muted">
                    {templateData.config.image?.width || 1080} × {templateData.config.image?.height || 1080}
                  </span>
                </div>
                
                <div className="bg-muted/10 rounded-lg p-6 text-center min-h-[600px] flex items-center justify-center">
                  <ImagePreview
                    content={previewContent}
                    config={templateData.config.image}
                    templateId={editingTemplate?.id}
                    templateConfig={templateData.config}
                  />
                </div>
              </div>

              {/* 真實貼文選擇 (如果有的話) */}
              {realPosts.length > 0 && (
                <div className="bg-background rounded-lg p-4 border border-border">
                  <h4 className="font-medium dual-text mb-3 text-sm">使用真實貼文預覽</h4>
                  
                  <div className="space-y-2">
                    {realPosts.slice(0, 3).map((post, index) => (
                      <button
                        key={post.id}
                        onClick={() => setPreviewContent({
                          id: post.id,
                          title: post.title || '無標題',
                          content: post.content || '無內容',
                          author: post.author?.username || '匿名用戶',
                          hashtags: ['#校園生活', '#學生分享']
                        })}
                        className="w-full text-left p-2 bg-muted/30 hover:bg-muted/50 rounded text-xs transition-colors"
                      >
                        <div className="font-medium text-foreground truncate">{post.title || '無標題'}</div>
                        <div className="text-muted truncate mt-1">{post.content?.substring(0, 50)}...</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading 提示 */}
              {loadingPosts && (
                <div className="bg-background rounded-lg p-4 border border-border text-center">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <div className="text-xs text-muted">載入真實貼文中...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
