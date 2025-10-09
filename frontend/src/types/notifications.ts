/**
 * 通知系統類型定義
 * 支援動態註冊通知類型的插件架構
 */

import { LucideIcon } from 'lucide-react'

/**
 * 基礎通知介面
 */
export interface Notification {
  id: string
  type: string
  title: string
  message: string
  timestamp: number
  read: boolean
  urgent?: boolean
  actionUrl?: string
  actionText?: string
  icon?: 'success' | 'warning' | 'error' | 'info'
  data?: Record<string, any>
}

/**
 * 通知插件配置
 * T: 該通知類型的資料結構
 */
export interface NotificationPlugin<T = any> {
  /** 通知類型唯一識別符 */
  type: string

  /** 顯示標籤（用於篩選） */
  label: string

  /** 類型顏色樣式類 (Tailwind) */
  color: string

  /** 圖示元件 */
  icon: LucideIcon

  /**
   * 通知模板函數
   * 接收資料並生成通知內容
   */
  template: (data: T) => Omit<Notification, 'id' | 'timestamp' | 'read'>

  /**
   * Socket 事件處理器（可選）
   * 當接收到對應事件時自動觸發
   */
  socketEvent?: string
  socketHandler?: (payload: any, emit: (data: T) => void) => void
}

/**
 * 通知管理器介面
 */
export interface INotificationManager {
  /** 註冊通知插件 */
  register<T>(plugin: NotificationPlugin<T>): void

  /** 取消註冊插件 */
  unregister(type: string): void

  /** 發送通知 */
  emit<T>(type: string, data: T): string | undefined

  /** 獲取所有已註冊插件 */
  getPlugins(): Map<string, NotificationPlugin>

  /** 獲取單個插件 */
  getPlugin(type: string): NotificationPlugin | undefined
}