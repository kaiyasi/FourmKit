import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Palette, Save, Upload, Download, Eye, Sparkles, Home } from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'

interface ThemeConfig {
  name: string
  description: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    surface: string
    text: string
    textMuted: string
    border: string
    success: string
    warning: string
    error: string
  }
  fonts: {
    heading: string
    body: string
    mono: string
  }
  borderRadius: string
  spacing: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
  }
  shadows: {
    sm: string
    md: string
    lg: string
  }
  animations: {
    duration: string
    easing: string
  }
}

const defaultTheme: ThemeConfig = {
  name: "自訂主題",
  description: "由您設計的專屬主題",
  colors: {
    primary: "#3b82f6",
    secondary: "#6366f1",
    accent: "#f59e0b",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#1f2937",
    textMuted: "#6b7280",
    border: "#e5e7eb",
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444"
  },
  fonts: {
    heading: "system-ui, -apple-system, sans-serif",
    body: "system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace"
  },
  borderRadius: "0.75rem",
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem"
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)"
  },
  animations: {
    duration: "150ms",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)"
  }
}

export default function ThemeDesignerPage() {
  const { isLoggedIn, username } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme)
  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'layout' | 'effects'>('colors')
  const [previewMode, setPreviewMode] = useState(false)
  const [savedThemes, setSavedThemes] = useState<ThemeConfig[]>([])

  useEffect(() => {
    // 載入已儲存的主題
    try {
      const saved = localStorage.getItem('forumkit_custom_themes')
      if (saved) {
        setSavedThemes(JSON.parse(saved))
      }
    } catch (e) {
      console.error('載入主題失敗:', e)
    }
  }, [])

  const updateTheme = (path: string, value: string) => {
    setTheme(prev => {
      const updated = { ...prev }
      const keys = path.split('.')
      let current: any = updated
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value
      return updated
    })
  }

  const applyTheme = () => {
    const root = document.documentElement
    // 對齊現有主題系統（theme.css）的 CSS 變數
    try {
      root.style.setProperty('--primary', theme.colors.primary)
      root.style.setProperty('--bg', theme.colors.background)
      root.style.setProperty('--surface', theme.colors.surface)
      root.style.setProperty('--border', theme.colors.border)
      root.style.setProperty('--fg', theme.colors.text)
      root.style.setProperty('--muted', theme.colors.textMuted)
      // 輔助/訊息色彩（非必填）
      root.style.setProperty('--success', theme.colors.success)
      root.style.setProperty('--warning', theme.colors.warning)
      root.style.setProperty('--danger', theme.colors.error)
      // 字體與圓角
      root.style.setProperty('--font-heading', theme.fonts.heading)
      root.style.setProperty('--font-body', theme.fonts.body)
      root.style.setProperty('--font-mono', theme.fonts.mono)
      root.style.setProperty('--border-radius', theme.borderRadius)
      // 動畫
      root.style.setProperty('--animation-duration', theme.animations.duration)
      root.style.setProperty('--animation-easing', theme.animations.easing)
    } catch {}
  }

  // 從目前主題變數讀取，作為初始值（避免硬編碼）
  useEffect(() => {
    try {
      const root = document.documentElement
      const get = (v: string) => getComputedStyle(root).getPropertyValue(v).trim() || undefined
      const next = { ...theme }
      next.colors.primary = get('--primary') || next.colors.primary
      next.colors.background = get('--bg') || next.colors.background
      next.colors.surface = get('--surface') || next.colors.surface
      next.colors.border = get('--border') || next.colors.border
      next.colors.text = get('--fg') || next.colors.text
      next.colors.textMuted = get('--muted') || next.colors.textMuted
      setTheme(next)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveThemeToProfile = async () => {
    if (!isLoggedIn) {
      alert('請先登入以儲存主題')
      return
    }

    try {
      const existing = savedThemes.filter(t => t.name !== theme.name)
      const updated = [...existing, theme]
      setSavedThemes(updated)
      localStorage.setItem('forumkit_custom_themes', JSON.stringify(updated))
      alert('主題已儲存至個人資料！')
    } catch (e) {
      alert('儲存失敗，請檢查瀏覽器設定')
    }
  }

  const submitToPlatform = async () => {
    try {
      // 使用統一的平台 API 提交主題提案
      const payload = {
        name: theme.name,
        description: theme.description || "由主題設計工具創建的主題",
        colors: {
          primary: theme.colors.primary,
          secondary: theme.colors.secondary,
          accent: theme.colors.accent,
          background: theme.colors.background,
          surface: theme.colors.surface,
          text: theme.colors.text,
          textMuted: theme.colors.textMuted,
          border: theme.colors.border,
          success: theme.colors.success,
          warning: theme.colors.warning,
          error: theme.colors.error
        },
        fonts: theme.fonts,
        borderRadius: theme.borderRadius,
        spacing: theme.spacing,
        shadows: theme.shadows,
        animations: theme.animations,
        author: user?.username || "匿名用戶",
        source: "theme_designer"
      }

      const response = await fetch('/api/color_vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()
      
      if (result.ok) {
        const deliveryStatus = result.delivery === 'discord' ? '已成功發送到 Discord' : '已儲存到本地'
        alert(`主題已提交給開發團隊審核！\n狀態：${deliveryStatus}`)
      } else {
        alert(`提交失敗：${result.error || '未知錯誤'}`)
      }
    } catch (e) {
      console.error('主題提交失敗:', e)
      alert('提交失敗，請檢查網路連線')
    }
  }

  const exportTheme = () => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${theme.name.replace(/[^a-zA-Z0-9]/g, '_')}_theme.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importTheme = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string)
        setTheme({ ...defaultTheme, ...imported })
        alert('主題匯入成功！')
      } catch (e) {
        alert('主題檔案格式錯誤')
      }
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (previewMode) {
      applyTheme()
    }
  }, [theme, previewMode])

  const ColorInput = ({ label, path, value }: { label: string, path: string, value: string }) => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-fg">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => updateTheme(path, e.target.value)}
          className="w-12 h-10 rounded border border-border bg-surface"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => updateTheme(path, e.target.value)}
          className="form-control flex-1"
          placeholder="#000000"
        />
      </div>
    </div>
  )

  return (
    <PageLayout pathname="/theme-designer" maxWidth="max-w-5xl">
        {/* 頁首卡片 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface/70 border border-border grid place-items-center">
                <Palette className="w-5 h-5 text-fg" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold dual-text">主題設計工具</h1>
                <p className="text-sm text-muted">對齊平台色系與元件風格</p>
              </div>
            </div>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="btn-ghost px-3 py-2 text-sm flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              {previewMode ? '停止預覽' : '即時預覽'}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 設計面板 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本資訊 */}
            <div className="bg-surface rounded-2xl border border-border p-6 shadow-soft">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-fg">
                <Sparkles className="w-5 h-5 text-fg" />
                主題資訊
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">主題名稱</label>
                  <input
                    type="text"
                    value={theme.name}
                    onChange={(e) => updateTheme('name', e.target.value)}
                    className="form-control w-full"
                    placeholder="我的專屬主題"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">主題描述</label>
                  <input
                    type="text"
                    value={theme.description}
                    onChange={(e) => updateTheme('description', e.target.value)}
                    className="form-control w-full"
                    placeholder="簡短描述您的主題"
                  />
                </div>
              </div>
            </div>

            {/* 設計選項 */}
            <div className="bg-surface rounded-2xl border border-border shadow-soft">
              <div className="border-b border-border">
                <nav className="flex">
                  {[
                    { key: 'colors', label: '色彩配置', icon: '🎨' },
                    { key: 'typography', label: '字體設定', icon: '📝' },
                    { key: 'layout', label: '佈局樣式', icon: '📐' },
                    { key: 'effects', label: '效果動畫', icon: '✨' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.key 
                          ? 'border-primary text-primary' 
                          : 'border-transparent text-muted hover:text-fg'
                      }`}
                    >
                      <span className="mr-2">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-6">
                {activeTab === 'colors' && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="font-medium text-fg">主要色彩</h3>
                      <ColorInput label="主色調" path="colors.primary" value={theme.colors.primary} />
                      <ColorInput label="輔助色" path="colors.secondary" value={theme.colors.secondary} />
                      <ColorInput label="強調色" path="colors.accent" value={theme.colors.accent} />
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-medium text-fg">背景色彩</h3>
                      <ColorInput label="背景色" path="colors.background" value={theme.colors.background} />
                      <ColorInput label="卡片色" path="colors.surface" value={theme.colors.surface} />
                      <ColorInput label="邊框色" path="colors.border" value={theme.colors.border} />
                    </div>
                  </div>
                )}

                {activeTab === 'typography' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-2">標題字體</label>
                      <input
                        type="text"
                        value={theme.fonts.heading}
                        onChange={(e) => updateTheme('fonts.heading', e.target.value)}
                        className="form-control w-full"
                        placeholder="system-ui, -apple-system, sans-serif"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-2">內文字體</label>
                      <input
                        type="text"
                        value={theme.fonts.body}
                        onChange={(e) => updateTheme('fonts.body', e.target.value)}
                        className="form-control w-full"
                        placeholder="system-ui, -apple-system, sans-serif"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-2">等寬字體</label>
                      <input
                        type="text"
                        value={theme.fonts.mono}
                        onChange={(e) => updateTheme('fonts.mono', e.target.value)}
                        className="form-control w-full"
                        placeholder="'JetBrains Mono', 'Fira Code', monospace"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'layout' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-2">圓角大小</label>
                      <input
                        type="text"
                        value={theme.borderRadius}
                        onChange={(e) => updateTheme('borderRadius', e.target.value)}
                        className="form-control w-full"
                        placeholder="0.75rem"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'effects' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-2">動畫時間</label>
                      <input
                        type="text"
                        value={theme.animations.duration}
                        onChange={(e) => updateTheme('animations.duration', e.target.value)}
                        className="form-control w-full"
                        placeholder="150ms"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-2">緩動效果</label>
                      <input
                        type="text"
                        value={theme.animations.easing}
                        onChange={(e) => updateTheme('animations.easing', e.target.value)}
                        className="form-control w-full"
                        placeholder="cubic-bezier(0.4, 0, 0.2, 1)"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 操作面板 */}
          <div className="space-y-6">
            {/* 預覽區 */}
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft">
              <h3 className="font-medium text-fg mb-3">主題預覽</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded" 
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <span>主色調</span>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded" 
                    style={{ backgroundColor: theme.colors.secondary }}
                  />
                  <span>輔助色</span>
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded" 
                    style={{ backgroundColor: theme.colors.accent }}
                  />
                  <span>強調色</span>
                </div>
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="bg-surface rounded-2xl border border-border p-4 space-y-3 shadow-soft">
              <h3 className="font-medium text-fg">操作選項</h3>
              
              <button
                onClick={saveThemeToProfile}
                disabled={!isLoggedIn}
                className="btn-primary w-full px-4 py-2 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                儲存至個人資料
              </button>

              <button
                onClick={submitToPlatform}
                className="btn-ghost w-full px-4 py-2 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                提交給平台 Webhook
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={exportTheme}
                  className="btn-ghost flex-1 px-3 py-2 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  匯出
                </button>
                <label className="btn-ghost flex-1 px-3 py-2 flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  匯入
                  <input
                    type="file"
                    accept=".json"
                    onChange={importTheme}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* 已儲存的主題 */}
            {savedThemes.length > 0 && (
              <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft">
                <h3 className="font-medium text-fg mb-3">已儲存的主題</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {savedThemes.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTheme(t)}
                      className="w-full text-left p-3 rounded-xl border border-border bg-surface hover:bg-surface-hover"
                    >
                      <div className="font-medium text-sm text-fg">{t.name}</div>
                      <div className="text-xs text-muted">{t.description}</div>
                      <div className="flex gap-1 mt-2">
                        {[t.colors.primary, t.colors.secondary, t.colors.accent].map((color, cidx) => (
                          <div
                            key={cidx}
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 使用說明 */}
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft">
              <h3 className="font-medium text-fg mb-2">使用說明</h3>
                             <ul className="text-sm text-muted space-y-1">
                 <li>• 修改設定後點擊「即時預覽」查看效果</li>
                 <li>• 登入用戶可將主題儲存至個人資料</li>
                 <li>• 「提交給平台 Webhook」會將完整主題配置（顏色、字體、間距、陰影、動畫）發送給開發團隊審核</li>
                 <li>• 可匯出主題檔案分享給其他用戶</li>
               </ul>
            </div>
          </div>
        </div>
      </PageLayout>
    )
  }
