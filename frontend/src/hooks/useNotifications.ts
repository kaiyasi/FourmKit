/**
 * 通知系統 Hook
 * 整合插件式通知管理器
 */

import { useState, useEffect, useCallback } from 'react'
import { Notification } from '@/types/notifications'
import { notificationManager } from '@/lib/notificationManager'

export type { Notification } from '@/types/notifications'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  showBadge: boolean
  showCount: boolean // 是否顯示數字徽章
  lastNotificationTime: number // 最後通知時間，用於10秒倒計時
}

const NOTIFICATION_STORAGE_KEY = 'forumkit_notifications'
const MAX_NOTIFICATIONS = 50

/**
 *
 */
export function useNotifications() {
  const [state, setState] = useState<NotificationState>({
    notifications: [],
    unreadCount: 0,
    showBadge: false,
    showCount: false,
    lastNotificationTime: 0
  })

  const loadNotifications = useCallback(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY)
      if (stored) {
        const notifications = JSON.parse(stored) as Notification[]
        const unreadCount = notifications.filter(n => !n.read).length
        const now = Date.now()

        setState(prev => {
          const lastNotificationTime = prev.lastNotificationTime || now
          const showCount = (now - lastNotificationTime) < 10000 && unreadCount > 0

          return {
            ...prev,
            notifications: notifications.slice(0, MAX_NOTIFICATIONS),
            unreadCount,
            showBadge: unreadCount > 0,
            showCount,
            lastNotificationTime
          }
        })
      }
    } catch (error) {
      console.warn('Failed to load notifications:', error)
    }
  }, [])

  const saveNotifications = useCallback((notifications: Notification[]) => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications))
    } catch (error) {
      console.warn('Failed to save notifications:', error)
    }
  }, [])

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false
    }

    const now = Date.now()

    setState(prev => {
      const notifications = [newNotification, ...prev.notifications].slice(0, MAX_NOTIFICATIONS)
      const unreadCount = notifications.filter(n => !n.read).length

      saveNotifications(notifications)

      return {
        notifications,
        unreadCount,
        showBadge: unreadCount > 0,
        showCount: true, // 新通知時顯示數字徽章
        lastNotificationTime: now
      }
    })

    setTimeout(() => {
      setState(prev => ({
        ...prev,
        showCount: false
      }))
    }, 10000)

    return newNotification.id
  }, [saveNotifications])

  useEffect(() => {
    notificationManager.setAddNotificationFn(addNotification)
  }, [addNotification])

  const markAsRead = useCallback((id: string) => {
    setState(prev => {
      const notifications = prev.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      )
      const unreadCount = notifications.filter(n => !n.read).length

      saveNotifications(notifications)

      return {
        ...prev,
        notifications,
        unreadCount,
        showBadge: unreadCount > 0, // 關鍵：有未讀才顯示徽章
        showCount: false // 標記已讀後不再顯示數字徽章
      }
    })
  }, [saveNotifications])

  const markAllAsRead = useCallback(() => {
    setState(prev => {
      const notifications = prev.notifications.map(n => ({ ...n, read: true }))
      saveNotifications(notifications)

      return {
        ...prev,
        notifications,
        unreadCount: 0,
        showBadge: false, // 關鍵：沒有未讀就不顯示徽章
        showCount: false // 標記所有已讀後不再顯示數字徽章
      }
    })
  }, [saveNotifications])

  const removeNotification = useCallback((id: string) => {
    setState(prev => {
      const notifications = prev.notifications.filter(n => n.id !== id)
      const unreadCount = notifications.filter(n => !n.read).length
      
      saveNotifications(notifications)
      
      return {
        ...prev,
        notifications,
        unreadCount,
        showBadge: unreadCount > 0,
        showCount: unreadCount > 0 && (Date.now() - prev.lastNotificationTime) < 10000
      }
    })
  }, [saveNotifications])

  const clearAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: [],
      unreadCount: 0,
      showBadge: false,
      showCount: false
    }))
    saveNotifications([])
  }, [saveNotifications])

  const addAuthNotification = useCallback((
    event: 'register_success' | 'login_success' | 'password_changed' | 'google_linked',
    message?: string
  ) => {
    return notificationManager.emit('auth', { event, message })
  }, [])

  const addModerationNotification = useCallback((
    event: 'post_approved' | 'post_rejected' | 'comment_approved' | 'comment_rejected',
    postId?: number,
    reason?: string
  ) => {
    return notificationManager.emit('moderation', { event, postId, reason })
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

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
    showCount: state.showCount,
    addNotification,
    addAuthNotification,
    addModerationNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
  }
}