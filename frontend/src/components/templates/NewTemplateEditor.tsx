import React, { useState, useEffect, useCallback } from 'react'
import { X, Save, ChevronLeft, ChevronRight } from 'lucide-react'

// 導入步驟組件
import TemplateInfoStep from './steps/TemplateInfoStep'
import PostTemplateStep from './steps/PostTemplateStep'
// 相片模板已合併到貼文模板（移除專用步驟）
import NewCaptionTemplateStep from './steps/NewCaptionTemplateStep'
import IGPreview from './IGPreview'

// 保留核心類型定義，但簡化結構
type TextAlign = 'left' | 'center' | 'right'
type TextVAlign = 'top' | 'middle' | 'bottom'
type TextPosition = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom'

interface TemplateInfo {
  name: string
  description: string
  account_id: number
  is_default: boolean
  created_at?: string
  updated_at?: string
  usage_count?: number
}

interface PostTemplateConfig {
  enabled: boolean
  text: {
    font: string
    size: number
    color: string
    position: TextPosition
    customPosition?: { x: number; y: number }
    align: TextAlign
    vAlign: TextVAlign
    lineHeight: number
  }
  logo: {
    enabled: boolean
    url?: string
    size: number
    position: TextPosition
    customPosition?: { x: number; y: number }
    opacity: number
  }
  metadata: {
    showTimestamp: boolean
    showPostId: boolean
    timestampFormat: 'relative' | 'absolute'
    timestampPosition: TextPosition
    postIdPosition: TextPosition
    metadataStyle: {
      font: string
      size: number
      color: string
    }
  }
  // 合併相片設定（相片顯示區塊）：大小與圓角
  imageBox?: {
    size: number
    borderRadius: number
  }
  // 文字排版設定
  textLayout?: {
    textOnly: {
      maxCharsPerLine: number
      maxLines: number
    }
    withPhoto: {
      maxCharsPerLine: number
      maxLines: number
      textPos?: { x: number; y: number } // %
      imagePos?: { x: number; y: number } // %
      stacked?: boolean
    }
  }
}

interface PhotoTemplateConfig {
  enabled: boolean
  maxPhotos: 1 | 2 | 3 | 4
  layout: 'single' | 'side-by-side' | 'grid' | 'custom'
  effects: {
    borderRadius: number
    borderWidth: number
    borderColor: string
    shadow: boolean
    shadowBlur: number
  }
  textOverlay: {
    enabled: boolean
    position: 'top' | 'bottom' | 'overlay'
    style: PostTemplateConfig['text']
  }
  quality: number
  logo: {
    enabled: boolean
    url?: string
    size: number
    position: TextPosition
    customPosition?: { x: number; y: number }
    opacity: number
  }
  metadata: {
    showTimestamp: boolean
    showPostId: boolean
    timestampFormat: 'relative' | 'absolute'
    timestampPosition: TextPosition
    postIdPosition: TextPosition
    metadataStyle: {
      font: string
      size: number
      color: string
    }
  }
}

interface CaptionTemplateConfig {
  enabled: boolean
  // 重複區段 (每張輪播圖片都有)
  repeating: {
    idFormat: {
      enabled: boolean
      format: string // 例如: "貼文 #{id}"
    }
    content: {
      enabled: boolean
      template: string // 例如: "{content}"
    }
    separator: {
      enabled: boolean
      style: string // 例如: "━━━━━━━━━━"
    }
  }
  // 單次顯示區段
  single: {
    header: {
      enabled: boolean
      content: string
      position: 'first' | 'last' // 顯示在第一張或最後一張
    }
    footer: {
      enabled: boolean
      content: string
      position: 'first' | 'last'
      customLink?: string // 自定義連結，用於結尾區段的 {link} 變數
    }
  }
  hashtags: {
    enabled: boolean
    tags: string[]
    position: 'header' | 'footer' | 'separate'
    maxTags: number
  }
  maxLength: number
}

interface TemplateConfig {
  info: TemplateInfo
  canvas: {
    width: number
    height: number
    background: string
  }
  post: PostTemplateConfig
  photo: PhotoTemplateConfig
  caption: CaptionTemplateConfig
}

interface SocialAccount {
  id: number
  platform_username: string
  display_name: string
}

interface NewTemplateEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (template: TemplateConfig) => void
  accounts: SocialAccount[]
  editingTemplate?: any
}

// 默認配置
const DEFAULT_TEMPLATE: TemplateConfig = {
  info: {
    name: '',
    description: '',
    account_id: 0,
    is_default: false
  },
  canvas: {
    width: 1080,
    height: 1080,
    background: '#ffffff'
  },
  post: {
    enabled: true,
    text: {
      font: 'Noto Sans TC',
      size: 32,
      color: '#333333',
      position: 'center',
      align: 'center',
      vAlign: 'middle',
      lineHeight: 1.5
    },
    logo: {
      enabled: false, // 預設關閉 LOGO，等待用戶上傳
      size: 80,
      position: 'bottom-right',
      opacity: 0.85,
      url: '' // 用戶透過模板編輯器上傳
    },
    metadata: {
      showTimestamp: true,
      showPostId: true, // 預設啟用貼文ID 顯示
      timestampFormat: 'relative',
      postIdFormat: '#{ID}', // 添加預設貼文ID格式
      timestampPosition: 'bottom-left',
      postIdPosition: 'bottom-right',
      timestampStyle: {
        font: 'Noto Sans TC',
        size: 18,
        color: '#666666'
      },
      postIdStyle: {
        font: 'Noto Sans TC',
        size: 18,
        color: '#666666'
      }
    },
    imageBox: {
      size: 380,
      borderRadius: 12
    }
  },
  photo: {
    enabled: true,
    maxPhotos: 4,
    layout: 'single',
    effects: {
      borderRadius: 8,
      borderWidth: 0,
      borderColor: '#e5e7eb',
      shadow: false,
      shadowBlur: 4
    },
    textOverlay: {
      enabled: true,
      position: 'bottom',
      style: {
        font: 'Noto Sans TC',
        size: 24,
        color: '#333333',
        position: 'center',
        align: 'center',
        vAlign: 'middle',
        lineHeight: 1.4
      }
    },
    quality: 85,
    logo: {
      enabled: false,
      size: 80,
      position: 'bottom-right',
      opacity: 0.85
    },
    metadata: {
      showTimestamp: true,
      showPostId: false,
      timestampFormat: 'relative',
      postIdFormat: '#{ID}', // 添加預設貼文ID格式
      timestampPosition: 'bottom-left',
      postIdPosition: 'bottom-right',
      timestampStyle: {
        font: 'Noto Sans TC',
        size: 18,
        color: '#666666'
      },
      postIdStyle: {
        font: 'Noto Sans TC',
        size: 18,
        color: '#666666'
      }
    }
  },
  caption: {
    enabled: true,
    repeating: {
      idFormat: {
        enabled: true,
        format: '貼文 #{id}'
      },
      content: {
        enabled: true,
        template: '{content}'
      },
      separator: {
        enabled: true,
        style: '━━━━━━━━━━'
      }
    },
    single: {
      header: {
        enabled: true,
        content: '歡迎查看本篇貼文',
        position: 'first'
      },
      footer: {
        enabled: true,
        content: '查看完整內容：{link}',
        position: 'last',
        customLink: 'https://forum.serelix.xyz'
      }
    },
    hashtags: {
      enabled: true,
      tags: ['#校園生活', '#學生分享'],
      position: 'footer',
      maxTags: 5
    },
    maxLength: 2000
  }
}

// 步驟定義（相片模板已合併到貼文模板）
const STEPS = [
  { id: 'info', title: '模板資訊', desc: '基本設定' },
  { id: 'post', title: '貼文模板', desc: '文字轉圖片' },
  { id: 'caption', title: '文案模板', desc: 'IG文案格式' }
] as const

type StepId = typeof STEPS[number]['id']

export default function NewTemplateEditor({
  isOpen,
  onClose,
  onSave,
  accounts,
  editingTemplate
}: NewTemplateEditorProps) {
  const [currentStep, setCurrentStep] = useState<StepId>('info')
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE)
  const [saving, setSaving] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)

  useEffect(() => {
    if (editingTemplate && accounts.length > 0) {
      // Deep merge default config with editingTemplate
      const mergedConfig = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));

      const deepMerge = (target: any, source: any) => {
        for (const key in source) {
          if (source[key] instanceof Object && key in target) {
            Object.assign(source[key], deepMerge(target[key], source[key]))
          }
        }
        Object.assign(target || {}, source)
        return target
      }

      // 先處理 config 的合併
      if (editingTemplate.config) {
        console.log('[DEBUG] editingTemplate.config:', editingTemplate.config)
        if (editingTemplate.config.caption) {
          console.log('[DEBUG] editingTemplate.config.caption:', editingTemplate.config.caption)
          mergedConfig.caption = { ...mergedConfig.caption, ...editingTemplate.config.caption }
        }
        if (editingTemplate.config.canvas) {
          mergedConfig.canvas = { ...mergedConfig.canvas, ...editingTemplate.config.canvas }
        }
        if (editingTemplate.config.post) {
          mergedConfig.post = { ...mergedConfig.post, ...editingTemplate.config.post }
        }
        if (editingTemplate.config.photo) {
          mergedConfig.photo = { ...mergedConfig.photo, ...editingTemplate.config.photo }
        }
      }

      deepMerge(mergedConfig, editingTemplate);

      // Migrate old metadataStyle if it exists
      const migrateMetadata = (metadata: any) => {
        if (metadata && metadata.metadataStyle) {
          metadata.timestampStyle = { ...metadata.metadataStyle, ...(metadata.timestampStyle || {}) };
          metadata.postIdStyle = { ...metadata.metadataStyle, ...(metadata.postIdStyle || {}) };
          delete metadata.metadataStyle;
        }
        return metadata;
      };

      if (mergedConfig.post?.metadata) {
        mergedConfig.post.metadata = migrateMetadata(mergedConfig.post.metadata);
      }
      if (mergedConfig.photo?.metadata) {
        mergedConfig.photo.metadata = migrateMetadata(mergedConfig.photo.metadata);
      }

      // Ensure account_id is correctly set
      mergedConfig.info.account_id = editingTemplate.account_id || accounts[0]?.id || 0;

      // Fix: Ensure template info (name, description) is correctly filled from editingTemplate
      if (editingTemplate.name) {
        mergedConfig.info.name = editingTemplate.name;
      }
      if (editingTemplate.description) {
        mergedConfig.info.description = editingTemplate.description;
      }
      if (editingTemplate.is_default !== undefined) {
        mergedConfig.info.is_default = editingTemplate.is_default;
      }
      // Also copy metadata if available
      if (editingTemplate.created_at) {
        mergedConfig.info.created_at = editingTemplate.created_at;
      }
      if (editingTemplate.updated_at) {
        mergedConfig.info.updated_at = editingTemplate.updated_at;
      }
      if (editingTemplate.usage_count !== undefined) {
        mergedConfig.info.usage_count = editingTemplate.usage_count;
      }

      setTemplateConfig(mergedConfig);

    } else if (accounts.length > 0) {
      setTemplateConfig(prev => ({
        ...prev,
        info: {
          ...prev.info,
          account_id: accounts[0].id
        }
      }))
    }
  }, [editingTemplate, accounts])

  // 載入平台真實貼文數據用於預覽
  useEffect(() => {
    const loadSamplePost = async () => {
      try {
        const response = await fetch('/api/admin/social/posts/sample?limit=1', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        const result = await response.json()

        if (result.success && result.posts && result.posts.length > 0) {
          setPreviewData(result.posts[0])
        } else {
          // 如果沒有真實貼文，設為 null，讓 IGPreview 顯示提示
          setPreviewData(null)
        }
      } catch (error) {
        console.warn('無法載入範例貼文，使用空狀態:', error)
        setPreviewData(null)
      }
    }

    loadSamplePost()
  }, [])

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

  const updateTemplateConfig = useCallback((updates: Partial<TemplateConfig>) => {
    setTemplateConfig(prev => ({
      ...prev,
      ...updates
    }))
  }, [])

  const handleSave = async () => {
    // 驗證必填欄位
    if (!templateConfig.info.name.trim()) {
      alert('請輸入模板名稱')
      return
    }

    setSaving(true)
    try {
      await onSave(templateConfig)
      onClose()
    } catch (error) {
      console.error('Save failed:', error)
      alert('儲存失敗，請稍後重試')
    } finally {
      setSaving(false)
    }
  }

  const canGoNext = () => {
    const currentIndex = STEPS.findIndex(step => step.id === currentStep)
    return currentIndex < STEPS.length - 1
  }

  const canGoPrev = () => {
    const currentIndex = STEPS.findIndex(step => step.id === currentStep)
    return currentIndex > 0
  }

  const goNext = () => {
    if (canGoNext()) {
      const currentIndex = STEPS.findIndex(step => step.id === currentStep)
      setCurrentStep(STEPS[currentIndex + 1].id)
    }
  }

  const goPrev = () => {
    if (canGoPrev()) {
      const currentIndex = STEPS.findIndex(step => step.id === currentStep)
      setCurrentStep(STEPS[currentIndex - 1].id)
    }
  }

  if (!isOpen) return null

  const currentStepIndex = STEPS.findIndex(step => step.id === currentStep)
  const currentStepData = STEPS[currentStepIndex]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
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
        className="bg-surface border border-border rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold dual-text">
              {editingTemplate ? '編輯模板' : '建立新模板'}
            </h1>
            <div className="text-sm text-muted">
              步驟 {currentStepIndex + 1} / {STEPS.length}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`flex-1 text-center py-2 px-4 rounded-lg transition-colors ${
                  currentStep === step.id
                    ? 'bg-primary text-primary-foreground'
                    : index < currentStepIndex
                    ? 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    : 'text-muted hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <div className="font-medium">{step.title}</div>
                <div className="text-xs opacity-70">{step.desc}</div>
              </button>
            ))}
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left Panel - Settings */}
          <div className="w-1/2 overflow-y-auto border-r border-border">
            <div className="p-4">
              <div className="mb-6">
                <h2 className="text-xl font-semibold dual-text mb-2">{currentStepData.title}</h2>
                <p className="text-muted">{currentStepData.desc}</p>
              </div>

              {/* 動態載入對應的設定組件 */}
              {currentStep === 'info' && (
                <TemplateInfoStep
                  templateInfo={templateConfig.info}
                  accounts={accounts}
                  onUpdate={(updates) => updateTemplateConfig({ info: { ...templateConfig.info, ...updates } })}
                  isEditing={!!editingTemplate}
                />
              )}
              {currentStep === 'post' && (
                <PostTemplateStep
                  config={templateConfig.post}
                  canvas={templateConfig.canvas}
                  onUpdate={(updates) => updateTemplateConfig({ post: { ...templateConfig.post, ...updates } })}
                  onCanvasUpdate={(updates) => updateTemplateConfig({ canvas: { ...templateConfig.canvas, ...updates } })}
                />
              )}
              {/* 相片模板步驟已移除，合併到貼文模板 */}
              {currentStep === 'caption' && (
                <NewCaptionTemplateStep
                  config={templateConfig.caption}
                  onUpdate={(updates) => updateTemplateConfig({ caption: { ...templateConfig.caption, ...updates } })}
                />
              )}
            </div>
          </div>

          {/* Right Panel - IG Preview */}
          <div className="w-1/2 bg-muted/10 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-lg font-semibold dual-text mb-4">📱 即時預覽</h3>

              <IGPreview
                templateConfig={templateConfig}
                accounts={accounts}
                selectedPost={previewData}
                onPostChange={setPreviewData}
                onRegeneratePreview={() => {
                  // 重新生成預覽邏輯
                  console.log('重新生成預覽')
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t border-border bg-muted/30">
          <button
            onClick={goPrev}
            disabled={!canGoPrev()}
            className="flex items-center gap-2 px-4 py-2 text-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            上一步
          </button>

          <div className="flex items-center gap-3">
            {currentStep === 'caption' ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                儲存模板
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                下一步
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
