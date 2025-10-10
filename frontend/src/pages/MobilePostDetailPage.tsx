import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageLayout } from '@/components/layout/PageLayout'
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import { getJSON, HttpError } from '@/lib/http'
import { formatLocalMinute } from '@/utils/time'
import ErrorPage from '@/components/ui/ErrorPage'
import { getRole } from '@/utils/auth'
import { ArrowLeft, Share2, Trash2 } from 'lucide-react'
import CommentSection from '@/components/CommentSection'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || ''

type DetailPost = { 
  id: number; 
  content: string; 
  created_at?: string; 
  author_hash?: string; 
  school_id?: number | null; 
  school?: { id:number; slug:string; name:string } | null; 
  media?: { id: number; path: string; kind?: string }[]; 
  is_pinned?: boolean; 
  pinned_at?: string;
  is_announcement?: boolean;
  announcement_type?: string;
  is_advertisement?: boolean;
  reply_to_id?: number;
}

export default function MobilePostDetailPage() {
  const { id } = useParams()
  const pid = Number(id)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<DetailPost | null>(null)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string } | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // 無效 id
  if (!pid || isNaN(pid)) {
    return (
      <PageLayout pathname="/posts/404" maxWidth="max-w-5xl">
        <ErrorPage status={404} title="無效的貼文編號" />
      </PageLayout>
    )
  }

  // 載入詳情
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null)
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

  // 點擊內容圖片開啟燈箱
  useEffect(() => {
    const container = document.getElementById('post-content')
    if (!container) return
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
    const handlers: Array<[(e: MouseEvent) => void, HTMLImageElement]> = []
    imgs.forEach(img => {
      img.style.cursor = 'zoom-in'
      const onClick = (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation()
        const src = img.getAttribute('src') || ''
        if (src) setLightbox({ url: src })
      }
      img.addEventListener('click', onClick)
      handlers.push([onClick, img])
    })
    return () => { handlers.forEach(([fn, el]) => el.removeEventListener('click', fn)) }
  }, [post?.content])

  const displaySchoolName = () => {
    if (!post) return ''
    if ((post as any).is_announcement) {
      const t = (post as any).announcement_type
      if (t === 'platform') return '全平台公告'
      if (t === 'cross') return '跨校公告'
      return '學校公告'
    }
    if ((post as any).is_advertisement) return '廣告'
    const obj = (post as any).school as any
    const fromObj = obj && typeof obj === 'object' ? String(obj.name || obj.slug || '').trim() : ''
    if (fromObj) return fromObj
    const sidRaw = (post as any).school_id
    const hasSid = typeof sidRaw === 'number' && Number.isFinite(sidRaw)
    if (!hasSid || sidRaw === null) return '跨校'
    return ''
  }

  const handleShare = () => {
    try {
      const url = `${window.location.origin}/posts/${pid}`
      if (navigator.share) {
        navigator.share({ title: 'ForumKit 貼文', url }).catch(()=>{})
      } else {
        navigator.clipboard.writeText(url)
        setShareMsg('連結已複製到剪貼簿')
        setTimeout(() => setShareMsg(null), 1800)
      }
    } catch { /* noop */ }
  }

  const [showDeleteRequestModal, setShowDeleteRequestModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteRequesting, setDeleteRequesting] = useState(false)
  const handleDeleteRequest = async () => {
    if (!deleteReason.trim()) { alert('請填寫刪文理由'); return }
    try {
      setDeleteRequesting(true)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = localStorage.getItem('token')
      if (token) headers['Authorization'] = `Bearer ${token}`
      const r = await fetch(`/api/posts/${pid}/delete_request`, { method:'POST', headers, body: JSON.stringify({ reason: deleteReason.trim() }) })
      if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error?.message || '發送刪文請求失敗')
      alert('刪文請求已發送，管理員將進行審核')
      setShowDeleteRequestModal(false); setDeleteReason(''); navigate('/')
    } catch (e:any) {
      alert(e?.message || '發送刪文請求失敗')
    } finally { setDeleteRequesting(false) }
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><div className="text-muted">載入中...</div></div>
  if (error) return <ErrorPage status={404} title="貼文不存在或尚未公開" message={String(error)} />
  if (!post) return <ErrorPage status={404} title="貼文不存在或尚未公開" />

  return (
    <PageLayout pathname={`/posts/${post.id}`}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border px-3 py-2 flex items-center gap-2">
        <button aria-label="返回" onClick={() => navigate(-1)} className="w-9 h-9 rounded-lg flex items-center justify-center text-fg hover:bg-surface-hover">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">貼文 #{post.id}</div>
          <div className="text-xs text-muted truncate">{post.created_at ? formatLocalMinute(post.created_at) : ''}</div>
        </div>
        <button aria-label="分享" onClick={handleShare} className="w-9 h-9 rounded-lg flex items-center justify-center text-fg hover:bg-surface-hover">
          <Share2 className="w-5 h-5" />
        </button>
        <button aria-label="刪文請求" onClick={() => setShowDeleteRequestModal(true)} className="w-9 h-9 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-600/10">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Post Card */}
      <div className="px-3 py-3">
        <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
          {/* Meta */}
          <div className="text-[11px] text-muted mb-2">
            #{post.id}
            {post.created_at && <><span className="mx-1">•</span>{formatLocalMinute(post.created_at)}</>}
            {(() => { const name = displaySchoolName(); return name ? (<><span className="mx-1">•</span><span className="text-fg">{name}</span></>) : null })()}
          </div>

          {/* Reply hint */}
          {(post as any).reply_to_id && (
            <div className="text-xs text-muted mb-2">
              <a href={`/posts/${(post as any).reply_to_id}`} className="underline">回覆貼文 #{(post as any).reply_to_id}</a>
            </div>
          )}

          {/* Content */}
          <div id="post-content" className="prose prose-sm max-w-none text-fg leading-relaxed">
            <SafeHtmlContent html={post.content || ''} allowLinks={true} />
          </div>

          {/* Media */}
          {post.media && post.media.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {post.media.map((m) => (
                <MobileMediaTile key={m.id} m={m} onOpen={url => setLightbox({ url })} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div id="comments-anchor" />
      <div className="px-3 pb-24">
        <CommentSection postId={post.id} />
      </div>

      {/* Share toast */}
      {shareMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {shareMsg}
        </div>
      )}

      {/* Delete Request Modal */}
      {showDeleteRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={()=>setShowDeleteRequestModal(false)}>
          <div className="bg-surface border border-border rounded-2xl p-5 w-full max-w-sm" onClick={(e)=>e.stopPropagation()}>
            <h3 className="text-base font-semibold text-fg mb-3">申請刪除貼文</h3>
            <p className="text-sm text-muted mb-3">請填寫刪除理由，管理員將進行審核。濫用此功能可能導致帳號被限制。</p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="請詳細說明刪除理由..."
              className="w-full p-3 border border-border rounded-lg bg-background text-fg resize-none h-24"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={()=>setShowDeleteRequestModal(false)} className="btn-ghost flex-1 py-2">取消</button>
              <button onClick={handleDeleteRequest} disabled={deleteRequesting || !deleteReason.trim()} className="btn-primary flex-1 py-2 disabled:opacity-50">
                {deleteRequesting ? '發送中...' : '發送請求'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <LightboxOverlay 
          url={lightbox.url}
          post={post}
          onClose={() => { setLightbox(null); setLightboxIndex(null) }}
          onResolveIndex={(idx) => setLightboxIndex(idx)}
          index={lightboxIndex}
          setIndex={setLightboxIndex}
          setUrl={(u) => setLightbox({ url: u })}
        />
      )}
    </PageLayout>
  )
}

function MobileMediaTile({ m, onOpen }: { m: { id:number; path:string; kind?:string }, onOpen:(url:string)=>void }) {
  const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(m.path || '') || m.kind === 'image'
  const isVid = /\.(mp4|webm|mov)$/i.test(m.path || '') || m.kind === 'video'
  const [loading, setLoading] = useState(isImg)
  const [error, setError] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  const role = getRole()
  const canUsePreviewApi = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role || '')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (canUsePreviewApi) {
          const r = await fetch(`/api/moderation/media/${m.id}/url`, { cache: 'no-store' })
          if (!r.ok) throw new Error('無法獲取預覽')
          const j = await r.json()
          if (alive && j?.url) { setUrl(j.url); setLoading(false); return }
        }
        let rel = (m.path || '').replace(/^\/+/, '')
        if (rel.startsWith('public/')) setUrl(`${API_BASE}/${rel.replace(/^public\//, '')}`)
        else if (rel.startsWith('media/')) setUrl(`${API_BASE}/${rel}`)
        else { const ext = (m.path || '').split('.').pop() || 'jpg'; setUrl(`${API_BASE}/${m.id}.${ext}`) }
        setLoading(false)
      } catch {
        if (alive) { setError(true); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [m.id, m.path, canUsePreviewApi])

  return (
    <div className="relative rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-border/60">
      {isImg ? (
        url ? (
          <img src={url} alt="貼文圖片" className="w-full h-auto object-contain max-h-[60vh]" loading="lazy"
               onLoad={()=>setLoading(false)} onError={()=>{ setLoading(false); setError(true) }} onClick={()=>!error && onOpen(url)} />
        ) : (<div className="p-6 text-xs text-muted text-center">載入中...</div>)
      ) : isVid ? (
        url ? (<video src={url} controls className="w-full h-auto max-h-[60vh]" />) : (<div className="p-6 text-xs text-muted text-center">載入中...</div>)
      ) : (
        url ? (<a href={url} className="block p-3 text-sm underline break-all" target="_blank" rel="noreferrer">下載附件</a>) : (<div className="p-6 text-xs text-muted text-center">載入中...</div>)
      )}
      {loading && <div className="absolute inset-0 animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />}
      {error && <div className="p-3 text-xs text-muted text-center">無法載入</div>}
    </div>
  )
}

function LightboxOverlay({ 
  url, post, onClose, onResolveIndex, index, setIndex, setUrl
}: { 
  url: string; 
  post: DetailPost; 
  onClose: () => void; 
  onResolveIndex: (idx: number|null) => void;
  index: number | null;
  setIndex: (n: number|null) => void;
  setUrl: (u: string) => void;
}) {
  const [startX, setStartX] = useState<number | null>(null)

  const images = (post.media || [])
    .filter(m => /\.(jpg|jpeg|png|webp|gif)$/i.test(m.path || '') || m.kind === 'image')
    .map(m => {
      let rel = (m.path || '').replace(/^\/+/, '')
      if (rel.startsWith('public/')) return `${API_BASE}/${rel.replace(/^public\//, '')}`
      if (rel.startsWith('media/')) return `${API_BASE}/${rel}`
      const ext = (m.path || '').split('.').pop() || 'jpg'
      return `${API_BASE}/${m.id}.${ext}`
    })

  useEffect(() => {
    if (!images.length) { onResolveIndex(null); return }
    const idx = images.findIndex(u => (u.split('?')[0] === url.split('?')[0]))
    onResolveIndex(idx >= 0 ? idx : null)
  }, [url])

  const go = (dir: 1 | -1) => {
    if (index === null || !images.length) return
    let next = index + dir
    if (next < 0) next = images.length - 1
    if (next >= images.length) next = 0
    setIndex(next)
    setUrl(images[next])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, images.length])

  const onTouchStart = (e: React.TouchEvent) => setStartX(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1)
    setStartX(null)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-3 select-none"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 左右切換 */}
      {images.length > 1 && (
        <>
          <button className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white" onClick={(e)=>{ e.stopPropagation(); go(-1) }} aria-label="上一張">‹</button>
          <button className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white" onClick={(e)=>{ e.stopPropagation(); go(1) }} aria-label="下一張">›</button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80">{index !== null ? `${index + 1}/${images.length}` : ''}</div>
        </>
      )}
      <img src={url} className="max-w-[96vw] max-h-[82vh] object-contain" />
    </div>
  )
}
