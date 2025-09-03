import { useEffect, useState } from 'react'
import { getJSON, HttpError } from '@/lib/http'
import ErrorPage from '@/components/ui/ErrorPage'
import { formatLocalMinute } from '@/utils/time'
import ChatPanel from '@/components/ChatPanel'
import { useParams, useNavigate } from 'react-router-dom'
import { PageLayout } from '@/components/layout/PageLayout'
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import CommentSection from '@/components/CommentSection'
import { getRole } from '@/utils/auth'
import { Trash2, Link as LinkIcon, ArrowLeft } from 'lucide-react'
// 移除行動版懸浮操作列所需圖示（留言/分享/回報），避免與內文重複

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
}

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deleteRequesting, setDeleteRequesting] = useState(false)
  const [showDeleteRequestModal, setShowDeleteRequestModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [schools, setSchools] = useState<{ id:number; slug:string; name:string }[]>([])

  // 確保 pid 是有效數字
  if (!pid || isNaN(pid)) {
    return (
      <PageLayout pathname="/posts/404" maxWidth="max-w-5xl">
        <ErrorPage status={404} title="無效的貼文編號" />
      </PageLayout>
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

  // 讓內文中的 <img> 點擊可開啟輕量燈箱
  useEffect(() => {
    const container = document.getElementById('post-content')
    if (!container) return
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
    const handlers: Array<[(e: MouseEvent) => void, HTMLImageElement]> = []
    imgs.forEach(img => {
      img.style.cursor = 'zoom-in'
      const onClick = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const src = img.getAttribute('src') || ''
        if (src) setLightbox({ url: src })
      }
      img.addEventListener('click', onClick)
      handlers.push([onClick, img])
    })
    return () => {
      handlers.forEach(([fn, el]) => el.removeEventListener('click', fn))
    }
  }, [post?.content])

  // 載入學校清單，供顯示名稱 fallback
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

  const displaySchoolName = () => {
    if (!post) return ''
    
    // 檢查是否為公告，優先顯示公告類型
    if ((post as any).is_announcement) {
      const announcementType = (post as any).announcement_type
      switch(announcementType) {
        case 'platform': return '全平台公告'
        case 'cross': return '跨校公告'
        case 'school': return '學校公告'
        default: return '公告'
      }
    }
    
    // 檢查是否為廣告
    if ((post as any).is_advertisement) {
      return '廣告'
    }
    
    const obj = (post as any).school as any
    const fromObj = obj && typeof obj === 'object' ? String(obj.name || obj.slug || '').trim() : ''
    if (fromObj) return fromObj
    const sidRaw = (post as any).school_id
    const hasSid = typeof sidRaw === 'number' && Number.isFinite(sidRaw)
    if (!hasSid || sidRaw === null) return '跨校' // 真跨校
    const found = schools.find(s => s.id === sidRaw)
    return (found?.name || found?.slug || '').trim()
  }

  // 刪文請求
  const handleDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      alert('請填寫刪文理由')
      return
    }

    try {
      setDeleteRequesting(true)
      
      // 構建 headers，如果有 token 就加上，沒有也沒關係
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      const token = localStorage.getItem('token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await fetch(`/api/posts/${pid}/delete_request`, {
        method: 'POST',
        headers,
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
      ;(async () => {
        try {
          if (canUsePreviewApi) {
            const r = await fetch(`/api/moderation/media/${m.id}/url`, { cache: 'no-store' })
            if (!r.ok) throw new Error('無法獲取預覽')
            const j = await r.json()
            if (alive && j?.url) { setUrl(j.url); setLoading(false); return }
          }
          
          // fallback: 直接構建 CDN URL
          let rel = (m.path || '').replace(/^\/+/, '')
          if (rel.startsWith('public/')) {
            setUrl(`https://cdn.serelix.xyz/${rel.replace(/^public\//, '')}`)
          } else if (rel.startsWith('media/')) {
            setUrl(`https://cdn.serelix.xyz/${rel}`)
          } else {
            const ext = (m.path || '').split('.').pop() || 'jpg'
            setUrl(`https://cdn.serelix.xyz/${m.id}.${ext}`)
          }
          setLoading(false)
        } catch (e) {
          if (alive) { setError(true); setLoading(false) }
        }
      })()
      return () => { alive = false }
    }, [m.id, m.path, canUsePreviewApi])

    return (
      <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden flex items-center justify-center">
        {isImg ? (
          url ? (
            <img 
              src={url} 
              alt="貼文圖片" 
              className="w-full h-full object-cover cursor-zoom-in"
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
    <PageLayout pathname={`/posts/${post.id}`} maxWidth="max-w-5xl">
      {/* 返回按鈕 */}
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-fg transition-colors rounded-lg hover:bg-surface-hover"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4 break-words">
        <div className="flex justify-between items-start mb-3">
          <div className="text-xs text-muted">
            #{post.id} <span className="mx-1">•</span> {post.created_at ? formatLocalMinute(post.created_at) : ''}
            {(() => { const name = displaySchoolName(); return name ? (<><span className="mx-1">•</span> <span className="text-fg">{name}</span></>) : null })()}
          </div>
          
          {/* 公告/廣告徽章 */}
          <div className="flex items-center gap-2">
            {post.is_announcement && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                </svg>
                {post.announcement_type === 'platform' ? '全平台公告' : 
                 post.announcement_type === 'cross' ? '跨校公告' : '學校公告'}
              </span>
            )}
            {post.is_advertisement && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                </svg>
                廣告
              </span>
            )}
          </div>
        </div>
        
        {/* 內容顯示（後端已轉為 HTML）。套用閱讀樣式，並在載入後掛上圖片燈箱。*/}
        <div id="post-content" className="max-w-none text-fg break-words [&>*:first-child]:mt-0">
          <SafeHtmlContent html={post.content || ''} className="prose prose-sm" allowLinks={true} />
        </div>
        
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
      <CommentSection
        postId={post.id}
        extraActions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeleteRequestModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-800/30 dark:text-red-400"
              title="申請刪除貼文"
            >
              <Trash2 className="w-4 h-4" />
              <span>刪文請求</span>
            </button>
            <button
              onClick={() => {
                const url = `${window.location.origin}/posts/${post.id}`
                navigator.clipboard.writeText(url)
                setShareMsg('連結已複製到剪貼簿')
                setTimeout(() => setShareMsg(null), 2000)
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-all bg-surface-hover hover:bg-surface-active text-muted hover:text-fg"
              title="複製貼文連結"
            >
              <LinkIcon className="w-4 h-4" />
              <span>貼文連結</span>
            </button>
          </div>
        }
      />

      {/* 分享成功提示 */}
      {shareMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {shareMsg}
        </div>
      )}

      {/* 刪文請求模態框 */}
      {showDeleteRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-fg mb-4">申請刪除貼文</h3>
            <p className="text-sm text-muted mb-4">
              請填寫刪除理由，管理員將進行審核。濫用此功能可能導致帳號被限制。
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="請詳細說明刪除理由..."
              className="w-full p-3 border border-border rounded-lg bg-background text-fg resize-none h-24"
            />
            <div className="flex gap-3 mt-4">
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
      {/* 圖片燈箱（含左右切換與快捷鍵） */}
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
      {/* 移除：行動版懸浮工具列（留言/分享/回報），避免與內文重複 */}
    </PageLayout>
  )
}

// 燈箱元件（支援左右切換、鍵盤、觸控手勢）
function LightboxOverlay({ 
  url, 
  post, 
  onClose, 
  onResolveIndex,
  index,
  setIndex,
  setUrl,
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

  // 從 post.media 建出可切換的圖片 URL 清單
  const images = (post.media || [])
    .filter(m => /\.(jpg|jpeg|png|webp|gif)$/i.test(m.path || '') || m.kind === 'image')
    .map(m => {
      let rel = (m.path || '').replace(/^\/+/, '')
      if (rel.startsWith('public/')) return `https://cdn.serelix.xyz/${rel.replace(/^public\//, '')}`
      if (rel.startsWith('media/')) return `https://cdn.serelix.xyz/${rel}`
      const ext = (m.path || '').split('.').pop() || 'jpg'
      return `https://cdn.serelix.xyz/${m.id}.${ext}`
    })

  // 解析目前 url 在清單中的位置
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

  // 觸控滑動切換
  const onTouchStart = (e: React.TouchEvent) => setStartX(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1)
    setStartX(null)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 select-none"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 左右切換 */}
      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            aria-label="上一張"
          >
            ‹
          </button>
          <button
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => { e.stopPropagation(); go(1) }}
            aria-label="下一張"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80">
            {index !== null ? `${index + 1}/${images.length}` : ''}
          </div>
        </>
      )}
      <img 
        src={url} 
        alt="放大圖片" 
        className="max-w-full max-h-full object-contain cursor-zoom-out"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
