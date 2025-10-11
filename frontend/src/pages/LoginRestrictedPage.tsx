import { AlertTriangle, Lock, Home, RefreshCw } from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useSearchParams } from 'react-router-dom'

/**
 *
 */
export default function LoginRestrictedPage() {
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')

  const handleRetry = () => {
    window.location.href = '/api/auth/google/login'
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  const getModeInfo = () => {
    switch (mode) {
      case 'single':
        return {
          title: '單一模式限制',
          description: '目前系統處於單一模式，僅允許指定帳號登入',
          details: [
            '• 僅允許系統指定的單一管理員帳號',
            '• 其他用戶暫時無法登入',
            '• 請聯繫系統管理員確認登入權限'
          ]
        }
      case 'admin_only':
        return {
          title: '管理組模式限制',
          description: '目前系統處於管理組模式，僅允許管理員登入',
          details: [
            '• 僅允許管理員帳號登入',
            '• 一般用戶暫時無法登入',
            '• 請聯繫系統管理員確認登入權限'
          ]
        }
      default:
        return {
          title: '登入限制',
          description: '目前系統限制登入功能',
          details: [
            '• 系統暫時限制登入功能',
            '• 請稍後再試或聯繫管理員',
            '• 如有緊急需求請聯繫系統管理員'
          ]
        }
    }
  }

  const modeInfo = getModeInfo()

  return (
    <div className="min-h-screen">
      <NavBar pathname="/error" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="max-w-lg mx-auto">
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-soft text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-red-700 dark:text-red-300" />
            </div>
            
            <div className="text-sm text-muted mb-2">登入限制</div>
            <h1 className="text-2xl font-bold dual-text mb-3">{modeInfo.title}</h1>
            
            <div className="text-sm text-muted mb-6 space-y-2">
              <p>{modeInfo.description}</p>
              <ul className="text-left space-y-1">
                {modeInfo.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
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
                如需協助，請聯繫系統管理員
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
