import React, { useState, useEffect } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import NewTemplateEditor from '@/components/templates/NewTemplateEditor'
import AccountSettingsEditor from '@/components/account/AccountSettingsEditor'
import SimpleAccountForm from '@/components/account/SimpleAccountForm'
import TokenUpdateModal from '@/components/account/TokenUpdateModal'
import FontManagement from '@/components/admin/FontManagement'
import {
  Instagram,
  Plus,
  Settings,
  BarChart3,
  Image,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Users,
  FileImage,
  TrendingUp,
  Menu,
  X,
  Type
} from 'lucide-react'

// 介面定義
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
  description?: string
  template_type: string
  is_active: boolean
  usage_count: number
  created_at: string
}

interface PublishStats {
  total_posts: number
  pending_posts: number
  failed_posts: number
  published_today: number
}

interface MobileStatCardProps {
  title: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'red' | 'orange'
  trend?: number
}

// 手機版統計卡片組件
const MobileStatCard: React.FC<MobileStatCardProps> = ({ title, value, icon: Icon, color, trend }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800'
  }

  const iconColorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    orange: 'text-orange-600'
  }

  return (
    <div className={`rounded-xl p-4 border-2 ${colorClasses[color]} transition-all duration-200`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-6 h-6 ${iconColorClasses[color]}`} />
        {trend !== undefined && (
          <span className={`text-xs px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold mb-1">{value.toLocaleString()}</div>
      <div className="text-sm opacity-80">{title}</div>
    </div>
  )
}

// 手機版快速操作卡片
const QuickActionCard: React.FC<{
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  onClick: () => void
}> = ({ title, description, icon: Icon, color, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full p-4 rounded-xl border-2 transition-all duration-200 active:scale-95 ${color}`}
  >
    <div className="flex items-center gap-3">
      <Icon className="w-8 h-8" />
      <div className="text-left flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm opacity-80">{description}</div>
      </div>
      <ChevronRight className="w-5 h-5 opacity-60" />
    </div>
  </button>
)

// 手機版帳號卡片
const MobileAccountCard: React.FC<{
  account: SocialAccount
  onEdit: () => void
  onSettings: () => void
  onValidate: () => void
  loading?: boolean
}> = ({ account, onEdit, onSettings, onValidate, loading = false }) => {
  const statusColors = {
    active: 'bg-green-100 text-green-800 border-green-200',
    disabled: 'bg-gray-100 text-gray-800 border-gray-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    pending: 'bg-orange-100 text-orange-800 border-orange-200'
  }

  const statusLabels = {
    active: '正常運作',
    disabled: '已停用',
    error: '連線錯誤',
    pending: '待驗證'
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <Instagram className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold dual-text">@{account.platform_username}</div>
            <div className="text-sm text-muted">{account.display_name}</div>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[account.status]}`}>
          {statusLabels[account.status]}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-lg font-bold dual-text">{account.total_posts}</div>
          <div className="text-xs text-muted">總發布數</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-lg font-bold dual-text">{account.batch_size}</div>
          <div className="text-xs text-muted">批次大小</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onEdit}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Edit className="w-4 h-4" />
          編輯
        </button>
        <button
          onClick={onSettings}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-muted text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          <Settings className="w-4 h-4" />
          設定
        </button>
        <button
          onClick={onValidate}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-green-100 text-green-800 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          驗證
        </button>
      </div>
    </div>
  )
}

// 手機版模板卡片
const MobileTemplateCard: React.FC<{
  template: ContentTemplate
  onEdit: () => void
  onPreview: () => void
  onDelete: () => void
  loading?: boolean
}> = ({ template, onEdit, onPreview, onDelete, loading = false }) => (
  <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
          <Image className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold dual-text">{template.name}</div>
          <div className="text-sm text-muted">{template.template_type}</div>
        </div>
      </div>
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
        {template.is_active ? '啟用中' : '已停用'}
      </span>
    </div>
    
    {template.description && (
      <p className="text-sm text-muted mb-3 line-clamp-2">{template.description}</p>
    )}
    
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="text-lg font-bold dual-text">{template.usage_count}</div>
        <div className="text-xs text-muted">使用次數</div>
      </div>
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="text-lg font-bold dual-text">
          {new Date(template.created_at).toLocaleDateString()}
        </div>
        <div className="text-xs text-muted">建立日期</div>
      </div>
    </div>

    <div className="flex gap-2">
      <button
        onClick={onEdit}
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <Edit className="w-4 h-4" />
        編輯
      </button>
      <button
        onClick={onPreview}
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors disabled:opacity-50"
      >
        <Eye className="w-4 h-4" />
        預覽
      </button>
      <button
        onClick={onDelete}
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-red-100 text-red-800 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        刪除
      </button>
    </div>
  </div>
)

export default function AdminInstagramMobilePage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [templates, setTemplates] = useState<ContentTemplate[]>([])
  const [stats, setStats] = useState<PublishStats>({
    total_posts: 0,
    pending_posts: 0,
    failed_posts: 0,
    published_today: 0
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'accounts' | 'templates' | 'stats'>('accounts')
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({})
  
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null)
  const [showSimpleAccountForm, setShowSimpleAccountForm] = useState(false)
  const [showFontManagement, setShowFontManagement] = useState(false)
  const [showTokenUpdate, setShowTokenUpdate] = useState(false)
  const [updatingAccount, setUpdatingAccount] = useState<SocialAccount | null>(null)

  // 載入資料
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      const [accountsRes, templatesRes, statsRes] = await Promise.all([
        fetch('/api/admin/social/accounts', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()),
        fetch('/api/admin/social/templates', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()),
        fetch('/api/admin/social/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json())
      ])
      
      if (accountsRes.success) setAccounts(accountsRes.accounts || [])
      if (templatesRes.success) setTemplates(templatesRes.templates || [])
      if (statsRes.success && statsRes.stats) {
        setStats(statsRes.stats.overview || {
          total_posts: 0,
          pending_posts: 0,
          failed_posts: 0,
          published_today: 0
        })
      }
      
    } catch (error) {
      console.error('資料載入失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  // 帳號操作
  const handleEditAccount = (account: SocialAccount) => {
    setEditingAccount(account)
    setShowAccountSettings(true)
  }

  const handleValidateAccount = async (accountId: number) => {
    const loadingKey = `validate-${accountId}`
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }))

    try {
      const response = await fetch(`/api/admin/social/accounts/${accountId}/validate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })

      const result = await response.json()
      if (result.success) {
        alert(`帳號驗證成功！\n${result.status_message || ''}`)
        fetchData()
      } else {
        // 顯示詳細的錯誤訊息和狀態
        const errorMsg = result.status_message || result.error || '未知錯誤'
        const debugInfo = result.debug_info ? `\n\n除錯資訊：\n- Page ID: ${result.debug_info.page_id || '無'}\n- 有 Token: ${result.debug_info.has_token ? '是' : '否'}\n- 驗證錯誤: ${result.debug_info.validation_error || '無'}` : ''

        // 根據錯誤類型提供不同的處理方式
        const errorMessage = result.status_message || result.error || '未知錯誤'

        // Token 相關問題：可以透過更新 Token 解決
        const isTokenIssue = errorMessage.includes('Token') ||
                           errorMessage.includes('過期') ||
                           errorMessage.includes('無效')

        // Instagram Business Account 相關問題：需要到 Facebook 設定
        const isInstagramAccountIssue = errorMessage.includes('Instagram Business Account') ||
                                       errorMessage.includes('無法訪問') ||
                                       errorMessage.includes('權限不足') ||
                                       errorMessage.includes('已被撤銷')

        if (isTokenIssue) {
          const shouldUpdate = confirm(`${errorMsg}\n\n是否要立即更新 Token 和 Page ID？`)
          if (shouldUpdate) {
            // 找到對應的帳號
            const account = accounts.find(acc => acc.id === accountId)
            if (account) {
              setUpdatingAccount(account)
              setShowTokenUpdate(true)
            }
          }
        } else if (isInstagramAccountIssue) {
          // Instagram Business Account 相關問題，提供具體的修復步驟
          const fixSteps = `${errorMsg}\n\n📋 修復步驟：\n1. 前往 Facebook 企業管理平台 (business.facebook.com)\n2. 選擇您的 Page\n3. 到「Instagram 帳號」設定中\n4. 重新連結或授權 Instagram Business Account\n5. 確認權限包含「管理 Instagram 內容」\n6. 完成後重新驗證`

          alert(fixSteps)
        } else {
          alert(`驗證結果：${errorMsg}${debugInfo}`)
        }

        // 如果有狀態更新，仍然重新載入資料
        if (result.account_status) {
          fetchData()
        }
      }
    } catch (error) {
      console.error('帳號驗證失敗:', error)
      alert('網路連線錯誤，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleUpdateToken = async (tokenData: { instagram_user_token: string; instagram_page_id: string }) => {
    if (!updatingAccount) return

    try {
      const payload: any = {}

      if (tokenData.instagram_user_token?.trim()) {
        payload.instagram_user_token = tokenData.instagram_user_token.trim()
      }
      if (tokenData.instagram_page_id?.trim()) {
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

        alert(`✅ 帳號 @${updatingAccount.platform_username} Token 更新成功！`)

        setShowTokenUpdate(false)
        setUpdatingAccount(null)
      } else {
        alert(`❌ Token 更新失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('Update token failed:', error)
      alert('Token 更新失敗，請稍後再試')
    }
  }

  // 模板操作
  const handleEditTemplate = (template: ContentTemplate) => {
    setEditingTemplate(template)
    setShowTemplateEditor(true)
  }

  const handlePreviewTemplate = async (templateId: number) => {
    const loadingKey = `preview-${templateId}`
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
    
    try {
      const response = await fetch('/api/admin/social/templates/preview', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_id: templateId,
          content_data: {
            title: '預覽標題：校園活動分享',
            content: '這是預覽內容，展示模板效果...',
            author: '預覽用戶'
          }
        })
      })
      
      const result = await response.json()
      if (result.success && result.preview) {
        if (result.preview.preview_html) {
          const previewWindow = window.open('', '_blank', 'width=600,height=800')
          previewWindow?.document.write(result.preview.preview_html)
          previewWindow?.document.close()
        } else {
          alert(`預覽內容:\n${result.preview.caption || '無內容'}`)
        }
      } else {
        alert(`預覽失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('模板預覽失敗:', error)
      alert('預覽失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleDeleteTemplate = async (templateId: number, templateName: string) => {
    if (!confirm(`確定要刪除模板 "${templateName}" 嗎？此操作無法恢復。`)) return
    
    const loadingKey = `delete-${templateId}`
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
    
    try {
      const response = await fetch(`/api/admin/social/templates/${templateId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      
      const result = await response.json()
      if (result.success) {
        alert('模板刪除成功')
        fetchData()
      } else {
        alert(`刪除失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('模板刪除失敗:', error)
      alert('刪除失敗，請稍後再試')
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted">載入中...</p>
          </div>
        </div>
      )
    }

    switch (activeTab) {
      case 'accounts':
        return (
          <div className="space-y-4">
            {/* 新增帳號按鈕 */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold dual-text">Instagram 帳號</h3>
              <button
                onClick={() => setShowSimpleAccountForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                新增帳號
              </button>
            </div>

            {/* 帳號列表 - 仿照電腦版表格風格 */}
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  <Users className="w-8 h-8 mx-auto mb-2" />
                  <p>尚未新增 Instagram 帳號</p>
                  <button
                    onClick={() => setShowSimpleAccountForm(true)}
                    className="mt-2 text-primary hover:underline text-sm"
                  >
                    立即新增
                  </button>
                </div>
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="bg-surface-hover border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${account.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <div>
                          <div className="font-medium dual-text">@{account.platform_username}</div>
                          <div className="text-xs text-muted">
                            {account.total_posts} 次發布 • 
                            {account.status === 'active' ? ' 已啟用' : ' 已停用'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleValidateAccount(account.id)}
                          disabled={actionLoading[`validate-${account.id}`]}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="驗證帳號"
                        >
                          {actionLoading[`validate-${account.id}`] ?
                            <RefreshCw className="w-4 h-4 animate-spin" /> :
                            <CheckCircle className="w-4 h-4" />
                          }
                        </button>
                        <button
                          onClick={() => {
                            setUpdatingAccount(account)
                            setShowTokenUpdate(true)
                          }}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="更新 Token"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditAccount(account)}
                          className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          title="設定"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )

      case 'templates':
        return (
          <div className="space-y-4">
            {/* 新增模板按鈕 */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold dual-text">發布模板</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFontManagement(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                >
                  <Type className="w-4 h-4" />
                  字體
                </button>
                <button
                  onClick={() => setShowTemplateEditor(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  新增模板
                </button>
              </div>
            </div>

            {/* 模板列表 - 仿照電腦版表格風格 */}
            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  <FileImage className="w-8 h-8 mx-auto mb-2" />
                  <p>尚未建立發布模板</p>
                  <button
                    onClick={() => setShowTemplateEditor(true)}
                    className="mt-2 text-primary hover:underline text-sm"
                  >
                    立即建立
                  </button>
                </div>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className="bg-surface-hover border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${template.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <div>
                          <div className="font-medium dual-text">{template.name}</div>
                          <div className="text-xs text-muted">
                            {template.template_type} • 
                            {template.is_default ? ' 預設模板' : ' 自訂模板'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePreviewTemplate(template.id)}
                          disabled={actionLoading[`preview-${template.id}`]}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="預覽"
                        >
                          {actionLoading[`preview-${template.id}`] ? 
                            <RefreshCw className="w-4 h-4 animate-spin" /> : 
                            <Eye className="w-4 h-4" />
                          }
                        </button>
                        <button
                          onClick={() => handleEditTemplate(template)}
                          className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          title="編輯"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        {!template.is_default && (
                          <button
                            onClick={() => handleDeleteTemplate(template.id, template.name)}
                            disabled={actionLoading[`delete-${template.id}`]}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="刪除"
                          >
                            {actionLoading[`delete-${template.id}`] ? 
                              <RefreshCw className="w-4 h-4 animate-spin" /> : 
                              <Trash2 className="w-4 h-4" />
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )

      case 'stats':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold dual-text">發布統計</h3>
            
            {/* 統計概覽 - 簡潔版 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-hover rounded-lg p-3 border border-border/50 text-center">
                <div className="text-lg font-bold dual-text">{stats.total_posts}</div>
                <div className="text-xs text-muted">總發布</div>
              </div>
              <div className="bg-surface-hover rounded-lg p-3 border border-border/50 text-center">
                <div className="text-lg font-bold text-green-600">{stats.published_today}</div>
                <div className="text-xs text-muted">今日成功</div>
              </div>
              <div className="bg-surface-hover rounded-lg p-3 border border-border/50 text-center">
                <div className="text-lg font-bold text-orange-600">{stats.pending_posts}</div>
                <div className="text-xs text-muted">待處理</div>
              </div>
              <div className="bg-surface-hover rounded-lg p-3 border border-border/50 text-center">
                <div className="text-lg font-bold text-red-600">{stats.failed_posts}</div>
                <div className="text-xs text-muted">失敗</div>
              </div>
            </div>

            {/* 帳號發布統計 */}
            {accounts.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-md font-medium dual-text">各帳號發布數</h4>
                {accounts.map((account) => (
                  <div key={account.id} className="bg-surface-hover border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${account.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="font-medium dual-text text-sm">@{account.platform_username}</span>
                      </div>
                      <span className="text-lg font-bold dual-text">{account.total_posts}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // 底部導航項目
  const navItems = [
    { id: 'overview', label: '總覽', icon: BarChart3 },
    { id: 'accounts', label: '帳號', icon: Users },
    { id: 'templates', label: '模板', icon: FileImage },
    { id: 'stats', label: '統計', icon: TrendingUp }
  ]

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/instagram" />
      <MobileBottomNav />

      <main className="mx-auto max-w-md px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        {/* Header - 仿照電腦版風格 */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Instagram className="w-6 h-6 text-pink-500" />
              <h1 className="text-xl font-semibold dual-text">Instagram 整合管理</h1>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-sm">刷新</span>
            </button>
          </div>
          
          {/* Stats Overview - 仿照電腦版統計卡片 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-hover rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-muted">總發布</span>
              </div>
              <div className="text-lg font-bold dual-text">{stats.total_posts}</div>
            </div>
            <div className="bg-surface-hover rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-medium text-muted">待處理</span>
              </div>
              <div className="text-lg font-bold dual-text">{stats.pending_posts}</div>
            </div>
            <div className="bg-surface-hover rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium text-muted">失敗</span>
              </div>
              <div className="text-lg font-bold dual-text">{stats.failed_posts}</div>
            </div>
            <div className="bg-surface-hover rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-muted">今日</span>
              </div>
              <div className="text-lg font-bold dual-text">{stats.published_today}</div>
            </div>
          </div>
        </div>

        {/* Tabs - 仿照電腦版分頁 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft mb-6">
          <div className="flex border-b border-border">
            {[
              { id: 'accounts', label: '帳號管理', icon: Users },
              { id: 'templates', label: '模板', icon: FileImage },
              { id: 'stats', label: '統計', icon: TrendingUp }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.split('').slice(0, 2).join('')}</span>
              </button>
            ))}
          </div>
          
          <div className="p-4">
            {renderTabContent()}
          </div>
        </div>
      </main>

      {/* 模態框 */}
      <NewTemplateEditor
        isOpen={showTemplateEditor}
        onClose={() => {
          setShowTemplateEditor(false)
          setEditingTemplate(null)
        }}
        onSave={async (template) => {
          // TODO: 實現儲存邏輯
          console.log('儲存模板:', template)
          fetchData()
        }}
        accounts={accounts}
        editingTemplate={editingTemplate}
      />

      <AccountSettingsEditor
        isOpen={showAccountSettings}
        onClose={() => {
          setShowAccountSettings(false)
          setEditingAccount(null)
        }}
        onSave={async (accountData) => {
          try {
            const response = await fetch(`/api/admin/social/accounts/${accountData.account_id}/settings`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify(accountData)
            })

            const result = await response.json()
            if (result.success) {
              alert('帳號設定已更新')
              fetchData()
            } else {
              throw new Error(result.error || '儲存失敗')
            }
          } catch (error: any) {
            console.error('Save account settings failed:', error)
            alert(`儲存失敗: ${error.message}`)
            throw error
          }
        }}
        account={editingAccount}
      />

      <SimpleAccountForm
        isOpen={showSimpleAccountForm}
        onClose={() => setShowSimpleAccountForm(false)}
        onSave={async (accountData: any) => {
          const payload = {
            display_name: accountData.display_name,
            page_id: accountData.instagram_page_id,
            access_token: accountData.instagram_user_token,
            platform_username: accountData.platform_username,
            school_id: accountData.school_id,
          }
          const resp = await fetch('/api/instagram_page/accounts/create_with_page', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify(payload),
          })
          let result: any = null
          try { result = await resp.json() } catch { /* non-JSON */ }
          if (!resp.ok || !result?.success) {
            const err = (result?.error?.message || result?.error || result?.msg || '新增失敗')
            throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
          }
          alert('Instagram 帳號新增成功！')
          setShowSimpleAccountForm(false)
          fetchData()
        }}
      />

      <FontManagement
        isOpen={showFontManagement}
        onClose={() => setShowFontManagement(false)}
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
    </div>
  )
}
