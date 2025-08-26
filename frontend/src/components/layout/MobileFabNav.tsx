import { useEffect, useState } from 'react'
import { Plus, Home, Newspaper, Info, ScrollText, LogIn, Settings, LayoutDashboard, MessageSquare, User, LogOut, Wrench, Activity, FileText, HelpCircle } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Link } from 'react-router-dom'
import { getRole, Role } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

type Action = { to: string; label: string; icon: any; require?: (role: Role) => boolean }

export function MobileFabNav() {
  const [open, setOpen] = useState(false)
  const { isLoggedIn, logout } = useAuth()
  const role = isLoggedIn ? getRole() : 'guest'

  const haptic = (ms = 10) => { try { if ('vibrate' in navigator) navigator.vibrate(ms) } catch {} }

  const common: Action[] = [
    { to: '/', label: '首頁', icon: Home },
    { to: '/boards', label: '貼文', icon: Newspaper },
    { to: '/create', label: '發文', icon: FileText, require: r => r !== 'guest' },
    { to: '/about', label: '關於', icon: Info },
    { to: '/rules', label: '版規', icon: ScrollText },
  ]

  const adminOnly: Action[] = [
    { to: '/admin', label: '後台', icon: LayoutDashboard, require: r => ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(r) },
    { to: '/admin/comments', label: '留言監控', icon: MessageSquare, require: r => ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(r) },
    { to: '/mode', label: '模式管理', icon: Wrench, require: r => r === 'dev_admin' },
    { to: '/admin/events', label: '事件', icon: Activity, require: r => ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(r) },
    { to: '/admin/support', label: '回報', icon: HelpCircle, require: r => ['dev_admin','campus_admin','cross_admin'].includes(r) },
  ]

  const userOnly: Action[] = [
    { to: '/settings/profile', label: '個人設定', icon: Settings, require: r => r !== 'guest' },
  ]

  const authAction: Action[] = isLoggedIn
    ? [{ to: '#logout', label: '登出', icon: LogOut }]
    : [{ to: '/auth', label: '登入', icon: LogIn }]

  const actions: Action[] = [
    ...common,
    ...adminOnly,
    ...userOnly,
    ...authAction,
  ].filter(a => !a.require || a.require(role))

  return (
    <div className="fixed inset-0 pointer-events-none md:hidden">
      {/* 遮罩 */}
      {open && (
        <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={()=>setOpen(false)} />
      )}

      {/* 底部抽屜 */}
      <div className={`absolute inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ${open ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'}`}>
        <div className="mx-auto max-w-5xl rounded-t-2xl border border-border border-b-0 bg-surface/95 backdrop-blur shadow-2xl">
          <div className="p-4 flex items-center justify-between">
            <div className="text-sm text-muted">快速操作</div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isLoggedIn && (
                <Link to="/settings/profile" className="px-2 py-1 text-xs rounded border border-border">設定</Link>
              )}
            </div>
          </div>
          <div className="px-3 pb-3 grid grid-cols-4 gap-2">
            {actions.map((a, i) => (
              a.to === '#logout' ? (
                <button key={i} onClick={()=>{ haptic(12); logout() }} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border bg-surface hover:bg-surface/80">
                  <a.icon className="w-5 h-5" />
                  <span className="text-xs">{a.label}</span>
                </button>
              ) : (
                <Link key={i} to={a.to} onClick={()=>{ haptic(8); setOpen(false) }} className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border bg-surface hover:bg-surface/80">
                  <a.icon className="w-5 h-5" />
                  <span className="text-xs">{a.label}</span>
                </Link>
              )
            ))}
          </div>
        </div>
      </div>

      {/* 右下角 FAB */}
      <div className="absolute right-4 bottom-4 pb-[env(safe-area-inset-bottom)] pointer-events-auto">
        <button onClick={()=>{ haptic(8); setOpen(v=>!v) }} aria-expanded={open} aria-label="開啟操作選單"
          className="w-14 h-14 rounded-full dual-btn shadow-xl border border-border grid place-items-center">
          <Plus className={`w-6 h-6 transition-transform ${open ? 'rotate-45' : ''}`} />
        </button>
      </div>
    </div>
  )
}
