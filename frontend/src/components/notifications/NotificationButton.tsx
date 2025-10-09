/**
 * 通知按鈕元件
 * 顯示鈴鐺圖示，未讀時顯示紅點，點擊開啟通知中心
 */

import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
// 聊天通知功能已移除
import NotificationCenter from './NotificationCenter'

interface NotificationButtonProps {
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function NotificationButton({
  className = '',
  showLabel = false,
  size = 'md'
}: NotificationButtonProps) {
  const { unreadCount, showBadge, showCount } = useNotifications()
  // 聊天通知功能已移除
  const chatUnreadCount = 0
  const combinedUnread = (unreadCount || 0) + (chatUnreadCount || 0)
  const combinedShowBadge = (showBadge || false) || (chatUnreadCount > 0)
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    try {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    } catch {
      // Safari fallback
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
  }, [])

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10', 
    lg: 'w-12 h-12'
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 手機版不開啟詳細面板，僅顯示徽章與使用瀏覽器通知（若使用者已允許）
    if (isMobile) return
    setIsOpen(!isOpen)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`
          relative flex items-center justify-center
          ${sizeClasses[size]}
          rounded-full
          hover:bg-muted/50 active:bg-muted/70
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-primary/20
          cursor-pointer pointer-events-auto
          ${className}
        `}
        style={{ zIndex: 20 }}
        title={`通知${combinedUnread > 0 ? ` (${combinedUnread} 未讀)` : ''}`}
      >
        <Bell className={`${iconSizes[size]} text-muted hover:text-fg transition-colors`} />
        
        {/* 通知徽章 */}
        {combinedShowBadge && (
          <div className="absolute -top-1 -right-1">
            {showCount && combinedUnread > 0 ? (
              // 顯示數字徽章（10秒內）
              combinedUnread < 10 ? (
                <div className="
                  w-5 h-5 bg-red-500 text-white text-xs font-bold 
                  rounded-full flex items-center justify-center
                  shadow-sm animate-pulse
                ">
                  {combinedUnread}
                </div>
              ) : (
                <div className="
                  px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold 
                  rounded-full flex items-center justify-center
                  shadow-sm animate-pulse min-w-[1.25rem]
                ">
                  {combinedUnread > 99 ? '99+' : combinedUnread}
                </div>
              )
            ) : (
              // 10秒後顯示紅點
              <div className="
                w-3 h-3 bg-red-500 rounded-full 
                shadow-sm animate-pulse
              " />
            )}
          </div>
        )}

        {/* 有新通知時的呼吸光暈效果 */}
        {combinedShowBadge && showCount && (
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        )}
      </button>

      {/* 標籤文字（可選） */}
      {showLabel && (
        <span className="ml-2 text-sm text-muted">
          通知
          {showCount && combinedUnread > 0 && (
            <span className="ml-1 text-primary font-medium">
              ({combinedUnread})
            </span>
          )}
        </span>
      )}

      {/* 通知中心面板 */}
      <NotificationCenter
        isOpen={isOpen && !isMobile}
        onClose={() => setIsOpen(false)}
        anchorRef={buttonRef}
      />
    </>
  )
}

/**
 * 簡化版通知按鈕（僅顯示紅點，用於手機版導航等）
 */
export function NotificationBadge({ 
  className = '',
  children
}: { 
  className?: string
  children?: React.ReactNode 
}) {
  const { showBadge, unreadCount } = useNotifications()

  return (
    <div className={`relative ${className}`}>
      {children}
      
      {showBadge && (
        <div className="absolute -top-1 -right-1">
          {unreadCount > 0 && unreadCount < 100 ? (
            <div className="
              min-w-[1rem] h-4 px-1 bg-red-500 text-white 
              text-xs font-bold rounded-full 
              flex items-center justify-center
              shadow-sm animate-pulse
            ">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          ) : (
            <div className="
              w-2.5 h-2.5 bg-red-500 rounded-full 
              shadow-sm animate-pulse
            " />
          )}
        </div>
      )}
    </div>
  )
}
