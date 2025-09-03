/**
 * 通知中心面板
 * 顯示所有通知歷史，支援篩選、標記、刪除等操作
 */

import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCircle, AlertTriangle, Info, AlertCircle, X, Check, Trash2, Filter, ExternalLink } from 'lucide-react'
import { Notification, useNotifications } from '@/hooks/useNotifications'

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement>
}

const ICON_MAP = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info
}

const TYPE_LABELS = {
  auth: '認證',
  moderation: '審核',
  comment: '留言',
  reaction: '互動',
  announcement: '公告',
  system: '系統'
}

const TYPE_COLORS = {
  auth: 'text-blue-600 bg-blue-50',
  moderation: 'text-amber-600 bg-amber-50',
  comment: 'text-green-600 bg-green-50',
  reaction: 'text-purple-600 bg-purple-50',
  announcement: 'text-red-600 bg-red-50',
  system: 'text-gray-600 bg-gray-50'
}

export default function NotificationCenter({ isOpen, onClose, anchorRef }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
  } = useNotifications()

  const [filter, setFilter] = useState<'all' | 'unread' | Notification['type']>('all')
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // 點擊外部關閉
  useEffect(() => {
    if (!isOpen) return

      const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as Node
    const panel = panelRef.current
    const anchor = anchorRef.current

    if (panel && !panel.contains(target) && anchor && !anchor.contains(target)) {
      onClose()
    }
  }

  // 點擊通知項目時標記為已讀
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }
  }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, anchorRef])

  // 篩選通知
  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'all') return true
    if (filter === 'unread') return !notification.read
    return notification.type === filter
  })

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins} 分鐘前`
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)} 小時前`
    } else {
      return date.toLocaleDateString('zh-TW', { 
        month: 'numeric', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }
    
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl
      onClose()
    }
  }

  const handleClearAll = () => {
    if (isConfirmingClear) {
      clearAll()
      setIsConfirmingClear(false)
      onClose()
    } else {
      setIsConfirmingClear(true)
      setTimeout(() => setIsConfirmingClear(false), 3000)
    }
  }

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className="fixed top-20 md:top-16 right-2 md:right-4 w-[calc(100vw-1rem)] md:w-80 max-w-[calc(100vw-1rem)] md:max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-xl shadow-lg z-50 max-h-[calc(100vh-8rem)] md:max-h-[80vh] flex flex-col overflow-hidden"
    >
      {/* 標題欄 */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-surface/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          <h3 className="font-semibold text-fg text-sm md:text-base">通知中心</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-fg transition-colors p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 篩選與操作欄 */}
      <div className="p-1.5 md:p-2 border-b border-border bg-muted/20">
        <div className="flex items-center justify-between mb-1 gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="text-xs border border-border rounded-full px-2.5 py-1 bg-surface flex-1 md:flex-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all duration-200"
          >
            <option value="all">全部</option>
            <option value="unread">未讀</option>
            <option value="auth">認證</option>
            <option value="moderation">審核</option>
            <option value="comment">留言</option>
            <option value="reaction">互動</option>
            <option value="announcement">公告</option>
            <option value="system">系統</option>
          </select>
          
          <div className="flex gap-1 flex-shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                <Check className="w-3 h-3" />
                <span className="hidden sm:inline">全部已讀</span>
                <span className="sm:hidden">已讀</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`text-xs flex items-center gap-1 transition-colors whitespace-nowrap ${
                  isConfirmingClear 
                    ? 'text-red-600 font-medium' 
                    : 'text-muted hover:text-fg'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">{isConfirmingClear ? '確認清空？' : '清空全部'}</span>
                <span className="sm:hidden">{isConfirmingClear ? '確認' : '清空'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 通知列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted">
            <Bell className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-sm">
              {filter === 'unread' ? '沒有未讀通知' : '沒有通知'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredNotifications.map((notification) => {
              const IconComponent = ICON_MAP[notification.icon || 'info']
              const typeColor = TYPE_COLORS[notification.type] || 'text-gray-600 bg-gray-50'
              
              return (
                <div
                  key={notification.id}
                  className={`
                    p-2 md:p-3 hover:bg-muted/20 cursor-pointer transition-colors relative
                    ${!notification.read ? 'bg-primary/5' : ''}
                  `}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <IconComponent className={`w-3 h-3 md:w-4 md:h-4 ${
                        notification.icon === 'success' ? 'text-green-600' :
                        notification.icon === 'warning' ? 'text-amber-600' :
                        notification.icon === 'error' ? 'text-red-600' :
                        'text-blue-600'
                      }`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor}`}>
                          {TYPE_LABELS[notification.type]}
                        </span>
                        <span className="text-xs text-muted">
                          {formatTime(notification.timestamp)}
                        </span>
                        {/* 學校來源（若有） */}
                        {(() => {
                          const data: any = notification.data || {}
                          // 依序嘗試：完整 school 物件名稱 → slug → school_name → 若為跨校顯示 '跨校'
                          const schoolObj = typeof data.school === 'object' && data.school ? data.school : null
                          const slug = (typeof data.school === 'string' && data.school) ? data.school : (data.school_slug || null)
                          const name = schoolObj?.name || data.school_name || null
                          const isCross = slug === null || slug === undefined || slug === '' || slug === 'cross'
                          const label = name || (isCross ? '跨校' : slug)
                          if (!label || label === '__ALL__') return null
                          return (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted">
                              {label}
                            </span>
                          )
                        })()}
                      </div>
                      
                      <h4 className="text-xs md:text-sm font-medium text-fg mb-1 leading-tight">
                        {notification.title}
                      </h4>
                      
                      <p className="text-xs md:text-sm text-muted leading-relaxed line-clamp-2">
                        {notification.message}
                      </p>
                      
                      {notification.actionText && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                          <ExternalLink className="w-3 h-3" />
                          {notification.actionText}
                        </div>
                      )}
                    </div>

                    {/* 操作按鈕 */}
                    <div className="flex-shrink-0 flex items-start gap-1">
                      {!notification.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            markAsRead(notification.id)
                          }}
                          className="text-muted hover:text-primary transition-colors p-1"
                          title="標記為已讀"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeNotification(notification.id)
                        }}
                        className="text-muted hover:text-red-600 transition-colors p-1"
                        title="刪除通知"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 未讀指示器 */}
                  {!notification.read && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2">
                      <div className="w-2 h-2 bg-primary rounded-full" />
                    </div>
                  )}

                  {/* 緊急通知指示器 */}
                  {notification.urgent && (
                    <div className="absolute right-1 top-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 底部說明 */}
      {notifications.length > 0 && (
        <div className="p-2 md:p-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted text-center">
            顯示最近 {notifications.length} 則通知
          </p>
        </div>
      )}
    </div>
  )
}
