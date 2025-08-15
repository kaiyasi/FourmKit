import { useEffect, useState } from 'react'
import { getSocket, on as wsOn, off as wsOff } from './socket'
import { NavBar } from './components/NavBar'
import { MobileFabNav } from './components/MobileFabNav'
import { ThemeToggle } from './components/ThemeToggle'
import SocketBadge from './components/SocketBadge'

type PlatformMode = {
  mode: 'normal' | 'maintenance' | 'development'
  maintenance_message?: string
  maintenance_until?: string
}

type Role = 'guest' | 'user' | 'moderator' | 'admin'

interface ProgressItem { name: string; status: 'completed'|'in_progress'|'planned'; description: string }
interface ProgressData { progress_items: ProgressItem[]; recent_updates: string[]; last_updated: string; error?: string }

export default function App() {
function useRealtimeToasts() {
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])

  useEffect(() => {
    let idSeq = 1
    const push = (text: string) => {
      const id = idSeq++
      setToasts((cur) => [...cur, { id, text }])
      setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 5000)
    }

    const onPost = (p: any) => push(`新貼文：${p?.title ?? '(無標題)'}`)
    const onCmt = (c: any) => push(`新留言：${(c?.content ?? '').slice(0, 20)}…`)
    const onAnn = (a: any) => push(`公告：${(a?.message ?? '').slice(0, 30)}…`)

    wsOn('post.created', onPost)
    wsOn('comment.created', onCmt)
    wsOn('announce', onAnn)

    // 確保至少初始化 socket
    getSocket()

    return () => {
      wsOff('post.created', onPost)
      wsOff('comment.created', onCmt)
      wsOff('announce', onAnn)
    }
  }, [])

  return toasts
}

function RealtimeToastPanel() {
  const toasts = useRealtimeToasts()
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className="rounded-xl border border-border bg-surface/90 px-3 py-2 shadow-soft">
          <span className="text-sm text-fg">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
  const [role, setRole] = useState<Role>('guest')
  const [pathname, setPathname] = useState(window.location.pathname)
  const [platform, setPlatform] = useState<PlatformMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(true)

  // 初始化主題（預設米白/beige，交給全站主題系統自動判斷深淺）
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  useEffect(() => {
    fetch('/api/mode')
      .then(r => {
        console.log('[Debug] /api/mode response status:', r.status)
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then(data => {
        console.log('[Debug] /api/mode data:', data)
        setPlatform(data)
      })
      .catch(e => {
        console.error('[Debug] /api/mode error:', e)
        setError(String(e))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(()=> { console.log('[ForumKit] build tag', (import.meta as any).env?.VITE_BUILD_TAG) },[])

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 只在開發模式的首頁載入開發進度
  useEffect(() => {
    if (platform?.mode === 'development' && pathname === '/') {
      (async () => {
        try {
          setProgressLoading(true)
          const r = await fetch('/api/progress')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const data = await r.json()
          if (data && typeof data === 'object' && Array.isArray(data.progress_items) && Array.isArray(data.recent_updates)) {
            setProgressData(data)
          } else {
            setProgressData({ progress_items: [], recent_updates: [], last_updated: new Date().toISOString(), error: '資料格式不正確' })
          }
        } catch (e:any) {
          setProgressData({ progress_items: [], recent_updates: [], last_updated: new Date().toISOString(), error: e?.message || String(e) })
        } finally {
          setProgressLoading(false)
        }
      })()
    }
  }, [platform?.mode, pathname])

  // ---- Loading / Error ----
  if (loading) {
    return <div className="min-h-screen grid place-items-center"><div className="text-muted">載入中...</div></div>
  }
  if (error || !platform) {
    return <div className="min-h-screen grid place-items-center"><div className="text-rose-600">{error ? `載入失敗：${error}` : '無法取得平台模式'}</div></div>
  }

  // ---- /mode 模式管理頁 ----
  if (pathname === '/mode') {
    return <AdminModePanel platform={platform} onUpdated={setPlatform} full />
  }

  // ---- 維護模式頁（固定模式，不顯示導航欄避免錯誤）----
  if (platform.mode === 'maintenance') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        {/* 右上角主題切換器 */}
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
            <ThemeToggle />
            <span className="text-xs text-muted">主題</span>
          </div>
        </div>
        <div className="max-w-2xl w-full rounded-2xl p-8 shadow-lg bg-white/70 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 backdrop-blur">
          <h1 className="text-3xl font-bold mb-2">系統維護中</h1>
          <p className="text-sm text-muted mb-4">我們正在升級服務以提供更佳體驗，造成不便敬請見諒。</p>
          <p className="mb-4 whitespace-pre-wrap">{platform.maintenance_message || '維護作業進行中。'}</p>
          {platform.maintenance_until && <p className="text-sm text-muted mb-6">預計完成：{platform.maintenance_until}</p>}
          <ReportForm />
        </div>
      </div>
    )
  }

  // ---- 開發模式的首頁（固定模式，不顯示導航欄避免錯誤）----
  if (platform.mode === 'development' && pathname === '/') {
    return (
      <div className="min-h-screen">
        {/* 右上角主題切換器 */}
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
            <ThemeToggle />
            <span className="text-xs text-muted">主題</span>
          </div>
        </div>
        <div className="flex flex-col items-center pt-16 md:pt-20 px-4 pb-8">
          <div className="max-w-4xl w-full space-y-6 md:space-y-8">
            <div className="flex justify-center"><SocketBadge /></div>

          <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 shadow-soft">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold dual-text mb-3">ForumKit</h1>
              <h2 className="text-lg text-fg mb-4">校園匿名討論平台</h2>
              <p className="leading-relaxed text-sm md:text-base text-fg">
                ForumKit 是一個專為校園環境設計的現代化討論平台，提供安全、匿名且友善的交流空間。
              </p>
            </div>

            {/* 特色三卡略 */}
          </div>

          {/* 開發專區：顏色設計器 + 開發進度 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-surface border border-border rounded-2xl p-4 md:p-6 shadow-soft">
              <h3 className="font-semibold dual-text mb-4">顏色搭配器</h3>
              <ColorDesigner />
            </div>

            <div className="bg-surface border border-border rounded-2xl p-4 md:p-6 shadow-soft">
              <h3 className="font-semibold dual-text mb-4">開發進度紀錄</h3>
              {progressLoading ? (
                <div className="py-8 text-center text-fg">載入中...</div>
              ) : progressData?.error ? (
                <div className="text-center py-8 text-rose-600">載入失敗：{progressData.error}</div>
              ) : (
                <div className="flex flex-col h-96">
                  {/* 進度項目 - 上半部 */}
                  <div className="flex-1 min-h-0 mb-4">
                    <h4 className="font-medium dual-text mb-3">項目進度</h4>
                    <div className="space-y-3 h-full overflow-y-auto">
                      {progressData?.progress_items?.map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface shadow-soft">
                          <div>
                            <h5 className="font-medium dual-text">{item.name}</h5>
                            {item.description && <p className="text-xs text-fg">{item.description}</p>}
                          </div>
                          <span className="px-2 py-1 text-xs rounded-lg bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300">
                            {item.status === 'completed' ? '完成' : item.status === 'in_progress' ? '開發中' : '規劃中'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 分隔線 */}
                  <div className="border-t border-border"></div>
                  
                  {/* 最新更新日誌 - 下半部 */}
                  <div className="flex-1 min-h-0 pt-4">
                    <h4 className="font-medium dual-text mb-3">最新更新</h4>
                    <div className="space-y-2 h-full overflow-y-auto">
                      {progressData?.recent_updates && progressData.recent_updates.length > 0 ? (
                        progressData.recent_updates.map((update, i) => (
                          <div key={i} className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-border">
                            <p className="text-xs text-fg">{update}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-muted text-sm">暫無更新記錄</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 回報表單 */}
          <div className="bg-surface border border-border rounded-2xl p-4 md:p-6 shadow-soft">
            <h3 className="font-semibold dual-text mb-4">意見回饋</h3>
            <ReportForm compact />
          </div>
          </div>
          <RealtimeToastPanel />
        </div>
      </div>
    )
  }

  // ---- 正常主頁（與開發模式共用）----
  return (
    <div className="min-h-screen">
      <NavBar role={role} pathname={pathname} />
      <MobileFabNav role={role} />
      <main className="mx-auto max-w-5xl px-4 pt-24 md:pt-28">
        <section className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold dual-text">ForumKit</h1>
            <SocketBadge />
          </div>
          <p className="text-muted mt-2">主題套用為自動判斷深/淺，無需手動切換。</p>
          <div className="mt-6 flex gap-2 flex-wrap">
            {(['guest','user','moderator','admin'] as Role[]).map(r => (
              <button key={r} onClick={() => setRole(r)} className={`px-3 py-1.5 rounded-xl border dual-btn ${role===r? 'ring-2 ring-primary/50':''}`}>{r}</button>
            ))}
          </div>
        </section>
      </main>
      <RealtimeToastPanel />
    </div>
  )
}

/* ---------- 元件：回報表單（多次可提交） ---------- */
function ReportForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState('一般回報')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<null | { ok: boolean; via?: string }>(null)
  const minRows = compact ? 3 : 5

  const submit = async () => {
    if (message.trim().length < 5) {
      alert('請至少填寫 5 個字的說明，謝謝！')
      return
    }
    setBusy(true); setResult(null)
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: email, category, message }),
      })
      const data = await r.json().catch(() => ({}))
      setResult({ ok: r.ok, via: data?.delivery })
      if (r.ok) {
        // ★ 清空內容，但保留 email 與類別，方便連續回報
        setMessage('')
      }
    } catch {
      setResult({ ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-left">
      <div className="grid gap-3">
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
          <input
            type="text"
            placeholder="你的聯絡方式（DC ID 或 Email，可留空）"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
          />
          <select
            value={category}
            onChange={e=>setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
          >
            <option>一般回報</option>
            <option>無法載入</option>
            <option>帳號/登入</option>
            <option>安全性</option>
            <option>建議改善</option>
          </select>
        </div>
        <textarea
          placeholder="請描述你遇到的情況（盡量提供操作步驟與時間點）"
          value={message}
          onChange={e=>setMessage(e.target.value)}
          rows={minRows}
          className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
        />
        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50">
            {busy ? '送出中...' : '送出回報'}
          </button>
          {result && (
            <span className={`text-sm ${result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {result.ok ? (result.via === 'discord' ? '已寄出（Discord）' : '已送出（本機記錄）') : '送出失敗'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- 元件：顏色設計器（多次可提交） ---------- */
function ColorDesigner() {
  const [primaryColor, setPrimaryColor] = useState('#F8F5EE')
  const [secondaryColor, setSecondaryColor] = useState('#DCCFBD')
  const [themeName, setThemeName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const colorType = (() => {
    const hex = primaryColor.replace('#','')
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16)
    const brightness = (r*299 + g*587 + b*114) / 1000
    return brightness > 128 ? 'light' : 'dark'
  })()
  const btnColor = colorType === 'light' ? '#2E2F31' : '#F5F5F5'
  const textColor = colorType === 'light' ? '#2E2F31' : '#F5F5F5'

  const submitTheme = async () => {
    if (!themeName.trim()) { alert('請為您的主題命名！'); return }
    setBusy(true); setNotice(null)
    try {
      const payload = {
        name: themeName,
        description,
        colors: { primary: primaryColor, secondary: secondaryColor, colorType, buttonColor: btnColor, textColor }
      }
      const r = await fetch('/api/color_vote', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const data = await r.json().catch(()=> ({}))
      if (r.ok) {
        setNotice(data?.delivery === 'discord' ? '感謝！已送至 Discord。' : '已送出（本機記錄）。')
        // ★ 清空名稱/描述，顏色保留方便連續調整
        setThemeName(''); setDescription('')
      } else {
        setNotice('提交失敗，請稍後重試')
      }
    } catch {
      setNotice('提交失敗，請稍後重試')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface/50 rounded-xl p-4 border border-border">
        <h4 className="font-semibold dual-text mb-3">主題預覽</h4>
        <div className="space-y-3">
          <div className="h-20 rounded-xl flex items-center justify-center font-semibold border-2 shadow-sm"
               style={{ backgroundColor: primaryColor, borderColor: secondaryColor, color: textColor }}>
            背景顏色 (主色)
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-xl font-semibold shadow-sm"
                    style={{ backgroundColor: btnColor, color: colorType === 'light' ? '#FFFFFF' : '#1F1F1F' }}>
              按鈕樣式
            </button>
            <div className="px-4 py-2 rounded-xl font-semibold shadow-sm border-2"
                 style={{ backgroundColor: 'transparent', borderColor: secondaryColor, color: textColor }}>
              框線樣式
            </div>
          </div>
        </div>
      </div>

      {/* 顏色輸入 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主色調 (背景顏色)</label>
          <div className="flex gap-3 items-center">
            <input type="color" value={primaryColor} onChange={e=>setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
            <input type="text" value={primaryColor} onChange={e=>setPrimaryColor(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">輔助色 (框線顏色)</label>
          <div className="flex gap-3 items-center">
            <input type="color" value={secondaryColor} onChange={e=>setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
            <input type="text" value={secondaryColor} onChange={e=>setSecondaryColor(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">深淺色類型</label>
          <div className="px-3 py-2 rounded-xl border bg-surface/60 text-fg text-sm">
            自動判斷：{colorType === 'light' ? '淺色主題 (黑字白按鈕)' : '深色主題 (白字黑按鈕)'}
          </div>
        </div>
      </div>

      {/* 主題資訊輸入 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主題名稱</label>
          <input 
            type="text" 
            value={themeName} 
            onChange={e => setThemeName(e.target.value)} 
            placeholder="為您的主題命名..." 
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg" 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主題描述 (可選)</label>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="描述您的主題設計理念..." 
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg min-h-[80px]" 
          />
        </div>
      </div>

      {/* 快速方案略（可保留你先前的陣列） */}

      <div className="flex items-center gap-3">
        <button onClick={submitTheme} disabled={busy || !themeName.trim()} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50">
          {busy ? '提交中...' : '提交配色方案'}
        </button>
        {notice && <span className="text-sm text-muted">{notice}</span>}
      </div>
    </div>
  )
}

/* ---------- /mode 管理面板：儲存成功後強制導回首頁 ---------- */
function AdminModePanel({ platform, onUpdated, full }: { platform: PlatformMode; onUpdated: (p: PlatformMode)=> void; full?: boolean }) {
  const [mode, setMode] = useState(platform.mode)
  const [msg, setMsg] = useState(platform.maintenance_message || '')
  const [until, setUntil] = useState(platform.maintenance_until || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    try {
      setSaving(true)
      const r = await fetch('/api/mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode, maintenance_message: msg, maintenance_until: until }) })
      const data = await r.json().catch(()=> ({}))
      if (r.ok) onUpdated(data)
      // ★ 立即導回首頁（避免 SPA history 攔截）
      location.assign('/')
      // 保底：若環境有延遲，再次嘗試
      setTimeout(() => { if (location.pathname !== '/') location.assign('/') }, 800)
    } finally {
      setSaving(false)
    }
  }

  const inner = (
    <div className="max-w-xl w-full bg-surface/80 border border-border rounded-2xl p-6 shadow backdrop-blur mt-10">
      <h2 className="font-semibold text-xl mb-4">平台模式管理</h2>
      <div className="flex gap-4 flex-wrap mb-4">
        {(['normal','maintenance','development'] as PlatformMode['mode'][]).map(m => (
          <label key={m} className={`px-3 py-2 rounded-xl border cursor-pointer ${mode===m? 'dual-btn ring-2 ring-primary/50':'bg-surface/60 hover:bg-surface/80 border-border'}`}>
            <input type="radio" name="mode" value={m} className="hidden" checked={mode===m} onChange={()=> setMode(m)} />{m}
          </label>
        ))}
      </div>
      {mode==='maintenance' && (
        <div className="space-y-3 mb-4">
          <textarea value={msg} onChange={e=> setMsg(e.target.value)} placeholder="維護訊息" className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg min-h-[80px]" />
          <input value={until} onChange={e=> setUntil(e.target.value)} placeholder="預計完成時間 (ISO 或描述)" className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg" />
        </div>
      )}
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50">{saving? '儲存中...' : '儲存'}</button>
      <p className="text-xs text-muted mt-4">尚未加入權限驗證（後續需登入才可操作）。</p>
    </div>
  )
  if (full) return <div className="min-h-screen flex flex-col items-center pt-24 md:pt-32 px-4">{inner}</div>
  return <div className="mt-10">{inner}</div>
}
