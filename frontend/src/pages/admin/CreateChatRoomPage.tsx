import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRole, isLoggedIn } from '@/utils/auth'
import { ArrowLeft, MessageSquare, Users, Shield, Building2, Plus, X, Loader2, Check } from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

interface School {
  id: number
  name: string
  slug: string
}

interface User {
  id: number
  username: string
  role: string
  school_id?: number
  school?: {
    id: number
    name: string
    slug: string
  }
}

interface InviteTarget {
  type: 'role' | 'user' | 'school'
  id: string
  name: string
  description?: string
}

export default function CreateChatRoomPage() {
  const navigate = useNavigate()
  const role = getRole()
  
  // 表單狀態
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState('')
  const [roomType, setRoomType] = useState<'public' | 'private'>('public')
  
  // 邀請目標狀態
  const [inviteTargets, setInviteTargets] = useState<InviteTarget[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteType, setInviteType] = useState<'role' | 'user' | 'school'>('role')
  
  // 數據載入狀態
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])

  // 權限檢查
  const canCreateRoom = role === 'dev_admin' || role === 'campus_admin'

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/auth')
      return
    }

    if (!canCreateRoom) {
      navigate('/admin/chat')
      return
    }

    loadData()
  }, [navigate, canCreateRoom])

  // 載入學校和用戶數據
  const loadData = async () => {
    try {
      setLoading(true)
      
      // 載入學校列表
      const schoolsResponse = await fetch('/api/schools', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })
      if (schoolsResponse.ok) {
        const schoolsData = await schoolsResponse.json()
        setSchools(schoolsData.items || [])
      }

      // 載入用戶列表（僅管理員可見）
      const usersResponse = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })
      if (usersResponse.ok) {
        const usersData = await usersResponse.json()
        const userList = usersData.items || []
        setUsers(userList)
        setFilteredUsers(userList)
      }
    } catch (error) {
      console.error('載入數據失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  // 過濾用戶
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setFilteredUsers(users)
      return
    }

    const filtered = users.filter(user => 
      user.username.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      user.role.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (user.school && user.school.name.toLowerCase().includes(searchKeyword.toLowerCase()))
    )
    setFilteredUsers(filtered)
  }, [searchKeyword, users])

  // 添加邀請目標
  const addInviteTarget = (target: InviteTarget) => {
    const exists = inviteTargets.some(t => t.type === target.type && t.id === target.id)
    if (!exists) {
      setInviteTargets([...inviteTargets, target])
    }
    setShowInviteModal(false)
  }

  // 移除邀請目標
  const removeInviteTarget = (type: string, id: string) => {
    setInviteTargets(inviteTargets.filter(t => !(t.type === type && t.id === id)))
  }

  // 獲取角色顯示名稱
  const getRoleDisplayName = (role: string) => {
    const roleNames: Record<string, string> = {
      'dev_admin': '開發管理員',
      'campus_admin': '校內管理員',
      'cross_admin': '跨校管理員',
      'campus_moderator': '校內版主',
      'cross_moderator': '跨校版主',
      'user': '一般用戶'
    }
    return roleNames[role] || role
  }

  // 創建聊天室
  const createRoom = async () => {
    if (!roomName.trim()) {
      alert('請輸入聊天室名稱')
      return
    }

    try {
      setCreating(true)
      
      const payload = {
        name: roomName.trim(),
        description: roomDescription.trim() || undefined,
        room_type: roomType,
        invite_targets: inviteTargets
      }

      const response = await fetch('/api/admin/chat-rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const data = await response.json()
        alert('聊天室創建成功！')
        navigate('/admin/chat')
      } else {
        const errorData = await response.json()
        alert(errorData.error || '創建失敗')
      }
    } catch (error) {
      console.error('創建聊天室失敗:', error)
      alert('創建失敗，請稍後再試')
    } finally {
      setCreating(false)
    }
  }

  if (!isLoggedIn()) {
    return null
  }

  if (!canCreateRoom) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/chat/create" />
        <MobileBottomNav />
        <main className="mx-auto max-w-4xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
          <div className="bg-surface border border-border rounded-2xl p-8 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted" />
            <h3 className="text-lg font-semibold text-fg mb-2">權限不足</h3>
            <p className="text-muted mb-4">您沒有權限創建聊天室</p>
            <button
              onClick={() => navigate('/admin/chat')}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              返回聊天室
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/chat/create" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-4xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁面標題 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/admin/chat')}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回聊天室
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">建立聊天室</h1>
          <p className="text-sm text-muted mt-1">創建新的聊天室並邀請指定成員</p>
        </div>

        {loading ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 text-muted animate-spin" />
            <h3 className="text-lg font-semibold text-fg mb-2">載入中...</h3>
            <p className="text-muted">正在載入數據</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 基本資訊 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <h3 className="text-lg font-semibold text-fg mb-4">基本資訊</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    聊天室名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="輸入聊天室名稱"
                    className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    maxLength={50}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    描述
                  </label>
                  <textarea
                    value={roomDescription}
                    onChange={(e) => setRoomDescription(e.target.value)}
                    placeholder="輸入聊天室描述（可選）"
                    className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                    rows={3}
                    maxLength={200}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    聊天室類型
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="public"
                        checked={roomType === 'public'}
                        onChange={(e) => setRoomType(e.target.value as 'public' | 'private')}
                        className="text-primary"
                      />
                      <span>公開</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="private"
                        checked={roomType === 'private'}
                        onChange={(e) => setRoomType(e.target.value as 'public' | 'private')}
                        className="text-primary"
                      />
                      <span>私密</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 邀請成員 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fg">邀請成員</h3>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  添加邀請
                </button>
              </div>

              {inviteTargets.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted" />
                  <p className="text-muted">尚未添加任何邀請</p>
                  <p className="text-sm text-muted mt-1">點擊上方按鈕添加邀請對象</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inviteTargets.map((target, index) => (
                    <div key={`${target.type}-${target.id}`} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {target.type === 'role' && <Shield className="w-4 h-4 text-primary" />}
                          {target.type === 'user' && <Users className="w-4 h-4 text-primary" />}
                          {target.type === 'school' && <Building2 className="w-4 h-4 text-primary" />}
                        </div>
                        <div>
                          <div className="font-medium text-fg">{target.name}</div>
                          <div className="text-sm text-muted">{target.description}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeInviteTarget(target.type, target.id)}
                        className="p-1 text-muted hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-4">
              <button
                onClick={() => navigate('/admin/chat')}
                className="flex-1 px-6 py-3 border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                取消
              </button>
              <button
                onClick={createRoom}
                disabled={creating || !roomName.trim()}
                className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    創建中...
                  </>
                ) : (
                  <>
                    創建聊天室
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 邀請模態框 */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fg">添加邀請</h3>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-1 text-muted hover:text-fg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 邀請類型選擇 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-fg mb-2">邀請類型</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="role"
                      checked={inviteType === 'role'}
                      onChange={(e) => setInviteType(e.target.value as 'role' | 'user' | 'school')}
                      className="text-primary"
                    />
                    <span>角色組</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="user"
                      checked={inviteType === 'user'}
                      onChange={(e) => setInviteType(e.target.value as 'role' | 'user' | 'school')}
                      className="text-primary"
                    />
                    <span>指定用戶</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="school"
                      checked={inviteType === 'school'}
                      onChange={(e) => setInviteType(e.target.value as 'role' | 'user' | 'school')}
                      className="text-primary"
                    />
                    <span>學校</span>
                  </label>
                </div>
              </div>

              {/* 角色組選擇 */}
              {inviteType === 'role' && (
                <div className="space-y-2">
                  <h4 className="font-medium text-fg">選擇角色組</h4>
                  {[
                    { id: 'dev_admin', name: '開發管理員', description: '系統開發管理員' },
                    { id: 'campus_admin', name: '校內管理員', description: '各校管理員' },
                    { id: 'cross_admin', name: '跨校管理員', description: '跨校管理員' },
                    { id: 'campus_moderator', name: '校內版主', description: '各校版主' },
                    { id: 'cross_moderator', name: '跨校版主', description: '跨校版主' }
                  ].map(role => (
                    <button
                      key={role.id}
                      onClick={() => addInviteTarget({
                        type: 'role',
                        id: role.id,
                        name: role.name,
                        description: role.description
                      })}
                      className="w-full text-left p-3 rounded-lg border hover:bg-surface-hover transition-colors"
                    >
                      <div className="font-medium text-fg">{role.name}</div>
                      <div className="text-sm text-muted">{role.description}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* 用戶選擇 */}
              {inviteType === 'user' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">搜尋用戶</label>
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="輸入用戶名、角色或學校"
                      className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {filteredUsers.map(user => (
                      <button
                        key={user.id}
                        onClick={() => addInviteTarget({
                          type: 'user',
                          id: user.id.toString(),
                          name: user.username,
                          description: `${getRoleDisplayName(user.role)}${user.school ? ` - ${user.school.name}` : ''}`
                        })}
                        className="w-full text-left p-3 rounded-lg border hover:bg-surface-hover transition-colors"
                      >
                        <div className="font-medium text-fg">{user.username}</div>
                        <div className="text-sm text-muted">
                          {getRoleDisplayName(user.role)}
                          {user.school && ` - ${user.school.name}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 學校選擇 */}
              {inviteType === 'school' && (
                <div className="space-y-2">
                  <h4 className="font-medium text-fg">選擇學校</h4>
                  {schools.map(school => (
                    <button
                      key={school.id}
                      onClick={() => addInviteTarget({
                        type: 'school',
                        id: school.id.toString(),
                        name: school.name,
                        description: `邀請 ${school.name} 的所有管理員和版主`
                      })}
                      className="w-full text-left p-3 rounded-lg border hover:bg-surface-hover transition-colors"
                    >
                      <div className="font-medium text-fg">{school.name}</div>
                      <div className="text-sm text-muted">邀請該校所有管理員和版主</div>
                    </button>
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
