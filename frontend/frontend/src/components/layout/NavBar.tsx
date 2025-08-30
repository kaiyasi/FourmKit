import { Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquareDot, LogOut, AlertTriangle, Activity, HelpCircle, LifeBuoy } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import NotificationButton from '../notifications/NotificationButton'
import { Link } from 'react-router-dom'
import { 
  getRole, 
  Role
} from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

const sets: Record<Role, { to: string; label: string; icon: any; iconOnly?: boolean }[]> = {
  guest: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/support', label: '支援', icon: LifeBuoy },
    { to: '/auth', label: '登入', icon: LogIn, iconOnly: true },
  ],
  user: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/support', label: '支援', icon: LifeBuoy },
    { to: '/my-violations', label: '我的違規', icon: AlertTriangle },
    { to: '/settings/profile', label: '設定', icon: Settings },
  ],
  dev_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
    { to: '/admin/events', label: '事件', icon: Activity },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  campus_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
    { to: '/admin/support', label: '客服', icon: LifeBuoy },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  cross_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
    { to: '/admin/support', label: '客服', icon: LifeBuoy },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  campus_moderator: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
    { to: '/admin/support', label: '客服', icon: LifeBuoy },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  cross_moderator: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
    { to: '/admin/support', label: '客服', icon: LifeBuoy },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
}

export function NavBar({ pathname }: { pathname: string }) {
  const { isLoggedIn, role, logout } = useAuth()
  const currentRole = (isLoggedIn ? role : 'guest') as Role
  const items = sets[currentRole] || sets.guest
  const isActive = (to: string) => pathname === to || (to !== '/' && pathname && pathname.startsWith(to))

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 hidden md:block">
      <div className="mx-auto max-w-5xl">
        <div className="relative flex items-center justify-center">
          <ul className="flex items-center gap-6 px-6 py-3 rounded-2xl bg-surface/70 backdrop-blur-md border border-border shadow-sm h-12 tablet-nav">
            {/* 主要導航項目 */}
            {items.map(({ to, label, icon: Icon, iconOnly }) => {
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={[
                      'relative flex items-center gap-2 px-4 py-2 rounded-xl transition whitespace-nowrap touch-target',
                      isActive(to)
                        ? 'font-semibold ring-1 ring-primary-100 dark:ring-primary-600/40 bg-primary-100/60 dark:bg-primary-600/20 text-fg'
                        : 'text-muted hover:text-fg hover:bg-surface/70'
                    ].join(' ')}
                    aria-label={iconOnly ? label : undefined}
                    title={iconOnly ? label : undefined}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {!iconOnly && <span className="text-sm">{label}</span>}
                    {isActive(to) && (
                      <span className="pointer-events-none absolute left-2 right-2 -bottom-1 h-0.5 rounded bg-fg/80 dark:bg-fg/90" />
                    )}
                  </Link>
                </li>
              )
            })}
            
            {/* 右側功能區塊 */}
            <li className="pl-4 ml-4 border-l border-border flex items-center gap-3">
              <ThemeToggle />
              {isLoggedIn && (
                <div className="flex items-center gap-2">
                  <NotificationButton size="md" />
                </div>
              )}
              {isLoggedIn && (
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-muted hover:text-fg hover:bg-surface/70 transition"
                  title="登出"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-sm">登出</span>
                </button>
              )}
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}
