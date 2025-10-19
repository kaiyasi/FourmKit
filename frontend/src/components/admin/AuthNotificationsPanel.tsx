/**
 * 管理員認證通知面板
 * 顯示學校新增請求、slug 錯誤回報等事件
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, School, Users, Mail, ExternalLink, Clock, CheckCircle, X } from 'lucide-react'
import { AdminAuthAPI } from '@/services/authApi'

interface AuthNotification {
  id: string
  type: 'school_request' | 'slug_report' | 'domain_attempt' | 'google_binding'
  timestamp: string
  userEmail?: string
  status: 'pending' | 'processed' | 'rejected'
  details: Record<string, any>
}

/**
 *
 */
export default function AuthNotificationsPanel() {
  const [notifications, setNotifications] = useState<AuthNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const loadNotifications = async () => {
    try {
      const response = await AdminAuthAPI.getNotificationEvents(50, 0)
      setNotifications(response.events.map(event => ({
        id: `${event.type}-${event.timestamp}`,
        type: event.type,
        timestamp: event.timestamp,
        userEmail: event.userEmail,
        status: 'pending', // 後端應該提供此狀態
        details: event.details
      })))
    } catch (error: any) {
      setError(error.message || '載入通知失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  const handleSchoolRequest = async (
    notificationId: string, 
    action: 'approve' | 'reject',
    schoolData?: {
      name: string
      slug: string
      domain?: string
    }
  ) => {
    setProcessing(notificationId)
    try {
      await AdminAuthAPI.processSchoolRequest(notificationId, action, schoolData)
      
      setNotifications(prev => prev.map(n => 
        n.id === notificationId 
          ? { ...n, status: action === 'approve' ? 'processed' : 'rejected' }
          : n
      ))
      
    } catch (error: any) {
      alert(`處理失敗：${error.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins} 分鐘前`
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)} 小時前`
    } else {
      return date.toLocaleDateString('zh-TW')
    }
  }

  const getNotificationIcon = (type: AuthNotification['type']) => {
    switch (type) {
      case 'school_request':
        return <School className="w-5 h-5 text-blue-600" />
      case 'slug_report':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />
      case 'domain_attempt':
        return <Mail className="w-5 h-5 text-red-600" />
      case 'google_binding':
        return <Users className="w-5 h-5 text-green-600" />
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-600" />
    }
  }

  const getNotificationTitle = (notification: AuthNotification) => {
    switch (notification.type) {
      case 'school_request':
        return '新學校加入請求'
      case 'slug_report':
        return '學校代碼錯誤回報'
      case 'domain_attempt':
        return '非許可網域嘗試'
      case 'google_binding':
        return 'Google 帳號綁定變更'
      default:
        return '未知通知類型'
    }
  }

  const renderNotificationDetails = (notification: AuthNotification) => {
    switch (notification.type) {
      case 'school_request':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              <strong>用戶：</strong> {notification.userEmail}
            </p>
            <p className="text-sm text-muted">
              <strong>檢測到的網域：</strong> {notification.details.detectedDomain}
            </p>
            {notification.details.requestedSchoolName && (
              <p className="text-sm text-muted">
                <strong>申請學校：</strong> {notification.details.requestedSchoolName}
              </p>
            )}
            {notification.details.requestedDomain && (
              <p className="text-sm text-muted">
                <strong>申請網域：</strong> {notification.details.requestedDomain}
              </p>
            )}
            {notification.details.userProvidedInfo && (
              <p className="text-sm text-muted">
                <strong>用戶說明：</strong> {notification.details.userProvidedInfo}
              </p>
            )}
          </div>
        )

      case 'slug_report':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              <strong>用戶：</strong> {notification.userEmail}
            </p>
            <p className="text-sm text-muted">
              <strong>學校：</strong> {notification.details.schoolName} (ID: {notification.details.schoolId})
            </p>
            <p className="text-sm text-muted">
              <strong>當前 slug：</strong> {notification.details.currentSlug}
            </p>
            {notification.details.reportReason && (
              <p className="text-sm text-muted">
                <strong>回報原因：</strong> {notification.details.reportReason}
              </p>
            )}
          </div>
        )

      case 'domain_attempt':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              <strong>嘗試的 Email：</strong> {notification.userEmail}
            </p>
            <p className="text-sm text-muted">
              <strong>來源：</strong> {notification.details.source}
            </p>
            <p className="text-sm text-muted">
              <strong>IP：</strong> {notification.details.ip || '未記錄'}
            </p>
          </div>
        )

      default:
        return (
          <div className="text-sm text-muted">
            {JSON.stringify(notification.details, null, 2)}
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-danger-bg border border-danger-border rounded-lg">
        <p className="text-danger-text">{error}</p>
        <button 
          onClick={() => {
            setError('')
            setLoading(true)
            loadNotifications()
          }}
          className="mt-2 text-sm underline"
        >
          重新載入
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">認證系統通知</h2>
        <button 
          onClick={loadNotifications}
          className="text-sm text-primary hover:underline"
        >
          重新載入
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>目前沒有待處理的通知</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`border rounded-lg p-4 ${
                notification.status === 'pending'
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                  : notification.status === 'processed'
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  {getNotificationIcon(notification.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-fg">
                        {getNotificationTitle(notification)}
                      </h3>
                      <p className="text-xs text-muted flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(notification.timestamp)}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {notification.status === 'pending' && (
                        <span className="px-2 py-1 text-xs bg-amber-200 text-amber-800 rounded">
                          待處理
                        </span>
                      )}
                      {notification.status === 'processed' && (
                        <span className="px-2 py-1 text-xs bg-green-200 text-green-800 rounded">
                          已處理
                        </span>
                      )}
                      {notification.status === 'rejected' && (
                        <span className="px-2 py-1 text-xs bg-gray-200 text-gray-800 rounded">
                          已拒絕
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    {renderNotificationDetails(notification)}
                  </div>

                  
                  {notification.status === 'pending' && notification.type === 'school_request' && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => {
                          const schoolName = notification.details.requestedSchoolName || 
                                          notification.details.detectedDomain.replace(/\.(edu\.tw|edu)$/, '')
                          const schoolSlug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '-')
                          const schoolDomain = notification.details.requestedDomain || 
                                             notification.details.detectedDomain

                          handleSchoolRequest(notification.id, 'approve', {
                            name: schoolName,
                            slug: schoolSlug,
                            domain: schoolDomain
                          })
                        }}
                        disabled={processing === notification.id}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {processing === notification.id ? '處理中...' : '批准'}
                      </button>
                      <button
                        onClick={() => handleSchoolRequest(notification.id, 'reject')}
                        disabled={processing === notification.id}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        拒絕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}