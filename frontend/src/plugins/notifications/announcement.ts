/**
 * 公告通知插件
 * 處理系統公告與重要通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { Megaphone } from 'lucide-react'

/**
 *
 */
export interface AnnouncementNotificationData {
  id: number
  title: string
  content: string
  announcementType: 'info' | 'warning' | 'error' | 'success'
  priority: 'normal' | 'high' | 'urgent'
  isPinned: boolean
  schoolId?: number
  schoolName?: string
  creatorUsername?: string
}

export const announcementNotificationPlugin: NotificationPlugin<AnnouncementNotificationData> = {
  type: 'announcement',
  label: '系統公告',
  color: 'text-red-600 bg-red-50',
  icon: Megaphone,

  template: (data) => {
    const iconMap = {
      info: 'info' as const,
      warning: 'warning' as const,
      error: 'error' as const,
      success: 'success' as const
    }

    return {
      type: 'announcement',
      title: data.title,
      message: data.content.length > 100
        ? data.content.substring(0, 100) + '...'
        : data.content,
      urgent: data.priority === 'urgent' || data.isPinned,
      icon: iconMap[data.announcementType] || 'info',
      actionUrl: `/announcements#${data.id}`,
      actionText: '查看公告',
      data: {
        announcement_id: data.id,
        school_id: data.schoolId,
        school_name: data.schoolName,
        creator: data.creatorUsername,
        priority: data.priority
      }
    }
  },

  socketEvent: 'announcement',
  socketHandler: (payload, emit) => {
    if (payload.type === 'new_announcement') {
      const announcement = payload.data
      emit({
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        announcementType: announcement.announcement_type || 'info',
        priority: announcement.priority || 'normal',
        isPinned: announcement.is_pinned || false,
        schoolId: announcement.school_id,
        schoolName: announcement.school_name,
        creatorUsername: announcement.creator_username
      })
    }
  }
}