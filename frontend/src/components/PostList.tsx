// frontend/src/components/PostList.tsx
import { useEffect, useState, useRef } from 'react'
import { getJSON, HttpError } from '../lib/http'
import { validatePostList, type PostList as PostListType, type Post } from '../schemas/post'
import { dedup } from '../utils/client'
import ErrorBox from './ui/ErrorBox'

export default function PostList({ injectedItems = [] }: { injectedItems?: any[] }) {
  const [data, setData] = useState<PostListType | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const perPage = 10

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

  // 合併 injected items 與已載入的資料
  const allItems = data ? dedup([...injectedItems, ...data.items]) : injectedItems;

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
          <article key={p.id ?? p.tempKey ?? `fallback-${allItems.indexOf(p)}`} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted mb-2">
              #{p.id || p.tempKey || '待確認'} • {p.created_at ? new Date(p.created_at).toLocaleString() : '時間未知'} • 匿名 {p.author_hash || '未知'}
            </div>
            <div
              className="prose prose-sm max-w-none text-fg"
              dangerouslySetInnerHTML={{ __html: p.content }}
            />
            <div className="mt-3 text-right">
              {p.id ? (
                <a className="text-sm underline text-muted" href={`/delete/${p.id}`}>刪文請求</a>
              ) : (
                <span className="text-sm text-muted opacity-50">發布中...</span>
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
