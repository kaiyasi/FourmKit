import { useEffect, useMemo, useRef, useState } from 'react'
import { joinRoom, leaveRoom, sendMessage } from '@/services/rooms'
import { getClientId } from '@/utils/client'

type Msg = { room: string; message: string; client_id?: string; ts?: string; username?: string }

export default function ChatPanel({ room, title, subtitle }: { room: string; title?: string; subtitle?: string }) {
  const clientId = useMemo(() => getClientId(), [])
  const [messages, setMessages] = useState<Msg[]>([])
  const [presence, setPresence] = useState<number>(0)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const dispose = joinRoom(room, clientId, {
      onBacklog: (msgs) => {
        const set = new Set<string>()
        const list = (msgs as Msg[]).map(m => {
          const k = `${m.client_id||''}|${m.ts||''}|${m.message}`
          set.add(k)
          return m
        })
        seenRef.current = set
        setMessages(list)
      },
      onPresence: (n) => setPresence(n),
      onMessage: (msg) => {
        const k = `${msg.client_id||''}|${msg.ts||''}|${msg.message}`
        if (seenRef.current.has(k)) return
        seenRef.current.add(k)
        setMessages((cur) => [...cur, msg])
      },
      onError: (e) => setErr(e.error)
    })
    return () => {
      try { dispose?.() } catch {}
      try { leaveRoom(room, clientId) } catch {}
    }
  }, [room, clientId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [messages.length])

  const onSend = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = text.trim()
    if (!msg) return
    // 樂觀更新（Optimistic Update，避免等待伺服器回傳造成刷新感）
    const optimisticTs = new Date().toISOString()
    const optimistic: Msg = { room, message: msg, client_id: clientId, ts: optimisticTs }
    const k = `${optimistic.client_id}|${optimistic.ts}|${optimistic.message}`
    seenRef.current.add(k)
    setMessages(cur => [...cur, optimistic])
    // 送出給伺服器（收到回傳時因為 seenRef 有紀錄不會重複加入）
    sendMessage(room, msg, clientId, optimisticTs)
    setText('')
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft flex flex-col min-h-[280px]">
      <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold dual-text text-base">{title || `聊天室：${room}`}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-xs text-muted">在線：{presence}</div>
      </div>
      {err && (
        <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-border">{err}</div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="text-sm text-muted">暫無訊息</div>
        ) : (
          messages.map((m) => {
            const key = `${m.client_id||''}|${m.ts||''}|${m.message}`
            return (
            <div key={key} className={`max-w-[85%] p-2 rounded-xl border border-border ${m.client_id === clientId ? 'ml-auto bg-primary/10' : 'bg-surface/70'}`}>
              <div className="text-xs text-muted mb-0.5">{m.client_id === clientId ? '我' : (m.username || m.client_id || '匿名')}</div>
              <div className="text-sm text-fg break-words whitespace-pre-wrap">{m.message}</div>
              <div className="text-[10px] text-muted mt-0.5">{m.ts ? new Date(m.ts).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : ''}</div>
            </div>
          )})
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSend} className="p-3 border-t border-border flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="輸入訊息…"
          className="form-control text-sm flex-1"
          maxLength={2000}
        />
        <button type="submit" className="px-3 py-1.5 text-sm rounded-xl border dual-btn">送出</button>
      </form>
    </div>
  )
}
