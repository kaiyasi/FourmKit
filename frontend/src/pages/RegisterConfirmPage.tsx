import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useAuth } from '@/contexts/AuthContext'

export default function RegisterConfirmPage() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { login } = useAuth()

  const email = sp.get('email') || ''
  const usernameInit = sp.get('username') || ''
  const suggested = sp.get('suggested_school') || ''
  const domain = sp.get('domain') || ''
  const authProvider = sp.get('auth_provider') || 'google'

  const [username, setUsername] = useState(usernameInit)
  const [schools, setSchools] = useState<{ id:number; slug:string; name:string }[]>([])
  const [selSlug, setSelSlug] = useState<string>(suggested || '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  useEffect(() => {
    fetch('/api/schools')
      .then(r => r.json())
      .then(j => setSchools(Array.isArray(j?.items) ? j.items : []))
      .catch(()=>setSchools([]))
  }, [])

  const schoolName = useMemo(() => {
    if (!selSlug) return '（跨校／未指定）'
    const s = schools.find(x=>x.slug===selSlug)
    return s?.name || selSlug
  }, [selSlug, schools])

  const pwdChecks = useMemo(() => {
    const p = password
    const longEnough = p.length >= 8
    const notAllDigits = !/^[0-9]+$/.test(p)
    const notSeq = (() => {
      if (/^[a-zA-Z]+$/.test(p) || /^[0-9]+$/.test(p)) {
        if (p.length >= 6) {
          const s = p.toLowerCase()
          const asc = [...s].every((c,i,arr)=> i===0 || (arr[i].charCodeAt(0)-arr[i-1].charCodeAt(0)===1))
          const desc = [...s].every((c,i,arr)=> i===0 || (arr[i].charCodeAt(0)-arr[i-1].charCodeAt(0)===-1))
          return !(asc || desc)
        }
      }
      return true
    })()
    const matched = password && password2 && password===password2
    const ok = longEnough && notAllDigits && notSeq && matched
    return { longEnough, notAllDigits, notSeq, matched, ok }
  }, [password, password2])

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/auth/register-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          username: username.trim(),
          school_slug: selSlug || '',
          auth_provider: authProvider || 'google',
          password,
          password2,
        })
      })
      if (!r.ok) {
        const j = await r.json().catch(()=>({ msg: '註冊失敗' }))
        throw new Error(j?.msg || j?.error?.message || '註冊失敗')
      }
      const j = await r.json()
      // 儲存 JWT 與角色學校資訊
      try {
        const at = j?.access_token
        const rt = j?.refresh_token
        const role = j?.role || 'user'
        const sid = j?.school_id ?? null
        if (at && rt) {
          login(at, role, sid, rt, username.trim())
          setTimeout(() => { window.location.href = '/' }, 10)
          return
        }
      } catch {}
      // fallback：返回登入頁
      nav('/auth')
    } catch (e: any) {
      setErr(e?.message || '註冊失敗')
    } finally {
      setBusy(false)
    }
  }

  const reportWrong = () => {
    const content = `使用者回報學校資料錯誤\nemail: ${email}\n選單學校: ${schoolName} (${selSlug||'未指定'})\n網域: ${domain}`
    fetch('/api/admin/notify-new-domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, email, message: content })
    }).catch(()=>{})
    alert('已回報管理員，將儘速處理。')
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/auth/register-confirm" />
      <MobileBottomNav />

      <main className="mx-auto max-w-xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
          <h1 className="text-xl font-semibold dual-text mb-1">完成註冊</h1>
          <p className="text-sm text-muted mb-4">已驗證您的學校信箱，請確認以下資訊。</p>

          {err && (
            <div className="mb-4 p-3 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100 border border-rose-300 dark:border-rose-700">
              {err}
            </div>
          )}

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm text-muted">Email</label>
              <input className="form-control" value={email} readOnly />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm text-muted">使用者名稱</label>
              <input className="form-control" value={username} onChange={e=>setUsername(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm text-muted">學校</label>
              <select className="form-control" value={selSlug} onChange={e=>setSelSlug(e.target.value)}>
                <option value="">以上沒有（暫以跨校綁定）</option>
                {schools.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
              </select>
              <p className="text-xs text-muted">若清單中沒有您的學校，仍可完成註冊，系統會通知管理員新增學校。</p>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm text-muted">學校 slug（唯讀）</label>
              <div className="flex gap-2">
                <input className="form-control" value={selSlug || '(未指定)'} readOnly />
                <button type="button" className="btn-secondary whitespace-nowrap" onClick={reportWrong}>回報錯誤</button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm text-muted">密碼</label>
              <input type="password" className="form-control" value={password} onChange={e=>setPassword(e.target.value)} placeholder="請設定登入密碼" />
              <input type="password" className="form-control" value={password2} onChange={e=>setPassword2(e.target.value)} placeholder="再輸入一次密碼" />
              <ul className="text-xs mt-1">
                <li className={pwdChecks.longEnough ? 'text-green-600 dark:text-green-400' : 'text-muted'}>至少 8 碼</li>
                <li className={pwdChecks.notAllDigits ? 'text-green-600 dark:text-green-400' : 'text-muted'}>不可全為數字</li>
                <li className={pwdChecks.notSeq ? 'text-green-600 dark:text-green-400' : 'text-muted'}>不可為連續字元（如 123456、abcdef）</li>
                <li className={pwdChecks.matched ? 'text-green-600 dark:text-green-400' : 'text-muted'}>兩次密碼一致</li>
              </ul>
            </div>
            <div className="pt-2 flex gap-2 justify-end">
              <button className="btn-ghost" onClick={()=>nav('/auth')}>返回登入</button>
              <button className="btn-primary" disabled={busy || !username.trim() || !pwdChecks.ok} onClick={submit}>{busy ? '提交中…' : '確認並註冊'}</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
