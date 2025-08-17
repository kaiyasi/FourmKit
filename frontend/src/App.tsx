import { useEffect, useState } from 'react'
import { getSocket } from './services/socket'
import { ensurePostListener, ensureCommentListener, ensureAnnounceListener } from './services/realtime'
import { getClientId, upsertByIdOrTemp, upsertSocketPayload } from './utils/client'
import { NavBar } from './components/layout/NavBar'
import { MobileFabNav } from './components/layout/MobileFabNav'
import { ThemeToggle } from './components/ui/ThemeToggle'
import SocketBadge from './components/ui/SocketBadge'
import PostForm from './components/forms/PostForm'
import PostList from './components/PostList'
import ResizableSection from './components/ResizableSection'

type PlatformMode = {
  mode: 'normal' | 'maintenance' | 'development'
  maintenance_message?: string
  maintenance_until?: string
}

type Role = 'guest' | 'user' | 'moderator' | 'admin'

interface ProgressItem { name: string; status: 'completed'|'in_progress'|'planned'; description: string }
interface ProgressData { progress_items: ProgressItem[]; recent_updates: string[]; last_updated: string; error?: string }

export default function App() {
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

  function useRealtimeToasts(onNewPost?: (payload: any) => void) {
    const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
    useEffect(() => {
      let idSeq = 1
      const push = (text: string) => {
        const id = idSeq++
        setToasts(cur => [...cur, { id, text }])
        setTimeout(() => setToasts(cur => cur.filter(t => t.id !== id)), 5000)
      }
      
      const myClientId = getClientId()
      
      // 統一的 post 處理器：顯示 toast 並調用回調
      const combinedPostHandler = (payload: any) => {
        const { post, origin, client_tx_id } = payload
        
        console.info(`[App] processing socket payload: post_id=${post?.id} origin=${origin} tx_id=${client_tx_id}`)
        
        // 顯示 toast
        if (origin === myClientId) {
          push(`您的貼文已發布：${(post?.content ?? '').slice(0, 30)}…`)
        } else {
          push(`新貼文：${(post?.content ?? '').slice(0, 30)}…`)
        }
        
        // 呼叫外部回調，用於更新 injected 狀態
        onNewPost?.(payload)
      }
      
      const onCmt = (c: any) => push(`新留言：${(c?.content ?? '').slice(0, 20)}…`)
      const onAnn = (a: any) => push(`公告：${(a?.message ?? '').slice(0, 30)}…`)
      
      // 只註冊一次 post listener，合併 toast 和狀態更新功能
      ensurePostListener(combinedPostHandler)
      ensureCommentListener(onCmt)
      ensureAnnounceListener(onAnn)
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

  const [pathname, setPathname] = useState(window.location.pathname)
  const [platform, setPlatform] = useState<PlatformMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(true)

  const { isSmallScreen } = useScreenSize()
  const [injectedItems, setInjectedItems] = useState<any[]>([])
  
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

  useEffect(() => {
    fetch('/api/mode')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then(setPlatform)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(()=> { console.log('[ForumKit] build tag', (import.meta as any).env?.VITE_BUILD_TAG) },[])

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 只在開發模式首頁載入進度（後端已合併 CHANGELOG）
  useEffect(() => {
    if (platform?.mode === 'development' && pathname === '/') {
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
    return <div className="min-h-screen grid place-items-center"><div className="text-rose-600">{error ? `載入失敗：${error}` : '無法取得平台模式'}</div></div>
  }

  // /mode 管理頁
  if (pathname === '/mode') {
    return <AdminModePanel platform={platform} onUpdated={setPlatform} full />
  }

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
          <ReportForm />
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

  // 開發模式首頁
  if (platform.mode === 'development' && pathname === '/') {
    return (
      <div className="min-h-screen">
        <MidWidthCSS />

        {/* 右上角主題切換器 */}
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
            <ThemeToggle />
            <span className="text-xs text-muted">主題</span>
          </div>
        </div>

        <div className="flex flex-col items-center pt-12 sm:pt-16 md:pt-20 px-3 sm:px-4 pb-6 sm:pb-8">
          <div className="max-w-4xl w-full space-y-4 sm:space-y-6 md:space-y-8">
            <div className="flex justify-center"><SocketBadge /></div>

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

  // 正常主頁
  return (
    <div className="min-h-screen">
      <NavBar pathname={pathname} />
      <MobileFabNav />
      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28">
        <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4 sm:mb-6">
          <div className="flex items-center justify-between gap-3 sm:gap-4 mb-4">
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">ForumKit</h1>
            <SocketBadge />
          </div>
          <PostForm onCreated={handleNewPost} />
        </section>
        <section className="bg-surface/90 border border-border rounded-2xl p-3 sm:p-4 md:p-6 shadow-soft">
          <h2 className="font-semibold dual-text mb-3">最新貼文</h2>
          <PostList injectedItems={injectedItems} />
        </section>
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
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg text-sm sm:text-base"
          />
          <select
            value={category}
            onChange={e=>setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-2xl border border-border bg-surface/70 text-fg text-sm sm:text-base"
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
          className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg text-sm sm:text-base"
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50 text-sm sm:text-base">
            {busy ? '送出中...' : '送出回報'}
          </button>
        </div>
        {ticket && (
          <div className={`mt-3 rounded-xl border px-4 py-3 ${
            tone === "success" ? "bg-green-50 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-100"
            : tone === "warn" ? "bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100"
            : "bg-red-50 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-100"
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
  const [secondaryColor, setSecondaryColor] = useState('#DCCFBD')
  const [themeName, setThemeName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const colorType = (() => {
    const hex = primaryColor.replace('#','')
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16)
    const brightness = (r*299 + g*587 + b*114) / 1000
    return brightness > 128 ? 'light' : 'dark'
  })()
  const btnColor = colorType === 'light' ? '#2E2F31' : '#F5F5F5'
  const textColor = colorType === 'light' ? '#2E2F31' : '#F5F5F5'

  const submitTheme = async () => {
    if (!themeName.trim()) { alert('請為您的主題命名！'); return }
    setBusy(true); setNotice(null)
    try {
      const payload = {
        name: themeName,
        description,
        colors: { primary: primaryColor, secondary: secondaryColor, colorType, buttonColor: btnColor, textColor }
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

  return (
    <div className="space-y-4">
      <div className="bg-surface/50 rounded-xl p-4 border border-border">
        <h4 className="font-semibold dual-text mb-3">主題預覽</h4>
        <div className="space-y-3">
          <div className="h-20 rounded-xl flex items-center justify-center font-semibold border-2 shadow-sm"
               style={{ backgroundColor: primaryColor, borderColor: secondaryColor, color: textColor }}>
            背景顏色 (主色)
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-xl font-semibold shadow-sm"
                    style={{ backgroundColor: btnColor, color: colorType === 'light' ? '#FFFFFF' : '#1F1F1F' }}>
              按鈕樣式
            </button>
            <div className="px-4 py-2 rounded-xl font-semibold shadow-sm border-2"
                 style={{ backgroundColor: 'transparent', borderColor: secondaryColor, color: textColor }}>
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
            <input type="color" value={primaryColor} onChange={e=>setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
            <input type="text" value={primaryColor} onChange={e=>setPrimaryColor(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">輔助色 (框線顏色)</label>
          <div className="flex gap-3 items-center">
            <input type="color" value={secondaryColor} onChange={e=>setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
            <input type="text" value={secondaryColor} onChange={e=>setSecondaryColor(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg" />
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
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg mb-2">主題描述 (可選)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述您的主題設計理念..."
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg min-h-[80px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={submitTheme} disabled={busy || !themeName.trim()} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50">
          {busy ? '提交中...' : '提交配色方案'}
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
      setTimeout(() => { if (location.pathname !== '/') location.assign('/') }, 800)
    } finally {
      setSaving(false)
    }
  }

  const inner = (
    <div className="max-w-xl w-full bg-surface/80 border border-border rounded-2xl p-4 sm:p-6 shadow backdrop-blur mt-8 sm:mt-10">
      <h2 className="font-semibold text-lg sm:text-xl mb-4">平台模式管理</h2>
      <div className="flex gap-2 sm:gap-4 flex-wrap mb-4">
        {(['normal','maintenance','development'] as PlatformMode['mode'][]).map(m => (
          <label key={m} className={`px-3 py-2 rounded-xl border cursor-pointer text-sm sm:text-base ${mode===m? 'dual-btn ring-2 ring-primary/50':'bg-surface/60 hover:bg-surface/80 border-border'}`}>
            <input type="radio" name="mode" value={m} className="hidden" checked={mode===m} onChange={()=> setMode(m)} />{m}
          </label>
        ))}
      </div>
      {mode==='maintenance' && (
        <div className="space-y-3 mb-4">
          <textarea value={msg} onChange={e=> setMsg(e.target.value)} placeholder="維護訊息" className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg min-h-[80px] text-sm sm:text-base" />
          <input value={until} onChange={e=> setUntil(e.target.value)} placeholder="預計完成時間 (ISO 或描述)" className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg text-sm sm:text-base" />
        </div>
      )}
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50 text-sm sm:text-base">{saving? '儲存中...' : '儲存'}</button>
      <p className="text-xs text-muted mt-4">尚未加入權限驗證（後續需登入才可操作）。</p>
    </div>
  )
  if (full) return <div className="min-h-screen flex flex-col items-center pt-20 sm:pt-24 md:pt-32 px-3 sm:px-4">{inner}</div>
  return <div className="mt-10">{inner}</div>
}
