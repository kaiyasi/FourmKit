import { useEffect, useState, useRef } from 'react'
import { getJSON, HttpError } from '../lib/http'
import { validatePostList, type PostList as PostListType } from '../schemas/post'
import { dedup, makeTempKey, hash } from '../utils/client'
import ErrorBox from './ui/ErrorBox'
import { Pin, Megaphone, MessageCircle, Trash2, Link as LinkIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import { getRole } from '@/utils/auth'
import { formatLocalMinute } from '@/utils/time'
import CommentSection from '@/components/CommentSection'

type SchoolInfo = { id: number; slug: string; name: string }

const isRealId = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const isTrue = (v: any) => v === true || v === 1 || v === '1' || (typeof v === 'string' && ['true','yes'].includes(v.toLowerCase()))

function isVideoPath(path: string | null | undefined, kind?: string | null): boolean {
  if ((kind || '').toLowerCase() === 'video') return true
  const p = (path || '').toLowerCase()
  return /\.(mp4|webm|mov)$/i.test(p)
}

function hasImageAttachment(p: any): boolean {
  try {
    if (p?.has_media && !isVideoPath(p?.cover_path, p?.media_kind)) return true
    const cover = (p?.cover_path || '').toLowerCase()
    if (cover && !isVideoPath(cover, p?.media_kind)) return true
    if (typeof p?.media_count === 'number' && p.media_count > 0) return true
  } catch {}
  return false
}

function getAnnouncementInfo(p: any): { isAnnouncement: boolean; label: string } {
  if ((p as any).is_announcement) {
    const announcementType = (p as any).announcement_type
    switch(announcementType) {
      case 'platform': return { isAnnouncement: true, label: '全平台公告' }
      case 'cross': return { isAnnouncement: true, label: '跨校公告' }
      case 'school': return { isAnnouncement: true, label: '學校公告' }
      default: return { isAnnouncement: true, label: '公告' }
    }
  }
  return { isAnnouncement: false, label: '' }
}

function isAdvertisement(p: any): boolean {
  return !!(p as any).is_advertisement
}

function displayMetaName(p: any, schools: SchoolInfo[]) {
  if (p.is_announcement === true || p.is_announcement === 1 || p.is_announcement === '1' || p.is_announcement === 'true') {
    const announcementType = p.announcement_type
    switch(announcementType) {
      case 'platform': return '全平台公告'
      case 'cross': return '跨校公告'
      case 'school': {
        const obj = p?.school && typeof p.school === 'object' ? p.school : null
        const fromObj = obj ? String(obj.name || obj.slug || '').trim() : ''
        if (fromObj) return fromObj
        
        const sidRaw = p?.school_id
        let sid: number | null = null
        if (typeof sidRaw === 'number' && Number.isFinite(sidRaw)) sid = sidRaw
        else if (typeof sidRaw === 'string' && /^\d+$/.test(sidRaw)) sid = parseInt(sidRaw, 10)
        
        if (sid !== null) {
          const found = schools.find(s => s.id === sid)
          const schoolName = (found?.name || found?.slug || '').trim()
          if (schoolName) return schoolName
        }
        return '學校公告'
      }
      default: return '公告'
    }
  }
  
  if (p.is_advertisement === true || p.is_advertisement === 1 || p.is_advertisement === '1' || p.is_advertisement === 'true') {
    return '廣告'
  }

  const obj = p?.school && typeof p.school === 'object' ? p.school : null
  const fromObj = obj ? String(obj.name || obj.slug || '').trim() : ''
  if (fromObj) return fromObj

  const sidRaw = p?.school_id
  let sid: number | null = null
  if (typeof sidRaw === 'number' && Number.isFinite(sidRaw)) sid = sidRaw
  else if (typeof sidRaw === 'string' && /^\d+$/.test(sidRaw)) sid = parseInt(sidRaw, 10)

  if (sid === null) return '跨校'
  const found = schools.find(s => s.id === sid)
  return (found?.name || found?.slug || '').trim() || '跨校'
}

/**
 *
 */
export default function PostList({ injectedItems = [], showAll = false }: { injectedItems?: any[], showAll?: boolean }) {
  const [data, setData] = useState<PostListType | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const perPage = showAll ? 1000 : 10  // 如果 showAll 為 true，則顯示大量貼文

  const [copiedFor, setCopiedFor] = useState<number | null>(null)
  const longPressRef = useRef<number | null>(null)
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [pinningPost, setPinningPost] = useState<number | null>(null)
  const [showComments, setShowComments] = useState<{ [key: number]: boolean }>({})
  const containerRef = useRef<HTMLDivElement>(null)

  const role = getRole()

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json().catch(()=>({}))
        if (alive && Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  const fetchPage = async (p = 1) => {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const raw = localStorage.getItem('school_slug')
      const kw = (localStorage.getItem('posts_filter_keyword') || '').trim()
      const start = localStorage.getItem('posts_filter_start') || ''
      const end = localStorage.getItem('posts_filter_end') || ''
      let q = ''

      if (raw === null || raw === '__ALL__') {
        q = '&all_schools=true'
      } else if (!raw || raw === '') {
        q = '&cross_only=true'
      } else {
        q = `&school=${encodeURIComponent(raw)}`
      }

      const dateQ = `${start ? `&start=${encodeURIComponent(start)}` : ''}${end ? `&end=${encodeURIComponent(end)}` : ''}`
      const kwQ = kw ? `&q=${encodeURIComponent(kw)}` : ''
      const ts = Date.now()

      const resp = await getJSON<any>(`/api/posts/list?limit=${perPage}&page=${p}${q}${dateQ}${kwQ}&_ts=${ts}`)

      let validated: PostListType
      let pageCount = 0
      let hasTotal = false
      try {
        validated = validatePostList(resp)
        hasTotal = typeof validated.total === 'number'
        pageCount = Array.isArray(validated.items) ? validated.items.length : 0
      } catch (e) {
        if (resp && Array.isArray(resp.items) && (resp.page === undefined || resp.per_page === undefined || resp.total === undefined)) {
          const items = resp.items.map((it: any, idx: number) => {
            if (typeof it?.content !== 'string') it.content = ''
            if (!isRealId(it?.id)) {
              const created_at = typeof it?.created_at === 'string' ? it.created_at : ''
              const author_hash = typeof it?.author_hash === 'string' ? it.author_hash : ''
              const h = parseInt(hash(`${it.content}|${created_at}|${author_hash}|${p}:${idx}`), 10)
              const syntheticId = -Math.max(1, (isFinite(h) && h > 0 ? h : (p * 1_000_000 + idx + 1)))
              it.id = syntheticId
              it.tempKey = makeTempKey(String(it.content || ''), String(created_at || ''), String(author_hash || ''), `idx:${p}:${idx}`)
            }
            return it
          })
          validated = validatePostList({ items, page: p, per_page: perPage, total: items.length })
          pageCount = items.length
          hasTotal = false
        } else {
          throw e
        }
      }

      if (p === 1) setData(validated)
      else setData(prev => prev ? { ...validated, items: dedup([...(prev.items as any[]), ...(validated.items as any[])]) as any } : validated)

      if (hasTotal) setHasMore(p * perPage < validated.total)
      else setHasMore(pageCount === perPage)

      setPage(p)
    } catch (e) {
      if (e instanceof HttpError) setError(e.message)
      else if (e instanceof Error) setError(e.message)
      else setError('載入貼文時發生未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPage(1) }, [])
  useEffect(() => {
    const onChanged = () => fetchPage(1)
    window.addEventListener('fk_school_changed', onChanged as any)
    window.addEventListener('fk_reload_posts', onChanged as any)
    window.addEventListener('fk_filter_changed', onChanged as any)
    return () => {
      window.removeEventListener('fk_school_changed', onChanged as any)
      window.removeEventListener('fk_reload_posts', onChanged as any)
      window.removeEventListener('fk_filter_changed', onChanged as any)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current || document.documentElement
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container === document.documentElement ? 
        { scrollTop: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight } :
        container
      
      if (scrollHeight - scrollTop - clientHeight < 300 && hasMore && !loading) {
        fetchPage(page + 1)
      }
    }

    const target = container === document.documentElement ? window : container
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => target.removeEventListener('scroll', handleScroll)
  }, [page, hasMore, loading])

  const allItems = data ? (data.items as any[]) : []

  const copyLink = async (id?: number) => {
    if (!isRealId(id)) return
    const url = `${location.origin}/posts/${id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedFor(id)
      setTimeout(() => setCopiedFor(cur => (cur === id ? null : cur)), 1500)
      try { if ('vibrate' in navigator) (navigator as any).vibrate(12) } catch {}
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedFor(id)
      setTimeout(() => setCopiedFor(cur => (cur === id ? null : cur)), 1500)
    }
  }

  const handlePin = async (postId: number, isPinned: boolean) => {
    if (!isRealId(postId)) return
    if (pinningPost === postId) return
    if (!['campus_admin', 'dev_admin'].includes(role || '')) return

    setPinningPost(postId)
    try {
      const endpoint = `/api/posts/${postId}/pin`
      const token = localStorage.getItem('token')
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_pinned: !isPinned })
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error?.message || result.message || '置頂操作失敗')
      }
      setData(prev => {
        if (!prev) return prev
        const updated = (prev.items as any[]).map((it: any) =>
          it.id === postId ? { ...it, is_pinned: !isPinned, pinned_at: !isPinned ? new Date().toISOString() : null } : it
        )
        return { ...prev, items: updated as any[] }
      })
    } catch (error: any) {
      const msg = String(error?.message || '')
      if (/已置頂|already\s*pinned/i.test(msg) || /已取消置頂|already\s*un\s*pinned/i.test(msg)) {
        setData(prev => {
          if (!prev) return prev
          const updated = (prev.items as any[]).map((it: any) =>
            it.id === postId ? { ...it, is_pinned: !isPinned, pinned_at: !isPinned ? new Date().toISOString() : null } : it
          )
          return { ...prev, items: updated as any[] }
        })
      } else {
        alert(error.message || '置頂操作失敗')
      }
    } finally {
      setPinningPost(null)
    }
  }

  const handleDeleteRequest = async (postId: number, reason: string) => {
    if (!isRealId(postId)) return
    try {
      const response = await fetch(`/api/posts/${postId}/delete_request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ reason })
      })
      if (response.ok) alert('刪文請求已提交')
      else {
        const errorData = await response.json().catch(() => ({} as any))
        alert(errorData.error || errorData?.message || '提交失敗')
      }
    } catch (err) {
      console.warn('刪文請求失敗:', err)
      alert('提交失敗，請稍後再試')
    }
  }

  if (loading && !data) return <div className="text-center py-8 text-muted">載入中...</div>
  if (error) return <ErrorBox message={error} title="載入貼文失敗" />
  if (!Array.isArray(allItems)) return <ErrorBox message="資料格式錯誤：items 非陣列" />

  return (
    <div ref={containerRef} className="space-y-3 mobile-list oppo-list-lg">
      {allItems.length === 0 ? (
        <div className="text-center py-8 text-muted mobile-text-base oppo-text-lg">目前沒有貼文。</div>
      ) : (
        allItems.map((p: any, idx: number) => {
          const cover = (typeof p.cover_path === 'string')
            ? (p.cover_path.startsWith('public/')
                ? `https://cdn.serelix.xyz/${p.cover_path.replace(/^public\//, '')}`
                : (p.cover_path.startsWith('media/')
                    ? `https://cdn.serelix.xyz/${p.cover_path}`
                    : null))
            : null
          const count = typeof p.media_count === 'number' ? p.media_count : 0
          const realId = isRealId(p.id)

          const ann = getAnnouncementInfo(p)
          const ad = isAdvertisement(p)

          const Cover = () => {
            const [imgLoading, setImgLoading] = useState(!!cover);
            const [imgError, setImgError] = useState(false);
            const [url] = useState<string | null>(cover);

            const isVideo = (path: string) => {
                return /\.(mp4|webm|mov)$/i.test(path || '') ||
                    (p.media_kind && p.media_kind === 'video');
            };

            if (!url) return null;

            const mediaEl = isVideo(p.cover_path || '') ? (
                <div className="w-full h-48 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center relative group">
                    <video
                        src={url}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                        onLoadedMetadata={() => setImgLoading(false)}
                        onError={() => { setImgLoading(false); setImgError(true); }} />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                </div>
            ) : (
                <img
                    src={url}
                    alt="封面"
                    className={`w-full h-48 object-cover transition-opacity ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
                    loading="lazy"
                    onLoad={() => setImgLoading(false)}
                    onError={() => { setImgLoading(false); setImgError(true); }} />
            );

            const inner = (
                <div className="mb-3 relative overflow-hidden rounded-lg border border-border bg-surface/50">
                    {imgError ? (
                        <div className="w-full h-48 grid place-items-center text-xs text-muted">
                            {isVideo(p.cover_path || '') ? '影片載入失敗' : '封面載入失敗'}
                        </div>
                    ) : mediaEl}

                    {imgLoading && <div className="absolute inset-0 animate-pulse bg-neutral-200 dark:bg-neutral-800" />}

                    {count > 1 && (
                        <span className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded-md bg-neutral-900/70 text-white">
                            {isVideo(p.cover_path || '') ? `${count} 個檔案` : `${count} 張`}
                        </span>
                    )}

                    {isVideo(p.cover_path || '') && (
                        <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-md bg-red-600/90 text-white flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            影片
                        </span>
                    )}
                </div>
            );
            return realId ? <Link to={`/posts/${p.id}`}>{inner}</Link> : inner;
          };

          return (
          <article
            id={realId ? `post-${p.id}` : undefined}
            key={realId ? p.id : p.tempKey ?? `fallback-${idx}`}
            data-ann={String(ann.isAnnouncement)}
            data-ann-label={ann.label}
            data-ad={String(ad)}
            className={`rounded-xl border border-border bg-surface p-4 relative mobile-card mobile-list-item oppo-post-lg oppo-list-item-lg ${p.is_pinned ? 'ring-2 ring-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-900/10' : ''} ${ad ? 'border-blue-500/30 bg-blue-50/30 dark:bg-blue-900/10' : ''} ${ann.isAnnouncement ? 'border-orange-500/30 bg-orange-50/30 dark:bg-orange-900/10' : ''}`}
          >
            <div className="text-xs text-muted mb-2 mobile-text-sm oppo-text-lg break-words">
              <div className="flex items-center gap-2 flex-wrap">
                
                {p.is_pinned && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-medium">
                    <Pin className="w-3 h-3" />
                    置頂
                  </span>
                )}
                {ad && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
                    <Megaphone className="w-3 h-3" />
                    廣告
                  </span>
                )}
                {ann.isAnnouncement && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400">
                    <Megaphone className="w-3 h-3" />
                    {ann.label}
                  </span>
                )}
                {hasImageAttachment(p) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    圖片附件
                  </span>
                )}

                <div className="flex-1">
                  <>
                    {realId ? `#${p.id}` : '#?'} <span className="mx-1">•</span> {p.created_at ? formatLocalMinute(p.created_at) : '時間未知'}
                    {(() => {
                      const name = displayMetaName(p, schools)
                      return name ? (<><span className="mx-1">•</span> <span className="text-fg">{name}</span></>) : null
                    })()}
                  </>
                </div>
              </div>
            </div>

            <Cover />

            
            {isRealId(p.reply_to_id) && (
              <div className="text-xs text-muted mb-2">
                <Link to={`/posts/${p.reply_to_id}`} className="hover:underline">回覆貼文 #{p.reply_to_id}</Link>
              </div>
            )}

            {realId ? (
              <Link to={`/posts/${p.id}`} className="block hover:opacity-90 transition-opacity">
                <SafeHtmlContent 
                  html={p.content} 
                  className="prose prose-sm max-w-none text-fg mobile-text-base oppo-text-lg line-clamp-8 md-line-clamp-12"
                  allowLinks 
                />
              </Link>
            ) : (
              <SafeHtmlContent 
                html={p.content} 
                className="prose prose-sm max-w-none text-fg mobile-text-base oppo-text-lg line-clamp-8 md-line-clamp-12"
                allowLinks 
              />
            )}

            
            {realId && showComments[p.id] && (
              <div className="mt-4">
                <CommentSection 
                  postId={p.id} 
                  initialTotal={p.comment_count || 0}
                />
              </div>
            )}

            <div
              className="mt-3 space-y-2"
              onTouchStart={() => {
                if (!realId) return
                try { if (!matchMedia('(pointer: coarse)').matches) return } catch {}
                if (longPressRef.current) clearTimeout(longPressRef.current as any)
                longPressRef.current = setTimeout(() => copyLink(p.id), 600) as any
              }}
              onTouchEnd={() => { if (longPressRef.current) { clearTimeout(longPressRef.current as any); longPressRef.current = null } }}
              onTouchCancel={() => { if (longPressRef.current) { clearTimeout(longPressRef.current as any); longPressRef.current = null } }}
            >
              
              <div className="flex items-center justify-end gap-2">
                {realId && (
                  p.is_pinned
                    ? (['campus_admin', 'dev_admin'].includes(role || '') && (
                        <button
                          onClick={() => handlePin(p.id, true)}
                          disabled={pinningPost === p.id}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                            pinningPost === p.id ? 'opacity-50 cursor-not-allowed' : 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-800/30 dark:text-red-400'
                          }`}
                          title="取消置頂"
                        >
                          <Pin className="w-4 h-4" />
                          <span>{pinningPost === p.id ? '處理中...' : '取消置頂'}</span>
                        </button>
                      ))
                    : (['campus_admin', 'dev_admin'].includes(role || '') && (
                        <button
                          onClick={() => handlePin(p.id, false)}
                          disabled={pinningPost === p.id}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                            pinningPost === p.id ? 'opacity-50 cursor-not-allowed' : 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:hover:bg-yellow-800/30 dark:text-yellow-400'
                          }`}
                          title="置頂貼文"
                        >
                          <Pin className="w-4 h-4" />
                          <span>{pinningPost === p.id ? '處理中...' : '置頂'}</span>
                        </button>
                      ))
                )}

                {realId && (
                  <button
                    onClick={() => setShowComments(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-surface-hover hover:bg-surface-active text-muted hover:text-fg"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>留言</span>
                    {typeof p.comment_count === 'number' && p.comment_count > 0 && (
                      <span className="font-medium">{p.comment_count}</span>
                    )}
                  </button>
                )}
              </div>

              
              <div className="flex items-center justify-end gap-2">
                {realId && (
                  <button
                    onClick={() => {
                      const reason = prompt('請輸入刪文理由：')
                      if (reason && reason.trim()) handleDeleteRequest(p.id, reason.trim())
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-800/30 dark:text-red-400"
                    title="申請刪除貼文"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>刪文請求</span>
                  </button>
                )}

                {realId && (
                  <button
                    onClick={() => copyLink(p.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-surface-hover hover:bg-surface-active text-muted hover:text-fg"
                    title="複製貼文連結"
                  >
                    <LinkIcon className="w-4 h-4" />
                    <span>{copiedFor === p.id ? '已複製' : '貼文連結'}</span>
                  </button>
                )}
              </div>
            </div>
          </article>
        )})
      )}
      <div className="pt-2">
        {loading && page > 1 ? (
          <div className="text-center text-muted text-sm py-2">載入中...</div>
        ) : !hasMore && allItems.length > 0 ? (
          <div className="text-center text-muted text-sm py-2">沒有更多了</div>
        ) : null}
      </div>
    </div>
  )
}
