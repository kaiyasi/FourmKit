import { useEffect, useState } from 'react'
import { Instagram, Send, Image, Clock, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

type Stats = {
  accounts: { total: number; active: number }
  templates: { total: number }
  posts: { total_published: number; pending: number; failed: number; recent_7days: number }
  queue: { pending: number }
}

export default function IGIntegrationCard() {
  const { role } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!['dev_admin','campus_admin','cross_admin'].includes(role)) return
    try {
      setLoading(true); setError(null)
      const r = await fetch('/api/instagram/stats', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')||''}` },
        cache: 'no-store'
      })
      const j = await r.json().catch(()=>({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error?.message || `HTTP ${r.status}`)
      setStats(j.data as Stats)
    } catch (e:any) {
      setError(e?.message || String(e))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [role])
  if (!['dev_admin','campus_admin','cross_admin'].includes(role)) return null

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Instagram className="w-5 h-5 text-pink-500" />
          <h3 className="font-semibold dual-text">Instagram 連動</h3>
          {role!=='dev_admin' && (
            <span className="text-xs text-muted flex items-center gap-1">
              <Shield className="w-3 h-3" /> {role==='campus_admin'?'校內':'跨校'}管理
            </span>
          )}
        </div>
        <a href="/admin/instagram" className="text-sm underline text-muted hover:text-fg">前往管理</a>
      </div>

      {loading ? (
        <div className="text-sm text-muted">載入中…</div>
      ) : error ? (
        <div className="text-sm text-danger-text">{error}</div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Instagram className="w-4 h-4 text-pink-500" />
              <span className="text-xs text-muted">帳號</span>
            </div>
            <div className="text-lg font-semibold dual-text">{stats.accounts.active}/{stats.accounts.total}</div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Image className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted">模板</span>
            </div>
            <div className="text-lg font-semibold dual-text">{stats.templates.total}</div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-green-600" />
              <span className="text-xs text-muted">近7日</span>
            </div>
            <div className="text-lg font-semibold dual-text">{stats.posts.recent_7days}</div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-muted">待佇列</span>
            </div>
            <div className="text-lg font-semibold dual-text">{stats.queue.pending}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">尚無資料</div>
      )}
    </div>
  )
}

