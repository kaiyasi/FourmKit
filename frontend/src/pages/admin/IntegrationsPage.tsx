import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Globe,
  MessageSquare,
  Database,
  Activity,
  Clock,
  Shield,
  ExternalLink,
  ArrowLeft,
  Settings
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface IntegrationStatus {
  ok?: boolean
  admin_webhook?: {
    configured: boolean
    host: string
    id_mask: string
    last_delivery?: string
    error?: string
  }
  queue?: {
    enabled: boolean
    size: number
    redis_connected?: boolean
  }
  recent_admin_events?: Array<{
    type: string
    message: string
    timestamp: string
  }>
  system?: {
    hostname?: string
    platform?: string
    uptime?: number
    loadavg?: {
      "1m": number
      "5m": number
      "15m": number
    }
    memory?: {
      total: number
      available: number
      percent: number
    }
    cpu_percent?: number
  }
  user_stats?: {
    total: number
  }
}

export default function AdminIntegrationsPage() {
  const { role, isLoggedIn } = useAuth()
  const [data, setData] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const isDevAdmin = isLoggedIn && role === 'dev_admin'

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const r = await fetch('/api/status/integrations', { 
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }, 
        cache: 'no-store' 
      })
      
      if (!r.ok) {
        throw new Error(`API 錯誤: ${r.status}`)
      }
      
      const j = await r.json()
      setData(j)
      setLastUpdate(new Date())
    } catch (e: any) {
      setError(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // 每30秒自動重新載入
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

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
      error: <XCircle className="w-5 h-5 text-danger" />,
      disabled: <XCircle className="w-5 h-5 text-muted" />
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
      <NavBar pathname="/admin/integrations" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold dual-text mb-2">主機服務監控</h1>
              <p className="text-sm text-muted">監控主機資源、資料庫、CDN 與平台指標</p>
            </div>
            
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <div className="hidden sm:flex text-xs text-muted items-center gap-1">
                  <Clock className="w-3 h-3" />
                  更新於 {lastUpdate.toLocaleTimeString()}
                </div>
              )}
              <button 
                onClick={load}
                disabled={loading}
                className="btn-primary flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">重新載入</span>
                <span className="sm:hidden">刷新</span>
              </button>
        </div>

        {/* 整合服務管理：移除，改為 NAS 監控 */}
      </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-800">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">載入錯誤</span>
            </div>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* 整體狀態指示 */}
        {data && (
          <div className="bg-surface border border-border rounded-2xl p-4 mb-6 shadow-soft">
            <div className="flex items-center justify-center gap-3">
              {data.ok ? (
                <>
                  <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-green-800">NAS 運行正常</h2>
                    <p className="text-sm text-green-600">核心服務運作正常</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-red-800">NAS 異常</h2>
                    <p className="text-sm text-red-600">檢測到服務異常，請檢查詳細狀態</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-soft">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-muted">載入整合狀態中...</p>
          </div>
        ) : data ? (
          <>
            {/* 快捷管理入口：移除，改為 NAS 監控 */}

            {/* 服務狀態卡片 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Discord Webhook 狀態 */}
              <StatusCard
                title="Discord Webhook"
                status={data.admin_webhook?.configured ? 'success' : 'disabled'}
                description="管理員通知和系統事件推送"
                icon={MessageSquare}
                details={data.admin_webhook?.configured ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>目標主機:</span>
                      <span className="font-mono text-xs sm:text-sm">{data.admin_webhook.host}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Webhook ID:</span>
                      <span className="font-mono text-xs sm:text-sm">{data.admin_webhook.id_mask}</span>
                    </div>
                    {data.admin_webhook.last_delivery && (
                      <div className="flex justify-between">
                        <span>最後推送:</span>
                        <span className="text-xs sm:text-sm">{new Date(data.admin_webhook.last_delivery).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs opacity-80">Webhook 未配置</p>
                )}
                error={data.admin_webhook?.error}
              />

              {/* 佇列系統狀態 */}
              <StatusCard
                title="佇列系統"
                status={data.queue?.enabled ? 'success' : 'disabled'}
                description="背景任務處理和訊息佇列"
                icon={Database}
                details={
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>狀態:</span>
                      <span>{data.queue?.enabled ? '已啟用' : '已停用'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>佇列大小:</span>
                      <span>{data.queue?.size || 0} 項</span>
                    </div>
                    {data.queue?.redis_connected !== undefined && (
                      <div className="flex justify-between">
                        <span>Redis 連線:</span>
                        <span>{data.queue.redis_connected ? '✅ 已連線' : '❌ 斷線'}</span>
                      </div>
                    )}
                  </div>
                }
              />
            </div>

            {/* 最近管理員事件 */}
            <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  <h2 className="text-lg font-semibold dual-text">後端狀態紀錄</h2>
                </div>
              </div>
              
              <div className="p-4">
                {data.recent_admin_events && data.recent_admin_events.length > 0 ? (
                  <div className="space-y-3">
                    {data.recent_admin_events.map((event, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-surface-hover">
                        <div className={`w-4 h-4 mt-0.5 rounded-full ${
                          event.ok ? 'bg-green-500' : 'bg-red-500'
                        }`}></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-fg truncate">
                            {event.title || event.kind || '系統事件'}
                          </div>
                          <div className="text-sm text-muted mt-1">
                            {event.description || '無描述'}
                          </div>
                          {event.actor && (
                            <div className="text-xs text-muted mt-1">
                              來源: {event.actor}
                            </div>
                          )}
                          {event.target && (
                            <div className="text-xs text-muted mt-1">
                              服務: {event.target}
                            </div>
                          )}
                          {event.error && (
                            <div className="text-sm text-red-600 mt-1">
                              {event.error}
                            </div>
                          )}
                          <div className="text-xs text-muted mt-2">
                            {event.ts ? new Date(event.ts).toLocaleString() : '時間未知'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>近期無系統狀態記錄</p>
                    <p className="text-xs mt-1">所有服務運行正常，無異常事件</p>
                  </div>
                )}
              </div>
            </div>

            {/* 主機運行狀況 */}
            <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  <h2 className="text-lg font-semibold dual-text">主機運行狀況</h2>
                </div>
              </div>
              
              <div className="p-4">
                {data.system ? (
                  <div className="space-y-6">
                    {/* 系統基本資訊 - 手機端隱藏 */}
                    <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {data.system.hostname && (
                        <div className="bg-surface-hover rounded-lg p-3">
                          <div className="text-xs text-muted mb-1">主機名稱</div>
                          <div className="text-sm font-mono text-fg">{data.system.hostname}</div>
                        </div>
                      )}
                      {data.system.platform && (
                        <div className="bg-surface-hover rounded-lg p-3">
                          <div className="text-xs text-muted mb-1">作業系統</div>
                          <div className="text-sm font-mono text-fg line-clamp-2">{data.system.platform}</div>
                        </div>
                      )}
                      {data.system.uptime && (
                        <div className="bg-surface-hover rounded-lg p-3">
                          <div className="text-xs text-muted mb-1">運行時間</div>
                          <div className="text-sm font-mono text-fg">{Math.floor(data.system.uptime / 3600)}小時 {Math.floor((data.system.uptime % 3600) / 60)}分鐘</div>
                        </div>
                      )}
                      {data.system.loadavg && (
                        <div className="bg-surface-hover rounded-lg p-3">
                          <div className="text-xs text-muted mb-1">系統負載</div>
                          <div className="text-sm font-mono text-fg">
                            {data.system.loadavg["1m"].toFixed(2)} / {data.system.loadavg["5m"].toFixed(2)} / {data.system.loadavg["15m"].toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 資源使用狀況 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* CPU 使用率 */}
                      {data.system.cpu_percent != null && (
                        <div className="bg-surface-hover rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-sm text-fg">CPU 使用率</h3>
                            <span className="text-lg font-bold text-fg">{data.system.cpu_percent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                              className={`h-3 rounded-full transition-all ${
                                data.system.cpu_percent > 80 ? 'bg-red-500' : 
                                data.system.cpu_percent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(data.system.cpu_percent, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted mt-2">
                            <span>0%</span>
                            <span>100%</span>
                          </div>
                        </div>
                      )}

                      {/* 記憶體使用率 */}
                      {data.system.memory && (
                        <div className="bg-surface-hover rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-sm text-fg">記憶體使用率</h3>
                            <span className="text-lg font-bold text-fg">{data.system.memory.percent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                              className={`h-3 rounded-full transition-all ${
                                data.system.memory.percent > 80 ? 'bg-red-500' : 
                                data.system.memory.percent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(data.system.memory.percent, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted mt-2">
                            <span>{Math.round(data.system.memory.available / 1024 / 1024 / 1024)}GB 可用</span>
                            <span>{Math.round(data.system.memory.total / 1024 / 1024 / 1024)}GB 總計</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 指標卡片 - 手機端簡化為2列 */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* 使用者總數 */}
                      <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full bg-primary"></div>
                          <h3 className="font-medium text-xs sm:text-sm text-fg">使用者總數</h3>
                        </div>
                        <div className="text-lg font-bold text-fg">
                          {data.user_stats ? data.user_stats.total : 'N/A'}
                        </div>
                        <div className="text-xs text-muted">註冊用戶</div>
                      </div>

                      {/* 佇列任務 */}
                      <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <h3 className="font-medium text-xs sm:text-sm text-fg">佇列任務</h3>
                        </div>
                        <div className="text-lg font-bold text-fg">
                          {data.queue?.size || 0}
                        </div>
                        <div className="text-xs text-muted">待處理</div>
                      </div>

                      {/* 資料庫服務狀態 */}
                      <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-full ${
                            data.system?.db_cpu_percent !== undefined && data.system?.db_cpu_percent !== null 
                              ? 'bg-green-500' : 'bg-gray-400'
                          }`}></div>
                          <h3 className="font-medium text-xs sm:text-sm text-fg">資料庫</h3>
                        </div>
                        <div className={`text-lg font-bold ${
                          data.system?.db_cpu_percent !== undefined && data.system?.db_cpu_percent !== null 
                            ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {data.system?.db_cpu_percent !== undefined && data.system?.db_cpu_percent !== null ? '運行中' : 'N/A'}
                        </div>
                        <div className="text-xs text-muted">服務狀態</div>
                      </div>

                      {/* CDN 服務狀態 */}
                      <div className="bg-surface-hover rounded-lg p-3 sm:p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-full ${
                            data.system?.cdn_cpu_percent !== undefined && data.system?.cdn_cpu_percent !== null 
                              ? 'bg-green-500' : 'bg-gray-400'
                          }`}></div>
                          <h3 className="font-medium text-xs sm:text-sm text-fg">CDN</h3>
                        </div>
                        <div className={`text-lg font-bold ${
                          data.system?.cdn_cpu_percent !== undefined && data.system?.cdn_cpu_percent !== null 
                            ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {data.system?.cdn_cpu_percent !== undefined && data.system?.cdn_cpu_percent !== null ? '運行中' : 'N/A'}
                        </div>
                        <div className="text-xs text-muted">服務狀態</div>
                      </div>


                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted">
                    <Activity className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">無法獲取主機運行狀況</p>
                    <p className="text-sm">系統可能未安裝 psutil 套件或權限不足</p>
                    <p className="text-xs mt-2">請聯繫系統管理員檢查系統監控配置</p>
                  </div>
                )}
              </div>
            </div>

            {/* 原始 JSON 數據（開發用） - 手機端隱藏 */}
            <details className="hidden lg:block mt-6">
              <summary className="cursor-pointer text-sm text-muted hover:text-fg transition-colors">
                🔧 查看原始 JSON 數據（開發用）
              </summary>
              <div className="mt-3 bg-gray-900 rounded-xl p-4 overflow-auto">
                <pre className="text-xs text-green-400 whitespace-pre-wrap break-words">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </details>
          </>
        ) : null}
      </main>
    </div>
  )
}
