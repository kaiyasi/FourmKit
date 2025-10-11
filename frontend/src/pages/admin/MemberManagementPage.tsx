import { useState, useEffect, useCallback } from 'react'
import { 
  Users, 
  Crown, 
  X, 
  Check, 
  Clock, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff,
  Calendar,
  DollarSign,
  Filter,
  RefreshCw,
  MessageSquare,
  Plus,
  ArrowLeft,
  FileText
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { formatLocalMinute } from '@/utils/time'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import UploadArea from '@/components/UploadArea'
import { postJSON, postFormData } from '@/lib/http'

interface User {
  id: number
  username: string
  email: string
  role: string
  school?: {
    id: number
    name: string
    slug: string
  }
  is_premium: boolean
  premium_until?: string
  created_at: string
}

interface Post {
  id: number
  content: string
  status: string
  author: {
    id: number
    username: string
  }
  created_at: string
  is_announcement: boolean
  is_advertisement: boolean
  excerpt: string
  school?: {
    name: string
  }
  comment_count: number
  like_count: number
}

/**
 *
 */
export default function MemberManagementPage() {
  const { isLoggedIn, role, username } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'posts'>('users')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterPremium, setFilterPremium] = useState('all')
  const [selectedItem, setSelectedItem] = useState<User | Post | null>(null)
  
  const [showAdForm, setShowAdForm] = useState(false)
  const [adContent, setAdContent] = useState('')
  const [adFiles, setAdFiles] = useState<File[]>([])
  const [adSubmitting, setAdSubmitting] = useState(false)

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/members', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('載入會員列表失敗')
      }
      
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error: any) {
      setMessage(error.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/advertisements', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('載入廣告貼文列表失敗')
      }
      
      const data = await response.json()
      setPosts(data.posts || [])
    } catch (error: any) {
      setMessage(error.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  const togglePremiumStatus = async (userId: number, isPremium: boolean) => {
    try {
      setSaving(true)
      const response = await fetch(`/api/admin/members/${userId}/premium`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ is_premium: !isPremium })
      })
      
      if (!response.ok) {
        throw new Error('更新會員狀態失敗')
      }
      
      setMessage('會員狀態已更新')
      loadMembers()
    } catch (error: any) {
      setMessage(error.message || '更新失敗')
    } finally {
      setSaving(false)
    }
  }

  const togglePostStatus = async (postId: number, currentStatus: string) => {
    try {
      setSaving(true)
      const newStatus = currentStatus === 'approved' ? 'rejected' : 'approved'
      const response = await fetch(`/api/admin/advertisements/${postId}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!response.ok) {
        throw new Error('更新貼文狀態失敗')
      }
      
      setMessage(`貼文已${newStatus === 'approved' ? '上架' : '下架'}`)
      loadPosts()
    } catch (error: any) {
      setMessage(error.message || '更新失敗')
    } finally {
      setSaving(false)
    }
  }

  const deletePost = async (postId: number) => {
    if (!confirm('確定要刪除這篇貼文嗎？此操作不可逆轉。')) {
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/admin/advertisements/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error('刪除貼文失敗')
      }
      
      setMessage('貼文已刪除')
      loadPosts()
      setSelectedItem(null)
    } catch (error: any) {
      setMessage(error.message || '刪除失敗')
    } finally {
      setSaving(false)
    }
  }

  const submitAdvertisement = async () => {
    if (!adContent.trim()) {
      setMessage('請輸入廣告內容')
      return
    }

    try {
      setAdSubmitting(true)
      
      if (adFiles.length > 0) {
        const fd = new FormData()
        fd.set('content', adContent.trim())
        fd.set('is_advertisement', 'true')
        adFiles.forEach(f => fd.append('files', f))
        
        await postFormData('/api/posts/with-media', fd)
      } else {
        await postJSON('/api/posts', {
          content: adContent.trim(),
          is_advertisement: true
        })
      }
      
      setMessage('廣告貼文已發布')
      setAdContent('')
      setAdFiles([])
      setShowAdForm(false)
      loadPosts()
    } catch (error: any) {
      setMessage(error.message || '發布失敗')
    } finally {
      setAdSubmitting(false)
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRole = filterRole === 'all' || user.role === filterRole
    
    const matchesPremium = filterPremium === 'all' || 
                          (filterPremium === 'premium' && user.is_premium) ||
                          (filterPremium === 'non_premium' && !user.is_premium)
    
    return matchesSearch && matchesRole && matchesPremium
  })

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.author.username.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  useEffect(() => {
    if (activeTab === 'users') {
      loadMembers()
    } else {
      loadPosts()
    }
  }, [activeTab, loadMembers, loadPosts])

  const getRoleDisplayName = (role: string) => {
    const roleNames: Record<string, string> = {
      'user': '一般用戶',
      'campus_moderator': '校內審核',
      'cross_moderator': '跨校審核',
      'campus_admin': '校內板主',
      'cross_admin': '跨校板主',
      'dev_admin': '開發人員',
      'commercial': '廣告專用'
    }
    return roleNames[role] || role
  }

  const getPremiumStatus = (user: User) => {
    if (user.role === 'dev_admin') return { isPremium: true, label: '不適用', icon: X }
    if (user.role === 'campus_admin' || user.role === 'cross_admin') return { isPremium: true, label: '管理組訂閱', icon: Crown }
    if (user.is_premium) {
      if (user.premium_until) {
        return { isPremium: true, label: `已訂閱 (至 ${formatLocalMinute(user.premium_until)})`, icon: Crown }
      }
      return { isPremium: true, label: '已訂閱', icon: Crown }
    }
    return { isPremium: false, label: '未訂閱', icon: X }
  }

  if (role !== 'dev_admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <X className="w-16 h-16 text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-fg mb-2">權限不足</h1>
          <p className="text-muted">只有開發人員可以訪問會員管理功能</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/member-management" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        
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
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">會員管理</h1>
            <p className="text-sm text-muted mt-1">管理會員訂閱狀態與貼文內容</p>
          </div>
        </div>

        
        {message && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-primary">{message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                {activeTab === 'users' ? (
                  <>
                    <Users className="w-5 h-5" />
                    會員列表
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    內容查詢與統計
                  </>
                )}
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>
              <div className="flex items-center gap-2">
                {activeTab === 'posts' && (
                  <button
                    onClick={() => setShowAdForm(true)}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
                  >
                    <Plus className="w-4 h-4 mr-1 inline" />
                    發布廣告
                  </button>
                )}
                <button
                  onClick={activeTab === 'users' ? loadMembers : loadPosts}
                  className="p-2 text-muted hover:text-fg transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            
            <div className="mb-4">
              <div className="flex space-x-1 bg-surface-hover rounded-lg p-1">
                <button
                  onClick={() => {
                    setActiveTab('users')
                    setSelectedItem(null)
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'users'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  <Users className="w-4 h-4 inline mr-2" />
                  會員管理
                </button>
                <button
                  onClick={() => {
                    setActiveTab('posts')
                    setSelectedItem(null)
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'posts'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  <FileText className="w-4 h-4 inline mr-2" />
                  內容查詢與統計
                </button>
              </div>
            </div>

            
            <div className="mb-4 p-3 bg-surface-hover rounded-lg">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1" />
                {activeTab === 'users' && (
                  <>
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="form-control text-sm"
                    >
                      <option value="all">所有角色</option>
                      <option value="user">一般用戶</option>
                      <option value="campus_moderator">校內審核</option>
                      <option value="cross_moderator">跨校審核</option>
                      <option value="campus_admin">校內板主</option>
                      <option value="cross_admin">跨校板主</option>
                      <option value="dev_admin">開發人員</option>
                      <option value="commercial">廣告專用</option>
                    </select>
                    <select
                      value={filterPremium}
                      onChange={(e) => setFilterPremium(e.target.value)}
                      className="form-control text-sm"
                    >
                      <option value="all">所有狀態</option>
                      <option value="premium">已訂閱</option>
                      <option value="non_premium">未訂閱</option>
                    </select>
                  </>
                )}
              </div>
            </div>

            
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted">載入中...</div>
              ) : activeTab === 'users' ? (
                filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted">沒有找到符合條件的用戶</div>
                ) : (
                  filteredUsers.map((user) => {
                    const premiumStatus = getPremiumStatus(user)
                    const PremiumIcon = premiumStatus.icon
                    
                    return (
                      <div
                        key={user.id}
                        className={`p-4 rounded-xl border border-border bg-surface-hover cursor-pointer transition-colors ${
                          selectedItem?.id === user.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setSelectedItem(user)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-fg">{user.username}</div>
                            <div className="text-sm text-muted">{user.email}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {getRoleDisplayName(user.role)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <PremiumIcon className={`w-4 h-4 ${premiumStatus.isPremium ? 'text-yellow-500' : 'text-muted'}`} />
                            <span className={premiumStatus.isPremium ? 'text-yellow-600' : 'text-muted'}>
                              {premiumStatus.label}
                            </span>
                          </div>
                          <div className="text-muted">
                            <Clock className="inline w-3 h-3 mr-1" />
                            {formatLocalMinute(user.created_at)}
                          </div>
                        </div>
                        {user.school && (
                          <div className="text-sm text-muted mt-1">
                            學校: {user.school.name}
                          </div>
                        )}
                      </div>
                    )
                  })
                )
              ) : (
                filteredPosts.length === 0 ? (
                  <div className="text-center py-8 text-muted">沒有找到符合條件的貼文</div>
                ) : (
                  filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      className={`p-4 rounded-xl border border-border bg-surface-hover cursor-pointer transition-colors ${
                        selectedItem?.id === post.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedItem(post)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            post.is_advertisement ? 'bg-yellow-100 text-yellow-800' :
                            post.is_announcement ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {post.is_advertisement ? '廣告' : post.is_announcement ? '公告' : '一般'}
                          </span>
                          <span className="text-xs text-muted">#{post.id}</span>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            post.status === 'approved' ? 'bg-green-100 text-green-800' :
                            post.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {post.status === 'approved' ? '已上架' :
                             post.status === 'rejected' ? '已下架' : '待審核'}
                          </span>
                        </div>
                        <span className="text-xs text-muted">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {formatLocalMinute(post.created_at)}
                        </span>
                      </div>
                      
                      <div className="mb-2 text-sm line-clamp-2">{post.excerpt || post.content}</div>
                      
                      <div className="flex items-center justify-between text-xs text-muted">
                        <div>
                          作者: {post.author.username}
                          {post.school && ` (${post.school.name})`}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {post.comment_count || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            ❤️ {post.like_count || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          
          <div className="space-y-6">
            
            {selectedItem && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">
                  {activeTab === 'users' ? '會員詳情' : '貼文詳情'}
                </h3>
                
                {activeTab === 'users' && 'username' in selectedItem ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">用戶名稱</div>
                      <div className="text-sm text-muted">{selectedItem.username}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Email</div>
                      <div className="text-sm text-muted">{selectedItem.email}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">角色</div>
                      <div className="text-sm text-muted">{getRoleDisplayName(selectedItem.role)}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">學校</div>
                      <div className="text-sm text-muted">{selectedItem.school?.name || '未設定'}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">註冊時間</div>
                      <div className="text-sm text-muted">{formatLocalMinute(selectedItem.created_at)}</div>
                    </div>
                    
                    
                    {selectedItem.role !== 'dev_admin' && selectedItem.role !== 'campus_admin' && selectedItem.role !== 'cross_admin' && (
                      <div className="mt-4 pt-4 border-t">
                        <button
                          onClick={() => togglePremiumStatus(selectedItem.id, selectedItem.is_premium)}
                          disabled={saving || selectedItem.username === 'Kaiyasi'}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selectedItem.is_premium
                              ? 'bg-red-100 text-red-800 hover:bg-red-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                        >
                          {selectedItem.is_premium ? (
                            <>
                              <X className="w-4 h-4" />
                              取消訂閱
                            </>
                          ) : (
                            <>
                              <Crown className="w-4 h-4" />
                              設為訂閱
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'posts' && 'content' in selectedItem ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">內容</div>
                      <div className="text-sm text-muted bg-surface-hover p-3 rounded mt-1 whitespace-pre-wrap">
                        {selectedItem.content}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">作者</div>
                      <div className="text-sm text-muted">{selectedItem.author.username}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">狀態</div>
                      <div className="text-sm text-muted">
                        {selectedItem.status === 'approved' ? '已上架' :
                         selectedItem.status === 'rejected' ? '已下架' : '待審核'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">類型</div>
                      <div className="text-sm text-muted">
                        {selectedItem.is_advertisement ? '廣告貼文' :
                         selectedItem.is_announcement ? '公告貼文' : '一般貼文'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">發布時間</div>
                      <div className="text-sm text-muted">{formatLocalMinute(selectedItem.created_at)}</div>
                    </div>
                    
                    
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <button
                        onClick={() => togglePostStatus(selectedItem.id, selectedItem.status)}
                        disabled={saving}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedItem.status === 'approved'
                            ? 'bg-red-100 text-red-800 hover:bg-red-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        }`}
                      >
                        {selectedItem.status === 'approved' ? (
                          <>
                            <EyeOff className="w-4 h-4" />
                            下架貼文
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4" />
                            上架貼文
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => deletePost(selectedItem.id)}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        刪除貼文
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <h3 className="text-lg font-semibold text-fg mb-4">統計信息</h3>
              <div className="space-y-3">
                {activeTab === 'users' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">總用戶數</span>
                      <span className="text-sm font-medium">{users.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">已訂閱用戶</span>
                      <span className="text-sm font-medium">{users.filter(u => u.is_premium).length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">顯示中</span>
                      <span className="text-sm font-medium">{filteredUsers.length}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">總貼文數</span>
                      <span className="text-sm font-medium">{posts.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">已上架</span>
                      <span className="text-sm font-medium text-green-600">{posts.filter(p => p.status === 'approved').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">已下架</span>
                      <span className="text-sm font-medium text-red-600">{posts.filter(p => p.status === 'rejected').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">廣告貼文</span>
                      <span className="text-sm font-medium text-yellow-600">{posts.filter(p => p.is_advertisement).length}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        
        {showAdForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">發布廣告貼文</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">廣告內容</label>
                  <textarea
                    value={adContent}
                    onChange={(e) => setAdContent(e.target.value)}
                    className="form-control min-h-[120px]"
                    placeholder="輸入廣告貼文內容，支援 Markdown 語法..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">媒體附件</label>
                  <UploadArea value={adFiles} onChange={setAdFiles} maxCount={6} />
                </div>
                
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>注意：</strong> 廣告貼文將直接發布，無需審核。請確保內容符合平台規範。
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAdForm(false)
                    setAdContent('')
                    setAdFiles([])
                  }}
                  className="btn-ghost flex-1"
                >
                  取消
                </button>
                <button
                  onClick={submitAdvertisement}
                  disabled={adSubmitting || !adContent.trim()}
                  className="btn-primary flex-1"
                >
                  {adSubmitting ? '發布中...' : '發布廣告'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
