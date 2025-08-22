import { useEffect, useState } from 'react'
import { getJSON, HttpError } from '@/lib/http'
import ErrorPage from '@/components/ui/ErrorPage'
import ChatPanel from '@/components/ChatPanel'

export default function PostDetailPage({ id }: { id: number }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<{ id: number; content: string; created_at?: string } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null)
        const data = await getJSON<{ id: number; content: string; created_at?: string }>(`/api/posts/${id}`)
        setPost(data)
      } catch (e) {
        if (e instanceof HttpError) setError(e.message)
        else setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  if (loading) return <div className="min-h-screen grid place-items-center"><div className="text-muted">載入中...</div></div>
  if (error) {
    const status = (error as any)?._http?.status || (error instanceof HttpError ? error.status : undefined)
    return <ErrorPage status={status || 404} title={status===404? '貼文不存在或尚未公開': undefined} message={error} />
  }
  if (!post) return <ErrorPage status={404} title="貼文不存在或尚未公開" />

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="text-xs text-muted mb-2">#{post.id} • {post.created_at ? new Date(post.created_at).toLocaleString() : ''}</div>
          <div className="prose prose-sm max-w-none text-fg" dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>
        <ChatPanel room={`post:${post.id}`} title={`貼文 #${post.id} 聊天室`} />
      </main>
    </div>
  )
}
