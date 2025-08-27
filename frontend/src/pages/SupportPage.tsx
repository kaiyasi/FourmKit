import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { Send, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function SupportPage() {
  const { isLoggedIn } = useAuth()
  const [category, setCategory] = useState('account')
  const [subject, setSubject] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'ok'|'err'|null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const submit = async () => {
    if (!message.trim()) {
      setResult('err'); setMsg('請輸入訊息')
      return
    }
    setSending(true); setResult(null); setMsg('')
    try {
      const r = await fetch('/api/support/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('token') ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {}) },
        body: JSON.stringify({ category, subject, email, message })
      })
      const j = await r.json().catch(()=>({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.msg || '提交失敗')
      setResult('ok'); setMsg('已送出，我們會盡快回覆，請留意 Email 或站內通知。')
      setSubject(''); setMessage('')
    } catch (e:any) {
      setResult('err'); setMsg(e?.message || '提交失敗，請稍後再試')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/support" />
      <MobileBottomNav />
      <main className="mx-auto max-w-3xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => window.history.back()} className="flex items-center gap-2 text-muted hover:text-fg transition-colors">
              <ArrowLeft className="w-4 h-4" /> 返回
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">聯絡管理員 / 狀況回報</h1>
          <p className="text-sm text-muted mt-1">如果遇到帳號註冊問題或其它狀況，請在此留言給管理員。</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted mb-1">分類</label>
                <select value={category} onChange={e=>setCategory(e.target.value)} className="form-control w-full">
                  <option value="suggestion">功能建議</option>
                  <option value="report">問題回報</option>
                  <option value="abuse">濫用/檢舉</option>
                  <option value="account">帳號/登入問題</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">Email（可選）</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="方便聯絡您" className="form-control w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">主旨（可選）</label>
              <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="簡述您的問題"
                     className="form-control w-full" />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">內容</label>
              <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={8} placeholder="請描述您的情況，例如錯誤訊息、發生步驟、影響帳號等。"
                        className="form-control w-full" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={submit} disabled={sending} className="btn-primary flex items-center gap-2 px-4 py-2">
                <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                送出
              </button>
              {result === 'ok' && (
                <div className="text-green-600 flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4" /> {msg}</div>
              )}
              {result === 'err' && (
                <div className="text-rose-600 flex items-center gap-2 text-sm"><AlertTriangle className="w-4 h-4" /> {msg}</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
