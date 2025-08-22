import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'

export default function ChatPage() {
  const [room, setRoom] = useState('lobby')
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28">
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold dual-text mb-2">聊天室示範</h1>
          <p className="text-sm text-muted">輸入任意房間名稱（建議使用 post:&lt;id&gt; 格式）</p>
          <div className="mt-3 flex items-center gap-2">
            <input className="form-control text-sm" value={room} onChange={e=>setRoom(e.target.value)} placeholder="room name" />
          </div>
        </div>
        <ChatPanel room={room || 'lobby'} />
      </main>
    </div>
  )
}

