import { Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquareDot } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

type Role = 'guest' | 'user' | 'moderator' | 'admin'

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
  moderator: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '後台聊天', icon: MessageSquareDot },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
  admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '後台聊天', icon: MessageSquareDot },
    { to: '/settings/admin', label: '設定', icon: Settings, iconOnly: true },
  ],
}

export function NavBar({ role, pathname }: { role: Role; pathname: string }) {
  const items = sets[role]
  const isActive = (to: string) => pathname === to || (to !== '/' && pathname.startsWith(to))

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 hidden md:block">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-center">
          <ul className="flex items-center gap-6 px-4 py-2 rounded-2xl bg-surface/70 backdrop-blur-md border border-border shadow-sm">
            {items.map(({ to, label, icon: Icon, iconOnly }) => (
              <li key={to}>
                <a
                  href={to}
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
                </a>
              </li>
            ))}
            <li className="pl-2 ml-2 border-l border-border">
              <ThemeToggle />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}
