import { useState } from 'react'
import { Home, PlusCircle, User, Settings, MessageSquare, Shield } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getRole } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

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

  const tabs = [
    {
      path: '/',
      icon: Home,
      label: '首頁',
      show: true
    },
    {
      path: '/boards',
      icon: MessageSquare,
      label: '討論',
      show: true
    },
    {
      path: '/create',
      icon: PlusCircle,
      label: '發文',
      show: isLoggedIn
    },
    {
      path: isLoggedIn ? '/settings/profile' : '/auth',
      icon: isLoggedIn ? User : User,
      label: isLoggedIn ? '我的' : '登入',
      show: true
    }
  ]

  // 管理員專用標籤
  const adminTab = {
    path: '/admin',
    icon: Shield,
    label: '管理',
    show: ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role)
  }

  const visibleTabs = tabs.filter(tab => tab.show)
  if (adminTab.show) {
    visibleTabs.push(adminTab)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* 安全區域背景 */}
      <div className="bg-nav-bg/95 backdrop-blur-md border-t border-nav-border">
        <div className="flex items-center justify-around px-2 py-1 pb-[env(safe-area-inset-bottom)]">
          {visibleTabs.map((tab, index) => {
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
                <Icon className={`w-5 h-5 ${active ? 'stroke-2' : 'stroke-[1.5]'}`} />
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