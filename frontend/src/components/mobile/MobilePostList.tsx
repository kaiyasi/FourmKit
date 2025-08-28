import { useState, useEffect, useRef } from 'react'
import { getJSON, HttpError } from '@/lib/http'
import { validatePostList, type PostList as PostListType } from '@/schemas/post'
import { MobilePostCard } from './MobilePostCard'
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
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const pullThreshold = 80
  const perPage = 15
  const [schools, setSchools] = useState<{ id:number; slug:string; name:string }[]>([])
  // 手機版搜尋/篩選
  const [kw, setKw] = useState<string>(()=>{ try{ return localStorage.getItem('posts_filter_keyword')||'' }catch{ return '' }})
  const [start, setStart] = useState<string>(()=>{ try{ return localStorage.getItem('posts_filter_start')||'' }catch{ return '' }})
  const [end, setEnd] = useState<string>(()=>{ try{ return localStorage.getItem('posts_filter_end')||'' }catch{ return '' }})
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false)
  const [selectedSchool, setSelectedSchool] = useState<string>(()=>{
    try {
      const v = localStorage.getItem('school_slug')
      return v === null ? '__ALL__' : v
    } catch {
      return '__ALL__'
    }
  })

  useEffect(()=>{
    let abort = false
    ;(async()=>{
      try{
        const res = await fetch('/api/schools/list?limit=1000&page=1')
        if(!res.ok) return
        const data = await res.json()
        if(abort) return
        const items = (data?.items || data?.schools || []) as any[]
        setSchools(items.map(s=>({ id: s.id, slug: s.slug, name: s.name })))
      }catch{}
    })()
    return ()=>{ abort = true }
  }, [])

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
      const raw = localStorage.getItem('school_slug')
      const slug = raw === null ? '__ALL__' : raw
      const startStored = localStorage.getItem('posts_filter_start') || ''
      const endStored = localStorage.getItem('posts_filter_end') || ''
      const kwStored = (localStorage.getItem('posts_filter_keyword') || '').trim()
      let q = ''
      
      console.log('🏫 [DEBUG] MobilePostList fetchPage:', {
        page: p,
        refresh,
        storedSlug: slug,
        allStorageKeys: {
          school_slug: localStorage.getItem('school_slug'),
          current_school_slug: localStorage.getItem('current_school_slug'),
          selected_school_slug: localStorage.getItem('selected_school_slug')
        }
      })
      
      // 檢查用戶是否為總管理員
      let isDevAdmin = false
      try {
        const profileResponse = await fetch('/api/auth/profile', { cache: 'no-store' })
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          isDevAdmin = profileData.role === 'dev_admin'
          console.log('👤 [DEBUG] User profile:', { role: profileData.role, isDevAdmin })
        }
      } catch (e) {
        console.warn('[DEBUG] Profile fetch failed:', e)
      }
      
      if (slug === '__ALL__') {
        q = '&all_schools=true'
        console.log('🌐 [DEBUG] Using ALL schools')
      } else if (slug) {
        q = `&school=${encodeURIComponent(slug)}`
        console.log('🎯 [DEBUG] Using school filter:', { slug, query: q })
      } else {
        if (slug === '') {
          console.log('🌐 [DEBUG] Cross-school only')
          q = `&cross_only=true`
        } else {
          console.log('🌐 [DEBUG] No school selected - showing all schools')
        }
      }

      const dateQ = `${startStored ? `&start=${encodeURIComponent(startStored)}` : ''}${endStored ? `&end=${encodeURIComponent(endStored)}` : ''}`
      const kwQ = kwStored ? `&q=${encodeURIComponent(kwStored)}` : ''
      
      const url = `/api/posts/list?limit=${perPage}&page=${p}${q}${dateQ}${kwQ}`
      console.log('🌐 [DEBUG] API URL:', url)
      const result = await getJSON<any>(url)
      console.log('📦 [DEBUG] API Response:', result)
      // 後端此路由回傳 { items }（無分頁欄位），這裡做寬鬆相容
      let validated: PostListType
      try {
        validated = validatePostList(result)
      } catch {
        const items = Array.isArray(result?.items) ? result.items : []
        validated = validatePostList({ items, page: p, per_page: perPage, total: items.length })
      }
      
      if (refresh || p === 1) {
        setData(validated)
      } else {
        setData(prev => prev ? ({
          ...validated,
          items: [...(prev.items || []), ...validated.items]
        }) : validated)
      }
      
      setHasMore(validated.items.length === perPage)
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

  // 載入學校清單（供顯示名稱 fallback 使用）
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (alive && Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  // 學校切換時自動刷新清單
  useEffect(() => {
    const onSchoolChanged = () => {
      setPage(1)
      setHasMore(true)
      fetchPage(1, true)
      try { if ('vibrate' in navigator) navigator.vibrate(6) } catch {}
    }
    window.addEventListener('fk_school_changed', onSchoolChanged as any)
    return () => window.removeEventListener('fk_school_changed', onSchoolChanged as any)
  }, [])

  // 觸控下拉刷新處理
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchStart = (e: TouchEvent) => {
      // 只有在頁面頂部且不在刷新狀態時才開始拉拽檢測
      if (container.scrollTop === 0 && !refreshing && !loading) {
        startYRef.current = e.touches[0].clientY
        // 不立即設置 isPulling，等到確認是下拉動作時再設置
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      // 如果不在頁面頂部，忽略觸控事件
      if (container.scrollTop > 5) {
        setIsPulling(false)
        setPullDistance(0)
        return
      }

      const currentY = e.touches[0].clientY
      const deltaY = currentY - startYRef.current
      
      // 只有向下拉且距離超過最小閾值時才認為是下拉刷新
      if (deltaY > 10) {
        if (!isPulling) {
          setIsPulling(true)
        }
        
        const distance = Math.max(0, deltaY * 0.4) // 降低拖拽敏感度
        setPullDistance(Math.min(distance, pullThreshold * 1.2))
        
        // 防止頁面滾動
        e.preventDefault()
      } else if (deltaY < -5) {
        // 上拉時立即取消拖拽狀態
        setIsPulling(false)
        setPullDistance(0)
      }
    }

    const handleTouchEnd = () => {
      if (isPulling && pullDistance >= pullThreshold && !refreshing) {
        handlePullRefresh()
      }
      setIsPulling(false)
      setPullDistance(0)
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isPulling, pullDistance])

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
    <div ref={containerRef} className="h-full overflow-y-auto relative">
      {/* 下拉刷新提示 - 只在拉動時顯示 */}
      {(isPulling || refreshing) && (
        <div 
          className="absolute top-0 left-0 right-0 z-10 bg-bg/95 backdrop-blur-sm border-b border-border/30 transition-transform duration-300"
          style={{ 
            transform: `translateY(${isPulling ? pullDistance - pullThreshold : 0}px)`,
            opacity: isPulling ? Math.min(pullDistance / pullThreshold, 1) : 1
          }}
        >
          <div className="flex items-center justify-center py-4">
            {refreshing ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>更新中...</span>
              </div>
            ) : isPulling ? (
              <div className="flex items-center gap-2 text-sm text-primary">
                <RefreshCw 
                  className={`w-4 h-4 transition-transform ${pullDistance >= pullThreshold ? 'rotate-180' : ''}`} 
                />
                <span>{pullDistance >= pullThreshold ? '鬆開刷新' : '繼續下拉'}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 貼文列表 */}
      <div className="mobile-horizontal-padding mobile-vertical-padding pb-24">
        {/* 手機版搜尋/篩選 */}
        <div className="mb-3">
          <button
            className="w-full text-left text-sm px-3 py-2 rounded-xl border border-border bg-surface/70"
            onClick={()=>setFiltersOpen(v=>!v)}
          >{filtersOpen ? '隱藏搜尋篩選' : '顯示搜尋篩選'}</button>
          {filtersOpen && (
            <div className="mt-2 grid grid-cols-1 gap-2">
              <div>
                <label className="text-xs text-muted mb-1 block">學校</label>
                <select
                  className="form-control text-sm"
                  value={selectedSchool}
                  onChange={e=>{
                    const val = e.target.value
                    setSelectedSchool(val)
                    try { localStorage.setItem('school_slug', val) } catch {}
                    fetchPage(1, true)
                  }}
                >
                  <option value="__ALL__">全部學校</option>
                  <option value="">跨校</option>
                  {schools.map(s=> (
                    <option key={s.id} value={s.slug}>{s.name}</option>
                  ))}
                </select>
              </div>
              <input
                value={kw}
                onChange={e=>setKw(e.target.value)}
                placeholder="關鍵字…"
                className="form-control text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={start} onChange={e=>setStart(e.target.value)} className="form-control text-sm" />
                <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="form-control text-sm" />
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-2 rounded-xl border dual-btn text-sm"
                  onClick={()=>{
                    try{
                      kw?.trim() ? localStorage.setItem('posts_filter_keyword', kw.trim()) : localStorage.removeItem('posts_filter_keyword')
                      start ? localStorage.setItem('posts_filter_start', start) : localStorage.removeItem('posts_filter_start')
                      end ? localStorage.setItem('posts_filter_end', end) : localStorage.removeItem('posts_filter_end')
                    }catch{}
                    fetchPage(1, true)
                  }}
                >套用</button>
                <button
                  className="px-3 py-2 rounded-xl border text-sm"
                  onClick={()=>{
                    setKw(''); setStart(''); setEnd('')
                    try{
                      localStorage.removeItem('posts_filter_keyword')
                      localStorage.removeItem('posts_filter_start')
                      localStorage.removeItem('posts_filter_end')
                    }catch{}
                    fetchPage(1, true)
                  }}
                >清除</button>
              </div>
            </div>
          )}
        </div>
        {/* 骨架載入（初次） */}
        {!data && loading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border border-border rounded-2xl p-4 bg-surface/70 animate-pulse">
                <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded mb-3" />
                <div className="h-3 w-full bg-neutral-200 dark:bg-neutral-800 rounded mb-2" />
                <div className="h-3 w-5/6 bg-neutral-200 dark:bg-neutral-800 rounded" />
              </div>
            ))}
          </div>
        )}
        {/* 取消本地送審預覽：只顯示伺服器項目 */}

        {/* 服務器貼文 */}
        {data?.items.map((post) => (
          <MobilePostCard
            key={post.id}
            post={post}
            onReaction={handleReaction}
            onShare={handleShare}
            schools={schools}
          />
        ))}

        {/* 載入更多 */}
        {loading && page > 1 && (
          <div className="flex justify-center py-6">
            <RefreshCw className="w-6 h-6 animate-spin text-muted" />
          </div>
        )}

        {/* 沒有更多內容 */}
        {!hasMore && ((data?.items?.length || 0) > 5) && (
          <div className="text-center py-6 text-muted text-sm">
            沒有更多貼文了
          </div>
        )}

        {/* 空狀態 */}
        {data?.items.length === 0 && (
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

    </div>
  )
}
