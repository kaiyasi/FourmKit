import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { getRole } from '@/utils/auth'
import { ArrowLeft, Instagram, Plus, Settings, RefreshCw, Eye, Edit, Trash2, Play, AlertTriangle, CheckCircle, XCircle, Clock, BarChart3 } from 'lucide-react'
import InstagramTemplatePreview from '@/components/admin/InstagramTemplatePreview'

interface InstagramAccount {
  id: number
  account_name: string
  school_name: string
  school_id: number
  ig_user_id: string
  page_id: string
  enabled: boolean
  post_interval_count: number
  post_interval_hours: number
  daily_limit: number
  today_posts: number
  token_expires_at: string
  is_token_valid: boolean
  created_at: string
}

interface School {
  id: number
  name: string
  slug: string
}

interface InstagramPost {
  id: number
  account_name: string
  school_name: string
  status: string
  caption: string
  image_path: string
  ig_post_id: string
  error_message: string
  retry_count: number
  published_at: string
  created_at: string
  forum_posts_count: number
}

interface InstagramTemplate {
  id: number
  name: string
  is_default: boolean
  layout: any
  text_font: string
  text_size: number
  text_color: string
  text_position: string
  logo_enabled: boolean
  logo_position: string
  logo_size: number
  background_type: string
  background_color: string
  background_image?: string
  overlay_enabled: boolean
  overlay_color: string
  overlay_opacity: number
  overlay_size: any
  overlay_radius: number
  timestamp_enabled: boolean
  timestamp_format: string
  timestamp_position: string
  timestamp_size: number
  timestamp_color: string
  caption_template: string
  created_at: string
  updated_at: string
}

interface InstagramStats {
  total_accounts: number
  today_posts: number
  month_posts: number
  failed_posts: number
  status_stats: Record<string, number>
}

export default function InstagramManagement() {
  const role = getRole()
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [templates, setTemplates] = useState<InstagramTemplate[]>([])
  const [stats, setStats] = useState<InstagramStats | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showCreateTemplateDialog, setShowCreateTemplateDialog] = useState(false)
  const [showEditTemplateDialog, setShowEditTemplateDialog] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<InstagramAccount | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<InstagramTemplate | null>(null)
  const [activeTab, setActiveTab] = useState<'accounts' | 'templates' | 'posts'>('accounts')
  const [formData, setFormData] = useState({
    school_id: '',
    ig_user_id: '',
    account_name: '',
    access_token: ''
  })
  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    is_default: false,
    // 文章編號區設定
    article_number: {
      enabled: true,
      x: 0.05,
      y: 0.1,
      align_horizontal: 'left',
      align_vertical: 'top',
      font_size: 24,
      font_weight: '600',
      color: '#333333',
      google_font: 'Noto Sans TC'
    },
    // 內容區塊設定  
    content_block: {
      x: 0.5,
      y: 0.5,
      align_horizontal: 'center',
      align_vertical: 'middle',
      font_size: 28,
      font_weight: '400',
      color: '#000000',
      google_font: 'Noto Sans TC',
      max_lines: 4
    },
    // 時間戳記設定
    timestamp: {
      enabled: true,
      x: 0.05,
      y: 0.95,
      align_horizontal: 'left',
      align_vertical: 'bottom',
      font_size: 16,
      font_weight: '300',
      color: '#666666',
      google_font: 'Noto Sans TC',
      format: 'YYYY/MM/DD HH:mm'
    },
    // Logo區設定
    logo: {
      enabled: true,
      x: 0.9,
      y: 0.1,
      align_horizontal: 'right',
      align_vertical: 'top',
      size: 100,
      opacity: 0.9
    },
    // 背景設定
    background: {
      type: 'color',
      color: '#FFFFFF',
      image: '',
      overlay_enabled: true,
      overlay_color: '#FFFFFF',
      overlay_opacity: 80,
      overlay_size: { width: 0.8, height: 0.6 },
      overlay_radius: 20
    },
    // Caption模板
    caption_template: '📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享'
  })

  // 獲取 Instagram 帳號列表
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/instagram/accounts', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        setAccounts(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch Instagram accounts:', error)
    }
  }, [])

  // 獲取 Instagram 發布記錄
  const fetchPosts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/instagram/posts?limit=50', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        setPosts(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch Instagram posts:', error)
    }
  }, [])

  // 獲取模板列表
  const fetchTemplates = useCallback(async () => {
    try {
      if (accounts.length === 0) return
      
      const allTemplates: InstagramTemplate[] = []
      for (const account of accounts) {
        const response = await fetch(`/api/admin/instagram/templates/${account.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
        if (response.ok) {
          const data = await response.json()
          allTemplates.push(...data.data)
        }
      }
      setTemplates(allTemplates)
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  }, [accounts])

  // 創建模板
  const createTemplate = async (accountId: number) => {
    try {
      const response = await fetch(`/api/admin/instagram/templates/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(templateFormData)
      })
      
      if (response.ok) {
        setShowCreateTemplateDialog(false)
        setTemplateFormData({
          name: '',
          is_default: false,
          // 重置為預設值
          article_number: {
            enabled: true,
            x: 0.05,
            y: 0.1,
            align_horizontal: 'left',
            align_vertical: 'top',
            font_size: 24,
            font_weight: '600',
            color: '#333333',
            google_font: 'Noto Sans TC'
          },
          content_block: {
            x: 0.5,
            y: 0.5,
            align_horizontal: 'center',
            align_vertical: 'middle',
            font_size: 28,
            font_weight: '400',
            color: '#000000',
            google_font: 'Noto Sans TC',
            max_lines: 4
          },
          timestamp: {
            enabled: true,
            x: 0.05,
            y: 0.95,
            align_horizontal: 'left',
            align_vertical: 'bottom',
            font_size: 16,
            font_weight: '300',
            color: '#666666',
            google_font: 'Noto Sans TC',
            format: 'YYYY/MM/DD HH:mm'
          },
          logo: {
            enabled: true,
            x: 0.9,
            y: 0.1,
            align_horizontal: 'right',
            align_vertical: 'top',
            size: 100,
            opacity: 0.9
          },
          background: {
            type: 'color',
            color: '#FFFFFF',
            image: '',
            overlay_enabled: true,
            overlay_color: '#FFFFFF',
            overlay_opacity: 80,
            overlay_size: { width: 0.8, height: 0.6 },
            overlay_radius: 20
          },
          caption_template: '📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享'
        })
        fetchTemplates()
      }
    } catch (error) {
      console.error('Failed to create template:', error)
    }
  }

  // 更新模板
  const updateTemplate = async (templateId: number) => {
    try {
      const response = await fetch(`/api/admin/instagram/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(templateFormData)
      })
      
      if (response.ok) {
        setShowEditTemplateDialog(false)
        setSelectedTemplate(null)
        fetchTemplates()
      }
    } catch (error) {
      console.error('Failed to update template:', error)
    }
  }

  // 刪除模板
  const deleteTemplate = async (templateId: number) => {
    if (!confirm('確定要刪除這個模板嗎？')) return
    
    try {
      const response = await fetch(`/api/admin/instagram/templates/${templateId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      
      if (response.ok) {
        fetchTemplates()
      }
    } catch (error) {
      console.error('Failed to delete template:', error)
    }
  }

  // 設為預設模板
  const setDefaultTemplate = async (templateId: number) => {
    try {
      const response = await fetch(`/api/admin/instagram/templates/${templateId}/set-default`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      
      if (response.ok) {
        fetchTemplates()
      }
    } catch (error) {
      console.error('Failed to set default template:', error)
    }
  }

  // 編輯模板
  const editTemplate = (template: InstagramTemplate) => {
    setSelectedTemplate(template)
    // 轉換舊格式到新格式
    const layoutData = template.layout || {}
    setTemplateFormData({
      name: template.name,
      is_default: template.is_default,
      article_number: layoutData.article_number || {
        enabled: true,
        x: 0.05,
        y: 0.1,
        align_horizontal: 'left',
        align_vertical: 'top',
        font_size: 24,
        font_weight: '600',
        color: '#333333',
        google_font: template.text_font || 'Noto Sans TC'
      },
      content_block: layoutData.content_block || {
        x: template.text_position === 'center' ? 0.5 : 0.1,
        y: 0.5,
        align_horizontal: template.text_position || 'center',
        align_vertical: 'middle',
        font_size: template.text_size || 28,
        font_weight: '400',
        color: template.text_color || '#000000',
        google_font: template.text_font || 'Noto Sans TC',
        max_lines: 4
      },
      timestamp: layoutData.timestamp || {
        enabled: template.timestamp_enabled !== false,
        x: template.timestamp_position === 'bottom-right' ? 0.95 : 0.05,
        y: 0.95,
        align_horizontal: (template.timestamp_position && template.timestamp_position.includes('right')) ? 'right' : 'left',
        align_vertical: 'bottom',
        font_size: template.timestamp_size || 16,
        font_weight: '300',
        color: template.timestamp_color || '#666666',
        google_font: template.text_font || 'Noto Sans TC',
        format: template.timestamp_format || 'YYYY/MM/DD HH:mm'
      },
      logo: layoutData.logo || {
        enabled: template.logo_enabled !== false,
        x: template.logo_position === 'top-left' ? 0.1 : 0.9,
        y: 0.1,
        align_horizontal: (template.logo_position && template.logo_position.includes('left')) ? 'left' : 'right',
        align_vertical: 'top',
        size: template.logo_size || 100,
        opacity: 0.9
      },
      background: {
        type: template.background_type || 'color',
        color: template.background_color || '#FFFFFF',
        image: template.background_image || '',
        overlay_enabled: template.overlay_enabled !== false,
        overlay_color: template.overlay_color || '#FFFFFF',
        overlay_opacity: template.overlay_opacity || 80,
        overlay_size: template.overlay_size || { width: 0.8, height: 0.6 },
        overlay_radius: template.overlay_radius || 20
      },
      caption_template: template.caption_template || '📚 {school_name}\n\n{post_title}\n\n👤 作者：{author_name}\n📅 發布時間：{post_time}\n\n#校園生活 #學生分享'
    })
    setShowEditTemplateDialog(true)
  }

  // 獲取 Instagram 統計資料
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/instagram/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch Instagram stats:', error)
    }
  }, [])

  // 獲取學校列表
  const fetchSchools = useCallback(async () => {
    try {
      const response = await fetch('/api/schools', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        setSchools(data.items || [])
      }
    } catch (error) {
      console.error('Failed to fetch schools:', error)
    }
  }, [])

  // 創建 Instagram 帳號
  const createAccount = async () => {
    try {
      setLoading(true)
      // 處理跨校選項
      const requestData = {
        ...formData,
        school_id: formData.school_id === '0' ? null : formData.school_id
      }
      
      const response = await fetch('/api/admin/instagram/accounts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestData)
      })
      
      if (response.ok) {
        setShowCreateDialog(false)
        setFormData({
          school_id: '',
          ig_user_id: '',
          account_name: '',
          access_token: ''
        })
        fetchAccounts()
      } else {
        const data = await response.json()
        alert('創建帳號失敗: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to create account:', error)
      alert('創建帳號失敗')
    } finally {
      setLoading(false)
    }
  }

  // 更新 Instagram 帳號
  const updateAccount = async () => {
    if (!selectedAccount) return
    
    try {
      setLoading(true)
      // 處理跨校選項
      const requestData: any = {
        school_id: formData.school_id === '0' ? null : formData.school_id,
        ig_user_id: formData.ig_user_id,
        account_name: formData.account_name
      }
      
      // 只有在有輸入權杖時才包含權杖更新
      if (shouldUpdateToken(formData)) {
        requestData.access_token = formData.access_token
      }
      
      const response = await fetch(`/api/admin/instagram/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestData)
      })
      
      if (response.ok) {
        setShowEditDialog(false)
        setSelectedAccount(null)
        setFormData({
          school_id: '',
          ig_user_id: '',
          account_name: '',
          access_token: ''
        })
        fetchAccounts()
      } else {
        const data = await response.json()
        alert('更新帳號失敗: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to update account:', error)
      alert('更新帳號失敗')
    } finally {
      setLoading(false)
    }
  }

  // 刷新權杖
  const refreshToken = async (accountId: number) => {
    try {
      const response = await fetch(`/api/admin/instagram/accounts/${accountId}/refresh-token`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      
      if (response.ok) {
        alert('權杖刷新成功')
        fetchAccounts()
      } else {
        const data = await response.json()
        alert('權杖刷新失敗: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to refresh token:', error)
      alert('權杖刷新失敗')
    }
  }

  // 強制發布
  const forcePublish = async (postId: number) => {
    try {
      const response = await fetch(`/api/admin/instagram/posts/${postId}/force-publish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      
      if (response.ok) {
        alert('強制發布成功')
        fetchPosts()
      } else {
        const data = await response.json()
        alert('強制發布失敗: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to force publish:', error)
      alert('強制發布失敗')
    }
  }

  // 觸發自動發布
  const triggerAutoPublish = async (accountId?: number) => {
    try {
      const response = await fetch('/api/admin/instagram/auto-publish', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ account_id: accountId })
      })
      
      if (response.ok) {
        const data = await response.json()
        alert(data.message)
        fetchPosts()
        fetchStats()
      } else {
        const data = await response.json()
        alert('自動發布失敗: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to trigger auto publish:', error)
      alert('自動發布失敗')
    }
  }

  // 刪除 Instagram 帳號
  const deleteAccount = async (accountId: number) => {
    if (!confirm('確定要刪除此 Instagram 帳號嗎？此操作無法復原。')) {
      return
    }
    
    try {
      const response = await fetch(`/api/admin/instagram/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      
      if (response.ok) {
        alert('帳號刪除成功')
        fetchAccounts()
        fetchStats()
      } else {
        const data = await response.json()
        alert('刪除帳號失敗: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to delete account:', error)
      alert('刪除帳號失敗')
    }
  }

  // 編輯帳號
  const editAccount = (account: InstagramAccount) => {
    setSelectedAccount(account)
    setFormData({
      school_id: account.school_id ? account.school_id.toString() : '0',
      ig_user_id: account.ig_user_id,
      account_name: account.account_name,
      access_token: ''
    })
    setShowEditDialog(true)
  }

  // 檢查是否需要更新權杖
  const shouldUpdateToken = (formData: any) => {
    return formData.access_token && formData.access_token.trim() !== ''
  }

  // 獲取狀態徽章
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      draft: { label: '草稿', className: 'bg-gray-100 text-gray-800' },
      queued: { label: '排程中', className: 'bg-blue-100 text-blue-800' },
      publishing: { label: '發布中', className: 'bg-yellow-100 text-yellow-800' },
      published: { label: '已發布', className: 'bg-green-100 text-green-800' },
      failed: { label: '失敗', className: 'bg-red-100 text-red-800' }
    }
    
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>{config.label}</span>
  }

  // 格式化時間
  const formatTime = (timeStr: string) => {
    return new Date(timeStr).toLocaleString('zh-TW')
  }

  useEffect(() => {
    fetchAccounts()
    fetchPosts()
    fetchStats()
    fetchSchools()
  }, [fetchAccounts, fetchPosts, fetchStats, fetchSchools])

  useEffect(() => {
    if (accounts.length > 0) {
      fetchTemplates()
    }
  }, [accounts, fetchTemplates])

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/instagram" />
      <MobileBottomNav />

      <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        {/* 頁面標題 */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin" className="p-2 rounded-lg hover:bg-surface/80">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold dual-text">Instagram 整合管理</h1>
            <p className="text-sm text-muted">管理 Instagram 帳號、發布設定與記錄</p>
          </div>
        </div>

        {/* 統計卡片 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">總帳號數</h3>
                <Instagram className="h-4 w-4 text-muted" />
              </div>
              <div className="text-2xl font-bold">{stats.total_accounts}</div>
            </div>
            
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">今日發布</h3>
                <BarChart3 className="h-4 w-4 text-muted" />
              </div>
              <div className="text-2xl font-bold">{stats.today_posts}</div>
            </div>
            
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">本月發布</h3>
                <BarChart3 className="h-4 w-4 text-muted" />
              </div>
              <div className="text-2xl font-bold">{stats.month_posts}</div>
            </div>
            
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">失敗發布</h3>
                <AlertTriangle className="h-4 w-4 text-muted" />
              </div>
              <div className="text-2xl font-bold text-red-600">{stats.failed_posts}</div>
            </div>
          </div>
        )}

        {/* 標籤頁 */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft mb-6">
          <div className="flex space-x-8 border-b border-border">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'accounts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              帳號管理
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'templates'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              貼文模板
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'posts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              發布記錄
            </button>
          </div>
        </div>

        {/* 主要內容區域 */}
        {activeTab === 'accounts' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Instagram 帳號管理 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Instagram 帳號</h2>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="btn-primary px-3 py-2 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  新增帳號
                </button>
              </div>

              <div className="space-y-3">
                {accounts.map((account) => (
                  <div key={account.id} className="p-4 border border-border rounded-xl bg-surface-hover">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">{account.account_name}</h3>
                      <div className="flex items-center gap-2">
                        {account.is_token_valid ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <button
                          onClick={() => editAccount(account)}
                          className="btn-ghost p-1"
                          title="編輯帳號"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => refreshToken(account.id)}
                          className="btn-ghost p-1"
                          title="刷新權杖"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteAccount(account.id)}
                          className="btn-ghost p-1 text-red-600 hover:text-red-700"
                          title="刪除帳號"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-muted space-y-1">
                      <div>學校: {account.school_name}</div>
                      <div>發布間隔: 每 {account.post_interval_count} 篇或每 {account.post_interval_hours} 小時</div>
                      <div>今日發布: {account.today_posts}/{account.daily_limit}</div>
                      <div className="flex items-center gap-2">
                        <span>權杖狀態:</span>
                        {account.is_token_valid ? (
                          <span className="text-green-600">有效</span>
                        ) : (
                          <span className="text-red-600">已過期</span>
                        )}
                      </div>
                      <div>權杖到期: {formatTime(account.token_expires_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instagram 發布記錄 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">發布記錄</h2>
                <button
                  onClick={() => triggerAutoPublish()}
                  className="btn-primary px-3 py-2 flex items-center gap-2 text-sm"
                >
                  <Play className="w-4 h-4" />
                  觸發發布
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {posts.map((post) => (
                  <div key={post.id} className="p-4 border border-border rounded-xl bg-surface-hover">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(post.status)}
                        <span className="text-sm font-medium">{post.account_name}</span>
                      </div>
                      <button
                        onClick={() => forcePublish(post.id)}
                        className="btn-ghost p-1"
                        title="強制發布"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-sm text-muted space-y-1">
                      <div>學校: {post.school_name}</div>
                      <div>內容: {post.caption.substring(0, 100)}...</div>
                      <div>創建時間: {formatTime(post.created_at)}</div>
                      {post.published_at && (
                        <div>發布時間: {formatTime(post.published_at)}</div>
                      )}
                      {post.error_message && (
                        <div className="text-red-600">錯誤: {post.error_message}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">貼文模板</h2>
              <button
                onClick={() => setShowCreateTemplateDialog(true)}
                className="btn-primary px-3 py-2 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                新增模板
              </button>
            </div>
            <div className="space-y-4">
              {templates.map((template) => (
                <div key={template.id} className="p-4 border border-border rounded-xl bg-surface-hover">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{template.name}</h3>
                      {template.is_default && (
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                          預設模板
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!template.is_default && (
                        <button
                          onClick={() => setDefaultTemplate(template.id)}
                          className="btn-ghost p-1 text-xs"
                          title="設為預設"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => editTemplate(template)}
                        className="btn-ghost p-1"
                        title="編輯"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {!template.is_default && (
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="btn-ghost p-1 text-red-500"
                          title="刪除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted">
                    <div>
                      <span className="font-medium">字體:</span> {template.text_font}
                    </div>
                    <div>
                      <span className="font-medium">大小:</span> {template.text_size}px
                    </div>
                    <div>
                      <span className="font-medium">顏色:</span> 
                      <span 
                        className="inline-block w-4 h-4 rounded ml-1 border"
                        style={{ backgroundColor: template.text_color }}
                      />
                    </div>
                    <div>
                      <span className="font-medium">背景:</span> {template.background_type}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    創建時間: {formatTime(template.created_at)}
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div className="text-center py-12">
                  <Settings className="w-12 h-12 mx-auto mb-4 text-muted" />
                  <p className="text-muted">還沒有模板</p>
                  <p className="text-sm text-muted mt-2">點擊「新增模板」來創建第一個模板</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">發布記錄</h2>
              <button
                onClick={() => triggerAutoPublish()}
                className="btn-primary px-3 py-2 flex items-center gap-2 text-sm"
              >
                <Play className="w-4 h-4" />
                觸發發布
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {posts.map((post) => (
                <div key={post.id} className="p-4 border border-border rounded-xl bg-surface-hover">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(post.status)}
                      <span className="text-sm font-medium">{post.account_name}</span>
                    </div>
                    <button
                      onClick={() => forcePublish(post.id)}
                      className="btn-ghost p-1"
                      title="強制發布"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-sm text-muted space-y-1">
                    <div>學校: {post.school_name}</div>
                    <div>內容: {post.caption.substring(0, 100)}...</div>
                    <div>創建時間: {formatTime(post.created_at)}</div>
                    {post.published_at && (
                      <div>發布時間: {formatTime(post.published_at)}</div>
                    )}
                    {post.error_message && (
                      <div className="text-red-600">錯誤: {post.error_message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 創建帳號對話框 */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">新增 Instagram 帳號</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">學校</label>
                  <select
                    value={formData.school_id}
                    onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                    className="form-control"
                  >
                    <option value="">請選擇學校</option>
                    <option value="0">跨校</option>
                    {role === 'dev_admin' ? (
                      schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))
                    ) : (
                      schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">IG 應用程式密鑰</label>
                  <input
                    type="text"
                    value={formData.ig_user_id}
                    onChange={(e) => setFormData({ ...formData, ig_user_id: e.target.value })}
                    className="form-control"
                    placeholder="IG 應用程式密鑰"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">帳號名稱</label>
                  <input
                    type="text"
                    value={formData.account_name}
                    onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                    className="form-control"
                    placeholder="帳號名稱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">存取權杖</label>
                  <textarea
                    value={formData.access_token}
                    onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                    className="form-control"
                    rows={3}
                    placeholder="Instagram 長期存取權杖"
                  />
                  <p className="text-xs text-muted mt-1">請輸入有效的 Instagram 長期存取權杖</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="btn-ghost flex-1"
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  onClick={createAccount}
                  className="btn-primary flex-1"
                  disabled={loading}
                >
                  {loading ? '創建中...' : '創建'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 編輯帳號對話框 */}
        {showEditDialog && selectedAccount && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">編輯 Instagram 帳號</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">學校</label>
                  <select
                    value={formData.school_id}
                    onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                    className="form-control"
                  >
                    <option value="">請選擇學校</option>
                    <option value="0">跨校</option>
                    {role === 'dev_admin' ? (
                      schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))
                    ) : (
                      schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">IG 應用程式密鑰</label>
                  <input
                    type="text"
                    value={formData.ig_user_id}
                    onChange={(e) => setFormData({ ...formData, ig_user_id: e.target.value })}
                    className="form-control"
                    placeholder="IG 應用程式密鑰"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">帳號名稱</label>
                  <input
                    type="text"
                    value={formData.account_name}
                    onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                    className="form-control"
                    placeholder="帳號名稱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">存取權杖 (可選)</label>
                  <textarea
                    value={formData.access_token}
                    onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                    className="form-control"
                    rows={3}
                    placeholder="留空則不更新權杖，輸入新權杖則更新"
                  />
                  <p className="text-xs text-muted mt-1">留空則保持原有權杖不變</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditDialog(false)}
                  className="btn-ghost flex-1"
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  onClick={updateAccount}
                  className="btn-primary flex-1"
                  disabled={loading}
                >
                  {loading ? '更新中...' : '更新'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 創建模板對話框 */}
        {showCreateTemplateDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">新增 Instagram 模板</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左側：設定面板 */}
                <div className="space-y-6">
                  {/* 基本設定 */}
                  <div>
                    <h4 className="font-medium mb-3">基本設定</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">模板名稱</label>
                        <input
                          type="text"
                          value={templateFormData.name}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                          className="form-control"
                          placeholder="模板名稱"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">帳號</label>
                        <select
                          onChange={(e) => setSelectedAccount(accounts.find(a => a.id === parseInt(e.target.value)) || null)}
                          className="form-control"
                        >
                          <option value="">請選擇帳號</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.account_name} ({account.school_name})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_default"
                          checked={templateFormData.is_default}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, is_default: e.target.checked })}
                          className="rounded"
                        />
                        <label htmlFor="is_default" className="text-sm">設為預設模板</label>
                      </div>
                    </div>
                  </div>

                  {/* 文章編號區設定 */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={templateFormData.article_number.enabled}
                        onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, enabled: e.target.checked } })}
                        className="rounded"
                      />
                      <h4 className="font-medium">文章編號區</h4>
                    </div>
                    {templateFormData.article_number.enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted mb-1">X 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.article_number.x}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, x: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Y 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.article_number.y}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, y: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">水平對齊</label>
                          <select
                            value={templateFormData.article_number.align_horizontal}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, align_horizontal: e.target.value } })}
                            className="form-control text-sm"
                          >
                            <option value="left">左對齊</option>
                            <option value="center">置中</option>
                            <option value="right">右對齊</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">垂直對齊</label>
                          <select
                            value={templateFormData.article_number.align_vertical}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, align_vertical: e.target.value } })}
                            className="form-control text-sm"
                          >
                            <option value="top">上對齊</option>
                            <option value="middle">置中</option>
                            <option value="bottom">下對齊</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">字體大小</label>
                          <input
                            type="number"
                            min="12"
                            max="72"
                            value={templateFormData.article_number.font_size}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, font_size: parseInt(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">字體重量</label>
                          <select
                            value={templateFormData.article_number.font_weight}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, font_weight: e.target.value } })}
                            className="form-control text-sm"
                          >
                            <option value="300">Light (300)</option>
                            <option value="400">Regular (400)</option>
                            <option value="500">Medium (500)</option>
                            <option value="600">Semi Bold (600)</option>
                            <option value="700">Bold (700)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">顏色</label>
                          <input
                            type="color"
                            value={templateFormData.article_number.color}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, color: e.target.value } })}
                            className="form-control h-8"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Google 字體</label>
                          <input
                            type="text"
                            value={templateFormData.article_number.google_font}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, google_font: e.target.value } })}
                            className="form-control text-sm"
                            placeholder="例：Noto Sans TC"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 內容區塊設定 */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">內容區塊</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted mb-1">X 座標 (0-1)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={templateFormData.content_block.x}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, x: parseFloat(e.target.value) } })}
                          className="form-control text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Y 座標 (0-1)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={templateFormData.content_block.y}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, y: parseFloat(e.target.value) } })}
                          className="form-control text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">水平對齊</label>
                        <select
                          value={templateFormData.content_block.align_horizontal}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, align_horizontal: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="left">左對齊</option>
                          <option value="center">置中</option>
                          <option value="right">右對齊</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">垂直對齊</label>
                        <select
                          value={templateFormData.content_block.align_vertical}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, align_vertical: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="top">上對齊</option>
                          <option value="middle">置中</option>
                          <option value="bottom">下對齊</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">字體大小</label>
                        <input
                          type="number"
                          min="12"
                          max="72"
                          value={templateFormData.content_block.font_size}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, font_size: parseInt(e.target.value) } })}
                          className="form-control text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">字體重量</label>
                        <select
                          value={templateFormData.content_block.font_weight}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, font_weight: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="300">Light (300)</option>
                          <option value="400">Regular (400)</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="700">Bold (700)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">顏色</label>
                        <input
                          type="color"
                          value={templateFormData.content_block.color}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, color: e.target.value } })}
                          className="form-control h-8"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Google 字體</label>
                        <input
                          type="text"
                          value={templateFormData.content_block.google_font}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, google_font: e.target.value } })}
                          className="form-control text-sm"
                          placeholder="例：Noto Sans TC"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 時間戳記設定 */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={templateFormData.timestamp.enabled}
                        onChange={(e) => setTemplateFormData({ ...templateFormData, timestamp: { ...templateFormData.timestamp, enabled: e.target.checked } })}
                        className="rounded"
                      />
                      <h4 className="font-medium">時間戳記</h4>
                    </div>
                    {templateFormData.timestamp.enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted mb-1">X 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.timestamp.x}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, timestamp: { ...templateFormData.timestamp, x: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Y 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.timestamp.y}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, timestamp: { ...templateFormData.timestamp, y: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">格式</label>
                          <input
                            type="text"
                            value={templateFormData.timestamp.format}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, timestamp: { ...templateFormData.timestamp, format: e.target.value } })}
                            className="form-control text-sm"
                            placeholder="YYYY/MM/DD HH:mm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">字體大小</label>
                          <input
                            type="number"
                            min="8"
                            max="24"
                            value={templateFormData.timestamp.font_size}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, timestamp: { ...templateFormData.timestamp, font_size: parseInt(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Logo 上傳區設定 */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={templateFormData.logo.enabled}
                        onChange={(e) => setTemplateFormData({ ...templateFormData, logo: { ...templateFormData.logo, enabled: e.target.checked } })}
                        className="rounded"
                      />
                      <h4 className="font-medium">Logo 上傳區</h4>
                    </div>
                    {templateFormData.logo.enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted mb-1">X 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.logo.x}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, logo: { ...templateFormData.logo, x: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Y 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.logo.y}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, logo: { ...templateFormData.logo, y: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">大小 (px)</label>
                          <input
                            type="number"
                            min="50"
                            max="200"
                            value={templateFormData.logo.size}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, logo: { ...templateFormData.logo, size: parseInt(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">透明度 (0-1)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={templateFormData.logo.opacity}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, logo: { ...templateFormData.logo, opacity: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 背景設定 */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">背景設定</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted mb-1">背景類型</label>
                        <select
                          value={templateFormData.background.type}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, background: { ...templateFormData.background, type: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="color">純色</option>
                          <option value="image">圖片</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">背景顏色</label>
                        <input
                          type="color"
                          value={templateFormData.background.color}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, background: { ...templateFormData.background, color: e.target.value } })}
                          className="form-control h-8"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Caption 模板 */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Caption 模板</h4>
                    <textarea
                      value={templateFormData.caption_template}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, caption_template: e.target.value })}
                      className="form-control"
                      rows={4}
                      placeholder="Caption 模板，可使用 {school_name}, {post_title}, {author_name}, {post_time} 等變數"
                    />
                    <p className="text-xs text-muted mt-1">
                      可用變數: {'{school_name}'}, {'{post_title}'}, {'{author_name}'}, {'{post_time}'}
                    </p>
                  </div>
                </div>

                {/* 右側：即時預覽 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-medium mb-3">即時預覽</h4>
                  <InstagramTemplatePreview 
                    templateData={{
                      article_number: templateFormData.article_number,
                      content_block: templateFormData.content_block,
                      timestamp: templateFormData.timestamp,
                      logo: templateFormData.logo,
                      background: templateFormData.background
                    }}
                  />
                  <p className="text-xs text-muted mt-2 text-center">
                    即時預覽模板效果
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateTemplateDialog(false)}
                  className="btn-ghost flex-1"
                >
                  取消
                </button>
                <button
                  onClick={() => selectedAccount && createTemplate(selectedAccount.id)}
                  className="btn-primary flex-1"
                  disabled={!selectedAccount || !templateFormData.name}
                >
                  創建模板
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 編輯模板對話框 */}
        {showEditTemplateDialog && selectedTemplate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">編輯 Instagram 模板</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左側：設定面板 (與創建模板相同結構，但沒有帳號選擇) */}
                <div className="space-y-6">
                  {/* 基本設定 */}
                  <div>
                    <h4 className="font-medium mb-3">基本設定</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">模板名稱</label>
                        <input
                          type="text"
                          value={templateFormData.name}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                          className="form-control"
                          placeholder="模板名稱"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="edit_is_default"
                          checked={templateFormData.is_default}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, is_default: e.target.checked })}
                          className="rounded"
                        />
                        <label htmlFor="edit_is_default" className="text-sm">設為預設模板</label>
                      </div>
                    </div>
                  </div>

                  {/* 文章編號區設定 */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={templateFormData.article_number.enabled}
                        onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, enabled: e.target.checked } })}
                        className="rounded"
                      />
                      <h4 className="font-medium">文章編號區</h4>
                    </div>
                    {templateFormData.article_number.enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-muted mb-1">X 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.article_number.x}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, x: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Y 座標 (0-1)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={templateFormData.article_number.y}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, y: parseFloat(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">水平對齊</label>
                          <select
                            value={templateFormData.article_number.align_horizontal}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, align_horizontal: e.target.value } })}
                            className="form-control text-sm"
                          >
                            <option value="left">左對齊</option>
                            <option value="center">置中</option>
                            <option value="right">右對齊</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">垂直對齊</label>
                          <select
                            value={templateFormData.article_number.align_vertical}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, align_vertical: e.target.value } })}
                            className="form-control text-sm"
                          >
                            <option value="top">上對齊</option>
                            <option value="middle">置中</option>
                            <option value="bottom">下對齊</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">字體大小</label>
                          <input
                            type="number"
                            min="12"
                            max="72"
                            value={templateFormData.article_number.font_size}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, font_size: parseInt(e.target.value) } })}
                            className="form-control text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">字體重量</label>
                          <select
                            value={templateFormData.article_number.font_weight}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, font_weight: e.target.value } })}
                            className="form-control text-sm"
                          >
                            <option value="300">Light (300)</option>
                            <option value="400">Regular (400)</option>
                            <option value="500">Medium (500)</option>
                            <option value="600">Semi Bold (600)</option>
                            <option value="700">Bold (700)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">顏色</label>
                          <input
                            type="color"
                            value={templateFormData.article_number.color}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, color: e.target.value } })}
                            className="form-control h-8"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">Google 字體</label>
                          <input
                            type="text"
                            value={templateFormData.article_number.google_font}
                            onChange={(e) => setTemplateFormData({ ...templateFormData, article_number: { ...templateFormData.article_number, google_font: e.target.value } })}
                            className="form-control text-sm"
                            placeholder="例：Noto Sans TC"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 內容區塊設定 */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">內容區塊</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted mb-1">X 座標 (0-1)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={templateFormData.content_block.x}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, x: parseFloat(e.target.value) } })}
                          className="form-control text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Y 座標 (0-1)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={templateFormData.content_block.y}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, y: parseFloat(e.target.value) } })}
                          className="form-control text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">水平對齊</label>
                        <select
                          value={templateFormData.content_block.align_horizontal}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, align_horizontal: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="left">左對齊</option>
                          <option value="center">置中</option>
                          <option value="right">右對齊</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">垂直對齊</label>
                        <select
                          value={templateFormData.content_block.align_vertical}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, align_vertical: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="top">上對齊</option>
                          <option value="middle">置中</option>
                          <option value="bottom">下對齊</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">字體大小</label>
                        <input
                          type="number"
                          min="12"
                          max="72"
                          value={templateFormData.content_block.font_size}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, font_size: parseInt(e.target.value) } })}
                          className="form-control text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">字體重量</label>
                        <select
                          value={templateFormData.content_block.font_weight}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, font_weight: e.target.value } })}
                          className="form-control text-sm"
                        >
                          <option value="300">Light (300)</option>
                          <option value="400">Regular (400)</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="700">Bold (700)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">顏色</label>
                        <input
                          type="color"
                          value={templateFormData.content_block.color}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, color: e.target.value } })}
                          className="form-control h-8"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Google 字體</label>
                        <input
                          type="text"
                          value={templateFormData.content_block.google_font}
                          onChange={(e) => setTemplateFormData({ ...templateFormData, content_block: { ...templateFormData.content_block, google_font: e.target.value } })}
                          className="form-control text-sm"
                          placeholder="例：Noto Sans TC"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 其他設定區塊省略，與創建模板相同... */}
                  {/* Caption 模板 */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Caption 模板</h4>
                    <textarea
                      value={templateFormData.caption_template}
                      onChange={(e) => setTemplateFormData({ ...templateFormData, caption_template: e.target.value })}
                      className="form-control"
                      rows={4}
                      placeholder="Caption 模板，可使用 {school_name}, {post_title}, {author_name}, {post_time} 等變數"
                    />
                    <p className="text-xs text-muted mt-1">
                      可用變數: {'{school_name}'}, {'{post_title}'}, {'{author_name}'}, {'{post_time}'}
                    </p>
                  </div>
                </div>

                {/* 右側：即時預覽 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-medium mb-3">即時預覽</h4>
                  <InstagramTemplatePreview 
                    templateData={{
                      article_number: templateFormData.article_number,
                      content_block: templateFormData.content_block,
                      timestamp: templateFormData.timestamp,
                      logo: templateFormData.logo,
                      background: templateFormData.background
                    }}
                  />
                  <p className="text-xs text-muted mt-2 text-center">
                    即時預覽模板效果
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditTemplateDialog(false)}
                  className="btn-ghost flex-1"
                >
                  取消
                </button>
                <button
                  onClick={() => updateTemplate(selectedTemplate.id)}
                  className="btn-primary flex-1"
                  disabled={!templateFormData.name}
                >
                  更新模板
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
