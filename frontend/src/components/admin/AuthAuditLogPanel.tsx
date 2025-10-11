/**
 * 認證審計日誌面板
 * 顯示登入、註冊、失敗原因、錯誤代碼等詳細記錄
 */

import { useState, useEffect } from 'react'
import { Search, Filter, Download, Eye, Shield, AlertTriangle, CheckCircle, Clock, User, Globe } from 'lucide-react'
import { AdminAuthAPI, AuditLogEntry } from '@/services/authApi'

const EVENT_TYPE_LABELS: Record<string, string> = {
  'login_success': '登入成功',
  'login_failed': '登入失敗',
  'register_success': '註冊成功',
  'register_failed': '註冊失敗',
  'google_auth_success': 'Google 登入成功',
  'google_auth_failed': 'Google 登入失敗',
  'password_change': '密碼變更',
  'google_binding': 'Google 帳號綁定',
  'google_unbinding': 'Google 帳號解綁',
  'account_lockout': '帳號鎖定',
  'rate_limit_exceeded': '頻率限制觸發',
  'domain_validation_failed': '網域驗證失敗',
  'suspicious_activity': '可疑活動',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  'login_success': 'text-green-600 bg-green-50',
  'register_success': 'text-blue-600 bg-blue-50',
  'google_auth_success': 'text-green-600 bg-green-50',
  'password_change': 'text-blue-600 bg-blue-50',
  'google_binding': 'text-blue-600 bg-blue-50',
  'google_unbinding': 'text-blue-600 bg-blue-50',
  'login_failed': 'text-red-600 bg-red-50',
  'register_failed': 'text-red-600 bg-red-50',
  'google_auth_failed': 'text-red-600 bg-red-50',
  'account_lockout': 'text-red-600 bg-red-50',
  'rate_limit_exceeded': 'text-amber-600 bg-amber-50',
  'domain_validation_failed': 'text-amber-600 bg-amber-50',
  'suspicious_activity': 'text-red-600 bg-red-50',
}

interface FilterOptions {
  eventType: string
  startDate: string
  endDate: string
  userEmail: string
  ipAddress: string
}

/**
 *
 */
export default function AuthAuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState<FilterOptions>({
    eventType: '',
    startDate: '',
    endDate: '',
    userEmail: '',
    ipAddress: ''
  })
  const [showFilters, setShowFilters] = useState(false)

  const pageSize = 20

  const loadAuditLogs = async (page = 1) => {
    setLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const response = await AdminAuthAPI.getAuditLogs(
        filters.eventType || undefined,
        pageSize,
        offset
      )
      
      setLogs(response.logs)
      setTotalPages(Math.ceil(response.total / pageSize))
      setCurrentPage(page)
    } catch (error: any) {
      setError(error.message || '載入審計日誌失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAuditLogs(1)
  }, [filters.eventType])

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getEventIcon = (eventType: string) => {
    if (eventType.includes('success')) {
      return <CheckCircle className="w-4 h-4 text-green-600" />
    } else if (eventType.includes('failed')) {
      return <AlertTriangle className="w-4 h-4 text-red-600" />
    } else if (eventType.includes('lockout') || eventType.includes('suspicious')) {
      return <Shield className="w-4 h-4 text-red-600" />
    } else {
      return <Clock className="w-4 h-4 text-blue-600" />
    }
  }

  const renderEventDetails = (log: AuditLogEntry) => {
    const details = log.details || {}
    
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted">事件類型</label>
            <p className="text-sm">{EVENT_TYPE_LABELS[log.event_type] || log.event_type}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">時間</label>
            <p className="text-sm">{formatTime(log.created_at)}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">用戶 ID</label>
            <p className="text-sm">{log.user_id || '未知'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Email</label>
            <p className="text-sm">{log.user_email || '未知'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">IP 地址</label>
            <p className="text-sm font-mono">{log.ip_address || '未記錄'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">User Agent</label>
            <p className="text-xs break-all">{log.user_agent || '未記錄'}</p>
          </div>
        </div>

        
        {Object.keys(details).length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted">詳細資訊</label>
            <div className="mt-1 p-3 bg-muted/20 rounded-lg">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          </div>
        )}

        
        {log.event_type.includes('failed') && details.error_code && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              錯誤代碼：{details.error_code}
            </p>
            {details.error_message && (
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {details.error_message}
              </p>
            )}
          </div>
        )}

        
        {log.event_type.includes('google') && details.google_sub && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm">
              <strong>Google Sub：</strong> {details.google_sub}
            </p>
            {details.google_email && (
              <p className="text-sm">
                <strong>Google Email：</strong> {details.google_email}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">認證審計日誌</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-surface/80 flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            篩選
          </button>
          <button
            onClick={() => loadAuditLogs(currentPage)}
            className="px-3 py-2 text-sm text-primary hover:underline"
          >
            重新載入
          </button>
        </div>
      </div>

      
      {showFilters && (
        <div className="p-4 bg-surface/50 border border-border rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg mb-1">
                事件類型
              </label>
              <select
                value={filters.eventType}
                onChange={(e) => setFilters(prev => ({ ...prev, eventType: e.target.value }))}
                className="form-control"
              >
                <option value="">全部</option>
                {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-fg mb-1">
                用戶 Email
              </label>
              <input
                type="email"
                value={filters.userEmail}
                onChange={(e) => setFilters(prev => ({ ...prev, userEmail: e.target.value }))}
                className="form-control"
                placeholder="搜尋特定用戶..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg mb-1">
                IP 地址
              </label>
              <input
                type="text"
                value={filters.ipAddress}
                onChange={(e) => setFilters(prev => ({ ...prev, ipAddress: e.target.value }))}
                className="form-control"
                placeholder="搜尋特定 IP..."
              />
            </div>
          </div>
        </div>
      )}

      
      {error && (
        <div className="p-4 bg-danger-bg border border-danger-border rounded-lg">
          <p className="text-danger-text">{error}</p>
        </div>
      )}

      
      <div className="space-y-2">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>沒有找到審計日誌</p>
          </div>
        ) : (
          logs.map((log) => {
            const eventTypeClass = EVENT_TYPE_COLORS[log.event_type] || 'text-gray-600 bg-gray-50'
            
            return (
              <div
                key={log.id}
                className="border border-border rounded-lg p-4 hover:bg-surface/50 cursor-pointer transition-colors"
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getEventIcon(log.event_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${eventTypeClass}`}>
                            {EVENT_TYPE_LABELS[log.event_type] || log.event_type}
                          </span>
                          {log.user_email && (
                            <span className="text-sm text-muted">
                              {log.user_email}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(log.created_at)}
                          </span>
                          {log.ip_address && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {log.ip_address}
                            </span>
                          )}
                          {log.user_id && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              ID: {log.user_id}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <button className="text-muted hover:text-fg">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => loadAuditLogs(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-surface/80 disabled:opacity-50"
          >
            上一頁
          </button>
          
          <span className="text-sm text-muted">
            第 {currentPage} 頁，共 {totalPages} 頁
          </span>
          
          <button
            onClick={() => loadAuditLogs(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-surface/80 disabled:opacity-50"
          >
            下一頁
          </button>
        </div>
      )}

      
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {EVENT_TYPE_LABELS[selectedLog.event_type] || selectedLog.event_type}
                </h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-muted hover:text-fg"
                >
                  ✕
                </button>
              </div>
              
              {renderEventDetails(selectedLog)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}