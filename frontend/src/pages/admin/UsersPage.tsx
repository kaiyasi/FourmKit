import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import { UserPlus, Search, Shield, Key, Save, X, CheckCircle, Mail, Trash2, Edit, Users, Filter, ArrowLeft } from 'lucide-react'
import { getRoleDisplayName } from '@/utils/auth'

interface User {
  id: number
  username: string
  email: string
  role: string
  school_id?: number
  school?: {
    id: number
    slug: string
    name: string
  }
  created_at: string
}

interface NewUser {
  username: string
  email: string
  password: string
  role: string
  school_slug?: string
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUser, setNewUser] = useState<NewUser>({
    username: '',
    email: '',
    password: '',
    role: 'user',
    school_slug: ''
  })
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({
    email: '',
    password: '',
    role: 'user'
  })

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const roles = [
    { value: 'user', label: '一般用戶' },
    { value: 'campus_moderator', label: '校內審核' },
    { value: 'cross_moderator', label: '跨校審核' },
    { value: 'campus_admin', label: '校內板主' },
    { value: 'cross_admin', label: '跨校板主' },
    { value: 'dev_admin', label: '開發人員' },
  ]

  const [schools, setSchools] = useState([
    { value: '', label: '無特定學校' },
    { value: 'ncku', label: '國立成功大學' },
    { value: 'ntu', label: '國立台灣大學' },
  ])

  // 載入學校列表
  const loadSchools = async () => {
    try {
      const response = await fetch('/api/schools')
      if (response.ok) {
        const data = await response.json()
        const schoolOptions = [
          { value: '', label: '無特定學校' },
          ...data.items.map((school: any) => ({
            value: school.slug,
            label: school.name
          }))
        ]
        setSchools(schoolOptions)
      }
    } catch (error) {
      console.error('Failed to load schools:', error)
    }
  }

  useEffect(() => {
    loadSchools()
  }, [])

  const load = async () => {
    try {
      setLoading(true); setError(null)
      const r = await fetch(`/api/admin/users?query=${encodeURIComponent(query)}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
      if (r.ok) {
        const j = await r.json().catch(()=>({}))
        setItems(Array.isArray(j?.items) ? j.items : [])
      } else {
        setItems([])
      }
    } catch (e:any) {
      setError(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const createUser = async () => {
    try {
      setCreating(true)
      setMessage(null)
      
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify(newUser)
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setMessage('帳號創建成功')
      setShowCreateForm(false)
      setNewUser({
        username: '',
        email: '',
        password: '',
        role: 'user',
        school_slug: ''
      })
      load()
    } catch (e: any) {
      setMessage(e?.message || '創建失敗')
    } finally {
      setCreating(false)
    }
  }

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let password = ''
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewUser({ ...newUser, password })
  }

  const updateUserSchool = async (userId: number, schoolSlug: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/school`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ school_slug: schoolSlug || null })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.msg || '更新失敗')
      }

      setMessage('學校綁定更新成功')
      load()
    } catch (error: any) {
      setMessage(error.message || '更新失敗')
    }
  }

  const updateUserRole = async (userId: number, newRole: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ role: newRole })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setMessage('角色更新成功')
      load()
    } catch (e: any) {
      setMessage(e?.message || '角色更新失敗')
    }
  }

  const updateUserEmail = async (userId: number, newEmail: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ email: newEmail })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setMessage('Email 更新成功')
      load()
    } catch (e: any) {
      setMessage(e?.message || 'Email 更新失敗')
    }
  }

  const deleteUser = async (userId: number) => {
    if (!confirm('確定要刪除此用戶嗎？此操作無法復原。')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        }
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setMessage('用戶刪除成功')
      load()
    } catch (e: any) {
      setMessage(e?.message || '用戶刪除失敗')
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/users" />
      <MobileFabNav />
      
      <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">用戶管理</h1>
              <p className="text-sm text-muted mt-1">管理系統用戶帳號、角色和權限</p>
            </div>
            
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn-primary flex items-center gap-2 px-3 sm:px-4 py-2 whitespace-nowrap text-sm sm:text-base"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">新增用戶</span>
              <span className="sm:hidden">新增</span>
            </button>
          </div>
          
          {message && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              message.includes('失敗') 
                ? 'bg-red-50 text-red-700 border border-red-200' 
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {message}
            </div>
          )}
        </div>

        {/* 搜尋和篩選區 */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 搜尋框 */}
            <div className="relative flex-1">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜尋用戶名或電子郵件"
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            {/* 操作按鈕 */}
            <div className="flex gap-2">
              <button
                onClick={load}
                disabled={loading}
                className="btn-secondary px-4 py-2 whitespace-nowrap flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                {loading ? '搜尋中...' : '搜尋'}
              </button>
            </div>
          </div>
          
          {error && (
            <div className="mt-3 p-2 rounded bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* 用戶清單 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              載入中...
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.length === 0 ? (
                <div className="p-8 text-center text-muted">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  {query ? '找不到符合條件的用戶' : '尚無用戶資料'}
                </div>
              ) : (
                items.map((user) => (
                  <div key={user.id} className="p-4 hover:bg-surface-hover transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* 用戶資訊 */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-primary font-semibold text-lg">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-fg truncate">{user.username}</div>
                            <div className="text-sm text-muted truncate">{user.email}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 text-sm">
                          <span className="px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {getRoleDisplayName(user.role as any) || user.role}
                          </span>
                          <span className="text-muted">
                            註冊於 {new Date(user.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      
                      {/* 操作按鈕 */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 權限下拉選單 */}
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value)}
                          className="px-3 py-1.5 text-sm bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-[140px]"
                          title="調整權限"
                        >
                          {roles.map(role => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        
                        {/* 學校綁定下拉選單 */}
                        <select
                          value={user.school?.slug || ''}
                          onChange={(e) => updateUserSchool(user.id, e.target.value)}
                          className="px-3 py-1.5 text-sm bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-[140px]"
                          title="學校綁定"
                        >
                          {schools.map(school => (
                            <option key={school.value} value={school.value}>
                              {school.label}
                            </option>
                          ))}
                        </select>
                        
                        {/* Email 管理 */}
                        <button
                          onClick={async () => {
                            const newEmail = prompt(`為 ${user.username} 設定新 Email`, user.email)
                            if (!newEmail || newEmail === user.email) return
                            await updateUserEmail(user.id, newEmail)
                          }}
                          className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm whitespace-nowrap"
                          title="修改 Email"
                        >
                          <Mail className="w-3 h-3" />
                          Email
                        </button>
                        
                        {/* 密碼管理 */}
                        <button
                          onClick={async () => {
                            const p = prompt(`為 ${user.username} 設定新密碼（至少 8 碼）`)
                            if (!p) return
                            try {
                              await fetch(`/api/admin/users/${user.id}/set_password`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${localStorage.getItem('token')||''}`
                                },
                                body: JSON.stringify({ password: p })
                              })
                              setMessage('密碼更新成功')
                            } catch {
                              setMessage('密碼更新失敗')
                            }
                          }}
                          className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm whitespace-nowrap"
                          title="重設密碼"
                        >
                          <Key className="w-3 h-3" />
                          密碼
                        </button>
                        
                        {/* 刪除用戶 */}
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="px-3 py-1.5 text-sm rounded-lg border text-red-600 border-red-300 hover:bg-red-50 transition-colors"
                          title="刪除用戶"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {/* 新增用戶對話框 */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-dramatic">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold dual-text">新增用戶</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dual-text mb-2">用戶名</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="輸入用戶名"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium dual-text mb-2">電子郵件</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium dual-text mb-2">密碼</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    className="flex-1 p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="至少 8 碼"
                  />
                  <button
                    onClick={generatePassword}
                    className="btn-secondary px-3 py-3 whitespace-nowrap"
                  >
                    隨機生成
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium dual-text mb-2">角色</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {roles.map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium dual-text mb-2">所屬學校（可選）</label>
                <select
                  value={newUser.school_slug || ''}
                  onChange={e => setNewUser({ ...newUser, school_slug: e.target.value })}
                  className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {schools.map(school => (
                    <option key={school.value} value={school.value}>
                      {school.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="btn-secondary flex-1 py-2"
              >
                取消
              </button>
              <button
                onClick={createUser}
                disabled={creating || !newUser.username || !newUser.email || !newUser.password}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-2"
              >
                {creating ? (
                  '創建中...'
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    創建帳號
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
