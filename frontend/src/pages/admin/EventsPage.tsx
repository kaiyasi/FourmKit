import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRole, isLoggedIn } from '@/utils/auth'
import { 
  ArrowLeft, 
  Activity, 
  Clock, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  User, 
  MessageSquare, 
  FileText, 
  Settings,
  Shield,
  Building2,
  Search
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

/**
 *
 */
export default function EventsPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [statistics, setStatistics] = useState<EventStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null)

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

  const getSeverityConfig = (severity: string) => {
    const configs: { [key: string]: { bg: string; text: string; label: string; icon: any } } = {
      'critical': { 
        bg: 'bg-red-50 dark:bg-red-900/20', 
        text: 'text-red-700 dark:text-red-300', 
        label: '嚴重',
        icon: AlertTriangle
      },
      'high': { 
        bg: 'bg-orange-50 dark:bg-orange-900/20', 
        text: 'text-orange-700 dark:text-orange-300', 
        label: '高',
        icon: AlertTriangle
      },
      'medium': { 
        bg: 'bg-blue-50 dark:bg-blue-900/20', 
        text: 'text-blue-700 dark:text-blue-300', 
        label: '中',
        icon: Clock
      },
      'low': { 
        bg: 'bg-green-50 dark:bg-green-900/20', 
        text: 'text-green-700 dark:text-green-300', 
        label: '低',
        icon: CheckCircle
      }
    }
    return configs[severity] || configs['medium']
  }

  const getEventTypeConfig = (eventType: string) => {
    const configs: { [key: string]: { icon: any; label: string; color: string } } = {
      'user_login': { icon: User, label: '用戶登入', color: 'text-blue-600 dark:text-blue-400' },
      'user_registered': { icon: User, label: '用戶註冊', color: 'text-green-600 dark:text-green-400' },
      'post_created': { icon: FileText, label: '貼文發布', color: 'text-green-600 dark:text-green-400' },
      'post_approved': { icon: FileText, label: '貼文核准', color: 'text-green-600 dark:text-green-400' },
      'post_rejected': { icon: FileText, label: '貼文拒絕', color: 'text-red-600 dark:text-red-400' },
      'comment_created': { icon: MessageSquare, label: '留言發布', color: 'text-green-600 dark:text-green-400' },
      'comment_approved': { icon: MessageSquare, label: '留言核准', color: 'text-green-600 dark:text-green-400' },
      'comment_rejected': { icon: MessageSquare, label: '留言拒絕', color: 'text-red-600 dark:text-red-400' },
      'delete_request_approved': { icon: Shield, label: '刪文請求核准', color: 'text-green-600 dark:text-green-400' },
      'delete_request_rejected': { icon: Shield, label: '刪文請求拒絕', color: 'text-red-600 dark:text-red-400' },
      'system_mode_changed': { icon: Settings, label: '系統模式變更', color: 'text-purple-600 dark:text-purple-400' },
      'failed_login': { icon: AlertTriangle, label: '登入失敗', color: 'text-red-600 dark:text-red-400' },
      'suspicious_activity': { icon: AlertTriangle, label: '可疑活動', color: 'text-red-600 dark:text-red-400' }
    }
    return configs[eventType] || { icon: Activity, label: eventType, color: 'text-gray-600 dark:text-gray-400' }
  }

  const parseEventDate = (raw: any): Date | null => {
    if (!raw && raw !== 0) return null
    if (typeof raw === 'number' || /^(\d+)$/.test(String(raw))) {
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
      const ms = n < 10_000_000_000 ? n * 1000 : n // 小於 1e10 視為秒
      const d = new Date(ms)
      return isNaN(d.getTime()) ? null : d
    }
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  }

  const getEventDateValue = (event: AdminEvent) => {
    const meta = (event?.metadata || {}) as any
    return (event as any)?.timestamp
      ?? (event as any)?.created_at
      ?? (event as any)?.createdAt
      ?? (event as any)?.updated_at
      ?? (event as any)?.updatedAt
      ?? meta.timestamp
      ?? meta.time
      ?? meta.ts
      ?? meta.created_at
      ?? meta.createdAt
      ?? meta.updated_at
      ?? meta.updatedAt
      ?? null
  }

  const formatDate = (input: any) => {
    const date = parseEventDate(input)
    if (!date) return '—'
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays === 1) {
      return '今天 ' + date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 2) {
      return '昨天 ' + date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays <= 7) {
      return `${diffDays}天前`
    } else {
      return date.toLocaleDateString('zh-TW')
    }
  }

  const formatTimeAgo = (event: AdminEvent) => {
    const candidate = (event as any)?.timestamp
      ?? (event as any)?.created_at
      ?? (event as any)?.updated_at
      ?? (event?.metadata && (
        (event.metadata.timestamp as any)
        ?? (event.metadata.time as any)
        ?? (event.metadata.ts as any)
      ))
      ?? (event as any)?.time_display
      ?? (event as any)?.time_ago
      ?? null
    const d = parseEventDate(candidate)
    if (d) {
      const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
      if (seconds < 60) return `${seconds}秒前`
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return `${minutes}分鐘前`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours}小時前`
      const days = Math.floor(hours / 24)
      if (days < 7) return `${days}天前`
      return d.toLocaleDateString('zh-TW')
    }
    return event.time_ago || event.time_display || '—'
  }

  const filteredEvents = events.filter(event => {
    const matchesType = !filterType || event.event_type === filterType
    const matchesSeverity = !filterSeverity || event.severity === filterSeverity
    const matchesSearch = !searchQuery || 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.actor_name && event.actor_name.toLowerCase().includes(searchQuery.toLowerCase()))
    
    return matchesType && matchesSeverity && matchesSearch
  })

  if (!isLoggedIn()) {
    return null
  }

  const MobileLayout = () => (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/events" />
      <MobileBottomNav />
      
      
      <div className="fixed top-16 left-0 right-0 bg-background border-b border-border z-10">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              後台
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">事件記錄</h1>
            </div>
            <button 
              onClick={loadEvents}
              disabled={loading}
              className="p-2 text-muted hover:text-fg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          
          {statistics && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="font-medium">{statistics.total_events}</div>
                <div className="text-muted">總計</div>
              </div>
              <div>
                <div className="font-medium text-blue-600">{statistics.events_24h}</div>
                <div className="text-muted">今日</div>
              </div>
              <div>
                <div className="font-medium text-red-600">
                  {((statistics.severity_distribution?.high || 0) + (statistics.severity_distribution?.critical || 0))}
                </div>
                <div className="text-muted">高風險</div>
              </div>
            </div>
          )}
        </div>
        
        
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto">
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-3 py-1 bg-surface border border-border rounded-lg text-sm min-w-0 flex-shrink-0"
            >
              <option value="">嚴重度</option>
              <option value="critical">🔴 嚴重</option>
              <option value="high">🟠 高</option>
              <option value="medium">🔵 中</option>
              <option value="low">🟢 低</option>
            </select>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1 bg-surface border border-border rounded-lg text-sm min-w-0 flex-shrink-0"
            >
              <option value="">事件類型</option>
              <option value="user_login">登入</option>
              <option value="post_created">貼文</option>
              <option value="failed_login">失敗</option>
              <option value="suspicious_activity">可疑</option>
            </select>
            
            <button
              onClick={() => {
                setFilterType('')
                setFilterSeverity('')
                setSearchQuery('')
              }}
              className="px-3 py-1 bg-surface border border-border rounded-lg text-sm text-muted"
            >
              清除
            </button>
          </div>
        </div>
      </div>

      
      <div className="pt-40 pb-20">
        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted" />
          </div>
        ) : error ? (
          <div className="text-center py-8 px-4">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted" />
            <p className="text-sm text-muted mb-3">{error}</p>
            <button
              onClick={loadEvents}
              className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              重新載入
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Activity className="w-8 h-8 mx-auto mb-2 text-muted" />
            <p className="text-sm text-muted">
              {events.length === 0 ? '暫無事件記錄' : '無符合條件的事件'}
            </p>
          </div>
        ) : (
          <div className="px-4 space-y-2">
            {filteredEvents.map((event, index) => {
              const severityConfig = getSeverityConfig(event.severity)
              const eventTypeConfig = getEventTypeConfig(event.event_type)
              const EventTypeIcon = eventTypeConfig.icon
              
              return (
                <div
                  key={index}
                  className={`bg-surface border-l-4 rounded-r-lg p-3 ${
                    event.severity === 'critical' ? 'border-l-red-500' :
                    event.severity === 'high' ? 'border-l-orange-500' :
                    event.severity === 'medium' ? 'border-l-blue-500' :
                    'border-l-green-500'
                  }`}
                  onClick={() => setSelectedEvent(selectedEvent?.timestamp === event.timestamp ? null : event)}
                >
                  
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <EventTypeIcon className={`w-4 h-4 ${eventTypeConfig.color}`} />
                      <span className="text-sm font-medium">{eventTypeConfig.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${severityConfig.bg} ${severityConfig.text}`}>
                        {severityConfig.label}
                      </span>
                    </div>
                    <span className="text-xs text-muted">{formatTimeAgo(event)}</span>
                  </div>
                  
                  
                  <div className="text-sm mb-1 line-clamp-2">
                    {event.title}
                  </div>
                  
                  
                  {selectedEvent?.timestamp === event.timestamp && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted mb-2">{event.description}</p>
                      <div className="flex items-center justify-between text-xs text-muted">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          <span>{(() => { const t = formatDate(getEventDateValue(event)); return t === '—' ? (event.time_display || event.time_ago || '—') : t })()}</span>
                        </div>
                        {event.actor_name && (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{event.actor_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  const DesktopLayout = () => (
    <div className="min-h-screen">
      <NavBar pathname="/admin/events" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        
        <div className="bg-surface rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">事件記錄</h1>
            <p className="text-sm text-muted mt-1">系統操作記錄與安全監控</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-surface rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                <Activity className="w-5 h-5" />
                事件列表
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadEvents}
                  className="p-2 text-muted hover:text-fg transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            
            <div className="mb-4 p-3 bg-surface-hover rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="搜尋事件..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control text-sm"
                />
                
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="form-control text-sm"
                >
                  <option value="">所有類型</option>
                  <option value="user_login">用戶登入</option>
                  <option value="user_registered">用戶註冊</option>
                  <option value="post_created">貼文發布</option>
                  <option value="post_approved">貼文核准</option>
                  <option value="post_rejected">貼文拒絕</option>
                  <option value="failed_login">登入失敗</option>
                  <option value="suspicious_activity">可疑活動</option>
                </select>
                
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="form-control text-sm"
                >
                  <option value="">所有程度</option>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="critical">嚴重</option>
                </select>
              </div>
            </div>

            
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted">載入中...</div>
              ) : error ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted" />
                  <p className="text-muted mb-4">{error}</p>
                  <button
                    onClick={loadEvents}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                  >
                    重新載入
                  </button>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  {events.length === 0 ? '暫無事件記錄' : '無符合條件的事件'}
                </div>
              ) : (
                filteredEvents.map((event, index) => {
                  const severityConfig = getSeverityConfig(event.severity)
                  const eventTypeConfig = getEventTypeConfig(event.event_type)
                  const EventTypeIcon = eventTypeConfig.icon
                  
                  return (
                    <div
                      key={index}
                      className="p-4 rounded-xl bg-surface-hover hover:bg-surface cursor-pointer transition-colors"
                      onClick={() => setSelectedEvent(selectedEvent?.timestamp === event.timestamp ? null : event)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${severityConfig.bg} ${severityConfig.text}`}>
                            {severityConfig.label}
                          </span>
                          <span className="text-xs text-muted">#{filteredEvents.length - index}</span>
                          <EventTypeIcon className={`w-4 h-4 ${eventTypeConfig.color}`} />
                          <span className={`text-xs ${eventTypeConfig.color}`}>
                            {eventTypeConfig.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted">
                          <Clock className="inline w-3 h-3 mr-1" />
                          {formatTimeAgo(event)}
                        </span>
                      </div>

                      <div className="mb-2 text-sm line-clamp-2 font-medium">
                        {event.title}
                      </div>
                      
                      <div className="text-xs text-muted line-clamp-1 mb-2">
                        {event.description}
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {(() => { const t = formatDate(getEventDateValue(event)); return t === '—' ? (event.time_display || event.time_ago || '—') : t })()}
                        </span>
                        {event.actor_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {event.actor_name}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          
          <div className="space-y-6">
            
            {statistics && (
              <div className="bg-surface rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">事件統計</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">總事件數</span>
                    <span className="text-sm font-medium">{statistics.total_events}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">24小時內</span>
                    <span className="text-sm font-medium text-blue-600">{statistics.events_24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">高風險事件</span>
                    <span className="text-sm font-medium text-red-600">
                      {((statistics.severity_distribution?.high || 0) + (statistics.severity_distribution?.critical || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">低風險事件</span>
                    <span className="text-sm font-medium text-green-600">
                      {statistics.severity_distribution?.low || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}

            
            {selectedEvent && (
              <div className="bg-surface rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">事件詳情</h3>
                
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium">標題</div>
                    <div className="text-sm text-muted">{selectedEvent.title}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">描述</div>
                    <div className="text-sm text-muted">{selectedEvent.description}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">時間</div>
                    <div className="text-sm text-muted">{formatDate(selectedEvent.timestamp)}</div>
                  </div>
                  {selectedEvent.actor_name && (
                    <div>
                      <div className="text-sm font-medium">執行者</div>
                      <div className="text-sm text-muted">{selectedEvent.actor_name}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">嚴重程度</div>
                    <div className="text-sm text-muted">{getSeverityConfig(selectedEvent.severity).label}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">事件類型</div>
                    <div className="text-sm text-muted">{getEventTypeConfig(selectedEvent.event_type).label}</div>
                  </div>
                </div>
              </div>
            )}

            
            <div className="bg-surface rounded-2xl p-4 shadow-soft">
              <h3 className="text-lg font-semibold text-fg mb-4">快速篩選</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setFilterSeverity('critical')}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-surface-hover rounded-lg transition-colors text-sm"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>嚴重事件</span>
                </button>
                <button
                  onClick={() => setFilterType('failed_login')}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-surface-hover rounded-lg transition-colors text-sm"
                >
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span>登入失敗</span>
                </button>
                <button
                  onClick={() => setFilterType('suspicious_activity')}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-surface-hover rounded-lg transition-colors text-sm"
                >
                  <Shield className="w-4 h-4 text-red-600" />
                  <span>可疑活動</span>
                </button>
                <button
                  onClick={() => {
                    setFilterType('')
                    setFilterSeverity('')
                    setSearchQuery('')
                  }}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-surface-hover rounded-lg transition-colors text-sm"
                >
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span>清除篩選</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )

  return (
    <>
      
      <div className="block lg:hidden">
        <MobileLayout />
      </div>
      
      
      <div className="hidden lg:block">
        <DesktopLayout />
      </div>
    </>
  )
}
