import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getRole, getRoleDisplayName } from '@/utils/auth'
import { MobileAdminLayout } from './MobileAdminLayout'
import { 
  ShieldCheck, 
  MessagesSquare, 
  Users, 
  Building2, 
  Network, 
  Wrench, 
  LifeBuoy, 
  MessageSquareDot, 
  Activity, 
  Server, 
  Crown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp
} from 'lucide-react'

interface AdminStat {
  label: string
  value: number | string
  color: string
  trend?: 'up' | 'down' | 'neutral'
}

interface AdminCard {
  id: string
  to: string
  title: string
  desc: string
  icon: any
  disabled?: boolean
  badge?: {
    text: string
    color: 'red' | 'yellow' | 'green' | 'blue' | 'gray'
  }
  urgent?: boolean
}

export function MobileAdminDashboard() {
  const navigate = useNavigate()
  const role = getRole()
  const [stats, setStats] = useState<AdminStat[]>([])
  const [loading, setLoading] = useState(false)

  // 根據角色生成管理卡片
  const generateCards = (): AdminCard[] => {
    const baseCards: AdminCard[] = [
      {
        id: 'moderation',
        to: '/admin/moderation',
        title: '審核管理',
        desc: '待審核貼文和處理請求',
        icon: ShieldCheck,
        badge: { text: '12', color: 'red' }
      },
      {
        id: 'comments',
        to: '/admin/comments',
        title: '留言監控',
        desc: '留言審核與統計',
        icon: MessagesSquare,
        badge: { text: '5', color: 'yellow' }
      },
      {
        id: 'chat',
        to: '/admin/chat',
        title: '聊天室',
        desc: '即時溝通管理',
        icon: MessageSquareDot
      }
    ]

    // 客服管理
    if (['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '')) {
      baseCards.push({
        id: 'support',
        to: '/admin/support',
        title: '客服管理',
        desc: '支援單處理',
        icon: LifeBuoy,
        badge: { text: '3', color: 'blue' }
      })
    }

    // 系統管理 - 僅開發管理員
    if (role === 'dev_admin') {
      baseCards.push(
        {
          id: 'events',
          to: '/admin/events',
          title: '事件記錄',
          desc: '系統事件與審計',
          icon: Activity
        },
        {
          id: 'platform',
          to: '/admin/platform',
          title: '平台狀態',
          desc: '系統監控',
          icon: Server,
          urgent: true
        },
        {
          id: 'members',
          to: '/admin/members',
          title: '會員管理',
          desc: '訂閱與廣告審核',
          icon: Crown
        }
      )
    }

    // 其他功能
    baseCards.push(
      {
        id: 'users',
        to: '/admin/users',
        title: '使用者管理',
        desc: '用戶角色管理',
        icon: Users,
        disabled: role !== 'dev_admin'
      },
      {
        id: 'schools',
        to: '/admin/schools',
        title: '學校管理',
        desc: '學校清單維護',
        icon: Building2
      },
      {
        id: 'integrations',
        to: '/admin/integrations',
        title: '整合狀態',
        desc: 'Webhook 和服務狀態',
        icon: Network
      }
    )

    return baseCards
  }

  const cards = generateCards()

  // 模擬載入統計數據
  useEffect(() => {
    setLoading(true)
    // 模擬 API 調用
    setTimeout(() => {
      setStats([
        { label: '待審核', value: 12, color: 'text-red-600', trend: 'up' },
        { label: '今日處理', value: 45, color: 'text-green-600', trend: 'up' },
        { label: '支援單', value: 3, color: 'text-blue-600', trend: 'neutral' },
        { label: '在線用戶', value: 128, color: 'text-purple-600', trend: 'up' }
      ])
      setLoading(false)
    }, 1000)
  }, [])

  const getBadgeColor = (color: string) => {
    const colors = {
      red: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300',
      yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
      green: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
      gray: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300'
    }
    return colors[color as keyof typeof colors] || colors.gray
  }

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-3 h-3 text-green-500" />
      case 'down': return <TrendingUp className="w-3 h-3 text-red-500 rotate-180" />
      default: return null
    }
  }

  return (
    <MobileAdminLayout
      title="後台管理"
      subtitle={`角色：${getRoleDisplayName(role)}`}
      showBack={false}
      showNotifications={true}
    >
      {/* 快速統計 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-surface rounded-2xl p-4 border border-border animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2" />
              <div className="h-6 bg-gray-200 rounded" />
            </div>
          ))
        ) : (
          stats.map((stat, index) => (
            <div key={index} className="bg-surface rounded-2xl p-4 border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted">{stat.label}</span>
                {getTrendIcon(stat.trend)}
              </div>
              <div className={`text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 緊急通知 */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 dark:bg-red-900/10 dark:border-red-800/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">需要注意</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              有 12 個待審核項目需要處理，3 個支援單等待回覆
            </p>
            <Link
              to="/admin/moderation"
              className="inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400"
            >
              立即處理 <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* 管理功能卡片 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-fg mb-3">管理功能</h2>
        
        {cards.map((card) => {
          const Icon = card.icon
          
          return (
            <Link
              key={card.id}
              to={card.disabled ? '#' : card.to}
              className={`
                block bg-surface border border-border rounded-2xl p-4 transition-all
                ${card.disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-surface-hover active:scale-[0.98]'
                }
                ${card.urgent ? 'ring-2 ring-red-500/20 bg-red-50/50 dark:bg-red-900/5' : ''}
              `}
              onClick={(e) => card.disabled && e.preventDefault()}
            >
              <div className="flex items-center gap-4">
                <div className={`
                  p-3 rounded-xl border border-border flex-shrink-0
                  ${card.urgent ? 'bg-red-100 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-surface-hover'}
                `}>
                  <Icon className={`w-5 h-5 ${card.urgent ? 'text-red-600' : 'text-fg'}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-fg truncate">{card.title}</h3>
                    {card.badge && (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getBadgeColor(card.badge.color)}`}>
                        {card.badge.text}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted truncate">{card.desc}</p>
                </div>
                
                {!card.disabled && (
                  <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* 快速操作 */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-lg font-semibold text-fg mb-4">快速操作</h3>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => navigate('/admin/moderation?filter=pending')}
            className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center hover:bg-blue-100 transition-colors dark:bg-blue-900/10 dark:border-blue-800/30"
          >
            <ShieldCheck className="w-6 h-6 text-blue-600 mx-auto mb-1" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-200">審核待辦</span>
          </button>
          
          <button 
            onClick={() => navigate('/admin/support?status=awaiting_admin')}
            className="bg-green-50 border border-green-200 rounded-xl p-3 text-center hover:bg-green-100 transition-colors dark:bg-green-900/10 dark:border-green-800/30"
          >
            <LifeBuoy className="w-6 h-6 text-green-600 mx-auto mb-1" />
            <span className="text-sm font-medium text-green-900 dark:text-green-200">支援回覆</span>
          </button>
        </div>
      </div>
    </MobileAdminLayout>
  )
}