import { useEffect, useState } from 'react'
import { HttpError, getJSON } from '@/lib/http'

type QueueResp = {
  posts: { id: number; excerpt: string }[]
  media: { id: number; path: string }[]
}

export default function GeneralAdminPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string| null>(null)
  const [posts, setPosts] = useState<(QueueResp['posts'][number] & { created_at?: string; client_id?: string; ip?: string })[]>([])
  const [media, setMedia] = useState<(QueueResp['media'][number] & { created_at?: string; client_id?: string; ip?: string })[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  // 批次選取與快捷鍵
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cursor, setCursor] = useState<number>(-1)
  // 篩選
  const [keyword, setKeyword] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  // 稽核整合
  const [blocked, setBlocked] = useState<{ ip: string; ttl: number }[]>([])
  const [reports, setReports] = useState<any[]>([])
  // 紀錄
  const [logs, setLogs] = useState<any[]>([])

  async function load() {
    try {
      setLoading(true); setError(null)
      const data = await getJSON<QueueResp>('/api/moderation/queue')
      setPosts(data.posts || [])
      setMedia(data.media || [])
      try {
        const bi = await getJSON<{ items: { ip: string; ttl: number }[]; total: number }>(`/api/abuse/blocked_ips`)
        setBlocked(bi.items || [])
      } catch {}
      try {
        const ar = await getJSON<{ items: any[]; total: number }>(`/api/abuse/audit_reports?limit=20`)
        setReports(ar.items || [])
      } catch {}
      try {
        const lg = await getJSON<{ items: any[]; total: number }>(`/api/moderation/logs?limit=50`)
        setLogs(lg.items || [])
      } catch {}
    } catch (e) {
      if (e instanceof HttpError) setError(e.message)
      else setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // 快捷鍵：j/k 移動、a 批准、r 退件
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName.match(/input|textarea|select/i)) return
      if (e.key === 'j') { setCursor(c => Math.min(c + 1, posts.length - 1)) }
      if (e.key === 'k') { setCursor(c => Math.max(c - 1, 0)) }
      if (e.key === 'a' && cursor >= 0 && cursor < posts.length) approvePost(posts[cursor].id)
      if (e.key === 'r' && cursor >= 0 && cursor < posts.length) rejectPost(posts[cursor].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, posts])

  async function approvePost(id: number) {
    try {
      setBusy(id)
      const r = await fetch(`/api/moderation/post/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } })
      if (!r.ok) throw new Error(await r.text())
      setPosts(p => p.filter(x => x.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      alert(`核准失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function rejectPost(id: number) {
    const reason = prompt('請輸入退件原因', '不符合規範') || '不符合規範'
    try {
      setBusy(id)
      const r = await fetch(`/api/moderation/post/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify({ reason }) })
      if (!r.ok) throw new Error(await r.text())
      setPosts(p => p.filter(x => x.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      alert(`退件失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function approveMedia(id: number) {
    try {
      setBusy(id)
      const r = await fetch(`/api/moderation/media/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } })
      if (!r.ok) throw new Error(await r.text())
      setMedia(m => m.filter(x => x.id !== id))
    } catch (e) {
      alert(`核准媒體失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function rejectMedia(id: number) {
    const reason = prompt('請輸入退件原因', '不符合規範') || '不符合規範'
    try {
      setBusy(id)
      const r = await fetch(`/api/moderation/media/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify({ reason }) })
      if (!r.ok) throw new Error(await r.text())
      setMedia(m => m.filter(x => x.id !== id))
    } catch (e) {
      alert(`退件媒體失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function bulkApprove() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`確認核准 ${ids.length} 筆貼文？`)) return
    for (const id of ids) await approvePost(id)
  }

  async function bulkReject() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const reason = prompt('請輸入退件原因', '不符合規範') || '不符合規範'
    for (const id of ids) await rejectPost(id)
  }

  function toggle(id: number) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function inFilter(dt?: string, text?: string) {
    let ok = true
    if (keyword) ok = ok && (text || '').toLowerCase().includes(keyword.toLowerCase())
    if (startDate) ok = ok && (!!dt && dt >= startDate)
    if (endDate) ok = ok && (!!dt && dt <= endDate + 'T23:59:59')
    return ok
  }

  const fposts = posts.filter(p => inFilter(p.created_at, p.excerpt))

  if (loading) return <div className="min-h-screen grid place-items-center"><div className="text-muted">載入中...</div></div>
  if (error) return <div className="min-h-screen grid place-items-center"><div className="text-rose-600">{error}</div></div>

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">一般管理（暫時版）</h1>
            <div className="flex gap-2">
              <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="關鍵字" className="form-control text-sm w-40" />
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="form-control text-sm w-40" />
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="form-control text-sm w-40" />
              <button onClick={load} className="px-3 py-1.5 text-sm rounded-xl border hover:bg-surface/70">重新整理</button>
            </div>
          </div>
          <p className="text-sm text-muted mt-1">僅提供基本審核功能；詳細頁與批次工具將於後續開發。</p>
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold dual-text">待審貼文（{fposts.length}）</h2>
              <div className="flex gap-2">
                <button onClick={()=>setSelected(new Set(fposts.map(p=>p.id)))} className="px-2 py-1 text-xs rounded-lg border">全選</button>
                <button onClick={()=>setSelected(new Set())} className="px-2 py-1 text-xs rounded-lg border">清空</button>
                <button onClick={bulkReject} className="px-3 py-1.5 text-xs rounded-lg border">批次退件</button>
                <button onClick={bulkApprove} className="px-3 py-1.5 text-xs rounded-lg border dual-btn">批次核准</button>
              </div>
            </div>
            {fposts.length === 0 ? (
              <div className="text-sm text-muted">目前沒有待審貼文</div>
            ) : (
              <div className="space-y-2">
                {fposts.map((p, idx) => (
                  <div key={p.id} className={`p-3 rounded-xl border border-border bg-surface/60 ${cursor===idx?'ring-2 ring-primary/50':''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-muted">#{p.id}</div>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.has(p.id)} onChange={()=>toggle(p.id)} /> 選取</label>
                    </div>
                    <div className="text-xs text-muted mb-1">{p.created_at ? new Date(p.created_at).toLocaleString():''}</div>
                    {(p.client_id || p.ip) && (
                      <div className="text-xs text-muted mb-1">來源：{p.client_id || '-'} · {p.ip || '-'}</div>
                    )}
                    <div className="text-sm text-fg mb-2 break-words">{p.excerpt}</div>
                    <div className="flex gap-2 justify-end">
                      <button disabled={busy===p.id} onClick={()=>rejectPost(p.id)} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-surface/70">退件</button>
                      <button disabled={busy===p.id} onClick={()=>approvePost(p.id)} className="px-3 py-1.5 text-xs rounded-lg border dual-btn">核准</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <h2 className="font-semibold dual-text mb-3">待審媒體（{media.length}）</h2>
            {media.length === 0 ? (
              <div className="text-sm text-muted">目前沒有待審媒體</div>
            ) : (
              <div className="space-y-2">
                {media.map(m => (
                  <div key={m.id} className="p-3 rounded-xl border border-border bg-surface/60">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-muted">#{m.id}</div>
                      <div className="text-xs text-muted">{m.created_at ? new Date(m.created_at).toLocaleString():''}</div>
                    </div>
                    <div className="text-xs text-fg break-all mb-2">{m.path}</div>
                    {(m.client_id || m.ip) && (
                      <div className="text-xs text-muted mb-1">來源：{m.client_id || '-'} · {m.ip || '-'}</div>
                    )}
                    <div className="mb-2">
                      {m.path.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                        <img src={`/uploads/${m.path}`} alt="pending" className="max-h-48 rounded" />
                      ) : m.path.match(/\.(mp4|webm)$/i) ? (
                        <video src={`/uploads/${m.path}`} controls className="max-h-48 rounded" />
                      ) : null}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button disabled={busy===m.id} onClick={()=>rejectMedia(m.id)} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-surface/70">退件</button>
                      <button disabled={busy===m.id} onClick={()=>approveMedia(m.id)} className="px-3 py-1.5 text-xs rounded-lg border dual-btn">核准</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 稽核 / 封鎖資訊 */}
        <section className="grid gap-4 md:grid-cols-2 mt-4">
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <h2 className="font-semibold dual-text mb-3">封鎖中的 IP（{blocked.length}）</h2>
            {blocked.length===0 ? <div className="text-sm text-muted">目前沒有封鎖 IP（單機模式無法枚舉）</div> : (
              <div className="space-y-2">
                {blocked.map(b => (
                  <div key={b.ip} className="flex items-center justify-between p-2 rounded-xl border border-border">
                    <div className="text-sm text-fg">{b.ip}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">TTL: {b.ttl ?? '-'}s</span>
                      <button onClick={async()=>{ await fetch('/api/abuse/unblock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ip:b.ip})}); load() }} className="px-2 py-1 text-xs rounded-lg border">解除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <h2 className="font-semibold dual-text mb-3">近期稽核報告</h2>
            {reports.length===0 ? <div className="text-sm text-muted">尚無報告</div> : (
              <div className="space-y-2">
                {reports.map((r,i)=> (
                  <div key={r.ticket||i} className="p-2 rounded-xl border border-border">
                    <div className="text-xs text-muted mb-1">{r.ticket} · {r.ip}</div>
                    <div className="text-sm text-fg break-words">{r.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 操作日誌 + 匯出 */}
        <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold dual-text">審核日誌（{logs.length}）</h2>
            <button onClick={async()=>{
              // 以 JSON 產 CSV 並下載
              const header = ['id','target_type','target_id','action','old_status','new_status','reason','moderator_id','created_at']
              const lines = [header.join(',')].concat(logs.map((it:any)=> header.map(h=> JSON.stringify(it[h] ?? '')).join(',')))
              const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='moderation_logs.csv'; a.click(); URL.revokeObjectURL(url)
            }} className="px-3 py-1.5 text-sm rounded-lg border">匯出 CSV</button>
          </div>
          {logs.length===0 ? <div className="text-sm text-muted">尚無日誌</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {logs.map((l:any)=> (
                <div key={l.id} className="p-2 rounded-xl border border-border">
                  <div className="text-xs text-muted mb-1">#{l.id} · {l.created_at ? new Date(l.created_at).toLocaleString():''}</div>
                  <div className="text-sm text-fg">{l.action} {l.target_type} #{l.target_id} → {l.new_status}</div>
                  {l.reason && <div className="text-xs text-muted">{l.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
