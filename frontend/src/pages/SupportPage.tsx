import { useEffect, useRef, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { Send, AlertTriangle, CheckCircle, ArrowLeft, RefreshCw, Copy } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { listNotifications } from '@/utils/notifications'
import { AccountAPI, api } from '@/services/api'

export default function SupportPage() {
  const { isLoggedIn } = useAuth()
  const [personalId, setPersonalId] = useState<string | null>(null)
  const [mySchool, setMySchool] = useState<{ slug: string; name: string } | null>(null)
  const [scope, setScope] = useState<'cross'|'school'>('cross')
  const [category, setCategory] = useState('account')
  const [subject, setSubject] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'ok'|'err'|null>(null)
  const [msg, setMsg] = useState('')
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([])
  const [modLoading, setModLoading] = useState(false)
  const [supLoading, setSupLoading] = useState(false)
  const [moderation, setModeration] = useState<any[]>([])
  const [supports, setSupports] = useState<any[]>([])
  const [modErr, setModErr] = useState<string| null>(null)
  const [supErr, setSupErr] = useState<string| null>(null)
  const [openSupport, setOpenSupport] = useState<number | null>(null)
  const [modLimit, setModLimit] = useState(20)
  const [supLimit, setSupLimit] = useState(20)
  const modSentinelRef = useRef<HTMLDivElement | null>(null)
  const supSentinelRef = useRef<HTMLDivElement | null>(null)
  const [modHasMore, setModHasMore] = useState(true)
  const [supHasMore, setSupHasMore] = useState(true)

  const loadProgress = async () => {
    // 審核進度：從 API 讀取（若失敗，回退 Notifications）
    setModLoading(true); setModErr(null)
    try {
      const r = await fetch(`/api/moderation/progress?mine=1&limit=${modLimit}`, {
        headers: localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : undefined,
        cache: 'no-store'
      })
      if (r.ok) {
        const j = await r.json().catch(()=>({}))
        const items = Array.isArray(j?.items) ? j.items : []
        setModeration(items)
        // 若少於本次要求的數量，視為沒有更多
        setModHasMore(items.length >= modLimit)
      } else {
        throw new Error(`HTTP ${r.status}`)
      }
    } catch {
      // 回退：用本地通知拼出粗略進度
      const school = (localStorage.getItem('school_slug')||'') || null
      const items = listNotifications({ school: school ?? undefined })
        .filter(n => ['post.pending','post.approved','post.rejected','delete_request.created','delete_request.approved','delete_request.rejected'].includes(n.type))
        .slice(0, modLimit)
      setModeration(items.map(n => ({
        timestamp: new Date(n.ts).toISOString(),
        status: n.type,
        title: n.text,
        handler: null
      })))
      setModErr('使用通知快取顯示進度（僅供參考）')
      setModHasMore(false) // 快取僅做概覽，不再自動載入
    } finally { setModLoading(false) }

    // 支援處理進度：讀取我的回報（若失敗回退空）
    setSupLoading(true); setSupErr(null)
    try {
      const r = await fetch(`/api/support/my?limit=${supLimit}`, {
        headers: localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : undefined,
        cache: 'no-store'
      })
      if (r.ok) {
        const j = await r.json().catch(()=>({}))
        const items = Array.isArray(j?.items) ? j.items : []
        setSupports(items)
        setSupHasMore(items.length >= supLimit)
      } else {
        throw new Error(`HTTP ${r.status}`)
      }
    } catch {
      setSupports([])
      setSupErr('暫無可用的支援進度資料')
      setSupHasMore(false)
    } finally { setSupLoading(false) }
  }

  useEffect(() => { loadProgress() }, [])
  useEffect(() => { loadProgress() }, [modLimit, supLimit])

  // Infinite scroll: 審核進度
  useEffect(() => {
    const el = modSentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (!e || !e.isIntersecting) return
      if (modLoading || !modHasMore) return
      setModLimit((l) => Math.min(l + 20, 500))
    }, { root: null, rootMargin: '200px 0px', threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [modLoading, modHasMore])

  // Infinite scroll: 支援進度
  useEffect(() => {
    const el = supSentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (!e || !e.isIntersecting) return
      if (supLoading || !supHasMore) return
      setSupLimit((l) => Math.min(l + 20, 500))
    }, { root: null, rootMargin: '200px 0px', threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [supLoading, supHasMore])

  const statusBadge = (status?: string) => {
    const s = String(status||'').toLowerCase()
    if (s.includes('approved')) return { label: '通過', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' }
    if (s.includes('rejected')) return { label: '退件', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200' }
    if (s.includes('pending') || s.includes('created')) return { label: '送審', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' }
    return { label: '更新', cls: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300' }
  }

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 已登入者：以個人識別碼作為聯絡方式（站內回覆），隱藏 Email 輸入
  useEffect(() => {
    (async () => {
      if (!isLoggedIn) return
      try {
        const p = await AccountAPI.profile()
        const pid = p?.personal_id || ''
        setPersonalId(pid || null)
        const sch = p?.school ? { slug: p.school.slug, name: p.school.name } : null
        setMySchool(sch)
      } catch {}
    })()
  }, [isLoggedIn])

  const submit = async () => {
    const text = message.trim()
    if (text.length < 5) {
      setResult('err'); setMsg('請至少輸入 5 個字的訊息')
      return
    }
    // 未登入：強制 Gmail 格式
    if (!isLoggedIn) {
      const emailTrim = email.trim()
      const gmailRe = /^[A-Za-z0-9._%+-]+@gmail\.com$/
      if (!gmailRe.test(emailTrim)) {
        setResult('err'); setMsg('請填寫有效的 Gmail 地址（example@gmail.com）')
        return
      }
    }
    setSending(true); setResult(null); setMsg('')
    try {
      // 讀取附件（如有），以 dataURL 形式提交（後端可選擇接受或忽略）
      const attachments: any[] = []
      for (const f of files.map(x=>x.file)) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = ()=>reject(new Error('read_fail'))
          reader.onload = ()=>resolve(String(reader.result||''))
          reader.readAsDataURL(f)
        })
        attachments.push({ name: f.name, type: f.type, size: f.size, data })
      }
      // 以單一 API 同步建立「使用者回報/聯絡」，並附上 client_id；未登入者由 email 聯絡，登入者以個人識別碼回覆
      const payload: any = {
        category,
        subject: subject.trim() || undefined,
        message: text,
        email: isLoggedIn ? undefined : email.trim(),
        contact: isLoggedIn ? (personalId || undefined) : undefined,
        also_contact: true,
        source: 'contact_admin',
        scope,
        school_slug: scope==='school' ? mySchool?.slug : undefined,
        ...(attachments.length ? { attachments } : {})
      }
      const j = await api<{ ok: boolean; msg?: string }>(`/api/support/report`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      if (!j?.ok) throw new Error(j?.msg || '提交失敗')
      
      // 根據後端回應顯示詳細的成功訊息
      const details = (j as any)?.details
      let successMsg = j?.msg || '已送出！我們會盡快回覆'
      if (details) {
        const category = details.category || '一般問題'
        const method = details.contact_method || (isLoggedIn ? '站內通知' : 'Email')
        successMsg = `✅ ${successMsg}\n類別：${category}\n回覆方式：${method}`
      }
      
      setResult('ok'); setMsg(successMsg)
      setSubject(''); setMessage(''); setFiles([])
      if (!isLoggedIn) setEmail('')
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
            {/* 範圍選擇：跨校 / 校內（僅登入者可選校內） */}
            <div>
              <label className="block text-sm text-muted mb-1">問題範圍</label>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="scope" checked={scope==='cross'} onChange={()=>setScope('cross')} />
                  跨校
                </label>
                <label className={`inline-flex items-center gap-2 ${!isLoggedIn || !mySchool ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="radio" name="scope" disabled={!isLoggedIn || !mySchool} checked={scope==='school'} onChange={()=>setScope('school')} />
                  校內（{mySchool?.name || '需登入'}）
                </label>
              </div>
              <div className="text-xs text-muted mt-1">跨校由跨校管理員處理；校內由該校管理員處理。</div>
            </div>

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
              {!isLoggedIn ? (
                <div>
                  <label className="block text-sm text-muted mb-1">Email（未登入者必填 Gmail）</label>
                  <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@gmail.com" className="form-control w-full" />
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-muted mb-1">聯絡方式</label>
                  <input value={personalId || ''} disabled className="form-control w-full" />
                  <div className="text-xs text-muted mt-1">將以站內通知回覆（綁定您的個人識別碼）</div>
                </div>
              )}
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
            {/* 附件上傳（選填） */}
            <div>
              <label className="block text-sm text-muted mb-1">附加截圖（選填，最多 3 張）</label>
              <input type="file" accept="image/*" multiple onChange={e=>{
                const list = Array.from(e.target.files||[]).slice(0,3)
                Promise.all(list.map(f=>new Promise<{file:File;preview:string}>(res=>{ const r=new FileReader(); r.onload=()=>res({file:f,preview:String(r.result||'')}); r.readAsDataURL(f) }))).then(arr=>setFiles(arr))
              }} />
              {files.length>0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {files.map((f,i)=>(
                    <img key={i} src={f.preview} alt="附件預覽" className="w-20 h-20 object-cover rounded border border-border" />
                  ))}
                </div>
              )}
              <div className="text-xs text-muted mt-1">為保護隱私，請勿上傳個資。</div>
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

        {/* 進度區塊：審核 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mt-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-semibold dual-text">審核進度</h2>
            <button className="ml-auto btn-ghost text-sm flex items-center gap-2" onClick={loadProgress}>
              <RefreshCw className={`w-4 h-4 ${modLoading? 'animate-spin':''}`} /> 刷新
            </button>
          </div>
          {modErr && <div className="text-xs text-muted mb-2">{modErr}</div>}
          {modLoading ? (
            <div className="text-sm text-muted py-6 text-center">載入中…</div>
          ) : moderation.length === 0 ? (
            <div className="text-sm text-muted py-6 text-center">暫無審核進度</div>
          ) : (
            <div className="space-y-2">
              {moderation.map((m:any, i:number) => (
                <div key={i} className="p-3 rounded-xl border border-border bg-surface/50">
                  <div className="text-xs text-muted flex items-center gap-2">
                    <span>{new Date(m.timestamp || m.ts || Date.now()).toLocaleString()}</span>
                    {m.handler && <span className="px-2 py-0.5 rounded bg-surface-hover border border-border">經手人：{m.handler}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1 gap-3">
                    <div className="text-sm text-fg min-w-0 break-words flex-1">{m.title || m.text}</div>
                    <div className="shrink-0 flex items-center gap-2">
                      {(() => { const b = statusBadge(m.status); return (
                        <span className={`px-2 py-0.5 text-xs rounded-lg ${b.cls}`}>{b.label}</span>
                      ) })()}
                      {(() => {
                        const pidRaw:any = m.post_id ?? (m.post?.id)
                        let pid = Number(pidRaw)
                        if (!Number.isFinite(pid)) {
                          const txt = String(m.title || m.text || '')
                          const mm = txt.match(/#(\d+)/)
                          if (mm) pid = Number(mm[1])
                        }
                        return Number.isFinite(pid) && pid > 0 ? (
                          <a href={`/posts/${pid}`} target="_blank" rel="noreferrer" className="btn-ghost text-xs px-2 py-1">查看貼文</a>
                        ) : null
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              {/* 審核進度：滾動載入指示器 */}
              <div ref={modSentinelRef} className="h-8 grid place-items-center text-xs text-muted">{modLoading ? '載入中…' : (modHasMore ? ' ' : '已到底') }</div>
            </div>
          )}
        </div>

        {/* 進度區塊：支援處理 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mt-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-semibold dual-text">支援處理進度</h2>
            <button className="ml-auto btn-ghost text-sm flex items-center gap-2" onClick={loadProgress}>
              <RefreshCw className={`w-4 h-4 ${supLoading? 'animate-spin':''}`} /> 刷新
            </button>
          </div>
          {supErr && <div className="text-xs text-muted mb-2">{supErr}</div>}
          {supLoading ? (
            <div className="text-sm text-muted py-6 text-center">載入中…</div>
          ) : supports.length === 0 ? (
            <div className="text-sm text-muted py-6 text-center">暫無支援處理進度</div>
          ) : (
            <div className="space-y-2">
              {supports.map((s:any, i:number) => (
                <div key={i} className="p-3 rounded-xl border border-border bg-surface/50">
                  <div className="text-xs text-muted flex items-center gap-2">
                    <span>{new Date(s.updated_at || s.timestamp || Date.now()).toLocaleString()}</span>
                    {s.status && <span className="px-2 py-0.5 rounded bg-surface-hover border border-border">狀態：{s.status}</span>}
                  </div>
                  <div className="text-sm text-fg mt-1 min-w-0 break-words flex items-center justify-between gap-3">
                    <span>{s.title || s.subject || s.message?.slice?.(0,60) || '支援票單更新'}</span>
                    {(() => {
                      const tid:any = s.ticket_id ?? s.id
                      return (tid!==undefined && tid!==null) ? (
                        <span className="inline-flex items-center gap-2 text-xs text-muted">
                          票單 #{tid}
                          <button className="px-2 py-1 rounded border hover:bg-surface" onClick={async()=>{ try{ await navigator.clipboard.writeText(String(tid)); }catch{} }} title="複製票單編號">
                            <Copy className="w-3 h-3" />
                          </button>
                        </span>
                      ) : null
                    })()}
                  </div>
                  {s.handler && <div className="text-xs text-muted mt-1">經手人：{s.handler}</div>}
                  {Array.isArray(s.replies) && s.replies.length > 0 && (
                    <div className="mt-2">
                      <button className="btn-ghost text-xs px-2 py-1" onClick={()=> setOpenSupport(openSupport===i? null : i)}>
                        {openSupport===i ? '收起回覆' : `檢視回覆（${s.replies.length}）`}
                      </button>
                      {openSupport===i && (
                        <div className="mt-2 space-y-2">
                          {s.replies.map((r:any, idx:number)=>(
                            <div key={idx} className="p-2 rounded-lg border border-border bg-surface/50">
                              <div className="text-[11px] text-muted">{new Date(r.timestamp || r.ts || Date.now()).toLocaleString()} · {r.by || '管理員'}</div>
                              <div className="text-sm text-fg whitespace-pre-wrap break-words">{r.message || r.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {/* 支援進度：滾動載入指示器 */}
              <div ref={supSentinelRef} className="h-8 grid place-items-center text-xs text-muted">{supLoading ? '載入中…' : (supHasMore ? ' ' : '已到底') }</div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
