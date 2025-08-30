import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface ChatMessage {
  id: number
  room_id: string
  user_id: number | null
  username: string | null
  client_id: string | null
  message: string
  message_type: string
  created_at: string
}

interface ChatRoom {
  id: string
  name: string
  description: string | null
  room_type: string
  owner_id: number | null
  school_id: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface ChatHistoryProps {
  roomId: string
  onLoadMore?: () => void
  className?: string
}

export function ChatHistory({ roomId, onLoadMore, className = "" }: ChatHistoryProps) {
  const { isLoggedIn } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [beforeId, setBeforeId] = useState<number | null>(null)

  const loadMessages = async (reset = false) => {
    if (!isLoggedIn || loading) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: reset ? '0' : offset.toString()
      })
      
      if (beforeId && !reset) {
        params.append('before_id', beforeId.toString())
      }

      const response = await fetch(`/api/chat/rooms/${roomId}/messages?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.ok) {
          const newMessages = data.messages || []
          setRoom(data.room)
          
          if (reset) {
            setMessages(newMessages)
            setOffset(50)
            setBeforeId(newMessages.length > 0 ? newMessages[newMessages.length - 1].id : null)
          } else {
            setMessages(prev => [...prev, ...newMessages])
            setOffset(prev => prev + 50)
            if (newMessages.length > 0) {
              setBeforeId(newMessages[newMessages.length - 1].id)
            }
          }
          
          setHasMore(newMessages.length === 50)
        }
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (roomId) {
      loadMessages(true)
    }
  }, [roomId])

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      loadMessages(false)
      onLoadMore?.()
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getMessageTypeClass = (messageType: string) => {
    switch (messageType) {
      case 'system':
        return 'text-blue-600 italic'
      case 'join':
        return 'text-green-600 text-sm'
      case 'leave':
        return 'text-red-600 text-sm'
      default:
        return ''
    }
  }

  if (!room) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-muted">載入中...</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 房間標題 */}
      <div className="bg-surface border-b border-border p-4">
        <h3 className="font-semibold text-lg">{room.name}</h3>
        {room.description && (
          <p className="text-sm text-muted mt-1">{room.description}</p>
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasMore && (
          <div className="text-center">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {loading ? '載入中...' : '載入更多歷史消息'}
            </button>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-sm">
                {message.username || message.client_id || '匿名'}
              </span>
              <span className="text-xs text-muted">
                {formatTime(message.created_at)}
              </span>
            </div>
            <div className={`pl-4 ${getMessageTypeClass(message.message_type)}`}>
              {message.message}
            </div>
          </div>
        ))}

        {messages.length === 0 && !loading && (
          <div className="text-center text-muted py-8">
            尚無聊天記錄
          </div>
        )}
      </div>
    </div>
  )
}
