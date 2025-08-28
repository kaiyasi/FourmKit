/**
 * 通知系統 Context
 * 全局管理通知狀態，整合 Socket 即時通知
 */

import React, { createContext, useContext, ReactNode } from 'react'
import { useNotifications } from '@/hooks/useNotifications'
import { NotificationToastContainer } from '@/components/notifications/NotificationToast'

interface NotificationContextType extends ReturnType<typeof useNotifications> {
  // 可以擴展額外方法
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notificationMethods = useNotifications()

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
 * 整合 Socket 事件的通知 Hook
 * 監聽審核結果、評論、點讚等即時事件
 */
export function useRealtimeNotifications() {
  const { addModerationNotification, addNotification } = useNotificationContext()

  // 審核通過通知
  const handlePostApproved = (payload: { id: number }) => {
    addModerationNotification('post_approved', payload.id)
  }

  // 審核拒絕通知
  const handlePostRejected = (payload: { id: number, reason?: string }) => {
    addModerationNotification('post_rejected', payload.id, payload.reason)
  }

  // 新評論通知
  const handleNewComment = (payload: { post_id: number, content: string }) => {
    addNotification({
      type: 'comment',
      title: '收到新留言',
      message: `有人在您的貼文留言：${payload.content.slice(0, 30)}...`,
      icon: 'info',
      actionUrl: `/posts/${payload.post_id}`,
      actionText: '查看留言'
    })
  }

  // 互動通知（點讚/點踩）
  const handleReaction = (payload: { post_id: number, type: 'like' | 'dislike' }) => {
    const message = payload.type === 'like' ? '有人對您的貼文按讚' : '有人對您的貼文按踩'
    
    addNotification({
      type: 'reaction',
      title: '貼文互動',
      message,
      icon: payload.type === 'like' ? 'success' : 'info',
      actionUrl: `/posts/${payload.post_id}`,
      actionText: '查看貼文'
    })
  }

  // 系統公告通知
  const handleAnnouncement = (payload: { message: string, urgent?: boolean }) => {
    addNotification({
      type: 'announcement',
      title: '系統公告',
      message: payload.message,
      icon: payload.urgent ? 'warning' : 'info',
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