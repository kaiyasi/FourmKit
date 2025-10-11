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

/**
 *
 */
export function useAnnouncementNotifications() {
  const { addNotification } = useNotifications()
  
  useEffect(() => {
    const handleAnnouncement = (payload: AnnouncementEvent) => {
      if (payload.type === 'new_announcement') {
        const announcement = payload.data
        
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
        
        if (announcement.priority === 'urgent' || announcement.is_pinned) {
          console.log('[URGENT] New important announcement:', announcement.title)
        }
      }
    }
    
    on('announcement', handleAnnouncement)
    
    return () => {
      off('announcement', handleAnnouncement)
    }
  }, [addNotification])
  
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
    