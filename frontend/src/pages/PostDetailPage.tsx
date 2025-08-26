import { useEffect, useState } from 'react'
import { getJSON, HttpError } from '@/lib/http'
import ErrorPage from '@/components/ui/ErrorPage'
import ChatPanel from '@/components/ChatPanel'
import { useParams, useNavigate } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import CommentSection from '@/components/CommentSection'
import { getRole } from '@/utils/auth'
import { AlertTriangle, Trash2, MessageCircle, Share2, Flag } from 'lucide-react'

type DetailPost = { id: number; content: string; created_at?: string; author_hash?: string; media?: { id: number; path: string; kind?: string }[] }

export default function PostDetailPage({ id }: { id?: number }) {
  // 允許直接路由使用
  const params = useParams()
  const navigate = useNavigate()
  const pid = id ?? Number(params.id)
  
  // 狀態宣告置頂，避免 early return 使用尚未宣告的變數
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<DetailPost | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string } | null>(null)
  const [deleteRequesting, setDeleteRequesting] = useState(false)
  const [showDeleteRequestModal, setShowDeleteRequestModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  // 確保 pid 是有效數字
  if (!pid || isNaN(pid)) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/posts/404" />
        <MobileFabNav />
        <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
          <ErrorPage status={404} title="無效的貼文編號" />
        </main>
    </div>
  )
}

  const role = getRole()
  const canDelete = role === 'dev_admin' || role === 'campus_admin' || role === 'cross_admin'

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null)
        if (!pid || Number.isNaN(pid)) { setError('無效的貼文編號'); setLoading(false); return }
        const data = await getJSON<DetailPost>(`/api/posts/${pid}`)
        setPost(data)
      } catch (e: any) {
        if (e instanceof HttpError) setError(e.message)
        else setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [pid])

  // 刪文請求
  const handleDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      alert('請填寫刪文理由')
      return
    }

    try {
      setDeleteRequesting(true)
  const response = await fetch(`/api/posts/${pid}/delete_request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}`
        },
        body: JSON.stringify({ reason: deleteReason.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any))
        const msg = (typeof errorData?.error === 'string') ? errorData.error : (errorData?.error?.message || '發送刪文請求失敗')
        throw new Error(msg)
      }

      alert('刪文請求已發送，管理員將進行審核')
      setShowDeleteRequestModal(false)
      setDeleteReason('')
      navigate('/')
    } catch (error: any) {
      console.error('刪文請求失敗:', error)
      alert(error.message || '發送刪文請求失敗')
    } finally {
      setDeleteRequesting(false)
    }
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><div className="text-muted">載入中...</div></div>
  if (error) {
    const anyErr = error as any
    const status = anyErr?._http?.status || (typeof anyErr?.status === 'number' ? anyErr.status : undefined)
    return <ErrorPage status={status || 404} title={status===404? '貼文不存在或尚未公開': undefined} message={String(error)} />
  }
  if (!post) return <ErrorPage status={404} title="貼文不存在或尚未公開" />

  const MediaTile = ({ m }: { m: { id: number; path: string; kind?: string } }) => {
    const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(m.path || '') || m.kind === 'image'
    const isVid = /\.(mp4|webm|mov)$/i.test(m.path || '') || m.kind === 'video'
    const [loading, setLoading] = useState(isImg)
    const [error, setError] = useState(false)
    const [url, setUrl] = useState<string | null>(null)
    const role = getRole()
    const canUsePreviewApi = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role || '')

    useEffect(() => {
      let alive = true
      
      const load = async () => {
        try {
          // 已公開的媒體直連 CDN（不經授權 API）
          let rel = (m.path || '').replace(/^\/+/, '')
          if (rel.startsWith('public/')) {
            // 使用 CDN 服務直接訪問，移除 public/ 前綴
            const cdnUrl = `https://cdn.serelix.xyz/${rel.replace(/^public\//, '')}?t=${Date.now()}`
            setUrl(cdnUrl)
            return
          }

          // 移除管理員預覽API調用，直接使用靜態檔案路徑
          throw new Error('NO_PUBLIC_PATH')
        } catch (e: any) {
          if (!alive) return
          // 如果 API 失敗，嘗試直接訪問檔案路徑作為備用
          try {
            let rel2 = (m.path || '').replace(/^\/+/, '')
            if (rel2.startsWith('public/')) {
              setUrl(`https://cdn.serelix.xyz/${rel2.replace(/^public\//, '')}?t=${Date.now()}`)
            } else if (rel2.startsWith('media/')) {
              setUrl(`https://cdn.serelix.xyz/${rel2}?t=${Date.now()}`)
            } else {
              const ext = (m.path || '').split('.').pop() || 'jpg'
              const direct = `https://cdn.serelix.xyz/${m.id}.${ext}?t=${Date.now()}`
              setUrl(direct)
            }
          } catch (e2: any) {
            setError(true)
          }
        }
      }
      
      load()
      return () => {
        alive = false
      }
    }, [m.id, m.path])

    return (
      <div className="border border-border rounded-xl p-2 min-h-[6rem] grid place-items-center bg-surface/50">
        {isImg ? (
          url ? (
            <img
              src={url}
              alt={`media-${m.id}`}
              className={`w-full h-64 object-contain rounded transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
              loading="lazy"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true) }}
              onClick={() => !error && setLightbox({ url })}
            />
          ) : (
            <div className="text-xs text-muted">載入中...</div>
          )
        ) : isVid ? (
          url ? (
            <video src={url} controls className="w-full h-64 object-contain rounded" />
          ) : (
            <div className="text-xs text-muted">載入中...</div>
          )
        ) : (
          url ? (
            <a href={url} className="text-sm underline break-all" target="_blank" rel="noreferrer">下載附件</a>
          ) : (
            <div className="text-xs text-muted">載入中...</div>
          )
        )}
        {loading && (
          <div className="absolute w-[92%] h-[88%] animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        )}
        {error && (
          <div className="text-xs text-muted">無法載入圖片</div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-dvh">
      <NavBar pathname={`/posts/${post.id}`} />
      <MobileFabNav />
      
      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex justify-between items-start mb-4">
            <div className="text-xs text-muted">
              #{post.id} <span className="mx-1">•</span> {post.created_at ? new Date(post.created_at).toLocaleString() : ''} <span className="mx-1">•</span>
              {(() => {
                const label = String(post.author_hash || '').trim()
                const isAnonCode = /^[A-Z0-9]{6}$/.test(label)
                if (label === '系統訊息') return <span className="text-fg">系統訊息</span>
                if (isAnonCode) return <span className="text-muted">匿名 {label}</span>
                if (label) return <span className="text-fg">{label}</span>
                return <span className="text-muted">匿名</span>
              })()}
            </div>
          </div>
          
          {/* 內容顯示（後端已轉換為HTML） */}
          <div 
            className="prose prose-sm max-w-none text-fg" 
            dangerouslySetInnerHTML={{ __html: post.content || '' }} 
          />
          
          {/* 媒體內容 */}
          {post.media && post.media.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {post.media.map((m) => (
                <MediaTile key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>

        {/* 留言和反應區 */}
        <div id="comments-anchor" />
        <CommentSection postId={post.id} />

        {/* 刪文請求模態框 */}
        {showDeleteRequestModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-fg mb-4">刪文請求</h3>
              <p className="text-sm text-muted mb-4">
                請填寫刪文理由，管理員將根據理由進行審核。
              </p>
              
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="請詳細說明刪文理由..."
                className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                rows={4}
                maxLength={500}
              />
              
              <div className="flex justify-between items-center mt-2 mb-4">
                <span className="text-xs text-muted">
                  {deleteReason.length}/500
                </span>
              </div>
              
              <div className="flex gap-3 flex-col sm:flex-row">
                <button
                  onClick={() => {
                    setShowDeleteRequestModal(false)
                    setDeleteReason('')
                  }}
                  className="btn-ghost flex-1 py-2"
                >
                  取消
                </button>
                <button
                  onClick={handleDeleteRequest}
                  disabled={deleteRequesting || !deleteReason.trim()}
                  className="btn-primary flex-1 py-2 disabled:opacity-50"
                >
                  {deleteRequesting ? '發送中...' : '發送請求'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 圖片燈箱 */}
      {lightbox && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <img 
            src={lightbox.url} 
            alt="放大圖片" 
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* 行動版懸浮工具列 */}
      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="mx-3 mb-3 rounded-2xl border border-border bg-surface/95 backdrop-blur shadow-lg">
          <div className="flex items-center justify-around py-2">
            <button
              onClick={() => {
                try {
                  document.getElementById('comments-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                } catch {}
              }}
              className="flex flex-col items-center gap-1 px-3 py-1 text-fg"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-xs">留言</span>
            </button>
            <button
              onClick={async () => {
                const url = `${location.origin}/posts/${post.id}`
                const text = (post.content || '').replace(/<[^>]+>/g,'').slice(0, 60)
                try {
                  // Web Share API
                  if (navigator.share) {
                    await navigator.share({ title: `#${post.id}`, text, url })
                  } else {
                    await navigator.clipboard.writeText(url)
                    setShareMsg('連結已複製')
                    setTimeout(() => setShareMsg(null), 1500)
                  }
                } catch {}
              }}
              className="flex flex-col items-center gap-1 px-3 py-1 text-fg"
            >
              <Share2 className="w-5 h-5" />
              <span className="text-xs">分享</span>
            </button>
            <button
              onClick={() => { try { window.location.href = `/support?subject=${encodeURIComponent('回報貼文 #' + post.id)}` } catch {} }}
              className="flex flex-col items-center gap-1 px-3 py-1 text-fg"
            >
              <Flag className="w-5 h-5" />
              <span className="text-xs">回報</span>
            </button>
          </div>
        </div>
        {shareMsg && (
          <div className="mx-auto max-w-sm mb-2 text-center text-xs text-fg bg-surface border border-border px-2 py-1 rounded-full shadow">{shareMsg}</div>
        )}
      </div>
    </div>
  )
}
