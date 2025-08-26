import { useState, useRef } from 'react'
import { Clock, MessageSquare, Heart, Share, Copy, Check, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Post } from '@/schemas/post'
import AnonymousAccountDisplay from '../AnonymousAccountDisplay'

interface MobilePostCardProps {
  post: Post
  onReaction?: (postId: number, reaction: string) => void
  onShare?: (postId: number) => void
}

export function MobilePostCard({ post, onReaction, onShare }: MobilePostCardProps) {
  const [showActions, setShowActions] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  
  const haptic = (ms = 10) => { 
    try { 
      if ('vibrate' in navigator) navigator.vibrate(ms) 
    } catch {} 
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 60) return `${minutes}分鐘前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}小時前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  }

  const copyLink = async () => {
    haptic(12)
    try {
      const url = `${window.location.origin}/post/${post.id}`
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch (err) {
      console.warn('複製失敗:', err)
    }
  }

  const handleTouchStart = () => {
    const timer = setTimeout(() => {
      haptic(15)
      setShowActions(true)
    }, 600) // 長按 600ms
    setLongPressTimer(timer)
  }

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  return (
    <>
      <article 
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="bg-surface border border-border rounded-xl p-4 mb-3 
                   active:scale-[0.98] transition-transform duration-100
                   shadow-soft hover:shadow-medium"
      >
        {/* 頭部信息 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1">
            <AnonymousAccountDisplay 
              hash={post.author_hash} 
              className="font-medium text-fg"
            />
            {post.pending_private && (
              <span className="text-xs bg-warning/20 text-warning-text px-2 py-0.5 rounded-full">
                審核中
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted text-sm">
            <Clock className="w-3 h-3" />
            <time>{formatTime(post.created_at)}</time>
          </div>
        </div>

        {/* 內容 */}
        <Link to={`/post/${post.id}`} className="block group">
          <div className="prose prose-sm max-w-none text-fg
                         group-active:text-fg/80 transition-colors">
            <p className="line-clamp-4 leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>
          </div>
        </Link>

        {/* 媒體預覽 */}
        {post.media_files && post.media_files.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {post.media_files.slice(0, 4).map((media, index) => (
              <div key={media.id} className="relative aspect-square rounded-lg overflow-hidden">
                <img 
                  src={media.url} 
                  alt={`媒體 ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {post.media_files!.length > 4 && index === 3 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white font-medium">
                      +{post.media_files!.length - 3}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 底部操作 */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onReaction?.(post.id, 'like')}
              className="flex items-center gap-1 text-muted hover:text-danger transition-colors
                         p-2 -m-2 rounded-full hover:bg-danger/10 active:scale-95"
            >
              <Heart className="w-4 h-4" />
              <span className="text-sm font-medium">
                {post.reaction_counts?.like || 0}
              </span>
            </button>
            
            <Link 
              to={`/post/${post.id}#comments`}
              className="flex items-center gap-1 text-muted hover:text-primary transition-colors
                         p-2 -m-2 rounded-full hover:bg-primary/10 active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">
                {post.comment_count || 0}
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="text-muted hover:text-fg transition-colors
                         p-2 -m-2 rounded-full hover:bg-surface-hover active:scale-95"
            >
              {copiedLink ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            
            <button
              onClick={() => setShowActions(true)}
              className="text-muted hover:text-fg transition-colors
                         p-2 -m-2 rounded-full hover:bg-surface-hover active:scale-95"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </article>

      {/* 操作面板 */}
      {showActions && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-4"
          onClick={() => setShowActions(false)}
        >
          <div 
            className="bg-surface rounded-2xl border border-border shadow-2xl 
                       w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border">
              <h3 className="font-medium text-fg">貼文操作</h3>
            </div>
            <div className="p-2">
              <button
                onClick={() => {
                  onShare?.(post.id)
                  setShowActions(false)
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg
                           text-fg hover:bg-surface-hover transition-colors"
              >
                <Share className="w-5 h-5" />
                <span>分享貼文</span>
              </button>
              <button
                onClick={() => {
                  copyLink()
                  setShowActions(false)
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg
                           text-fg hover:bg-surface-hover transition-colors"
              >
                <Copy className="w-5 h-5" />
                <span>複製連結</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}