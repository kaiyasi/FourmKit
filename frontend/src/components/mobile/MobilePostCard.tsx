import { useState } from 'react'
import { Clock, MessageSquare, Heart, Share, Copy, Check, MoreHorizontal, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Post } from '@/schemas/post'
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'

interface MobilePostCardProps {
  post: Post
  onReaction?: (postId: number, reaction: string) => void
  onShare?: (postId: number) => void
  schools?: { id:number; slug:string; name:string }[]
}

export function MobilePostCard({ post, onReaction, onShare, schools = [] }: MobilePostCardProps) {
  const [showActions, setShowActions] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  
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

  return (
    <>
      <article 
        className="bg-surface border border-border rounded-2xl p-4 mb-3 
                   mobile-post-card mobile-touch-target
                   shadow-soft transition-all duration-150"
      >
        {/* 頭部信息 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {(() => {
                  const nameField = String((post as any).school_name || '').trim()
                  const obj = (post as any).school as any
                  const fromObj = obj && typeof obj === 'object' ? String(obj.name || obj.slug || '').trim() : ''
                  const sidRaw = (post as any).school_id
                  const hasSid = typeof sidRaw === 'number' && Number.isFinite(sidRaw)
                  const mapped = hasSid && sidRaw !== null ? ((schools.find(s=>s.id===sidRaw)?.name || schools.find(s=>s.id===sidRaw)?.slug || '').trim()) : ''
                  const name = nameField || fromObj || ((!hasSid || sidRaw === null) ? '跨校' : mapped)
                  return name ? name.charAt(0) : ''
                })()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium dual-text truncate">
                  {(() => {
                    const nameField = String((post as any).school_name || '').trim()
                    const obj = (post as any).school as any
                    const fromObj = obj && typeof obj === 'object' ? String(obj.name || obj.slug || '').trim() : ''
                    const sidRaw = (post as any).school_id
                    const hasSid = typeof sidRaw === 'number' && Number.isFinite(sidRaw)
                    const mapped = hasSid && sidRaw !== null ? ((schools.find(s=>s.id===sidRaw)?.name || schools.find(s=>s.id===sidRaw)?.slug || '').trim()) : ''
                    const name = nameField || fromObj || ((!hasSid || sidRaw === null) ? '跨校' : mapped)
                    return name
                  })()}
                </span>
                {/* 不再顯示送審預覽狀態 */}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted">
                <Clock className="w-3 h-3" />
                <time>{formatTime(post.created_at)}</time>
                <span>•</span>
                <span>#{post.id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 內容 */}
        <div className="mb-3">
          <SafeHtmlContent 
            html={post.content}
            className="prose prose-sm max-w-none text-fg line-clamp-6 leading-relaxed break-words"
            allowLinks={true}
          />
          <Link 
            to={`/posts/${post.id}`}
            className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:text-primary-600 transition-colors"
          >
            <span>查看完整貼文</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* 媒體預覽 - 響應式網格 */}
        {post.cover_path && (
          <div className="mb-3 rounded-xl overflow-hidden">
            <img 
              src={post.cover_path.startsWith('public/') 
                ? `https://cdn.serelix.xyz/${post.cover_path.replace(/^public\//, '')}`
                : post.cover_path.startsWith('media/')
                  ? `https://cdn.serelix.xyz/${post.cover_path}`
                  : post.cover_path
              }
              alt="貼文圖片"
              className="w-full h-48 object-cover"
              loading="lazy"
            />
            {post.media_count && post.media_count > 1 && (
              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                {post.media_count} 張圖片
              </div>
            )}
          </div>
        )}

        {/* 底部操作欄 */}
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onReaction?.(post.id, 'like')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-muted hover:text-red-500 hover:bg-red-500/10 transition-all duration-200 mobile-touch-target active:scale-95"
            >
              <Heart className="w-4 h-4" />
              <span className="text-sm font-medium">
                {post.reaction_counts?.like || 0}
              </span>
            </button>
            
            <Link 
              to={`/posts/${post.id}#comments`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-muted hover:text-blue-500 hover:bg-blue-500/10 transition-all duration-200 mobile-touch-target active:scale-95"
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
                copiedLink ? 'bg-primary text-white shadow-sm' : 'bg-surface-hover hover:bg-surface-active text-muted hover:text-fg'
              }`}
              title="複製連結"
            >
              {copiedLink ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{copiedLink ? '已複製' : '複製連結'}</span>
            </button>

            <button
              onClick={() => setShowActions(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-surface-hover hover:bg-surface-active text-muted hover:text-fg transition-all"
              title="更多操作"
            >
              <MoreHorizontal className="w-4 h-4" />
              <span>更多</span>
            </button>
          </div>
        </div>
      </article>

      {/* 底部抽屜操作面板 */}
      {showActions && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowActions(false)}
        >
          <div className="absolute inset-x-0 bottom-0 safe-area-bottom">
            <div 
              className="bg-surface rounded-t-2xl border-t border-border shadow-2xl mobile-drawer-content"
              onClick={e => e.stopPropagation()}
            >
              {/* 抽屜把手 */}
              <div className="flex justify-center py-3">
                <div className="w-8 h-1 bg-border rounded-full"></div>
              </div>
              
              {/* 操作選項 */}
              <div className="px-4 pb-4 space-y-2">
                <button
                  onClick={() => {
                    onShare?.(post.id)
                    setShowActions(false)
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl
                             bg-surface hover:bg-surface-hover border border-border
                             text-fg transition-all duration-200 mobile-touch-large"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Share className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">分享貼文</div>
                    <div className="text-xs text-muted">透過系統分享功能</div>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    copyLink()
                    setShowActions(false)
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl
                             bg-surface hover:bg-surface-hover border border-border
                             text-fg transition-all duration-200 mobile-touch-large"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Copy className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">複製連結</div>
                    <div className="text-xs text-muted">將連結複製到剪貼簿</div>
                  </div>
                </button>
              </div>
              
              <div className="h-[env(safe-area-inset-bottom)]"></div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
