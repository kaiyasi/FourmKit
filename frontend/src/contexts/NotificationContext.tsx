/**
 * 通知系統 Context
 * 全局管理通知狀態，整合 Socket 即時通知與插件系統
 */

import React, { createContext, useContext, ReactNode, useEffect } from 'react'
import { useNotifications } from '@/hooks/useNotifications'
import { NotificationToastContainer } from '@/components/notifications/NotificationToast'
import { notificationManager } from '@/lib/notificationManager'
import { registerDefaultNotificationPlugins } from '@/plugins/notifications'
import { on, off } from '@/socket'

interface NotificationContextType extends ReturnType<typeof useNotifications> {
  // 可以擴展額外方法
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notificationMethods = useNotifications()

  // 註冊所有通知插件（僅執行一次）
  useEffect(() => {
    registerDefaultNotificationPlugins()
  }, [])

  // 自動註冊所有插件的 Socket 事件處理器
  useEffect(() => {
    const plugins = notificationManager.getPlugins()
    const handlers: Array<{ event: string; handler: (payload: any) => void }> = []

    plugins.forEach((plugin) => {
      if (plugin.socketEvent && plugin.socketHandler) {
        const handler = (payload: any) => {
          plugin.socketHandler!(payload, (data) => {
            notificationManager.emit(plugin.type, data)
          })
        }

        on(plugin.socketEvent, handler)
        handlers.push({ event: plugin.socketEvent, handler })
      }
    })

    // 清理
    return () => {
      handlers.forEach(({ event, handler }) => {
        off(event, handler)
      })
    }
  }, [])

  return (
    <NotificationContext.Provider value={notificationMethods}>
      {children}
      {/* 電腦版右下角通知彈窗 */}
      <div className="hidden sm:block">
        <NotificationToastContainer
          notifications={notificationMethods.notifications}
          onClose={notificationMethods.removeNotification}
          onMarkAsRead={notificationMethods.markAsRead}
        />
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotificationContext() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider')
  }
  return context
}

/**
 * 整合 Socket 事件的通知 Hook（向後兼容）
 *
 * @deprecated 已改為使用插件系統自動處理 Socket 事件
 * 所有事件處理器現在由 NotificationProvider 自動註冊
 *
 * 如需手動觸發通知，請使用：
 * - notificationManager.emit('auth', data)
 * - notificationManager.emit('moderation', data)
 * - 等等...
 */
export function useRealtimeNotifications() {
  const { addModerationNotification } = useNotificationContext()

  // 保留向後兼容的方法（現在直接使用插件系統）
  const handlePostApproved = (payload: { id: number }) => {
    addModerationNotification('post_approved', payload.id)
  }

  const handlePostRejected = (payload: { id: number, reason?: string }) => {
    addModerationNotification('post_rejected', payload.id, payload.reason)
  }

  const handleNewComment = (payload: { post_id: number, content: string, username?: string }) => {
    notificationManager.emit('comment', {
      postId: payload.post_id,
      content: payload.content,
      username: payload.username
    })
  }

  const handleReaction = (payload: { post_id: number, type: 'like' | 'dislike', username?: string }) => {
    notificationManager.emit('reaction', {
      postId: payload.post_id,
      type: payload.type,
      username: payload.username
    })
  }

  const handleAnnouncement = (payload: { message: string, urgent?: boolean }) => {
    notificationManager.emit('system', {
      event: 'info',
      title: '系統公告',
      message: payload.message,
      urgent: payload.urgent
    })
  }

  return {
    handlePostApproved,
    handlePostRejected,
    handleNewComment,
    handleReaction,
    handleAnnouncement
  }
}