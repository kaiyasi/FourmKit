import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRole, getSchoolId, isLoggedIn } from '@/utils/auth'
import ChatPanel from '@/components/ChatPanel'
import { Building2, Users, MessageSquare, ArrowLeft, Shield, Globe, Code, Loader2, User, Eye, Plus, Settings, MoreVertical } from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

interface ChatRoom {
  id: string
  name: string
  description: string
  icon: any
  accessRoles: string[]
  schoolSpecific?: boolean
}

interface OnlineUser {
  id: number
  username: string
  role: string
  school_id?: number
  client_id: string
}

export default function AdminChatPage() {
  const navigate = useNavigate()
  const role = getRole()
  const schoolId = getSchoolId()
  const [selectedRoom, setSelectedRoom] = useState<string>('')
  const [availableRooms, setAvailableRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [showOnlineUsers, setShowOnlineUsers] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)

  // 載入聊天室列表
  const loadRooms = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/admin/chat-rooms', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const rooms = data.rooms.map((room: any) => ({
          id: room.id,
          name: room.name,
          description: room.description,
          icon: getRoomIcon(room.id),
          accessRoles: room.access_roles,
          schoolSpecific: room.school_specific,
          onlineCount: room.online_count || 0
        }))
        setAvailableRooms(rooms)

        // 依身份自動選擇房間：校內管理員/校內版主 → 默認選自己學校的管理員聊天室
        if (rooms.length > 0) {
          const role = String(data.user_role || '').trim()
          const schoolId = Number(data.user_school_id || 0) || null
          let picked: string | null = null
          if ((role === 'campus_admin' || role === 'campus_moderator') && schoolId) {
            const m = (data.rooms || []).find((r: any) => r.school_specific && Number(r.school_id || 0) === schoolId)
            if (m) picked = m.id
          }
          if (!picked) picked = rooms[0]?.id || null
          if (picked && picked !== selectedRoom) setSelectedRoom(picked)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || '無法載入聊天室列表')
      }
    } catch (error) {
      console.error('Error fetching chat rooms:', error)
      setError('網路連線錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/auth')
      return
    }

    loadRooms()
  }, [navigate])

  // 當選擇的聊天室改變時，載入線上用戶
  useEffect(() => {
    if (selectedRoom) {
      loadOnlineUsers()
    }
  }, [selectedRoom])

  // 定期刷新線上用戶列表
  useEffect(() => {
    if (!selectedRoom) return

    const interval = setInterval(() => {
      loadOnlineUsers()
    }, 10000) // 每10秒刷新一次

    return () => clearInterval(interval)
  }, [selectedRoom])

  const loadOnlineUsers = async () => {
    if (!selectedRoom) return

    try {
      setLoadingUsers(true)
      const response = await fetch(`/api/admin/chat-rooms/${selectedRoom}/users`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setOnlineUsers(data.online_users || [])
      } else if (response.status === 404) {
        // 如果聊天室不存在，清空選擇並重新載入聊天室列表
        console.warn('Chat room not found, clearing selection')
        setSelectedRoom('')
        setOnlineUsers([])
        // 重新載入聊天室列表
        loadRooms()
      } else {
        console.error('Failed to load online users')
      }
    } catch (error) {
      console.error('Error loading online users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  // 點擊外部關閉設定選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.settings-menu')) {
        setShowSettingsMenu(false)
      }
    }

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSettingsMenu])

  // 根據聊天室 ID 獲取對應的圖標
  const getRoomIcon = (roomId: string) => {
    if (roomId.startsWith('admin_campus:')) return Building2
    if (roomId.startsWith('custom:')) return MessageSquare
    switch (roomId) {
      case 'admin_global':
        return Globe
      case 'admin_cross':
        return Shield
      case 'admin_dev':
        return Code
      default:
        return MessageSquare
    }
  }

  const getRoleDisplayName = (role: string) => {
    const roleNames: Record<string, string> = {
      'dev_admin': '開發人員',
      'campus_admin': '校內管理員',
      'cross_admin': '跨校管理員',
      'campus_moderator': '校內審核',
      'cross_moderator': '跨校審核',
      'user': '一般用戶'
    }
    return roleNames[role] || role
  }

  const selectedRoomData = availableRooms.find(room => room.id === selectedRoom)

  const canCreateRoom = role === 'dev_admin' || role === 'campus_admin'

  const deleteRoom = async () => {
    if (!canCreateRoom || !selectedRoom.startsWith('custom:')) return
    if (!confirm('確定要刪除此自訂聊天室？')) return
    try {
      const r = await fetch(`/api/admin/chat-rooms/custom/${encodeURIComponent(selectedRoom)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }
      })
      if (!r.ok) throw new Error(await r.text())
      setSelectedRoom('')
      // 重新載入聊天室列表
      await loadRooms()
    } catch (e) { 
      console.error('刪除聊天室失敗:', e)
      alert('刪除聊天室失敗，請稍後再試')
    }
  }

  const addMember = async () => {
    if (!canCreateRoom || !selectedRoom.startsWith('custom:')) return
    const uid = prompt('輸入要加入的使用者 ID')
    if (!uid) return
    try {
      const r = await fetch(`/api/admin/chat-rooms/custom/${encodeURIComponent(selectedRoom)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')||''}` },
        body: JSON.stringify({ user_id: Number(uid) })
      })
      if (!r.ok) throw new Error(await r.text())
      alert('已加入成員')
      // 重新載入線上用戶列表
      await loadOnlineUsers()
    } catch (e) { 
      console.error('添加成員失敗:', e)
      alert('添加成員失敗，請稍後再試')
    }
  }

  const removeMember = async () => {
    if (!canCreateRoom || !selectedRoom.startsWith('custom:')) return
    const uid = prompt('輸入要移除的使用者 ID')
    if (!uid) return
    try {
      const r = await fetch(`/api/admin/chat-rooms/custom/${encodeURIComponent(selectedRoom)}/members/${encodeURIComponent(String(uid))}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }
      })
      if (!r.ok) throw new Error(await r.text())
      alert('已移除成員')
      // 重新載入線上用戶列表
      await loadOnlineUsers()
    } catch (e) { 
      console.error('移除成員失敗:', e)
      alert('移除成員失敗，請稍後再試')
    }
  }

  if (!isLoggedIn()) {
    return null
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/chat" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁面標題 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">管理員聊天室</h1>
          <p className="text-sm text-muted mt-1">選擇聊天室與其他管理員交流</p>
        </div>

        {loading ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 text-muted animate-spin" />
            <h3 className="text-lg font-semibold text-fg mb-2">載入中...</h3>
            <p className="text-muted">正在載入聊天室列表</p>
          </div>
        ) : error ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted" />
            <h3 className="text-lg font-semibold text-fg mb-2">載入失敗</h3>
            <p className="text-muted mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              重新載入
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 聊天室列表側邊欄 */}
            <div className="lg:col-span-1">
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-fg">聊天室列表</h3>
                  {canCreateRoom && (
                    <button
                      onClick={() => navigate('/admin/chat/create')}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      建立聊天室
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {availableRooms.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted" />
                      <p className="text-sm text-muted">無可用聊天室</p>
                    </div>
                  ) : (
                    availableRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => setSelectedRoom(room.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all ${
                          selectedRoom === room.id
                            ? 'bg-primary text-white shadow-md'
                            : 'bg-surface-hover hover:bg-surface-hover/80 text-fg hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            selectedRoom === room.id 
                              ? 'bg-white/20' 
                              : 'bg-surface'
                          }`}>
                            <room.icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{room.name}</div>
                            <div className={`text-xs truncate ${
                              selectedRoom === room.id 
                                ? 'opacity-80' 
                                : 'text-muted'
                            }`}>
                              {room.description}
                            </div>
                          </div>
                          {/* 線上用戶數量 */}
                          <div className="text-xs text-muted">
                            {room.onlineCount || 0} 在線
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 聊天面板和線上用戶 */}
            <div className="lg:col-span-3">
              {selectedRoomData ? (
                <div className="space-y-4">
                  {/* 聊天面板 */}
                  <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
                                         <div className="p-4 border-b border-border">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                           <div className="p-2 rounded-lg bg-primary/10">
                             <selectedRoomData.icon className="w-5 h-5 text-primary" />
                           </div>
                           <div>
                             <h3 className="font-semibold text-fg">{selectedRoomData.name}</h3>
                             <p className="text-sm text-muted">{selectedRoomData.description}</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-2">
                           <button
                             onClick={() => setShowOnlineUsers(!showOnlineUsers)}
                             className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border hover:bg-surface/80 transition-colors"
                           >
                             <Eye className="w-4 h-4" />
                             {showOnlineUsers ? '隱藏' : '顯示'}線上用戶
                           </button>
                           {canCreateRoom && selectedRoom.startsWith('custom:') && (
                             <div className="relative settings-menu">
                               <button
                                 onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                                 className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border hover:bg-surface/80 transition-colors"
                               >
                                 <Settings className="w-4 h-4" />
                                 設定
                                 <MoreVertical className="w-3 h-3" />
                               </button>
                               {showSettingsMenu && (
                                 <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg z-10 min-w-48">
                                   <div className="p-2">
                                     <button
                                       onClick={() => {
                                         addMember()
                                         setShowSettingsMenu(false)
                                       }}
                                       className="w-full text-left px-3 py-2 text-sm rounded hover:bg-surface-hover transition-colors"
                                     >
                                       加入成員
                                     </button>
                                     <button
                                       onClick={() => {
                                         removeMember()
                                         setShowSettingsMenu(false)
                                       }}
                                       className="w-full text-left px-3 py-2 text-sm rounded hover:bg-surface-hover transition-colors"
                                     >
                                       移除成員
                                     </button>
                                     <div className="border-t border-border my-1"></div>
                                     <button
                                       onClick={() => {
                                         deleteRoom()
                                         setShowSettingsMenu(false)
                                       }}
                                       className="w-full text-left px-3 py-2 text-sm rounded hover:bg-red-500/10 text-red-600 transition-colors"
                                     >
                                       刪除聊天室
                                     </button>
                                   </div>
                                 </div>
                               )}
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                    <ChatPanel 
                      room={selectedRoom} 
                      title={selectedRoomData.name}
                      subtitle={selectedRoomData.description}
                    />
                  </div>

                  {/* 線上用戶面板 */}
                  {showOnlineUsers && (
                    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-fg">線上用戶</h3>
                        <div className="flex items-center gap-2">
                          {loadingUsers && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
                          <span className="text-sm text-muted">
                            {onlineUsers.length + 1} 人在線
                          </span>
                        </div>
                      </div>
                      
                      {onlineUsers.length === 0 ? (
                        <div className="text-center py-8">
                          <User className="w-8 h-8 mx-auto mb-2 text-muted" />
                          <p className="text-sm text-muted">目前沒有其他用戶在線</p>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          {onlineUsers.map((user) => (
                            <div key={user.client_id} className="flex items-center gap-3 p-2 rounded-lg bg-surface-hover">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-fg truncate">{user.username}</div>
                                <div className="text-xs text-muted">{getRoleDisplayName(user.role)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-soft">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted" />
                  <h3 className="text-lg font-semibold text-fg mb-2">無可用聊天室</h3>
                  <p className="text-muted">您目前沒有權限訪問任何聊天室</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
