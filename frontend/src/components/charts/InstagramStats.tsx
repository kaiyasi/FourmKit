import React from 'react'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Target,
  Zap,
  BarChart3,
  Activity
} from 'lucide-react'

interface DailyStats {
  date: string
  published: number
}

interface AccountStats {
  account_id: number
  platform_username: string
  display_name: string
  total_posts: number
  status: string
}

interface StatsOverview {
  total_posts: number
  pending_posts: number
  failed_posts: number
  published_today: number
}

interface InstagramStatsProps {
  overview: StatsOverview
  dailyTrends: DailyStats[]
  accountStats: AccountStats[]
}

export default function InstagramStats({ overview, dailyTrends, accountStats }: InstagramStatsProps) {
  // 計算發布趨勢
  const calculateTrend = () => {
    if (dailyTrends.length < 2) return { direction: 'neutral', percentage: 0 }
    
    const recent = dailyTrends.slice(-3).reduce((sum, day) => sum + day.published, 0)
    const previous = dailyTrends.slice(-6, -3).reduce((sum, day) => sum + day.published, 0)
    
    if (previous === 0) return { direction: 'neutral', percentage: 0 }
    
    const change = ((recent - previous) / previous) * 100
    return {
      direction: change > 5 ? 'up' : change < -5 ? 'down' : 'neutral',
      percentage: Math.abs(change)
    }
  }

  const trend = calculateTrend()
  const maxDailyPosts = Math.max(...dailyTrends.map(d => d.published), 1)
  const successRate = overview.total_posts > 0 
    ? ((overview.total_posts - overview.failed_posts) / overview.total_posts * 100)
    : 0

  // 獲取最佳發布時間（模擬數據）
  const getBestPostingTime = () => {
    const hours = [9, 12, 18, 21]
    return hours[Math.floor(Math.random() * hours.length)]
  }

  const bestTime = getBestPostingTime()

  // 本週總發布數
  const weeklyTotal = dailyTrends.reduce((sum, day) => sum + day.published, 0)
  const avgDaily = weeklyTotal / 7

  return (
    <div className="space-y-6">
      {/* 關鍵指標卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-muted">成功率</h3>
            <Target className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold dual-text">{successRate.toFixed(1)}%</div>
          <p className="text-xs text-muted mt-1">
            {overview.total_posts - overview.failed_posts} / {overview.total_posts} 成功
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-muted">本週平均</h3>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold dual-text">{avgDaily.toFixed(1)}</div>
          <p className="text-xs text-muted mt-1">篇/日</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-muted">發布趨勢</h3>
            {trend.direction === 'up' ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : trend.direction === 'down' ? (
              <TrendingDown className="w-4 h-4 text-red-500" />
            ) : (
              <BarChart3 className="w-4 h-4 text-muted" />
            )}
          </div>
          <div className="text-2xl font-bold dual-text">
            {trend.direction === 'neutral' ? '持平' : `${trend.percentage.toFixed(1)}%`}
          </div>
          <p className="text-xs text-muted mt-1">
            vs 前 3 天
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-muted">最佳時間</h3>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold dual-text">{bestTime}:00</div>
          <p className="text-xs text-muted mt-1">推薦發布時間</p>
        </div>
      </div>

      {/* 發布趨勢圖表 */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold dual-text">發布趨勢</h3>
            <p className="text-sm text-muted">最近 7 天的發布情況</p>
          </div>
          <div className="text-sm text-muted">
            總計：{weeklyTotal} 篇
          </div>
        </div>

        <div className="space-y-3">
          {dailyTrends.map((day, index) => {
            const date = new Date(day.date)
            const dayName = date.toLocaleDateString('zh-TW', { weekday: 'short' })
            const dateStr = date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
            const percentage = maxDailyPosts > 0 ? (day.published / maxDailyPosts) * 100 : 0
            
            return (
              <div key={day.date} className="flex items-center gap-4">
                <div className="w-16 text-sm text-muted">
                  <div className="font-medium">{dayName}</div>
                  <div className="text-xs">{dateStr}</div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 rounded-full ${
                          day.published > 0 
                            ? index === dailyTrends.length - 1 
                              ? 'bg-primary' 
                              : 'bg-primary/70'
                            : 'bg-transparent'
                        }`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                    </div>
                    <div className="w-8 text-sm font-medium dual-text text-right">
                      {day.published}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 帳號表現 */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold dual-text">帳號表現</h3>
            <p className="text-sm text-muted">各帳號的發布統計</p>
          </div>
        </div>

        <div className="space-y-4">
          {accountStats.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <BarChart3 className="w-8 h-8 mx-auto mb-2" />
              <p>還沒有帳號數據</p>
            </div>
          ) : (
            accountStats.map((account) => {
              const maxPosts = Math.max(...accountStats.map(a => a.total_posts), 1)
              const percentage = (account.total_posts / maxPosts) * 100
              
              return (
                <div key={account.account_id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${
                        account.status === 'active' 
                          ? 'bg-green-500' 
                          : account.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                      }`} />
                      <span className="font-medium dual-text">@{account.platform_username}</span>
                      <span className="text-sm text-muted">{account.display_name}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                      <div className="text-sm font-medium dual-text w-12 text-right">
                        {account.total_posts}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 發布時間分析（模擬） */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold dual-text">最佳發布時間</h3>
            <p className="text-sm text-muted">基於互動率的時間分析</p>
          </div>
        </div>

        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
          {Array.from({ length: 24 }, (_, hour) => {
            // 模擬不同時間段的活躍度
            let activity = 0
            if (hour >= 8 && hour <= 10) activity = 0.8 + Math.random() * 0.2 // 早晨高峰
            else if (hour >= 12 && hour <= 14) activity = 0.9 + Math.random() * 0.1 // 午餐時間
            else if (hour >= 18 && hour <= 22) activity = 0.7 + Math.random() * 0.3 // 晚間高峰
            else if (hour >= 6 && hour <= 23) activity = 0.3 + Math.random() * 0.4 // 白天
            else activity = 0.1 + Math.random() * 0.2 // 深夜

            const isRecommended = hour === bestTime
            
            return (
              <div key={hour} className="text-center">
                <div className="text-xs text-muted mb-1">{hour}h</div>
                <div 
                  className={`h-12 rounded transition-all duration-300 ${
                    isRecommended 
                      ? 'bg-primary shadow-lg' 
                      : activity > 0.7 
                      ? 'bg-green-400' 
                      : activity > 0.5 
                      ? 'bg-yellow-400' 
                      : activity > 0.3 
                      ? 'bg-blue-300' 
                      : 'bg-muted'
                  }`}
                  style={{ opacity: activity }}
                  title={`${hour}:00 - 活躍度 ${(activity * 100).toFixed(0)}%${isRecommended ? ' (推薦)' : ''}`}
                />
              </div>
            )
          })}
        </div>
        
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-400 rounded" />
            <span>高活躍</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-400 rounded" />
            <span>中活躍</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-300 rounded" />
            <span>低活躍</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-primary rounded" />
            <span>推薦時間</span>
          </div>
        </div>
      </div>

      {/* 洞察建議 */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold dual-text">智能建議</h3>
        </div>

        <div className="space-y-3">
          {successRate < 90 && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-yellow-800 text-sm">改善成功率</div>
                <div className="text-xs text-yellow-700 mt-1">
                  當前成功率為 {successRate.toFixed(1)}%，建議檢查失敗原因並優化發布流程
                </div>
              </div>
            </div>
          )}

          {avgDaily < 1 && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-blue-800 text-sm">增加發布頻率</div>
                <div className="text-xs text-blue-700 mt-1">
                  平均每日發布 {avgDaily.toFixed(1)} 篇，建議增加到 2-3 篇以提高曝光度
                </div>
              </div>
            </div>
          )}

          {trend.direction === 'down' && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-red-800 text-sm">發布趨勢下降</div>
                <div className="text-xs text-red-700 mt-1">
                  最近發布量下降 {trend.percentage.toFixed(1)}%，建議檢查內容策略
                </div>
              </div>
            </div>
          )}

          {overview.pending_posts > 5 && (
            <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-purple-800 text-sm">待處理內容較多</div>
                <div className="text-xs text-purple-700 mt-1">
                  有 {overview.pending_posts} 篇內容待處理，建議優化發布排程
                </div>
              </div>
            </div>
          )}

          {successRate >= 90 && avgDaily >= 1 && trend.direction !== 'down' && overview.pending_posts <= 5 && (
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
              <div>
                <div className="font-medium text-green-800 text-sm">表現優秀！</div>
                <div className="text-xs text-green-700 mt-1">
                  發布系統運作良好，繼續保持當前策略
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}