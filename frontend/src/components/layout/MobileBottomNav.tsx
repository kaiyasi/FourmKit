import { useState, useEffect } from 'react'
import { MessageSquare, ScrollText, PlusCircle, Settings, LogIn, Shield, HelpCircle, Menu, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getRole } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationBadge } from '../notifications/NotificationButton'

export function MobileBottomNav() {
  const { isLoggedIn, role } = useAuth()
  const location = useLocation()
  const currentRole = isLoggedIn ? (role || 'guest') : 'guest'
  const [showMore, setShowMore] = useState(false)
  
  const haptic = (ms = 10) => { 
    try { 
      if ('vibrate' in navigator) navigator.vibrate(ms) 
    } catch {} 
  }

  const isActive = (path: string) => location.pathname === path

  // 將底部導航實際高度寫入 CSS 變數，供頁面內容留白使用
  const writeBottomOffset = () => {
    try {
      const el = document.getElementById('fk-mobile-bottom-nav')
      if (!el) {
        // 如果元素還沒有載入，使用預設值
        document.documentElement.style.setProperty('--fk-bottomnav-offset', `calc(64px + env(safe-area-inset-bottom) + 8px)`)
        return
      }
      const rect = el.getBoundingClientRect()
      const offset = Math.max(0, Math.ceil(rect.height))
      // 加上額外間距，確保內容不會被遮住
      document.documentElement.style.setProperty('--fk-bottomnav-offset', `${offset + 12}px`)
      console.log(`[MobileBottomNav] 設定底部間距: ${offset + 12}px`)
    } catch (error) {
      console.warn('[MobileBottomNav] 設定 CSS 變數失敗:', error)
      // 失敗時使用預設值
      document.documentElement.style.setProperty('--fk-bottomnav-offset', `calc(64px + env(safe-area-inset-bottom) + 8px)`)
    }
  }

  useEffect(() => {
    // 立即執行一次
    writeBottomOffset()

    // 延遲執行，確保 DOM 完全載入
    const timeoutId = setTimeout(() => {
      writeBottomOffset()
    }, 100)

    const onResize = () => writeBottomOffset()
    window.addEventListener('resize', onResize)

    let ro: ResizeObserver | null = null
    try {
      ro = new ResizeObserver(() => writeBottomOffset())
      const el = document.getElementById('fk-mobile-bottom-nav')
      if (el) ro.observe(el)
    } catch {}

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', onResize)
      try { ro?.disconnect() } catch {}
    }
  }, [])

  // 路由變化時也重新計算，防止某些頁面沒有正確更新
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      writeBottomOffset()
    }, 50)
    return () => clearTimeout(timeoutId)
  }, [location.pathname])

  // 手機版底部導航：貼文 / 版規(或後台) / 發文 / 支援 / 更多
  const isAdmin = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(currentRole)
  const visibleTabs = [
    { path: '/boards', icon: MessageSquare, label: '貼文' },
    isAdmin 
      ? { path: '/admin', icon: Shield, label: '後台' }
      : { path: '/rules', icon: ScrollText, label: '版規' },
    { path: '/create', icon: PlusCircle, label: '發文' },
    { path: '/support', icon: HelpCircle, label: '支援' },
  ]

  // 更多選項列表
  const moreOptions = [
    { path: '/settings/profile', icon: Settings, label: '設定', requireLogin: true },
    { path: '/rules', icon: ScrollText, label: '版規', show: isAdmin }, // 管理員在主導航已有後台，所以這裡加版規
    { path: '/about', icon: MessageSquare, label: '關於我們' },
    { path: '/auth', icon: LogIn, label: '登入', requireGuest: true },
  ].filter(option => {
    if (option.requireLogin && !isLoggedIn) return false
    if (option.requireGuest && isLoggedIn) return false
    if (option.show === false) return false
    return true
  })

  return (
    <>
      <div id="fk-mobile-bottom-nav" className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        {/* 安全區域背景 */}
        <div 
          style={{
            background: 'var(--nav-bg)',
            borderTop: '1px solid var(--nav-border)'
          }}
          className="backdrop-blur-md"
        >
          <div className="flex items-center justify-around px-2 py-1 pb-[env(safe-area-inset-bottom)]">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              const active = isActive(tab.path)
              
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  onClick={() => haptic(8)}
                  style={{
                    color: active ? 'var(--primary)' : 'var(--muted)',
                    background: active ? 'var(--primary)/10' : 'transparent'
                  }}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-0 flex-1 transition-all duration-200 hover:opacity-80"
                >
                  <Icon className={`w-5 h-5 ${active ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  <span className={`text-xs font-medium truncate ${active ? 'font-semibold' : ''}`}>
                    {tab.label}
                  </span>
                </Link>
              )
            })}
            
            {/* 更多按鈕 */}
            <button
              onClick={() => {
                haptic(8)
                setShowMore(!showMore)
              }}
              style={{
                color: showMore ? 'var(--primary)' : 'var(--muted)',
                background: showMore ? 'var(--primary)/10' : 'transparent'
              }}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-0 flex-1 transition-all duration-200 hover:opacity-80"
            >
              {isLoggedIn ? (
                <NotificationBadge>
                  <Menu className={`w-5 h-5 ${showMore ? 'stroke-2' : 'stroke-[1.5]'}`} />
                </NotificationBadge>
              ) : (
                <Menu className={`w-5 h-5 ${showMore ? 'stroke-2' : 'stroke-[1.5]'}`} />
              )}
              <span className={`text-xs font-medium truncate ${showMore ? 'font-semibold' : ''}`}>
                更多
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 更多選項彈出菜單 */}
      {showMore && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setShowMore(false)}
          />
          
          {/* 彈出菜單 */}
          <div className="fixed bottom-16 right-4 z-50 md:hidden">
            <div 
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-medium)'
              }}
              className="rounded-2xl py-2 min-w-[160px] animate-in slide-in-from-bottom-2 duration-200"
            >
              {moreOptions.map((option) => {
                const Icon = option.icon
                const active = isActive(option.path)
                
                return (
                  <Link
                    key={option.path}
                    to={option.path}
                    onClick={() => {
                      haptic(8)
                      setShowMore(false)
                    }}
                    style={{
                      color: active ? 'var(--primary)' : 'var(--fg)'
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium leading-snug">{option.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}
