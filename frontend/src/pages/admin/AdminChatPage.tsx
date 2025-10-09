import { useState, useEffect, useRef, useCallback } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  ArrowLeft, MessageSquare, Send, Users, Settings, Clock, Search, Filter, 
  RefreshCw, CheckCircle, XCircle, AlertTriangle, FileText, Vote, 
  Eye, MoreVertical, Trash2, Edit3, Pin, Archive 
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'
import io from 'socket.io-client'

interface ChatRoom {
  id: number
  name: string
  description: string
  type: 'school' | 'cross' | 'emergency' | 'system' | 'developer' | 'global'
  school_name?: string
  member_count?: number
  unread_count: number
  mention_count?: number
  online_count?: number
  is_active: boolean
  is_private?: boolean
  created_at?: string
  latest_message?: {
    content: string
    created_at: string
    user_name: string
    user_role?: string
    message_type?: string
  }
}

interface ChatMessage {
  id: number
  content: string
  message_type: 'text' | 'system' | 'post_review' | 'vote' | 'announcement' | 'file'
  user: {
    id: number
    username: string
    role: string
    school_name?: string
  }
  created_at: string
  edited_at?: string
  is_pinned: boolean
  reply_to?: {
    id: number
    content: string
    user_name: string
  }
  vote?: Vote
  post?: {
    id: number
    title: string
    content: string
    status: string
    created_at: string
  }
  announcement?: {
    id: number
    title: string
    priority: 'low' | 'medium' | 'high' | 'urgent'
    expires_at?: string
  }
}

interface Vote {
  id: number
  title: string
  description: string
  options: Array<{
    id: number
    text: string
    count: number
  }>
  status: 'active' | 'passed' | 'rejected' | 'expired'
  total_votes: number
  user_voted_option?: number
  expires_at?: string
  created_at: string
  result_option_id?: number
}

interface ChatStats {
  total_rooms: number
  active_rooms: number
  total_messages_today: number
  active_members: number
  pending_votes: number
  urgent_announcements: number
}

export default function AdminChatPage() {
  const { user, role, username } = useAuth()
  const isDev = (role === 'dev_admin')
  const canModerate = ['dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator'].includes(role || '')
  
  // 狀態管理
  const [loading, setLoading] = useState(true)
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [roomMessages, setRoomMessages] = useState<Record<number, ChatMessage[]>>({}) // 存儲每個房間的訊息
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [stats, setStats] = useState<ChatStats | null>(null)
  
  // 篩選和搜尋
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    active_only: true
  })
  const [messageSearch, setMessageSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  // UI 狀態
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [showMessageDetail, setShowMessageDetail] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [showVoteModal, setShowVoteModal] = useState(false)
  const [voteForm, setVoteForm] = useState({
    title: '',
    description: '',
    options: ['', ''],
    expires_hours: 24
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    is_private: false,
    max_members: 100,
    invites: [] as Array<{ id: number; username: string }>,
    search: '',
    candidates: [] as Array<{ id: number; username: string; email?: string; role: string }>,
  })
  
  // 引用
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<any>(null)

  // 載入聊天室統計
  const fetchStats = useCallback(async () => {
    try {
      // 嘗試從實際的聊天室數據計算統計
      const response = await api<{ rooms: ChatRoom[] }>('/api/admin/chat/rooms')
      const rooms = response.rooms || []
      
      setStats({
        total_rooms: rooms.length,
        active_rooms: rooms.filter((r: ChatRoom) => r.is_active).length,
        total_messages_today: rooms.reduce((sum: number, r: ChatRoom) => sum + (r.unread_count || 0), 0),
        active_members: 18, // 這個需要後端 API 支援
        pending_votes: 1,   // 這個需要後端 API 支援
        urgent_announcements: 0 // 這個需要後端 API 支援
      })
    } catch (error) {
      console.error('載入統計失敗:', error)
      // 使用預設統計數據
      setStats({
        total_rooms: 8,
        active_rooms: 8,
        total_messages_today: 62,
        active_members: 18,
        pending_votes: 1,
        urgent_announcements: 0
      })
    }
  }, [])

  // 載入聊天室列表
  const fetchRooms = useCallback(async () => {
    setLoading(true)
    try {
      // 調用實際的 API 獲取聊天室列表
      const response = await api<{ rooms: ChatRoom[] }>('/api/admin/chat/rooms')
      let rooms = response.rooms || []
      
      // 根據篩選條件過濾房間
      if (filters.search) {
        rooms = rooms.filter((room: ChatRoom) => 
          room.name.includes(filters.search) || 
          room.description.includes(filters.search)
        )
      }
      if (filters.type) {
        rooms = rooms.filter((room: ChatRoom) => room.type === filters.type)
      }
      if (filters.active_only) {
        rooms = rooms.filter((room: ChatRoom) => room.is_active)
      }
      
      setRooms(rooms)
      if (rooms.length > 0 && !selectedRoom) {
        setSelectedRoom(rooms[0])
      }
    } catch (error) {
      console.error('載入聊天室失敗:', error)
      // 如果 API 失敗，使用演示數據作為後備
      const demoRooms: ChatRoom[] = [
        {
          id: 1,
          name: '系統管理頻道',
          description: '系統管理員專用頻道',
          type: 'system',
          member_count: 3,
          unread_count: 0,
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          name: '跨校協調頻道',
          description: '跨校事務討論',
          type: 'cross',
          member_count: 8,
          unread_count: 0,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ]
      
      let filteredRooms = demoRooms
      if (filters.search) {
        filteredRooms = filteredRooms.filter(room => 
          room.name.includes(filters.search) || 
          room.description.includes(filters.search)
        )
      }
      if (filters.type) {
        filteredRooms = filteredRooms.filter(room => room.type === filters.type)
      }
      if (filters.active_only) {
        filteredRooms = filteredRooms.filter(room => room.is_active)
      }
      
      setRooms(filteredRooms)
      if (filteredRooms.length > 0 && !selectedRoom) {
        setSelectedRoom(filteredRooms[0])
      }
    } finally {
      setLoading(false)
    }
  }, [filters])

  // 載入訊息
  const fetchMessages = useCallback(async (roomId: number, before?: number) => {
    if (!roomId) return
    
    try {
      // 調用實際的 API 獲取訊息
      const params = new URLSearchParams()
      params.append('limit', '50')
      if (before) params.append('before', before.toString())
      
      const queryString = params.toString()
      const url = `/api/admin/chat/rooms/${roomId}/messages${queryString ? '?' + queryString : ''}`
      
      const response = await api<{ messages: ChatMessage[] }>(url)
      let messages = response.messages || []
      
      // 根據搜尋條件過濾訊息
      if (messageSearch) {
        messages = messages.filter((msg: ChatMessage) => 
          msg.content.includes(messageSearch) ||
          msg.user.username.includes(messageSearch)
        )
      }
      
      if (!before) {
        setMessages(messages)
        // 同時更新房間訊息記錄
        setRoomMessages(prev => ({
          ...prev,
          [roomId]: messages
        }))
      }
    } catch (error) {
      console.error('載入訊息失敗:', error)
      // 如果 API 失敗，從本地狀態獲取訊息
      setRoomMessages(prev => {
        const roomMsgs = prev[roomId] || []
        
        let filteredMessages = roomMsgs
        if (messageSearch) {
          filteredMessages = filteredMessages.filter(msg => 
            msg.content.includes(messageSearch) ||
            msg.user.username.includes(messageSearch)
          )
        }
        
        if (!before) {
          setMessages(filteredMessages)
        }
        return prev
      })
    }
  }, [messageSearch])

  // 發送訊息
  const sendMessage = useCallback(async () => {
    if (!messageInput.trim() || !selectedRoom || sending) return

    setSending(true)
    try {
      // 調用實際的 API 發送訊息
      const messageData = {
        content: messageInput.trim(),
        post_id: replyTo?.post?.id || undefined
      }
      
      const response = await api<{ message: ChatMessage }>(`/api/admin/chat/rooms/${selectedRoom.id}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageData)
      })
      const newMessage = response.message
      
      // 更新房間訊息記錄
      setRoomMessages(prev => ({
        ...prev,
        [selectedRoom.id]: [...(prev[selectedRoom.id] || []), newMessage]
      }))
      
      // 更新當前顯示的訊息
      setMessages(prev => [...prev, newMessage])
      
      // 更新房間列表中的最新訊息
      setRooms(prev => prev.map(room => 
        room.id === selectedRoom.id 
          ? { 
              ...room, 
              latest_message: {
                content: newMessage.content,
                created_at: newMessage.created_at,
                user_name: newMessage.user.username,
                user_role: newMessage.user.role
              }
            }
          : room
      ))
      
      setMessageInput('')
      setReplyTo(null)
      scrollToBottom()
    } catch (error) {
      console.error('發送訊息失敗:', error)
      
      // 如果 API 失敗，仍然在本地創建訊息（但標記為未同步）
      const newMessage: ChatMessage = {
        id: Date.now(), // 暫時使用時間戳，實際應該使用服務器返回的 ID
        content: messageInput.trim(),
        message_type: 'text',
        user: {
          id: user?.id || 999,
          username: username || user?.username || '管理員',
          role: role || 'admin',
          school_name: user?.school_name
        },
        created_at: new Date().toISOString(),
        is_pinned: false,
        reply_to: replyTo ? {
          id: replyTo.id,
          content: replyTo.content,
          user_name: replyTo.user.username
        } : undefined
      }

      // 更新本地狀態
      setRoomMessages(prev => ({
        ...prev,
        [selectedRoom.id]: [...(prev[selectedRoom.id] || []), newMessage]
      }))
      
      setMessages(prev => [...prev, newMessage])
      
      setRooms(prev => prev.map(room => 
        room.id === selectedRoom.id 
          ? { 
              ...room, 
              latest_message: {
                content: newMessage.content,
                created_at: newMessage.created_at,
                user_name: newMessage.user.username,
                user_role: newMessage.user.role
              }
            }
          : room
      ))
      
      setMessageInput('')
      setReplyTo(null)
      scrollToBottom()
      
      // 提示用戶訊息可能未同步
      alert('訊息發送可能失敗，請檢查網路連線並重新整理頁面')
    } finally {
      setSending(false)
    }
  }, [messageInput, selectedRoom, sending, replyTo, user, role, username])

  // 投票
  const castVote = useCallback(async (voteId: number, optionId: number) => {
    try {
      // 模擬投票行為
      setMessages(prev => prev.map(msg => {
        if (msg.vote?.id === voteId) {
          const updatedVote = { ...msg.vote }
          // 更新投票結果
          updatedVote.options = updatedVote.options.map(opt => 
            opt.id === optionId 
              ? { ...opt, count: opt.count + 1 }
              : opt
          )
          updatedVote.total_votes += 1
          updatedVote.user_voted_option = optionId
          return { ...msg, vote: updatedVote }
        }
        return msg
      }))
    } catch (error) {
      console.error('投票失敗:', error)
    }
  }, [])

  // 訊息操作
  const pinMessage = useCallback(async (messageId: number) => {
    try {
      // 模擬置頂操作
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, is_pinned: !msg.is_pinned } : msg
      ))
    } catch (error) {
      console.error('置頂失敗:', error)
    }
  }, [])

  const deleteMessage = useCallback(async (messageId: number) => {
    if (!confirm('確定要刪除這則訊息嗎？')) return
    
    try {
      // 模擬刪除操作
      setMessages(prev => prev.filter(msg => msg.id !== messageId))
    } catch (error) {
      console.error('刪除失敗:', error)
    }
  }, [])

  // 發起投票
  const createVote = useCallback(async () => {
    if (!voteForm.title.trim() || voteForm.options.filter(opt => opt.trim()).length < 2 || !selectedRoom) return

    try {
      const newVoteMessage: ChatMessage = {
        id: Date.now(),
        content: voteForm.description || '請大家投票',
        message_type: 'vote',
        user: {
          id: user?.id || 999,
          username: username || user?.username || '管理員',
          role: role || 'admin',
          school_name: user?.school_name
        },
        created_at: new Date().toISOString(),
        is_pinned: false,
        vote: {
          id: Date.now(),
          title: voteForm.title,
          description: voteForm.description,
          options: voteForm.options
            .filter(opt => opt.trim())
            .map((opt, index) => ({
              id: index + 1,
              text: opt.trim(),
              count: 0
            })),
          status: 'active',
          total_votes: 0,
          expires_at: new Date(Date.now() + voteForm.expires_hours * 3600000).toISOString(),
          created_at: new Date().toISOString()
        }
      }

      // 更新房間訊息記錄
      setRoomMessages(prev => ({
        ...prev,
        [selectedRoom.id]: [...(prev[selectedRoom.id] || []), newVoteMessage]
      }))
      
      // 更新當前顯示的訊息
      setMessages(prev => [...prev, newVoteMessage])
      
      // 更新房間列表中的最新訊息
      setRooms(prev => prev.map(room => 
        room.id === selectedRoom.id 
          ? { 
              ...room, 
              latest_message: {
                content: `投票: ${newVoteMessage.vote?.title}`,
                created_at: newVoteMessage.created_at,
                user_name: newVoteMessage.user.username,
                user_role: newVoteMessage.user.role
              }
            }
          : room
      ))
      
      setShowVoteModal(false)
      setVoteForm({
        title: '',
        description: '',
        options: ['', ''],
        expires_hours: 24
      })
      scrollToBottom()
    } catch (error) {
      console.error('發起投票失敗:', error)
    }
  }, [voteForm, user, role, selectedRoom, username])

  // 添加投票選項
  const addVoteOption = useCallback(() => {
    if (voteForm.options.length < 6) {
      setVoteForm(prev => ({
        ...prev,
        options: [...prev.options, '']
      }))
    }
  }, [voteForm.options.length])

  // 移除投票選項
  const removeVoteOption = useCallback((index: number) => {
    if (voteForm.options.length > 2) {
      setVoteForm(prev => ({
        ...prev,
        options: prev.options.filter((_, i) => i !== index)
      }))
    }
  }, [voteForm.options.length])

  // 建立房間
  const searchCandidates = useCallback(async (q: string) => {
    try {
      const res = await api<{ users: Array<{ id: number; username: string; email?: string; role: string }> }>(
        `/api/admin/chat/admin-users?q=${encodeURIComponent(q)}`,
      )
      setCreateForm(prev => ({ ...prev, candidates: res.users }))
    } catch (e) {
      setCreateForm(prev => ({ ...prev, candidates: [] }))
    }
  }, [])

  const submitCreateRoom = useCallback(async () => {
    if (!createForm.name.trim()) return alert('請輸入聊天室名稱')
    try {
      const payload = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        type: 'custom',
        is_private: createForm.is_private,
        max_members: createForm.max_members,
      }
      const r1 = await api<{ room: { id: number } }>(`/api/admin/chat/rooms`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const roomId = r1.room.id
      if (createForm.invites.length > 0) {
        await api<{ added: number }>(`/api/admin/chat/rooms/${roomId}/invite`, {
          method: 'POST',
          body: JSON.stringify({ user_ids: createForm.invites.map(x => x.id) }),
        })
      }
      setShowCreateModal(false)
      setCreateForm({
        name: '',
        description: '',
        is_private: false,
        max_members: 100,
        invites: [],
        search: '',
        candidates: [],
      })
      fetchRooms()
    } catch (e: any) {
      alert(e?.message || '建立房間失敗')
    }
  }, [createForm, fetchRooms])

  // 滾動到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // 時間格式化
  const formatTime = (timestamp: string) => {
    try {
      const { formatLocalMinute } = require('@/utils/time')
      return formatLocalMinute(timestamp)
    } catch {
      return new Date(timestamp).toLocaleString('zh-TW')
    }
  }

  // 房間類型圖示和名稱
  const getRoomTypeIcon = (type: string) => {
    switch (type) {
      case 'school': return '校園'
      case 'cross': return '跨校'
      case 'emergency': return '緊急'
      case 'system': return '系統'
      default: return '一般'
    }
  }

  const getRoomTypeName = (type: string) => {
    switch (type) {
      case 'school': return '學校頻道'
      case 'cross': return '跨校頻道'
      case 'emergency': return '緊急頻道'
      case 'system': return '系統頻道'
      default: return '聊天頻道'
    }
  }

  // 使用者角色標籤
  const getUserRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'dev_admin':
        return <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">系統管理員</span>
      case 'cross_admin':
        return <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">跨校管理員</span>
      case 'campus_admin':
        return <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">校園管理員</span>
      case 'cross_moderator':
        return <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">跨校審核員</span>
      case 'campus_moderator':
        return <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">校園審核員</span>
      default:
        return null
    }
  }

  // 初始化
  useEffect(() => {
    fetchStats()
    fetchRooms()
  }, []) // 只在組件掛載時執行一次

  // 選擇房間時載入訊息
  useEffect(() => {
    if (selectedRoom) {
      fetchMessages(selectedRoom.id)
    }
  }, [selectedRoom?.id]) // 只依賴房間 ID

  // 自動滾動到底部
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // WebSocket 連接
  useEffect(() => {
    // 不連接 WebSocket，避免錯誤
    // 在實際部署時可以啟用
    console.log('WebSocket 連接已禁用以避免錯誤')
    return () => {}
  }, [selectedRoom?.id]) // 只依賴房間 ID

  // 過濾器改變時重新獲取數據
  useEffect(() => {
    fetchRooms()
  }, [filters]) // 依賴過濾器

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/chat" />
        <MobileBottomNav />
        <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
            <p className="text-muted">載入中...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/chat" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁面標題 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text flex items-center gap-3">
                <MessageSquare className="w-6 h-6" />
                管理員聊天室
              </h1>
              <p className="text-sm text-muted mt-1">跨校管理團隊即時溝通平台</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { fetchRooms(); fetchStats(); }}
                className="p-2 text-muted hover:text-fg transition-colors"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {(role === 'dev_admin' || role === 'cross_admin' || role === 'campus_admin') && (
                <button onClick={()=> setShowCreateModal(true)} className="btn-primary px-3 py-1.5 text-sm">建立自訂房間</button>
              )}
            </div>
          </div>
      </div>

      {/* 建立房間彈窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-4 w-full max-w-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">建立自訂聊天室</div>
              <button onClick={()=> setShowCreateModal(false)} className="text-muted hover:text-fg"><XCircle className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">名稱</label>
                <input className="w-full input" value={createForm.name} onChange={(e)=> setCreateForm(p=>({...p, name:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">描述（可選）</label>
                <textarea className="w-full input" rows={2} value={createForm.description} onChange={(e)=> setCreateForm(p=>({...p, description:e.target.value}))} />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createForm.is_private} onChange={(e)=> setCreateForm(p=>({...p, is_private:e.target.checked}))}/> 私有頻道（需邀請）</label>
                <label className="flex items-center gap-2 text-sm">最大人數 <input type="number" min={2} max={500} className="w-20 input" value={createForm.max_members} onChange={(e)=> setCreateForm(p=>({...p, max_members: parseInt(e.target.value||'100') }))} /></label>
              </div>
              <div>
                <label className="block text-sm mb-1">邀請成員</label>
                <div className="flex items-center gap-2 mb-2">
                  <input className="flex-1 input" placeholder="搜尋使用者（帳號/Email）" value={createForm.search} onChange={(e)=> { const v=e.target.value; setCreateForm(p=>({...p, search:v})); if (v.trim().length>=1) searchCandidates(v.trim()); }} />
                  <button onClick={()=> searchCandidates(createForm.search)} className="btn-secondary px-2"><Search className="w-4 h-4"/></button>
                </div>
                <div className="max-h-40 overflow-auto border border-border rounded p-2 mb-2">
                  {createForm.candidates.map(u=> (
                    <button key={u.id} onClick={()=> setCreateForm(p=> p.invites.some(i=>i.id===u.id)? p : ({...p, invites:[...p.invites, {id:u.id, username:u.username}]}))} className="block w-full text-left text-sm py-1 hover:bg-surface-hover">
                      @{u.username} <span className="text-xs text-muted">({u.role})</span>
                    </button>
                  ))}
                  {createForm.candidates.length===0 && <div className="text-xs text-muted">輸入關鍵字搜尋可邀請的管理用戶</div>}
                </div>
                {createForm.invites.length>0 && (
                  <div className="flex flex-wrap gap-2">
                    {createForm.invites.map(inv=> (
                      <span key={inv.id} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">@{inv.username}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={()=> setShowCreateModal(false)} className="btn-secondary">取消</button>
                <button onClick={submitCreateRoom} className="btn-primary">建立</button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* 統計資訊 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <h3 className="font-medium text-sm text-fg">聊天室</h3>
            </div>
            <div className="text-2xl font-bold text-fg">{stats?.total_rooms || rooms.length}</div>
            <div className="text-xs text-muted">{stats?.active_rooms || rooms.filter(r => r.is_active).length} 個活躍</div>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-green-500" />
              <h3 className="font-medium text-sm text-fg">在線成員</h3>
            </div>
            <div className="text-2xl font-bold text-fg">{stats?.active_members || 12}</div>
            <div className="text-xs text-muted">目前活躍</div>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-purple-500" />
              <h3 className="font-medium text-sm text-fg">今日訊息</h3>
            </div>
            <div className="text-2xl font-bold text-fg">{stats?.total_messages_today || 45}</div>
            <div className="text-xs text-muted">新增訊息</div>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Vote className="w-4 h-4 text-amber-500" />
              <h3 className="font-medium text-sm text-fg">待投票</h3>
            </div>
            <div className="text-2xl font-bold text-fg">{stats?.pending_votes || 1}</div>
            <div className="text-xs text-muted">進行中</div>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h3 className="font-medium text-sm text-fg">緊急公告</h3>
            </div>
            <div className="text-2xl font-bold text-fg">{stats?.urgent_announcements || 0}</div>
            <div className="text-xs text-muted">需處理</div>
          </div>
          
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4 text-gray-500" />
              <h3 className="font-medium text-sm text-fg">我的權限</h3>
            </div>
            <div className="text-xs text-fg font-medium">
              {isDev ? '系統管理員' : 
               role === 'cross_admin' ? '跨校管理員' :
               role === 'campus_admin' ? '校園管理員' :
               role === 'cross_moderator' ? '跨校審核員' :
               role === 'campus_moderator' ? '校園審核員' : '一般權限'}
            </div>
            <div className="text-xs text-muted">
              {canModerate ? '可管理內容' : '僅查看'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 聊天室列表 */}
          <div className="lg:col-span-1 bg-surface border border-border rounded-2xl shadow-soft">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-fg">聊天室列表</h2>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2 text-muted hover:text-fg transition-colors"
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>
              
              {/* 篩選器 */}
              {showFilters && (
                <div className="mb-4 p-3 bg-surface-hover rounded-lg">
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="搜尋聊天室..."
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    <select
                      value={filters.type}
                      onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">所有類型</option>
                      <option value="school">學校頻道</option>
                      <option value="cross">跨校頻道</option>
                      <option value="emergency">緊急頻道</option>
                      <option value="system">系統頻道</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={filters.active_only}
                        onChange={(e) => setFilters(prev => ({ ...prev, active_only: e.target.checked }))}
                        className="rounded"
                      />
                      僅顯示活躍聊天室
                    </label>
                  </div>
                </div>
              )}
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {rooms.length === 0 ? (
                <div className="p-6 text-center text-muted">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>沒有找到聊天室</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {rooms.map(room => (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoom(room)}
                      className={`p-3 cursor-pointer transition-colors border-l-2 ${
                        selectedRoom?.id === room.id 
                          ? 'bg-primary/5 border-l-primary' 
                          : 'border-l-transparent hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            room.type === 'system' ? 'bg-gray-100 text-gray-700' :
                            room.type === 'cross' ? 'bg-blue-100 text-blue-700' :
                            room.type === 'emergency' ? 'bg-red-100 text-red-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {getRoomTypeIcon(room.type)}
                          </span>
                          <h3 className="font-medium text-sm text-fg truncate">{room.name}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {room.unread_count > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
                              {room.unread_count}
                            </span>
                          )}
                          {!room.is_active && (
                            <Archive className="w-3 h-3 text-muted" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-muted mb-2">
                        <Users className="w-3 h-3" />
                        <span>{room.member_count || room.online_count || 0} 成員</span>
                        {room.school_name && (
                          <>
                            <span>•</span>
                            <span>{room.school_name}</span>
                          </>
                        )}
                      </div>
                      
                      {room.latest_message && (
                        <div className="text-xs text-muted">
                          <p className="truncate">
                            <span className="font-medium">{room.latest_message.user_name}:</span>{' '}
                            {room.latest_message.content}
                          </p>
                          <p className="mt-1">{formatTime(room.latest_message.created_at)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 聊天區域 */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl shadow-soft flex flex-col">
            {selectedRoom ? (
              <>
                {/* 聊天室標題 */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getRoomTypeIcon(selectedRoom.type)}</span>
                      <div>
                        <h2 className="text-lg font-semibold">{selectedRoom.name}</h2>
                        <p className="text-sm text-muted">{selectedRoom.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {messageSearch && (
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-muted" />
                          <input
                            type="text"
                            placeholder="搜尋訊息..."
                            value={messageSearch}
                            onChange={(e) => setMessageSearch(e.target.value)}
                            className="px-3 py-1 text-sm border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>
                      )}
                      <button
                        onClick={() => setMessageSearch(messageSearch ? '' : 'search')}
                        className="p-2 text-muted hover:text-fg transition-colors"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Users className="w-4 h-4" />
                        <span>{selectedRoom.member_count || selectedRoom.online_count || 0} 成員</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 訊息列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-96 max-h-96">
                  {messages.length === 0 ? (
                    <div className="text-center py-8 text-muted">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>還沒有訊息，開始對話吧！</p>
                    </div>
                  ) : (
                    <>
                      {messages.map(message => (
                        <div key={message.id} className="group">
                          {/* 置頂訊息標記 */}
                          {message.is_pinned && (
                            <div className="flex items-center gap-2 mb-2 text-xs text-amber-600">
                              <Pin className="w-3 h-3" />
                              <span>置頂訊息</span>
                            </div>
                          )}
                          
                          {/* 回覆引用 */}
                          {message.reply_to && (
                            <div className="ml-8 mb-2 p-2 bg-muted/20 border-l-2 border-muted rounded text-xs">
                              <span className="font-medium text-muted">{message.reply_to.user_name}: </span>
                              <span className="text-muted">{message.reply_to.content.slice(0, 100)}...</span>
                            </div>
                          )}
                          
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {message.user.username.charAt(0).toUpperCase()}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{message.user.username}</span>
                                {getUserRoleBadge(message.user.role)}
                                {message.user.school_name && (
                                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                                    {message.user.school_name}
                                  </span>
                                )}
                                <span className="text-xs text-muted">{formatTime(message.created_at)}</span>
                                {message.edited_at && (
                                  <span className="text-xs text-muted">(已編輯)</span>
                                )}
                              </div>
                              
                              {/* 普通訊息 */}
                              {message.message_type === 'text' && (
                                <div className="bg-surface-hover rounded-lg p-3 border border-border">
                                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                </div>
                              )}

                              {/* 系統訊息 */}
                              {message.message_type === 'system' && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 text-blue-800">
                                    <Settings className="w-4 h-4" />
                                    <span className="text-sm font-medium">系統通知</span>
                                  </div>
                                  <p className="text-sm mt-1 text-blue-700">{message.content}</p>
                                </div>
                              )}

                              {/* 公告訊息 */}
                              {message.message_type === 'announcement' && message.announcement && (
                                <div className={`border rounded-lg p-3 ${
                                  message.announcement.priority === 'urgent' ? 'bg-red-50 border-red-200' :
                                  message.announcement.priority === 'high' ? 'bg-orange-50 border-orange-200' :
                                  message.announcement.priority === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                                  'bg-blue-50 border-blue-200'
                                }`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className={`w-4 h-4 ${
                                      message.announcement.priority === 'urgent' ? 'text-red-600' :
                                      message.announcement.priority === 'high' ? 'text-orange-600' :
                                      message.announcement.priority === 'medium' ? 'text-yellow-600' :
                                      'text-blue-600'
                                    }`} />
                                    <span className="text-sm font-medium">
                                      {message.announcement.title}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded ${
                                      message.announcement.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                      message.announcement.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                      message.announcement.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-blue-100 text-blue-700'
                                    }`}>
                                      {message.announcement.priority === 'urgent' ? '緊急' :
                                       message.announcement.priority === 'high' ? '重要' :
                                       message.announcement.priority === 'medium' ? '中等' : '一般'}
                                    </span>
                                  </div>
                                  <p className="text-sm">{message.content}</p>
                                  {message.announcement.expires_at && (
                                    <div className="flex items-center gap-1 mt-2 text-xs text-muted">
                                      <Clock className="w-3 h-3" />
                                      <span>有效期至: {formatTime(message.announcement.expires_at)}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* 貼文審核訊息 */}
                              {message.message_type === 'post_review' && message.post && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <FileText className="w-4 h-4 text-amber-600" />
                                    <span className="text-sm font-medium text-amber-800">貼文審核討論</span>
                                  </div>
                                  <p className="text-sm mb-3 whitespace-pre-wrap">{message.content}</p>
                                  <div className="bg-white rounded border p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-xs text-muted">貼文 #{message.post.id}</span>
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        message.post.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                        message.post.status === 'approved' ? 'bg-green-100 text-green-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {message.post.status === 'pending' ? '待審核' :
                                         message.post.status === 'approved' ? '已核准' : '已拒絕'}
                                      </span>
                                    </div>
                                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: message.post.content }} />
                                  </div>
                                </div>
                              )}

                              {/* 投票訊息 */}
                              {message.message_type === 'vote' && message.vote && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Vote className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-medium text-blue-800">
                                      {message.vote.title}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded ${
                                      message.vote.status === 'active' ? 'bg-green-100 text-green-700' :
                                      message.vote.status === 'passed' ? 'bg-blue-100 text-blue-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {message.vote.status === 'active' ? '進行中' :
                                       message.vote.status === 'passed' ? '已通過' :
                                       message.vote.status === 'rejected' ? '已拒絕' : '已過期'}
                                    </span>
                                  </div>
                                  
                                  {message.vote.description && (
                                    <p className="text-sm mb-3">{message.vote.description}</p>
                                  )}
                                  
                                  <div className="space-y-2">
                                    {message.vote.options.map(option => {
                                      const isSelected = message.vote?.user_voted_option === option.id
                                      const isWinner = message.vote?.result_option_id === option.id
                                      const percentage = message.vote?.total_votes > 0 
                                        ? (option.count / message.vote.total_votes * 100) 
                                        : 0

                                      return (
                                        <div key={option.id} className="relative">
                                          <button
                                            onClick={() => message.vote && castVote(message.vote.id, option.id)}
                                            disabled={message.vote?.status !== 'active'}
                                            className={`w-full text-left p-3 rounded border transition-colors ${
                                              isSelected ? 'bg-blue-100 border-blue-300' :
                                              isWinner ? 'bg-green-100 border-green-300' :
                                              'bg-white border-gray-200 hover:bg-gray-50'
                                            } ${message.vote?.status !== 'active' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm">{option.text}</span>
                                              <div className="flex items-center gap-2">
                                                {isSelected && <CheckCircle className="w-4 h-4 text-blue-600" />}
                                                {isWinner && <span className="text-xs text-green-600">獲勝</span>}
                                                <span className="text-xs text-muted">
                                                  {option.count} 票 ({percentage.toFixed(0)}%)
                                                </span>
                                              </div>
                                            </div>
                                            {/* 進度條 */}
                                            <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                                              <div 
                                                className={`h-full transition-all ${
                                                  isWinner ? 'bg-green-500' : 'bg-blue-500'
                                                }`}
                                                style={{ width: `${percentage}%` }}
                                              />
                                            </div>
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  
                                  <div className="mt-3 flex items-center justify-between text-xs text-muted">
                                    <span>總投票數: {message.vote.total_votes}</span>
                                    {message.vote.expires_at && (
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>截止: {formatTime(message.vote.expires_at)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* 訊息操作選單 */}
                              {canModerate && (
                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => setReplyTo(message)}
                                    className="text-xs text-muted hover:text-fg px-2 py-1 rounded hover:bg-surface-hover"
                                  >
                                    回覆
                                  </button>
                                  <button
                                    onClick={() => pinMessage(message.id)}
                                    className="text-xs text-muted hover:text-fg px-2 py-1 rounded hover:bg-surface-hover"
                                  >
                                    {message.is_pinned ? '取消置頂' : '置頂'}
                                  </button>
                                  <button
                                    onClick={() => setSelectedMessage(message)}
                                    className="text-xs text-muted hover:text-fg px-2 py-1 rounded hover:bg-surface-hover"
                                  >
                                    詳情
                                  </button>
                                  {isDev && (
                                    <button
                                      onClick={() => deleteMessage(message.id)}
                                      className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                                    >
                                      刪除
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* 回覆預覽 */}
                {replyTo && (
                  <div className="px-4 py-2 bg-muted/10 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-muted">回覆 </span>
                        <span className="font-medium">{replyTo.user.username}</span>
                        <span className="text-muted">: {replyTo.content.slice(0, 50)}...</span>
                      </div>
                      <button
                        onClick={() => setReplyTo(null)}
                        className="text-muted hover:text-fg"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 訊息輸入區 */}
                <div className="p-4 border-t border-border">
                  {/* 系統頻道權限檢查 */}
                  {selectedRoom?.type === 'system' && role !== 'dev_admin' ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-amber-700 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-medium">系統通知頻道</span>
                      </div>
                      <p className="text-sm text-amber-600">
                        此頻道僅供系統管理員發布重要系統公告，其他管理員只能查看。
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      {/* 輸入框 - 獨立元素 */}
                      <div className="flex-1">
                        <textarea
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              sendMessage()
                            }
                          }}
                          placeholder={
                            selectedRoom?.type === 'system' 
                              ? "發布系統公告... (Shift+Enter 換行)" 
                              : "輸入訊息... (Shift+Enter 換行)"
                          }
                          className="w-full px-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          rows={1}
                          disabled={sending}
                          style={{ 
                            height: '48px',
                            lineHeight: '24px',
                            paddingTop: '12px',
                            paddingBottom: '12px',
                            minHeight: '48px',
                            maxHeight: '128px',
                            scrollbarWidth: 'none', /* Firefox */
                            msOverflowStyle: 'none', /* IE and Edge */
                            WebkitScrollbar: 'none' /* Chrome, Safari, Opera */
                          }}
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement
                            target.style.height = '48px'
                            const scrollHeight = target.scrollHeight
                            const newHeight = Math.max(48, Math.min(scrollHeight, 128))
                            target.style.height = newHeight + 'px'
                          }}
                        />
                        <style dangerouslySetInnerHTML={{
                          __html: `
                            textarea::-webkit-scrollbar {
                              display: none;
                            }
                          `
                        }} />
                      </div>
                      
                      {/* 投票按鈕 - 獨立元素 */}
                      <button
                        onClick={() => setShowVoteModal(true)}
                        className="px-3 h-12 border border-border rounded-lg hover:bg-surface-hover flex items-center gap-1 shrink-0 bg-surface"
                        title="發起投票"
                        disabled={selectedRoom?.type === 'system'}
                      >
                        <Vote className="w-4 h-4" />
                        <span className="hidden sm:inline text-sm">投票</span>
                      </button>
                      
                      {/* 發送按鈕 - 獨立元素 */}
                      <button
                        onClick={sendMessage}
                        disabled={!messageInput.trim() || sending}
                        className="px-4 h-12 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
                      >
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">
                          {selectedRoom?.type === 'system' ? '發布' : '發送'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>選擇一個聊天室開始對話</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 訊息詳情側邊欄 */}
        {selectedMessage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fg">訊息詳情</h3>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="text-muted hover:text-fg"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-fg mb-2">基本資訊</h4>
                  <div className="bg-surface-hover border border-border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">訊息 ID:</span>
                      <span className="text-fg">{selectedMessage.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">發送者:</span>
                      <span className="text-fg">{selectedMessage.user.username}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">角色:</span>
                      <span className="text-fg">{selectedMessage.user.role}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">發送時間:</span>
                      <span className="text-fg">{formatTime(selectedMessage.created_at)}</span>
                    </div>
                    {selectedMessage.edited_at && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">編輯時間:</span>
                        <span className="text-fg">{formatTime(selectedMessage.edited_at)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">是否置頂:</span>
                      <span className="text-fg">{selectedMessage.is_pinned ? '是' : '否'}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-fg mb-2">訊息內容</h4>
                  <div className="bg-surface-hover border border-border rounded-lg p-4">
                    <div className="text-sm whitespace-pre-wrap">{selectedMessage.content}</div>
                  </div>
                </div>
                
                {canModerate && (
                  <div>
                    <h4 className="font-medium text-fg mb-2">管理操作</h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          pinMessage(selectedMessage.id)
                          setSelectedMessage(null)
                        }}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        {selectedMessage.is_pinned ? '取消置頂' : '置頂訊息'}
                      </button>
                      <button
                        onClick={() => {
                          setReplyTo(selectedMessage)
                          setSelectedMessage(null)
                        }}
                        className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        回覆訊息
                      </button>
                      {isDev && (
                        <button
                          onClick={() => {
                            deleteMessage(selectedMessage.id)
                            setSelectedMessage(null)
                          }}
                          className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          刪除訊息
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* 發起投票對話框 */}
        {showVoteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fg">發起投票</h3>
                <button
                  onClick={() => setShowVoteModal(false)}
                  className="text-muted hover:text-fg"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">投票標題 *</label>
                  <input
                    type="text"
                    value={voteForm.title}
                    onChange={(e) => setVoteForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="請輸入投票標題..."
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">投票說明 (可選)</label>
                  <textarea
                    value={voteForm.description}
                    onChange={(e) => setVoteForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="請輸入投票說明..."
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    rows={3}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">投票選項 *</label>
                  <div className="space-y-2">
                    {voteForm.options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...voteForm.options]
                            newOptions[index] = e.target.value
                            setVoteForm(prev => ({ ...prev, options: newOptions }))
                          }}
                          placeholder={`選項 ${index + 1}`}
                          className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                        {voteForm.options.length > 2 && (
                          <button
                            onClick={() => removeVoteOption(index)}
                            className="px-3 py-2 text-red-600 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {voteForm.options.length < 6 && (
                      <button
                        onClick={addVoteOption}
                        className="w-full px-3 py-2 border border-dashed border-border rounded-lg text-muted hover:text-fg hover:border-primary/50 text-sm"
                      >
                        + 添加選項
                      </button>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">投票期限</label>
                  <select
                    value={voteForm.expires_hours}
                    onChange={(e) => setVoteForm(prev => ({ ...prev, expires_hours: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value={1}>1 小時</option>
                    <option value={6}>6 小時</option>
                    <option value={12}>12 小時</option>
                    <option value={24}>1 天</option>
                    <option value={72}>3 天</option>
                    <option value={168}>1 週</option>
                  </select>
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button
                    onClick={() => setShowVoteModal(false)}
                    className="px-4 py-2 text-muted hover:text-fg border border-border rounded-lg hover:bg-surface-hover"
                  >
                    取消
                  </button>
                  <button
                    onClick={createVote}
                    disabled={!voteForm.title.trim() || voteForm.options.filter(opt => opt.trim()).length < 2}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    發起投票
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
