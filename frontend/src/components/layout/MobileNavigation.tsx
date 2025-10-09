import { useState, useEffect } from 'react'
import { 
  Home, 
  MessageSquare, 
  PlusCircle, 
  User, 
  Settings, 
  Shield,
  Menu,
  X,
  LogOut,
  LogIn,
  Info,
  ScrollText,
  FileText,
  LayoutDashboard,
  Activity,
  HelpCircle,
  Wrench
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from '../ui/ThemeToggle'
import { getRole, Role } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  to: string
  label: string
  icon: any
  primary?: boolean
  require?: (role: Role) => boolean
  action?: () => void
}

export function MobileNavigation() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { isLoggedIn, logout, role } = useAuth()
  const location = useLocation()
  const currentRole = isLoggedIn ? (role || 'guest') : 'guest'

  const haptic = (ms = 10) => {
    try { 
      if ('vibrate' in navigator) navigator.vibrate(ms) 
    } catch {} 
  }

  const isActive = (path: string) => location.pathname === path

  // 主要底部導航（統一規格）：貼文 / 版規(或後台) / 發文 / 設定(未登入為登入)
  const isAdmin = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(currentRole)
  const primaryNav: NavItem[] = [
    { to: '/boards', label: '貼文', icon: MessageSquare, primary: true },
    isAdmin 
      ? { to: '/admin', label: '後台', icon: Shield, primary: true }
      : { to: '/rules', label: '版規', icon: ScrollText, primary: true },
    { to: '/create', label: '發文', icon: PlusCircle, primary: true },
    // dev_admin 顯示事件，其他管理員顯示支援
    currentRole === 'dev_admin'
      ? { to: '/admin/events', label: '事件', icon: Activity, primary: true }
      : isAdmin
        ? { to: '/admin/support', label: '支援', icon: HelpCircle, primary: true }
        : { to: isLoggedIn ? '/settings/profile' : '/auth', label: isLoggedIn ? '設定' : '登入', icon: Settings, primary: true },
    { to: isLoggedIn ? '/settings/profile' : '/auth', label: isLoggedIn ? '設定' : '登入', icon: Settings, primary: true },
  ]

  // 次要功能菜單
  const secondaryNav: NavItem[] = [
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/admin/comments', label: '留言監控', icon: MessageSquare, require: r => ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(r) },
    { to: '/admin/events', label: '事件日誌', icon: Activity, require: r => r === 'dev_admin' },
    { to: '/mode', label: '模式管理', icon: Wrench, require: r => r === 'dev_admin' },
    { to: '/settings', label: '應用設定', icon: Settings, require: r => r !== 'guest' },
  ].filter(item => !item.require || item.require(currentRole))

  // 認證操作
  const authAction: NavItem = isLoggedIn
    ? { to: '#', label: '登出', icon: LogOut, action: () => { haptic(12); logout(); setMenuOpen(false) } }
    : { to: '/auth', label: '登入', icon: LogIn }

  // 確保主導航不超過5個項目
  const visiblePrimaryNav = primaryNav.slice(0, 5)

  // 設定底部導航高度到CSS變數
  const writeBottomOffset = () => {
    try {
      const el = document.getElementById('fk-mobile-bottom-nav')
      if (!el) {
        document.documentElement.style.setProperty('--fk-bottomnav-offset', `calc(72px + env(safe-area-inset-bottom))`)
        return
      }
      const rect = el.getBoundingClientRect()
      const offset = Math.max(0, Math.ceil(rect.height))
      document.documentElement.style.setProperty('--fk-bottomnav-offset', `${offset + 12}px`)
    } catch {
      document.documentElement.style.setProperty('--fk-bottomnav-offset', `calc(72px + env(safe-area-inset-bottom))`)
    }
  }

  // 設定CSS變數
  useEffect(() => {
    writeBottomOffset()
    const timeoutId = setTimeout(() => writeBottomOffset(), 100)
    const onResize = () => writeBottomOffset()
    window.addEventListener('resize', onResize)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 關閉菜單當路由變化
  useEffect(() => {
    setMenuOpen(false)
    const timeoutId = setTimeout(() => writeBottomOffset(), 50)
    return () => clearTimeout(timeoutId)
  }, [location.pathname])

  return (
    <>
      {/* 底部主導航 */}
      <nav id="fk-mobile-bottom-nav" className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
        <div className="bg-surface/95 backdrop-blur-md border-t border-border">
          <div className="flex items-center justify-around px-2 py-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
            {visiblePrimaryNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.to)
              
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => haptic(8)}
                  className={`
                    flex flex-col items-center gap-1 p-2 rounded-xl
                    min-w-0 flex-1 mobile-touch-target transition-all duration-200
                    ${active 
                      ? 'text-primary bg-primary/10 scale-105 font-semibold' 
                      : 'text-muted hover:text-fg hover:bg-surface-hover'
                    }
                  `}
                  aria-label={item.label}
                >
                  <Icon className={`w-5 h-5 ${active ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  <span className={`text-xs truncate leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </Link>
              )
            })}
            
            {/* 更多菜單按鈕 */}
            <button
              onClick={() => { haptic(12); setMenuOpen(true) }}
              className="flex flex-col items-center gap-1 p-2 rounded-xl min-w-0 flex-1 mobile-touch-target transition-all duration-200 text-muted hover:text-fg hover:bg-surface-hover"
              aria-label="更多選項"
            >
              <Menu className="w-5 h-5 stroke-[1.5]" />
              <span className="text-xs font-medium truncate leading-tight">更多</span>
            </button>
          </div>
        </div>
      </nav>

      {/* 全屏菜單遮罩 */}
      {menuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* 滑出式菜單 */}
      <div className={`
        fixed inset-x-0 bottom-0 z-50 md:hidden
        transform transition-transform duration-300 ease-out
        ${menuOpen ? 'translate-y-0' : 'translate-y-full'}
      `}>
        <div className="bg-surface border-t border-border rounded-t-2xl shadow-2xl">
          {/* 菜單頭部 */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-semibold dual-text">更多選項</h3>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-surface-hover mobile-touch-target"
                aria-label="關閉菜單"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 次要功能網格 */}
          <div className="p-4 grid grid-cols-3 gap-3">
            {secondaryNav.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => { haptic(8); setMenuOpen(false) }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover mobile-touch-large transition-colors"
                >
                  <Icon className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium text-center dual-text leading-tight">
                    {item.label}
                  </span>
                </Link>
              )
            })}

            {/* 認證操作 */}
            {authAction.action ? (
              <button
                onClick={authAction.action}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover mobile-touch-large transition-colors"
              >
                <authAction.icon className="w-6 h-6 text-red-500" />
                <span className="text-xs font-medium text-center text-red-600 leading-tight">
                  {authAction.label}
                </span>
              </button>
            ) : (
              <Link
                to={authAction.to}
                onClick={() => { haptic(8); setMenuOpen(false) }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover mobile-touch-large transition-colors"
              >
                <authAction.icon className="w-6 h-6 text-primary" />
                <span className="text-xs font-medium text-center dual-text leading-tight">
                  {authAction.label}
                </span>
              </Link>
            )}
          </div>

          {/* 安全區域 */}
          <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </div>
    </>
  )
}
