import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import { canSetMode, getRole, getRoleDisplayName } from '@/utils/auth'
import { LayoutDashboard, ShieldCheck, MessagesSquare, Users, Building2, Network, Wrench } from 'lucide-react'

export default function AdminDashboard() {
  const role = getRole()

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const Card = ({ to, title, desc, icon: Icon, disabled }: { to: string; title: string; desc: string; icon: any; disabled?: boolean }) => (
    <Link to={disabled ? '#' : to} className={`p-4 rounded-2xl border border-border bg-surface shadow-soft flex items-start gap-3 ${disabled ? 'opacity-60 pointer-events-none' : 'hover:bg-surface/80'}`}>
      <div className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-border">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold dual-text">{title}</div>
        <div className="text-sm text-muted hidden sm:block">{desc}</div>
        <div className="text-xs text-muted sm:hidden">{desc.split('、')[0]}...</div>
      </div>
    </Link>
  )

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin" />
      <MobileFabNav />

      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center gap-3 mb-1">
            <LayoutDashboard className="w-5 h-5" />
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">後台主控台</h1>
          </div>
          <div className="text-sm text-muted">角色：{getRoleDisplayName(role)}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card to="/admin/moderation" title="審核管理" desc="查看待審、詳情預覽、批次核准/退件、日誌匯出" icon={ShieldCheck} />
          <Card to="/admin/comments" title="留言監控" desc="留言審核、統計分析、篩選搜尋與 CSV 匯出" icon={MessagesSquare} />
          <Card to="/mode" title="模式管理" desc="維護/開發/測試/正常模式切換與規則設定" icon={Wrench} disabled={!canSetMode()} />

          {/* 系統管理面板 */}
          <Card to="/admin/users" title="使用者管理" desc="檢視與搜尋、重設密碼、角色指派" icon={Users} />
          <Card to="/admin/schools" title="學校管理" desc="清單、新增、重新命名" icon={Building2} />
          <Card to="/admin/integrations" title="整合狀態" desc="Webhook/Redis/心跳服務概況" icon={Network} />
          <Card to="/admin/pages" title="頁面內容（Markdown）" desc="關於/版規 的維護與即時預覽" icon={LayoutDashboard} />
          <Card to="/admin/support" title="使用者回報/聯絡" desc="查看最近的狀況回報、快速聯絡回覆" icon={MessagesSquare} />
        </div>
      </main>
    </div>
  )
}
