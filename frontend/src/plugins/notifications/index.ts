/**
 * 通知插件註冊中心
 * 統一註冊所有內建通知類型
 */

import { notificationManager } from '@/lib/notificationManager'
import { authNotificationPlugin } from './auth'
import { moderationNotificationPlugin } from './moderation'
import {
  commentNotificationPlugin,
  reactionNotificationPlugin,
  mentionNotificationPlugin
} from './social'
import { announcementNotificationPlugin } from './announcement'
import { systemNotificationPlugin } from './system'
import { violationNotificationPlugin } from './violation'
import { adminChatMentionNotificationPlugin } from './admin_chat'

/**
 * 註冊所有內建通知插件
 * 應在應用啟動時調用一次
 */
export function registerDefaultNotificationPlugins() {
  notificationManager.register(authNotificationPlugin)
  notificationManager.register(moderationNotificationPlugin)
  notificationManager.register(commentNotificationPlugin)
  notificationManager.register(reactionNotificationPlugin)
  notificationManager.register(mentionNotificationPlugin)
  notificationManager.register(announcementNotificationPlugin)
  notificationManager.register(systemNotificationPlugin)
  notificationManager.register(adminChatMentionNotificationPlugin)
  notificationManager.register(violationNotificationPlugin)
}

export {
  authNotificationPlugin,
  moderationNotificationPlugin,
  commentNotificationPlugin,
  reactionNotificationPlugin,
  mentionNotificationPlugin,
  announcementNotificationPlugin,
  systemNotificationPlugin,
  adminChatMentionNotificationPlugin,
  violationNotificationPlugin
}

export type { AuthNotificationData } from './auth'
export type { ModerationNotificationData } from './moderation'
export type {
  CommentNotificationData,
  ReactionNotificationData,
  MentionNotificationData
} from './social'
export type { AnnouncementNotificationData } from './announcement'
export type { SystemNotificationData } from './system'
export type { AdminChatMentionNotificationData } from './admin_chat'
