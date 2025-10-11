import { useState } from 'react'
import { LifeBuoy, ShieldBan, Send, Unlock, Loader2 } from 'lucide-react'

interface AppealResponse {
  ok: boolean
  ticket?: string
  error?: { message?: string }
}

interface UnlockResponse {
  ok: boolean
  error?: { message?: string }
  message?: string
}

/**
 *
 */
export default function IpBlockedAppeal() {
  const [contact, setContact] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [appealStatus, setAppealStatus] = useState<string | null>(null)
  const [appealLoading, setAppealLoading] = useState(false)

  const [code, setCode] = useState('')
  const [codeStatus, setCodeStatus] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)

  const submitAppeal = async () => {
    if (message.trim().length < 10) {
      setAppealStatus('請至少填寫 10 個字說明問題。')
      return
    }
    setAppealStatus(null)
    setAppealLoading(true)
    try {
      const resp = await fetch('/api/audit_report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, reason, message })
      })
      const result: AppealResponse = await resp.json().catch(() => ({ ok: false }))
      if (!resp.ok || !result.ok) {
        throw new Error(result?.error?.message || '申訴提交失敗')
      }
      setAppealStatus(`申訴已送出！票證編號：${result.ticket || '已建立'}`)
      setMessage('')
      setReason('')
      setContact('')
    } catch (err: any) {
      setAppealStatus(err?.message || '申訴提交失敗，請稍後再試。')
    } finally {
      setAppealLoading(false)
    }
  }

  const submitCode = async () => {
    if (!code.trim()) {
      setCodeStatus('請輸入解鎖碼')
      return
    }
    setCodeStatus(null)
    setCodeLoading(true)
    try {
      const resp = await fetch('/api/audit_report/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const result: UnlockResponse = await resp.json().catch(() => ({ ok: false }))
      if (!resp.ok || !result.ok) {
        throw new Error(result?.error?.message || '解鎖失敗，請確認解鎖碼是否有效。')
      }
      setCodeStatus(result.message || '解鎖成功，請重新整理頁面。')
      setCode('')
    } catch (err: any) {
      setCodeStatus(err?.message || '解鎖失敗，請稍後再試。')
    } finally {
      setCodeLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl grid gap-6">
        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 shadow-lg">
            <ShieldBan className="w-8 h-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold dual-text">此 IP 已受到限制</h1>
          <p className="text-sm md:text-base text-muted max-w-2xl mx-auto">
            系統偵測到異常行為或安全風險，暫時封鎖了您目前的 IP。您可以提交申訴讓管理員協助復查，或輸入管理員提供的「解鎖碼」立即解除封鎖。
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="border border-border rounded-2xl bg-surface/80 backdrop-blur-sm p-6 shadow-soft">
            <div className="flex items-center gap-2 mb-4">
              <LifeBuoy className="w-5 h-5 text-primary" />
              <h2 className="font-semibold dual-text text-lg">提交申訴</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              請附上聯絡方式與詳細說明，讓我們能夠快速釐清狀況。送出後系統會立即解除封鎖，並通知維運團隊進一步檢查。
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">聯絡方式（可選）</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Email / Discord / 其他聯絡方式"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">發生原因（可選）</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="例如：測試、自動化工具、共享網路…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">詳細說明 <span className="text-danger">*</span></label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[120px]"
                  placeholder="請提供至少 10 個字描述被封鎖的情境、您當時的操作或想補充的資訊。"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              {appealStatus && (
                <div className="text-sm text-primary bg-primary/10 border border-primary/20 px-3 py-2 rounded-lg whitespace-pre-wrap">
                  {appealStatus}
                </div>
              )}
              <button
                onClick={submitAppeal}
                disabled={appealLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {appealLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                送出申訴並解除封鎖
              </button>
            </div>
          </section>

          <section className="border border-border rounded-2xl bg-surface/80 backdrop-blur-sm p-6 shadow-soft">
            <div className="flex items-center gap-2 mb-4">
              <Unlock className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold dual-text text-lg">輸入解鎖碼</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              如果您已向管理員取得解鎖碼，輸入後即可立刻恢復使用。解鎖碼可以重複使用，管理員更新代碼後舊碼會立即失效。
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">解鎖碼</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-green-500/40"
                  placeholder="輸入管理員提供的解鎖碼"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {codeStatus && (
                <div className={`text-sm px-3 py-2 rounded-lg border ${codeStatus.includes('成功') || codeStatus.includes('解鎖成功') ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:text-red-300'}`}>
                  {codeStatus}
                </div>
              )}
              <button
                onClick={submitCode}
                disabled={codeLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-600/90 transition-colors disabled:opacity-60"
              >
                {codeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                使用解鎖碼解除封鎖
              </button>
            </div>
          </section>
        </div>

        <footer className="text-xs text-muted text-center max-w-2xl mx-auto">
          <p className="leading-relaxed">
            如果多次輸入解鎖碼仍無法解鎖，請透過上方申訴管道聯繫管理員。我們會儘速檢查並回覆您。
          </p>
        </footer>
      </div>
    </div>
  )
}
