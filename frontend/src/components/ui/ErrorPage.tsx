import { AlertTriangle, Ban, LockKeyhole, SearchX, ShieldAlert, Timer, WifiOff, ServerCrash, Home } from 'lucide-react'

type Props = {
  status?: number
  title?: string
  message?: string
  hint?: string
  actionHref?: string
  actionText?: string
}

export default function ErrorPage({ status, title, message, hint, actionHref = '/', actionText = '回到首頁' }: Props) {
  const variant = pickVariant(status)
  const Icon = variant.icon
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-border bg-surface p-6 shadow-soft text-center">
        <div className={`mx-auto w-14 h-14 rounded-2xl ${variant.badgeBg} flex items-center justify-center mb-3`}>
          <Icon className={`w-7 h-7 ${variant.badgeFg}`} />
        </div>
        <div className="text-sm text-muted mb-1">{status ? `錯誤代碼 ${status}` : '錯誤'}</div>
        <h1 className="text-2xl font-bold dual-text mb-1">{title || variant.title}</h1>
        {message && <p className="text-sm text-muted mb-2 whitespace-pre-wrap break-words">{message}</p>}
        {hint && <p className="text-xs text-muted mb-4 whitespace-pre-wrap break-words">{hint}</p>}
        <a href={actionHref} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-surface/80 text-sm">
          <Home className="w-4 h-4" /> {actionText}
        </a>
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

