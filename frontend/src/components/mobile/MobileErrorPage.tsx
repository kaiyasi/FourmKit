import { AlertTriangle, Ban, LockKeyhole, SearchX, ShieldAlert, Timer, WifiOff, ServerCrash, Home, RefreshCw } from 'lucide-react'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

type Props = {
  status?: number
  title?: string
  message?: string
  hint?: string
  actionHref?: string
  actionText?: string
  showRefresh?: boolean
  onRefresh?: () => void
}

export function MobileErrorPage({ 
  status, 
  title, 
  message, 
  hint, 
  actionHref = '/', 
  actionText = '回到首頁',
  showRefresh = false,
  onRefresh
}: Props) {
  const variant = pickVariant(status)
  const Icon = variant.icon

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else {
      window.location.reload()
    }
  }

  return (
    <>
      <div className="min-h-screen min-h-dvh flex flex-col bg-bg">
        {/* 錯誤內容 */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm text-center">
            {/* 錯誤圖標 */}
            <div className={`mx-auto w-20 h-20 rounded-3xl ${variant.badgeBg} flex items-center justify-center mb-6`}>
              <Icon className={`w-10 h-10 ${variant.badgeFg}`} />
            </div>
            
            {/* 錯誤代碼 */}
            <div className="text-xs text-muted mb-2 font-medium tracking-wide uppercase">
              {status ? `錯誤 ${status}` : '錯誤'}
            </div>
            
            {/* 標題 */}
            <h1 className="text-xl font-bold dual-text mb-3">
              {title || variant.title}
            </h1>
            
            {/* 訊息 */}
            {message && (
              <p className="text-sm text-muted mb-4 leading-relaxed whitespace-pre-wrap break-words">
                {message}
              </p>
            )}
            
            {/* 提示 */}
            {hint && (
              <p className="text-xs text-muted mb-6 leading-relaxed whitespace-pre-wrap break-words opacity-75">
                {hint}
              </p>
            )}
            
            {/* 操作按鈕 */}
            <div className="space-y-3">
              {showRefresh && (
                <button
                  onClick={handleRefresh}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-2xl font-medium transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  重新載入
                </button>
              )}
              
              <a
                href={actionHref}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-border bg-surface hover:bg-surface-hover rounded-2xl font-medium transition-colors dual-text"
              >
                <Home className="w-4 h-4" />
                {actionText}
              </a>
            </div>
            
            {/* 額外提示 */}
            {status && status >= 500 && (
              <div className="mt-6 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  如果問題持續發生，請聯繫客服支援
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 底部導航 */}
      <MobileBottomNav />
    </>
  )
}

function pickVariant(status?: number) {
  if (!status) return base('發生錯誤', AlertTriangle, 'amber')
  
  // 4XX Client Errors
  if (status === 400) return base('請求格式錯誤', AlertTriangle, 'amber')
  if (status === 401) return base('需要登入', LockKeyhole, 'blue')
  if (status === 403) return base('沒有權限', ShieldAlert, 'red')
  if (status === 404) return base('找不到頁面', SearchX, 'purple')
  if (status === 405) return base('不支援的請求', Ban, 'amber')
  if (status === 408) return base('請求逾時', Timer, 'orange')
  if (status === 429) return base('請求過於頻繁', Ban, 'red')
  
  // 5XX Server Errors
  if (status === 500) return base('內部伺服器錯誤', ServerCrash, 'red')
  if (status === 501) return base('功能尚未實作', AlertTriangle, 'amber')
  if (status === 502) return base('閘道錯誤', WifiOff, 'red')
  if (status === 503) return base('服務暫時不可用', WifiOff, 'orange')
  if (status === 504) return base('閘道逾時', Timer, 'red')
  if (status === 507) return base('儲存空間不足', ServerCrash, 'red')
  
  // Generic ranges
  if (status >= 400 && status < 500) return base('請求錯誤', AlertTriangle, 'amber')
  if (status >= 500) return base('伺服器錯誤', ServerCrash, 'red')
  
  return base('發生錯誤', AlertTriangle, 'amber')
}

function base(title: string, icon: any, color: 'amber' | 'blue' | 'red' | 'purple' | 'orange') {
  const colorMap = {
    amber: {
      badgeBg: 'bg-amber-100 dark:bg-amber-900/30',
      badgeFg: 'text-amber-700 dark:text-amber-300',
    },
    blue: {
      badgeBg: 'bg-blue-100 dark:bg-blue-900/30',
      badgeFg: 'text-blue-700 dark:text-blue-300',
    },
    red: {
      badgeBg: 'bg-red-100 dark:bg-red-900/30',
      badgeFg: 'text-red-700 dark:text-red-300',
    },
    purple: {
      badgeBg: 'bg-purple-100 dark:bg-purple-900/30',
      badgeFg: 'text-purple-700 dark:text-purple-300',
    },
    orange: {
      badgeBg: 'bg-orange-100 dark:bg-orange-900/30',
      badgeFg: 'text-orange-700 dark:text-orange-300',
    },
  }

  return {
    title,
    icon,
    ...colorMap[color],
  }
}