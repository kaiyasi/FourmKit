/**
 * 通知中心面板
 * 顯示所有通知歷史，支援動態篩選、標記、刪除等操作
 */

import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCircle, AlertTriangle, Info, AlertCircle, X, Check, Trash2, ExternalLink } from 'lucide-react'
import { Notification, useNotifications } from '@/hooks/useNotifications'
import { notificationManager } from '@/lib/notificationManager'

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

export default function NotificationCenter({ isOpen, onClose, anchorRef }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
  } = useNotifications()

  // 動態獲取所有已註冊的通知類型
  const typeOptions = notificationManager.getTypeOptions()

  const [filter, setFilter] = useState<'all' | 'unread' | string>('all')
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // 點擊通知項目時標記為已讀並跳轉
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }

    if (notification.actionUrl) {
      window.location.href = notification.actionUrl
      onClose()
    }
  }

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

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, anchorRef])

  // 篩選通知
  const filteredNotifications = notifications.filter((notification) => {
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

  // 手機版不顯示詳細面板
  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches
  if (!isOpen || isMobile) return null

  return (
    <div
      ref={panelRef}
      className="fixed top-20 md:top-16 right-2 md:right-4 w-[calc(100vw-1rem)] md:w-96 max-w-[calc(100vw-1rem)] bg-surface border border-border rounded-2xl shadow-2xl z-[60] max-h-[calc(100vh-8rem)] md:max-h-[85vh] flex flex-col overflow-hidden backdrop-blur-xl bg-opacity-95"
    >
      {/* 標題欄 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-fg text-base">通知中心</h3>
            {unreadCount > 0 && (
              <p className="text-xs text-muted">
                {unreadCount} 則未讀
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-fg hover:bg-muted/20 transition-all p-2 rounded-lg"
          aria-label="關閉通知中心"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 篩選與操作欄 */}
      <div className="px-4 py-3 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-surface flex-1 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          >
            <option value="all">全部通知</option>
            <option value="unread">未讀通知</option>
            {typeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:bg-primary/10 flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all font-medium"
                title="全部標為已讀"
              >
                <Check className="w-4 h-4" />
                <span className="hidden md:inline">全部已讀</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  isConfirmingClear
                    ? 'bg-red-50 text-red-600 font-semibold'
                    : 'text-muted hover:bg-muted/20 hover:text-fg'
                }`}
                title={isConfirmingClear ? '再次點擊確認清空' : '清空所有通知'}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden md:inline">{isConfirmingClear ? '確認清空' : '清空'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 通知列表 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <div className="p-4 bg-muted/20 rounded-full mb-4">
              <Bell className="w-12 h-12 opacity-40" />
            </div>
            <p className="text-sm font-medium mb-1">
              {filter === 'unread' ? '沒有未讀通知' : '目前沒有通知'}
            </p>
            <p className="text-xs opacity-60">
              新通知會即時顯示在這裡
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredNotifications.map((notification) => {
              const IconComponent = ICON_MAP[notification.icon || 'info']
              const plugin = notificationManager.getPlugin(notification.type)
              const typeColor = plugin?.color || 'text-gray-600 bg-gray-50'
              const PluginIcon = plugin?.icon
              
              return (
                <div
                  key={notification.id}
                  className={`
                    px-4 py-3.5 hover:bg-muted/30 cursor-pointer transition-all relative group
                    ${!notification.read ? 'bg-primary/[0.03] border-l-2 border-primary' : 'border-l-2 border-transparent'}
                  `}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    {/* 圖標區 */}
                    <div className="flex-shrink-0 mt-0.5 relative">
                      <div className={`p-2 rounded-lg ${
                        notification.icon === 'success' ? 'bg-green-50 text-green-600' :
                        notification.icon === 'warning' ? 'bg-amber-50 text-amber-600' :
                        notification.icon === 'error' ? 'bg-red-50 text-red-600' :
                        'bg-blue-50 text-blue-600'
                      }`}>
                        {PluginIcon ? <PluginIcon className="w-4 h-4" /> : <IconComponent className="w-4 h-4" />}
                      </div>
                      {/* 緊急標記 */}
                      {notification.urgent && (
                        <div className="absolute -top-1 -right-1">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-md" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* 標題與時間 */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${typeColor}`}>
                          {plugin?.label || notification.type}
                        </span>
                        <span className="text-xs text-muted/70">
                          {formatTime(notification.timestamp)}
                        </span>
                        {/* 學校來源標籤 */}
                        {(() => {
                          const data: any = notification.data || {}
                          const schoolObj = typeof data.school === 'object' && data.school ? data.school : null
                          const slug = (typeof data.school === 'string' && data.school) ? data.school : (data.school_slug || null)
                          const name = schoolObj?.name || data.school_name || null
                          const isCross = slug === null || slug === undefined || slug === '' || slug === 'cross'
                          const label = name || (isCross ? '跨校' : slug)
                          if (!label || label === '__ALL__') return null
                          return (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-border/50 text-muted/80 bg-muted/10">
                              {label}
                            </span>
                          )
                        })()}
                      </div>

                      {/* 通知標題 */}
                      <h4 className="text-sm font-semibold text-fg mb-1 leading-snug">
                        {notification.title}
                      </h4>

                      {/* 通知內容 */}
                      <p className="text-sm text-muted/90 leading-relaxed line-clamp-2 mb-2">
                        {notification.message}
                      </p>

                      {/* 操作連結 */}
                      {notification.actionText && (
                        <div className="flex items-center gap-1.5 text-xs text-primary font-medium group-hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" />
                          {notification.actionText}
                        </div>
                      )}
                    </div>

                    {/* 操作按鈕 */}
                    <div className="flex-shrink-0 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notification.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            markAsRead(notification.id)
                          }}
                          className="text-muted hover:text-primary hover:bg-primary/10 transition-all p-1.5 rounded-lg"
                          title="標記為已讀"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeNotification(notification.id)
                        }}
                        className="text-muted hover:text-red-600 hover:bg-red-50 transition-all p-1.5 rounded-lg"
                        title="刪除通知"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 未讀指示點 */}
                  {!notification.read && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full shadow-sm" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 底部統計 */}
      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-gradient-to-t from-muted/10 to-transparent">
          <p className="text-xs text-muted text-center">
            共 <span className="font-semibold text-fg">{notifications.length}</span> 則通知
            {unreadCount > 0 && (
              <span className="ml-2">
                · <span className="font-semibold text-primary">{unreadCount}</span> 則未讀
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

/* 自訂滾動條樣式 */
<style jsx>{`
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
  }
`}</style>
