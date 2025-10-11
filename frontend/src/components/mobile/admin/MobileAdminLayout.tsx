import React, { ReactNode, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Menu, Bell, Search, MoreVertical } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
<<<<<<< Updated upstream
import NotificationCenter from '@/components/notifications/NotificationCenter'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
=======
import NotificationCenter from '@/components/notifications/NotificationCenter'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
>>>>>>> Stashed changes

interface MobileAdminLayoutProps {
  title: string
  subtitle?: string
  showBack?: boolean
  showSearch?: boolean
  showMenu?: boolean
  showNotifications?: boolean
  onSearch?: (query: string) => void
  actions?: ReactNode
  children: ReactNode
  bottomContent?: ReactNode
}

/**
 *
 */
export function MobileAdminLayout({
  title,
  subtitle,
  showBack = true,
  showSearch = false,
  showMenu = false,
  showNotifications = false,
  onSearch,
  actions,
  children,
  bottomContent
}: MobileAdminLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount, showBadge } = useNotifications()
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const notificationButtonRef = React.useRef<HTMLButtonElement>(null)

<<<<<<< Updated upstream
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 頂部工具列 */}
=======
  return (
    <div className="min-h-screen bg-background flex flex-col">
      
>>>>>>> Stashed changes
      <div className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-border">
        
        <div className="pt-safe-top" />
        
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {showBack && (
              <button
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 hover:bg-surface-hover rounded-lg transition-colors touch-manipulation active:scale-95"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-extrabold text-fg tracking-wide truncate">ForumKit</h1>
              <p className="text-sm text-muted truncate">{subtitle || title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showSearch && (
              <button className="p-2 hover:bg-surface-hover rounded-lg transition-colors">
                <Search className="w-5 h-5" />
              </button>
            )}
            
            {showNotifications && (
              <button
                ref={notificationButtonRef}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsNotificationOpen(!isNotificationOpen)
                }}
                className="p-2 hover:bg-surface-hover rounded-lg transition-colors relative"
                title={`通知${unreadCount > 0 ? ` (${unreadCount} 未讀)` : ''}`}
              >
                <Bell className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
            )}
            
            {showMenu && (
              <button className="p-2 hover:bg-surface-hover rounded-lg transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            )}
            
            {actions}
          </div>
        </div>
      </div>

<<<<<<< Updated upstream
      {/* 主要內容區域 */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto mobile-scroll-smooth">
          <div className="p-4" style={{ paddingBottom: 'var(--fk-bottomnav-offset, 64px)' }}>
            {children}
          </div>
        </div>
      </div>

      {/* 底部內容 */}
      {bottomContent && (
        <div className="sticky bottom-0 bg-surface/90 backdrop-blur-md border-t border-border">
          {bottomContent}
          <div className="pb-safe-bottom" />
        </div>
      )}

      {/* 行動版底部導覽列：全後台手機頁共用 */}
      <MobileBottomNav />
=======
      
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto mobile-scroll-smooth">
          <div className="p-4" style={{ paddingBottom: 'var(--fk-bottomnav-offset, 64px)' }}>
            {children}
          </div>
        </div>
      </div>

      
      {bottomContent && (
        <div className="sticky bottom-0 bg-surface/90 backdrop-blur-md border-t border-border">
          {bottomContent}
          <div className="pb-safe-bottom" />
        </div>
      )}
>>>>>>> Stashed changes

      
      <MobileBottomNav />

      
      {showNotifications && (
        <NotificationCenter
          isOpen={isNotificationOpen}
          onClose={() => setIsNotificationOpen(false)}
          anchorRef={notificationButtonRef}
        />
      )}
<<<<<<< Updated upstream
    </div>
  )
}
=======
    </div>
  )
}
>>>>>>> Stashed changes
