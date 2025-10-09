/**
 * 審核通知插件
 * 處理貼文、留言審核通過/拒絕通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { ShieldAlert } from 'lucide-react'

export interface ModerationNotificationData {
  event: 'post_approved' | 'post_rejected' | 'comment_approved' | 'comment_rejected'
  postId?: number
  commentId?: number
  reason?: string
}

export const moderationNotificationPlugin: NotificationPlugin<ModerationNotificationData> = {
  type: 'moderation',
  label: '內容審核',
  color: 'text-amber-600 bg-amber-50',
  icon: ShieldAlert,

  template: (data) => {
    const templates = {
      post_approved: {
        title: '貼文已通過審核',
        message: `您的貼文${data.postId ? ` #${data.postId}` : ''} 已通過審核並公開顯示`,
        icon: 'success' as const,
        actionUrl: data.postId ? `/posts/${data.postId}` : undefined,
        actionText: '查看貼文'
      },
      post_rejected: {
        title: '貼文未通過審核',
        message: `您的貼文${data.postId ? ` #${data.postId}` : ''} 未通過審核${data.reason ? `：${data.reason}` : ''}`,
        icon: 'warning' as const,
        urgent: true
      },
      comment_approved: {
        title: '留言已通過審核',
        message: `您的留言已通過審核並顯示`,
        icon: 'success' as const,
        actionUrl: data.postId ? `/posts/${data.postId}` : undefined,
        actionText: '查看貼文'
      },
      comment_rejected: {
        title: '留言未通過審核',
        message: `您的留言未通過審核${data.reason ? `：${data.reason}` : ''}`,
        icon: 'warning' as const
      }
    }

    const template = templates[data.event]

    return {
      type: 'moderation',
      ...template
    }
  },

  // Socket 事件處理
  socketEvent: 'moderation_result',
  socketHandler: (payload, emit) => {
    // payload: { type: 'post_approved', post_id: 123, reason?: string }
    emit({
      event: payload.type,
      postId: payload.post_id,
      commentId: payload.comment_id,
      reason: payload.reason
    })
  }
}