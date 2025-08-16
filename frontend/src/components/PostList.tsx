// frontend/src/components/PostList.tsx
import { useEffect, useState } from 'react'

export default function PostList({ injected }: { injected?: any | null }) {
  const [items, setItems] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const perPage = 10

  const fetchPage = async (p = 1) => {
    if (loading) return
    setLoading(true)
    try {
      const r = await fetch(`/api/posts?page=${p}&per_page=${perPage}`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error?.message ?? `HTTP ${r.status}`)
      }
      const list = Array.isArray(j.data.items) ? j.data.items : []
      setItems(prev => p === 1 ? list : [...prev, ...list])
      const total = j.data.total ?? 0
      const loaded = p * perPage
      setHasMore(loaded < total)
      setPage(p)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPage(1) }, [])

  // 即時插入新貼文（從父層 onCreated 傳入）
  useEffect(() => {
    if (injected) {
      setItems(prev => [injected, ...prev])
    }
  }, [injected])

  if (error) {
    return <div className="text-red-500 text-sm">載入失敗：{error}</div>
  }

  return (
    <div className="space-y-3">
      {items.map(p => (
        <article key={p.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted mb-2">
            #{p.id} • {new Date(p.created_at).toLocaleString()} • 匿名 {p.author_hash}
          </div>
          <div
            className="prose prose-sm max-w-none text-fg"
            dangerouslySetInnerHTML={{ __html: p.content }}
          />
          <div className="mt-3 text-right">
            <a className="text-sm underline text-muted" href={`/delete/${p.id}`}>刪文請求</a>
          </div>
        </article>
      ))}
      <div className="pt-2">
        {hasMore ? (
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={loading}
            className="px-4 py-2 rounded-xl border bg-surface/60 hover:bg-surface/80 border-border text-sm"
          >
            {loading ? '載入中…' : '載入更多'}
          </button>
        ) : (
          <div className="text-center text-muted text-sm py-2">沒有更多了</div>
        )}
      </div>
    </div>
  )
}
