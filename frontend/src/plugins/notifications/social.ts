/**
 * 社交互動通知插件
 * 處理留言、點讚、@提及等互動通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { MessageCircle, Heart, AtSign } from 'lucide-react'

export interface CommentNotificationData {
  postId: number
  content: string
  username?: string
}

export interface ReactionNotificationData {
  postId: number
  type: 'like' | 'dislike'
  username?: string
}

export interface MentionNotificationData {
  postId: number
  commentId?: number
  content: string
  username: string
}

// 留言通知
export const commentNotificationPlugin: NotificationPlugin<CommentNotificationData> = {
  type: 'comment',
  label: '留言回覆',
  color: 'text-green-600 bg-green-50',
  icon: MessageCircle,

  template: (data) => ({
    type: 'comment',
    title: '收到新留言',
    message: `${data.username ? `${data.username} ` : '有人'}在您的貼文留言：${data.content.slice(0, 50)}${data.content.length > 50 ? '...' : ''}`,
    icon: 'info',
    actionUrl: `/posts/${data.postId}`,
    actionText: '查看留言'
  }),

  socketEvent: 'new_comment',
  socketHandler: (payload, emit) => {
    emit({
      postId: payload.post_id,
      content: payload.content,
      username: payload.username
    })
  }
}

// 互動通知（點讚/點踩）
export const reactionNotificationPlugin: NotificationPlugin<ReactionNotificationData> = {
  type: 'reaction',
  label: '社交互動',
  color: 'text-purple-600 bg-purple-50',
  icon: Heart,

  template: (data) => {
    const message = data.type === 'like'
      ? `${data.username ? `${data.username} ` : '有人'}對您的貼文按讚`
      : `${data.username ? `${data.username} ` : '有人'}對您的貼文按踩`

    return {
      type: 'reaction',
      title: '貼文互動',
      message,
      icon: data.type === 'like' ? 'success' : 'info',
      actionUrl: `/posts/${data.postId}`,
      actionText: '查看貼文'
    }
  },

  socketEvent: 'post_reaction',
  socketHandler: (payload, emit) => {
    emit({
      postId: payload.post_id,
      type: payload.type,
      username: payload.username
    })
  }
}

// @提及通知
export const mentionNotificationPlugin: NotificationPlugin<MentionNotificationData> = {
  type: 'mention',
  label: '用戶提及',
  color: 'text-pink-600 bg-pink-50',
  icon: AtSign,

  template: (data) => ({
    type: 'mention',
    title: `${data.username} 提及了你`,
    message: data.content.slice(0, 80) + (data.content.length > 80 ? '...' : ''),
    icon: 'info',
    urgent: true,
    actionUrl: `/posts/${data.postId}${data.commentId ? `#comment-${data.commentId}` : ''}`,
    actionText: '查看內容'
  }),

  socketEvent: 'user_mentioned',
  socketHandler: (payload, emit) => {
    emit({
      postId: payload.post_id,
      commentId: payload.comment_id,
      content: payload.content,
      username: payload.username
    })
  }
}