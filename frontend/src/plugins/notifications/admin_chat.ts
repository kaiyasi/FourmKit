/**
 * 管理員聊天室提及通知插件
 * 處理聊天室 @提及 通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { AtSign } from 'lucide-react'

export interface AdminChatMentionNotificationData {
  room_id: number
  room_name: string
  message_id: number
  sender: string
}

export const adminChatMentionNotificationPlugin: NotificationPlugin<AdminChatMentionNotificationData> = {
  type: 'admin_chat.mention',
  label: '聊天提及',
  color: 'text-purple-600 bg-purple-50',
  icon: AtSign,

  template: (data) => ({
    type: 'admin_chat.mention',
    title: `${data.sender} 在聊天室提及了您`,
    message: `在 "${data.room_name}" 聊天室中提及了您，點擊查看詳情`,
    icon: 'info',
    urgent: true,
    actionUrl: `/admin/chat?room=${data.room_id}&message=${data.message_id}`,
    actionText: '查看聊天',
    data: {
      room_id: data.room_id,
      room_name: data.room_name,
      message_id: data.message_id,
      sender: data.sender
    }
  }),

  socketEvent: 'admin_chat_mention',
  socketHandler: (payload, emit) => {
    if (payload.type === 'mention') {
      emit({
        room_id: payload.room_id,
        room_name: payload.room_name,
        message_id: payload.message_id,
        sender: payload.sender
      })
    }
  }
}