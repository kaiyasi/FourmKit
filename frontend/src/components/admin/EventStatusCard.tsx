import { useEffect, useState } from 'react'
import { Activity, Bell, AlertTriangle } from 'lucide-react'
import { getRole } from '@/utils/auth'

type Stats = {
  total_events: number
  events_24h: number
  type_distribution: Record<string, number>
  severity_distribution: Record<string, number>
  recent_events: { timestamp: string; event_type: string; title: string; description: string }[]
}

export default function EventStatusCard() {
  const role = getRole()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (role !== 'dev_admin') return
    try {
      setLoading(true)
      setError(null)
      const r = await fetch('/api/status/events/stats', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')||''}` },
        cache: 'no-store'
      })
      const j = await r.json().catch(()=>({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error?.message || `HTTP ${r.status}`)
      setStats(j.stats as Stats)
    } catch (e:any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (role !== 'dev_admin') return null
  return (
    <div className="fixed top-4 left-4 z-50 max-w-xs sm:max-w-sm">
      <div className="rounded-2xl border border-border bg-surface/80 backdrop-blur px-3 py-2 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-info" />
          <div className="text-sm font-medium text-fg">平台狀態</div>
          <button onClick={load} className="ml-auto text-xs underline text-muted">刷新</button>
        </div>
        {loading ? (
          <div className="text-xs text-muted">載入中…</div>
        ) : error ? (
          <div className="text-xs text-danger-text flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </div>
        ) : stats ? (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <Bell className="w-3 h-3 text-info" />
              <span className="text-muted">24h：</span>
              <span className="text-fg font-medium">{stats.events_24h}</span>
              <span className="text-muted ml-2">總計：</span>
              <span className="text-fg">{stats.total_events}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(stats.type_distribution).slice(0,3).map(([k,v]) => (
                <span key={k} className="px-2 py-0.5 rounded-full bg-surface-hover border border-border">{k}:{v}</span>
              ))}
            </div>
            {stats.recent_events && stats.recent_events.length>0 && (
              <div className="mt-1">
                <div className="text-muted mb-1">最新：</div>
                {stats.recent_events.slice(0,2).map((e,i)=>(
                  <div key={i} className="truncate">• {new Date(e.timestamp).toLocaleTimeString()} {e.title || e.event_type}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted">無資料</div>
        )}
      </div>
    </div>
  )
}

