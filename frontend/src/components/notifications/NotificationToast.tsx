/**
 * 右下角通知彈窗（電腦版）
 * 顯示即時通知，支援自動消失、手動關閉、點擊操作
 */

import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertTriangle, Info, AlertCircle, ExternalLink, Bell } from 'lucide-react'
import { Notification } from '@/hooks/useNotifications'

interface NotificationToastProps {
  notification: Notification
  onClose: (id: string) => void
  onMarkAsRead: (id: string) => void
  autoHideDuration?: number
}

const ICON_MAP = {
  success: CheckCircle,
  warning: AlertTriangle,  
  error: AlertCircle,
  info: Info
}

const STYLE_MAP = {
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-200',
    icon: 'text-green-600 dark:text-green-400'
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-200',
    icon: 'text-amber-600 dark:text-amber-400'
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: 'text-red-600 dark:text-red-400'
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-200',
    icon: 'text-blue-600 dark:text-blue-400'
  }
}

/**
 *
 */
export default function NotificationToast({
  notification,
  onClose,
  onMarkAsRead,
  autoHideDuration = 6000 // 6 秒自動隱藏
}: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  const icon = notification.icon || 'info'
  const IconComponent = ICON_MAP[icon]
  const styles = STYLE_MAP[icon]

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (notification.urgent) return

    const timer = setTimeout(() => {
      handleClose()
    }, autoHideDuration)

    return () => clearTimeout(timer)
  }, [notification.urgent, autoHideDuration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      onClose(notification.id)
    }, 300)
  }

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id)
    }
    
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl
    }
  }

  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return '剛剛'
    if (minutes < 60) return `${minutes} 分鐘前`
    
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小時前`
    
    const days = Math.floor(hours / 24)
    return `${days} 天前`
  }

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50 
        w-80 max-w-[calc(100vw-2rem)]
        transition-all duration-300 ease-in-out
        ${isVisible && !isExiting 
          ? 'transform translate-x-0 opacity-100' 
          : 'transform translate-x-full opacity-0'
        }
      `}
    >
      <div
        className={`
          ${styles.bg} ${styles.border} ${styles.text}
          border rounded-xl p-4 shadow-lg backdrop-blur-sm
          cursor-pointer hover:shadow-xl transition-shadow
          ${notification.urgent ? 'ring-2 ring-red-300 dark:ring-red-700' : ''}
        `}
        onClick={handleClick}
      >
        
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs opacity-75">
            {formatTime(notification.timestamp)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClose()
            }}
            className="text-current opacity-50 hover:opacity-75 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <IconComponent className={`w-5 h-5 ${styles.icon}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm leading-tight mb-1">
              {notification.title}
            </h4>
            <p className="text-sm opacity-90 leading-relaxed">
              {notification.message}
            </p>
            
            {notification.actionText && notification.actionUrl && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium opacity-75 hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3" />
                  {notification.actionText}
                </span>
              </div>
            )}
          </div>
        </div>

        
        {!notification.read && (
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
          </div>
        )}

        
        {!notification.urgent && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10 rounded-b-xl overflow-hidden">
            <div 
              className="h-full bg-current opacity-20 rounded-b-xl transition-all linear"
              style={{
                width: '100%',
                animation: `shrink ${autoHideDuration}ms linear`
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}

/**
 * 通知彈窗容器
 * 管理多個同時顯示的通知
 */
interface NotificationToastContainerProps {
  notifications: Notification[]
  onClose: (id: string) => void
  onMarkAsRead: (id: string) => void
  maxVisible?: number
}

/**
 *
 */
export function NotificationToastContainer({
  notifications,
  onClose,
  onMarkAsRead,
  maxVisible = 3
}: NotificationToastContainerProps) {
  const visibleNotifications = notifications
    .filter(n => !n.read)
    .slice(0, maxVisible)

  if (visibleNotifications.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3">
      {visibleNotifications.map((notification, index) => (
        <div
          key={notification.id}
          style={{
            transform: `translateY(-${index * 20}px)`,
            zIndex: 50 - index
          }}
        >
          <NotificationToast
            notification={notification}
            onClose={onClose}
            onMarkAsRead={onMarkAsRead}
          />
        </div>
      ))}
    </div>
  )
}