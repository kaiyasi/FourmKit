import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { MessageSquare, RefreshCw, AlertTriangle, Reply, Shield } from 'lucide-react'
import { getRole } from '@/utils/auth'
import { api } from '@/services/api'

type EventItem = {
  timestamp: string
  event_type: string
  title: string
  description: string
  actor_name?: string | null
  metadata?: {
    ip?: string
    client_id?: string
    category?: string
    ticket_id?: string | number
    id?: string | number
    [key: string]: any
  }
}

export default function AdminSupportPage() {
  const role = getRole()
  const [items, setItems] = useState<EventItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [cat, setCat] = useState<string>('')
  const [scope, setScope] = useState<'all'|'cross'|'school'>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replying, setReplying] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const isSchoolStaff = ['campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role)
  const [piiReason, setPiiReason] = useState('')
  const [piiPostId, setPiiPostId] = useState('')
  const [piiBusy, setPiiBusy] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const j = await api<{ items: EventItem[] }>(`/api/support/recent?limit=50`, { method: 'GET' })
      setItems(Array.isArray(j.items) ? j.items.slice(0,50) : [])
    } catch (e:any) {
      setError(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  // 載入全部學校（供 slug→名稱顯示）
  useEffect(() => {
    (async () => {
      try {
        if ((window as any).__allSchools) return
        const r = await fetch('/api/schools', { cache: 'no-store' })
        const j = await r.json().catch(()=>({}))
        if (Array.isArray(j?.items)) (window as any).__allSchools = j.items
      } catch {}
    })()
  }, [])

  const fmtTime = (iso?: string) => {
    if (!iso) return ''
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  // dev_admin 也可檢視回報/聯絡流
  // ...existing code...
  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/support" />
      <MobileBottomNav />

      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 shadow-soft mb-3 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          <h1 className="text-lg sm:text-xl font-semibold dual-text">使用者回報 / 聯絡</h1>
          <button onClick={load} className="ml-auto btn-ghost text-sm flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading? 'animate-spin':''}`} /> 刷新
          </button>
        </div>
        {/* 篩選器 */}
        <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 shadow-soft mb-3 flex flex-wrap items-center gap-2">
          <select value={cat} onChange={e=>setCat(e.target.value)} className="form-control w-40">
            <option value="">全部分類</option>
            <option value="suggestion">功能建議</option>
            <option value="report">問題回報</option>
            <option value="abuse">濫用/檢舉</option>
            <option value="account">帳號/登入問題</option>
            <option value="other">其他</option>
          </select>
          <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="關鍵字（標題/內容/使用者）" className="form-control flex-1 min-w-[12rem]" />
          <select value={scope} onChange={e=>setScope(e.target.value as any)} className="form-control w-40">
            <option value="all">全部範圍</option>
            <option value="cross">跨校</option>
            <option value="school">校內</option>
          </select>
        </div>

        {/* 校方個資申請（法律爭議） */}
        {isSchoolStaff && (
          <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 shadow-soft mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4" />
              <div className="font-medium dual-text">發文者個資申請（法律爭議）</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted mb-1">貼文編號（選填）</label>
                <input className="form-control w-full" value={piiPostId} onChange={e=>setPiiPostId(e.target.value)} placeholder="例如 12345" />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1">申請理由（必要）</label>
                <input className="form-control w-full" value={piiReason} onChange={e=>setPiiReason(e.target.value)} placeholder="請描述法律爭議或必要性" />
              </div>
            </div>
            <div className="text-xs text-muted mt-2">僅限校內/跨校管理員，提交後將進行審核並通知結果。</div>
            <div className="mt-2">
              <button
                disabled={piiBusy || piiReason.trim().length < 5}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                onClick={async()=>{
                  try {
                    setPiiBusy(true)
                    const payload:any = { reason: piiReason.trim(), post_id: piiPostId? Number(piiPostId): undefined }
                    await api<{ok:boolean}>(`/api/support/pii_request`, { method:'POST', body: JSON.stringify(payload) })
                    setPiiReason(''); setPiiPostId('')
                    alert('已提交個資申請，結果將以通知方式告知。')
                  } catch(e:any) {
                    alert(e?.message||'提交失敗')
                  } finally { setPiiBusy(false) }
                }}
              >提交申請</button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 shadow-soft mb-3 flex items-center gap-2 text-rose-600">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 shadow-soft">
          {loading && items.length===0 ? (
            <div className="text-center py-12 text-muted">載入中…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted">近期沒有新的回報</div>
          ) : (
            <div className="divide-y divide-border">
              {items
                .filter(it => {
                  if (cat && (it?.metadata?.category||'') !== cat) return false
                  if (scope !== 'all') {
                    const sc = (it as any)?.metadata?.scope || 'cross'
                    if (sc !== scope) return false
                  }
                  const kw = keyword.trim().toLowerCase()
                  if (!kw) return true
                  const bag = `${it.title||''}\n${it.description||''}\n${it.actor_name||''}`.toLowerCase()
                  return bag.includes(kw)
                })
                .map((it, i) => (
                <div key={i} className="py-3 sm:py-4 flex gap-3">
                  <div className="w-28 shrink-0 text-xs text-muted mt-1">{fmtTime(it.timestamp)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium dual-text truncate">{it.title || '使用者回報'}</div>
                      {it.actor_name && (
                        <span className="text-xs text-muted">by {it.actor_name}</span>
                      )}
                    </div>
                    <div className="text-sm text-fg whitespace-pre-wrap break-words mt-1">{it.description}</div>
                    {/* 回覆串（若後端提供 metadata.replies） */}
                    {Array.isArray((it as any)?.metadata?.replies) && (it as any).metadata.replies.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {(it as any).metadata.replies.map((r: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-lg border border-border bg-surface/50">
                            <div className="text-xs text-muted">{fmtTime(r?.timestamp)} · 由 {r?.by || '管理員'}</div>
                            <div className="text-sm text-fg whitespace-pre-wrap break-words">{r?.message||''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(it?.metadata?.category || it?.metadata?.client_id || it?.metadata?.ip) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {it.metadata?.category && (
                          <span className="px-2 py-0.5 rounded-lg border border-border text-xs text-muted">分類：{it.metadata.category}</span>
                        )}
                        {it.metadata?.client_id && (
                          <span className="px-2 py-0.5 rounded-lg border border-border text-xs text-muted">ClientID：{it.metadata.client_id}</span>
                        )}
                        {it.metadata?.ip && (
                          <span className="px-2 py-0.5 rounded-lg border border-border text-xs text-muted">IP：{it.metadata.ip}</span>
                        )}
                        {it.metadata?.school_slug && (
                          <span className="px-2 py-0.5 rounded-lg border border-border text-xs text-muted">學校：{(window as any).__allSchools?.find?.((s:any)=>s.slug===it.metadata?.school_slug)?.name || (it.metadata?.school_slug==='__ALL__' ? '跨校' : it.metadata?.school_slug)}</span>
                        )}
                        {((it as any)?.metadata?.scope) && (
                          <span className="px-2 py-0.5 rounded-lg border border-border text-xs text-muted">範圍：{(it as any).metadata.scope==='school'?'校內':'跨校'}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-2">
                      <button
                        className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                        onClick={() => { setReplying(replying === i ? null : i); setReplyText('') }}
                      >
                        <Reply className="w-4 h-4" /> 回覆
                      </button>
                    </div>
                    {replying === i && (
                      <div className="mt-2 p-2 border border-border rounded-xl bg-surface/50">
                        <textarea
                          className="form-control w-full"
                          rows={3}
                          placeholder="輸入回覆內容，將通知回報者（若可識別）。"
                          value={replyText}
                          onChange={(e)=>setReplyText(e.target.value)}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            className="btn-primary px-3 py-1 text-sm"
                            onClick={async()=>{
                              const text = replyText.trim(); if (!text) return;
                              try {
                                const target = it?.metadata?.support_ticket_id || it?.metadata?.ticket_id || it?.metadata?.id || null
                                await api<{ ok:boolean }>(`/api/support/reply`, { method:'POST', body: JSON.stringify({
                                  ticket: target,
                                  client_id: it?.metadata?.client_id,
                                  message: text,
                                }) })
                                setReplyText(''); setReplying(null); load();
                              } catch (e:any) {
                                alert(e?.message || '回覆失敗')
                              }
                            }}
                          >送出回覆</button>
                          <button className="btn-ghost px-3 py-1 text-sm" onClick={()=>{ setReplying(null); setReplyText('') }}>取消</button>
                        </div>
                      </div>
                    )}
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
