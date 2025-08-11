import { useState } from 'react'
import { Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquareDot, Menu, X } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

type Role = 'guest' | 'user' | 'moderator' | 'admin'

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
  moderator: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '後台聊天', icon: MessageSquareDot },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
  admin: [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/admin', label: '後台', icon: LayoutDashboard },
    { to: '/admin/chat', label: '後台聊天', icon: MessageSquareDot },
    { to: '/settings/admin', label: '設定', icon: Settings },
  ],
}

export function MobileFabNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false)
  const items = itemsByRole[role]

  return (
    <div className="fixed bottom-4 right-4 z-50 md:hidden">
      {open && <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />}
      <div className={`flex flex-col items-end space-y-3 mb-3 transition-all duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {items.map(({ to, icon: Icon, label }) => (
          <a key={to} href={to} className="flex items-center gap-2 px-3 py-2 rounded-full dual-btn dual-text border border-border shadow-lg backdrop-blur">
            <Icon className="w-5 h-5" />
            <span className="text-sm">{label}</span>
          </a>
        ))}
        <div className="flex items-center gap-2 px-2 py-1 rounded-full dual-btn dual-text border border-border shadow-lg backdrop-blur">
          <ThemeToggle />
          <span className="text-xs text-muted pr-2">主題</span>
        </div>
      </div>
      <button onClick={() => setOpen(v => !v)} aria-label="選單" className="w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center">
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
    </div>
  )
}
