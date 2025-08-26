import { useState, useEffect, useRef } from 'react'
import { getJSON, HttpError } from '@/lib/http'
import { validatePostList, type PostList as PostListType, type Post } from '@/schemas/post'
import { MobilePostCard } from './MobilePostCard'
import { QuickPostFab } from './QuickPostFab'
import { RefreshCw, AlertCircle, ChevronUp } from 'lucide-react'

interface MobilePostListProps {
  injectedItems?: any[]
}

export function MobilePostList({ injectedItems = [] }: MobilePostListProps) {
  const [data, setData] = useState<PostListType | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const perPage = 15

  const haptic = (ms = 10) => { 
    try { 
      if ('vibrate' in navigator) navigator.vibrate(ms) 
    } catch {} 
  }

  const fetchPage = async (p = 1, refresh = false) => {
    if ((loading && !refresh) || (p > 1 && !hasMore)) return
    
    setLoading(true)
    if (refresh) setRefreshing(true)
    setError(null)
    
    try {
      const slug = localStorage.getItem('school_slug') || ''
      let q = ''
      
      // 檢查用戶是否為總管理員
      let isDevAdmin = false
      try {
        const profileResponse = await fetch('/api/auth/profile', { cache: 'no-store' })
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          isDevAdmin = profileData.role === 'dev_admin'
        }
      } catch (e) {
        // 忽略錯誤，繼續執行
      }
      
      if (slug) {
        q = `&school=${encodeURIComponent(slug)}`
      } else if (isDevAdmin) {
        q = '&all_schools=true'
      }
      
      const url = `/api/posts/list?limit=${perPage}&page=${p}${q}`
      const result = await getJSON(url)
      const validated = validatePostList(result)
      
      if (refresh || p === 1) {
        setData(validated)
      } else {
        setData(prev => ({
          ...validated,
          posts: [...(prev?.posts || []), ...validated.posts]
        }))
      }
      
      setHasMore(validated.posts.length === perPage)
      setPage(refresh ? 2 : p + 1)
      
    } catch (err) {
      const message = err instanceof HttpError ? err.message : '載入失敗'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // 初始載入
  useEffect(() => {
    fetchPage(1, true)
  }, [])

  // 滾動監聽
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      
      // 顯示回到頂部按鈕
      setShowScrollTop(scrollTop > 500)
      
      // 無限滾動
      if (scrollHeight - scrollTop - clientHeight < 300 && hasMore && !loading) {
        fetchPage(page)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [page, hasMore, loading])

  // 下拉刷新
  const handlePullRefresh = () => {
    haptic(12)
    fetchPage(1, true)
  }

  const scrollToTop = () => {
    haptic(8)
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleReaction = async (postId: number, reaction: string) => {
    haptic(8)
    try {
      await fetch(`/api/posts/${postId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction })
      })
      // 重新載入該貼文數據
      fetchPage(1, true)
    } catch (err) {
      console.warn('反應失敗:', err)
    }
  }

  const handleShare = async (postId: number) => {
    haptic(12)
    try {
      const url = `${window.location.origin}/post/${postId}`
      if (navigator.share) {
        await navigator.share({
          title: '校園匿名討論',
          url
        })
      } else {
        await navigator.clipboard.writeText(url)
        // 可以顯示一個 toast 通知
      }
    } catch (err) {
      console.warn('分享失敗:', err)
    }
  }

  const handlePostCreated = (post: any) => {
    // 新貼文加入到列表頂部（本地占位）
    setData(prev => prev ? {
      ...prev,
      posts: [post, ...prev.posts]
    } : null)
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <AlertCircle className="w-12 h-12 text-muted mb-4" />
        <p className="text-center text-muted mb-4">{error}</p>
        <button
          onClick={() => fetchPage(1, true)}
          className="px-4 py-2 bg-primary text-white rounded-lg font-medium"
        >
          重新載入
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      {/* 下拉刷新提示 */}
      <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-center py-3">
          {refreshing ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>更新中...</span>
            </div>
          ) : (
            <button
              onClick={handlePullRefresh}
              className="text-sm text-primary hover:text-primary-600 font-medium"
            >
              下拉刷新
            </button>
          )}
        </div>
      </div>

      {/* 貼文列表 */}
      <div className="p-4 pb-24">
        {/* 注入的本地項目 */}
        {injectedItems.map((item, index) => (
          <MobilePostCard 
            key={item.tempKey || `injected-${index}`}
            post={item}
            onReaction={handleReaction}
            onShare={handleShare}
          />
        ))}

        {/* 服務器貼文 */}
        {data?.posts.map((post) => (
          <MobilePostCard
            key={post.id}
            post={post}
            onReaction={handleReaction}
            onShare={handleShare}
          />
        ))}

        {/* 載入更多 */}
        {loading && page > 1 && (
          <div className="flex justify-center py-6">
            <RefreshCw className="w-6 h-6 animate-spin text-muted" />
          </div>
        )}

        {/* 沒有更多內容 */}
        {!hasMore && data?.posts.length && data.posts.length > 5 && (
          <div className="text-center py-6 text-muted text-sm">
            沒有更多貼文了
          </div>
        )}

        {/* 空狀態 */}
        {data?.posts.length === 0 && injectedItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted mb-4">還沒有任何貼文</p>
            <p className="text-sm text-muted">成為第一個發文的人吧！</p>
          </div>
        )}
      </div>

      {/* 回到頂部按鈕 */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed right-4 bottom-32 z-30 w-10 h-10 bg-surface/90 backdrop-blur
                     border border-border rounded-full shadow-lg
                     flex items-center justify-center transition-all duration-200
                     hover:bg-surface active:scale-95"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* 快速發文 FAB */}
      <QuickPostFab onPostCreated={handlePostCreated} />
    </div>
  )
}