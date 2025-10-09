import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { UserPlus, Shield, Key, Save, X, CheckCircle, Mail, Trash2, Edit, Users, Filter, ArrowLeft, MoreVertical, Calendar, Building2, Crown, UserCheck, AlertTriangle, Globe, Activity, MessageSquare, FileText, Star, Clock, User, Unlock, Lock } from 'lucide-react'
import { formatLocalMinute } from '@/utils/time'
import { getRoleDisplayName, Role } from '@/utils/auth'

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
  personal_id: string
  post_count: number
  comment_count: number
  emoji_reaction_count: number
  recent_ips: string[]
  client_ids: string[]
  last_activity?: string
  is_premium: boolean
  premium_until?: string
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
  const [showActivityModal, setShowActivityModal] = useState<{ user: User, activities: any[] } | null>(null)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [ipStatus, setIpStatus] = useState<Record<number, boolean>>({})
  const [suspendStatus, setSuspendStatus] = useState<Record<number, boolean>>({})

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const roles = [
    { value: 'user', label: '一般用戶', icon: UserCheck, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    { value: 'campus_moderator', label: '校內審核', icon: Shield, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    { value: 'cross_moderator', label: '跨校審核', icon: Shield, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    { value: 'campus_admin', label: '校內板主', icon: Crown, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    { value: 'cross_admin', label: '跨校板主', icon: Crown, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
    { value: 'dev_admin', label: '開發人員', icon: Crown, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
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
        // 預取前幾位使用者的 IP 封鎖狀態（避免每張卡片都各打一次）
        try {
          const first = (Array.isArray(j?.items) ? j.items : []).slice(0, 12) as User[]
          first.forEach(async (u) => {
            try {
              const resp = await fetch(`/api/admin/users/ip-status?user_id=${u.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
              const data = await resp.json().catch(()=>({}))
              if (data?.ok) setIpStatus(prev => ({ ...prev, [u.id]: Boolean(data.blocked) }))
            } catch {}
            try {
              const r2 = await fetch(`/api/admin/users/suspend-status?user_id=${u.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
              const d2 = await r2.json().catch(()=>({}))
              if (d2?.ok) setSuspendStatus(prev => ({ ...prev, [u.id]: Boolean(d2.suspended) }))
            } catch {}
          })
        } catch {}
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
      // 先嘗試普通刪除
      let response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        }
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ msg: '刪除失敗' }))

        // 如果有關聯資料，詢問是否強制刪除
        if (error.msg && error.msg.includes('存在關聯資料')) {
          const forceDelete = confirm(
            '該用戶有相關的貼文或留言。是否強制刪除？\n這將同時刪除該用戶的所有內容。'
          )

          if (forceDelete) {
            response = await fetch(`/api/admin/users/${userId}?force=1`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')||''}`
              }
            })

            if (!response.ok) {
              throw new Error(await response.text())
            }
          } else {
            return
          }
        } else {
          throw new Error(error.msg || '刪除失敗')
        }
      }

      setMessage('用戶刪除成功')
      load()
    } catch (e: any) {
      setMessage(e?.message || '用戶刪除失敗')
    }
  }

  const unblockUserIP = async (userId: number, username: string) => {
    if (!confirm(`確定要解除 ${username} 的 IP 限制嗎？`)) {
      return
    }

    try {
      const response = await fetch('/api/admin/users/unblock-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ user_id: userId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'IP 解除失敗')
      }

      setMessage(`${username} 的 IP 限制已解除`)
      setIpStatus(prev => ({ ...prev, [userId]: false }))
    } catch (e: any) {
      setMessage(e?.message || 'IP 解除失敗')
    }
  }

  const blockUserIP = async (userId: number, username: string) => {
    if (!confirm(`確定要封鎖 ${username} 的最近活動 IP 嗎？`)) return

    const durationInput = prompt('輸入封鎖時長（小時，可留空使用預設 24 小時）', '24')
    let durationHours: number | undefined
    if (durationInput !== null && durationInput.trim() !== '') {
      const parsed = Number(durationInput.trim())
      if (!Number.isFinite(parsed) || parsed <= 0) {
        alert('封鎖時長必須是正數')
        return
      }
      durationHours = parsed
    }

    try {
      const payload: Record<string, unknown> = { user_id: userId, all: true }
      if (durationHours !== undefined) {
        payload.duration_hours = durationHours
      }
      const response = await fetch('/api/admin/users/block-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify(payload)
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '封鎖失敗')
      const ttlSeconds = Number(result.ttl_seconds || 0)
      let humanDuration = ''
      if (ttlSeconds > 0) {
        const hours = ttlSeconds / 3600
        if (hours >= 24 && hours % 24 === 0) {
          humanDuration = `（約 ${hours / 24} 天）`
        } else if (hours >= 1) {
          humanDuration = `（約 ${Math.round(hours * 10) / 10} 小時）`
        } else {
          const minutes = Math.max(1, Math.round(ttlSeconds / 60))
          humanDuration = `（約 ${minutes} 分鐘）`
        }
      }
      setMessage(`${username} 的最近 IP 已封鎖${humanDuration}`)
      setIpStatus(prev => ({ ...prev, [userId]: true }))
    } catch (e:any) {
      setMessage(e?.message || '封鎖失敗')
    }
  }

  const toggleSuspendUser = async (user: User) => {
    const suspended = suspendStatus[user.id] === true
    const confirmText = suspended
      ? `確定要取消註銷 ${user.username} 嗎？帳號將恢復可登入。`
      : `確定要註銷 ${user.username} 嗎？將封鎖其 Email 與最近活動 IP，並禁止登入。`
    if (!confirm(confirmText)) return
    try {
      const url = suspended ? '/api/admin/users/unsuspend' : '/api/admin/users/suspend'
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ user_id: user.id })
      })
      const data = await resp.json().catch(()=>({}))
      if (!resp.ok || !data?.ok) throw new Error(data?.error || '操作失敗')
      setSuspendStatus(prev => ({ ...prev, [user.id]: !suspended }))
      setMessage(suspended ? `已取消註銷 ${user.username}` : `已註銷 ${user.username}`)
    } catch (e:any) {
      setMessage(e?.message || '操作失敗')
    }
  }

  useEffect(() => { load() }, [])

  const getRoleInfo = (role: string) => {
    return roles.find(r => r.value === role) || roles[0]
  }

  // 解析用戶代理字串，提取重要資訊
  const parseUserAgent = (userAgent: string) => {
    try {
      // 基本資訊提取
      const browser = userAgent.includes('Chrome') ? 'Chrome' :
                     userAgent.includes('Firefox') ? 'Firefox' :
                     userAgent.includes('Safari') ? 'Safari' :
                     userAgent.includes('Edge') ? 'Edge' :
                     userAgent.includes('Opera') ? 'Opera' : 'Unknown'
      
      const os = userAgent.includes('Windows') ? 'Windows' :
                 userAgent.includes('Mac') ? 'macOS' :
                 userAgent.includes('Linux') ? 'Linux' :
                 userAgent.includes('Android') ? 'Android' :
                 userAgent.includes('iOS') ? 'iOS' : 'Unknown'
      
      // 提取版本號
      const browserVersion = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/)?.[2] || 'Unknown'
      
      // 提取系統版本
      const osVersion = userAgent.match(/(Windows NT|Mac OS X|Linux|Android|iPhone OS)\s*([\d._]+)/)?.[2] || 'Unknown'
      
      return {
        browser,
        browserVersion,
        os,
        osVersion,
        full: userAgent
      }
    } catch (e) {
      return {
        browser: 'Unknown',
        browserVersion: 'Unknown',
        os: 'Unknown',
        osVersion: 'Unknown',
        full: userAgent
      }
    }
  }

  const loadUserActivity = async (user: User) => {
    try {
      setLoadingActivities(true)
      const response = await fetch(`/api/admin/users/${user.id}/activity`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }
      })
      if (response.ok) {
        const data = await response.json()
        setShowActivityModal({ user, activities: data.activities })
      } else {
        setMessage('載入活動記錄失敗')
      }
    } catch (error) {
      setMessage('載入活動記錄失敗')
    } finally {
      setLoadingActivities(false)
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/users" />
      <MobileBottomNav />
      
      <main
        className={`mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8 ${showActivityModal ? 'pointer-events-none' : ''}`}
        aria-hidden={showActivityModal ? true : false}
      >
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
                className="form-control flex-1"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && (
            <div className="col-span-full p-8 text-center text-muted">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              載入中...
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="col-span-full p-8 text-center text-muted">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              {query ? '找不到符合條件的用戶' : '尚無用戶資料'}
            </div>
          )}

          {!loading && items.length > 0 && items.map((user) => {
            const roleInfo = getRoleInfo(user.role)
            const RoleIcon = roleInfo.icon

            return (
              <div key={user.id} className="bg-surface border border-border rounded-2xl p-4 shadow-soft hover:shadow-medium transition-all duration-200 hover:scale-[1.02] flex flex-col h-full">
                {/* 用戶頭像和基本資訊 */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-semibold text-lg">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-fg truncate text-lg flex items-center gap-2">
                      {user.username}
                      {user.is_premium && (
                        <span className="inline-flex items-center" title={`會員 ${user.premium_until ? `至 ${formatLocalMinute(user.premium_until)}` : '永久'}`}>
                          <Star className="w-4 h-4 text-amber-500 fill-current" />
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted truncate flex items-center gap-1 mt-1">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                    <div className="text-xs text-muted font-mono bg-surface-hover px-2 py-1 rounded mt-2 inline-block">
                      ID: {user.personal_id}
                    </div>
                  </div>
                </div>

                {/* 角色標籤 */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${roleInfo.color}`}>
                    <RoleIcon className="w-3 h-3 inline mr-1" />
                    {roleInfo.label}
                  </span>
                </div>

                {/* 學校資訊 */}
                <div className="flex items-center gap-2 text-sm text-muted mb-3">
                  <Building2 className="w-3 h-3" />
                  {user.school?.name || '無'}
                </div>

                {/* 用戶統計資訊 */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <FileText className="w-3 h-3" />
                    {user.post_count} 篇貼文
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <MessageSquare className="w-3 h-3" />
                    {user.comment_count} 則留言
                  </div>
                </div>

                {/* 最近活動 */}
                <div className="flex items-center gap-1 text-xs text-muted mb-3">
                  <Activity className="w-3 h-3" />
                  最後活動 {user.last_activity ? formatLocalMinute(user.last_activity) : '無記錄'}
                </div>

                {/* 註冊時間 */}
                <div className="flex items-center gap-2 text-sm text-muted mb-4">
                  <Calendar className="w-3 h-3" />
                  註冊於 {formatLocalMinute(user.created_at)}
                </div>

                {/* IP地址資訊 */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 text-xs text-muted mb-1">
                    <Globe className="w-3 h-3" />
                    最新IP地址：
                  </div>
                  <div className="text-xs font-mono bg-surface-hover px-2 py-1 rounded">
                    {user.recent_ips.length > 0 ?
                      `${user.recent_ips[0]}${user.recent_ips.length > 1 ? `(+${user.recent_ips.length - 1}個)` : ''}` :
                      '無記錄'
                    }
                  </div>
                </div>

                {/* 操作按鈕 - 使用 flex-1 確保按鈕等寬並對齊底部 */}
                <div className="space-y-2 mt-auto">
                  {/* 角色調整 */}
                  <select
                    value={user.role}
                    onChange={(e) =>updateUserRole(user.id, e.target.value)}
                    className="form-control text-sm w-full"
                    title="調整權限"
                  >
                    {roles.map(role => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>

                  {/* 學校綁定 */}
                  <select
                    value={user.school?.slug || ''}
                    onChange={(e) =>updateUserSchool(user.id, e.target.value)}
                    className="form-control text-sm w-full"
                    title="學校綁定"
                  >
                    {schools.map(school => (
                      <option key={school.value} value={school.value}>
                        {school.label}
                      </option>
                    ))}
                  </select>

                  {/* 快速操作按鈕 */}
                  <div className="grid grid-cols-2 gap-1 pt-2">
                    <button
                      onClick={() => loadUserActivity(user)}
                      disabled={(suspendStatus[user.id]===true) || (user.username==='Kaiyasi') || loadingActivities}
                      className="btn-secondary flex items-center justify-center gap-1 px-2 py-1.5 text-xs disabled:opacity-50"
                      title="查看詳細資訊"
                    >
                      <Activity className="w-3 h-3" />
                      詳細資訊
                    </button>

                    <button
                      onClick={async () => {
                        const newEmail = prompt(`為 ${user.username} 設定新 Email`, user.email)
                        if (!newEmail || newEmail === user.email) return
                        await updateUserEmail(user.id, newEmail)
                      }}
                      disabled={(suspendStatus[user.id]===true) || (user.username==='Kaiyasi')}
                      className="btn-secondary flex items-center justify-center gap-1 px-2 py-1.5 text-xs disabled:opacity-50"
                      title="修改 Email"
                    >
                      <Mail className="w-3 h-3" />
                      Email
                    </button>

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
                      className="btn-secondary flex items-center justify-center gap-1 px-2 py-1.5 text-xs"
                      title="重設密碼"
                    >
                      <Key className="w-3 h-3" />
                      密碼
                    </button>

                    {(() => {
                      const blocked = ipStatus[user.id] === true
                      const disabled = (suspendStatus[user.id]===true) || (user.username==='Kaiyasi')
                      return (
                        <button
                          onClick={() => blocked ? unblockUserIP(user.id, user.username) : blockUserIP(user.id, user.username)}
                          disabled={disabled}
                          className={`px-2 py-1.5 text-xs rounded-lg border flex items-center justify-center gap-1 ${blocked ? 'text-green-700 border-green-300 hover:bg-green-50' : 'text-red-600 border-red-300 hover:bg-red-50'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={blocked ? '解除 IP 限制' : '封鎖最近 IP'}
                        >
                          {blocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {blocked ? '解鎖IP' : '封鎖IP'}
                        </button>
                      )
                    })()}

                    <button
                      onClick={() => deleteUser(user.id)}
                      disabled={(suspendStatus[user.id]===true) || (user.username==='Kaiyasi')}
                      className="px-2 py-1.5 text-xs rounded-lg border text-red-600 border-red-300 hover:bg-red-50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                      title="刪除帳號（資料完全刪除）"
                    >
                      <Trash2 className="w-3 h-3" />
                      刪除帳號
                    </button>
                    <button
                      onClick={() => toggleSuspendUser(user)}
                      disabled={user.username === 'Kaiyasi'}
                      className={`px-2 py-1.5 text-xs rounded-lg border transition-colors flex items-center justify-center gap-1 ${ (suspendStatus[user.id]===true) ? 'text-green-700 border-green-300 hover:bg-green-50' : 'text-amber-700 border-amber-300 hover:bg-amber-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={user.username === 'Kaiyasi' ? '特殊帳號不可註銷' : ((suspendStatus[user.id]===true) ? '取消註銷（恢復帳號）' : '註銷帳號（封鎖 Email + 最近 IP）')}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {(suspendStatus[user.id]===true) ? '取消註銷' : '註銷帳號'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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

      {/* 詳細資訊模態框 */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-6xl max-h-[90vh] shadow-dramatic overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold dual-text flex items-center gap-2">
                {showActivityModal.user.username}
                {showActivityModal.user.is_premium && (
                  <span className="inline-flex items-center" title={`會員 ${showActivityModal.user.premium_until ? `至 ${formatLocalMinute(showActivityModal.user.premium_until)}` : '永久'}`}>
                    <Star className="w-5 h-5 text-amber-500 fill-current" />
                  </span>
                )}
                的詳細資訊
              </h2>
              <button
                onClick={() => setShowActivityModal(null)}
                className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* 用戶基本資訊卡片 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-surface-hover rounded-xl p-4 border border-border">
                <h3 className="font-semibold text-fg mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  基本資訊
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">用戶名：</span>
                    <span className="font-medium">{showActivityModal.user.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Email：</span>
                    <span className="font-medium">{showActivityModal.user.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">個人ID：</span>
                    <span className="font-mono text-xs">{showActivityModal.user.personal_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">角色：</span>
                    <span className="font-medium">{getRoleDisplayName(showActivityModal.user.role as Role)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">學校：</span>
                    <span className="font-medium">{showActivityModal.user.school?.name || '無'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">註冊時間：</span>
                    <span className="font-medium">{formatLocalMinute(showActivityModal.user.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">最後活動：</span>
                    <span className="font-medium">{showActivityModal.user.last_activity ? formatLocalMinute(showActivityModal.user.last_activity) : '無記錄'}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-surface-hover rounded-xl p-4 border border-border">
                <h3 className="font-semibold text-fg mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  統計資訊
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">發文次數：</span>
                    <span className="font-medium">{showActivityModal.user.post_count} 篇</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">留言次數：</span>
                    <span className="font-medium">{showActivityModal.user.comment_count} 則</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">表符互動：</span>
                    <span className="font-medium">{showActivityModal.user.emoji_reaction_count} 次</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">會員狀態：</span>
                    <span className="font-medium">
                      {showActivityModal.user.role === 'dev_admin'
                        ? '不適用'
                        : (showActivityModal.user.is_premium
                            ? `會員 ${showActivityModal.user.premium_until ? `至 ${formatLocalMinute(showActivityModal.user.premium_until)}` : '永久'}`
                            : '一般用戶')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">IP地址數量：</span>
                    <span className="font-medium">{showActivityModal.user.recent_ips.length} 個</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">設備數量：</span>
                    <span className="font-medium">{showActivityModal.user.client_ids.length} 個</span>
                  </div>
                </div>
                
                {/* IP地址列表 */}
                <div className="mt-4">
                  <h4 className="font-medium text-fg mb-2 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    IP地址記錄
                  </h4>
                  <div className="space-y-1">
                    {showActivityModal.user.recent_ips.length > 0 ? (
                      showActivityModal.user.recent_ips.map((ip, index) => (
                        <div key={index} className="text-xs font-mono bg-surface px-2 py-1 rounded border">
                          {ip}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted bg-surface px-2 py-1 rounded border">
                        無記錄
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Client_ID 列表 */}
                <div className="mt-4">
                  <h4 className="font-medium text-fg mb-2 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    設備識別碼
                  </h4>
                  <div className="space-y-1">
                    {showActivityModal.user.client_ids.length > 0 ? (
                      showActivityModal.user.client_ids.map((client_id, index) => (
                        <div key={index} className="text-xs font-mono bg-surface px-2 py-1 rounded border">
                          {client_id}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted bg-surface px-2 py-1 rounded border">
                        無記錄
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-surface-hover rounded-xl p-4 border border-border overflow-y-auto max-h-[30vh] space-y-3">
              <h3 className="font-semibold text-fg mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                活動紀錄
              </h3>
              {showActivityModal.activities.length === 0 ? (
                <div className="text-center text-muted py-8">
                  暫無活動記錄
                </div>
              ) : (
                showActivityModal.activities.map((activity) => (
                  <div key={activity.id} className="bg-surface rounded-lg p-3 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-fg">{activity.title}</div>
                        <div className="text-sm text-muted mt-1">{activity.description}</div>
                      </div>
                      <div className="text-xs text-muted ml-2">
                        {formatLocalMinute(activity.created_at)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1 text-muted">
                        <Globe className="w-3 h-3" />
                        IP: {activity.client_ip || '無記錄'}
                      </div>
                      <div className="flex items-center gap-1 text-muted">
                        <Activity className="w-3 h-3" />
                        <span className="truncate" title={activity.user_agent || '無記錄'}>
                          {activity.user_agent || '無記錄'}
                        </span>
                      </div>
                    </div>
                    
                    {/* 用戶代理詳細資訊 */}
                    {activity.user_agent && (
                      <div className="mt-2 p-2 bg-surface rounded border border-border/50">
                        <div className="text-xs font-medium text-muted mb-1">用戶代理：</div>
                        {(() => {
                          const uaInfo = parseUserAgent(activity.user_agent)
                          return (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-muted">瀏覽器：</span>
                                  <span className="font-medium">{uaInfo.browser} {uaInfo.browserVersion}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted">作業系統：</span>
                                  <span className="font-medium">{uaInfo.os} {uaInfo.osVersion}</span>
                                </div>
                              </div>
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted hover:text-fg">完整用戶代理字串</summary>
                                <div className="mt-1 p-2 bg-surface-hover rounded font-mono text-muted break-all">
                                  {uaInfo.full}
                                </div>
                              </details>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                    
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <div className="mt-2 p-2 bg-surface rounded border border-border/50">
                        <div className="text-xs font-medium text-muted mb-1">詳細資訊：</div>
                        <pre className="text-xs text-muted overflow-x-auto">
                          {JSON.stringify(activity.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )))
              }
              <div className="h-4" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
