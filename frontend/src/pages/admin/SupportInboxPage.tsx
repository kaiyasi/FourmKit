import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { ArrowLeft, RefreshCw, MessageSquare, AlertTriangle } from 'lucide-react'
import { formatLocalMinute } from '@/utils/time'

export default function AdminSupportInboxPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const load = async () => {
    try {
      setLoading(true); setError(null)
      const r = await fetch('/api/support/recent', { headers:{ 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }, cache:'no-store' })
      const j = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(j?.msg || '讀取失敗')
      setItems(Array.isArray(j?.items) ? j.items : [])
    } catch (e:any) {
      setError(e?.message || '讀取失敗')
    } finally {
      setLoading(false)
    }
  }
  useEffect(()=>{ load() },[])

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/support" />
      <MobileBottomNav />
      <main className="mx-auto max-w-5xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center justify-between">
            <button onClick={()=>window.history.back()} className="flex items-center gap-2 text-muted hover:text-fg"><ArrowLeft className="w-4 h-4"/>返回</button>
            <button onClick={load} disabled={loading} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-surface/80 flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`} /> 重新整理</button>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold dual-text mt-2">使用者回報 / 聯絡</h1>
          <p className="text-sm text-muted">檢視最近 50 則透過「聯絡管理員」送來的訊息（含 IP/ClientID/分類）。</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted">載入中...</div>
          ) : error ? (
            <div className="p-8 text-center text-rose-600">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted">目前沒有新回報</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((e:any, idx:number)=> (
                <div key={idx} className="p-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-surface border border-border"><MessageSquare className="w-4 h-4"/></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-fg">{e.title || e.event_type_display || '回報'}</span>
                        <span className="text-xs text-muted">{formatLocalMinute(e.timestamp)}</span>
                        {e.severity && <span className="text-xs text-muted">· {e.severity}</span>}
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-fg mt-1 break-words">{e.description}</div>
                      <div className="text-xs text-muted mt-1">{e.actor_name ? `來自：${e.actor_name}` : '來自：訪客'} · {e.metadata?.email ? `Email: ${e.metadata.email} · `: ''}IP: {e.metadata?.ip || '-'} · Client: {e.metadata?.client_id || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
