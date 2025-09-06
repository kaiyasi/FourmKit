import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  User, 
  Clock, 
  Filter, 
  Search, 
  RefreshCw,
  Shield,
  TrendingUp,
  FileText,
  Users,
  Globe,
  AlertTriangle,
  Eye,
  Trash2,
  Edit,
  MoreVertical,
  AlertCircle
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface Comment {
  id: number
  content: string
  status: string
  created_at: string
  author: {
    id: number
    username: string
    school_name?: string
  }
  post: {
    id: number
    content: string
    status: string
    school_name?: string
  }
  is_deleted: boolean
  deleted_by?: string
  deleted_at?: string
  reason?: string
}

interface CommentStats {
  total: number
  pending: number
  approved: number
  rejected: number
  deleted: number
  today: number
  week: number
  month: number
}

export default function AdminCommentsMonitorPage() {
  const { role } = useAuth()
  const isDev = (role === 'dev_admin')
  const canModerate = ['dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator'].includes(role || '')
  
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null)
  const [stats, setStats] = useState<CommentStats | null>(null)
  const [filters, setFilters] = useState({
    page: 1,
    per_page: 20,
    status: 'active',
    school: '',
    client_id: '',
    ip: ''
  })

  // 載入留言列表
  const loadComments = async () => {
    if (!canModerate) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      
      // 根據過濾狀態調整 API 參數
      if (filters.status === 'active') {
        // 正常留言：已核准且未刪除
        params.append('status', 'approved')
      } else if (filters.status === 'pending') {
        // 待審核
        params.append('status', 'pending')
      } else if (filters.status === 'rejected') {
        // 已拒絕
        params.append('status', 'rejected')
      } else if (filters.status === 'deleted') {
        // 已下架：使用 status=deleted
        params.append('status', 'deleted')
      }
      
      // 添加其他過濾參數
      if (filters.school && filters.school !== '') {
        params.append('school', filters.school)
      }
      if (filters.client_id && filters.client_id !== '') {
        params.append('client_id', filters.client_id)
      }
      if (filters.ip && filters.ip !== '') {
        params.append('ip', filters.ip)
      }
      
      console.log('Loading comments with filters:', filters)
      console.log('API URL:', `/api/admin/comments/monitor?${params}`)
      
      const response = await fetch(`/api/admin/comments/monitor?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('API Response:', data)
        console.log('Comments loaded:', data.items?.length || 0)
        setComments(data.items || [])
      } else {
        console.error('Failed to load comments:', response.status)
        const errorText = await response.text()
        console.error('Error response:', errorText)
      }
    } catch (error) {
      console.error('Failed to load comments:', error)
    } finally {
      setLoading(false)
    }
  }

  // 載入統計資料
  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/comments/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
      } else {
        console.error('Failed to load stats:', response.status)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  useEffect(() => {
    console.log('Filters changed:', filters)
    loadComments()
    loadStats()
  }, [filters])

  // 下架留言
  const deleteComment = async (comment: Comment, reason: string) => {
    try {
      const response = await fetch(`/api/admin/comments/${comment.id}/delete`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      })
      
      if (response.ok) {
        await loadComments()
        await loadStats()
        setSelectedComment(null)
      } else {
        console.error('Failed to delete comment:', response.status)
      }
    } catch (error) {
      console.error('Failed to delete comment:', error)
    }
  }

  // 重新上架留言
  const restoreComment = async (comment: Comment) => {
    try {
      const response = await fetch(`/api/admin/comments/${comment.id}/restore`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        await loadComments()
        await loadStats()
        setSelectedComment(null)
      } else {
        console.error('Failed to restore comment:', response.status)
      }
    } catch (error) {
      console.error('Failed to restore comment:', error)
    }
  }

  // 警告留言（這裡需要後端支援警告功能）
  const warnComment = async (comment: Comment, reason: string) => {
    try {
      // 目前後端沒有警告 API，這裡先記錄到 console
      console.log('Warning comment:', comment.id, 'reason:', reason)
      
      // TODO: 當後端支援警告功能時，呼叫相應的 API
      // const response = await fetch(`/api/admin/comments/${comment.id}/warn`, {
      //   method: 'POST',
      //   headers: { 
      //     'Authorization': `Bearer ${localStorage.getItem('token')||''}`,
      //     'Content-Type': 'application/json'
      //   },
      //   body: JSON.stringify({ reason })
      // })
      
      // 暫時顯示成功訊息
      alert(`已警告留言 #${comment.id}：${reason}`)
      setSelectedComment(null)
    } catch (error) {
      console.error('Failed to warn comment:', error)
    }
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('zh-TW')
    } catch {
      return '時間未知'
    }
  }

  // 獲取狀態顯示
  const getStatusDisplay = (comment: Comment) => {
    if (comment.is_deleted) {
      return { text: '已下架', color: 'bg-red-100 text-red-800' }
    }
    if (comment.status === 'pending') {
      return { text: '待審核', color: 'bg-yellow-100 text-yellow-800' }
    }
    if (comment.status === 'rejected') {
      return { text: '已拒絕', color: 'bg-orange-100 text-orange-800' }
    }
    if (comment.status === 'approved') {
      return { text: '正常', color: 'bg-green-100 text-green-800' }
    }
    return { text: comment.status, color: 'bg-gray-100 text-gray-800' }
  }

  if (!canModerate) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-fg mb-2">權限不足</h1>
          <p className="text-muted">只有管理員可以訪問留言監控功能</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/comments" />
      <MobileBottomNav />
      
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
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">留言監控</h1>
            <p className="text-sm text-muted mt-1">監控已發佈的留言，處理問題內容</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 留言列表 */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                留言列表
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadComments}
                  className="p-2 text-muted hover:text-fg transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 過濾器 */}
            <div className="mb-4 p-3 bg-surface-hover rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  className="form-control form-control--compact flex-1"
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="active">正常留言</option>
                  <option value="pending">待審核</option>
                  <option value="rejected">已拒絕</option>
                  <option value="deleted">已下架</option>
                </select>
                {isDev && (
                  <>
                    <select
                      className="form-control form-control--compact flex-1"
                      value={filters.school}
                      onChange={(e) => setFilters(prev => ({ ...prev, school: e.target.value }))}
                    >
                      <option value="">所有學校</option>
                      <option value="cross">跨校</option>
                      <option value="ncku">成功大學</option>
                      <option value="nhsh">內湖高中</option>
                      <option value="ntu">台灣大學</option>
                    </select>
                    <input
                      className="form-control form-control--compact flex-1"
                      type="text"
                      placeholder="使用者"
                      value={filters.client_id}
                      onChange={(e) => setFilters(prev => ({ ...prev, client_id: e.target.value }))}
                    />
                    <input
                      className="form-control form-control--compact flex-1"
                      type="text"
                      placeholder="IP 地址"
                      value={filters.ip}
                      onChange={(e) => setFilters(prev => ({ ...prev, ip: e.target.value }))}
                    />
                  </>
                )}
              </div>
            </div>

            {/* 留言列表 */}
            <div className="space-y-3">
              {comments.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>目前沒有符合條件的留言</p>
                  <p className="text-xs mt-1">請調整過濾條件或稍後再試</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-4 rounded-xl border border-border cursor-pointer transition-colors ${
                      selectedComment?.id === comment.id 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'bg-surface-hover hover:bg-surface'
                    }`}
                    onClick={() => setSelectedComment(comment)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusDisplay(comment).color}`}>
                          {getStatusDisplay(comment).text}
                        </span>
                        <span className="text-xs text-muted">#{comment.id}</span>
                        {comment.author?.school_name && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                            {comment.author.school_name}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">
                        <Clock className="inline w-3 h-3 mr-1" />
                        {formatDate(comment.created_at)}
                      </span>
                    </div>

                    <div className="mb-2 text-sm line-clamp-2">{comment.content}</div>
                    
                    {/* 根據角色顯示不同資訊 */}
                    {isDev ? (
                      <div className="text-xs text-muted mb-2 space-y-1">
                        <div>作者: {comment.author?.username || '匿名用戶'}
                          {comment.author?.school_name && ` (${comment.author?.school_name})`}
                        </div>
                        <div>貼文: #{comment.post?.id} - {comment.post?.content?.substring(0, 50)}...</div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted mb-2 space-y-1">
                        <div>來源: {comment.author?.school_name || '跨校'}</div>
                        <div>貼文: {comment.post?.content?.substring(0, 50)}...</div>
                      </div>
                    )}

                    {comment.is_deleted && (
                      <div className="text-xs text-red-600 mt-2">
                        ❌ 已下架 {comment.deleted_by && `by ${comment.deleted_by}`}
                        {comment.deleted_at && ` at ${formatDate(comment.deleted_at)}`}
                        {comment.reason && ` - ${comment.reason}`}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 側邊欄 */}
          <div className="space-y-6">
            {/* 統計資訊 */}
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                統計資訊
              </h2>
              {stats ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">總留言數</span>
                    <span className="text-sm font-medium">{stats.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">正常留言</span>
                    <span className="text-sm font-medium text-green-600">{stats.approved}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待審核</span>
                    <span className="text-sm font-medium text-yellow-600">{stats.pending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">已拒絕</span>
                    <span className="text-sm font-medium text-orange-600">{stats.rejected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">已下架</span>
                    <span className="text-sm font-medium text-red-600">{stats.deleted}</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="text-xs text-muted mb-2">今日統計</div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">新增</span>
                      <span className="text-sm font-medium text-blue-600">{stats.today}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">本週新增</span>
                      <span className="text-sm font-medium text-purple-600">{stats.week}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted">本月新增</span>
                      <span className="text-sm font-medium text-indigo-600">{stats.month}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  <p className="text-sm">載入統計中...</p>
                </div>
              )}
            </div>

            {/* 選中留言詳情 */}
            {selectedComment && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  留言詳情
                </h3>
                
                <div className="space-y-3">
                  <div className="p-3 bg-surface-hover rounded-lg">
                    <div className="text-sm mb-2">{selectedComment.content}</div>
                    <div className="text-xs text-muted">
                      作者: {selectedComment.author?.username || '匿名用戶'}
                      {selectedComment.author?.school_name && ` (${selectedComment.author?.school_name})`}
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted space-y-1">
                    <div>留言 ID: #{selectedComment.id}</div>
                    <div>貼文: #{selectedComment.post?.id} - {selectedComment.post?.content?.substring(0, 100)}...</div>
                    <div>建立時間: {formatDate(selectedComment.created_at)}</div>
                    {/* 開發者可以看到更多資訊 */}
                    {isDev && (
                      <>
                        <div>貼文狀態: {selectedComment.post?.status}</div>
                        <div>留言狀態: {selectedComment.status}</div>
                      </>
                    )}
                  </div>

                  {selectedComment.is_deleted && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                      <div className="text-sm text-red-800 dark:text-red-200 font-medium mb-1">
                        ❌ 此留言已被下架
                      </div>
                      <div className="text-xs text-red-700 dark:text-red-300">
                        {selectedComment.deleted_by && `下架者: ${selectedComment.deleted_by}`}
                        {selectedComment.deleted_at && ` | 下架時間: ${formatDate(selectedComment.deleted_at)}`}
                        {selectedComment.reason && ` | 原因: ${selectedComment.reason}`}
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按鈕 */}
                <div className="mt-4 space-y-2">
                  {/* 正常留言的操作 */}
                  {!selectedComment.is_deleted && selectedComment.status === 'approved' && (
                    <>
                      <button
                        onClick={() => warnComment(selectedComment, '內容不當')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                      >
                        <AlertCircle className="w-4 h-4" />
                        警告留言
                      </button>
                      <button
                        onClick={() => deleteComment(selectedComment, '違規內容')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 btn-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                        下架留言
                      </button>
                    </>
                  )}

                  {/* 待審核留言的操作 */}
                  {!selectedComment.is_deleted && selectedComment.status === 'pending' && (
                    <>
                      <button
                        onClick={() => deleteComment(selectedComment, '內容不當')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 btn-danger"
                      >
                        <XCircle className="w-4 h-4" />
                        拒絕留言
                      </button>
                    </>
                  )}
                  
                  {/* 已下架留言的顯示 */}
                  {selectedComment.is_deleted && (
                    <div className="border-t pt-2 mt-2">
                      <div className="text-xs text-muted mb-2">此留言已下架</div>
                      <div className="text-sm text-muted p-3 bg-surface-hover rounded-lg">
                        ❌ 此留言已被下架，不會公開顯示
                      </div>
                      
                      {/* dev_admin 可以重新上架 */}
                      {isDev && (
                        <button
                          onClick={() => restoreComment(selectedComment)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors mt-3"
                        >
                          <CheckCircle className="w-4 h-4" />
                          重新上架留言
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
