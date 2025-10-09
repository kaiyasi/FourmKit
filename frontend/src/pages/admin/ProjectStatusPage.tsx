import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  Activity, 
  Users,
  MessageSquare,
  School,
  RefreshCw,
  Clock,
  TrendingUp,
  Globe,
  BarChart3,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  User,
  Book,
  Hash,
  Bot,
  Server,
  Database,
  Cloud
} from 'lucide-react'

interface ProjectStats {
  schools: {
    total: number
    active: number
    newThisWeek: number
  }
  users: {
    total: number
    activeThisWeek: number
    newThisWeek: number
    retention30d: number
  }
  posts: {
    total: number
    todayCount: number
    thisWeekCount: number
    avgDailyPosts: number
  }
  integrations: {
    discord: {
      connected: boolean
      serverCount: number
      lastHeartbeat: string | null
    }
    cdn: {
      connected: boolean
      usage: number
      lastCheck: string | null
    }
  }
  performance: {
    avgResponseTime: number
    errorRate: number
    uptime: number
  }
}

export default function ProjectStatusPage() {
  const navigate = useNavigate()
  const { isLoggedIn, role } = useAuth()
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // 檢查權限
  useEffect(() => {
    if (!isLoggedIn || !['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '')) {
      navigate('/403')
      return
    }
    
    fetchProjectStats()
  }, [isLoggedIn, role, navigate])

  const fetchProjectStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/status/project/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
        setLastUpdate(new Date())
      } else {
        throw new Error('獲取專案狀態失敗')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
  }

  const getStatusColor = (status: boolean | number): string => {
    if (typeof status === 'boolean') {
      return status ? 'text-green-600' : 'text-red-600'
    }
    // 數值狀態 (如錯誤率)
    if (status > 5) return 'text-red-600'
    if (status > 1) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle className="w-4 h-4 text-green-600" />
    ) : (
      <XCircle className="w-4 h-4 text-red-600" />
    )
  }

  const StatsCard = ({ 
    title, 
    value, 
    trend, 
    description, 
    icon: Icon,
    color = 'blue'
  }: { 
    title: string
    value: string | number
    trend?: number
    description: string
    icon: any
    color?: 'blue' | 'green' | 'purple' | 'orange'
  }) => {
    const colorClasses = {
      blue: 'bg-blue-50 border-blue-200 text-blue-800',
      green: 'bg-green-50 border-green-200 text-green-800',
      purple: 'bg-purple-50 border-purple-200 text-purple-800',
      orange: 'bg-orange-50 border-orange-200 text-orange-800'
    }

    return (
      <div className={`p-4 rounded-xl border ${colorClasses[color]} transition-all hover:shadow-medium`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            <h3 className="font-medium text-sm">{title}</h3>
          </div>
          {trend !== undefined && (
            <div className={`flex items-center text-xs ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              <TrendingUp className={`w-3 h-3 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        
        <div className="text-2xl font-bold mb-1">
          {typeof value === 'number' ? formatNumber(value) : value}
        </div>
        
        <p className="text-xs opacity-80">{description}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/project" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
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
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold dual-text mb-2">專案空間狀態</h1>
              <p className="text-sm text-muted">監控 ForumKit 專案運營狀況和業務指標</p>
            </div>
            
            <div className="flex items-center gap-3">
              {lastUpdate && (
                <div className="hidden sm:flex text-xs text-muted items-center gap-1">
                  <Clock className="w-3 h-3" />
                  更新於 {lastUpdate.toLocaleTimeString()}
                </div>
              )}
              <button 
                onClick={fetchProjectStats}
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

        {loading && !stats ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-soft">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-muted">載入專案狀態中...</p>
          </div>
        ) : stats ? (
          <>
            {/* 核心業務指標 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatsCard
                title="學校總數"
                value={stats.schools.total}
                trend={((stats.schools.newThisWeek / Math.max(stats.schools.total - stats.schools.newThisWeek, 1)) * 100)}
                description={`本週新增 ${stats.schools.newThisWeek} 所學校`}
                icon={School}
                color="blue"
              />
              
              <StatsCard
                title="總用戶數"
                value={stats.users.total}
                trend={((stats.users.newThisWeek / Math.max(stats.users.total - stats.users.newThisWeek, 1)) * 100)}
                description={`本週新增 ${stats.users.newThisWeek} 位用戶`}
                icon={Users}
                color="green"
              />
              
              <StatsCard
                title="總貼文數"
                value={stats.posts.total}
                trend={((stats.posts.thisWeekCount / Math.max(stats.posts.total - stats.posts.thisWeekCount, 1)) * 100)}
                description={`今日發布 ${stats.posts.todayCount} 篇貼文`}
                icon={MessageSquare}
                color="purple"
              />
              
              <StatsCard
                title="平台穩定性"
                value={`${stats.performance.uptime.toFixed(1)}%`}
                description={`錯誤率 ${stats.performance.errorRate.toFixed(2)}%`}
                icon={Activity}
                color="orange"
              />
            </div>

            {/* 用戶活動分析 */}
            <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <h2 className="text-lg font-semibold dual-text">用戶活動分析</h2>
                </div>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-2">
                      {formatNumber(stats.users.activeThisWeek)}
                    </div>
                    <div className="text-sm text-muted mb-1">本週活躍用戶</div>
                    <div className="text-xs text-green-600">
                      佔總用戶 {((stats.users.activeThisWeek / stats.users.total) * 100).toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 mb-2">
                      {stats.users.retention30d.toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted mb-1">30天留存率</div>
                    <div className="text-xs text-blue-600">用戶黏著度指標</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-2">
                      {formatNumber(stats.posts.avgDailyPosts)}
                    </div>
                    <div className="text-sm text-muted mb-1">日均發文量</div>
                    <div className="text-xs text-orange-600">內容活躍度</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 整合服務狀態 */}
            <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  <h2 className="text-lg font-semibold dual-text">整合服務狀態</h2>
                </div>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                  {/* Discord Bot */}
                  <div className="bg-surface-hover rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-medium text-sm">Discord Bot</h3>
                      </div>
                      {getStatusIcon(stats.integrations.discord.connected)}
                    </div>
                    <div className="text-sm text-muted space-y-1">
                      <div>伺服器數: {stats.integrations.discord.serverCount}</div>
                      <div>最後心跳: {stats.integrations.discord.lastHeartbeat ? 
                        new Date(stats.integrations.discord.lastHeartbeat).toLocaleString() : 
                        '離線'}
                      </div>
                    </div>
                  </div>

                  {/* CDN 狀態 */}
                  <div className="bg-surface-hover rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-5 h-5 text-blue-500" />
                        <h3 className="font-medium text-sm">CDN 服務</h3>
                      </div>
                      {getStatusIcon(stats.integrations.cdn.connected)}
                    </div>
                    <div className="text-sm text-muted space-y-1">
                      <div>使用量: {stats.integrations.cdn.usage}%</div>
                      <div>最後檢查: {stats.integrations.cdn.lastCheck ? 
                        new Date(stats.integrations.cdn.lastCheck).toLocaleString() : 
                        '未檢查'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 性能指標 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-surface-hover rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-5 h-5 text-green-500" />
                  <h3 className="font-medium text-sm">平均回應時間</h3>
                </div>
                <div className="text-2xl font-bold text-fg mb-1">
                  {stats.performance.avgResponseTime}ms
                </div>
                <div className={`text-xs ${getStatusColor(stats.performance.avgResponseTime > 1000)}`}>
                  {stats.performance.avgResponseTime > 1000 ? '需要優化' : '表現良好'}
                </div>
              </div>

              <div className="bg-surface-hover rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <h3 className="font-medium text-sm">錯誤率</h3>
                </div>
                <div className="text-2xl font-bold text-fg mb-1">
                  {stats.performance.errorRate.toFixed(2)}%
                </div>
                <div className={`text-xs ${getStatusColor(stats.performance.errorRate)}`}>
                  {stats.performance.errorRate > 5 ? '偏高' : stats.performance.errorRate > 1 ? '中等' : '良好'}
                </div>
              </div>

              <div className="bg-surface-hover rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <h3 className="font-medium text-sm">服務可用性</h3>
                </div>
                <div className="text-2xl font-bold text-fg mb-1">
                  {stats.performance.uptime.toFixed(2)}%
                </div>
                <div className={`text-xs ${getStatusColor(stats.performance.uptime > 99)}`}>
                  {stats.performance.uptime > 99 ? '優秀' : stats.performance.uptime > 95 ? '良好' : '需要改善'}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}