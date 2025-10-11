/**
 * 系統通知插件
 * 處理系統維護、更新、錯誤等通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { Settings } from 'lucide-react'

/**
 *
 */
export interface SystemNotificationData {
  event: 'maintenance' | 'update' | 'error' | 'info'
  title: string
  message: string
  urgent?: boolean
  actionUrl?: string
  actionText?: string
}

export const systemNotificationPlugin: NotificationPlugin<SystemNotificationData> = {
  type: 'system',
  label: '系統通知',
  color: 'text-gray-600 bg-gray-50',
  icon: Settings,

  template: (data) => {
    const iconMap = {
      maintenance: 'warning' as const,
      update: 'info' as const,
      error: 'error' as const,
      info: 'info' as const
    }

    return {
      type: 'system',
      title: data.title,
      message: data.message,
      urgent: data.urgent || data.event === 'error',
      icon: iconMap[data.event],
      actionUrl: data.actionUrl,
      actionText: data.actionText
    }
  },

  socketEvent: 'system_notification',
  socketHandler: (payload, emit) => {
    emit({
      event: payload.event || 'info',
      title: payload.title,
      message: payload.message,
      urgent: payload.urgent,
      actionUrl: payload.action_url,
      actionText: payload.action_text
    })
  }
}