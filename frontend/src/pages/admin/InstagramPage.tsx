import { useState, useEffect } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import { ArrowLeft, Instagram, Plus, Settings, Play, Eye, Calendar, Hash, Image, Send, Clock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface InstagramAccount {
  id: number
  account_name: string
  username: string
  is_active: boolean
  school_id: number | null
  school_name: string
  has_token: boolean
}

interface InstagramTemplate {
  id: number
  name: string
  description: string
  background_color: string
  text_color: string
  accent_color: string
  is_default: boolean
  school_name: string
}

interface InstagramScheduler {
  id: number
  name: string
  trigger_type: 'count' | 'time' | 'manual'
  trigger_count?: number
  trigger_time?: string
  is_active: boolean
  school_name: string
  account_name: string
  template_name: string
}

interface InstagramStats {
  accounts: { total: number; active: number }
  templates: { total: number }
  posts: { total_published: number; pending: number; failed: number; recent_7days: number }
  queue: { pending: number }
}

export default function InstagramPage() {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'templates' | 'schedulers' | 'posts'>('overview')
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [templates, setTemplates] = useState<InstagramTemplate[]>([])
  const [schedulers, setSchedulers] = useState<InstagramScheduler[]>([])
  const [stats, setStats] = useState<InstagramStats | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [activeTab])

  const authed = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('token')
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
  }

  const loadData = async () => {
    try {
      setLoading(true)
      
      const [statsRes, accountsRes, templatesRes, schedulersRes] = await Promise.all([
        authed('/api/instagram/stats'),
        authed('/api/instagram/accounts'),
        authed('/api/instagram/templates'),
        authed('/api/instagram/schedulers')
      ])

      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data.data)
      }

      if (accountsRes.ok) {
        const data = await accountsRes.json()
        setAccounts(data.data)
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json()
        setTemplates(data.data)
      }

      if (schedulersRes.ok) {
        const data = await schedulersRes.json()
        setSchedulers(data.data)
      }
    } catch (error) {
      console.error('載入數據失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const OverviewTab = () => (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Instagram 帳號</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.accounts.active || 0}
              </p>
              <p className="text-xs text-gray-500">
                共 {stats?.accounts.total || 0} 個帳號
              </p>
            </div>
            <Instagram className="w-8 h-8 text-pink-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已發布貼文</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.posts.total_published || 0}
              </p>
              <p className="text-xs text-gray-500">
                7天內: {stats?.posts.recent_7days || 0}
              </p>
            </div>
            <Send className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">待處理佇列</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.queue.pending || 0}
              </p>
              <p className="text-xs text-gray-500">
                等待發送
              </p>
            </div>
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">可用模板</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.templates.total || 0}
              </p>
              <p className="text-xs text-gray-500">
                設計模板
              </p>
            </div>
            <Image className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">快速操作</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => setActiveTab('accounts')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Instagram className="w-6 h-6 text-pink-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">管理帳號</p>
            <p className="text-xs text-gray-500">{accounts.length} 個帳號</p>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Image className="w-6 h-6 text-purple-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">設計模板</p>
            <p className="text-xs text-gray-500">{templates.length} 個模板</p>
          </button>

          <button
            onClick={() => setActiveTab('schedulers')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Calendar className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">排程設定</p>
            <p className="text-xs text-gray-500">{schedulers.length} 個排程</p>
          </button>

          <button
            onClick={() => setActiveTab('posts')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Hash className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">貼文管理</p>
            <p className="text-xs text-gray-500">發送記錄</p>
          </button>
        </div>
      </div>

      {/* 最近活動 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">系統狀態</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">自動排程服務</span>
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
              運行中
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Instagram API 連線</span>
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
              正常
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">圖片生成服務</span>
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
              可用
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  const AccountsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Instagram 帳號</h3>
        {role === 'dev_admin' && (
          <button className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors">
            <Plus className="w-4 h-4" />
            新增帳號
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-200">
          {accounts.map((account) => (
            <div key={account.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                    <Instagram className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{account.account_name}</h4>
                    <p className="text-sm text-gray-500">@{account.username}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{account.school_name}</span>
                      {account.has_token && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
                          已連接
                        </span>
                      )}
                      {account.is_active && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                          活躍
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {accounts.length === 0 && (
          <div className="p-12 text-center">
            <Instagram className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">尚未設定 Instagram 帳號</p>
            <p className="text-sm text-gray-400 mt-2">新增帳號以開始自動發布貼文</p>
          </div>
        )}
      </div>
    </div>
  )

  const TemplatesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">貼文模板</h3>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
          <Plus className="w-4 h-4" />
          新增模板
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <div key={template.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* 模板預覽 */}
            <div 
              className="h-32 p-4 flex items-center justify-center text-white relative"
              style={{ backgroundColor: template.background_color }}
            >
              <div className="text-center">
                <h4 className="font-medium" style={{ color: template.text_color }}>
                  {template.name}
                </h4>
                <div className="w-16 h-1 mx-auto mt-2" style={{ backgroundColor: template.accent_color }} />
              </div>
              {template.is_default && (
                <div className="absolute top-2 right-2">
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    預設
                  </span>
                </div>
              )}
            </div>

            <div className="p-4">
              <h4 className="font-medium text-gray-900">{template.name}</h4>
              <p className="text-sm text-gray-500 mt-1">{template.description}</p>
              <p className="text-xs text-gray-400 mt-2">{template.school_name}</p>
              
              <div className="flex items-center justify-between mt-4">
                <div className="flex gap-1">
                  <div 
                    className="w-4 h-4 rounded-full border border-gray-200" 
                    style={{ backgroundColor: template.background_color }}
                    title="背景色"
                  />
                  <div 
                    className="w-4 h-4 rounded-full border border-gray-200" 
                    style={{ backgroundColor: template.text_color }}
                    title="文字色"
                  />
                  <div 
                    className="w-4 h-4 rounded-full border border-gray-200" 
                    style={{ backgroundColor: template.accent_color }}
                    title="強調色"
                  />
                </div>
                
                <div className="flex gap-1">
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Image className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">尚未建立貼文模板</p>
          <p className="text-sm text-gray-400 mt-2">建立模板以自訂 Instagram 貼文的外觀</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar pathname="/admin/instagram" />
      <MobileFabNav />

      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Instagram 整合</h1>
              <p className="text-sm text-gray-600">自動將通過審核的貼文發送到 Instagram</p>
            </div>
          </div>
        </div>

        {/* 標籤切換 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: '總覽', icon: '📊' },
                { id: 'accounts', label: 'IG 帳號', icon: '📱' },
                { id: 'templates', label: '貼文模板', icon: '🎨' },
                { id: 'schedulers', label: '排程設定', icon: '⏰' },
                { id: 'posts', label: '發送記錄', icon: '📋' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-3 text-gray-500">載入中...</span>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'accounts' && <AccountsTab />}
                {activeTab === 'templates' && <TemplatesTab />}
                {/* 其他標籤內容可以繼續添加 */}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}