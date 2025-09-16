import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { canSetMode, getRole, getRoleDisplayName, canAccessAnnouncements } from '@/utils/auth'
import { LayoutDashboard, ShieldCheck, MessagesSquare, Users, Building2, Network, Wrench, LifeBuoy, MessageSquareDot, Activity, Server, Crown, BarChart3, Instagram, Type } from 'lucide-react'
import { MobileAdminDashboard } from '@/components/mobile/admin'

export default function AdminDashboard() {
  const role = getRole()
  const [isMobile, setIsMobile] = useState(false)

  // 檢測螢幕尺寸
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const Card = ({ to, title, desc, icon: Icon, disabled }: { to: string; title: string; desc: string; icon: any; disabled?: boolean }) => (
    <Link to={disabled ? '#' : to} className={`p-4 rounded-2xl border border-border bg-surface shadow-soft flex items-start gap-3 hover:bg-surface/80 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-border flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold dual-text">{title}</div>
        <div className="text-sm text-muted truncate">{desc}</div>
      </div>
    </Link>
  )

  // 如果是手機螢幕，使用手機版介面
  if (isMobile) {
    return <MobileAdminDashboard />
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin" />
      <MobileBottomNav />

      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center gap-3 mb-1">
            <LayoutDashboard className="w-5 h-5" />
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">後台主控台</h1>
          </div>
          <div className="text-sm text-muted">角色：{getRoleDisplayName(role)}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card to="/admin/moderation" title="審核管理" desc="待審核貼文、今日已處理、待處理請求" icon={ShieldCheck} />
          <Card to="/admin/comments" title="留言監控" desc="留言審核、統計分析、篩選搜尋與 CSV 匯出" icon={MessagesSquare} />
          {/* 聊天室快捷卡片 */}
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
          {/* 公告發佈入口移除：公告改由一般發文流程勾選「公告貼文」並依角色控制範圍 */}
          
          {/* Instagram 整合管理 */}
          {['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '') && (
            <Card to="/admin/instagram" title="Instagram 整合" desc="帳號管理、模板設定、發布狀態與統計" icon={Instagram} />
          )}
          
          {/* 字體管理 - dev_admin 完整權限，campus_admin 可申請，cross_admin 唯讀 */}
          {role === 'dev_admin' ? (
            <Card to="/admin/fonts" title="字體管理" desc="上傳中文字體、預覽效果、支援圖片生成" icon={Type} />
          ) : role === 'campus_admin' ? (
            <Card to="/admin/fonts" title="字體管理" desc="申請新字體、檢視可用字體、查看申請狀態" icon={Type} />
          ) : role === 'cross_admin' ? (
            <Card to="/admin/fonts" title="字體管理" desc="檢視可用字體列表、預覽效果" icon={Type} disabled={true} />
          ) : null}
        </div>
      </main>
    </div>
  )
}
