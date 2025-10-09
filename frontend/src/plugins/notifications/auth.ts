/**
 * 認證通知插件
 * 處理註冊、登入、密碼變更等認證相關通知
 */

import { NotificationPlugin } from '@/types/notifications'
import { ShieldCheck } from 'lucide-react'

export interface AuthNotificationData {
  event: 'register_success' | 'login_success' | 'password_changed' | 'google_linked'
  message?: string
  username?: string
}

export const authNotificationPlugin: NotificationPlugin<AuthNotificationData> = {
  type: 'auth',
  label: '使用認證',
  color: 'text-blue-600 bg-blue-50',
  icon: ShieldCheck,

  template: (data) => {
    const templates = {
      register_success: {
        title: '註冊成功',
        message: data.message || `歡迎加入 ForumKit 校園討論平台！`,
        icon: 'success' as const
      },
      login_success: {
        title: '登入成功',
        message: data.message || `歡迎回來${data.username ? `, ${data.username}` : ''}！`,
        icon: 'success' as const
      },
      password_changed: {
        title: '密碼已更新',
        message: data.message || '您的密碼已成功變更',
        icon: 'info' as const
      },
      google_linked: {
        title: 'Google 帳號已綁定',
        message: data.message || '現在可以使用 Google 快速登入',
        icon: 'success' as const
      }
    }

    const template = templates[data.event]

    return {
      type: 'auth',
      title: template.title,
      message: data.message || template.message,
      icon: template.icon
    }
  }
}