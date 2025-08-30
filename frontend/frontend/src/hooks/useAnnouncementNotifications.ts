/**
 * 公告通知整合 Hook
 * 監聽公告發布事件並顯示在通知視窗
 */

import { useNotifications } from '@/hooks/useNotifications'
import { useEffect } from 'react'
import { on, off } from '@/socket'

interface AnnouncementEvent {
  type: 'new_announcement'
  data: {
    id: number
    title: string
    content: string
    announcement_type: string
    priority: string
    is_pinned: boolean
    school_id?: number
    school_name?: string
    created_by?: number
    creator_username?: string
    timestamp: number
  }
}

export function useAnnouncementNotifications() {
  const { addNotification } = useNotifications()
  
  // 監聽 WebSocket 公告事件
  useEffect(() => {
    const handleAnnouncement = (payload: AnnouncementEvent) => {
      if (payload.type === 'new_announcement') {
        const announcement = payload.data
        
        // 添加到通知視窗
        addNotification({
          type: 'announcement',
          title: `📢 ${announcement.title}`,
          message: announcement.content.length > 100 
            ? announcement.content.substring(0, 100) + '...' 
            : announcement.content,
          urgent: announcement.priority === 'urgent' || announcement.is_pinned,
          icon: announcement.announcement_type === 'warning' ? 'warning' :
                announcement.announcement_type === 'error' ? 'error' : 'info',
          actionUrl: `/announcements#${announcement.id}`,
          actionText: '查看公告',
          data: {
            announcement_id: announcement.id,
            school_id: announcement.school_id,
            school_name: announcement.school_name,
            creator: announcement.creator_username
          }
        })
        
        // 如果是緊急公告，顯示額外提示
        if (announcement.priority === 'urgent' || announcement.is_pinned) {
          console.log('[URGENT] New important announcement:', announcement.title)
          // TODO: 可以在這裡添加 toast 通知或聲音提示
        }
      }
    }
    
    // 監聽公告事件
    on('announcement', handleAnnouncement)
    
    return () => {
      off('announcement', handleAnnouncement)
    }
  }, [addNotification])
  
  // 手動觸發公告通知（用於測試）
  const triggerTestNotification = () => {
    addNotification({
      type: 'announcement',
      title: '📢 測試公告通知',
      message: '這是一個測試公告，用來驗證通知系統是否正常運作。',
      urgent: false,
      icon: 'info',
      actionUrl: '/announcements',
      actionText: '查看公告',
      data: {
        announcement_id: 999,
        test: true
      }
    })
  }
  
  return {
    triggerTestNotification
  }
}
    