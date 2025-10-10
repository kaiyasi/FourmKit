import React, { useState, useEffect } from 'react'
import {
  X,
  Save,
  Instagram,
  Key,
  Hash,
  Info,
  ExternalLink,
  AlertCircle,
  School,
  Shield
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface SimpleAccountFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (accountData: any) => void
}

interface School {
  id: number
  name: string
  display_name: string
  slug: string
}

export default function SimpleAccountForm({ isOpen, onClose, onSave }: SimpleAccountFormProps) {
  const { role } = useAuth()
  const [formData, setFormData] = useState({
    display_name: '',
    instagram_user_token: '',
    instagram_page_id: '',
    platform_username: '',
    school_id: null as number | null
  })
  const [saving, setSaving] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [loadingSchools, setLoadingSchools] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [userSchoolId, setUserSchoolId] = useState<number | null>(null)
  const [debugPages, setDebugPages] = useState<any[]>([])
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [debugLoading, setDebugLoading] = useState(false)

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
        
        // 根據角色自動設定學校
        if (data.user_role === 'campus_admin' && data.user_school_id) {
          setFormData(prev => ({ ...prev, school_id: data.user_school_id }))
        }
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
    // 基本驗證
    if (!formData.display_name.trim()) {
      alert('請輸入顯示名稱')
      return
    }
    // Token 改為可選，沒有也可先建帳號（狀態標記為待驗證）
    if (!formData.instagram_page_id.trim()) {
      alert('請輸入 Page ID')
      return
    }

    setSaving(true)
    try {
      await onSave(formData)
      // 重置表單
      setFormData({
        display_name: '',
        instagram_user_token: '',
        instagram_page_id: '',
        platform_username: '',
        school_id: null
      })
      onClose()
    } catch (error: any) {
      console.error('Save account failed:', error)
      const msg = (error && (error.message || error.msg)) || '新增失敗，請稍後再試'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDebugPages = async () => {
    if (!formData.instagram_user_token.trim()) {
      alert('請先輸入 Instagram User Token')
      return
    }

    setDebugLoading(true)
    try {
      const response = await fetch('/api/admin/social/debug/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          instagram_user_token: formData.instagram_user_token
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setDebugPages(result.pages || [])
        setShowDebugInfo(true)
      } else {
        alert(`診斷失敗: ${result.error}`)
      }
    } catch (error) {
      console.error('Debug pages failed:', error)
      alert('診斷過程中發生錯誤')
    } finally {
      setDebugLoading(false)
    }
  }

  const handleSelectPageId = (pageId: string) => {
    setFormData(prev => ({ ...prev, instagram_page_id: pageId }))
    setShowDebugInfo(false)
  }

  const handleClose = () => {
    setFormData({
      display_name: '',
      instagram_user_token: '',
      instagram_page_id: '',
      platform_username: '',
      school_id: null
    })
    setDebugPages([])
    setShowDebugInfo(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 border-b border-border gap-4">
          <div className="flex items-center gap-3">
            <Instagram className="w-6 h-6 text-pink-500" />
            <div>
              <h2 className="text-lg sm:text-xl font-semibold dual-text">新增 Instagram 帳號</h2>
              <p className="text-sm text-muted">輸入你的 Instagram Business 帳號資訊</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">新增帳號</span>
              <span className="sm:hidden">新增</span>
            </button>
            <button
              onClick={handleClose}
              className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* 說明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-2">如何獲取 Instagram 帳號資訊：</div>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>前往 <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Facebook 開發者平台 <ExternalLink className="w-3 h-3" /></a></li>
                  <li>創建應用程式並設定 Instagram Basic Display API</li>
                  <li>獲取用戶存取權杖（短期或長期皆可，系統會自動轉換）</li>
                  <li>在 Instagram 應用程式中找到你的 Page ID</li>
                </ol>
              </div>
            </div>
          </div>

          {/* 表單欄位 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium dual-text mb-2">
                顯示名稱 *
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="例如：我的學校官方帳號"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-muted mt-1">在管理介面中顯示的帳號名稱</p>
            </div>

            <div>
              <label className="block text-sm font-medium dual-text mb-2">
                Instagram 用戶名稱（可選）
              </label>
              <input
                type="text"
                value={formData.platform_username}
                onChange={(e) => setFormData(prev => ({ ...prev, platform_username: e.target.value }))}
                placeholder="your_instagram_username"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-muted mt-1">你的 Instagram 用戶名稱（不含 @）</p>
            </div>

            <div>
              <label className="block text-sm font-medium dual-text mb-2">
                Instagram User Token（建議輸入短期Token）
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-3 w-4 h-4 text-muted" />
                <textarea
                  value={formData.instagram_user_token}
                  onChange={(e) => setFormData(prev => ({ ...prev, instagram_user_token: e.target.value }))}
                  placeholder="建議輸入短期Token（EAAJ...開頭），系統會自動轉為長期Token並儲存"
                  rows={3}
                  className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none font-mono text-xs sm:text-sm"
                />
              </div>
              <p className="text-xs text-muted mt-1">
                <span className="text-green-600 font-medium">推薦：</span>輸入短期Token（EAAJ開頭），系統會自動轉換為長期Token避免過期問題。
                也支援長期Token（IGQVJY開頭）直接輸入。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium dual-text mb-2">
                粉專 Page ID（必填）
              </label>
              <input
                type="text"
                value={formData.instagram_page_id}
                onChange={(e) => setFormData(prev => ({ ...prev, instagram_page_id: e.target.value }))}
                placeholder="例如：123456789012345（Facebook 粉專 ID）"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
              />
              <p className="text-xs text-muted mt-1">請輸入 Facebook 粉專的 Page ID（不是個人 Facebook ID）。你也可以用下方診斷按鈕從 Token 自動列出並選擇。</p>
            </div>


            {/* 學校綁定選擇 */}
            <div>
              <label className="block text-sm font-medium dual-text mb-2">
                學校綁定 *
              </label>
              
              {loadingSchools ? (
                <div className="w-full px-3 py-2 bg-background border border-border rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-muted text-sm">載入學校清單中...</span>
                </div>
              ) : userRole === 'dev_admin' ? (
                <div>
                  <select
                    value={formData.school_id || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      school_id: e.target.value ? parseInt(e.target.value) : null 
                    }))}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">（選擇學校或不綁定）</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.display_name || school.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted mt-1">選擇此帳號綁定的學校（開發管理員可以選擇任何學校或不綁定）</p>
                </div>
              ) : userRole === 'campus_admin' && userSchoolId ? (
                <div>
                  <div className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-muted cursor-not-allowed">
                    {schools.find(s => s.id === userSchoolId)?.display_name || 
                     schools.find(s => s.id === userSchoolId)?.name || 
                     '載入中...'}
                  </div>
                  <p className="text-xs text-muted mt-1">校園管理員只能新增自己學校的帳號</p>
                </div>
              ) : userRole === 'cross_admin' ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm text-yellow-700 font-medium">權限限制</span>
                  </div>
                  <p className="text-xs text-yellow-600 mt-1">跨校管理員無法新增新帳號</p>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-700 font-medium">無法載入學校資訊</span>
                  </div>
                  <p className="text-xs text-red-600 mt-1">請重新整理頁面或聯絡管理員</p>
                </div>
              )}
            </div>
          </div>

          {/* 注意事項 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <div className="font-medium mb-1">重要提醒：</div>
                <ul className="text-xs space-y-1">
                  <li>• 請確保你的 Instagram 帳號是 Business 或 Creator 類型</li>
                  <li>• Token 需要包含 instagram_basic 和 pages_read_engagement 權限</li>
                  <li>• 系統會自動驗證提供的資訊是否有效</li>
                  <li>• 請妥善保管你的 Access Token，不要分享給他人</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Token 說明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-2">關於 Instagram Token：</div>
                <ul className="text-xs space-y-1">
                  <li>• <span className="font-medium">短期 Token：</span>EAAJ開頭，有效期數小時，需要較頻繁更新</li>
                  <li>• <span className="font-medium">長期 Token：</span>IGQVJY開頭，有效期約60天，推薦使用</li>
                  <li>• <span className="font-medium">獲取方式：</span>從 Facebook 開發者平台的 Graph API Explorer</li>
                  <li>• <span className="font-medium">管理：</span>Token 過期時請手動更新新的 Token</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
