import React from 'react'
import { Link } from 'react-router-dom'
import { getRole, getRoleDisplayName, canSetMode } from '@/utils/auth'
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
  BarChart3,
  Instagram,
  Type,
  LayoutDashboard
} from 'lucide-react'

export function MobileAdminDashboard() {
  const role = getRole()

  const Card = ({ to, title, desc, icon: Icon, disabled }: { 
    to: string
    title: string
    desc: string
    icon: any
    disabled?: boolean 
  }) => (
    <Link 
      to={disabled ? '#' : to} 
      className={`
        p-4 rounded-2xl border border-border bg-surface shadow-soft 
        flex items-start gap-3 hover:bg-surface/80 transition-colors
        ${disabled ? 'opacity-60 pointer-events-none' : ''}
      `}
    >
      <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-border flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold dual-text">{title}</div>
        <div className="text-sm text-muted truncate">{desc}</div>
      </div>
    </Link>
  )

  return (
    <MobileAdminLayout
      title="後台管理"
      subtitle={`角色：${getRoleDisplayName(role)}`}
      showBack={false}
      showNotifications={true}
    >
      {/* 管理功能卡片 - 垂直排列，簡潔版本 */}
      <div className="space-y-3">
        <Card to="/admin/moderation" title="審核管理" desc="待審核貼文、今日已處理、待處理請求" icon={ShieldCheck} />
        <Card to="/admin/comments" title="留言監控" desc="留言審核、統計分析、篩選搜尋與 CSV 匯出" icon={MessagesSquare} />
        <Card to="/admin/chat" title="聊天室" desc="待處理請求、即時溝通、支援自訂聊天室" icon={MessageSquareDot} />
        
        {/* 客服管理卡片 - 三個 _admin 可操作，其他管理角色唯讀 */}
        {['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '') ? (
          <Card to="/admin/support" title="客服管理" desc="支援單審核、狀態管理、訊息回覆與統計報表" icon={LifeBuoy} />
        ) : ['campus_moderator', 'cross_moderator'].includes(role || '') ? (
          <Card to="/admin/support" title="客服管理" desc="支援單審核、狀態管理、訊息回覆與統計報表" icon={LifeBuoy} disabled={true} />
        ) : null}
        
        <Card to="/mode" title="模式管理" desc="維護/開發/測試/正常模式切換與規則設定" icon={Wrench} disabled={!canSetMode()} />

        {/* 事件記錄卡片 - 僅 dev_admin 可見 */}
        {role === 'dev_admin' && (
          <Card to="/admin/events" title="事件記錄" desc="系統事件日誌、操作記錄、審計追蹤" icon={Activity} />
        )}

        {/* 專案空間狀態卡片 - 三個 _admin 可見 */}
        {['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '') && (
          <Card to="/admin/project" title="專案空間狀態" desc="用戶活動、內容統計、整合服務狀態" icon={BarChart3} />
        )}
        
        {/* 伺服器狀態卡片 - 僅 dev_admin 可見 */}
        {role === 'dev_admin' && (
          <Card to="/admin/platform" title="伺服器狀態" desc="系統資源、服務運行時間、技術指標" icon={Server} />
        )}
        
        {role === 'dev_admin' && (
          <Card to="/admin/members" title="會員管理" desc="會員訂閱管理、廣告貼文審核、用戶狀態管理" icon={Crown} />
        )}

        {/* 系統管理面板 */}
        {role === 'dev_admin' ? (
          <Card to="/admin/users" title="使用者管理" desc="檢視與搜尋、重設密碼、角色指派" icon={Users} />
        ) : ['campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator'].includes(role || '') ? (
          <Card to="/admin/users" title="使用者管理" desc="檢視與搜尋、重設密碼、角色指派" icon={Users} disabled={true} />
        ) : null}
        
        <Card to="/admin/schools" title="學校管理" desc="清單、新增、重新命名" icon={Building2} />
        <Card to="/admin/integrations" title="整合狀態" desc="平台監控（佇列 / 系統）" icon={Network} />
        
        {/* 整合入口：Discord（占位） */}
        {role === 'dev_admin' ? (
          <Card to="#" title="Discord 整合" desc="Webhook / Bot（開發中）" icon={LifeBuoy} disabled={true} />
        ) : null}
        
        <Card to="/admin/pages" title="頁面內容（Markdown）" desc="關於/版規 的維護與即時預覽" icon={LayoutDashboard} />
        
        {/* Instagram 整合管理 */}
        {['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '') && (
          <Card to="/admin/instagram" title="Instagram 整合" desc="帳號管理、模板設定、發布狀態與統計" icon={Instagram} />
        )}
        
        {/* 字體管理 - 僅 dev_admin 可見 */}
        {role === 'dev_admin' && (
          <Card to="/admin/fonts" title="字體管理" desc="上傳中文字體、預覽效果、支援圖片生成" icon={Type} />
        )}
      </div>
    </MobileAdminLayout>
  )
}