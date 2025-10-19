import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  Activity, 
  Power, 
  PowerOff, 
  RefreshCw,
  Clock,
  Cpu,
  HardDrive,
  Server,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Database,
  Globe,
  Shield,
  Zap,
  BarChart3,
  Settings
} from 'lucide-react'

interface PlatformStatus {
  process_id: number
  system_start_time: string
  system_uptime_seconds: number
  app_start_time: string | null
  app_uptime_seconds: number | null
  memory_usage_mb: number
  cpu_percent: number
  python_version: string
  platform: string
  current_time: string
}

/**
 *
 */
export default function ServerStatusPage() {
  const navigate = useNavigate()
  const { isLoggedIn, role } = useAuth()
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    if (!isLoggedIn || role !== 'dev_admin') {
      navigate('/403')
      return
    }
    
    fetchPlatformStatus()
  }, [isLoggedIn, role, navigate])

  const fetchPlatformStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/admin/platform/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStatus(data.status)
        setLastUpdate(new Date())
      } else {
        throw new Error('獲取平台狀態失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const triggerPlatformAction = async (action: 'restart' | 'stop', reason: string) => {
    setActionLoading(action)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/admin/platform/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      })
      
      if (response.ok) {
        const data = await response.json()
        alert(`✅ ${data.message}`)
        await fetchPlatformStatus()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || '操作失敗')
      }
    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setActionLoading(null)
    }
  }

  const formatUptime = (seconds: number | null): string => {
    if (!seconds) return '未知'
    
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (days > 0) {
      return `${days}天 ${hours}小時 ${minutes}分鐘`
    } else if (hours > 0) {
      return `${hours}小時 ${minutes}分鐘`
    } else if (minutes > 0) {
      return `${minutes}分鐘 ${secs}秒`
    } else {
      return `${secs}秒`
    }
  }

  const formatDateTime = (isoString: string | null): string => {
    if (!isoString) return '未知'
    return new Date(isoString).toLocaleString('zh-TW')
  }

  const formatTimeTZ = (isoString: string | null, timeZone: string = 'Asia/Taipei'): string => {
    if (!isoString) return '未知'
    return new Date(isoString).toLocaleTimeString('zh-TW', { timeZone })
  }

  const formatDateTZ = (isoString: string | null, timeZone: string = 'Asia/Taipei'): string => {
    if (!isoString) return '未知'
    return new Date(isoString).toLocaleDateString('zh-TW', { timeZone })
  }

  const StatusCard = ({ 
    title, 
    status, 
    description, 
    icon: Icon,
    details,
    error 
  }: { 
    title: string
    status: 'success' | 'warning' | 'error' | 'disabled'
    description: string
    icon: any
    details?: React.ReactNode
    error?: string
  }) => {
    const statusColors = {
      success: 'border-success-border bg-success-bg text-success-text',
      warning: 'border-warning-border bg-warning-bg text-warning-text',
      error: 'border-danger-border bg-danger-bg text-danger-text',
      disabled: 'border-border bg-surface-hover text-muted'
    }

    const statusIcons = {
      success: <CheckCircle className="w-5 h-5 text-success" />,
      warning: <AlertTriangle className="w-5 h-5 text-warning" />,
      error: <AlertTriangle className="w-5 h-5 text-danger" />,
      disabled: <AlertTriangle className="w-5 h-5 text-muted" />
    }

    return (
      <div className={`p-4 rounded-xl border ${statusColors[status]} transition-all hover:shadow-medium`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Icon className="w-6 h-6" />
            <div>
              <h3 className="font-semibold text-sm">{title}</h3>
              <p className="text-xs opacity-80 mt-1">{description}</p>
            </div>
          </div>
          {statusIcons[status]}
        </div>
        
        {details && (
          <div className="mt-3 text-xs space-y-1">
            {details}
          </div>
        )}
        
        {error && (
          <div className="mt-3 p-2 rounded bg-danger-bg border border-danger-border">
            <p className="text-xs text-danger-text font-mono">{error}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/platform" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold dual-text mb-2">伺服器狀態監控</h1>
              <p className="text-sm text-muted">監控底層基礎設施和系統技術指標</p>
            </div>
            
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <div className="hidden sm:flex text-xs text-muted items-center gap-1">
                  <Clock className="w-3 h-3" />
                  更新於 {lastUpdate.toLocaleTimeString()}
                </div>
              )}
              <button 
                onClick={fetchPlatformStatus}
                disabled={loading}
                className="btn-primary flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">重新載入</span>
                <span className="sm:hidden">刷新</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">載入錯誤</span>
            </div>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        )}

        
        {status && (
          <div className="bg-surface border border-border rounded-2xl p-4 mb-6 shadow-soft">
            <div className="flex items-center justify-center gap-3">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-green-800">伺服器運行正常</h2>
                <p className="text-sm text-green-600">所有系統服務正常運作</p>
              </div>
            </div>
          </div>
        )}

        {loading && !status ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-soft">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-muted">載入伺服器狀態中...</p>
          </div>
        ) : status ? (
          <>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              
              <StatusCard
                title="應用程序"
                status="success"
                description="ForumKit 主應用程序"
                icon={Server}
                details={
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>進程 ID:</span>
                      <span className="font-mono text-xs sm:text-sm">{status.process_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>運行時間:</span>
                      <span className="text-xs sm:text-sm">{formatUptime(status.app_uptime_seconds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>啟動時間:</span>
                      <span className="text-xs sm:text-sm">{formatDateTime(status.app_start_time)}</span>
                    </div>
                  </div>
                }
              />

              
              <StatusCard
                title="系統環境"
                status="success"
                description="作業系統和運行環境"
                icon={Settings}
                details={
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>系統運行時間:</span>
                      <span className="text-xs sm:text-sm">{formatUptime(status.system_uptime_seconds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>系統啟動時間:</span>
                      <span className="text-xs sm:text-sm">{formatDateTime(status.system_start_time)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Python 版本:</span>
                      <span className="font-mono text-xs sm:text-sm">{status.python_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>平台:</span>
                      <span className="font-mono text-xs sm:text-sm">{status.platform}</span>
                    </div>
                  </div>
                }
              />
            </div>

            
            <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  <h2 className="text-lg font-semibold dual-text">資源使用狀況</h2>
                </div>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  <div className="bg-surface-hover rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-blue-500" />
                        <h3 className="font-medium text-sm text-fg">CPU 使用率</h3>
                      </div>
                      <span className="text-lg font-bold text-fg">{status.cpu_percent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all ${
                          status.cpu_percent > 80 ? 'bg-red-500' : 
                          status.cpu_percent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(status.cpu_percent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted mt-2">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  
                  <div className="bg-surface-hover rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-5 h-5 text-purple-500" />
                        <h3 className="font-medium text-sm text-fg">記憶體使用</h3>
                      </div>
                      <span className="text-lg font-bold text-fg">{status.memory_usage_mb} MB</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="h-3 rounded-full transition-all bg-blue-500"
                        style={{ width: '60%' }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted mt-2">
                      <span>0 MB</span>
                      <span>系統記憶體</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            
            <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  <h2 className="text-lg font-semibold dual-text">平台操作</h2>
                </div>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => triggerPlatformAction('restart', '管理員手動重啟')}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-2 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'restart' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-5 w-5 text-orange-600" />
                    )}
                    <span className="text-orange-600 font-medium">記錄平台重啟</span>
                  </button>
                  
                  <button
                    onClick={() => triggerPlatformAction('stop', '管理員手動關閉')}
                    disabled={actionLoading !== null}
                    className="flex items-center justify-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'stop' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <PowerOff className="h-5 w-5 text-red-600" />
                    )}
                    <span className="text-red-600 font-medium">記錄平台關閉</span>
                  </button>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>注意：</strong>這些操作僅記錄事件到系統日誌中，不會實際重啟或關閉平台。
                      實際的平台重啟請使用系統管理工具或重啟腳本。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              
              <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <h3 className="font-medium text-xs sm:text-sm text-fg">進程狀態</h3>
                </div>
                <div className="text-lg font-bold text-green-600">
                  運行中
                </div>
                <div className="text-xs text-muted">PID: {status.process_id}</div>
              </div>

              
              <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <h3 className="font-medium text-xs sm:text-sm text-fg">應用運行時間</h3>
                </div>
                <div className="text-lg font-bold text-fg">
                  {formatUptime(status.app_uptime_seconds).split(' ')[0]}
                </div>
                <div className="text-xs text-muted">
                  {formatUptime(status.app_uptime_seconds).split(' ').slice(1).join(' ')}
                </div>
              </div>

              
              <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <h3 className="font-medium text-xs sm:text-sm text-fg">系統運行時間</h3>
                </div>
                <div className="text-lg font-bold text-fg">
                  {formatUptime(status.system_uptime_seconds).split(' ')[0]}
                </div>
                <div className="text-xs text-muted">
                  {formatUptime(status.system_uptime_seconds).split(' ').slice(1).join(' ')}
                </div>
              </div>

              
              <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <h3 className="font-medium text-xs sm:text-sm text-fg">當前時間</h3>
                </div>
                <div className="text-lg font-bold text-fg">
                  {formatTimeTZ(status.current_time)}
                </div>
                <div className="text-xs text-muted">
                  {formatDateTZ(status.current_time)}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
