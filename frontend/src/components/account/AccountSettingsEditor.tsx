import React, { useState, useEffect } from 'react'
import {
  X,
  Save,
  Settings,
  Clock,
  Zap,
  Calendar,
  Target,
  AlertCircle,
  Info,
  Shield,
  School,
  Key,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface SocialAccount {
  id: number
  platform: string
  platform_username: string
  display_name: string
  status: 'active' | 'disabled' | 'error' | 'pending'
  publish_trigger: 'immediate' | 'scheduled' | 'batch_count'
  batch_size: number
  schedule_hour?: number
  auto_hashtags: string[]
  total_posts: number
  last_post_at?: string
  created_at: string
  school_id?: number | null
  school?: {
    id: number
    name: string
    display_name: string
    slug: string
  }
}

interface AccountSettingsEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (accountData: any) => void
  account?: SocialAccount
}

interface School {
  id: number
  name: string
  display_name: string
}

export default function AccountSettingsEditor({ isOpen, onClose, onSave, account }: AccountSettingsEditorProps) {
  const { role } = useAuth()
  const [settings, setSettings] = useState({
    display_name: '',
    publish_trigger: 'batch_count' as 'immediate' | 'scheduled' | 'batch_count',
    batch_size: 5,
    schedule_hour: 12,
    auto_hashtags: [] as string[],
    status: 'active' as 'active' | 'disabled',
    school_id: null as number | null
  })
  const [saving, setSaving] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [loadingSchools, setLoadingSchools] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [userSchoolId, setUserSchoolId] = useState<number | null>(null)
  const [newToken, setNewToken] = useState('')
  const [tokenUpdating, setTokenUpdating] = useState(false)

  useEffect(() => {
    if (account) {
      setSettings({
        display_name: account.display_name || '',
        publish_trigger: account.publish_trigger || 'batch_count',
        batch_size: account.batch_size || 5,
        schedule_hour: account.schedule_hour || 12,
        auto_hashtags: Array.isArray(account.auto_hashtags) ? account.auto_hashtags : [],
        status: account.status === 'disabled' ? 'disabled' : 'active',
        school_id: account.school_id || null
      })
    }
  }, [account])

  // 載入學校清單
  useEffect(() => {
    if (isOpen) {
      fetchSchools()
    }
  }, [isOpen])

  const fetchSchools = async () => {
    setLoadingSchools(true)
    try {
      const response = await fetch('/api/admin/social/schools', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setSchools(data.schools || [])
        setUserRole(data.user_role || '')
        setUserSchoolId(data.user_school_id || null)
      } else {
        console.error('Failed to fetch schools:', response.status)
      }
    } catch (error) {
      console.error('Failed to fetch schools:', error)
    } finally {
      setLoadingSchools(false)
    }
  }

  const handleSave = async () => {
    if (!account) return

    setSaving(true)
    try {
      await onSave({
        account_id: account.id,
        ...settings
      })
      onClose()
    } catch (error) {
      console.error('Save account settings failed:', error)
      alert('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const handleTokenUpdate = async () => {
    if (!account || !newToken.trim()) {
      alert('請輸入新的 Token')
      return
    }

    setTokenUpdating(true)
    try {
      const response = await fetch(`/api/admin/social/accounts/${account.id}/token`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          instagram_user_token: newToken.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Token 更新失敗')
      }

      const result = await response.json()
      if (result.success) {
        alert('Token 更新成功！')
        setNewToken('')
        onClose() // 關閉編輯器讓用戶看到更新後的狀態
      } else {
        throw new Error(result.error || 'Token 更新失敗')
      }
    } catch (error: any) {
      console.error('Token update failed:', error)
      alert(error.message || 'Token 更新失敗，請稍後再試')
    } finally {
      setTokenUpdating(false)
    }
  }



  const getTriggerDescription = (trigger: string) => {
    switch (trigger) {
      case 'immediate':
        return '每篇論壇貼文審核通過後立即發布到 Instagram'
      case 'scheduled':
        return '在指定時間自動發布累積的內容（輪播形式）'
      case 'batch_count':
        return '累積到指定數量的貼文後自動發布（輪播形式）'
      default:
        return ''
    }
  }

  if (!isOpen || !account) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-semibold dual-text">帳號設定</h2>
              <p className="text-sm text-muted">@{account.platform_username}</p>
            </div>
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
              儲存設定
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* 基本設定 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-muted" />
              <h3 className="font-semibold dual-text">基本設定</h3>
            </div>

            <div>
              <label className="block text-sm font-medium dual-text mb-2">顯示名稱</label>
              <input
                type="text"
                value={settings.display_name}
                onChange={(e) => setSettings(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="輸入顯示名稱..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-muted mt-1">在管理介面中顯示的名稱</p>
            </div>

            <div>
              <label className="block text-sm font-medium dual-text mb-2">帳號狀態</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSettings(prev => ({ ...prev, status: 'active' }))}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    settings.status === 'active'
                      ? 'border-green-500 bg-primary text-primary-foreground shadow-sm'
                      : 'bg-gray-300 text-gray-600 border-gray-300 hover:bg-gray-400'
                  }`}
                >
                  <div className={`font-medium text-sm ${settings.status === 'active' ? 'text-white' : 'text-gray-500'}`}>啟用</div>
                  <div className={`text-xs mt-1 ${settings.status === 'active' ? 'text-white/70' : 'text-gray-400'}`}>正常發布內容</div>
                </button>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, status: 'disabled' }))}
                  className={`p-3 border rounded-lg text-left transition-colors ${
                    settings.status === 'disabled'
                      ? 'border-red-500 bg-primary text-primary-foreground shadow-sm'
                      : 'bg-gray-300 text-gray-600 border-gray-300 hover:bg-gray-400'
                  }`}
                >
                  <div className={`font-medium text-sm ${settings.status === 'disabled' ? 'text-white' : 'text-gray-500'}`}>停用</div>
                  <div className={`text-xs mt-1 ${settings.status === 'disabled' ? 'text-white/70' : 'text-gray-400'}`}>暫停發布功能</div>
                </button>
              </div>
            </div>
          </div>

          {/* 發布設定 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-muted" />
              <h3 className="font-semibold dual-text">發布設定</h3>
            </div>

            <div>
              <label className="block text-sm font-medium dual-text mb-2">發布觸發模式</label>
              <div className="space-y-3">
                {[
                  { 
                    value: 'immediate', 
                    label: '立即發布', 
                    icon: Zap,
                    color: 'text-orange-500',
                    bgColor: 'bg-orange-50 border-orange-200'
                  },
                  { 
                    value: 'batch_count', 
                    label: '定量觸發', 
                    icon: Target,
                    color: 'text-blue-500',
                    bgColor: 'bg-blue-50 border-blue-200'
                  },
                  { 
                    value: 'scheduled', 
                    label: '定時發布', 
                    icon: Clock,
                    color: 'text-purple-500',
                    bgColor: 'bg-purple-50 border-purple-200'
                  }
                ].map(({ value, label, icon: Icon, color, bgColor }) => (
                  <button
                    key={value}
                    onClick={() => setSettings(prev => ({ ...prev, publish_trigger: value as any }))}
                    className={`w-full p-4 border rounded-lg text-left transition-colors ${
                      settings.publish_trigger === value
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'bg-gray-300 text-gray-600 border-gray-300 hover:bg-gray-400'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 ${
                        settings.publish_trigger === value ? 'text-white' : 'text-gray-500'
                      }`} />
                      <div className="flex-1">
                        <div className={`font-medium text-sm ${
                          settings.publish_trigger === value ? 'text-white' : 'text-gray-500'
                        }`}>{label}</div>
                        <div className={`text-xs mt-1 ${
                          settings.publish_trigger === value ? 'text-white/70' : 'text-gray-400'
                        }`}>
                          {getTriggerDescription(value)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 定量觸發設定 */}
            {settings.publish_trigger === 'batch_count' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-800 text-sm">批次設定</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-800 mb-2">
                    觸發數量：{settings.batch_size} 篇
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={settings.batch_size}
                    onChange={(e) => setSettings(prev => ({ ...prev, batch_size: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-blue-600 mt-1">
                    <span>2篇</span>
                    <span>10篇 (IG 輪播限制)</span>
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    累積到 {settings.batch_size} 篇審核通過的貼文時，自動合併發布為 Instagram 輪播
                  </p>
                </div>
              </div>
            )}

            {/* 定時發布設定 */}
            {settings.publish_trigger === 'scheduled' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span className="font-medium text-purple-800 text-sm">定時設定</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-800 mb-2">
                    發布時間：{settings.schedule_hour}:00
                  </label>
                  <input
                    type="range"
                    min="6"
                    max="23"
                    value={settings.schedule_hour}
                    onChange={(e) => setSettings(prev => ({ ...prev, schedule_hour: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-purple-600 mt-1">
                    <span>6:00</span>
                    <span>23:00</span>
                  </div>
                  <p className="text-xs text-purple-700 mt-2">
                    每日 {settings.schedule_hour}:00 自動發布累積的內容（如果有的話）
                  </p>
                </div>
              </div>
            )}

            {/* 立即發布提醒 */}
            {settings.publish_trigger === 'immediate' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-orange-700">
                    <div className="font-medium mb-1">注意事項</div>
                    <div>立即發布模式會為每篇審核通過的論壇貼文創建單獨的 Instagram 貼文，可能會增加發布頻率。建議用於重要公告或即時內容。</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Token 更新設定 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-muted" />
              <h3 className="font-semibold dual-text">更新 Access Token</h3>
            </div>

            <div className="space-y-4">
              {/* Token 輸入欄位 */}
              <div>
                <label className="block text-sm font-medium dual-text mb-2">
                  新的 Instagram User Token
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-4 h-4 text-muted" />
                  <textarea
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="貼上新的 Instagram User Token..."
                    rows={3}
                    className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-muted mt-1">
                  從 Facebook 開發者平台獲取的 User Token，支援短期或長期 Token
                </p>
              </div>

              {/* 更新按鈕 */}
              <button
                onClick={handleTokenUpdate}
                disabled={!newToken.trim() || tokenUpdating}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tokenUpdating ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{tokenUpdating ? '更新中...' : '更新 Token'}</span>
              </button>

              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <div className="font-medium mb-1">更新 Token 的原因：</div>
                  <ul className="space-y-0.5">
                    <li>• Facebook/Instagram tokens 通常有60天有效期</li>
                    <li>• 帳號權限變更時需要重新授權</li>
                    <li>• 當帳號狀態顯示錯誤時，通常是 Token 過期</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 學校綁定設定 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <School className="w-5 h-5 text-muted" />
              <h3 className="font-semibold dual-text">學校綁定</h3>
            </div>

            {/* 當前綁定的學校 */}
            {account?.school && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <School className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-800 text-sm">當前綁定學校</span>
                </div>
                <div className="text-green-700 font-medium">{account.school.display_name || account.school.name}</div>
                <div className="text-xs text-green-600 mt-1">
                  此帳號只能發布來自「{account.school.display_name || account.school.name}」的論壇貼文
                </div>
              </div>
            )}

            {/* 未綁定學校的提示 */}
            {!account?.school && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <span className="font-medium text-yellow-800 text-sm">未綁定學校</span>
                </div>
                <div className="text-yellow-700 text-sm">
                  此帳號沒有綁定特定學校，可能會影響內容發布的權限控制。
                </div>
              </div>
            )}

            {/* dev_admin 可以變更學校綁定 */}
            {userRole === 'dev_admin' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-800 text-sm">變更學校綁定（僅開發管理員）</span>
                </div>
                
                {loadingSchools ? (
                  <div className="text-center py-4">
                    <div className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-2 text-blue-700 text-sm">載入學校清單中...</span>
                  </div>
                ) : (
                  <div>
                    <select
                      value={settings.school_id || ''}
                      onChange={(e) => setSettings(prev => ({ 
                        ...prev, 
                        school_id: e.target.value ? parseInt(e.target.value) : null 
                      }))}
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="">（不綁定學校）</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.display_name || school.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-blue-700 mt-2">
                      選擇此帳號應該綁定的學校。綁定後，帳號只能發布該學校的論壇貼文。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 非 dev_admin 的權限說明 */}
            {userRole !== 'dev_admin' && (
              <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg">
                <Info className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted">
                  <div className="font-medium mb-1">權限說明：</div>
                  {userRole === 'campus_admin' && (
                    <div>• 校園管理員：只能管理自己學校綁定的帳號</div>
                  )}
                  {userRole === 'cross_admin' && (
                    <div>• 跨校管理員：可以查看但無法新增帳號</div>
                  )}
                  <div>• 學校綁定設定只有開發管理員可以修改</div>
                </div>
              </div>
            )}
          </div>

          {/* 統計信息 */}
          <div className="border-t border-border pt-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-muted/20 rounded-lg">
                <div className="text-2xl font-bold dual-text">{account.total_posts}</div>
                <div className="text-sm text-muted">總發布數</div>
              </div>
              <div className="p-4 bg-muted/20 rounded-lg">
                <div className="text-2xl font-bold dual-text">
                  {account.last_post_at 
                    ? new Date(account.last_post_at).toLocaleDateString('zh-TW')
                    : '無'
                  }
                </div>
                <div className="text-sm text-muted">上次發布</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}