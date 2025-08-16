import { useState } from 'react'
import { Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquareDot, Menu, X, LogOut } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Link } from 'react-router-dom'
import { isLoggedIn, clearSession, getRole, Role } from '@/utils/auth'

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
    { to: '/mode', label: '模式', icon: Settings },
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
    { to: '/mode', label: '模式', icon: Settings },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  cross_moder: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/mode', label: '模式', icon: Settings },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
}

export function MobileFabNav() {
  const [open, setOpen] = useState(false)
  const role = isLoggedIn() ? getRole() : 'guest'
  const items = itemsByRole[role] || itemsByRole.guest

  return (
    <div className="fixed bottom-3 sm:bottom-4 right-3 sm:right-4 z-50 md:hidden">
      {open && <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />}
      <div className={`flex flex-col items-end space-y-2 sm:space-y-3 mb-3 transition-all duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {items.map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full dual-btn dual-text border border-border shadow-lg backdrop-blur min-h-[44px] min-w-[44px]">
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm whitespace-nowrap">{label}</span>
          </Link>
        ))}
        {isLoggedIn() && (
          <button
            onClick={() => { clearSession(); window.location.href = "/"; }}
            className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full dual-btn dual-text border border-border shadow-lg backdrop-blur min-h-[44px] min-w-[44px]"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm whitespace-nowrap">登出</span>
          </button>
        )}
        <div className="flex items-center gap-2 px-2 py-1 sm:px-3 sm:py-2 rounded-full dual-btn dual-text border border-border shadow-lg backdrop-blur min-h-[44px]">
          <ThemeToggle />
          <span className="text-xs text-muted pr-1 sm:pr-2 whitespace-nowrap">主題</span>
        </div>
      </div>
      <button 
        onClick={() => setOpen(v => !v)} 
        aria-label="選單" 
        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
    </div>
  )
}
