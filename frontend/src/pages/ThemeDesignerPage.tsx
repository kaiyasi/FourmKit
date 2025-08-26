import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Palette, Save, Upload, Download, Eye, Sparkles, Home } from 'lucide-react'

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
  const { isLoggedIn, user } = useAuth()
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
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value)
    })
    root.style.setProperty('--border-radius', theme.borderRadius)
    root.style.setProperty('--font-heading', theme.fonts.heading)
    root.style.setProperty('--font-body', theme.fonts.body)
    root.style.setProperty('--font-mono', theme.fonts.mono)
    root.style.setProperty('--animation-duration', theme.animations.duration)
    root.style.setProperty('--animation-easing', theme.animations.easing)
  }

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
      const webhookUrl = process.env.REACT_APP_DISCORD_WEBHOOK_URL || localStorage.getItem('discord_webhook_url')
      if (!webhookUrl) {
        alert('未設定 Discord Webhook，無法提交到平台')
        return
      }

      const payload = {
        embeds: [{
          title: "🎨 新主題提交",
          description: `用戶提交了新的主題設計`,
          color: parseInt(theme.colors.primary.replace('#', ''), 16),
          fields: [
            { name: "主題名稱", value: theme.name, inline: true },
            { name: "作者", value: user?.username || "匿名用戶", inline: true },
            { name: "說明", value: theme.description || "無說明", inline: false },
            { name: "主色調", value: theme.colors.primary, inline: true },
            { name: "輔助色", value: theme.colors.secondary, inline: true },
            { name: "強調色", value: theme.colors.accent, inline: true }
          ],
          timestamp: new Date().toISOString(),
          footer: { text: "ForumKit 主題設計工具 by Serelix Studio" }
        }],
        content: `\`\`\`json\n${JSON.stringify(theme, null, 2)}\n\`\`\``
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      alert('主題已提交給開發團隊審核！')
    } catch (e) {
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
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => updateTheme(path, e.target.value)}
          className="w-12 h-10 rounded border border-gray-300"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => updateTheme(path, e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
          placeholder="#000000"
        />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
                <Home className="w-5 h-5" />
              </button>
              <Palette className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">ForumKit 主題設計工具</h1>
                <p className="text-sm text-gray-600">設計屬於您的專屬主題</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  previewMode ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-4 h-4" />
                {previewMode ? '停止預覽' : '即時預覽'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* 設計面板 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本資訊 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                主題資訊
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">主題名稱</label>
                  <input
                    type="text"
                    value={theme.name}
                    onChange={(e) => updateTheme('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="我的專屬主題"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">主題描述</label>
                  <input
                    type="text"
                    value={theme.description}
                    onChange={(e) => updateTheme('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="簡短描述您的主題"
                  />
                </div>
              </div>
            </div>

            {/* 設計選項 */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="border-b border-gray-200">
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
                          ? 'border-blue-500 text-blue-600' 
                          : 'border-transparent text-gray-500 hover:text-gray-700'
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
                      <h3 className="font-medium text-gray-900">主要色彩</h3>
                      <ColorInput label="主色調" path="colors.primary" value={theme.colors.primary} />
                      <ColorInput label="輔助色" path="colors.secondary" value={theme.colors.secondary} />
                      <ColorInput label="強調色" path="colors.accent" value={theme.colors.accent} />
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900">背景色彩</h3>
                      <ColorInput label="背景色" path="colors.background" value={theme.colors.background} />
                      <ColorInput label="卡片色" path="colors.surface" value={theme.colors.surface} />
                      <ColorInput label="邊框色" path="colors.border" value={theme.colors.border} />
                    </div>
                  </div>
                )}

                {activeTab === 'typography' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">標題字體</label>
                      <input
                        type="text"
                        value={theme.fonts.heading}
                        onChange={(e) => updateTheme('fonts.heading', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="system-ui, -apple-system, sans-serif"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">內文字體</label>
                      <input
                        type="text"
                        value={theme.fonts.body}
                        onChange={(e) => updateTheme('fonts.body', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="system-ui, -apple-system, sans-serif"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">等寬字體</label>
                      <input
                        type="text"
                        value={theme.fonts.mono}
                        onChange={(e) => updateTheme('fonts.mono', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="'JetBrains Mono', 'Fira Code', monospace"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'layout' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">圓角大小</label>
                      <input
                        type="text"
                        value={theme.borderRadius}
                        onChange={(e) => updateTheme('borderRadius', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="0.75rem"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'effects' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">動畫時間</label>
                      <input
                        type="text"
                        value={theme.animations.duration}
                        onChange={(e) => updateTheme('animations.duration', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="150ms"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">緩動效果</label>
                      <input
                        type="text"
                        value={theme.animations.easing}
                        onChange={(e) => updateTheme('animations.easing', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">主題預覽</h3>
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
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-medium text-gray-900">操作選項</h3>
              
              <button
                onClick={saveThemeToProfile}
                disabled={!isLoggedIn}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                儲存至個人資料
              </button>
              
              <button
                onClick={submitToPlatform}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                提交給平台
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={exportTheme}
                  className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  匯出
                </button>
                <label className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 cursor-pointer">
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
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-3">已儲存的主題</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {savedThemes.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTheme(t)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-gray-600">{t.description}</div>
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
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h3 className="font-medium text-blue-900 mb-2">使用說明</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 修改設定後點擊「即時預覽」查看效果</li>
                <li>• 登入用戶可將主題儲存至個人資料</li>
                <li>• 「提交給平台」會將主題發送給開發團隊</li>
                <li>• 可匯出主題檔案分享給其他用戶</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}