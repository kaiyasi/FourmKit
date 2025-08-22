import { useEffect, useMemo, useState } from 'react'
import { getJSON, HttpError } from '@/lib/http'
import ErrorPage from '@/components/ui/ErrorPage'

type RoomSummary = { room: string; clients: number; backlog: number }
type Message = { room: string; message: string; client_id?: string; ts?: string }

export default function AdminRoomsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [selected, setSelected] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [poll, setPoll] = useState(false)
  const [query, setQuery] = useState('')

  const fetchRooms = async () => {
    try {
      setLoading(true); setError(null)
      const res = await getJSON<{ items: RoomSummary[]; total: number }>(`/api/rooms/summary`)
      setRooms(res.items || [])
    } catch (e) {
      setError(e instanceof HttpError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (room: string) => {
    if (!room) return
    try {
      const res = await getJSON<{ items: Message[]; total: number }>(`/api/rooms/${encodeURIComponent(room)}/messages`)
      setMessages(res.items || [])
    } catch (e) {
      // 靜默錯誤以免覆蓋視圖
    }
  }

  const clearMessages = async () => {
    if (!selected) return
    if (!confirm(`確認清空房間「${selected}」的訊息？`)) return
    try {
      await fetch(`/api/rooms/${encodeURIComponent(selected)}/clear`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } })
      await fetchMessages(selected)
      await fetchRooms()
    } catch {}
  }

  useEffect(() => { fetchRooms() }, [])
  useEffect(() => { if (selected) fetchMessages(selected) }, [selected])
  useEffect(() => {
    if (!poll) return
    const t = setInterval(() => {
      fetchRooms(); if (selected) fetchMessages(selected)
    }, 5000)
    return () => clearInterval(t)
  }, [poll, selected])

  const exportCSV = async () => {
    if (!selected) return
    try {
      const res = await getJSON<{ items: Message[]; total: number }>(`/api/rooms/${encodeURIComponent(selected)}/messages`)
      const items = res.items || []
      const header = ['room','client_id','ts','message']
      const lines = [header.join(',')].concat(items.map(m => header.map(h => JSON.stringify((m as any)[h] ?? '')).join(',')))
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `room_${selected}_messages.csv`; a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold dual-text flex items-center gap-3">
            聊天室監看
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 border border-border">{rooms.length} 房</span>
          </h1>
          <div className="flex items-center gap-2">
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋房間" className="form-control h-9 w-40" />
            {selected && <button onClick={clearMessages} className="px-3 py-2 text-sm rounded-xl border">清空訊息</button>}
            {selected && <button onClick={exportCSV} className="px-3 py-2 text-sm rounded-xl border">匯出 CSV</button>}
            <button onClick={fetchRooms} className="px-3 py-2 text-sm rounded-xl border dual-btn">重新整理</button>
            <label className="text-sm text-muted flex items-center gap-2"><input type="checkbox" checked={poll} onChange={e=>setPoll(e.target.checked)} /> 每 5 秒自動刷新</label>
          </div>
        </div>
        {loading ? (
          <div className="text-muted">載入中...</div>
        ) : error ? (
          <ErrorPage status={undefined} title="載入聊天室資訊失敗" message={error} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 shadow-soft">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold dual-text">房間列表</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-600 dark:text-primary-300 border border-border">{rooms.length}</span>
              </div>
              {rooms.length === 0 ? (
                <div className="text-sm text-muted">目前沒有活躍房間</div>
              ) : (
              <div className="divide-y divide-border">
                  {(query? rooms.filter(r=> r.room.includes(query)) : rooms).map(r => (
                    <button key={r.room} onClick={()=>setSelected(r.room)} className={`w-full text-left py-2 flex items-center justify-between rounded-lg hover:bg-surface/70 transition-colors ${selected===r.room?'bg-surface/70':''}`}>
                      <div>
                        <div className="text-sm text-fg">{r.room}</div>
                        <div className="text-xs text-muted">消息：{r.backlog}</div>
                      </div>
                      <div className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200 border border-border">在線：{r.clients}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 shadow-soft min-h-[300px]">
              <h2 className="font-semibold dual-text mb-2">房間訊息 {selected ? `（${selected}）` : ''}</h2>
              {!selected ? (
                <div className="text-sm text-muted">請選擇房間</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-muted">沒有訊息</div>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-auto">
                  {messages.map((m,i)=>(
                    <div key={i} className="p-2 rounded-xl border border-border bg-surface/70">
                      <div className="text-xs text-muted mb-0.5">{m.client_id || '匿名'} · {m.ts? new Date(m.ts).toLocaleString():''}</div>
                      <div className="text-sm text-fg break-words whitespace-pre-wrap">{m.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
