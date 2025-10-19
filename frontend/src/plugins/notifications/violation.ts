/**
 * 留言警告通知插件
 * 監聽 comment_violation 事件，向作者發送「留言警告」通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { AlertTriangle } from 'lucide-react'

/**
 *
 */
export interface ViolationNotificationData {
  commentId: number
  postId?: number
  reason?: string
}

export const violationNotificationPlugin: NotificationPlugin<ViolationNotificationData> = {
  type: 'violation',
  label: '留言警告',
  color: 'text-amber-700 bg-amber-50',
  icon: AlertTriangle,

  template: (data) => ({
    type: 'violation',
    title: '留言警告',
    message: `您的留言因「${data.reason || '違反社群規範'}」被標記為違規並下架，您可修改後重新提交審核。`,
    icon: 'warning',
    urgent: true,
    actionUrl: '/my-violations',
    actionText: '查看違規留言'
  }),

  socketEvent: 'comment_violation',
  socketHandler: (payload, emit) => {
    emit({
      commentId: payload.comment_id,
      postId: payload.post_id,
      reason: payload.reason
    })
  }
}

