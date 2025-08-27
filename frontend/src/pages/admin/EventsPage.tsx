import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRole, isLoggedIn } from '@/utils/auth'
import { 
  ArrowLeft, 
  Activity, 
  Clock, 
  Filter, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  User, 
  MessageSquare, 
  FileText, 
  Settings,
  Shield,
  Users,
  Building2,
  Loader2
} from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

interface AdminEvent {
  timestamp: string
  event_type: string
  title: string
  description: string
  actor_id?: number
  actor_name?: string
  target_id?: number
  target_type?: string
  severity: string
  metadata: Record<string, any>
  event_type_display: string
  severity_display: string
  time_display: string
  time_ago: string
}

interface EventStatistics {
  total_events: number
  events_24h: number
  type_distribution: Record<string, number>
  severity_distribution: Record<string, number>
  recent_events: AdminEvent[]
}

export default function EventsPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [statistics, setStatistics] = useState<EventStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [showStats, setShowStats] = useState(true)

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/auth')
      return
    }

    loadEvents()
  }, [navigate, filterType, filterSeverity])

  const loadEvents = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams({
        limit: '50',
        stats: 'true'
      })
      
      if (filterType) params.append('type', filterType)
      if (filterSeverity) params.append('severity', filterSeverity)
      
      const response = await fetch(`/api/admin/events?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
        setStatistics(data.statistics || null)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || '無法載入事件記錄')
      }
    } catch (error) {
      console.error('Error loading events:', error)
      setError('網路連線錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'user_login':
      case 'user_registered':
      case 'user_logout':
      case 'user_role_changed':
      case 'user_password_changed':
      case 'user_deleted':
        return User
      case 'post_created':
      case 'post_approved':
      case 'post_rejected':
      case 'post_deleted':
        return FileText
      case 'comment_created':
      case 'comment_approved':
      case 'comment_rejected':
      case 'comment_deleted':
        return MessageSquare
      case 'school_created':
      case 'school_updated':
      case 'school_deleted':
        return Building2
      case 'system_mode_changed':
      case 'system_settings_changed':
      case 'maintenance_mode':
        return Settings
      case 'failed_login':
      case 'suspicious_activity':
      case 'rate_limit_exceeded':
        return AlertTriangle
      case 'delete_request_created':
      case 'delete_request_approved':
      case 'delete_request_rejected':
        return Shield
      default:
        return Activity
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20'
      case 'high':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20'
      case 'medium':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
      case 'low':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20'
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20'
    }
  }

  const getEventTypeColor = (eventType: string) => {
    if (eventType.includes('rejected') || eventType.includes('failed') || eventType.includes('deleted')) {
      return 'text-red-600'
    }
    if (eventType.includes('approved') || eventType.includes('created')) {
      return 'text-green-600'
    }
    if (eventType.includes('login') || eventType.includes('logout')) {
      return 'text-blue-600'
    }
    return 'text-gray-600'
  }

  if (!isLoggedIn()) {
    return null
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/events" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        {/* 頁面標題 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">管理員事件記錄</h1>
          <p className="text-sm text-muted mt-1">查看系統中的重要操作記錄</p>
        </div>

        {/* 統計資料 */}
        {showStats && statistics && (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">統計概覽</h2>
              <button
                onClick={() => setShowStats(false)}
                className="text-muted hover:text-fg transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-fg">{statistics.total_events}</div>
                <div className="text-sm text-muted">總事件數</div>
              </div>
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{statistics.events_24h}</div>
                <div className="text-sm text-muted">24小時內</div>
              </div>
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {statistics.severity_distribution.low || 0}
                </div>
                <div className="text-sm text-muted">低風險</div>
              </div>
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {(statistics.severity_distribution.high || 0) + (statistics.severity_distribution.critical || 0)}
                </div>
                <div className="text-sm text-muted">高風險</div>
              </div>
            </div>
          </div>
        )}

        {/* 篩選器 */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-fg">篩選條件</h2>
            <button
              onClick={loadEvents}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border hover:bg-surface/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              重新載入
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg mb-2">事件類型</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="form-control"
              >
                <option value="">全部類型</option>
                <option value="user_login">用戶登入</option>
                <option value="user_registered">用戶註冊</option>
                <option value="post_created">貼文發布</option>
                <option value="post_approved">貼文核准</option>
                <option value="post_rejected">貼文拒絕</option>
                <option value="comment_created">留言發布</option>
                <option value="comment_approved">留言核准</option>
                <option value="comment_rejected">留言拒絕</option>
                <option value="delete_request_approved">刪文請求核准</option>
                <option value="delete_request_rejected">刪文請求拒絕</option>
                <option value="system_mode_changed">系統模式變更</option>
                <option value="failed_login">登入失敗</option>
                <option value="suspicious_activity">可疑活動</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-fg mb-2">嚴重程度</label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="form-control"
              >
                <option value="">全部程度</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="critical">嚴重</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterType('')
                  setFilterSeverity('')
                }}
                className="w-full px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface/80 transition-colors"
              >
                清除篩選
              </button>
            </div>
          </div>
        </div>

        {/* 事件列表 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-fg">事件記錄</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-4 text-muted animate-spin" />
              <p className="text-muted">載入中...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted" />
              <h3 className="text-lg font-semibold text-fg mb-2">載入失敗</h3>
              <p className="text-muted mb-4">{error}</p>
              <button
                onClick={loadEvents}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                重新載入
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="w-12 h-12 mx-auto mb-4 text-muted" />
              <h3 className="text-lg font-semibold text-fg mb-2">無事件記錄</h3>
              <p className="text-muted">目前沒有任何事件記錄</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {events.map((event, index) => {
                const EventIcon = getEventIcon(event.event_type)
                return (
                  <div key={index} className="p-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className={`p-2 rounded-lg ${getEventTypeColor(event.event_type)}`}>
                          <EventIcon className="w-5 h-5" />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-fg">{event.title}</h3>
                          <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(event.severity)}`}>
                            {event.severity_display}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted mb-2">{event.description}</p>
                        
                        <div className="flex items-center gap-4 text-xs text-muted">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {event.time_display}
                          </div>
                          <span>{event.time_ago}</span>
                          {event.actor_name && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {event.actor_name}
                            </div>
                          )}
                          {event.target_id && (
                            <span>目標ID: {event.target_id}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
