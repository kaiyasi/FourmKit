import React, { useState } from 'react'
import {
  X,
  Save,
  Key,
  Info,
  ExternalLink,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

interface TokenUpdateModalProps {
  isOpen: boolean
  onClose: () => void
  onUpdate: (tokenData: { instagram_user_token: string; instagram_page_id: string }) => Promise<void>
  account: {
    id: number
    platform_username: string
    display_name: string
    status: string
  }
}

export default function TokenUpdateModal({ isOpen, onClose, onUpdate, account }: TokenUpdateModalProps) {
  const [formData, setFormData] = useState({
    instagram_user_token: '',
    instagram_page_id: ''
  })
  const [updating, setUpdating] = useState(false)
  const [debugPages, setDebugPages] = useState<any[]>([])
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [debugLoading, setDebugLoading] = useState(false)
  const [keepExistingPageId, setKeepExistingPageId] = useState(true)

  const handleUpdate = async () => {
    if (!formData.instagram_user_token.trim()) {
      alert('請輸入 Instagram User Token')
      return
    }

    setUpdating(true)
    try {
      // 如果選擇保留現有Page ID，則不傳送Page ID（後端會維持原有值）
      const updateData = {
        instagram_user_token: formData.instagram_user_token,
        facebook_id: keepExistingPageId ? '' : formData.instagram_page_id
      }
      await onUpdate(updateData)
      // 重置表單
      setFormData({
        instagram_user_token: '',
        instagram_page_id: ''
      })
      setKeepExistingPageId(true)
      onClose()
    } catch (error) {
      console.error('Token update failed:', error)
      alert('Token 更新失敗，請稍後再試')
    } finally {
      setUpdating(false)
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
      instagram_user_token: '',
      instagram_page_id: ''
    })
    setDebugPages([])
    setShowDebugInfo(false)
    setKeepExistingPageId(true)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 border-b border-border gap-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-lg sm:text-xl font-semibold dual-text">更新 Access Token</h2>
              <p className="text-sm text-muted">@{account.platform_username}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {updating ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">更新 Token</span>
              <span className="sm:hidden">更新</span>
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
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <div className="font-medium mb-2">為什麼需要更新 Token？</div>
                <ul className="text-xs space-y-1">
                  <li>• Facebook/Instagram tokens 通常有有效期限（60天）</li>
                  <li>• 帳號權限變更或重新授權時需要更新</li>
                  <li>• 當帳號狀態顯示為「錯誤」時，通常是 Token 過期了</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 獲取步驟說明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-2">如何獲取新的 Token：</div>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>前往 <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Facebook 開發者平台 <ExternalLink className="w-3 h-3" /></a></li>
                  <li>找到你的應用程式並進入「工具」→「圖表API探索工具」</li>
                  <li>獲取新的用戶存取權杖（短期或長期皆可，系統會自動轉換）</li>
                  <li>確認你的 Instagram Business 帳號的 Page ID</li>
                </ol>
              </div>
            </div>
          </div>

          {/* 表單欄位 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium dual-text mb-2">
                新的 Instagram User Token *（建議輸入短期Token）
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

            {/* Page ID 設定選項 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium dual-text">
                Page ID 設定
              </label>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pageIdOption"
                    checked={keepExistingPageId}
                    onChange={() => setKeepExistingPageId(true)}
                    className="text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">保留現有 Page ID（推薦）</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pageIdOption"
                    checked={!keepExistingPageId}
                    onChange={() => setKeepExistingPageId(false)}
                    className="text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">重新設定 Page ID</span>
                </label>
              </div>

              {!keepExistingPageId && (
                <div className="ml-6 space-y-2">
                  <input
                    type="text"
                    value={formData.instagram_page_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, instagram_page_id: e.target.value }))}
                    placeholder="例如：123456789012345（Facebook 粉專 ID）"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                  />
                  <p className="text-xs text-muted">輸入新的 Facebook 粉專 Page ID（不是個人 ID）</p>
                </div>
              )}

              <p className="text-xs text-muted">
                {keepExistingPageId
                  ? "將只更新 Token，保持原有的 Page ID 不變"
                  : "將同時更新 Token 和 Page ID"
                }
              </p>
            </div>
          </div>

          {/* 注意事項 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-800">
                <div className="font-medium mb-1">重要提醒：</div>
                <ul className="text-xs space-y-1">
                  <li>• 系統會驗證新 Token 是否對應同一個 Instagram 帳號</li>
                  <li>• 更新成功後，帳號狀態會重置為「啟用」</li>
                  <li>• 如果 Token 無效，更新會失敗並顯示錯誤訊息</li>
                  <li>• 請確保新 Token 包含必要的權限</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
