import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
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
  BarChart3,
  Settings,
  Bell,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Target,
  Shield,
  HeadphonesIcon,
  FileText,
  Calendar,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  ArrowLeft,
  ArrowUpRight,
  TrendingDown,
  Eye,
  UserCheck,
  MessageCircle,
  Heart,
  Star
} from 'lucide-react'
import { canSetMode, getRole, getRoleDisplayName, canAccessAnnouncements } from '@/utils/auth'

export default function AdminDashboardRedesigned() {
  const navigate = useNavigate()
  const role = getRole()
  const [stats, setStats] = useState({
    totalUsers: 1234,
    activeUsers: 856,
    totalPosts: 5678,
    pendingReports: 12,
    newTickets: 8,
    systemHealth: 98.5
  })

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 管理功能卡片組件
  const AdminCard = ({ 
    to, 
    title, 
    desc, 
    icon: Icon, 
    disabled, 
    stats,
    color = "blue",
    urgent = false 
  }: { 
    to: string
    title: string
    desc: string
    icon: any
    disabled?: boolean
    stats?: string
    color?: string
    urgent?: boolean 
  }) => {
    const colorClasses = {
      blue: 'from-blue-500 to-cyan-600',
      green: 'from-green-500 to-emerald-600', 
      purple: 'from-purple-500 to-violet-600',
      orange: 'from-orange-500 to-red-500',
      pink: 'from-pink-500 to-rose-600',
      yellow: 'from-yellow-500 to-orange-500',
      gray: 'from-gray-500 to-slate-600'
    }

    return (
      <Link 
        to={disabled ? '#' : to} 
        className={`group relative overflow-hidden rounded-3xl border border-border bg-surface shadow-soft hover:shadow-medium transition-all duration-300 ${
          disabled ? 'opacity-60 pointer-events-none' : 'hover:scale-105 active:scale-95'
        }`}
      >
        {/* 背景漸層 */}
        <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} opacity-5 group-hover:opacity-10 transition-opacity`}></div>
        
        {urgent && (
          <div className="absolute top-3 right-3 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
        )}
        
        <div className="relative p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center shadow-lg`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
            {stats && (
              <div className="text-right">
                <div className="text-2xl font-bold text-fg">{stats}</div>
                <div className="text-xs text-muted">項目</div>
              </div>
            )}
          </div>
          
          <div>
            <h3 className="font-bold text-lg text-fg mb-2 group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-sm text-muted leading-relaxed">{desc}</p>
          </div>
          
          <div className="absolute bottom-4 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowUpRight className="w-5 h-5 text-primary" />
          </div>
        </div>
      </Link>
    )
  }

  // 統計卡片組件
  const StatCard = ({ title, value, change, icon: Icon, color = "blue" }) => {
    const isPositive = change && parseFloat(change.replace('%', '')) > 0
    const colorClasses = {
      blue: 'from-blue-500 to-cyan-600',
      green: 'from-green-500 to-emerald-600', 
      purple: 'from-purple-500 to-violet-600',
      orange: 'from-orange-500 to-red-500'
    }

    return (
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          {change && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              isPositive 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {change}
            </div>
          )}
        </div>
        <div className="text-2xl font-bold text-fg mb-1">{value}</div>
        <div className="text-sm text-muted">{title}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50/50 to-blue-50/30 dark:from-gray-900 dark:to-slate-800">
      {/* 頂部導航 */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-border">
        <div className="px-4 py-4 pt-safe-top">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-surface-hover rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <button className="p-2 hover:bg-surface-hover rounded-xl transition-colors relative">
                <Bell className="w-6 h-6" />
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white font-bold">{stats.pendingReports}</span>
                </div>
              </button>
              <button className="p-2 hover:bg-surface-hover rounded-xl transition-colors">
                <Settings className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          {/* 頭部資訊 */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-fg mb-1">後台主控台</h1>
              <p className="text-muted">角色：{getRoleDisplayName(role)} • 系統運行正常 ✨</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{stats.systemHealth}%</div>
              <div className="text-xs text-muted">系統健康度</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* 快速統計 */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard 
            title="總用戶數" 
            value={stats.totalUsers.toLocaleString()} 
            change="+12.5%" 
            icon={Users} 
            color="blue" 
          />
          <StatCard 
            title="活躍用戶" 
            value={stats.activeUsers.toLocaleString()} 
            change="+8.2%" 
            icon={UserCheck} 
            color="green" 
          />
          <StatCard 
            title="總貼文數" 
            value={stats.totalPosts.toLocaleString()} 
            change="+15.3%" 
            icon={MessageCircle} 
            color="purple" 
          />
          <StatCard 
            title="待處理請求" 
            value={stats.pendingReports} 
            change="-2.1%" 
            icon={AlertTriangle} 
            color="orange" 
          />
        </div>

        {/* 緊急事項 */}
        {(stats.pendingReports > 0 || stats.newTickets > 0) && (
          <div className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-red-800 dark:text-red-400">需要立即處理</h3>
                <p className="text-sm text-red-600 dark:text-red-500">有緊急事項需要您的關注</p>
              </div>
            </div>
            <div className="flex gap-2">
              {stats.pendingReports > 0 && (
                <Link 
                  to="/admin/moderation"
                  className="px-3 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  {stats.pendingReports} 個舉報待審
                </Link>
              )}
              {stats.newTickets > 0 && (
                <Link 
                  to="/admin/support"
                  className="px-3 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
                >
                  {stats.newTickets} 個新工單
                </Link>
              )}
            </div>
          </div>
        )}

        {/* 主要功能區 */}
        <div>
          <h2 className="text-lg font-bold text-fg mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            核心管理功能
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <AdminCard 
              to="/admin/moderation" 
              title="審核管理" 
              desc="待審核貼文、今日已處理、待處理請求" 
              icon={ShieldCheck}
              stats={stats.pendingReports.toString()}
              color="blue"
              urgent={stats.pendingReports > 0}
            />
            
            <AdminCard 
              to="/admin/comments" 
              title="留言監控" 
              desc="留言審核、統計分析、篩選搜尋與 CSV 匯出" 
              icon={MessagesSquare}
              color="green"
            />
            
            <AdminCard 
              to="/admin/chat" 
              title="聊天室" 
              desc="待處理請求、即時溝通、支援自訂聊天室" 
              icon={MessageSquareDot}
              color="purple"
            />
            
            {/* 客服管理卡片 - 三個 _admin 可操作，其他管理角色唯讀 */}
            {['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '') ? (
              <AdminCard 
                to="/admin/support" 
                title="客服管理" 
                desc="支援單審核、狀態管理、訊息回覆與統計報表" 
                icon={LifeBuoy}
                stats={stats.newTickets.toString()}
                color="orange"
                urgent={stats.newTickets > 0}
              />
            ) : ['campus_moderator', 'cross_moderator'].includes(role || '') ? (
              <AdminCard 
                to="/admin/support" 
                title="客服管理" 
                desc="支援單審核、狀態管理、訊息回覆與統計報表" 
                icon={LifeBuoy}
                color="gray"
                disabled={true} 
              />
            ) : null}
          </div>
        </div>

        {/* 系統管理功能 */}
        <div>
          <h2 className="text-lg font-bold text-fg mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            系統管理
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <AdminCard 
              to="/mode" 
              title="模式管理" 
              desc="維護/開發/測試模式切換" 
              icon={Wrench}
              color="yellow"
              disabled={!canSetMode()} 
            />
            
            {role === 'dev_admin' && (
              <AdminCard 
                to="/admin/events" 
                title="事件記錄" 
                desc="系統事件日誌、操作記錄" 
                icon={Activity}
                color="purple"
              />
            )}
            
            {['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '') && (
              <AdminCard 
                to="/admin/project" 
                title="專案空間狀態" 
                desc="用戶活動、內容統計" 
                icon={BarChart3}
                color="green"
              />
            )}
            
            {role === 'dev_admin' && (
              <AdminCard 
                to="/admin/platform" 
                title="伺服器狀態" 
                desc="系統資源、運行時間" 
                icon={Server}
                color="blue"
              />
            )}
            
            {role === 'dev_admin' && (
              <AdminCard 
                to="/admin/members" 
                title="會員管理" 
                desc="會員訂閱、廣告審核" 
                icon={Crown}
                color="pink"
              />
            )}
          </div>
        </div>

        {/* 用戶與內容管理 */}
        <div>
          <h2 className="text-lg font-bold text-fg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            用戶與內容
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {role === 'dev_admin' ? (
              <AdminCard 
                to="/admin/users" 
                title="使用者管理" 
                desc="檢視與搜尋、重設密碼、角色指派" 
                icon={Users}
                stats={stats.totalUsers.toString()}
                color="blue"
              />
            ) : ['campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator'].includes(role || '') ? (
              <AdminCard 
                to="/admin/users" 
                title="使用者管理" 
                desc="檢視與搜尋、重設密碼、角色指派" 
                icon={Users}
                color="gray"
                disabled={true} 
              />
            ) : null}
            
            <AdminCard 
              to="/admin/schools" 
              title="學校管理" 
              desc="清單、新增、重新命名" 
              icon={Building2}
              color="green"
            />
            
            <AdminCard 
              to="/admin/integrations" 
              title="整合狀態" 
              desc="平台監控（佇列 / 系統）" 
              icon={Network}
              color="purple"
            />
          </div>
        </div>

        {/* 快速操作區域 */}
        <div className="bg-surface border border-border rounded-3xl p-6 shadow-soft">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-fg">快速操作</h3>
              <p className="text-sm text-muted">常用管理功能快捷方式</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <button className="flex flex-col items-center gap-2 p-4 hover:bg-surface-hover rounded-2xl transition-colors">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Eye className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs text-muted text-center">系統監控</span>
            </button>
            
            <button className="flex flex-col items-center gap-2 p-4 hover:bg-surface-hover rounded-2xl transition-colors">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-xs text-muted text-center">匯出報告</span>
            </button>
            
            <button className="flex flex-col items-center gap-2 p-4 hover:bg-surface-hover rounded-2xl transition-colors">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-xs text-muted text-center">排程任務</span>
            </button>
          </div>
        </div>

        {/* 系統狀態概覽 */}
        <div className="bg-surface border border-border rounded-3xl p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-fg">系統狀態</h3>
                <p className="text-sm text-muted">即時監控系統運行狀況</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">運行正常</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-fg">伺服器負載</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-green-600 dark:text-green-400">32%</div>
                <div className="text-xs text-muted">正常</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-fg">資料庫連線</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-green-600 dark:text-green-400">穩定</div>
                <div className="text-xs text-muted">15ms</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl">
              <div className="flex items-center gap-3">
                <HeadphonesIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <span className="font-medium text-fg">API 回應時間</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-orange-600 dark:text-orange-400">245ms</div>
                <div className="text-xs text-muted">良好</div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部間距 */}
        <div className="h-20"></div>
      </div>
    </div>
  )
}