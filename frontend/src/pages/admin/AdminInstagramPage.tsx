import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import TemplateEditor from '@/components/templates/TemplateEditor'
import InstagramStats from '@/components/charts/InstagramStats'
import AccountSettingsEditor from '@/components/account/AccountSettingsEditor'
import SimpleAccountForm from '@/components/account/SimpleAccountForm'
import TokenUpdateModal from '@/components/account/TokenUpdateModal'
import FontManagement from '@/components/admin/FontManagement'
import { 
  Instagram, 
  Plus, 
  Settings, 
  BarChart3, 
  Calendar, 
  Hash, 
  Image, 
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

interface SocialAccount {
  id: number
  platform: string
  platform_username: string
  display_name: string
  status: 'active' | 'disabled' | 'error' | 'pending'
  publish_trigger: 'immediate' | 'scheduled' | 'batch_count'
  batch_size: number
  schedule_hour?: number
  total_posts: number
  last_post_at?: string
  created_at: string
}

interface ContentTemplate {
  id: number
  name: string
  description: string
  template_type: 'image' | 'text' | 'combined'
  is_active: boolean
  is_default: boolean
  usage_count: number
}

interface PublishStats {
  total_posts: number
  pending_posts: number
  failed_posts: number
  published_today: number
}

interface DailyStats {
  date: string
  published: number
}

interface AccountStats {
  account_id: number
  platform_username: string
  display_name: string
  total_posts: number
  status: string
}

interface FullStats {
  overview: PublishStats
  daily_trends: DailyStats[]
  account_stats: AccountStats[]
}

export default function AdminInstagramPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [templates, setTemplates] = useState<ContentTemplate[]>([])
  const [stats, setStats] = useState<FullStats>({
    overview: {
      total_posts: 0,
      pending_posts: 0,
      failed_posts: 0,
      published_today: 0
    },
    daily_trends: [],
    account_stats: []
  })
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'accounts' | 'templates' | 'stats'>('accounts')
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({})
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null)
  const [showSimpleAccountForm, setShowSimpleAccountForm] = useState(false)
  const [showFontManagement, setShowFontManagement] = useState(false)
  const [showTokenUpdate, setShowTokenUpdate] = useState(false)
  const [updatingAccount, setUpdatingAccount] = useState<SocialAccount | null>(null)
  // 自動使用真實數據，不需要手動選擇
  const useRealData = true

  useEffect(() => {
    fetchData()
    
    // 檢查 OAuth 回調結果
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get('success')
    const error = urlParams.get('error')
    const message = urlParams.get('message')
    const username = urlParams.get('username')
    
    if (success === 'account_added') {
      alert(`✅ Instagram 帳號 @${username} 已成功添加！`)
      // 清除 URL 參數
      window.history.replaceState({}, '', window.location.pathname)
    } else if (success === 'account_updated') {
      alert(`✅ Instagram 帳號 @${username} 已成功更新！`)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      let errorMessage = '操作失敗'
      
      switch (error) {
        case 'missing_params':
          errorMessage = '授權參數缺失，請重試'
          break
        case 'invalid_state':
          errorMessage = '授權狀態驗證失敗，可能存在安全風險'
          break
        case 'oauth_failed':
          errorMessage = `OAuth 認證失敗: ${message || '未知錯誤'}`
          break
        case 'token_exchange':
          errorMessage = '授權碼交換失敗，請重試'
          break
        case 'user_not_found':
          errorMessage = '用戶不存在，請重新登入'
          break
        default:
          errorMessage = message || '未知錯誤'
      }
      
      alert(`❌ ${errorMessage}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // 實際 API 調用
      const [accountsRes, templatesRes, monitoringRes] = await Promise.all([
        fetch('/api/admin/social/accounts', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }).then(r => r.json()),
        fetch('/api/admin/social/templates', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }).then(r => r.json()),
        fetch('/api/admin/social/monitoring', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }).then(r => r.json())
      ])
      
      if (accountsRes.success) {
        setAccounts(accountsRes.accounts || [])
      }
      
      if (templatesRes.success) {
        setTemplates(templatesRes.templates || [])
      }
      
      if (monitoringRes.success && monitoringRes.monitoring) {
        setStats({
          overview: monitoringRes.monitoring.overview || {
            total_posts: 0,
            pending_posts: 0,
            failed_posts: 0,
            published_today: 0
          },
          daily_trends: monitoringRes.monitoring.daily_trends || [],
          account_stats: monitoringRes.monitoring.account_stats || [],
          carousel_status: monitoringRes.monitoring.carousel_status || {
            processing: 0,
            failed: 0,
            completed: 0
          },
          carousel_groups: monitoringRes.monitoring.carousel_groups || [],
          recent_failures: monitoringRes.monitoring.recent_failures || []
        })
      }
      
    } catch (error) {
      console.error('Failed to fetch Instagram data:', error)
      // 如果 API 失敗，設定為空狀態而非假資料
      setAccounts([])
      setTemplates([])
      setStats({
        overview: {
          total_posts: 0,
          pending_posts: 0,
          failed_posts: 0,
          published_today: 0
        },
        daily_trends: [],
        account_stats: [],
        carousel_status: {
          processing: 0,
          failed: 0,
          completed: 0
        },
        carousel_groups: [],
        recent_failures: []
      })
    } finally {
      setLoading(false)
    }
  }

  const handleValidateAccount = async (accountId: number) => {
    const loadingKey = `validate-${accountId}`
    try {
      setActionLoading(prev => ({ ...prev, [loadingKey]: true }))

      const response = await fetch(`/api/admin/social/accounts/${accountId}/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        // 更新帳號狀態
        setAccounts(prev => prev.map(acc =>
          acc.id === accountId
            ? { ...acc, status: result.account_status }
            : acc
        ))
        alert(`帳號驗證成功！\n${result.status_message || ''}`)
      } else {
        // 根據錯誤類型提供不同的處理方式
        const errorMsg = result.status_message || result.error || '未知錯誤'
        const debugInfo = result.debug_info ? `\n\n除錯資訊：\n- Page ID: ${result.debug_info.page_id || '無'}\n- 有 Token: ${result.debug_info.has_token ? '是' : '否'}\n- 驗證錯誤: ${result.debug_info.validation_error || '無'}` : ''

        // Instagram Business Account 相關問題：需要到 Facebook 設定
        const isInstagramAccountIssue = errorMsg.includes('Instagram Business Account') ||
                                       errorMsg.includes('無法訪問') ||
                                       errorMsg.includes('權限不足') ||
                                       errorMsg.includes('已被撤銷')

        if (isInstagramAccountIssue) {
          // Instagram Business Account 相關問題，提供具體的修復步驟
          const fixSteps = `${errorMsg}\n\n📋 修復步驟：\n1. 前往 Facebook 企業管理平台 (business.facebook.com)\n2. 選擇您的 Page\n3. 到「Instagram 帳號」設定中\n4. 重新連結或授權 Instagram Business Account\n5. 確認權限包含「管理 Instagram 內容」\n6. 完成後重新驗證`

          alert(fixSteps)
        } else {
          alert(`驗證結果：${errorMsg}${debugInfo}`)
        }

        // 如果有狀態更新，仍然更新帳號狀態
        if (result.account_status) {
          setAccounts(prev => prev.map(acc =>
            acc.id === accountId
              ? { ...acc, status: result.account_status }
              : acc
          ))
        }
      }
    } catch (error) {
      console.error('Validate account failed:', error)
      alert('網路連線錯誤，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleUpdateToken = async (tokenData: { instagram_user_token: string; instagram_page_id: string }) => {
    if (!updatingAccount) return
    
    try {
      const payload: any = {}
      if (tokenData.instagram_user_token && tokenData.instagram_user_token.trim().length > 0) {
        payload.instagram_user_token = tokenData.instagram_user_token.trim()
      }
      if (tokenData.instagram_page_id && tokenData.instagram_page_id.trim().length > 0) {
        // 後端目前接受 facebook_id 欄位，這裡將 Page ID 對應過去
        payload.facebook_id = tokenData.instagram_page_id.trim()
      }
      const response = await fetch(`/api/admin/social/accounts/${updatingAccount.id}/token`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      
      const result = await response.json()
      
      if (result.success) {
        // 更新帳號狀態
        setAccounts(prev => prev.map(acc => 
          acc.id === updatingAccount.id 
            ? { ...acc, status: 'active', updated_at: result.account.updated_at }
            : acc
        ))
        alert(`✅ ${result.message}`)
        // 重新獲取資料以確保同步
        fetchData()
      } else {
        alert(`❌ Token 更新失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('Token update failed:', error)
      alert('❌ Token 更新失敗，請稍後再試')
    }
  }

  const openTokenUpdate = (account: SocialAccount) => {
    setUpdatingAccount(account)
    setShowTokenUpdate(true)
  }

  // 移除 fetchSamplePosts 函數，現在直接在預覽時獲取隨機貼文

  const handlePreviewTemplate = async (templateId: number) => {
    const loadingKey = `preview-${templateId}`
    try {
      setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
      
      // 直接使用真實數據，隨機選擇貼文
      const requestBody: any = {
        template_id: templateId,
        use_real_data: true  // 始終使用真實數據
        // 不指定 post_id，讓後端隨機選擇
      }

      const response = await fetch('/api/admin/social/templates/preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const result = await response.json()
      
      if (result.success && result.preview) {
        // 可以在這裡打開預覽視窗或顯示預覽內容
        if (result.preview.preview_html) {
          // 在新視窗顯示 HTML 預覽
          const previewWindow = window.open('', '_blank', 'width=600,height=800')
          previewWindow?.document.write(result.preview.preview_html)
          previewWindow?.document.close()
        } else {
          alert(`預覽內容:\n標題: ${result.preview.caption}\n標籤: ${result.preview.hashtags?.join(', ') || '無'}`)
        }
      } else {
        alert(`模板預覽失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('Preview template failed:', error)
      alert('模板預覽失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleDeleteAccount = async (accountId: number, username: string) => {
    if (!confirm(`確定要刪除 Instagram 帳號 @${username} 嗎？\n\n這將會：\n• 撤銷與 Instagram 的連接授權\n• 刪除所有相關的模板和發文記錄\n• 此操作無法恢復`)) {
      return
    }
    
    const loadingKey = `delete-${accountId}`
    try {
      setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
      
      const response = await fetch('/api/auth/instagram/revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_id: accountId
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // 從本地狀態移除帳號
        setAccounts(prev => prev.filter(acc => acc.id !== accountId))
        alert(`✅ ${result.message}`)
        
        // 重新載入數據以確保一致性
        await fetchData()
      } else {
        alert(`❌ 刪除失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('Delete account failed:', error)
      alert('❌ 刪除帳號失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleAddAccount = () => {
    setShowSimpleAccountForm(true)
  }

  const handleSaveSimpleAccount = async (accountData: any) => {
    try {
      // 以 Page ID 為主的新增帳號流程
      const payload = {
        display_name: accountData.display_name,
        page_id: accountData.instagram_page_id,
        access_token: accountData.instagram_user_token,
        platform_username: accountData.platform_username,
        school_id: accountData.school_id,
      }

      const response = await fetch('/api/instagram_page/accounts/create_with_page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      })

      let result: any = null
      try { result = await response.json() } catch { /* non-JSON */ }

      if (response.ok && result?.success) {
        alert('Instagram 帳號新增成功！')
        fetchData() // 重新載入數據
        setShowSimpleAccountForm(false)
      } else {
        const err = result?.error?.message || result?.error || result?.msg || `HTTP ${response.status}`
        alert(`新增失敗: ${typeof err === 'string' ? err : JSON.stringify(err)}`)
      }
    } catch (error) {
      console.error('新增 Instagram 帳號失敗:', error)
      alert('新增失敗，請稍後再試')
    }
  }

  const handleAddTemplate = () => {
    setEditingTemplate(null)
    setShowTemplateEditor(true)
  }

  const handleEditTemplate = (template: ContentTemplate) => {
    setEditingTemplate(template)
    setShowTemplateEditor(true)
  }

  const handleSaveTemplate = async (templateData: any) => {
    try {
      const url = editingTemplate 
        ? `/api/admin/social/templates/${editingTemplate.id}`
        : '/api/admin/social/templates'
      
      const method = editingTemplate ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateData)
      })
      
      const result = await response.json()
      
      if (result.success) {
        alert(`✅ 模板${editingTemplate ? '更新' : '創建'}成功！`)
        
        // 重新載入數據
        await fetchData()
        
        setShowTemplateEditor(false)
        setEditingTemplate(null)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Save template failed:', error)
      throw error
    }
  }

  const handleDeleteTemplate = async (templateId: number, templateName: string) => {
    if (!confirm(`確定要刪除模板 "${templateName}" 嗎？\n\n這個操作無法恢復。`)) {
      return
    }

    const loadingKey = `delete-template-${templateId}`
    try {
      setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
      
      const response = await fetch(`/api/admin/social/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      const result = await response.json()
      
      if (result.success) {
        alert(`✅ ${result.message}`)
        
        // 從本地狀態移除模板
        setTemplates(prev => prev.filter(t => t.id !== templateId))
        
        // 重新載入數據以確保一致性
        await fetchData()
      } else {
        alert(`❌ 刪除失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('Delete template failed:', error)
      alert('❌ 刪除模板失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleEditAccountSettings = (account: SocialAccount) => {
    setEditingAccount(account)
    setShowAccountSettings(true)
  }

  const handleSaveAccountSettings = async (settingsData: any) => {
    try {
      const response = await fetch(`/api/admin/social/accounts/${settingsData.account_id}/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settingsData)
      })
      
      const result = await response.json()
      
      if (result.success) {
        alert(`✅ ${result.message}`)
        
        // 更新本地狀態
        setAccounts(prev => prev.map(acc => 
          acc.id === settingsData.account_id 
            ? { ...acc, ...result.account }
            : acc
        ))
        
        // 重新載入數據以確保一致性
        await fetchData()
        
        setShowAccountSettings(false)
        setEditingAccount(null)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Save account settings failed:', error)
      throw error
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '正常'
      case 'disabled': return '已停用'
      case 'error': return '錯誤'
      case 'pending': return '待驗證'
      default: return '未知'
    }
  }

  const getTriggerText = (trigger: string, batchSize?: number, scheduleHour?: number) => {
    switch (trigger) {
      case 'immediate': return '立即發布'
      case 'batch_count': return `定量發布 (${batchSize}篇)`
      case 'scheduled': return `定時發布 (${scheduleHour}:00)`
      default: return '未設定'
    }
  }

  const StatCard = ({ title, value, icon: Icon, color = 'blue' }: { 
    title: string
    value: number
    icon: any
    color?: string 
  }) => (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-sm text-muted">{title}</h3>
        <Icon className={`w-4 h-4 text-${color}-500`} />
      </div>
      <div className="text-2xl font-bold dual-text">{value}</div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/instagram" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted">載入中...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/instagram" />
      <MobileBottomNav />

      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        {/* Header */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Instagram className="w-6 h-6 text-pink-500" />
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">Instagram 整合管理</h1>
            </div>
            <button
              onClick={() => {
                setLoading(true)
                fetchData()
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              title="重新整理"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              重新整理
            </button>
          </div>
          
          {/* Stats Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="總發布數" value={stats.overview.total_posts} icon={BarChart3} color="blue" />
            <StatCard title="待處理" value={stats.overview.pending_posts} icon={Clock} color="yellow" />
            <StatCard title="發布失敗" value={stats.overview.failed_posts} icon={XCircle} color="red" />
            <StatCard title="今日發布" value={stats.overview.published_today} icon={CheckCircle} color="green" />
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-primary p-1 rounded-xl">
            {[
              { id: 'accounts', label: '帳號管理', icon: Instagram },
              { id: 'templates', label: '模板設定', icon: Image },
              { id: 'stats', label: '發布監控', icon: Clock }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSelectedTab(id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors text-primary-foreground ${
                  selectedTab === id 
                    ? 'bg-muted shadow-sm' 
                    : 'bg-primary hover:bg-primary/90'
                }`}
              >
                <Icon className="w-4 h-4 text-primary-foreground" />
                <span className="text-sm font-medium text-primary-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {selectedTab === 'accounts' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold dual-text">Instagram 帳號</h2>
              <button 
                onClick={handleAddAccount}
                disabled={actionLoading['add-account']}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {actionLoading['add-account'] ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                新增帳號
              </button>
            </div>

            <div className="grid gap-4">
              {accounts.length === 0 ? (
                <div className="bg-surface border border-border rounded-xl p-8 text-center">
                  <Instagram className="w-12 h-12 text-muted mx-auto mb-4" />
                  <h3 className="text-lg font-semibold dual-text mb-2">還沒有 Instagram 帳號</h3>
                  <p className="text-muted mb-4">新增第一個 Instagram 帳號來開始自動發布</p>
                  <button 
                    onClick={handleAddAccount}
                    disabled={actionLoading['add-account']}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mx-auto disabled:opacity-50"
                  >
                    {actionLoading['add-account'] ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    新增帳號
                  </button>
                </div>
              ) : (
                accounts.map((account) => (
                <div key={account.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(account.status)}
                      <div>
                        <h3 className="font-semibold dual-text">@{account.platform_username}</h3>
                        <p className="text-sm text-muted">{account.display_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleValidateAccount(account.id)}
                        disabled={actionLoading[`validate-${account.id}`]}
                        className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50 disabled:opacity-50"
                        title="驗證帳號"
                      >
                        {actionLoading[`validate-${account.id}`] ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Settings className="w-4 h-4" />
                        )}
                      </button>
                      {account.status === 'error' && (
                        <button 
                          onClick={() => openTokenUpdate(account)}
                          className="p-2 text-blue-500 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                          title="更新 Access Token"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditAccountSettings(account)}
                        className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
                        title="編輯設定"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteAccount(account.id, account.platform_username)}
                        disabled={actionLoading[`delete-${account.id}`]}
                        className="p-2 text-red-500 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        title="刪除帳號"
                      >
                        {actionLoading[`delete-${account.id}`] ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted">狀態</span>
                      <p className="font-medium">{getStatusText(account.status)}</p>
                    </div>
                    <div>
                      <span className="text-muted">發布模式</span>
                      <p className="font-medium">
                        {getTriggerText(account.publish_trigger, account.batch_size, account.schedule_hour)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">總發布數</span>
                      <p className="font-medium">{account.total_posts}</p>
                    </div>
                    <div>
                      <span className="text-muted">上次發布</span>
                      <p className="font-medium">
                        {account.last_post_at 
                          ? new Date(account.last_post_at).toLocaleDateString('zh-TW')
                          : '無'
                        }
                      </p>
                    </div>
                  </div>
                </div>
                ))
              )}
            </div>
          </div>
        )}

        {selectedTab === 'templates' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold dual-text">內容模板</h2>
              <button 
                onClick={handleAddTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                新增模板
              </button>
            </div>

            {/* 自動使用真實數據提示 */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm dual-text font-medium">自動使用平台真實貼文進行預覽</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                每次預覽將隨機選擇一篇已通過審核的真實貼文，展示實際效果
              </p>
            </div>

            <div className="grid gap-4">
              {templates.length === 0 ? (
                <div className="bg-surface border border-border rounded-xl p-8 text-center">
                  <Image className="w-12 h-12 text-muted mx-auto mb-4" />
                  <h3 className="text-lg font-semibold dual-text mb-2">還沒有內容模板</h3>
                  <p className="text-muted mb-4">建立第一個內容模板來自訂發布格式</p>
                  <button 
                    onClick={handleAddTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mx-auto"
                  >
                    <Plus className="w-4 h-4" />
                    新增模板
                  </button>
                </div>
              ) : (
                templates.map((template) => (
                <div key={template.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${template.is_default ? 'bg-primary/10 text-primary' : 'bg-primary'}`}>
                        <Image className={`w-4 h-4 ${template.is_default ? '' : 'text-primary-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold dual-text">{template.name}</h3>
                          {template.is_default && (
                            <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-full">預設</span>
                          )}
                        </div>
                        <p className="text-sm text-muted">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handlePreviewTemplate(template.id)}
                        disabled={actionLoading[`preview-${template.id}`]}
                        className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50 disabled:opacity-50"
                        title="預覽模板"
                      >
                        {actionLoading[`preview-${template.id}`] ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                      <button 
                        onClick={() => handleEditTemplate(template)}
                        className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
                        title="編輯模板"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                        disabled={actionLoading[`delete-template-${template.id}`]}
                        className="p-2 text-red-500 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        title="刪除模板"
                      >
                        {actionLoading[`delete-template-${template.id}`] ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted">類型</span>
                      <p className="font-medium">
                        {template.template_type === 'combined' ? '圖文並茂' : 
                         template.template_type === 'image' ? '純圖片' : '純文字'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">使用次數</span>
                      <p className="font-medium">{template.usage_count}</p>
                    </div>
                    <div>
                      <span className="text-muted">狀態</span>
                      <p className="font-medium">{template.is_active ? '啟用' : '停用'}</p>
                    </div>
                  </div>
                </div>
                ))
              )}
            </div>
          </div>
        )}

        {selectedTab === 'stats' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dual-text">發布監控</h2>
              <button
                onClick={() => {
                  setLoading(true)
                  fetchData()
                }}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="重新整理監控數據"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                重新整理
              </button>
            </div>
            
            {/* 發布佇列狀態 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 當前處理中的貼文 */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold dual-text">處理中的貼文</h3>
                    <p className="text-sm text-muted">正在生成內容或等待發布</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {stats.overview.pending_posts > 0 ? (
                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <div>
                          <p className="font-medium text-blue-800">等待處理</p>
                          <p className="text-xs text-blue-600">內容生成或驗證中</p>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-blue-600">{stats.overview.pending_posts}</span>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                      <p>目前沒有待處理的貼文</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 輪播群組狀態 */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Calendar className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold dual-text">輪播群組</h3>
                    <p className="text-sm text-muted">批次發布收集進度</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {stats.carousel_groups && stats.carousel_groups.length > 0 ? (
                    stats.carousel_groups.map((group) => (
                      <div key={group.id} className={`p-3 rounded-lg border ${
                        group.failed_posts > 0 ? 'bg-red-50 border-red-200' :
                        group.progress >= 100 ? 'bg-green-50 border-green-200' :
                        group.processing_posts > 0 ? 'bg-blue-50 border-blue-200' :
                        'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-medium ${
                            group.failed_posts > 0 ? 'text-red-800' :
                            group.progress >= 100 ? 'text-green-800' : 'text-blue-800'
                          }`}>批次 {group.batch_id}</span>
                          <span className={`text-sm px-2 py-1 rounded-full text-xs font-medium ${
                            group.processing_posts > 0 ? 'bg-blue-100 text-blue-700' :
                            group.failed_posts > 0 ? 'bg-red-100 text-red-700' :
                            group.progress >= 100 ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {group.processing_posts > 0 ? '處理中' :
                             group.failed_posts > 0 ? `失敗 (${group.failed_posts}/${group.total_posts})` :
                             group.progress >= 100 ? '已完成' : '等待中'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`flex-1 rounded-full h-2 ${
                            group.failed_posts > 0 ? 'bg-red-200' :
                            group.progress >= 100 ? 'bg-green-200' : 'bg-blue-200'
                          }`}>
                            <div className={`h-2 rounded-full transition-all duration-300 ${
                              group.failed_posts > 0 ? 'bg-red-500' :
                              group.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
                            }`}
                                 style={{width: `${group.progress}%`}}></div>
                          </div>
                          <span className={`text-sm font-medium ${
                            group.failed_posts > 0 ? 'text-red-700' :
                            group.progress >= 100 ? 'text-green-700' : 'text-blue-700'
                          }`}>{group.progress}%</span>
                        </div>
                        <div className={`flex justify-between text-xs ${
                          group.failed_posts > 0 ? 'text-red-600' :
                          group.progress >= 100 ? 'text-green-600' : 'text-blue-600'
                        }`}>
                          <span>已發布: {group.published_posts}</span>
                          <span>處理中: {group.processing_posts}</span>
                          <span className={group.failed_posts > 0 ? 'font-bold text-red-700' : ''}>
                            失敗: {group.failed_posts}
                            {group.failed_posts > 0 && group.error_message && (
                              <span className="ml-2 text-xs text-red-500" title={group.error_message}>
                                ({group.error_message.length > 20 ? group.error_message.substring(0, 20) + '...' : group.error_message})
                              </span>
                            )}
                          </span>
                          <span>總數: {group.total_posts}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted">
                      <p className="text-sm">目前沒有進行中的輪播群組</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 發布失敗項目 */}
            {(stats.recent_failures && stats.recent_failures.length > 0) && (
              <div className="bg-surface border border-red-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-800">最近發布失敗</h3>
                    <p className="text-sm text-red-600">需要處理的失敗項目</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {stats.recent_failures.map((failure) => (
                    <div key={failure.id} className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-red-800">{failure.post_title}</p>
                          <p className="text-sm text-red-600 mt-1">帳號: {failure.account_display_name}</p>
                          <p className="text-xs text-red-500 mt-2 font-mono bg-red-100 p-2 rounded">
                            {failure.error_message}
                          </p>
                        </div>
                        <span className="text-xs text-red-500 ml-4">
                          {new Date(failure.updated_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 今日發布成果 */}
            <div className="bg-surface border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold dual-text">今日發布</h3>
                  <p className="text-sm text-muted">已成功發布的內容</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats.overview.published_today}</div>
                  <div className="text-sm text-green-700">今日發布</div>
                </div>
                <div className="text-center p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{stats.overview.total_posts}</div>
                  <div className="text-sm text-primary/70">總發布數</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 模板編輯器 */}
      <TemplateEditor
        isOpen={showTemplateEditor}
        onClose={() => {
          setShowTemplateEditor(false)
          setEditingTemplate(null)
        }}
        onSave={handleSaveTemplate}
        accounts={accounts}
        editingTemplate={editingTemplate}
      />

      {/* 帳號設定編輯器 */}
      <AccountSettingsEditor
        isOpen={showAccountSettings}
        onClose={() => {
          setShowAccountSettings(false)
          setEditingAccount(null)
        }}
        onSave={handleSaveAccountSettings}
        account={editingAccount}
      />

      {/* 簡化帳號新增表單 */}
      <SimpleAccountForm
        isOpen={showSimpleAccountForm}
        onClose={() => setShowSimpleAccountForm(false)}
        onSave={handleSaveSimpleAccount}
      />

      {/* Token 更新 */}
      {updatingAccount && (
        <TokenUpdateModal
          isOpen={showTokenUpdate}
          onClose={() => {
            setShowTokenUpdate(false)
            setUpdatingAccount(null)
          }}
          onUpdate={handleUpdateToken}
          account={updatingAccount}
        />
      )}

      {/* 字體管理 */}
      <FontManagement
        isOpen={showFontManagement}
        onClose={() => setShowFontManagement(false)}
      />
    </div>
  )
}
