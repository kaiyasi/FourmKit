import React, { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Menu, Bell, Search, MoreVertical } from 'lucide-react'

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 頂部工具列 */}
      <div className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-border">
        {/* 安全區域 */}
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
              <h1 className="text-lg font-semibold text-fg truncate">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showSearch && (
              <button className="p-2 hover:bg-surface-hover rounded-lg transition-colors">
                <Search className="w-5 h-5" />
              </button>
            )}
            
            {showNotifications && (
              <button className="p-2 hover:bg-surface-hover rounded-lg transition-colors relative">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
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

      {/* 主要內容區域 */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto mobile-scroll-smooth">
          <div className="p-4">
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
    </div>
  )
}