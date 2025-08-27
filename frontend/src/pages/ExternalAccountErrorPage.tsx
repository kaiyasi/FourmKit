import { AlertTriangle, ExternalLink, Home, RefreshCw } from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

export default function ExternalAccountErrorPage() {
  const handleRetry = () => {
    // 重新嘗試登入
    window.location.href = '/api/auth/google/login'
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/error" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="max-w-lg mx-auto">
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-soft text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-700 dark:text-amber-300" />
            </div>
            
            <div className="text-sm text-muted mb-2">校外帳號登入錯誤</div>
            <h1 className="text-2xl font-bold dual-text mb-3">無法使用校外帳號</h1>
            
            <div className="text-sm text-muted mb-6 space-y-2">
              <p>您選擇的校外帳號目前無法使用，可能的原因：</p>
              <ul className="text-left space-y-1">
                <li>• 該學校的認證服務暫時不可用</li>
                <li>• 網路連線問題</li>
                <li>• 該學校尚未加入跨校聯盟</li>
              </ul>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleRetry}
                className="btn-primary flex items-center justify-center gap-2 px-4 py-2"
              >
                <RefreshCw className="w-4 h-4" />
                重新嘗試
              </button>
              
              <button
                onClick={handleGoHome}
                className="btn-secondary flex items-center justify-center gap-2 px-4 py-2"
              >
                <Home className="w-4 h-4" />
                回到首頁
              </button>
            </div>
            
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs text-muted">
                如需協助，請聯繫您的學校管理員或系統管理員
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
