// frontend/src/components/PostList.tsx
import { useEffect, useState, useRef } from 'react'
import { getJSON, HttpError } from '../lib/http'
import { validatePostList, type PostList as PostListType, type Post } from '../schemas/post'
import { dedup } from '../utils/client'
import ErrorBox from './ui/ErrorBox'
import { Clock, Loader2, Link as LinkIcon, Check } from 'lucide-react'

export default function PostList({ injectedItems = [] }: { injectedItems?: any[] }) {
  const [data, setData] = useState<PostListType | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const perPage = 10
  const [copiedFor, setCopiedFor] = useState<number | null>(null)
  const longPressRef = useRef<number | null>(null)

  const fetchPage = async (p = 1) => {
    if (loading) return
    setLoading(true)
    setError(null)
    
    try {
      const raw = await getJSON<any>(`/api/posts?page=${p}&per_page=${perPage}`)
      const validated = validatePostList(raw)
      
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

  // 私有貼文標記（只在本機判定）
  const myIds = (() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem('forumkit_my_posts') || '[]')) } catch { return new Set<number>() }
  })()

  // 合併：以伺服器資料優先，私有占位次之（當審核通過時，自然被伺服器資料覆蓋）
  const allItems = data ? dedup([...(data.items as any[]), ...injectedItems]) : injectedItems;

  const copyLink = async (id?: number) => {
    if (!id) return
    const url = `${location.origin}${location.pathname}#post-${id}`
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
    <div className="space-y-3">
      {allItems.length === 0 ? (
        <div className="text-center py-8 text-muted">目前沒有貼文。</div>
      ) : (
        allItems.map((p: any) => (
          <article id={p.id ? `post-${p.id}` : undefined} key={p.id ?? p.tempKey ?? `fallback-${allItems.indexOf(p)}`} className="rounded-xl border border-border bg-surface p-4 relative">
            <div className="text-xs text-muted mb-2">
              #{p.id || p.tempKey || '待確認'} • {p.created_at ? new Date(p.created_at).toLocaleString() : '時間未知'} • 匿名 {p.author_hash || '未知'}
            </div>
            <div
              className="prose prose-sm max-w-none text-fg"
              dangerouslySetInnerHTML={{ __html: p.content }}
            />
            <div
              className="mt-3 flex items-center justify-end gap-2"
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
              {p.pending_private ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 送審中
                </span>
              ) : myIds.has(p.id) && p.created_at ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200">
                  <Clock className="w-3.5 h-3.5" /> {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : p.id ? (
                <div className="flex items-center gap-2">
                  <a className="text-sm underline text-muted" href={`/delete/${p.id}`}>刪文請求</a>
                  <a className="text-xs px-2 py-1 rounded-md border border-border hover:bg-surface/70" href={`/posts/${p.id}`}>詳情</a>
                </div>
              ) : null}

              {/* 桌機：複製連結按鈕（所有人可見） */}
              {p.id && (
                <button
                  onClick={() => copyLink(p.id)}
                  className="hidden md:inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-surface/70"
                  title="複製貼文連結"
                >
                  {copiedFor === p.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  {copiedFor === p.id ? '已複製' : '複製連結'}
                </button>
              )}
            </div>
          </article>
        ))
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
    </div>
  )
}
