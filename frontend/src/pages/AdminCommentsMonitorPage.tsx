import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import { Search, Filter, CheckCircle, XCircle, Trash2, Eye, Clock, User, Calendar, Download, RefreshCw, MessageSquare, BarChart3, AlertTriangle } from 'lucide-react'
import { HttpError, getJSON } from '@/lib/http'
import ErrorPage from '@/components/ui/ErrorPage'
import { getRole, getRoleDisplayName } from '@/utils/auth'

interface CommentItem {
  id: number
  content: string
  status: string
  is_deleted: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: number | null
  post: {
    id: number
    content: string
    status: string
    school_name: string | null
  }
  author: {
    id: number | null
    username: string
    role: string | null
    school_name: string | null
  }
  stats: {
    like_count: number
    reply_count: number
  }
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [stats, setStats] = useState<CommentStats | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [selectedComment, setSelectedComment] = useState<CommentItem | null>(null)
  const [showRejectModal, setShowRejectModal] = useState<{ id: number, content: string } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<{ id: number, content: string } | null>(null)
  const [showDetailModal, setShowDetailModal] = useState<{ id: number, content: string } | null>(null)
  const [detailData, setDetailData] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  // 篩選狀態
  const [showFilters, setShowFilters] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [keyword, setKeyword] = useState('')
  const [postId, setPostId] = useState('')
  const getStoredSchool = () => (localStorage.getItem('school_slug') || '').trim()
  const [school, setSchool] = useState(getStoredSchool())
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const role = getRole()

  const loadComments = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (status) params.append('status', status)
      if (keyword) params.append('keyword', keyword)
      if (postId) params.append('post_id', postId)
      if (school) params.append('school', school)
      else params.append('scope', 'cross')
      params.append('page', page.toString())
      params.append('per_page', '50')

      const response = await getJSON<{
        ok: boolean
        items: CommentItem[]
        total: number
        page: number
        per_page: number
        total_pages: number
      }>(`/api/admin/comments/monitor?${params}`)

      if (response.ok) {
        setComments(response.items || [])
        setTotal(response.total || 0)
        setTotalPages(response.total_pages || 1)
      } else {
        throw new Error('載入失敗')
      }
    } catch (e) {
      if (e instanceof HttpError) {
        setError(e.message)
      } else {
        setError('載入失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const params = new URLSearchParams()
      if (school) params.append('school', school)
      else params.append('scope', 'cross')
      const response = await getJSON<{ ok: boolean; stats: CommentStats }>(`/api/admin/comments/stats?${params}`)
      if (response.ok) {
        setStats(response.stats)
      }
    } catch (e) {
      console.error('載入統計失敗:', e)
    }
  }

  const approveComment = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/admin/comments/${id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }
      })
      if (!response.ok) throw new Error('批准失敗')
      await loadComments()
      await loadStats()
    } catch (e) {
      setError('批准失敗')
    } finally {
      setBusy(null)
    }
  }

  const rejectComment = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/admin/comments/${id}/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ reason: rejectReason || '未符合社群規範' })
      })
      if (!response.ok) throw new Error('拒絕失敗')
      await loadComments()
      await loadStats()
      setShowRejectModal(null)
      setRejectReason('')
    } catch (e) {
      setError('拒絕失敗')
    } finally {
      setBusy(null)
    }
  }

  const deleteComment = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/admin/comments/${id}/delete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ reason: deleteReason || '管理員刪除' })
      })
      if (!response.ok) throw new Error('刪除失敗')
      await loadComments()
      await loadStats()
      setShowDeleteModal(null)
      setDeleteReason('')
    } catch (e) {
      setError('刪除失敗')
    } finally {
      setBusy(null)
    }
  }

  const loadDetail = async (commentId: number) => {
    try {
      setLoadingDetail(true)
      const response = await getJSON<{ ok: boolean; comment: any }>(`/api/admin/comments/${commentId}/detail`)
      if (response.ok) {
        setDetailData(response.comment)
      } else {
        throw new Error('載入詳情失敗')
      }
    } catch (e) {
      console.error('載入詳情失敗:', e)
      alert('載入詳情失敗')
    } finally {
      setLoadingDetail(false)
    }
  }

  const exportCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (status) params.append('status', status)
      if (keyword) params.append('keyword', keyword)
      if (postId) params.append('post_id', postId)
      if (school) params.append('school', school)
      params.append('per_page', '1000') // 匯出更多數據

      const response = await getJSON<{ ok: boolean; items: CommentItem[] }>(`/api/admin/comments/monitor?${params}`)
      
      if (response.ok && response.items) {
        const csvContent = [
          ['ID', '內容', '狀態', '作者', '貼文ID', '學校', '創建時間', '更新時間'],
          ...response.items.map(comment => [
            comment.id,
            `"${comment.content.replace(/"/g, '""')}"`,
            comment.status,
            comment.author.username,
            comment.post.id,
            comment.post.school_name || '',
            comment.created_at,
            comment.updated_at
          ])
        ].map(row => row.join(',')).join('\n')

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `comments_export_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
      }
    } catch (e) {
      console.error('匯出失敗:', e)
      alert('匯出失敗')
    }
  }

  useEffect(() => {
    loadComments()
    loadStats()
  }, [page, status, keyword, postId, school])

  useEffect(() => {
    const onChanged = (e: any) => {
      const slug = e?.detail?.slug ?? getStoredSchool()
      setSchool(slug || '')
      setPage(1)
    }
    window.addEventListener('fk_school_changed', onChanged as any)
    return () => window.removeEventListener('fk_school_changed', onChanged as any)
  }, [])

  if (error) {
    return <ErrorPage title="留言監控載入失敗" message={error} />
  }

  return (
    <div className="min-h-screen bg-base">
      <NavBar pathname="/admin/comments" />
      
      <div className="container mx-auto px-4 py-6 max-w-7xl pt-20 sm:pt-24 md:pt-28">
        <div className="flex flex-col gap-6">
          {/* 標題與刷新 */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-fg flex items-center gap-3">
              <MessageSquare className="w-6 h-6" />
              留言監控
              <span className="text-sm px-2 py-1 rounded-full bg-primary/10 text-primary">
                {total} 則留言
              </span>
            </h1>
                         <div className="flex items-center gap-3">
               <span className="text-sm text-muted">身份：{getRoleDisplayName(role)}</span>
               <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                 {role === 'campus_moderator' ? '校內審核' :
                  role === 'cross_moderator' ? '跨校審核' :
                  role === 'campus_admin' ? '校內管理' :
                  role === 'cross_admin' ? '跨校管理' :
                  role === 'dev_admin' ? '全站管理' : '一般用戶'}
               </span>
               <button
                 onClick={() => { loadComments(); loadStats(); }}
                 className="btn-secondary px-3 py-2 flex items-center gap-2"
                 disabled={loading}
               >
                 <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                 刷新
               </button>
             </div>
          </div>

          {/* 統計卡片 */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  <h3 className="font-medium text-sm text-fg">總留言數</h3>
                </div>
                <div className="text-2xl font-bold text-fg">{stats.total}</div>
              </div>
              
                             <div className="bg-surface border border-border rounded-xl p-4">
                 <div className="flex items-center gap-2 mb-2">
                   <Clock className="w-4 h-4 text-amber-500" />
                   <h3 className="font-medium text-sm text-fg">待檢查</h3>
                 </div>
                 <div className="text-2xl font-bold text-fg">{stats.pending}</div>
               </div>
               
               <div className="bg-surface border border-border rounded-xl p-4">
                 <div className="flex items-center gap-2 mb-2">
                   <CheckCircle className="w-4 h-4 text-green-500" />
                   <h3 className="font-medium text-sm text-fg">正常</h3>
                 </div>
                 <div className="text-2xl font-bold text-fg">{stats.approved}</div>
               </div>
               
               <div className="bg-surface border border-border rounded-xl p-4">
                 <div className="flex items-center gap-2 mb-2">
                   <XCircle className="w-4 h-4 text-red-500" />
                   <h3 className="font-medium text-sm text-fg">違規</h3>
                 </div>
                 <div className="text-2xl font-bold text-fg">{stats.rejected}</div>
               </div>
              
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trash2 className="w-4 h-4 text-gray-500" />
                  <h3 className="font-medium text-sm text-fg">已刪除</h3>
                </div>
                <div className="text-2xl font-bold text-fg">{stats.deleted}</div>
              </div>
              
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-purple-500" />
                  <h3 className="font-medium text-sm text-fg">今日新增</h3>
                </div>
                <div className="text-2xl font-bold text-fg">{stats.today}</div>
              </div>
              
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-medium text-sm text-fg">本月新增</h3>
                </div>
                <div className="text-2xl font-bold text-fg">{stats.month}</div>
              </div>
            </div>
          )}

          {/* 篩選器 */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-fg">篩選條件</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportCSV}
                  className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  匯出 CSV
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="text-sm text-primary hover:text-primary-dark"
                >
                  <Filter className="w-4 h-4 inline mr-1" />
                  {showFilters ? '隱藏' : '顯示'}篩選
                </button>
              </div>
            </div>
            
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">狀態</label>
                                     <select
                     value={status}
                     onChange={(e) => setStatus(e.target.value)}
                     className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                   >
                     <option value="">全部狀態</option>
                     <option value="pending">待檢查</option>
                     <option value="approved">正常</option>
                     <option value="rejected">違規</option>
                     <option value="deleted">已刪除</option>
                   </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">關鍵字</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜尋留言內容..."
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">貼文ID</label>
                  <input
                    type="text"
                    value={postId}
                    onChange={(e) => setPostId(e.target.value)}
                    placeholder="貼文編號"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">學校</label>
                  <input
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="學校代碼"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 留言列表 */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-muted">載入中...</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-muted">沒有找到符合條件的留言</p>
              </div>
            ) : (
              <>
                {comments.map(comment => (
                  <div key={comment.id} className="bg-surface border border-border rounded-xl p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-fg">留言 #{comment.id}</span>
                                                     <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                             comment.status === 'pending' ? 'bg-warning-bg text-warning-text' :
                             comment.status === 'approved' ? 'bg-success-bg text-success-text' :
                             comment.status === 'rejected' ? 'bg-danger-bg text-danger-text' :
                             comment.status === 'deleted' ? 'bg-muted/10 text-muted' :
                             'bg-muted/10 text-muted'
                           }`}>
                             {comment.status === 'pending' ? '待檢查' :
                              comment.status === 'approved' ? '正常' :
                              comment.status === 'rejected' ? '違規' :
                              comment.status === 'deleted' ? '已刪除' : '未知'}
                           </span>
                           <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                             {comment.post.school_name || '跨校'}
                           </span>
                        </div>
                        <div className="text-xs text-muted mb-2">
                          來源：{comment.post.school_name || '跨校'}{comment.author?.school_name ? ` · 作者：${comment.author.school_name}` : ''}
                        </div>
                         <div className="prose prose-sm max-w-none mb-3">
                           <div className="text-fg whitespace-pre-line">
                             {comment.content.length > 200 ? (
                               <>
                                 {comment.content.substring(0, 200)}...
                                 <button
                                   onClick={() => {
                                     setShowDetailModal({ id: comment.id, content: comment.content })
                                     loadDetail(comment.id)
                                   }}
                                   className="text-primary hover:text-primary-dark text-sm ml-2 underline"
                                 >
                                   查看完整內容
                                 </button>
                               </>
                             ) : (
                               comment.content
                             )}
                           </div>
                         </div>
                        
                        <div className="flex items-center gap-4 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {comment.author.username}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            貼文 #{comment.post.id}
                          </span>
                          {comment.created_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(comment.created_at).toLocaleString('zh-TW')}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                                                                          {comment.status === 'pending' && (
                           <>
                             <button
                               onClick={() => approveComment(comment.id)}
                               disabled={busy === comment.id}
                               className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
                             >
                               <CheckCircle className="w-4 h-4" />
                               標記正常
                             </button>
                             
                             <button
                               onClick={() => setShowRejectModal({ id: comment.id, content: comment.content })}
                               disabled={busy === comment.id}
                               className="btn-danger px-4 py-2 text-sm flex items-center gap-2"
                             >
                               <XCircle className="w-4 h-4" />
                               標記違規
                             </button>
                           </>
                         )}
                         
                         {comment.status !== 'deleted' && (
                           <button
                             onClick={() => setShowDeleteModal({ id: comment.id, content: comment.content })}
                             disabled={busy === comment.id}
                             className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
                           >
                             <Trash2 className="w-4 h-4" />
                             刪除
                           </button>
                         )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* 分頁 */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-3 py-2 text-sm rounded-lg border dual-btn disabled:opacity-50"
                    >
                      上一頁
                    </button>
                    <span className="px-3 py-2 text-sm text-muted">
                      第 {page} 頁，共 {totalPages} 頁
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-2 text-sm rounded-lg border dual-btn disabled:opacity-50"
                    >
                      下一頁
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

             {/* 拒絕確認對話框 */}
       {showRejectModal && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
             <h3 className="text-lg font-semibold text-fg mb-4">標記違規</h3>
             <p className="text-sm text-muted mb-4">
               請填寫違規理由（可選）：
             </p>
            
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="不符合社群規範..."
              className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              rows={3}
            />
            
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(null)
                  setRejectReason('')
                }}
                className="btn-secondary px-4 py-2"
              >
                取消
              </button>
              
                             <button
                 onClick={() => rejectComment(showRejectModal.id)}
                 className="btn-danger px-4 py-2"
               >
                 確認標記
               </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認對話框 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-fg mb-4">刪除留言</h3>
            <p className="text-sm text-muted mb-4">
              請填寫刪除理由（可選）：
            </p>
            
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="管理員刪除..."
              className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              rows={3}
            />
            
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => {
                  setShowDeleteModal(null)
                  setDeleteReason('')
                }}
                className="btn-secondary px-4 py-2"
              >
                取消
              </button>
              
              <button
                onClick={() => deleteComment(showDeleteModal.id)}
                className="btn-danger px-4 py-2"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

             {/* 詳情對話框 */}
       {showDetailModal && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-semibold text-fg">留言詳情</h3>
               <button
                 onClick={() => {
                   setShowDetailModal(null)
                   setDetailData(null)
                 }}
                 className="text-muted hover:text-fg"
               >
                 ✕
               </button>
             </div>
             
             {loadingDetail ? (
               <div className="text-center py-8">
                 <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                 <p className="text-muted">載入中...</p>
               </div>
             ) : detailData ? (
               <div className="space-y-6">
                 {/* 留言內容 */}
                 <div>
                   <h4 className="font-medium text-fg mb-2">留言內容</h4>
                   <div className="bg-surface-hover border border-border rounded-lg p-4">
                     <div 
                       className="prose prose-sm max-w-none text-fg"
                       dangerouslySetInnerHTML={{ __html: detailData.content || '' }}
                     />
                   </div>
                 </div>
                 
                 {/* 貼文內容 */}
                 <div>
                   <h4 className="font-medium text-fg mb-2">所屬貼文</h4>
                   <div className="bg-surface-hover border border-border rounded-lg p-4">
                     <div className="flex items-center gap-2 mb-2">
                       <span className="text-sm text-muted">貼文 #{detailData.post.id}</span>
                       {detailData.post.school_name && (
                         <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                           {detailData.post.school_name}
                         </span>
                       )}
                     </div>
                     <div 
                       className="prose prose-sm max-w-none text-fg"
                       dangerouslySetInnerHTML={{ __html: detailData.post.content || '' }}
                     />
                   </div>
                 </div>
                 
                 {/* 作者信息 */}
                 <div>
                   <h4 className="font-medium text-fg mb-2">作者信息</h4>
                   <div className="bg-surface-hover border border-border rounded-lg p-4">
                     <div className="grid grid-cols-2 gap-4 text-sm">
                       <div>
                         <span className="text-muted">用戶名：</span>
                         <span className="text-fg">{detailData.author.username}</span>
                       </div>
                       <div>
                         <span className="text-muted">角色：</span>
                         <span className="text-fg">{detailData.author.role || '一般用戶'}</span>
                       </div>
                       {detailData.author.school_name && (
                         <div>
                           <span className="text-muted">學校：</span>
                           <span className="text-fg">{detailData.author.school_name}</span>
                         </div>
                       )}
                       <div>
                         <span className="text-muted">狀態：</span>
                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                           detailData.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                           detailData.status === 'approved' ? 'bg-green-100 text-green-800' :
                           detailData.status === 'rejected' ? 'bg-red-100 text-red-800' :
                           detailData.status === 'deleted' ? 'bg-gray-100 text-gray-800' :
                           'bg-gray-100 text-gray-800'
                         }`}>
                           {detailData.status === 'pending' ? '待檢查' :
                            detailData.status === 'approved' ? '正常' :
                            detailData.status === 'rejected' ? '違規' :
                            detailData.status === 'deleted' ? '已刪除' : '未知'}
                         </span>
                       </div>
                     </div>
                   </div>
                 </div>
                 
                 {/* 時間信息 */}
                 <div>
                   <h4 className="font-medium text-fg mb-2">時間信息</h4>
                   <div className="bg-surface-hover border border-border rounded-lg p-4">
                     <div className="grid grid-cols-2 gap-4 text-sm">
                       <div>
                         <span className="text-muted">創建時間：</span>
                         <span className="text-fg">
                           {detailData.created_at ? new Date(detailData.created_at).toLocaleString('zh-TW') : '未知'}
                         </span>
                       </div>
                       <div>
                         <span className="text-muted">更新時間：</span>
                         <span className="text-fg">
                           {detailData.updated_at ? new Date(detailData.updated_at).toLocaleString('zh-TW') : '未知'}
                         </span>
                       </div>
                       {detailData.deleted_at && (
                         <div>
                           <span className="text-muted">刪除時間：</span>
                           <span className="text-fg">
                             {new Date(detailData.deleted_at).toLocaleString('zh-TW')}
                           </span>
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               </div>
             ) : (
               <div className="text-center py-8">
                 <p className="text-muted">無法載入詳情</p>
               </div>
             )}
           </div>
         </div>
       )}

       <MobileFabNav />
     </div>
   )
 }
