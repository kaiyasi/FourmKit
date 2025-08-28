/**
 * 通知按鈕元件
 * 顯示鈴鐺圖示，未讀時顯示紅點，點擊開啟通知中心
 */

import { useState, useRef } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
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
  const { unreadCount, showBadge } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  const handleClick = () => {
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
          ${className}
        `}
        title={`通知${unreadCount > 0 ? ` (${unreadCount} 未讀)` : ''}`}
      >
        <Bell className={`${iconSizes[size]} text-muted hover:text-fg transition-colors`} />
        
        {/* 紅點通知徽章 */}
        {showBadge && (
          <div className="absolute -top-1 -right-1">
            {unreadCount > 0 && unreadCount < 10 ? (
              // 顯示具體數字（小於 10）
              <div className="
                w-5 h-5 bg-red-500 text-white text-xs font-bold 
                rounded-full flex items-center justify-center
                shadow-sm animate-pulse
              ">
                {unreadCount}
              </div>
            ) : unreadCount >= 10 ? (
              // 顯示 9+ 
              <div className="
                px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold 
                rounded-full flex items-center justify-center
                shadow-sm animate-pulse min-w-[1.25rem]
              ">
                9+
              </div>
            ) : (
              // 只顯示紅點
              <div className="
                w-3 h-3 bg-red-500 rounded-full 
                shadow-sm animate-pulse
              " />
            )}
          </div>
        )}

        {/* 有新通知時的呼吸光暈效果 */}
        {showBadge && (
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        )}
      </button>

      {/* 標籤文字（可選） */}
      {showLabel && (
        <span className="ml-2 text-sm text-muted">
          通知
          {unreadCount > 0 && (
            <span className="ml-1 text-primary font-medium">
              ({unreadCount})
            </span>
          )}
        </span>
      )}

      {/* 通知中心面板 */}
      <NotificationCenter
        isOpen={isOpen}
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