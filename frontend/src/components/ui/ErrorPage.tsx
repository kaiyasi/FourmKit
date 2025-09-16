import { AlertTriangle, Ban, LockKeyhole, SearchX, ShieldAlert, Timer, WifiOff, ServerCrash, Home, LifeBuoy, RefreshCw, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

type Props = {
  status?: number
  title?: string
  message?: string
  hint?: string
  actionHref?: string
  actionText?: string
  showSupport?: boolean
  showRetry?: boolean
  onRetry?: () => void
}

export default function ErrorPage({ 
  status, 
  title, 
  message, 
  hint, 
  actionHref = '/', 
  actionText = '回到首頁',
  showSupport = true,
  showRetry = false,
  onRetry
}: Props) {
  const variant = pickVariant(status)
  const Icon = variant.icon
  
  // 構建支援頁面 URL，預填錯誤資訊
  const prefillData = status === 451
    ? {
        category: 'account_issue',
        priority: 'high',
        title: 'IP 受限制申訴',
        message: `我的 IP 位址被系統限制，導致無法存取服務.\n\n錯誤訊息: ${message}\n\n請協助審核並解除限制`,
      }
    : {
        category: 'system_error',
        title: `系統錯誤 ${status || '未知'}`, 
        message: `錯誤訊息: ${message || '發生未知錯誤'}\n錯誤代碼: ${status}\n相關提示: ${hint || '無'}`, 
      };
  const supportUrl = `/support/create?prefill=${encodeURIComponent(JSON.stringify(prefillData))}`;
  
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-surface via-surface to-surface/50">
      <div className="max-w-lg w-full rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-8 shadow-soft text-center">
        {/* 錯誤圖標 */}
        <div className={`mx-auto w-16 h-16 rounded-2xl ${variant.badgeBg} flex items-center justify-center mb-4 shadow-lg`}>
          <Icon className={`w-8 h-8 ${variant.badgeFg}`} />
        </div>
        
        {/* 錯誤代碼 */}
        {status && (
          <div className="text-sm text-muted mb-2 font-mono bg-muted/30 px-3 py-1 rounded-lg inline-block">
            錯誤代碼 {status}
          </div>
        )}
        
        {/* 標題 */}
        <h1 className="text-2xl font-bold dual-text mb-3">{title || variant.title}</h1>
        
        {/* 錯誤訊息 */}
        {message && (
          <div className="text-sm text-muted mb-4 p-3 bg-muted/20 rounded-lg border border-border/50">
            <p className="whitespace-pre-wrap break-words">{message}</p>
          </div>
        )}
        
        {/* 提示資訊 */}
        {hint && (
          <div className="text-xs text-muted mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="whitespace-pre-wrap break-words">{hint}</p>
          </div>
        )}
        
        {/* 操作按鈕 */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {/* 主要操作 */}
          <Link 
            to={actionHref} 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border hover:bg-surface/80 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {actionText}
          </Link>
          
          {/* 重試按鈕 */}
          {showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border hover:bg-surface/80 text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> 重試
            </button>
          )}
          
          {/* 支援按鈕 */}
          {showSupport && (
            <Link 
              to={supportUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 text-sm font-medium transition-colors shadow-sm"
            >
              <LifeBuoy className="w-4 h-4" /> 聯繫管理員
            </Link>
          )}
        </div>
        
        {/* 額外提示 */}
        {showSupport && (
          <p className="text-xs text-muted mt-4">
            如果問題持續發生，請<Link to={supportUrl} className="text-primary hover:text-primary/80 underline">聯繫系統管理員</Link>獲取協助
          </p>
        )}
      </div>
    </div>
  )
}

function pickVariant(status?: number) {
  if (!status) return base('發生錯誤', AlertTriangle)
  if (status === 400) return base('請求有誤', AlertTriangle)
  if (status === 401) return base('需要登入', LockKeyhole)
  if (status === 403) return base('沒有權限', ShieldAlert)
  if (status === 404) return base('找不到頁面', SearchX)
  if (status === 408) return base('請求逾時', Timer)
  if (status === 429) return base('請求過於頻繁', Ban)
  if (status === 451) return {
    title: '此 IP 已受限制',
    icon: Ban,
    badgeBg: 'bg-red-100 dark:bg-red-900/30',
    badgeFg: 'text-red-700 dark:text-red-300',
  }
  if (status === 500) return base('伺服器錯誤', ServerCrash)
  if (status === 502 || status === 503 || status === 504) return base('服務暫時不可用', WifiOff)
  return base('發生錯誤', AlertTriangle)
}

function base(title: string, icon: any) {
  return {
    title,
    icon,
    badgeBg: 'bg-amber-100 dark:bg-amber-900/30',
    badgeFg: 'text-amber-700 dark:text-amber-300',
  }
}
