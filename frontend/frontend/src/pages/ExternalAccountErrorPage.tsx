import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ShieldAlert, Mail, School, AlertTriangle, Check, Home, RefreshCw } from 'lucide-react'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

export default function ExternalAccountErrorPage() {
  const [searchParams] = useSearchParams()
  const [notificationSent, setNotificationSent] = useState(false)
  const [sending, setSending] = useState(false)
  
  const domain = searchParams.get('domain') || ''
  const email = searchParams.get('email') || ''
  const fullEmail = email && domain ? `${email}@${domain}` : ''

  const notifyAdmin = async () => {
    if (!domain || sending) return
    
    setSending(true)
    try {
      const response = await fetch('/api/admin/notify-new-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          email: fullEmail,
          message: `用戶嘗試使用域名 ${domain} 登入，但該域名尚未在系統中註冊。`
        })
      })
      
      if (response.ok) {
        setNotificationSent(true)
      }
    } catch (error) {
      console.warn('通知管理員失敗:', error)
    } finally {
      setSending(false)
    }
  }

  const unlinkSchool = () => {
    // 清除所有學校相關的 localStorage
    try {
      localStorage.removeItem('school_slug')
      localStorage.removeItem('current_school_slug')
      localStorage.removeItem('selected_school_slug')
      window.dispatchEvent(new CustomEvent('fk_school_changed', { detail: { slug: null } }))
      
      // 重定向到跨校模式
      window.location.href = '/boards'
    } catch (error) {
      console.warn('解綁學校失敗:', error)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 pb-24 bg-bg">
      <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 shadow-soft text-center">
        {/* 錯誤圖標 */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        {/* 主標題 */}
        <h1 className="text-xl font-bold text-fg mb-2">無法使用校外帳號</h1>
        
        {/* 顯示嘗試登入的信箱 */}
        {fullEmail && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted mb-4 p-2 bg-surface-hover rounded-lg">
            <Mail className="w-4 h-4" />
            <span>{fullEmail}</span>
          </div>
        )}

        {/* 錯誤原因列表 */}
        <div className="text-left mb-6">
          <p className="text-sm text-muted mb-3">您選擇的校外帳號目前無法使用，可能的原因：</p>
          <ul className="text-sm text-muted space-y-2">
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>學校的認證服務暫時無法使用</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>網路連線問題</span>
            </li>
            <li className="flex items-start gap-2">
              <School className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>學校尚未加入跨校聯盟</span>
            </li>
          </ul>
        </div>

        {/* 操作按鈕 */}
        <div className="space-y-3">
          {/* 通知管理員 */}
          {!notificationSent ? (
            <button
              onClick={notifyAdmin}
              disabled={sending || !domain}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>通知中...</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>通知管理員添加學校</span>
                </>
              )}
            </button>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl font-medium">
              <Check className="w-4 h-4" />
              <span>已通知管理員</span>
            </div>
          )}

          {/* 解綁學校，使用跨校模式 */}
          <button
            onClick={unlinkSchool}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-hover text-fg rounded-xl font-medium hover:bg-surface border border-border transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>解綁學校，切換至跨校模式</span>
          </button>

          {/* 回到首頁 */}
          <Link
            to="/"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-hover text-muted rounded-xl font-medium hover:bg-surface border border-border transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>回到首頁</span>
          </Link>
        </div>

        {/* 提示文字 */}
        <p className="text-xs text-muted mt-4">
          如果您的學校應該在系統中，請聯絡管理員或稍後再試。
        </p>
      </div>
      <MobileBottomNav />
    </div>
  )
}
