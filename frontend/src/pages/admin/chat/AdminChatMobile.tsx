import { useState, useEffect, useRef, useCallback } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { ArrowLeft, MessageSquare, Send } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'

interface ChatRoom {
  id: number
  name: string
  description: string
  type: 'school' | 'cross' | 'emergency' | 'system' | 'developer' | 'global' | 'custom'
  unread_count: number
  is_active: boolean
}

interface ChatMessage {
  id: number
  content: string
  message_type: 'text' | 'system' | 'post_review' | 'vote' | 'announcement' | 'file'
  user: { id: number; username: string; role: string }
  created_at: string
}

export default function AdminChatMobile() {
  const { role } = useAuth()
  const [loading, setLoading] = useState(true)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ rooms: ChatRoom[] }>(`/api/admin/chat/rooms`)
      const list = (res.rooms || []).filter(r => r.is_active)
      setRooms(list)
      if (!selectedRoom && list.length > 0) setSelectedRoom(list[0])
    } catch {
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [selectedRoom])

  const fetchMessages = useCallback(async (roomId: number) => {
    try {
      const res = await api<{ messages: ChatMessage[] }>(`/api/admin/chat/rooms/${roomId}/messages?limit=50`)
      setMessages(res.messages || [])
    } catch {
      setMessages([])
    }
  }, [])

  const sendMessage = useCallback(async () => {
    if (!selectedRoom || !messageInput.trim() || sending) return
    setSending(true)
    try {
      const res = await api<{ message: ChatMessage }>(`/api/admin/chat/rooms/${selectedRoom.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: messageInput.trim() })
      })
      const m = res.message
      setMessages(prev => [...prev, m])
      setMessageInput('')
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch {
      // no-op
    } finally {
      setSending(false)
    }
  }, [selectedRoom, messageInput, sending])

  useEffect(() => { fetchRooms() }, [])
  useEffect(() => { if (selectedRoom) fetchMessages(selectedRoom.id) }, [selectedRoom?.id])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  return (
    <div className="min-h-screen">
      <NavBar pathname="/m/admin/chat" />
      <MobileBottomNav />

      <main className="mx-auto max-w-7xl px-4 pt-14 pb-[var(--fk-bottomnav-offset)]">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => history.back()} className="text-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> 聊天室
          </h1>
        </div>

        {/* 房間清單 */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden mb-3 mobile-card">
          <div className="p-3 border-b border-border text-sm font-medium">聊天室列表</div>
          <div className="max-h-72 overflow-y-auto">
            {rooms.length === 0 && (
              <div className="p-4 text-center text-muted text-sm">沒有可用的聊天室</div>
            )}
            {rooms.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRoom(r)}
                className={`w-full p-3 text-left border-b border-border last:border-b-0 ${selectedRoom?.id === r.id ? 'bg-primary/5' : ''}`}
              >
                <div className="font-medium text-sm">{r.name}</div>
                {r.description && (
                  <div className="text-xs text-muted mt-0.5 whitespace-normal break-words">{r.description}</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 對話區 */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden mobile-card flex flex-col" style={{ height: 'calc(100dvh - var(--fk-bottomnav-offset, 64px) - 56px)' }}>
          <div className="p-3 border-b border-border">
            <div className="text-sm font-semibold">{selectedRoom ? selectedRoom.name : '請選擇聊天室'}</div>
            {selectedRoom?.description && (
              <div className="text-xs text-muted mt-0.5 whitespace-normal break-words">{selectedRoom.description}</div>
            )}
          </div>
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {(!selectedRoom || messages.length === 0) && (
              <div className="text-center text-muted text-sm">{selectedRoom ? '尚無訊息' : '尚未選擇聊天室'}</div>
            )}
            {messages.map(m => (
              <div key={m.id} className="bg-surface-hover border border-border rounded-lg p-2">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="font-medium">{m.user?.username || '用戶'}</span>
                  <span className="text-muted">{new Date(m.created_at).toLocaleString('zh-TW')}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 輸入列（併入卡片） */}
          <div className="p-3 border-t border-border">
            {selectedRoom?.type === 'system' && role !== 'dev_admin' ? (
              <div className="text-center text-xs text-amber-700">僅系統管理員可在此頻道發佈訊息</div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                  }}
                  placeholder={selectedRoom ? '輸入訊息…' : '請先選擇聊天室'}
                  className="flex-1 px-3 py-2 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary leading-6 max-h-32"
                  rows={1}
                  disabled={!selectedRoom || sending}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement
                    t.style.height = '0px'
                    t.style.height = Math.min(128, Math.max(40, t.scrollHeight)) + 'px'
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageInput.trim() || sending || !selectedRoom}
                  className="px-4 h-10 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span className="sr-only">發送</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
