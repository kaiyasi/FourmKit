import { useEffect, useMemo, useState } from 'react'
import { Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquareDot, Menu, X, LogOut } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Link, useLocation } from 'react-router-dom'
import { isLoggedIn, clearSession, getRole, Role } from '@/utils/auth'
import useBadges from '@/hooks/useBadges'

const itemsByRole: Record<Role, { to: string; label: string; icon: any }[]> = {
  guest: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/auth', label: '登入', icon: LogIn },
  ],
  user: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/about', label: '關於我們', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
    { to: '/settings/profile', label: '設定', icon: Settings },
  ],
  dev_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/mode', label: '模式', icon: Settings },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  campus_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/mode', label: '模式', icon: Settings },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  cross_admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/mode', label: '模式', icon: Settings },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  campus_moder: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  cross_moder: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  moderator: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
}

export function MobileFabNav() {
  const [open, setOpen] = useState(false)
  const role = isLoggedIn() ? getRole() : 'guest'
  const items = itemsByRole[role] || itemsByRole.guest
  const { pathname } = useLocation()

  const isActive = (to: string) => pathname === to || (to !== '/' && pathname.startsWith(to))
  const badge = useBadges({ watched: items.map(i=>i.to) })
  const haptic = (ms = 10) => { try { if ('vibrate' in navigator) navigator.vibrate(ms) } catch {} }

  // 主要導覽（4 個），第 5 格留給「更多」
  const primary = useMemo(() => items.slice(0, 4), [items])

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden pb-[env(safe-area-inset-bottom)]">
      {/* 展開的延伸操作（登出 / 主題） */}
      {open && <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className={`absolute bottom-16 right-4 flex flex-col items-end space-y-2 transition-all duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-label="更多動作">
        {isLoggedIn() ? (
          <button
            onClick={() => { haptic(12); clearSession(); window.location.href = "/"; }}
            className="flex items-center gap-2 px-3 py-2 rounded-full dual-btn border border-border shadow-lg backdrop-blur min-h-[44px] min-w-[44px]"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm whitespace-nowrap">登出</span>
          </button>
        ) : (
          <Link
            to="/auth"
            onClick={() => { haptic(12); setOpen(false) }}
            className="flex items-center gap-2 px-3 py-2 rounded-full dual-btn border border-border shadow-lg backdrop-blur min-h-[44px] min-w-[44px]"
          >
            <LogIn className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm whitespace-nowrap">登入</span>
          </Link>
        )}
        <div className="flex items-center gap-2 px-3 py-2 rounded-full dual-btn border border-border shadow-lg backdrop-blur min-h-[44px]">
          <ThemeToggle />
          <span className="text-xs text-muted whitespace-nowrap">主題</span>
        </div>
      </div>

      {/* 底部導覽列 */}
      <nav role="navigation" aria-label="行動底部導覽" className="mx-auto max-w-5xl">
        <div className="mx-3 mb-3 rounded-2xl border border-border bg-surface/80 backdrop-blur shadow-soft">
          <ul className="grid grid-cols-5 divide-x divide-border">
            {primary.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  onClick={() => haptic(8)}
                  aria-current={isActive(to) ? 'page' : undefined}
                  className={[
                    'flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] focus:outline-none',
                    isActive(to)
                      ? 'font-semibold ring-1 ring-primary-100 dark:ring-primary-600/40 bg-primary-100/50 dark:bg-primary-600/20 text-fg'
                      : 'text-muted hover:text-fg'
                  ].join(' ')}
                >
                  <span className="relative">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    {badge.get(to) > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] leading-[18px] text-center shadow">{badge.get(to)}</span>
                    )}
                  </span>
                  <span className="text-xs leading-none">{label}</span>
                </Link>
              </li>
            ))}
            {/* 更多 */}
            <li>
              <button
                onClick={() => { haptic(8); setOpen(v => !v) }}
                aria-expanded={open}
                aria-label="更多選單"
                className="w-full flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] text-muted hover:text-fg"
              >
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                <span className="text-xs leading-none">更多</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  )
}
