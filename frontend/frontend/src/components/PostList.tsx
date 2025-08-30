// frontend/src/components/PostList.tsx
import { useEffect, useState, useRef } from 'react'
import { getJSON, HttpError } from '../lib/http'
import { validatePostList, type PostList as PostListType, type Post } from '../schemas/post'
import { dedup, makeTempKey, hash } from '../utils/client'
import ErrorBox from './ui/ErrorBox'
import { Clock, Loader2, Link as LinkIcon, Check, Pin, Megaphone, Trash2, X, AlertTriangle, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import CommentSection from '@/components/CommentSection'
import AnonymousAccountDisplay from './AnonymousAccountDisplay'
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import { getRole } from '@/utils/auth'
import { formatLocalMinute } from '@/utils/time'

type SchoolInfo = { id: number; slug: string; name: string }

export default function PostList({ injectedItems = [] }: { injectedItems?: any[] }) {
  const [data, setData] = useState<PostListType | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const perPage = 10
  const [copiedFor, setCopiedFor] = useState<number | null>(null)
  const longPressRef = useRef<number | null>(null)
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [pinningPost, setPinningPost] = useState<number | null>(null)
  const [deleteRequesting, setDeleteRequesting] = useState<number | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState<number | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showComments, setShowComments] = useState<{ [key: number]: boolean }>({})

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
      const slug = raw === null ? '__ALL__' : raw
      const kw = (localStorage.getItem('posts_filter_keyword') || '').trim()
      const start = localStorage.getItem('posts_filter_start') || ''
      const end = localStorage.getItem('posts_filter_end') || ''
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
      
      if (slug === '__ALL__') {
        q = '&all_schools=true'
      } else if (slug) {
        q = `&school=${encodeURIComponent(slug)}`
      } else {
        // 空字串視為僅跨校
        q = '&cross_only=true'
      }
      
      const dateQ = `${start ? `&start=${encodeURIComponent(start)}` : ''}${end ? `&end=${encodeURIComponent(end)}` : ''}`
      const kwQ = kw ? `&q=${encodeURIComponent(kw)}` : ''
      const announcementQ = '&include_announcements=true' // 確保公告不受學校過濾限制
      const ts = Date.now()
      const resp = await getJSON<any>(`/api/posts/list?limit=${perPage}&page=${p}${q}${dateQ}${kwQ}${announcementQ}&_ts=${ts}`)
      let validated: PostListType
      try {
        validated = validatePostList(resp)
      } catch (e) {
        // 寬鬆相容：若後端回傳僅有 { items }，則推導分頁欄位
        if (resp && Array.isArray(resp.items) && (resp.page === undefined || resp.per_page === undefined || resp.total === undefined)) {
          const items = resp.items.map((it: any, idx: number) => {
            // 若缺必填欄位，嘗試溫柔修補：不要亂造負數 id，改給 tempKey
            if (typeof it?.content !== 'string') it.content = ''
            if (typeof it?.id !== 'number') {
              const created_at = typeof it?.created_at === 'string' ? it.created_at : ''
              const author_hash = typeof it?.author_hash === 'string' ? it.author_hash : ''
              // 產生穩定且更不易撞的負號 id（前端臨時用）
              const h = parseInt(hash(`${it.content}|${created_at}|${author_hash}|${p}:${idx}`), 10)
              const syntheticId = -Math.max(1, (isFinite(h) && h > 0 ? h : (p * 1_000_000 + idx + 1)))
              it.id = syntheticId
              // 另外補一個 tempKey 供去重使用（更穩健）
              it.tempKey = makeTempKey(String(it.content || ''), String(created_at || ''), String(author_hash || ''), `idx:${p}:${idx}`)
            }
            return it
          })
          validated = validatePostList({ items, page: p, per_page: perPage, total: items.length })
        } else {
          throw e
        }
      }
      
      if (p === 1) {
        setData(validated)
      } else {
        // 加載更多：合併資料並去重
        setData(prev => prev ? {
          ...validated,
          items: dedup([...prev.items, ...validated.items])
        } : validated)
      }
      
      const loaded = p * perPage
      setHasMore(loaded < validated.total)
      setPage(p)
    } catch (e) {
      if (e instanceof HttpError) {
        setError(e.message)
      } else if (e instanceof Error) {
        setError(e.message)
      } else {
        setError("載入貼文時發生未知錯誤")
      }
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

  // 私有貼文標記（只在本機判定）
  const myIds = (() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem('forumkit_my_posts') || '[]')) } catch { return new Set<number>() }
  })()

  // 僅使用伺服器資料；不再顯示本地「送審預覽」
  const allItems = data ? (data.items as any[]) : [];

  const copyLink = async (id?: number) => {
    if (!id) return
    const url = `${location.origin}/posts/${id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedFor(id)
      setTimeout(() => setCopiedFor(cur => (cur === id ? null : cur)), 1500)
      try { if ('vibrate' in navigator) navigator.vibrate(12) } catch {}
    } catch {
      // fallback
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
    if (pinningPost === postId) return
    
    setPinningPost(postId)
    try {
      // 統一改走 PATCH /api/posts/:id/pin { is_pinned }
      const endpoint = `/api/posts/${postId}/pin`
      const token = localStorage.getItem('token')
      
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_pinned: !isPinned })
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error?.message || result.message || `置頂操作失敗`)
      }
      
      // 成功時嘗試解析響應，但不強制要求
      const result = await response.json().catch(() => ({ success: true }))

      // 成功後更新本地狀態
      setData(prev => {
        if (!prev) return prev
        const updated = prev.items.map((it: any) => it.id === postId ? { ...it, is_pinned: !isPinned, pinned_at: !isPinned ? new Date().toISOString() : null } : it)
        return { ...prev, items: updated as any[] }
      })
      
    } catch (error: any) {
      console.error('置頂操作失敗:', error)
      const msg = String(error?.message || '')
      
      // 冪等與寬容處理：若後端回「已置頂/已取消置頂」等同成功
      if (/已置頂|already\s*pinned/i.test(msg) || /已取消置頂|already\s*un\s*pinned/i.test(msg)) {
        // 樂觀修正本地顯示
        setData(prev => {
          if (!prev) return prev
          const updated = prev.items.map((it: any) => it.id === postId ? { ...it, is_pinned: !isPinned, pinned_at: !isPinned ? new Date().toISOString() : null } : it)
          return { ...prev, items: updated as any[] }
        })
      } else {
        alert(error.message || '置頂操作失敗')
        // 失敗時恢復原狀態（但通常不需要，因為我們是成功後才更新的）
      }
    } finally {
      setPinningPost(null)
    }
  }

  const handleDeleteRequest = async (postId: number) => {
    if (deleteRequesting === postId) return
    
    setDeleteRequesting(postId)
    setDeleteError(null)
    
    try {
      // 構建 headers，如果有 token 就加上，沒有也沒關係
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      const token = localStorage.getItem('token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await fetch(`/api/posts/${postId}/delete_request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: deleteReason.trim() })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error?.message || result.message || '刪文請求失敗')
      }

      // 成功後關閉對話框並清空狀態
      setShowDeleteDialog(null)
      setDeleteReason('')
      alert('刪文請求已送出，管理員會盡快處理')
      
    } catch (error: any) {
      console.error('刪文請求失敗:', error)
      setDeleteError(error.message || '刪文請求失敗')
    } finally {
      setDeleteRequesting(null)
    }
  }

  if (loading && !data) {
    return <div className="text-center py-8 text-muted">載入中...</div>
  }

  if (error) {
    return <ErrorBox message={error} title="載入貼文失敗" />
  }

  if (!Array.isArray(allItems)) {
    return <ErrorBox message="資料格式錯誤：items 非陣列" />
  }

  return (
    <div className="space-y-3 mobile-list oppo-list-lg">
      {allItems.length === 0 ? (
        <div className="text-center py-8 text-muted mobile-text-base oppo-text-lg">目前沒有貼文。</div>
      ) : (
        allItems.map((p: any) => {
          const cover = (typeof p.cover_path === 'string')
            ? (
              p.cover_path.startsWith('public/')
                ? `https://cdn.serelix.xyz/${p.cover_path.replace(/^public\//, '')}`
                : (p.cover_path.startsWith('media/')
                    ? `https://cdn.serelix.xyz/${p.cover_path}`
                    : null)
            )
            : null
          // 支援 public/<id>.<ext>（新）與 public/media/<id>.<ext>（舊）
          const m1 = typeof p.cover_path === 'string' ? p.cover_path.match(/public\/(?:media\/)?(\d+)\./) : null
          const coverId = m1 ? Number(m1[1]) : null
          const role = getRole()
          const canUsePreviewApi = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role || '')
          const count = typeof p.media_count === 'number' ? p.media_count : 0
          const Cover = () => {
            const [loading, setLoading] = useState(!!cover)
            const [error, setError] = useState(false)
            const [url, setUrl] = useState<string | null>(cover)

            // 移除管理員預覽API調用，直接使用靜態檔案路徑

            if (!url) return null
            const inner = (
              <div className="mb-3 relative overflow-hidden rounded-lg border border-border bg-surface/50">
                {!error && (
                  <img
                    src={url}
                    alt="封面"
                    className={`w-full h-48 object-cover transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
                    loading="lazy"
                    onLoad={() => setLoading(false)}
                    onError={() => { setLoading(false); setError(true) }}
                  />
                )}
                {loading && (
                  <div className="absolute inset-0 animate-pulse bg-neutral-200 dark:bg-neutral-800" />
                )}
                {error && (
                  <div className="w-full h-48 grid place-items-center text-xs text-muted">封面載入失敗</div>
                )}
                {count > 1 && (
                  <span className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded-md bg-neutral-900/70 text-white">
                    {count} 張
                  </span>
                )}
              </div>
            )
            return p.id ? <Link to={`/posts/${p.id}`}>{inner}</Link> : inner
          }
          return (
          <article id={p.id ? `post-${p.id}` : undefined} key={p.id ?? p.tempKey ?? `fallback-${allItems.indexOf(p)}`} className={`rounded-xl border border-border bg-surface p-4 relative mobile-card mobile-list-item oppo-post-lg oppo-list-item-lg ${(p as any).is_pinned ? 'ring-2 ring-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-900/10' : ''} ${(p as any).is_advertisement ? 'border-blue-500/30 bg-blue-50/30 dark:bg-blue-900/10' : ''} ${(p as any).is_announcement ? 'border-orange-500/30 bg-orange-50/30 dark:bg-orange-900/10' : ''}`}>
            <div className="text-xs text-muted mb-2 mobile-text-sm oppo-text-lg break-words">
              <div className="flex items-center gap-2 flex-wrap">
                {/* 置頂和廣告標記 */}
                {(p as any).is_pinned && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-medium">
                    <Pin className="w-3 h-3" />
                    置頂
                  </span>
                )}
                {(p as any).is_advertisement && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
                    <Megaphone className="w-3 h-3" />
                    廣告
                  </span>
                )}
                {(p as any).is_announcement && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                    (p as any).announcement_type === 'platform' 
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' 
                      : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                  }`}>
                    <Megaphone className="w-3 h-3" />
                    {(p as any).announcement_type === 'platform' ? '全平台公告' : 
                     (p as any).announcement_type === 'cross' ? '跨校公告' : '公告'}
                  </span>
                )}
                
                <div className="flex-1">
                  {(() => {
                    const nameField = String((p as any).school_name || '').trim()
                    const obj = (p as any).school as any
                    const fromObj = obj && typeof obj === 'object' ? String(obj.name || obj.slug || '').trim() : ''
                    const sidRaw = (p as any).school_id
                    const sidNum = ((): number | null => {
                      if (typeof sidRaw === 'number') return Number.isFinite(sidRaw) ? sidRaw : null
                      if (typeof sidRaw === 'string' && /^\d+$/.test(sidRaw)) {
                        const n = parseInt(sidRaw, 10)
                        return Number.isFinite(n) ? n : null
                      }
                      return null
                    })()
                    const hasSid = typeof sidNum === 'number' && sidNum !== null
                    const mapped = hasSid ? ((schools.find(s=>s.id===sidNum)?.name || schools.find(s=>s.id===sidNum)?.slug || '').trim()) : ''
                    const name = nameField || fromObj || (
                      (p as any).is_advertisement ? '廣告' : 
                      !hasSid ? '跨校' : mapped
                    )
                    return (
                      <>
                        #{p.id} <span className="mx-1">•</span> {p.created_at ? formatLocalMinute(p.created_at) : '時間未知'}
                        {name ? (<><span className="mx-1">•</span> <span className="text-fg">{name}</span></>) : null}
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
            <Cover />
            {p.id ? (
              <Link to={`/posts/${p.id}`} className="block hover:opacity-90 transition-opacity">
                <SafeHtmlContent 
                  html={p.content}
                  className="prose prose-sm max-w-none text-fg mobile-text-base oppo-text-lg"
                  allowLinks={true}
                />
              </Link>
            ) : (
              <SafeHtmlContent 
                html={p.content}
                className="prose prose-sm max-w-none text-fg mobile-text-base oppo-text-lg"
                allowLinks={true}
              />
            )}
            
            {/* 留言與反應系統 */}
            {p.id && showComments[p.id] && <CommentSection postId={p.id} initialTotal={(p as any).comment_count || 0} />}
            
            <div
              className="mt-3 flex items-center justify-end gap-2 mobile-gap-sm"
              onTouchStart={(e) => {
                if (!p.id) return
                // 僅在粗略指標（手機）時啟用長按
                try { if (!matchMedia('(pointer: coarse)').matches) return } catch {}
                if (longPressRef.current) clearTimeout(longPressRef.current as any)
                // @ts-ignore NodeJS.Timeout for both env
                longPressRef.current = setTimeout(() => copyLink(p.id), 600) as any
              }}
              onTouchEnd={() => { if (longPressRef.current) { clearTimeout(longPressRef.current as any); longPressRef.current = null } }}
              onTouchCancel={() => { if (longPressRef.current) { clearTimeout(longPressRef.current as any); longPressRef.current = null } }}
            >
              {myIds.has(p.id) && p.created_at ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200">
                  <Clock className="w-3.5 h-3.5" /> {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}

              {/* 刪文請求按鈕 - 所有登入用戶都可以申請 */}
              {p.id && localStorage.getItem('token') && (
                <button
                  onClick={() => setShowDeleteDialog(p.id)}
                  disabled={deleteRequesting === p.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-800/30 dark:text-red-400 disabled:opacity-50"
                  title="申請刪除貼文"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deleteRequesting === p.id ? '處理中...' : '刪文請求'}</span>
                </button>
              )}

              {/* 桌機：貼文連結按鈕（所有人可見） */}
              {p.id && (
                <button
                  onClick={() => copyLink(p.id)}
                  className={`hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all ${
                    copiedFor === p.id ? 'bg-primary text-white shadow-sm' : 'bg-surface-hover hover:bg-surface-active text-muted hover:text-fg'
                  }`}
                  title="複製貼文連結"
                >
                  {copiedFor === p.id ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                  <span>{copiedFor === p.id ? '已複製' : '貼文連結'}</span>
                </button>
              )}

              {/* 置頂按鈕（僅admin可見） */}
              {p.id && ((p as any).is_pinned ? 
                // 取消置頂按鈕（campus_admin 與 dev_admin 可見）
                (['campus_admin', 'dev_admin'].includes(role || '') && (
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
                )) :
                // 置頂按鈕（campus_admin和dev_admin可見）
                (['campus_admin', 'dev_admin'].includes(role || '') && (
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

              {/* 留言按鈕 */}
              {p.id && (
                <button
                  onClick={() => setShowComments(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-surface-hover hover:bg-surface-active text-muted hover:text-fg"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>留言</span>
                  {(p as any).comment_count > 0 && <span className="font-medium">{(p as any).comment_count}</span>}
                </button>
              )}
            </div>
          </article>
        )})
      )}
      <div className="pt-2">
        {hasMore ? (
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={loading}
            className="px-4 py-2 rounded-xl border bg-surface/60 hover:bg-surface/80 border-border text-sm"
          >
            {loading ? '載入中…' : '載入更多'}
          </button>
        ) : allItems.length > 0 ? (
          <div className="text-center text-muted text-sm py-2">沒有更多了</div>
        ) : null}
      </div>

      {/* 刪文理由輸入 Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div 
            style={{ 
              background: 'var(--surface)',
              border: '1px solid var(--border)' 
            }}
            className="rounded-2xl shadow-2xl p-7 w-full max-w-md relative animate-fadein"
          >
            <button
              style={{ color: 'var(--muted)' }}
              className="absolute top-3 right-3 transition-colors hover:opacity-70"
              onClick={() => {
                setShowDeleteDialog(null)
                setDeleteReason('')
                setDeleteError(null)
              }}
              disabled={deleteRequesting === showDeleteDialog}
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-4 text-red-700 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              申請刪除貼文
            </h2>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>刪除理由</label>
              <textarea
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--fg)'
                }}
                className="w-full rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[60px]"
                rows={3}
                placeholder="請輸入刪除理由..."
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                disabled={deleteRequesting === showDeleteDialog}
                maxLength={300}
              />
              <div className="text-xs mt-1 text-right" style={{ color: 'var(--muted)' }}>{deleteReason.length}/300</div>
            </div>
            {deleteError && (
              <div 
                className="mb-3 p-2 rounded text-xs flex items-center gap-2"
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger-text)'
                }}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button
                style={{
                  background: 'var(--button-secondary)',
                  color: 'var(--fg)'
                }}
                className="px-4 py-2 rounded-lg font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
                onClick={() => {
                  setShowDeleteDialog(null)
                  setDeleteReason('')
                  setDeleteError(null)
                }}
                disabled={deleteRequesting === showDeleteDialog}
              >取消</button>
              <button
                style={{
                  background: 'var(--danger)',
                  color: 'white'
                }}
                className="px-4 py-2 rounded-lg font-semibold shadow transition-colors hover:opacity-90 disabled:opacity-50"
                onClick={() => handleDeleteRequest(showDeleteDialog)}
                disabled={deleteRequesting === showDeleteDialog || !deleteReason.trim()}
              >{deleteRequesting === showDeleteDialog ? '送出中...' : '送出申請'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
