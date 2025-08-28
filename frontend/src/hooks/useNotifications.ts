/**
 * 通知系統 Hook
 * 管理認證、審核、評論等各種通知
 */

import { useState, useEffect, useCallback } from 'react'

export interface Notification {
  id: string
  type: 'auth' | 'moderation' | 'comment' | 'reaction' | 'announcement' | 'system'
  title: string
  message: string
  timestamp: number
  read: boolean
  urgent?: boolean
  actionUrl?: string
  actionText?: string
  icon?: 'success' | 'warning' | 'error' | 'info'
  data?: Record<string, any>
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  showBadge: boolean
}

const NOTIFICATION_STORAGE_KEY = 'forumkit_notifications'
const MAX_NOTIFICATIONS = 50

export function useNotifications() {
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    showBadge: false
  })

  // 從 localStorage 載入通知
  const loadNotifications = useCallback(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY)
      if (stored) {
        const notifications = JSON.parse(stored) as Notification[]
        const unreadCount = notifications.filter(n => !n.read).length
        setState({
          notifications: notifications.slice(0, MAX_NOTIFICATIONS),
          unreadCount,
          showBadge: unreadCount > 0
        })
      }
    } catch (error) {
      console.warn('Failed to load notifications:', error)
    }
  }, [])

  // 儲存通知到 localStorage
  const saveNotifications = useCallback((notifications: Notification[]) => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications))
    } catch (error) {
      console.warn('Failed to save notifications:', error)
    }
  }, [])

  // 新增通知
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false
    }

    setState(prev => {
      const notifications = [newNotification, ...prev.notifications].slice(0, MAX_NOTIFICATIONS)
      const unreadCount = notifications.filter(n => !n.read).length
      
      saveNotifications(notifications)
      
      return {
        notifications,
        unreadCount,
        showBadge: unreadCount > 0
      }
    })

    return newNotification.id
  }, [saveNotifications])

  // 標記通知為已讀
  const markAsRead = useCallback((id: string) => {
    setState(prev => {
      const notifications = prev.notifications.map(n => 
        n.id === id ? { ...n, read: true } : n
      )
      const unreadCount = notifications.filter(n => !n.read).length
      
      saveNotifications(notifications)
      
      return {
        notifications,
        unreadCount,
        showBadge: unreadCount > 0
      }
    })
  }, [saveNotifications])

  // 標記所有通知為已讀
  const markAllAsRead = useCallback(() => {
    setState(prev => {
      const notifications = prev.notifications.map(n => ({ ...n, read: true }))
      saveNotifications(notifications)
      
      return {
        notifications,
        unreadCount: 0,
        showBadge: false
      }
    })
  }, [saveNotifications])

  // 刪除通知
  const removeNotification = useCallback((id: string) => {
    setState(prev => {
      const notifications = prev.notifications.filter(n => n.id !== id)
      const unreadCount = notifications.filter(n => !n.read).length
      
      saveNotifications(notifications)
      
      return {
        notifications,
        unreadCount,
        showBadge: unreadCount > 0
      }
    })
  }, [saveNotifications])

  // 清除所有通知
  const clearAll = useCallback(() => {
    setState({
      notifications: [],
      unreadCount: 0,
      showBadge: false
    })
    saveNotifications([])
  }, [saveNotifications])

  // 根據類型快速添加認證相關通知
  const addAuthNotification = useCallback((
    type: 'register_success' | 'login_success' | 'password_changed' | 'google_linked',
    message?: string
  ) => {
    const templates = {
      register_success: {
        title: '註冊成功',
        message: message || '歡迎加入 ForumKit 校園討論平台！',
        icon: 'success' as const
      },
      login_success: {
        title: '登入成功',
        message: message || '歡迎回來！',
        icon: 'success' as const
      },
      password_changed: {
        title: '密碼已更新',
        message: message || '您的密碼已成功變更',
        icon: 'info' as const
      },
      google_linked: {
        title: 'Google 帳號已綁定',
        message: message || '現在可以使用 Google 快速登入',
        icon: 'success' as const
      }
    }

    const template = templates[type]
    return addNotification({
      type: 'auth',
      ...template,
      message: message || template.message
    })
  }, [addNotification])

  // 根據類型快速添加審核相關通知
  const addModerationNotification = useCallback((
    type: 'post_approved' | 'post_rejected' | 'comment_approved' | 'comment_rejected',
    postId?: number,
    reason?: string
  ) => {
    const templates = {
      post_approved: {
        title: '貼文已通過審核',
        message: `您的貼文 #${postId} 已通過審核並公開顯示`,
        icon: 'success' as const,
        actionUrl: postId ? `/posts/${postId}` : undefined,
        actionText: '查看貼文'
      },
      post_rejected: {
        title: '貼文未通過審核',
        message: `您的貼文 #${postId} 未通過審核${reason ? `：${reason}` : ''}`,
        icon: 'warning' as const,
        urgent: true
      },
      comment_approved: {
        title: '留言已通過審核',
        message: `您的留言已通過審核並顯示`,
        icon: 'success' as const
      },
      comment_rejected: {
        title: '留言未通過審核',
        message: `您的留言未通過審核${reason ? `：${reason}` : ''}`,
        icon: 'warning' as const
      }
    }

    const template = templates[type]
    return addNotification({
      type: 'moderation',
      ...template
    })
  }, [addNotification])

  // 初始化載入
  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // 監聽其他頁面的通知變更（跨標籤頁同步）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_STORAGE_KEY) {
        loadNotifications()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [loadNotifications])

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    showBadge: state.showBadge,
    addNotification,
    addAuthNotification,
    addModerationNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
  }
}