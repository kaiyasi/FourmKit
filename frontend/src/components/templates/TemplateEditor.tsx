import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { X, Save } from 'lucide-react'

type Align = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'

interface TemplateConfig {
  // 1. 貼文模板：純文字轉圖片（沒有附件時使用）
  textToImage: {
    enabled: boolean
    width: number
    height: number
    background: { type: 'color' | 'gradient' | 'image', value: string }
    text: {
      font: string
      size: number
      color: string
      align: Align
      vAlign: VAlign
      lineSpacing: number
      maxLines: number
      maxCharsPerLine: number
      watermark?: {
        enabled: boolean
        text?: string
        font?: string
        size?: number
        color?: string
        position?: 'top-left'|'top-center'|'top-right'|'middle-left'|'center'|'middle-right'|'bottom-left'|'bottom-center'|'bottom-right'
      }
    }
    logo?: { enabled: boolean, url?: string, size?: number, opacity?: number, position?: string, x?: number, y?: number }
    timestamp?: { enabled: boolean, format?: '12h'|'24h', showYear?: boolean, showSeconds?: boolean, size?: number, font?: string, color?: string, position?: string, x?: number, y?: number }
    postId?: { enabled: boolean, text?: string, prefix?: string, digits?: number, suffix?: string, position?: string, size?: number, font?: string, color?: string, opacity?: number, x?: number, y?: number }
    border?: { enabled: boolean, width?: number, color?: string, radius?: number }
  }

  // 2. 相片模板：有圖片附件時的處理方式
  photos: {
    enabled: boolean
    mode: 'combined' | 'separate'

    // 合成模式：文字與圖片合成為一張圖
    combined: {
      canvas: {
        width: number
        height: number
        background: { type: 'color' | 'gradient' | 'image', value: string }
      }
      layout: {
        maxPhotos: 1 | 2 | 3 | 4
        arrangement: 'grid' | 'row' | 'column' | 'collage'
        // 百分比定位系統
        photoArea: { width: number, height: number, x: number, y: number } // 0-100%
        textArea: { width: number, height: number, x: number, y: number }   // 0-100%
      }
      photos: {
        resizeMode: 'none' | 'fit' | 'fill' | 'crop'
        quality: number // 0-100
        rounded: boolean
        cornerRadius: number
        border?: { enabled: boolean, width?: number, color?: string }
        spacing: number // 圖片間距
      }
      text: {
        font: string
        size: number
        color: string
        align: Align
        vAlign: VAlign
        lineSpacing: number
        maxLines: number
        maxCharsPerLine: number
        background?: { enabled: boolean, color?: string, opacity?: number }
        shadow?: { enabled: boolean, color?: string, blur?: number, offset?: { x: number, y: number } }
      }
      logo?: { enabled: boolean, url?: string, size?: number, opacity?: number, position?: string, x?: number, y?: number }
      timestamp?: { enabled: boolean, format?: '12h'|'24h', showYear?: boolean, showSeconds?: boolean, size?: number, font?: string, color?: string, position?: string, x?: number, y?: number }
      postId?: { enabled: boolean, text?: string, prefix?: string, digits?: number, suffix?: string, position?: string, size?: number, font?: string, color?: string, opacity?: number, x?: number, y?: number }
      border?: { enabled: boolean, width?: number, color?: string, radius?: number }
    }

    // 分開模式：原圖片 + 文字描述
    separate: {
      photos: {
        maxCount: 1 | 2 | 3 | 4
        resizeMode: 'none' | 'fit' | 'fill'
        quality: number // 0-100
        watermark?: {
          enabled: boolean
          logo?: { enabled: boolean, url?: string, size?: number, opacity?: number, position?: string }
          timestamp?: { enabled: boolean, format?: '12h'|'24h', size?: number, color?: string, position?: string }
          postId?: { enabled: boolean, format?: string, size?: number, color?: string, position?: string }
        }
      }
    }
  }

  // 3. 文案模板：Instagram 發文時的文字內容
  caption: {
    enabled: boolean
    header: string
    content: string
    footer: string
    maxLength: number
    autoHashtags: string[]
    includeOriginalLink: boolean
    linkText?: string
  }
}

interface SocialAccount {
  id: number
  platform_username: string
  display_name: string
}

interface TemplateEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (template: any) => void
  accounts: SocialAccount[]
  editingTemplate?: any
}

const DEFAULT_CONFIG: TemplateConfig = {
  textToImage: {
    enabled: true,
    width: 1080,
    height: 1080,
    background: { type: 'color', value: '#ffffff' },
    text: {
      font: 'Noto Sans TC',
      size: 32,
      color: '#333333',
      align: 'center',
      vAlign: 'middle',
      lineSpacing: 10,
      maxLines: 6,
      maxCharsPerLine: 0,
      watermark: { enabled: false, text: '詳情請至平台查看', size: 20, color: '#666666', position: 'bottom-right' },
    },
    logo: { enabled: false, size: 80, opacity: 0.85, position: 'top-right' },
    timestamp: { enabled: false, format: '24h', showYear: false, showSeconds: false, size: 18, color: '#666666', position: 'bottom-right' },
    postId: { enabled: false, position: 'top-left', size: 20, color: '#0066cc', opacity: 0.9 },
    border: { enabled: false, width: 2, color: '#e5e7eb', radius: 12 }
  },
  photos: {
    enabled: true,
    mode: 'combined',
    combined: {
      canvas: { width: 1080, height: 1080, background: { type: 'color', value: '#ffffff' } },
      layout: {
        maxPhotos: 4,
        arrangement: 'grid',
        photoArea: { width: 60, height: 60, x: 5, y: 5 },  // 左上角 60% 區域
        textArea: { width: 30, height: 60, x: 67, y: 5 }    // 右側 30% 區域
      },
      photos: {
        resizeMode: 'crop',
        quality: 85,
        rounded: true,
        cornerRadius: 8,
        border: { enabled: false, width: 2, color: '#e5e7eb' },
        spacing: 8
      },
      text: {
        font: 'Noto Sans TC',
        size: 24,
        color: '#333333',
        align: 'left',
        vAlign: 'top',
        lineSpacing: 8,
        maxLines: 8,
        maxCharsPerLine: 20,
        background: { enabled: false, color: '#ffffff', opacity: 0.8 },
        shadow: { enabled: false, color: '#000000', blur: 4, offset: { x: 2, y: 2 } }
      },
      logo: { enabled: false, size: 60, opacity: 0.85, position: 'bottom-right' },
      timestamp: { enabled: false, format: '24h', showYear: false, showSeconds: false, size: 14, color: '#666666', position: 'bottom-left' },
      postId: { enabled: false, position: 'top-left', size: 16, color: '#0066cc', opacity: 0.9 },
      border: { enabled: false, width: 2, color: '#e5e7eb', radius: 12 }
    },
    separate: {
      photos: {
        maxCount: 4,
        resizeMode: 'none',
        quality: 90,
        watermark: {
          enabled: false,
          logo: { enabled: false, size: 40, opacity: 0.7, position: 'bottom-right' },
          timestamp: { enabled: false, format: '24h', size: 12, color: '#ffffff', position: 'bottom-left' },
          postId: { enabled: false, format: '#{id}', size: 12, color: '#ffffff', position: 'top-left' }
        }
      }
    }
  },
  caption: {
    enabled: true,
    header: '貼文 {id}',
    content: '{content}',
    footer: '{hashtags}',
    maxLength: 2200,
    autoHashtags: ['#校園生活', '#學生分享'],
    includeOriginalLink: false,
    linkText: '查看完整內容：{link}'
  },
}

export default function TemplateEditor({ isOpen, onClose, onSave, accounts, editingTemplate }: TemplateEditorProps) {
  const initial = useMemo(() => {
    if (editingTemplate?.config) {
      return {
        name: editingTemplate.name || '',
        description: editingTemplate.description || '',
        account_id: editingTemplate.account_id || accounts[0]?.id || 0,
        is_default: Boolean(editingTemplate.is_default),
        config: { ...DEFAULT_CONFIG, ...editingTemplate.config },
      }
    }
    return {
      name: '',
      description: '',
      account_id: accounts[0]?.id || 0,
      is_default: false,
      config: { ...DEFAULT_CONFIG },
    }
  }, [accounts, editingTemplate])

  const [templateData, setTemplateData] = useState(initial)
  const [activeTab, setActiveTab] = useState<'basic' | 'textToImage' | 'photos' | 'caption'>('basic')
  const [saving, setSaving] = useState(false)
  const [previewImages, setPreviewImages] = useState<{
    textToImage?: string
    photos?: string
  }>({})
  const [generating, setGenerating] = useState<{
    textToImage?: boolean
    photos?: boolean
  }>({})
  const [realPosts, setRealPosts] = useState<any[]>([])
  const [selectedPostIndex, setSelectedPostIndex] = useState(0)
  const [loadingPosts, setLoadingPosts] = useState(false)

  // 獲取真實貼文數據
  useEffect(() => {
    if (isOpen) {
      fetchRealPosts()
    }
  }, [isOpen])

  // 防止背景滾動和互動
  useEffect(() => {
    if (isOpen) {
      // 禁用背景滾動
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'

      // 清理函數：恢復原始樣式
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [isOpen])

  const fetchRealPosts = async () => {
    setLoadingPosts(true)
    try {
      const response = await fetch('/api/posts?limit=10&with_content=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const posts = data.posts || data.data || []
        if (posts.length > 0) {
          setRealPosts(posts)
        } else {
          // 如果沒有真實貼文，使用預設範例
          setRealPosts([{
            id: 999,
            title: '範例貼文標題',
            content: '這是一個範例貼文內容，展示模板的實際效果。內容會根據論壇貼文動態替換，包含各種文字內容和排版效果。',
            author: '測試作者',
            school: { name: '測試學校' },
            created_at: new Date().toISOString()
          }])
        }
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error)
      // 使用預設範例
      setRealPosts([{
        id: 999,
        title: '範例貼文標題',
        content: '這是一個範例貼文內容，展示模板的實際效果。內容會根據論壇貼文動態替換，包含各種文字內容和排版效果。',
        author: '測試作者',
        school: { name: '測試學校' },
        created_at: new Date().toISOString()
      }])
    } finally {
      setLoadingPosts(false)
    }
  }

  const currentPost = realPosts[selectedPostIndex] || realPosts[0]

  if (!isOpen) return null

  // Update functions
  const updateTextToImageConfig = (patch: Partial<TemplateConfig['textToImage']>) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        textToImage: { ...prev.config.textToImage, ...patch }
      }
    }))
  }

  const updatePhotosConfig = (patch: Partial<TemplateConfig['photos']>) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        photos: { ...prev.config.photos, ...patch }
      }
    }))
  }

  const updateCombinedConfig = (patch: Partial<TemplateConfig['photos']['combined']>) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        photos: {
          ...prev.config.photos,
          combined: { ...prev.config.photos.combined, ...patch }
        }
      }
    }))
  }

  const updateSeparateConfig = (patch: Partial<TemplateConfig['photos']['separate']>) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        photos: {
          ...prev.config.photos,
          separate: { ...prev.config.photos.separate, ...patch }
        }
      }
    }))
  }

  const updateCaptionConfig = (patch: Partial<TemplateConfig['caption']>) => {
    setTemplateData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        caption: { ...prev.config.caption, ...patch }
      }
    }))
  }

  // 生成實際預覽圖片
  const generatePreviewImage = useCallback(async (type: 'textToImage' | 'photos') => {
    if (!currentPost) return

    setGenerating(prev => ({ ...prev, [type]: true }))

    try {
      const config = templateData.config
      let requestData: any = {
        id: currentPost.id,
        title: currentPost.title || '',
        text: currentPost.content || '',
        author: currentPost.author || '',
        school_name: currentPost.school?.name || '',
        created_at: currentPost.created_at,
        quality: 95
      }

      if (type === 'textToImage' && config.textToImage.enabled) {
        requestData = {
          ...requestData,
          size: 'custom',
          template: 'custom',
          config: {
            width: config.textToImage.width,
            height: config.textToImage.height,
            background: config.textToImage.background,
            text: config.textToImage.text,
            logo: config.textToImage.logo,
            timestamp: config.textToImage.timestamp,
            postId: config.textToImage.postId,
            border: config.textToImage.border
          }
        }
      } else if (type === 'photos' && config.photos.enabled) {
        if (config.photos.mode === 'combined') {
          requestData = {
            ...requestData,
            size: 'custom',
            template: 'photo_combined',
            config: {
              canvas: config.photos.combined.canvas,
              layout: config.photos.combined.layout,
              photos: config.photos.combined.photos,
              text: config.photos.combined.text,
              logo: config.photos.combined.logo,
              timestamp: config.photos.combined.timestamp,
              postId: config.photos.combined.postId,
              border: config.photos.combined.border
            }
          }
        } else {
          requestData = {
            ...requestData,
            template: 'photo_separate',
            config: {
              photos: config.photos.separate.photos
            }
          }
        }
      }

      const response = await fetch('/api/post-images/preview-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestData)
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.image_url) {
          setPreviewImages(prev => ({
            ...prev,
            [type]: result.image_url
          }))
        }
      } else {
        console.error('Failed to generate preview:', response.status)
      }
    } catch (error) {
      console.error('Error generating preview:', error)
    } finally {
      setGenerating(prev => ({ ...prev, [type]: false }))
    }
  }, [currentPost?.id, JSON.stringify(templateData.config)])

  // 當配置變更時自動重新生成預覽
  useEffect(() => {
    if (currentPost && templateData.config.textToImage.enabled) {
      const debounceTimer = setTimeout(() => {
        generatePreviewImage('textToImage')
      }, 1000) // 1秒防抖
      return () => clearTimeout(debounceTimer)
    }
  }, [
    templateData.config.textToImage,
    currentPost?.id,
    selectedPostIndex,
    generatePreviewImage
  ])

  useEffect(() => {
    if (currentPost && templateData.config.photos.enabled) {
      const debounceTimer = setTimeout(() => {
        generatePreviewImage('photos')
      }, 1000)
      return () => clearTimeout(debounceTimer)
    }
  }, [
    templateData.config.photos,
    currentPost?.id,
    selectedPostIndex,
    generatePreviewImage
  ])

  const handleSave = async () => {
    // 驗證三個模板都已啟用
    const { textToImage, photos, caption } = templateData.config
    if (!textToImage.enabled || !photos.enabled || !caption.enabled) {
      alert('請啟用所有三個模板（貼文、相片、文案）才能儲存！')
      return
    }

    // 基本欄位驗證
    if (!templateData.name.trim()) {
      alert('請輸入模板名稱')
      return
    }

    setSaving(true)
    try {
      onSave(templateData)
    } finally {
      setSaving(false)
    }
  }

  const config = templateData.config

  // 檢查模板完整性
  const isTemplateComplete = config.textToImage.enabled && config.photos.enabled && config.caption.enabled

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2"
      onClick={(e) => {
        // 點擊背景時關閉模態框（可選）
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onScroll={(e) => e.stopPropagation()}
      style={{
        pointerEvents: 'all',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden'
      }}
    >
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-[95vw] h-[95vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold dual-text">{editingTemplate ? '編輯模板' : '新增模板'}</h2>
            <p className="text-sm text-muted mt-1">設計你的 Instagram 貼文模板</p>
            {!isTemplateComplete && (
              <div className="flex items-center gap-2 mt-2 text-amber-700">
                <span className="text-xs">需要啟用所有三個模板才能儲存</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !isTemplateComplete}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ?
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> :
                <Save className="w-4 h-4" />
              }
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
          {/* Left Sidebar */}
          <div className="w-64 border-r border-border bg-muted/30 p-4">
            <div className="space-y-2">
              {[
                { id: 'basic', label: '基本設定' },
                {
                  id: 'textToImage',
                  label: '貼文模板',
                  desc: '純文字轉圖片',
                  enabled: config.textToImage.enabled
                },
                {
                  id: 'photos',
                  label: '相片模板',
                  desc: '文字+圖片處理',
                  enabled: config.photos.enabled
                },
                {
                  id: 'caption',
                  label: '文案模板',
                  desc: 'Instagram 文案',
                  enabled: config.caption.enabled
                },
              ].map(({ id, label, desc, enabled }: any) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                    activeTab === id ?
                    'bg-primary/10 text-primary border border-primary/20' :
                    'hover:bg-muted/50 text-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{label}</span>
                      {enabled !== undefined && (
                        <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-stone-500' : 'bg-stone-400'}`} />
                      )}
                    </div>
                    {desc && <div className="text-xs opacity-60">{desc}</div>}
                  </div>
                </button>
              ))}
            </div>

            {/* 模板狀態總覽 */}
            <div className="mt-6 p-3 bg-background rounded-lg border border-border">
              <h4 className="text-sm font-medium dual-text mb-2">模板狀態</h4>
              <div className="space-y-1 text-xs">
                <div className={`flex items-center gap-2 ${config.textToImage.enabled ? 'text-stone-600' : 'text-stone-600'}`}>
                  <div className={`w-2 h-2 rounded-full ${config.textToImage.enabled ? 'bg-stone-500' : 'bg-stone-400'}`} />
                  貼文模板
                </div>
                <div className={`flex items-center gap-2 ${config.photos.enabled ? 'text-stone-600' : 'text-stone-600'}`}>
                  <div className={`w-2 h-2 rounded-full ${config.photos.enabled ? 'bg-stone-500' : 'bg-stone-400'}`} />
                  相片模板
                </div>
                <div className={`flex items-center gap-2 ${config.caption.enabled ? 'text-stone-600' : 'text-stone-600'}`}>
                  <div className={`w-2 h-2 rounded-full ${config.caption.enabled ? 'bg-stone-500' : 'bg-stone-400'}`} />
                  文案模板
                </div>
              </div>
            </div>
          </div>

          {/* Middle - Content */}
          <div className="w-1/2 overflow-y-auto border-r border-border">

            {activeTab === 'basic' && (
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium dual-text mb-2">模板名稱 *</label>
                  <input
                    type="text"
                    value={templateData.name}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">模板描述</label>
                  <textarea
                    rows={3}
                    value={templateData.description}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium dual-text mb-2">關聯帳號 *</label>
                  <select
                    value={templateData.account_id}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, account_id: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>@{a.platform_username} - {a.display_name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={templateData.is_default}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, is_default: e.target.checked }))}
                    className="rounded border-border focus:ring-primary/20 focus:border-primary"
                  />
                  <label htmlFor="is_default" className="text-sm dual-text">設為該帳號的預設模板</label>
                </div>

                {/* 模板要求說明 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800 mb-2">模板設定要求</h3>
                  <div className="text-sm text-blue-700 space-y-2">
                    <p>要建立完整的模板，需要設定以下三個部分：</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>貼文模板</strong>：純文字貼文轉換為圖片的設定</li>
                      <li><strong>相片模板</strong>：有圖片附件時的處理方式（合成或分開）</li>
                      <li><strong>文案模板</strong>：Instagram 發文時的文字內容格式</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'textToImage' && (
              <div className="p-6 space-y-6">
                {/* 啟用開關 */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="textToImage_enabled"
                    checked={config.textToImage.enabled}
                    onChange={(e) => updateTextToImageConfig({ enabled: e.target.checked })}
                    className="rounded border-border focus:ring-primary/20 focus:border-primary"
                  />
                  <label htmlFor="textToImage_enabled" className="text-lg font-medium dual-text">啟用貼文模板</label>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-medium text-blue-800 mb-2">貼文模板說明</h3>
                  <p className="text-sm text-blue-700">當貼文「沒有圖片附件」時，會將純文字內容轉換成圖片格式發布到 Instagram。</p>
                </div>

                {config.textToImage.enabled && (
                  <>
                    {/* Canvas 設定 */}
                    <div className="border border-border rounded-lg p-4">
                      <h3 className="font-medium dual-text mb-3">畫布設定</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">寬度</label>
                          <input
                            type="number"
                            value={config.textToImage.width}
                            onChange={(e) => updateTextToImageConfig({ width: parseInt(e.target.value) })}
                            min={400}
                            max={2000}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">高度</label>
                          <input
                            type="number"
                            value={config.textToImage.height}
                            onChange={(e) => updateTextToImageConfig({ height: parseInt(e.target.value) })}
                            min={400}
                            max={2000}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="block text-sm font-medium dual-text mb-2">背景顏色</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={config.textToImage.background.value}
                            onChange={(e) => updateTextToImageConfig({
                              background: { ...config.textToImage.background, value: e.target.value }
                            })}
                            className="w-12 h-10 rounded-lg border border-border cursor-pointer"
                          />
                          <input
                            type="text"
                            value={config.textToImage.background.value}
                            onChange={(e) => updateTextToImageConfig({
                              background: { ...config.textToImage.background, value: e.target.value }
                            })}
                            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 文字設定 */}
                    <div className="border border-border rounded-lg p-4">
                      <h3 className="font-medium dual-text mb-3">文字設定</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">字體大小</label>
                          <input
                            type="number"
                            value={config.textToImage.text.size}
                            onChange={(e) => updateTextToImageConfig({
                              text: { ...config.textToImage.text, size: parseInt(e.target.value) }
                            })}
                            min={12}
                            max={72}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">文字顏色</label>
                          <input
                            type="color"
                            value={config.textToImage.text.color}
                            onChange={(e) => updateTextToImageConfig({
                              text: { ...config.textToImage.text, color: e.target.value }
                            })}
                            className="w-full h-10 rounded-lg border border-border cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">水平對齊</label>
                          <select
                            value={config.textToImage.text.align}
                            onChange={(e) => updateTextToImageConfig({
                              text: { ...config.textToImage.text, align: e.target.value as Align }
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          >
                            <option value="left">左對齊</option>
                            <option value="center">置中</option>
                            <option value="right">右對齊</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">垂直對齊</label>
                          <select
                            value={config.textToImage.text.vAlign}
                            onChange={(e) => updateTextToImageConfig({
                              text: { ...config.textToImage.text, vAlign: e.target.value as VAlign }
                            })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          >
                            <option value="top">頂端</option>
                            <option value="middle">置中</option>
                            <option value="bottom">底部</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">最多行數</label>
                          <input
                            type="number"
                            value={config.textToImage.text.maxLines}
                            onChange={(e) => updateTextToImageConfig({
                              text: { ...config.textToImage.text, maxLines: parseInt(e.target.value) }
                            })}
                            min={1}
                            max={10}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium dual-text mb-2">每行最多字數</label>
                          <input
                            type="number"
                            value={config.textToImage.text.maxCharsPerLine}
                            onChange={(e) => updateTextToImageConfig({
                              text: { ...config.textToImage.text, maxCharsPerLine: parseInt(e.target.value) || 0 }
                            })}
                            min={0}
                            max={80}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                          />
                          <div className="text-xs text-muted mt-1">0 代表不限制</div>
                        </div>
                      </div>
                    </div>

                    {/* 浮水印設定 */}
                    <div className="border border-border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="checkbox"
                          checked={Boolean(config.textToImage.text.watermark?.enabled)}
                          onChange={(e) => updateTextToImageConfig({
                            text: {
                              ...config.textToImage.text,
                              watermark: { ...(config.textToImage.text.watermark || {}), enabled: e.target.checked }
                            }
                          })}
                          className="rounded border-border focus:ring-primary/20 focus:border-primary"
                        />
                        <label className="text-sm font-medium dual-text">超出截斷時顯示浮水印</label>
                      </div>
                      {config.textToImage.text.watermark?.enabled && (
                        <div className="grid grid-cols-4 gap-4">
                          <div className="col-span-2">
                            <label className="block text-sm font-medium dual-text mb-2">浮水印文字</label>
                            <input
                              type="text"
                              value={config.textToImage.text.watermark?.text || ''}
                              onChange={(e) => updateTextToImageConfig({
                                text: {
                                  ...config.textToImage.text,
                                  watermark: { ...(config.textToImage.text.watermark || {}), text: e.target.value }
                                }
                              })}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">字體大小</label>
                            <input
                              type="number"
                              value={config.textToImage.text.watermark?.size || 20}
                              onChange={(e) => updateTextToImageConfig({
                                text: {
                                  ...config.textToImage.text,
                                  watermark: { ...(config.textToImage.text.watermark || {}), size: parseInt(e.target.value) || 20 }
                                }
                              })}
                              min={10}
                              max={48}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">顏色</label>
                            <input
                              type="color"
                              value={config.textToImage.text.watermark?.color || '#666666'}
                              onChange={(e) => updateTextToImageConfig({
                                text: {
                                  ...config.textToImage.text,
                                  watermark: { ...(config.textToImage.text.watermark || {}), color: e.target.value }
                                }
                              })}
                              className="w-full h-10 rounded-lg border border-border cursor-pointer"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'photos' && (
              <div className="p-6 space-y-6">
                {/* 啟用開關 */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="photos_enabled"
                    checked={config.photos.enabled}
                    onChange={(e) => updatePhotosConfig({ enabled: e.target.checked })}
                    className="rounded border-border focus:ring-primary/20 focus:border-primary"
                  />
                  <label htmlFor="photos_enabled" className="text-lg font-medium dual-text">啟用相片模板</label>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h3 className="font-medium text-green-800 mb-2">相片模板說明</h3>
                  <p className="text-sm text-green-700">當貼文「有圖片附件」時的處理方式。支援兩種模式：合成模式與分開模式。</p>
                </div>

                {config.photos.enabled && (
                  <>
                    {/* 模式選擇 */}
                    <div className="border border-border rounded-lg p-4">
                      <h3 className="font-medium dual-text mb-3">處理模式</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => updatePhotosConfig({ mode: 'combined' })}
                          className={`p-4 border rounded-lg text-left transition-colors ${
                            config.photos.mode === 'combined'
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          <div className="font-medium mb-2">合成模式</div>
                          <p className="text-sm opacity-70">文字與圖片合成為一張圖片</p>
                        </button>
                        <button
                          onClick={() => updatePhotosConfig({ mode: 'separate' })}
                          className={`p-4 border rounded-lg text-left transition-colors ${
                            config.photos.mode === 'separate'
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          <div className="font-medium mb-2">分開模式</div>
                          <p className="text-sm opacity-70">圖片跟文字分開處理</p>
                        </button>
                      </div>
                    </div>

                    {/* 合成模式設定 - 精簡版，完整設定可在之後擴展 */}
                    {config.photos.mode === 'combined' && (
                      <div className="border border-border rounded-lg p-4">
                        <h3 className="font-medium dual-text mb-3">合成設定</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">畫布寬度</label>
                            <input
                              type="number"
                              value={config.photos.combined.canvas.width}
                              onChange={(e) => updateCombinedConfig({
                                canvas: {
                                  ...config.photos.combined.canvas,
                                  width: parseInt(e.target.value)
                                }
                              })}
                              min={400}
                              max={2000}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">畫布高度</label>
                            <input
                              type="number"
                              value={config.photos.combined.canvas.height}
                              onChange={(e) => updateCombinedConfig({
                                canvas: {
                                  ...config.photos.combined.canvas,
                                  height: parseInt(e.target.value)
                                }
                              })}
                              min={400}
                              max={2000}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted mt-2">詳細設定將在模板啟用後可用</p>
                      </div>
                    )}

                    {/* 分開模式設定 */}
                    {config.photos.mode === 'separate' && (
                      <div className="border border-border rounded-lg p-4">
                        <h3 className="font-medium dual-text mb-3">分開處理設定</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">最多圖片數量</label>
                            <select
                              value={config.photos.separate.photos.maxCount}
                              onChange={(e) => updateSeparateConfig({
                                photos: {
                                  ...config.photos.separate.photos,
                                  maxCount: parseInt(e.target.value) as 1 | 2 | 3 | 4
                                }
                              })}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                            >
                              <option value={1}>單張圖片</option>
                              <option value={2}>最多2張</option>
                              <option value={3}>最多3張</option>
                              <option value={4}>最多4張</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">縮放模式</label>
                            <select
                              value={config.photos.separate.photos.resizeMode}
                              onChange={(e) => updateSeparateConfig({
                                photos: {
                                  ...config.photos.separate.photos,
                                  resizeMode: e.target.value as any
                                }
                              })}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                            >
                              <option value="none">保持原始大小</option>
                              <option value="fit">等比例縮放</option>
                              <option value="fill">填滿指定尺寸</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium dual-text mb-2">圖片品質</label>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              value={config.photos.separate.photos.quality}
                              onChange={(e) => updateSeparateConfig({
                                photos: {
                                  ...config.photos.separate.photos,
                                  quality: parseInt(e.target.value)
                                }
                              })}
                              className="w-full"
                            />
                            <div className="text-xs text-muted text-center">{config.photos.separate.photos.quality}%</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'caption' && (
              <div className="p-6 space-y-6">
                {/* 啟用開關 */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="caption_enabled"
                    checked={config.caption.enabled}
                    onChange={(e) => updateCaptionConfig({ enabled: e.target.checked })}
                    className="rounded border-border focus:ring-primary/20 focus:border-primary"
                  />
                  <label htmlFor="caption_enabled" className="text-lg font-medium dual-text">啟用文案模板</label>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-medium text-blue-800 mb-2">文案模板說明</h3>
                  <p className="text-sm text-blue-700">設計 Instagram 發文時的文字內容格式，分為標頭、重複內容、結尾三個部分。</p>
                </div>

                {config.caption.enabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">標頭內容</label>
                      <input
                        type="text"
                        value={config.caption.header}
                        onChange={(e) => updateCaptionConfig({ header: e.target.value })}
                        placeholder="例如: 貼文 {id}"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                      />
                      <div className="text-xs text-muted mt-1">可用變數：{'{id}'}, {'{link}'}</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">重複內容</label>
                      <textarea
                        rows={3}
                        value={config.caption.content}
                        onChange={(e) => updateCaptionConfig({ content: e.target.value })}
                        placeholder="例如: {content}"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none font-mono"
                      />
                      <div className="text-xs text-muted mt-1">可用變數：{'{content}'}, {'{id}'}, {'{link}'}</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">結尾內容</label>
                      <input
                        type="text"
                        value={config.caption.footer}
                        onChange={(e) => updateCaptionConfig({ footer: e.target.value })}
                        placeholder="例如: {hashtags}"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                      />
                      <div className="text-xs text-muted mt-1">可用變數：{'{hashtags}'}, {'{id}'}, {'{link}'}</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">自動標籤</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {config.caption.autoHashtags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-muted/50 text-foreground rounded-full text-xs flex items-center gap-1"
                          >
                            {tag}
                            <button
                              onClick={() => updateCaptionConfig({
                                autoHashtags: config.caption.autoHashtags.filter((_, i) => i !== idx)
                              })}
                              className="text-muted hover:text-foreground"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="新增標籤..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const value = e.currentTarget.value.trim()
                              if (value && !config.caption.autoHashtags.includes(value)) {
                                updateCaptionConfig({ autoHashtags: [...config.caption.autoHashtags, value] })
                                e.currentTarget.value = ''
                              }
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dual-text mb-2">最大字數限制：{config.caption.maxLength}</label>
                      <input
                        type="range"
                        min={100}
                        max={2200}
                        value={config.caption.maxLength}
                        onChange={(e) => updateCaptionConfig({ maxLength: parseInt(e.target.value) })}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted mt-1">
                        <span>100</span>
                        <span>2200</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="includeOriginalLink"
                        checked={config.caption.includeOriginalLink}
                        onChange={(e) => updateCaptionConfig({ includeOriginalLink: e.target.checked })}
                        className="rounded border-border focus:ring-primary/20 focus:border-primary"
                      />
                      <label htmlFor="includeOriginalLink" className="text-sm dual-text">包含原始貼文連結</label>
                    </div>

                    {config.caption.includeOriginalLink && (
                      <div>
                        <label className="block text-sm font-medium dual-text mb-2">連結文字格式</label>
                        <input
                          type="text"
                          value={config.caption.linkText || ''}
                          onChange={(e) => updateCaptionConfig({ linkText: e.target.value })}
                          placeholder="查看完整內容：{link}"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                        />
                        <div className="text-xs text-muted mt-1">使用 {'{link}'} 來插入原始貼文連結</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right - Preview */}
          <div className="w-1/2 flex flex-col bg-muted/10">
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <h3 className="font-medium dual-text">即時預覽</h3>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* 貼文選擇器 */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">預覽數據來源</h4>
                {loadingPosts ? (
                  <div className="text-sm text-muted">載入貼文中...</div>
                ) : realPosts.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={selectedPostIndex}
                      onChange={(e) => setSelectedPostIndex(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                    >
                      {realPosts.map((post, index) => (
                        <option key={post.id} value={index}>
                          {post.id === 999 ? '(範例數據)' : `#${post.id}`} {post.title || '無標題'}
                          {post.title && post.title.length > 20 ? '...' : ''}
                        </option>
                      ))}
                    </select>
                    {currentPost && (
                      <div className="text-xs text-muted p-2 bg-gray-50 rounded">
                        <div><strong>ID:</strong> {currentPost.id}</div>
                        <div><strong>標題:</strong> {currentPost.title || '無標題'}</div>
                        <div><strong>作者:</strong> {currentPost.author || '未知'}</div>
                        <div><strong>學校:</strong> {currentPost.school?.name || '未設定'}</div>
                        <div><strong>內容:</strong> {(currentPost.content || '').substring(0, 50)}{currentPost.content && currentPost.content.length > 50 ? '...' : ''}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted">無可用貼文數據</div>
                )}
              </div>

              {/* 貼文模板實際預覽 */}
              {config.textToImage.enabled && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">貼文模板效果</h4>
                    <button
                      onClick={() => generatePreviewImage('textToImage')}
                      disabled={generating.textToImage || !currentPost}
                      className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      {generating.textToImage ? '生成中...' : '重新生成'}
                    </button>
                  </div>

                  {generating.textToImage ? (
                    <div className="border rounded-lg p-8 flex items-center justify-center bg-gray-50">
                      <div className="text-sm text-muted">生成預覽圖片中...</div>
                    </div>
                  ) : previewImages.textToImage ? (
                    <div className="space-y-2">
                      <img
                        src={previewImages.textToImage}
                        alt="貼文模板預覽"
                        className="border rounded-lg max-w-full h-auto"
                        style={{ maxHeight: '400px' }}
                      />
                      <div className="text-xs text-muted">
                        使用貼文: #{currentPost?.id} | 尺寸：{config.textToImage.width} × {config.textToImage.height}px
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg p-8 text-center bg-gray-50">
                      <div className="text-sm text-muted mb-2">尚無預覽圖片</div>
                      <button
                        onClick={() => generatePreviewImage('textToImage')}
                        disabled={!currentPost}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                      >
                        生成預覽
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 相片模板實際預覽 */}
              {config.photos.enabled && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">相片模板效果 ({config.photos.mode === 'combined' ? '合成模式' : '分開模式'})</h4>
                    <button
                      onClick={() => generatePreviewImage('photos')}
                      disabled={generating.photos || !currentPost}
                      className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      {generating.photos ? '生成中...' : '重新生成'}
                    </button>
                  </div>

                  {generating.photos ? (
                    <div className="border rounded-lg p-8 flex items-center justify-center bg-gray-50">
                      <div className="text-sm text-muted">生成相片模板預覽中...</div>
                    </div>
                  ) : previewImages.photos ? (
                    <div className="space-y-2">
                      <img
                        src={previewImages.photos}
                        alt="相片模板預覽"
                        className="border rounded-lg max-w-full h-auto"
                        style={{ maxHeight: '400px' }}
                      />
                      <div className="text-xs text-muted">
                        使用貼文: #{currentPost?.id} | 模式：{config.photos.mode}
                        {config.photos.mode === 'combined' && ` | 尺寸：${config.photos.combined.canvas.width} × ${config.photos.combined.canvas.height}px`}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg p-8 text-center bg-gray-50">
                      <div className="text-sm text-muted mb-2">尚無相片模板預覽</div>
                      <button
                        onClick={() => generatePreviewImage('photos')}
                        disabled={!currentPost}
                        className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                      >
                        生成預覽
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 文案模板即時預覽 */}
              {config.caption.enabled && currentPost && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">文案效果預覽</h4>
                  <div className="bg-gray-50 border rounded-lg p-4">
                    <div className="space-y-3 text-sm">
                      {/* 標頭 */}
                      {config.caption.header && (
                        <div className="font-medium text-gray-800">
                          {config.caption.header
                            .replace('{id}', currentPost.id.toString())
                            .replace('{link}', `https://example.com/post/${currentPost.id}`)}
                        </div>
                      )}

                      {/* 內容 */}
                      {config.caption.content && (
                        <div className="text-gray-700 leading-relaxed">
                          {config.caption.content
                            .replace('{content}', currentPost.content || '此貼文沒有內容')
                            .replace('{id}', currentPost.id.toString())
                            .replace('{link}', `https://example.com/post/${currentPost.id}`)}
                        </div>
                      )}

                      {/* 結尾 */}
                      {config.caption.footer && (
                        <div className="text-blue-600 text-sm">
                          {config.caption.footer
                            .replace('{hashtags}', config.caption.autoHashtags.join(' '))
                            .replace('{id}', currentPost.id.toString())
                            .replace('{link}', `https://example.com/post/${currentPost.id}`)}
                        </div>
                      )}

                      {/* 原始連結 */}
                      {config.caption.includeOriginalLink && config.caption.linkText && (
                        <div className="text-gray-500 text-sm border-t pt-2">
                          {config.caption.linkText.replace('{link}', `https://example.com/post/${currentPost.id}`)}
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-muted mt-3 pt-3 border-t">
                      字數統計：約 {[
                        config.caption.header?.replace('{id}', currentPost.id.toString()).replace('{link}', `https://example.com/post/${currentPost.id}`),
                        config.caption.content?.replace('{content}', currentPost.content || '此貼文沒有內容').replace('{id}', currentPost.id.toString()).replace('{link}', `https://example.com/post/${currentPost.id}`),
                        config.caption.footer?.replace('{hashtags}', config.caption.autoHashtags.join(' ')).replace('{id}', currentPost.id.toString()).replace('{link}', `https://example.com/post/${currentPost.id}`),
                        config.caption.includeOriginalLink && config.caption.linkText ? config.caption.linkText.replace('{link}', `https://example.com/post/${currentPost.id}`) : ''
                      ].filter(Boolean).join('\n\n').length} / {config.caption.maxLength} 字
                    </div>

                    <div className="text-xs text-muted mt-2">
                      使用貼文: #{currentPost.id} - {currentPost.title || '無標題'}
                    </div>
                  </div>
                </div>
              )}

              {/* 模板狀態總覽 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">模板狀態</h4>
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 p-2 rounded ${config.textToImage.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${config.textToImage.enabled ? 'bg-stone-500' : 'bg-gray-400'}`} />
                    <span className="text-sm">貼文模板</span>
                  </div>
                  <div className={`flex items-center gap-2 p-2 rounded ${config.photos.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${config.photos.enabled ? 'bg-stone-500' : 'bg-gray-400'}`} />
                    <span className="text-sm">相片模板</span>
                  </div>
                  <div className={`flex items-center gap-2 p-2 rounded ${config.caption.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${config.caption.enabled ? 'bg-stone-500' : 'bg-gray-400'}`} />
                    <span className="text-sm">文案模板</span>
                  </div>
                </div>

                <div className={`p-3 rounded-lg border-2 ${isTemplateComplete ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}`}>
                  <div className="text-sm font-medium mb-1">
                    {isTemplateComplete ? '配置完成' : '配置未完成'}
                  </div>
                  <div className="text-xs">
                    {isTemplateComplete
                      ? '所有模板均已啟用，可以儲存'
                      : '請啟用所有三個模板才能儲存'
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}