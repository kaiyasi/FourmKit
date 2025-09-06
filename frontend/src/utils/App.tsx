import { useEffect, useState } from 'react'
import MobileUnderConstruction from '@/components/MobileUnderConstruction'
import { getSocket } from '@/socket'
import { ensurePostListener, ensureCommentListener, ensureAnnounceListener, ensureModerationListeners, ensureDeleteRequestListeners, ensureReactionListeners } from '@/services/realtime'
import { addNotification } from '@/utils/notifications'
import { getClientId, upsertByIdOrTemp, upsertSocketPayload } from '@/utils/client'
import { NavBar } from '@/components/layout/NavBar'
import ErrorPage from '@/components/ui/ErrorPage'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { MobilePostList } from '@/components/mobile/MobilePostList'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import NewAuthPage from '@/pages/NewAuthPage'
import RegisterConfirmPage from '@/pages/RegisterConfirmPage'
import PostList from '@/components/PostList'
import PostForm from '@/components/forms/PostForm'
import FilterBar from '@/components/FilterBar'
import ChatPanel from '@/components/ChatPanel'
import ChatPage from '@/pages/ChatPage'
import AdminChatPage from '@/pages/admin/ChatPage'
import PostDetailPage from '@/pages/PostDetailPage'
import AdminCommentsMonitorPage from '@/pages/admin/AdminCommentsMonitorPage'
import DiscordPage from '@/pages/admin/DiscordPage'
import ProjectStatusPage from '@/pages/admin/ProjectStatusPage'
import ServerStatusPage from '@/pages/admin/ServerStatusPage'
import EventStatusCard from '@/components/admin/EventStatusCard'
import ResizableSection from '@/components/ResizableSection'
import { canSetMode, getUserId } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'
import ExternalAccountErrorPage from '@/pages/ExternalAccountErrorPage'
import LoginRestrictedPage from '@/pages/LoginRestrictedPage'
import { useAnnouncementNotifications } from '@/hooks/useAnnouncementNotifications'

type PlatformMode = {
  mode: 'normal' | 'maintenance' | 'development' | 'test'
  maintenance_message?: string
  maintenance_until?: string
  mobile_maintenance?: boolean
  mobile_maintenance_message?: string
}

type Role = 'guest' | 'user' | 'moderator' | 'admin'

interface ProgressItem { name: string; status: 'completed'|'in_progress'|'planned'; description: string }
interface ProgressData { progress_items: ProgressItem[]; recent_updates: string[]; last_updated: string; error?: string }

export default function App() {
  const { isLoggedIn } = useAuth()
  
  // 啟用公告通知整合
  useAnnouncementNotifications()
  
  /* ---------- 局部 CSS：740–820px 調整右欄 ---------- */
  const MidWidthCSS = () => (
    <style>{`
      @media (min-width: 740px) and (max-width: 820px) {
        .right-col-spacing { row-gap: 1rem; }
        .right-top-fixed  { height: 300px !important; }
      }
    `}</style>
  )

  // 響應式螢幕尺寸檢測
  function useScreenSize() {
    const [isSmallScreen, setIsSmallScreen] = useState(false)
    const [isTinyScreen, setIsTinyScreen] = useState(false)
    useEffect(() => {
      const checkScreenSize = () => {
        const width = window.innerWidth
        setIsSmallScreen(width < 768)
        setIsTinyScreen(width < 640)
      }
      checkScreenSize()
      window.addEventListener('resize', checkScreenSize)
      return () => window.removeEventListener('resize', checkScreenSize)
    }, [])
    return { isSmallScreen, isTinyScreen }
  }

  // 取得響應式螢幕尺寸狀態（修正 ReferenceError）
  const { isSmallScreen, isTinyScreen } = useScreenSize()

  function useRealtimeToasts(onNewPost?: (payload: any) => void) {
    const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
    useEffect(() => {
      let idSeq = 1
      const push = (text: string) => {
        const id = idSeq++
        // 安靜模式：只記錄，不彈出提示
        const quiet = (()=>{ try { return localStorage.getItem('fk_quiet_toasts') === '1' } catch { return false } })()
        if (!quiet) {
          setToasts(cur => [...cur, { id, text }])
          setTimeout(() => setToasts(cur => cur.filter(t => t.id !== id)), 5000)
        }
      }
      
      const myClientId = getClientId()
      const myUserId = isLoggedIn ? getUserId() : null
      
      // 統一的 post 處理器：僅對本人顯示「已提交審核」提示；不再注入清單
      const combinedPostHandler = (payload: any) => {
        const { post, origin, client_tx_id } = payload
        
        console.info(`[App] processing socket payload: post_id=${post?.id} origin=${origin} tx_id=${client_tx_id}`)
        
        // 僅通知發文者：改為「已提交審核」並記錄我的貼文 id（供列表顯示私有標記）
        if (origin === `client:${myClientId}` || (myUserId && origin === `user:${myUserId}`)) {
          const text = `您的貼文已提交審核：${(post?.content ?? '').slice(0, 30)}…`
          push(text)
          try { addNotification({ type: 'post.pending', text, school: deriveSchoolTag(payload) }) } catch {}
          // 將正式 id 回寫到本地占位，並保留 pending 標記
          try { onNewPost?.({ ...payload, post: { ...post, pending_private: true } }) } catch {}
          try {
            const key = 'forumkit_my_posts'
            const arr = JSON.parse(localStorage.getItem(key) || '[]') as number[]
            if (typeof post?.id === 'number' && !arr.includes(post.id)) {
              arr.unshift(post.id)
              localStorage.setItem(key, JSON.stringify(arr.slice(0, 500)))
              try { window.dispatchEvent(new CustomEvent('forumkit_local_change', { detail: { key } })) } catch {}
            }
          } catch {}
        }
        // 不再注入 pending 貼文到清單（等待審核通過才出現在後端清單中）
      }
      
      const deriveSchoolTag = (src?: any) => {
        try {
          const s1 = src?.post?.school?.slug || src?.school_slug || src?.post?.school_slug
          if (typeof s1 === 'string' && s1.trim() && s1 !== '__ALL__') return s1.trim()
          const s2 = localStorage.getItem('selected_school_slug') || localStorage.getItem('school_slug') || ''
          if (s2 && s2 !== '__ALL__') return s2
        } catch {}
        return null
      }
      const onCmt = (c: any) => {
        const text = `新留言：${(c?.content ?? '').slice(0, 20)}…`
        push(text)
        try {
          const pid = Number(c?.post_id || c?.post?.id)
          const mine = (()=>{ try { const arr = JSON.parse(localStorage.getItem('forumkit_approved_posts')||'[]') as number[]; return Array.isArray(arr) && Number.isFinite(pid) && arr.includes(pid) } catch { return false } })()
          if (mine) addNotification({ type: 'comment.new', text, school: deriveSchoolTag(c) })
        } catch {}
      }
      const onAnn = (a: any) => {
        const text = `公告：${(a?.message ?? '').slice(0, 30)}…`
        push(text)
        try { addNotification({ type: 'announce.new', text, school: deriveSchoolTag(a) }) } catch {}
      }
      
      // 只註冊一次 post listener，合併 toast 和狀態更新功能
      ensurePostListener(combinedPostHandler)
      ensureCommentListener(onCmt)
      ensureAnnounceListener(onAnn)
      ensureReactionListeners((payload:any)=>{
        try {
          const kind = payload?.reaction || payload?.kind || payload?.type || 'reaction'
          const pid = Number(payload?.post_id || payload?.post?.id)
          const mine = (()=>{ try { const arr = JSON.parse(localStorage.getItem('forumkit_approved_posts')||'[]') as number[]; return Array.isArray(arr) && Number.isFinite(pid) && arr.includes(pid) } catch { return false } })()
          if (!mine) return
          const txt = kind === 'like' ? '有人對你的貼文按了讚' : kind === 'dislike' ? '有人對你的貼文按了踩' : '有人對你的貼文有新回饋'
          addNotification({ type: 'reaction', text: txt, school: deriveSchoolTag(payload) })
        } catch {}
      })
      // 審核結果：只對自己看得懂（我的貼文 ID）
      ensureModerationListeners(
        (payload:any)=>{
          const id = Number(payload?.id)
          if (!id) return
          try{
            const key = 'forumkit_my_posts'
            const arr = JSON.parse(localStorage.getItem(key) || '[]') as number[]
            if (arr.includes(id)) {
              const text = `您的貼文 #${id} 已通過審核`
              push(text)
              try { addNotification({ type: 'post.approved', text, school: deriveSchoolTag(payload) }) } catch {}
              // 記錄到已審清單
              const k2 = 'forumkit_approved_posts'
              const ap = JSON.parse(localStorage.getItem(k2) || '[]') as number[]
              if (!ap.includes(id)) {
                localStorage.setItem(k2, JSON.stringify([id, ...ap].slice(0,500)))
              try { window.dispatchEvent(new CustomEvent('forumkit_local_change', { detail: { key: k2 } })) } catch {}
            }
            // 從送審清單移除，避免「送審」數持續累加
            const next = arr.filter(x => x !== id)
            localStorage.setItem(key, JSON.stringify(next))
            try { window.dispatchEvent(new CustomEvent('forumkit_local_change', { detail: { key } })) } catch {}
            try { window.dispatchEvent(new CustomEvent('fk_reload_posts')) } catch {}
          }
        }catch{}
      },
      (payload:any)=>{
        const id = Number(payload?.id)
        const reason = String(payload?.reason || '不符合規範')
        if (!id) return
        try{
          const key = 'forumkit_my_posts'
          const arr = JSON.parse(localStorage.getItem(key) || '[]') as number[]
          if (arr.includes(id)) {
            const text = `您的貼文 #${id} 已被退件（${reason}）`
            push(text)
            try { addNotification({ type: 'post.rejected', text, school: deriveSchoolTag(payload) }) } catch {}
            const next = arr.filter(x => x !== id)
            localStorage.setItem(key, JSON.stringify(next))
            try { window.dispatchEvent(new CustomEvent('forumkit_local_change', { detail: { key } })) } catch {}
            try { window.dispatchEvent(new CustomEvent('fk_reload_posts')) } catch {}
          }
        }catch{}
      }
    )
      // 刪文請求事件（管理員/審核角色收到）
      ensureDeleteRequestListeners(
        (payload:any)=>{
          const role = (localStorage.getItem('role')||'guest')
          if (['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role)) {
            const pid = payload?.post_id
            const text = `新刪文請求：#${pid}（已送審）`
            push(text)
            try { addNotification({ type: 'delete_request.created', text, school: deriveSchoolTag(payload) }) } catch {}
          }
        },
        (payload:any)=>{
          const role = (localStorage.getItem('role')||'guest')
          if (['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role)) {
            const text = `刪文請求已核准：#${payload?.post_id || payload?.request_id}`
            push(text)
            try { addNotification({ type: 'delete_request.approved', text, school: deriveSchoolTag(payload) }) } catch {}
          }
        },
        (payload:any)=>{
          const role = (localStorage.getItem('role')||'guest')
          if (['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role)) {
            const text = `刪文請求已被拒絕：#${payload?.request_id}`
            push(text)
            try { addNotification({ type: 'delete_request.rejected', text, school: deriveSchoolTag(payload) }) } catch {}
          }
        }
      )

      // 已移除：支援/事件回報僅針對 dev_admin 的即時提示，避免干擾
      getSocket()  // 確保 Socket 連線
      
      // 清理函數由 ensureXXXListener 內部處理，這裡不需要手動 off
    }, [onNewPost])
    return toasts
  }

  function RealtimeToastPanel({ onNewPost }: { onNewPost?: (post: any) => void }) {
    const toasts = useRealtimeToasts(onNewPost)
    return (
      <div className="fixed bottom-3 sm:bottom-4 right-3 sm:right-4 left-3 sm:left-auto z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className="rounded-xl border border-border bg-surface/90 px-3 py-2 shadow-soft max-w-sm sm:max-w-none ml-auto">
            <span className="text-sm text-fg">{t.text}</span>
          </div>
        ))}
      </div>
    )
  }

  const [pathname, setPathname] = useState(() => {
    // 安全地獲取 pathname，避免在 SSR 或某些環境中出現問題
    try {
      return window?.location?.pathname || '/'
    } catch {
      return '/'
    }
  })
  const [platform, setPlatform] = useState<PlatformMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined)

  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(true)


  // 手機用戶直接導向 boards 頁面
  const isMobileDevice = typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  
  // 如果是手機用戶且在首頁，直接重導向到 boards
  if (isMobileDevice && pathname === '/' && !window.location.search.includes('stay')) {
    window.location.href = '/boards'
    return <div className="min-h-screen grid place-items-center"><div className="text-muted">導向中...</div></div>
  }
  
  // 維護模式的手機控制保持不變
  const mobileGateEnabled = platform?.mobile_maintenance ?? false
  if (mobileGateEnabled && isMobileDevice && pathname !== '/mode') {
    return <MobileUnderConstruction message={platform?.mobile_maintenance_message} />
  }
  const [injectedItems, setInjectedItems] = useState<any[]>([])

  // 未登入時：刷新後清掉本地送審/已審紀錄（匿名臨時帳號刷新即重置）
  useEffect(() => {
    if (!isLoggedIn) {
      try { localStorage.removeItem('forumkit_my_posts') } catch {}
      try { localStorage.removeItem('forumkit_approved_posts') } catch {}
    }
  }, [])
  
  // 已移除：「我的送審 / 已審」區塊
  
  // 用於 upsert 邏輯的 injected 處理
  const handleNewPost = (postOrPayload: any) => {
    const timestamp = new Date().toISOString()
    
    // 如果是來自 Socket.IO 的 payload 格式
    if (postOrPayload?.post) {
      console.info(`[handleNewPost] socket payload at ${timestamp}:`, {
        post_id: postOrPayload.post?.id,
        origin: postOrPayload.origin,
        tx_id: postOrPayload.client_tx_id,
        event_id: postOrPayload.event_id
      })
      
      // 使用專門的 socket payload 處理函數
      setInjectedItems(prev => {
        const result = upsertSocketPayload(prev, postOrPayload)
        console.info(`[handleNewPost] socket upsert: ${prev.length} -> ${result.length} items`)
        return result
      })
    } else {
      // 直接的 post 對象（來自 PostForm 的樂觀插入或 API 回應）
      const isOptimistic = !postOrPayload?.id
      console.info(`[handleNewPost] direct post at ${timestamp}: ${isOptimistic ? 'optimistic' : 'confirmed'} id=${postOrPayload?.id} tx_id=${postOrPayload?.client_tx_id}`)
      
      setInjectedItems(prev => {
        const result = upsertByIdOrTemp(prev, postOrPayload)
        console.info(`[handleNewPost] direct upsert: ${prev.length} -> ${result.length} items`)
        return result
      })
    }
  }

  // 初始化主題
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 重啟時清除搜尋條件，學校預設「全部」但不覆蓋使用者已選
  useEffect(() => {
    try { localStorage.removeItem('posts_filter_keyword') } catch {}
    try { localStorage.removeItem('posts_filter_start') } catch {}
    try { localStorage.removeItem('posts_filter_end') } catch {}
    try {
      const cur = localStorage.getItem('school_slug')
      if (!cur) localStorage.setItem('school_slug', '__ALL__')
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/mode')
      .then(r => {
        if (!r.ok) {
          setErrorStatus(r.status)
          throw new Error(`HTTP ${r.status}: ${r.statusText}`)
        }
        return r.json()
      })
      .then(setPlatform)
      .catch(e => {
        // Network error 或 5xx 皆走自訂錯誤頁
        const msg = (e && e.message) ? String(e.message) : String(e)
        setError(msg)
        if (!errorStatus) {
          // 嘗試從字串擷取狀態碼
          const m = msg.match(/HTTP\s+(\d{3})/)
          if (m) setErrorStatus(Number(m[1]))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // 監聽來自 /mode 的更新事件，及時刷新平台模式（含手機維護設定）
  useEffect(() => {
    const onModeUpdated = () => {
      fetch('/api/mode')
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(setPlatform)
        .catch(() => {})
    }
    window.addEventListener('fk_mode_updated', onModeUpdated)
    return () => window.removeEventListener('fk_mode_updated', onModeUpdated)
  }, [])

  useEffect(()=> { console.log('[ForumKit] build tag', (import.meta as any).env?.VITE_BUILD_TAG) },[])

  useEffect(() => {
    const onPop = () => {
      try {
        const pathname = window?.location?.pathname || '/'
        setPathname(pathname)
      } catch (error) {
        console.warn('[App] Failed to get pathname:', error)
        setPathname('/')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 在 development 模式，以及 test 模式(非管理員)的首頁載入進度（後端已合併 CHANGELOG）
  useEffect(() => {
    const shouldFetchProgress = (
      (platform?.mode === 'development' && pathname === '/') ||
      (platform?.mode === 'test' && pathname === '/' && !canSetMode())
    )
    if (shouldFetchProgress) {
      (async () => {
        try {
          setProgressLoading(true)
          const r = await fetch('/api/progress', { cache: 'no-store' })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const data = await r.json()
          if (data && typeof data === 'object' && Array.isArray(data.progress_items) && Array.isArray(data.recent_updates)) {
            setProgressData(data)
          } else {
            setProgressData({ progress_items: [], recent_updates: [], last_updated: new Date().toISOString(), error: '資料格式不正確' })
          }
        } catch (e:any) {
          setProgressData({ progress_items: [], recent_updates: [], last_updated: new Date().toISOString(), error: e?.message || String(e) })
        } finally {
          setProgressLoading(false)
        }
      })()
    }
  }, [platform?.mode, pathname])

  if (loading) {
    return <div className="min-h-screen grid place-items-center"><div className="text-muted">載入中...</div></div>
  }
  if (error || !platform) {
    const status = errorStatus || 502
    const title = (status === 502 || status === 503 || status === 504) ? '服務暫時不可用' : undefined
    const hint = '伺服器可能正在重啟或暫時不可用，稍候將自動恢復。'
    return <ErrorPage status={status} title={title} message={error || '無法取得平台模式'} hint={hint} />
  }

  // /mode 管理頁
  if (pathname === '/mode') {
    return <AdminModePanel platform={platform} onUpdated={setPlatform} full />
  }

  // /chat 示範頁
  if (pathname === '/chat') {
    return <ChatPage />
  }

  // /admin/chat 管理員聊天室
  if (pathname === '/admin/chat') {
    return <AdminChatPage />
  }

  // 錯誤/限制頁（Google 校外或登入模式限制）
  if (pathname === '/error/external-account') {
    return <ExternalAccountErrorPage />
  }
  if (pathname === '/error/login-restricted') {
    return <LoginRestrictedPage />
  }

  // 新登入/註冊頁（Google 起手 + 快速註冊）
  if (pathname === '/auth') {
    return <NewAuthPage />
  }
  if (pathname === '/auth/register-confirm') {
    return <RegisterConfirmPage />
  }

  // /posts/:id 詳情頁（public approved）
  if (pathname && pathname.startsWith('/posts/')) {
    const idStr = pathname.split('/')[2]
    const id = Number(idStr)
    if (!Number.isNaN(id) && id > 0) {
      return <PostDetailPage id={id} />
    }
  }

      // /admin/comments 留言監控頁（需權限，後端保護）
    if (pathname === '/admin/comments') {
        return <AdminCommentsMonitorPage />
    }

  // /admin/discord Discord 管理頁（需權限，後端保護）
  if (pathname === '/admin/discord') {
    return <DiscordPage />
  }

  // /admin/project 專案空間狀態頁（需權限，後端保護）
  if (pathname === '/admin/project') {
    return <ProjectStatusPage />
  }

  // /admin/platform 伺服器狀態頁（需權限，後端保護）
  if (pathname === '/admin/platform') {
    return <ServerStatusPage />
  }
    
    // 支援功能已移除

  // 維護模式
  if (platform.mode === 'maintenance') {
    return (
      <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 text-center">
        <div className="fixed top-3 sm:top-4 right-3 sm:right-4 z-50">
          <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
            <ThemeToggle />
            <span className="text-xs text-muted">主題</span>
          </div>
        </div>
        <div className="max-w-2xl w-full rounded-2xl p-4 sm:p-6 md:p-8 shadow-lg bg-white/70 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 backdrop-blur">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">系統維護中</h1>
          <p className="text-sm text-muted mb-4">我們正在升級服務以提供更佳體驗，造成不便敬請見諒。</p>
          <p className="mb-4 whitespace-pre-wrap text-sm sm:text-base">{platform.maintenance_message || '維護作業進行中。'}</p>
          {platform.maintenance_until && <p className="text-sm text-muted mb-4 sm:mb-6">預計完成：{platform.maintenance_until}</p>}
          {/* 支援功能已移除 */}
        </div>
      </div>
    )
  }

  // 取代原本的 splitDatePrefix
  const parseUpdate = (raw: string): { date?: string; text: string } => {
    if (!raw) return { text: '' }

    // 支援：YYYY-MM-DD / YYYY/M/D / M/D / M月D日，分隔符可有可無
    const dateRe = /(^(?:\d{4}-\d{2}-\d{2}|\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日))\s*[-：:·]?\s*/

    let s = raw.trim()
    let badge: string | undefined

    // 第一次擷取作為徽章
    const first = s.match(dateRe)
    if (first) {
      badge = first[1]
    }

    // 無論是否有抓到徽章，都把開頭連續的「日期 + 分隔」清掉到見不到為止
    let guard = 0
    while (dateRe.test(s) && guard++ < 10) {
      s = s.replace(dateRe, '')
    }

    return { date: badge, text: s.trim() }
  }

  // 顯示「開發頁」：
  // - development 模式任何人
  // - test 模式的非管理員
  if (((platform.mode === 'development') || (platform.mode === 'test' && !canSetMode())) && pathname === '/') {
    return (
      <div className="min-h-screen">
        <MidWidthCSS />

        {/* dev_admin 平台狀態卡 */}
        <EventStatusCard />

        {/* 右上角主題切換器 */}
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
            <ThemeToggle />
            <span className="text-xs text-muted">主題</span>
          </div>
        </div>

        <div className="flex flex-col items-center pt-12 sm:pt-16 md:pt-20 px-3 sm:px-4 pb-6 sm:pb-8">
          <div className="max-w-4xl w-full space-y-4 sm:space-y-6 md:space-y-8">
            {/* Socket 連線測試徽章已移除 */}

            {/* 頂部介紹卡 */}
            <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 md:p-8 shadow-soft">
              <div className="text-center mb-4 sm:mb-6 md:mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold dual-text mb-2 sm:mb-3">ForumKit</h1>
                <h2 className="text-base sm:text-lg text-fg mb-3 sm:mb-4">校園匿名討論平台</h2>
                <p className="leading-relaxed text-sm md:text-base text-fg px-2 sm:px-0">
                  ForumKit 是一個專為校園環境設計的現代化討論平台，提供安全、匿名且友善的交流空間。
                </p>
              </div>
            </div>

            {/* 開發專區：左顏色搭配器 + 右進度/更新 */}
            {isSmallScreen ? (
              <div className="space-y-4 sm:space-y-6">
                {/* 左：顏色搭配器 */}
                <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 md:p-6 shadow-soft">
                  <h3 className="font-semibold dual-text mb-3 sm:mb-4">顏色搭配器</h3>
                  <ColorDesigner />
                </div>

                {/* Realtime 聊天室示範 */}
                <ChatPanel room="lobby" title="聊天室" subtitle="開發模式示範聊天室" />

                {/* 右：開發紀錄 */}
                <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 md:p-6 shadow-soft right-col-spacing">
                  <h3 className="font-semibold dual-text mb-3 sm:mb-4">開發紀錄</h3>

                  {/* 項目進度（可拖拉） */}
                  <ResizableSection
                    title="項目進度"
                    min={200}
                    max={720}
                    initial={200}
                    storageKey="fk-progress-height-mobile"
                  >
                    {progressLoading ? (
                      <div className="py-8 text-center text-fg">載入中...</div>
                    ) : progressData?.error ? (
                      <div className="text-center py-8 text-rose-600">載入失敗：{progressData.error}</div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {progressData?.progress_items?.map((item, i) => (
                          <div key={i} className="flex items-center justify-between p-2 sm:p-3 rounded-xl border border-border bg-surface">
                            <div className="flex-1 min-w-0 pr-2">
                              <h5 className="font-medium dual-text text-sm sm:text-base truncate">{item.name}</h5>
                              {item.description && <p className="text-xs text-muted line-clamp-2 sm:line-clamp-none">{item.description}</p>}
                            </div>
                            <span className="px-2 py-1 text-xs rounded-lg bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300 whitespace-nowrap">
                              {item.status === 'completed' ? '完成' : item.status === 'in_progress' ? '開發中' : '規劃中'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </ResizableSection>

                  {/* 更新紀錄（每條獨立顯示日期） */}
                  <ResizableSection
                    title="更新紀錄"
                    min={200}
                    max={720}
                    initial={200}
                    storageKey="fk-updates-height-mobile"
                    className="mt-3 sm:mt-4"
                  >
                    {progressLoading ? (
                      <div className="py-8 text-center text-fg">載入中...</div>
                    ) : progressData?.recent_updates && progressData.recent_updates.length > 0 ? (
                      <div className="space-y-1.5 sm:space-y-2">
                        {progressData.recent_updates.map((update, i) => {
                          const { date, text } = parseUpdate(update)
                          return (
                            <div key={i} className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-border">
                              <div className="flex items-start gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-neutral-200/70 dark:bg-neutral-700 text-xs text-neutral-700 dark:text-neutral-200 shrink-0 whitespace-nowrap">
                                  {date || '未標記日期'}
                                </span>
                                <span className="text-xs text-fg leading-relaxed min-w-0 break-words">{text}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted text-sm">暫無更新記錄</div>
                    )}
                  </ResizableSection>
                </div>
              </div>
            ) : (
              // 桌機
              <div className="flex h-[740px] md:h-[780px] lg:h-[820px] bg-surface border border-border rounded-2xl overflow-hidden shadow-soft relative isolate">
                {/* 左：顏色搭配器 */}
                <div className="w-[400px] flex-shrink-0">
                  <div className="h-full min-h-[740px] p-4 md:p-6 overflow-y-auto">
                    <h3 className="font-semibold dual-text mb-4">顏色搭配器</h3>
                    <ColorDesigner />
                  </div>
                </div>

                {/* 右：開發紀錄區域 */}
                <div className="flex-1 h-full p-4 md:p-6 overflow-hidden flex flex-col right-col-spacing min-h-0">
                  <h3 className="font-semibold dual-text mb-4">開發紀錄</h3>
                  <div className="flex-1 flex flex-col space-y-4 min-h-0">
                    {/* 上：項目進度（可拖拉） */}
                    <ResizableSection
                      title="項目進度"
                      min={350}
                      max={700}
                      initial={350}
                      storageKey="fk-progress-height-desktop"
                    >
                      {progressLoading ? (
                        <div className="py-8 text-center text-fg">載入中...</div>
                      ) : progressData?.error ? (
                        <div className="text-center py-8 text-rose-600">載入失敗：{progressData.error}</div>
                      ) : (
                        <div className="space-y-3">
                          {progressData?.progress_items?.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface/50 shadow-sm">
                              <div className="min-w-0">
                                <h5 className="font-medium dual-text">{item.name}</h5>
                                {item.description && <p className="text-xs text-muted">{item.description}</p>}
                              </div>
                              <span className="px-2 py-1 text-xs rounded-lg bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300 whitespace-nowrap">
                                {item.status === 'completed' ? '完成' : item.status === 'in_progress' ? '開發中' : '規劃中'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </ResizableSection>

                    {/* 下：更新紀錄（每條獨立顯示日期） */}
                    <ResizableSection
                      title="更新紀錄"
                      min={350}
                      max={700}
                      initial={350}
                      storageKey="fk-updates-height-desktop"
                    >
                      {progressLoading ? (
                        <div className="py-8 text-center text-fg">載入中...</div>
                      ) : progressData?.recent_updates && progressData.recent_updates.length > 0 ? (
                        <div className="space-y-2">
                          {progressData.recent_updates.map((update, i) => {
                            const { date, text } = parseUpdate(update)
                            return (
                              <div key={i} className="p-2 rounded-lg bg-surface/30 border border-border/50">
                                <div className="flex items-start gap-2">
                                  <span className="px-2 py-0.5 rounded-md bg-neutral-200/70 dark:bg-neutral-700 text-xs text-neutral-700 dark:text-neutral-200 shrink-0 whitespace-nowrap">
                                    {date || '未標記日期'}
                                  </span>
                                  <span className="text-xs text-fg min-w-0 break-words leading-relaxed">{text}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted text-sm">暫無更新記錄</div>
                      )}
                    </ResizableSection>
                  </div>
                </div>
              </div>
            )}
            {/* 桌機：聊天室獨立區塊（不佔顏色搭配器區） */}
            {!isSmallScreen && (
              <div className="mt-4 bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
                <ChatPanel room="lobby" title="聊天室" subtitle="開發模式示範聊天室" />
              </div>
            )}

            {/* 意見回饋 */}
            <div id="feedback" className="bg-surface border border-border rounded-2xl p-3 sm:p-4 md:p-6 shadow-soft relative z-[5]">
              <h3 className="font-semibold dual-text mb-3 sm:mb-4">意見回饋</h3>
              <ReportForm compact />
            </div>
          </div>

          <RealtimeToastPanel onNewPost={handleNewPost} />
        </div>
      </div>
    )
  }

  // 手機版主頁
  if (isSmallScreen) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* 頂部標題欄 */}
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border px-4 py-3">
          <h1 className="font-semibold text-lg text-fg">ForumKit</h1>
          <p className="text-sm text-muted">校園匿名討論平台</p>
        </header>

        {/* 貼文列表 */}
        <div className="flex-1">
          <MobilePostList injectedItems={injectedItems} />
        </div>

        {/* 統一手機版導航 */}
        <MobileBottomNav />
        
        <RealtimeToastPanel onNewPost={handleNewPost} />
      </div>
    )
  }

  // 桌面版主頁
  return (
    <div className="min-h-screen">
      <NavBar pathname={pathname} />
      <main className="mx-auto max-w-5xl px-3 sm:px-4 sm:pt-24 md:pt-28">
        <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4 sm:mb-6">
          <div className="flex items-center justify-between gap-3 sm:gap-4 mb-4">
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">ForumKit</h1>
          </div>
          <PostForm onCreated={handleNewPost} />
        </section>
        <section className="bg-surface/90 border border-border rounded-2xl p-3 sm:p-4 md:p-6 shadow-soft">
          <div className="mb-3">
            <FilterBar />
          </div>
          <h2 className="font-semibold dual-text mb-3">最新貼文</h2>
          <PostList injectedItems={injectedItems} />
        </section>
        {/* 已移除我的送審/已審區塊 */}
      </main>
      <RealtimeToastPanel onNewPost={handleNewPost} />
    </div>
  )
}

/* ---------- 元件：回報表單（多次可提交） ---------- */
function ReportForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState('一般回報')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [ticket, setTicket] = useState('')
  const [tone, setTone] = useState<'success'|'warn'|'error'>('success')
  const [title, setTitle] = useState('已送出')
  const [desc, setDesc] = useState('已傳送至開發團隊')
  const minRows = compact ? 3 : 5

  const submit = async () => {
    if (message.trim().length < 5) {
      alert('請至少填寫 5 個字的說明，謝謝！')
      return
    }
    setBusy(true); setTicket('')
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: email, category, message }),
      })
      const data = await r.json().catch(() => ({}))
      const id = r.headers.get("X-ForumKit-Ticket") || data?.ticket_id || r.headers.get("X-Request-ID") || ""
      const ok = Boolean(data?.ok) && r.ok
      const delivery = data?.delivery
      
      if (ok && delivery === "discord") {
        setTone("success"); setTitle("已送出"); setDesc("已傳送至開發團隊")
      } else if (ok) {
        setTone("warn"); setTitle("已暫存"); setDesc("尚未確認傳送，請保留單號")
      } else {
        setTone("error"); setTitle("送出失敗"); setDesc("請稍後重試或回報")
      }
      
      setTicket(id)
      if (id) {
        const key = "forumkit_recent_tickets"
        const now = Date.now()
        const list = JSON.parse(localStorage.getItem(key) || "[]")
        list.unshift({ id, kind: "report", ts: now, note: category })
        localStorage.setItem(key, JSON.stringify(list.slice(0, 10)))
      }
      if (ok) setMessage('')
    } catch {
      setTicket('')
      setTone("error")
      setTitle("送出失敗")
      setDesc("請檢查網路後再試")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-left">
      <div className="grid gap-3">
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
          <input
            type="text"
            placeholder="你的聯絡方式（DC ID 或 Email，可留空）"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            className="form-control text-sm sm:text-base"
          />
          <select
            value={category}
            onChange={e=>setCategory(e.target.value)}
            className="form-control text-sm sm:text-base"
          >
            <option>一般回報</option>
            <option>無法載入</option>
            <option>帳號/登入</option>
            <option>安全性</option>
            <option>建議改善</option>
          </select>
        </div>
        <textarea
          placeholder="請描述你遇到的情況（盡量提供操作步驟與時間點）"
          value={message}
          onChange={e=>setMessage(e.target.value)}
          rows={minRows}
          className="form-control text-sm sm:text-base"
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50 text-sm sm:text-base">
            {busy ? '送出中...' : '送出回報'}
          </button>
        </div>
        {ticket && (
          <div className={`mt-3 rounded-xl border px-4 py-3 ${
            tone === "success" ? "bg-success-bg text-success-text border-success-border"
            : tone === "warn" ? "bg-warning-bg text-warning-text border-warning-border"
            : "bg-danger-bg text-danger-text border-danger-border"
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{title}</div>
                <div className="text-sm opacity-90">{desc}</div>
                <div className="mt-1 text-sm">
                  <span className="opacity-70">處理單號：</span>
                  <code className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">{ticket}</code>
                </div>
                <div className="mt-1 text-xs opacity-70">
                  請保留此單號以便後續查詢或接收通知。
                </div>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(ticket); }}
                className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="複製單號"
              >
                複製
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- 元件：顏色設計器 ---------- */
function ColorDesigner() {
  const [primaryColor, setPrimaryColor] = useState('#F8F5EE')
  const [primaryErr, setPrimaryErr] = useState<string | null>(null)
  const [secondaryColor, setSecondaryColor] = useState('#E5E5E5')
  const [secondaryErr, setSecondaryErr] = useState<string | null>(null)
  const [themeName, setThemeName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // 動態計算顏色屬性
  const getLuminance = (hex: string): number => {
    const rgb = hexToRgb(hex)
    if (!rgb) return 0.5
    const { r, g, b } = rgb
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  const colorType = getLuminance(primaryColor) > 0.5 ? 'light' : 'dark'
  const textColor = colorType === 'light' ? '#1F1F1F' : '#FFFFFF'
  const btnColor = colorType === 'light' ? darken(primaryColor, 0.15) : lighten(primaryColor, 0.25)

  // ---- HEX 檢查與格式化 ----
  const toHex = (n: number) => {
    const s = Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
    return s
  }
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const h = hex.replace(/[^0-9A-Fa-f]/g, '')
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16)
      const g = parseInt(h[1] + h[1], 16)
      const b = parseInt(h[2] + h[2], 16)
      return { r, g, b }
    }
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return { r, g, b }
    }
    return null
  }
  const rgbToHex = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`
  const lighten = (hex: string, amount = 0.75) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return hex
    const r = rgb.r + (255 - rgb.r) * amount
    const g = rgb.g + (255 - rgb.g) * amount
    const b = rgb.b + (255 - rgb.b) * amount
    return rgbToHex(r, g, b)
  }
  const darken = (hex: string, amount = 0.20) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return hex
    const r = rgb.r * (1 - amount)
    const g = rgb.g * (1 - amount)
    const b = rgb.b * (1 - amount)
    return rgbToHex(r, g, b)
  }
  const normalizeHex = (input: string): { ok: boolean; value?: string } => {
    const raw = (input || '').trim()
    const h = raw.replace(/[^0-9A-Fa-f]/g, '')
    if (h.length === 3) {
      return { ok: true, value: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase() }
    }
    if (h.length === 6) {
      return { ok: true, value: `#${h.toUpperCase()}` }
    }
    return { ok: false }
  }
  const onPrimaryText = (v: string) => {
    const norm = normalizeHex(v)
    if (norm.ok) { setPrimaryErr(null); setPrimaryColor(norm.value!) } else { setPrimaryErr('請輸入 #RRGGBB 或 RRGGBB/ABC') }
  }
  const onSecondaryText = (v: string) => {
    const norm = normalizeHex(v)
    if (norm.ok) { setSecondaryErr(null); setSecondaryColor(norm.value!) } else { setSecondaryErr('請輸入 #RRGGBB 或 RRGGBB/ABC') }
  }

  const submitTheme = async () => {
    if (!themeName.trim()) { alert('請為您的主題命名！'); return }
    setBusy(true); setNotice(null)
    try {
      const payload = {
        name: themeName,
        description,
        colors: { primary: primaryColor, secondary: secondaryColor }
      }
      const r = await fetch('/api/color_vote', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const data = await r.json().catch(()=> ({}))
      const id = r.headers.get("X-ForumKit-Ticket") || data?.ticket_id || r.headers.get("X-Request-ID") || ""
      const ok = Boolean(data?.ok) && r.ok
      const delivery = data?.delivery
      
      if (ok && delivery === "discord") {
        setNotice(`感謝！已送至 Discord。處理單號：${id}`)
      } else if (ok) {
        setNotice(`已送出（本機記錄）。處理單號：${id}`)
      } else {
        setNotice('提交失敗，請稍後重試')
      }
      
      if (id) {
        const key = "forumkit_recent_tickets"
        const now = Date.now()
        const list = JSON.parse(localStorage.getItem(key) || "[]")
        list.unshift({ id, kind: "color", ts: now, note: themeName })
        localStorage.setItem(key, JSON.stringify(list.slice(0, 10)))
      }
      
      if (r.ok) {
        setThemeName(''); setDescription('')
      }
    } catch {
      setNotice('提交失敗，請稍後重試')
    } finally {
      setBusy(false)
    }
  }

  const applyToTheme = () => {
    if (primaryErr || secondaryErr) return
    // 僅調整主色與邊框等關鍵 token，避免破壞現有主題對比
    try {
      const root = document.documentElement
      root.style.setProperty('--primary', primaryColor)
      root.style.setProperty('--primary-600', darken(primaryColor, 0.25))
      root.style.setProperty('--primary-100', lighten(primaryColor, 0.78))
      root.style.setProperty('--primary-hover', darken(primaryColor, 0.22))
      root.style.setProperty('--border', secondaryColor)
      // 可選：同步按鈕次要色調，降低突兀
      root.style.setProperty('--button-secondary', lighten(primaryColor, 0.86))
      root.style.setProperty('--button-secondary-hover', lighten(primaryColor, 0.80))
    } catch { /* no-op */ }
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface/50 rounded-xl p-4 border border-border">
        <h4 className="font-semibold dual-text mb-3">主題預覽</h4>
        <div className="space-y-3">
          <div className="h-20 rounded-xl flex items-center justify-center font-semibold border shadow-sm"
               style={{ backgroundColor: primaryColor, borderColor: secondaryColor, color: textColor }}>
            背景顏色 (主色)
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-xl font-semibold shadow-sm"
                    style={{ backgroundColor: btnColor, color: colorType === 'light' ? '#FFFFFF' : '#1F1F1F' }}>
              按鈕樣式
            </button>
            <div className="px-4 py-2 rounded-xl font-semibold shadow-sm border"
                 style={{ backgroundColor: primaryColor, borderColor: secondaryColor, color: textColor }}>
              框線樣式
            </div>
          </div>
        </div>
      </div>

      {/* 顏色輸入 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主色調 (背景顏色)</label>
          <div className="flex gap-3 items-center">
            <input type="color" value={primaryColor} onChange={e=>{ setPrimaryErr(null); setPrimaryColor(e.target.value) }} className="w-10 h-10 rounded-lg cursor-pointer" />
            <div className="flex-1">
              <input type="text" value={primaryColor} onChange={e=>onPrimaryText(e.target.value)} onBlur={e=>onPrimaryText(e.target.value)} className="form-control" />
              {primaryErr && <div className="mt-1 text-xs text-rose-600">{primaryErr}</div>}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">輔助色 (框線顏色)</label>
          <div className="flex gap-3 items-center">
            <input type="color" value={secondaryColor} onChange={e=>{ setSecondaryErr(null); setSecondaryColor(e.target.value) }} className="w-10 h-10 rounded-lg cursor-pointer" />
            <div className="flex-1">
              <input type="text" value={secondaryColor} onChange={e=>onSecondaryText(e.target.value)} onBlur={e=>onSecondaryText(e.target.value)} className="form-control" />
              {secondaryErr && <div className="mt-1 text-xs text-rose-600">{secondaryErr}</div>}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">深淺色類型</label>
          <div className="px-3 py-2 rounded-xl border bg-surface/60 text-fg text-sm">
            自動判斷：{colorType === 'light' ? '淺色主題 (黑字白按鈕)' : '深色主題 (白字黑按鈕)'}
          </div>
        </div>
      </div>

      {/* 主題資訊輸入 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主題名稱</label>
          <input
            type="text"
            value={themeName}
            onChange={e => setThemeName(e.target.value)}
            placeholder="為您的主題命名..."
            className="form-control"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主題描述 (可選)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述您的主題設計理念..."
            className="form-control min-h-[80px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={submitTheme} disabled={busy || !themeName.trim()} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50">
          {busy ? '提交中...' : '提交配色方案'}
        </button>
        <button type="button" onClick={applyToTheme} className="px-4 py-2 rounded-xl border hover:bg-surface/70">
          一鍵套用到主題
        </button>
        {notice && <span className="text-sm text-muted">{notice}</span>}
      </div>
    </div>
  )
}

/* ---------- /mode 管理面板 ---------- */
function AdminModePanel({ platform, onUpdated, full }: { platform: PlatformMode; onUpdated: (p: PlatformMode)=> void; full?: boolean }) {
  const [mode, setMode] = useState(platform.mode)
  const [msg, setMsg] = useState(platform.maintenance_message || '')
  const [until, setUntil] = useState(platform.maintenance_until || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    try {
      setSaving(true)
      const r = await fetch('/api/mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ 
        mode, 
        ...(msg && msg.trim() ? { notice: msg.trim() } : {}), 
        ...(until && until.trim() ? { eta: until.trim() } : {}) 
      }) })
      const data = await r.json().catch(()=> ({}))
      if (r.ok) onUpdated(data)
      location.assign('/')
      setTimeout(() => { 
        try {
          const pathname = location?.pathname
          if (pathname && pathname !== '/') location.assign('/')
        } catch (error) {
          console.warn('[AdminModePanel] Failed to check pathname:', error)
        }
      }, 800)
    } finally {
      setSaving(false)
    }
  }

  const inner = (
    <div className="max-w-xl w-full bg-surface/80 border border-border rounded-2xl p-4 sm:p-6 shadow backdrop-blur mt-8 sm:mt-10">
      <h2 className="font-semibold text-lg sm:text-xl mb-4">平台模式管理</h2>
      <div className="flex gap-2 sm:gap-4 flex-wrap mb-4">
        {(['normal','maintenance','development','test'] as PlatformMode['mode'][]).map(m => (
          <label key={m} className={`px-3 py-2 rounded-xl border cursor-pointer text-sm sm:text-base ${mode===m? 'dual-btn ring-2 ring-primary/50':'bg-surface/60 hover:bg-surface/80 border-border'}`}>
            <input type="radio" name="mode" value={m} className="hidden" checked={mode===m} onChange={()=> setMode(m)} />{m}
          </label>
        ))}
      </div>
      {mode==='maintenance' && (
        <div className="space-y-3 mb-4">
          <textarea value={msg} onChange={e=> setMsg(e.target.value)} placeholder="維護訊息" className="form-control min-h-[80px] text-sm sm:text-base" />
          <input value={until} onChange={e=> setUntil(e.target.value)} placeholder="預計完成時間 (ISO 或描述)" className="form-control text-sm sm:text-base" />
        </div>
      )}
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50 text-sm sm:text-base">{saving? '儲存中...' : '儲存'}</button>
      <p className="text-xs text-muted mt-4">尚未加入權限驗證（後續需登入才可操作）。</p>
    </div>
  )
  if (full) return <div className="min-h-screen flex flex-col items-center pt-20 sm:pt-24 md:pt-32 px-3 sm:px-4">{inner}</div>
  return <div className="mt-10">{inner}</div>
}