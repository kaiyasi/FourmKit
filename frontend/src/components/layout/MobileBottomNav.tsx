import { useState } from 'react'
import { MessageSquare, ScrollText, PlusCircle, Settings, LogIn, Shield, HelpCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getRole } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationBadge } from '../notifications/NotificationButton'

export function MobileBottomNav() {
  const { isLoggedIn } = useAuth()
  const location = useLocation()
  const role = isLoggedIn ? getRole() : 'guest'
  const [showMore, setShowMore] = useState(false)
  
  const haptic = (ms = 10) => { 
    try { 
      if ('vibrate' in navigator) navigator.vibrate(ms) 
    } catch {} 
  }

  const isActive = (path: string) => location.pathname === path

  // 行動版統一底部導覽：貼文 / 版規(或後台) / 發文 / 設定(未登入為登入) / 支援
  const isAdmin = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role)
  const visibleTabs = [
    { path: '/boards', icon: MessageSquare, label: '貼文' },
    isAdmin 
      ? { path: '/admin', icon: Shield, label: '後台' }
      : { path: '/rules', icon: ScrollText, label: '版規' },
    { path: '/create', icon: PlusCircle, label: '發文' },
    { path: isLoggedIn ? '/settings/profile' : '/auth', icon: isLoggedIn ? Settings : LogIn, label: isLoggedIn ? '設定' : '登入' },
    { path: '/support', icon: HelpCircle, label: '支援' },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* 安全區域背景 */}
      <div className="bg-nav-bg/95 backdrop-blur-md border-t border-nav-border">
        <div className="flex items-center justify-around px-2 py-1 pb-[env(safe-area-inset-bottom)]">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.path)
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={() => haptic(8)}
                className={`
                  flex flex-col items-center gap-1 px-3 py-2 rounded-lg
                  min-w-0 flex-1 transition-all duration-200
                  ${active 
                    ? 'text-primary bg-primary/10 scale-105' 
                    : 'text-muted hover:text-fg hover:bg-surface/50'
                  }
                `}
              >
                {/* 設定按鈕特殊處理：添加通知紅點 */}
                {tab.label === '設定' && isLoggedIn ? (
                  <NotificationBadge>
                    <Icon className={`w-5 h-5 ${active ? 'stroke-2' : 'stroke-[1.5]'}`} />
                  </NotificationBadge>
                ) : (
                  <Icon className={`w-5 h-5 ${active ? 'stroke-2' : 'stroke-[1.5]'}`} />
                )}
                <span className={`text-xs font-medium truncate ${active ? 'font-semibold' : ''}`}>
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
