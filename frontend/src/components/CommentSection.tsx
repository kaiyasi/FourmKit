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
import { Link } from 'react-router-dom'
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


/**
 *
 */
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


  
  const [reactionStats, setReactionStats] = useState<PostReactionStats>(initialReactionStats)
  const [userReactions, setUserReactions] = useState<string[]>(userPostReaction ? [userPostReaction] : [])
  const [reactLoading, setReactLoading] = useState<string | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commentsContainerRef = useRef<HTMLDivElement>(null)
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

  const loadComments = async (pageNum: number = 1, append: boolean = false) => {
    try {
      setLoading(true)
      setError(null)
      
      const token = localStorage.getItem('token') || ''
      const headers: Record<string, string> = {}
      if (token.trim()) headers['Authorization'] = `Bearer ${token}`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(`/api/posts/${postId}/comments?page=${pageNum}&limit=20&_=${Date.now()}`,
        { headers, signal: controller.signal, cache: 'no-store' as RequestCache })
      clearTimeout(timer)
      
      if (!response.ok) {
        throw new Error('載入留言失敗')
      }
      
      const data = await response.json().catch(()=>({ ok: false, comments: [], pagination: { total: 0, has_next: false } }))
      
      if (!data.ok) {
        throw new Error(data.error || '載入留言失敗')
      }
      
      if (append) {
        setComments(prev => [...prev, ...data.comments])
      } else {
        setComments(data.comments)
      }
      
      setTotal(data.pagination.total)
      setHasMore(data.pagination.has_next)
      setPage(pageNum)
    } catch (error: any) {
      console.error('載入留言失敗:', error)
      setError(error?.name === 'AbortError' ? '載入逾時，請重試' : '載入留言失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

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
          localStorage.removeItem('token')
          localStorage.removeItem('role')
          localStorage.removeItem('school_id')
          return
        }
        throw new Error(errorData.error?.message || '操作失敗')
      }
      
      const data = await response.json()
      
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


  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }



  useEffect(() => {
    loadComments(1)
  }, [postId])

  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => {
      setLoading(false)
      setError(prev => prev || '載入逾時，請點擊重試')
    }, 12000)
    return () => clearTimeout(t)
  }, [loading])

  useEffect(() => {
    loadPostReactions()
  }, [postId])

  useEffect(() => {
    const container = commentsContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loading) {
        loadComments(page + 1, true)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [page, hasMore, loading])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return (
    <div className="border-t border-border pt-4">
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      
      <div className="flex items-center justify-between gap-3 mb-4">
        
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap flex-1">
          {Object.entries(REACTION_ICONS).map(([type, Icon]) => {
            const count = reactionStats[type as keyof PostReactionStats] || 0
            const isActive = userReactions.includes(type)
            const isLoading = reactLoading === type

            return (
              <button
                key={type}
                onClick={() => togglePostReaction(type)}
                disabled={isLoading || !isLoggedIn}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm transition-all ${
                  isActive ? 'bg-primary text-white shadow-sm' : 'bg-surface-hover hover:bg-surface-active text-muted hover:text-fg'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
                  ['love', 'laugh', 'angry'].includes(type) ? 'hidden sm:flex' : ''
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className={`w-4 h-4 ${isActive ? 'fill-current' : ''}`} />
                )}
                <span className="hidden sm:inline">{REACTION_LABELS[type as keyof typeof REACTION_LABELS]}</span>
                {count > 0 && <span className="font-medium">{count}</span>}
              </button>
            )
          })}
        </div>

        
        <div className="flex items-center gap-2 flex-shrink-0">
          {extraActions}
        </div>
      </div>
      
      {(
        <div className="space-y-4">
          
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

          
          {loading && comments.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-muted text-sm">載入留言中...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 text-muted opacity-50" />
              <p className="text-muted">
                {error ? error : '暫無留言，來搶沙發吧！'}
              </p>
              {error && (
                <button
                  className="mt-2 px-3 py-1.5 text-xs rounded border hover:bg-surface"
                  onClick={() => loadComments(1)}
                >
                  重試
                </button>
              )}
            </div>
          ) : (
            <div ref={commentsContainerRef} className="space-y-3 max-h-96 overflow-y-auto">
              {comments.map((comment) => {
                const raw = (comment.content || '').toString()
                const trimmed = raw.trim()
                const mReply = trimmed.match(/^※#(\d+)\s*(.*)$/s)
                const isLegacyNote = !mReply && trimmed.startsWith('※ ')
                const displayContent = mReply ? (mReply[2] || '') : (isLegacyNote ? trimmed.replace(/^※\s*/, '') : raw)
                const replyId = mReply ? mReply[1] : null
                return (
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
                  
                  <p className={`mb-3 whitespace-pre-wrap ${replyId ? 'text-sm text-fg' : (isLegacyNote ? 'text-xs text-muted italic' : 'text-sm text-fg')}`}>
                    {replyId && (
                      <Link to={`/posts/${replyId}`} className="text-xs text-muted mr-2 hover:underline">
                        回覆貼文 #{replyId}
                      </Link>
                    )}
                    {displayContent}
                  </p>
                  
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
              )})}
              
              
              {loading && hasMore && (
                <div className="text-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" />
                  <p className="text-muted text-xs mt-1">載入更多留言中...</p>
                </div>
              )}
              
              
              {!hasMore && comments.length > 5 && (
                <div className="text-center py-4">
                  <p className="text-muted text-xs">已顯示所有留言</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
