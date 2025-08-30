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
  ArrowLeft
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

export default function PlatformStatusPage() {
  const navigate = useNavigate()
  const { isLoggedIn, role } = useAuth()
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // 檢查是否為 dev_admin
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
        // 重新獲取狀態
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar pathname="/admin/platform" />
        <div className="pt-20 pb-16 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted">載入平台狀態中...</span>
            </div>
          </div>
        </div>
        <MobileBottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/platform" />
      <div className="pt-20 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* 頁面標題 */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
                <Server className="h-6 w-6" />
                平台狀態管理
              </h1>
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-fg transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                返回後台
              </button>
            </div>
            <p className="text-muted">監控和管理 ForumKit 平台運行狀態</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* 平台狀態卡片 */}
          {status && (
            <div className="grid gap-6 mb-8">
              {/* 基本狀態 */}
              <div className="bg-surface border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  基本狀態
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <Server className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="text-sm text-muted">進程 ID</div>
                      <div className="font-mono text-fg">{status.process_id}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <Clock className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="text-sm text-muted">系統運行時間</div>
                      <div className="text-fg">{formatUptime(status.system_uptime_seconds)}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="text-sm text-muted">系統啟動時間</div>
                      <div className="text-fg">{formatDateTime(status.system_start_time)}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <Activity className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="text-sm text-muted">應用程序運行時間</div>
                      <div className="text-fg">{formatUptime(status.app_uptime_seconds)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 系統資源 */}
              <div className="bg-surface border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  系統資源
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                                            <HardDrive className="h-5 w-5 text-purple-500" />
                    <div className="flex-1">
                      <div className="text-sm text-muted">記憶體使用</div>
                      <div className="text-fg">{status.memory_usage_mb} MB</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <Cpu className="h-5 w-5 text-orange-500" />
                    <div className="flex-1">
                      <div className="text-sm text-muted">CPU 使用率</div>
                      <div className="text-fg">{status.cpu_percent.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 環境信息 */}
              <div className="bg-surface border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  環境信息
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <div className="h-5 w-5 bg-blue-500 rounded" />
                    <div>
                      <div className="text-sm text-muted">Python 版本</div>
                      <div className="font-mono text-fg">{status.python_version}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                    <div className="h-5 w-5 bg-green-500 rounded" />
                    <div>
                      <div className="text-sm text-muted">平台</div>
                      <div className="font-mono text-fg">{status.platform}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 平台操作 */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
              <Power className="h-5 w-5" />
              平台操作
            </h2>
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

          {/* 刷新按鈕 */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={fetchPlatformStatus}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新狀態
            </button>
          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}
