/**
 * 通知管理器
 * 實現插件式通知系統
 */

import { NotificationPlugin, INotificationManager, Notification } from '@/types/notifications'

export class NotificationManager implements INotificationManager {
  private plugins = new Map<string, NotificationPlugin>()
  private addNotificationFn?: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => string

  /**
   * 設置通知添加函數（由 useNotifications Hook 提供）
   */
  setAddNotificationFn(fn: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => string) {
    this.addNotificationFn = fn
  }

  /**
   * 註冊通知插件
   */
  register<T>(plugin: NotificationPlugin<T>): void {
    if (this.plugins.has(plugin.type)) {
      console.warn(`[NotificationManager] Plugin type "${plugin.type}" already registered, overwriting`)
    }
    this.plugins.set(plugin.type, plugin)
  }

  /**
   * 取消註冊插件
   */
  unregister(type: string): void {
    this.plugins.delete(type)
  }

  /**
   * 發送通知
   * @returns 通知 ID，如果失敗則返回 undefined
   */
  emit<T>(type: string, data: T): string | undefined {
    const plugin = this.plugins.get(type)

    if (!plugin) {
      console.warn(`[NotificationManager] No plugin registered for type "${type}"`)
      return undefined
    }

    if (!this.addNotificationFn) {
      console.error('[NotificationManager] addNotificationFn not set')
      return undefined
    }

    try {
      const notification = plugin.template(data)
      return this.addNotificationFn(notification)
    } catch (error) {
      console.error(`[NotificationManager] Error emitting notification for type "${type}":`, error)
      return undefined
    }
  }

  /**
   * 獲取所有已註冊插件
   */
  getPlugins(): Map<string, NotificationPlugin> {
    return new Map(this.plugins)
  }

  /**
   * 獲取單個插件
   */
  getPlugin(type: string): NotificationPlugin | undefined {
    return this.plugins.get(type)
  }

  /**
   * 獲取所有插件的類型列表（用於篩選）
   */
  getTypeOptions(): Array<{ value: string; label: string; color: string }> {
    return Array.from(this.plugins.values()).map(plugin => ({
      value: plugin.type,
      label: plugin.label,
      color: plugin.color
    }))
  }
}

// 全域單例
export const notificationManager = new NotificationManager()