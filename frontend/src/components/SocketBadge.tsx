import { useEffect, useState } from 'react'
import socket from '../lib/socket'

export default function SocketBadge() {
  const [status, setStatus] = useState<'connecting'|'connected'|'disconnected'>('connecting')
  const [lastMsg, setLastMsg] = useState<string>('—')
  const [lastPong, setLastPong] = useState<string>('—')

  useEffect(() => {
    const onConnect = () => { setStatus('connected') }
    const onDisconnect = () => { setStatus('disconnected') }
    const onHello = (data: any) => { setLastMsg(`hello: ${data?.message || ''}`) }
    const onPong = (data: any) => { setLastPong(new Date().toLocaleTimeString()) }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('hello', onHello)
    socket.on('pong', onPong)

    // 初始若已連線
    if (socket.connected) setStatus('connected')

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('hello', onHello)
      socket.off('pong', onPong)
    }
  }, [])

  const ping = () => socket.emit('ping', { at: Date.now() })

  const dot = status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="inline-flex items-center gap-3 px-3 py-2 rounded-2xl border border-border bg-surface/70 backdrop-blur">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="text-sm">
        Socket：{status === 'connected' ? '已連線' : status === 'connecting' ? '連線中' : '已斷線'}
      </span>
      <span className="text-xs text-muted">| {lastMsg}</span>
      <span className="text-xs text-muted">| pong：{lastPong}</span>
      <button onClick={ping} className="ml-2 px-2 py-1 rounded-lg border dual-btn text-xs">送出 ping</button>
    </div>
  )
}
