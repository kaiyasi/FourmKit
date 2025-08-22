import { getSocket } from './socket'

type Message = { room: string; message: string; client_id?: string; ts?: string }

const joined = new Map<string, { clientId: string }>()

export function joinRoom(room: string, clientId: string, opts?: {
  onBacklog?: (messages: Message[]) => void
  onPresence?: (count: number) => void
  onMessage?: (msg: Message) => void
  onError?: (err: { room?: string; error: string }) => void
}) {
  const s = getSocket()
  const onBacklog = (payload: any) => {
    if (payload?.room === room) opts?.onBacklog?.(payload.messages || [])
  }
  const onPresence = (payload: any) => {
    if (payload?.room === room) opts?.onPresence?.(Number(payload.count || 0))
  }
  const onMsg = (payload: any) => {
    if (payload?.room === room) opts?.onMessage?.(payload as Message)
  }
  const onErr = (payload: any) => {
    if (!payload || (payload.room && payload.room !== room)) return
    opts?.onError?.({ room: payload.room, error: String(payload.error || 'UNKNOWN') })
  }

  s.on('room.backlog', onBacklog)
  s.on('room.presence', onPresence)
  s.on('chat.message', onMsg)
  s.on('room.error', onErr)

  // 記住以便重連時自動加入
  joined.set(room, { clientId })

  s.emit('room.join', { room, client_id: clientId })

  // 自動重連後重加入
  const rejoin = () => {
    const rec = joined.get(room)
    if (rec) s.emit('room.join', { room, client_id: rec.clientId })
  }
  s.on('connect', rejoin)

  // 回傳清理函數
  return () => {
    s.off('room.backlog', onBacklog)
    s.off('room.presence', onPresence)
    s.off('chat.message', onMsg)
    s.off('room.error', onErr)
    s.off('connect', rejoin)
  }
}

export function leaveRoom(room: string, clientId: string) {
  const s = getSocket()
  s.emit('room.leave', { room, client_id: clientId })
  joined.delete(room)
}

export function sendMessage(room: string, message: string, clientId: string) {
  const s = getSocket()
  s.emit('chat.send', { room, message, client_id: clientId })
}

export function onRoomMessage(handler: (msg: Message) => void) {
  const s = getSocket()
  const fn = (payload: any) => handler(payload as Message)
  s.on('chat.message', fn)
  return () => s.off('chat.message', fn)
}
