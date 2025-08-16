import { Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquareDot, LogOut } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { ModeIndicator } from '../ui/ModeIndicator'
import { Link } from 'react-router-dom'
import { isLoggedIn, clearSession, getRole, Role } from '@/utils/auth'

const sets: Record<Role, { to: string; label: string; icon: any; iconOnly?: boolean }[]> = {
  guest: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/auth', label: '登入', icon: LogIn, iconOnly: true },
  ],
  user: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/settings/profile', label: '設定', icon: Settings, iconOnly: true },
  ],
  dev_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
  campus_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
  cross_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
  campus_moder: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
  cross_moder: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
}

export function NavBar({ pathname }: { pathname: string }) {
  const role = isLoggedIn() ? getRole() : 'guest'
  const items = sets[role] || sets.guest
  const isActive = (to: string) => pathname === to || (to !== '/' && pathname.startsWith(to))
  const canManageMode = ['dev_admin', 'campus_admin', 'cross_admin'].includes(role)

  // 為有權限的用戶在後台後面插入模式指示器
  const renderNavItems = () => {
    const navItems = []
    
    items.forEach(({ to, label, icon: Icon, iconOnly }, index) => {
      // 渲染正常的導航項目
      navItems.push(
        <li key={to}>
          <Link
            to={to}
            className={[
              'relative flex items-center gap-2 px-3 py-1.5 rounded-xl transition whitespace-nowrap',
              isActive(to)
                ? 'font-semibold ring-1 ring-primary-100 dark:ring-primary-600/40 bg-primary-100/60 dark:bg-primary-600/20 text-fg'
                : 'text-muted hover:text-fg hover:bg-surface/70'
            ].join(' ')}
            aria-label={iconOnly ? label : undefined}
            title={iconOnly ? label : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {!iconOnly && <span>{label}</span>}
            {isActive(to) && (
              <span className="pointer-events-none absolute left-2 right-2 -bottom-1 h-0.5 rounded bg-fg/80 dark:bg-fg/90" />
            )}
          </Link>
        </li>
      )

      // 在後台項目後面添加模式指示器
      if (to === '/admin' && isLoggedIn()) {
        navItems.push(
          <li key="mode-indicator">
            {canManageMode ? (
              <Link
                to="/mode"
                className={[
                  'relative flex items-center gap-2 px-3 py-1.5 rounded-xl transition whitespace-nowrap',
                  isActive('/mode')
                    ? 'font-semibold ring-1 ring-primary-100 dark:ring-primary-600/40 bg-primary-100/60 dark:bg-primary-600/20 text-fg'
                    : 'text-muted hover:text-fg hover:bg-surface/70'
                ].join(' ')}
                title="系統模式管理"
              >
                <ModeIndicator showText={true} />
                {isActive('/mode') && (
                  <span className="pointer-events-none absolute left-2 right-2 -bottom-1 h-0.5 rounded bg-fg/80 dark:bg-fg/90" />
                )}
              </Link>
            ) : (
              <div className="px-3 py-1.5">
                <ModeIndicator showText={true} />
              </div>
            )}
          </li>
        )
      }
    })
    
    return navItems
  }

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 hidden md:block">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-center">
          <ul className="flex items-center gap-6 px-4 py-2 rounded-2xl bg-surface/70 backdrop-blur-md border border-border shadow-sm">
            {renderNavItems()}

            {isLoggedIn() && (
              <li>
                <button
                  onClick={() => { clearSession(); window.location.href = "/"; }}
                  className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl transition whitespace-nowrap text-muted hover:text-fg hover:bg-surface/70"
                  title="登出"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            )}
            <li className="pl-2 ml-2 border-l border-border">
              <ThemeToggle />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}
