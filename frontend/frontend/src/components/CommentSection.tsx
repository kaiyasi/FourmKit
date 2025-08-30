import { useState, useEffect, useRef } from 'react'
import { 
  MessageCircle,
  Send, 
  ThumbsUp, 
  ThumbsDown, 
  Heart,
  Laugh,
  Angry,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
  Trash2
} from 'lucide-react'
import { getRole, getRoleDisplayName } from '@/utils/auth'

interface Comment {
  id: number
  content: string
  author_id: number
  author_label: string
  created_at: string
  stats: {
    likes: number
    dislikes: number
  }
  user_reaction?: string | null
}

interface PostReactionStats {
  like?: number
  dislike?: number
  love?: number
  laugh?: number
  angry?: number
}

interface CommentSectionProps {
  postId: number
  initialReactionStats?: PostReactionStats
  userPostReaction?: string | null
  initialTotal?: number
  extraActions?: React.ReactNode
}

const REACTION_ICONS = {
  like: ThumbsUp,
  dislike: ThumbsDown,
  love: Heart,
  laugh: Laugh,
  angry: Angry
}

const REACTION_LABELS = {
  like: '讚',
  dislike: '踩',
  love: '愛心',
  laugh: '哈哈',
  angry: '怒'
}

// 簡化配色：僅使用主題色/中性色，不使用五彩顏色

export default function CommentSection({ 
  postId, 
  initialReactionStats = {}, 
  userPostReaction = null,
  initialTotal = 0,
  extraActions
}: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(initialTotal || 0)
  const [error, setError] = useState<string | null>(null)


  
  // 貼文反應狀態
  const [reactionStats, setReactionStats] = useState<PostReactionStats>(initialReactionStats)
  const [userReactions, setUserReactions] = useState<string[]>(userPostReaction ? [userPostReaction] : [])
  const [reactLoading, setReactLoading] = useState<string | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const role = getRole()
  const isLoggedIn = !!localStorage.getItem('token') && role !== 'guest'
  const currentUserId = localStorage.getItem('token') ? (() => {
    try {
      const payload = JSON.parse(atob(localStorage.getItem('token')!.split('.')[1]))
      return parseInt(payload.sub || payload.user_id)
    } catch {
      return null
    }
  })() : null

  // 載入留言
  const loadComments = async (pageNum: number = 1, append: boolean = false) => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/posts/${postId}/comments?page=${pageNum}&limit=20`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        }
      })
      
      if (!response.ok) {
        throw new Error('載入留言失敗')
      }
      
      const data = await response.json()
      
      if (append) {
        setComments(prev => [...prev, ...data.comments])
      } else {
        setComments(data.comments)
      }
      
      setTotal(data.pagination.total)
      setHasMore(data.pagination.has_next)
      setPage(pageNum)
    } catch (error) {
      console.error('載入留言失敗:', error)
      setError('載入留言失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  // 載入貼文反應
  const loadPostReactions = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/reactions`)
      if (!response.ok) {
        throw new Error('載入反應失敗')
      }
      const data = await response.json()
      setReactionStats(data.stats)
      setUserReactions(data.user_reactions || [])
    } catch (error: any) {
      console.error('載入反應失敗:', error)
    }
  }

  // 發布留言
  const submitComment = async () => {
    if (!newComment.trim() || !isLoggedIn) return
    
    try {
      setSubmitting(true)
      setError(null)
      
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ content: newComment.trim() })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '發布失敗')
      }
      
      const newCommentData = await response.json()
      setComments(prev => [newCommentData, ...prev])
      setNewComment('')
      setTotal(prev => prev + 1)
      
      // 自動調整 textarea 高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error: any) {
      console.error('發布留言失敗:', error)
      setError(error.message || '發布留言失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  // 切換貼文反應
  const togglePostReaction = async (reactionType: string) => {
    if (!isLoggedIn) {
      setError('請先登入')
      return
    }
    
    try {
      setReactLoading(reactionType)
      setError(null)
      
      const response = await fetch(`/api/posts/${postId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ reaction_type: reactionType })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (errorData.error?.code === 'JWT_EXPIRED') {
          setError('登入已過期，請重新登入')
          // 清除過期的 session
          localStorage.removeItem('token')
          localStorage.removeItem('role')
          localStorage.removeItem('school_id')
          return
        }
        throw new Error(errorData.error?.message || '操作失敗')
      }
      
      const data = await response.json()
      setUserReactions(data.user_reactions || [])
      setReactionStats(data.stats)
    } catch (error) {
      console.error('反應操作失敗:', error)
      setError('操作失敗，請稍後再試')
    } finally {
      setReactLoading(null)
    }
  }

  // 切換留言反應
  const toggleCommentReaction = async (commentId: number, reactionType: 'like' | 'dislike') => {
    if (!isLoggedIn) {
      setError('請先登入')
      return
    }
    
    try {
      setError(null)
      
      const response = await fetch(`/api/comments/${commentId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ reaction_type: reactionType })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (errorData.error?.code === 'JWT_EXPIRED') {
          setError('登入已過期，請重新登入')
          // 清除過期的 session
          localStorage.removeItem('token')
          localStorage.removeItem('role')
          localStorage.removeItem('school_id')
          return
        }
        throw new Error(errorData.error?.message || '操作失敗')
      }
      
      const data = await response.json()
      
      // 更新留言的反應狀態
      setComments(prev => prev.map(comment => 
        comment.id === commentId 
          ? { ...comment, stats: data.stats, user_reaction: data.user_reaction }
          : comment
      ))
    } catch (error) {
      console.error('留言反應操作失敗:', error)
      setError('操作失敗，請稍後再試')
    }
  }


  const deleteComment = async (commentId: number) => {
    if (!confirm('確定要刪除此留言嗎？')) return
    
    try {
      setError(null)
      
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        }
      })
      
      if (!response.ok) {
        throw new Error('刪除失敗')
      }
      
      setComments(prev => prev.filter(comment => comment.id !== commentId))
      setTotal(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('刪除留言失敗:', error)
      setError('刪除失敗，請稍後再試')
    }
  }


  // 自動調整 textarea 高度
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }



  useEffect(() => {
    loadComments(1)
  }, [postId])

  // 初始載入貼文反應統計
  useEffect(() => {
    loadPostReactions()
  }, [postId])

  // 清除錯誤訊息
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return (
    <div className="border-t border-border pt-4">
      {/* 錯誤訊息 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* 貼文反應區 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* 反應按鈕群 */}
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(REACTION_ICONS).map(([type, Icon]) => {
            const count = reactionStats[type as keyof PostReactionStats] || 0
            const isActive = userReactions.includes(type)
            const isLoading = reactLoading === type
            
            return (
              <button
                key={type}
                onClick={() => togglePostReaction(type)}
                disabled={isLoading || !isLoggedIn}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                  isActive ? 'bg-primary text-white shadow-sm' : 'bg-surface-hover hover:bg-surface-active text-muted hover:text-fg'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className={`w-4 h-4 ${isActive ? 'fill-current' : ''}`} />
                )}
                <span>{REACTION_LABELS[type as keyof typeof REACTION_LABELS]}</span>
                {count > 0 && <span className="font-medium">{count}</span>}
              </button>
            )
          })}
        </div>
        
        {/* 右側按鈕群 */}
        <div className="flex items-center gap-2">
          {extraActions}
        </div>
      </div>
      {/* 留言區 */}
      {(
        <div className="space-y-4">
          {/* 發布留言 */}
          {isLoggedIn ? (
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={handleTextareaChange}
                    placeholder="寫下你的留言..."
                    className="w-full bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted"
                    style={{ minHeight: '36px' }}
                    disabled={submitting}
                    maxLength={1000}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-muted">
                      {newComment.length}/1000
                    </span>
                    <button
                      onClick={submitComment}
                      disabled={!newComment.trim() || submitting}
                      className="btn-primary px-4 py-1.5 text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>發布</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-surface-hover border border-border rounded-xl p-4 text-center">
              <p className="text-muted text-sm">請先登入以發布留言</p>
            </div>
          )}

          {/* 留言列表 */}
          {loading && comments.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-muted text-sm">載入留言中...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-muted opacity-50" />
              <p className="text-muted">暫無留言，來搶沙發吧！</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageCircle className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-fg">{comment.author_label}</span>
                      <span className="text-xs text-muted">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    
                    {/* 刪除按鈕 - 作者本人或管理員可刪除 */}
                    {(currentUserId === comment.author_id || 
                      (role && ['dev_admin', 'campus_admin', 'cross_admin'].includes(role))) && (
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="p-1 text-muted hover:text-red-600 transition-colors"
                        title="刪除留言"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  
                  <p className="text-sm text-fg mb-3 whitespace-pre-wrap">{comment.content}</p>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCommentReaction(comment.id, 'like')}
                      disabled={!isLoggedIn}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                        comment.user_reaction === 'like'
                          ? 'bg-primary text-white'
                          : 'hover:bg-surface-hover text-muted hover:text-fg'
                      } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <ThumbsUp className={`w-3 h-3 ${comment.user_reaction === 'like' ? 'fill-current' : ''}`} />
                      <span>{comment.stats.likes}</span>
                    </button>
                    
                    <button
                      onClick={() => toggleCommentReaction(comment.id, 'dislike')}
                      disabled={!isLoggedIn}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                        comment.user_reaction === 'dislike'
                          ? 'bg-primary text-white'
                          : 'hover:bg-surface-hover text-muted hover:text-fg'
                      } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <ThumbsDown className={`w-3 h-3 ${comment.user_reaction === 'dislike' ? 'fill-current' : ''}`} />
                      <span>{comment.stats.dislikes}</span>
                    </button>
                  </div>
                </div>
              ))}
              
              {/* 載入更多 */}
              {hasMore && (
                <div className="text-center">
                  <button
                    onClick={() => loadComments(page + 1, true)}
                    disabled={loading}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        載入中...
                      </>
                    ) : (
                      '載入更多留言'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
