import React from 'react'
import { Link } from 'react-router-dom'
import { getRole, getRoleDisplayName, canSetMode } from '@/utils/auth'
import { MobileAdminLayout } from './MobileAdminLayout'
import { DesktopOnlyFeatures } from '../DesktopOnlyFeatures'
import {
  ShieldCheck,
  MessagesSquare,
  MessageSquareDot
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
        flex items-start gap-3 hover:bg-surface/80 transition-colors w-full mobile-card
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
      title="Admin"
      subtitle="Admin"
      showBack={false}
      showNotifications={true}
    >
      {/* 手機版允許的管理功能 */}
      <div className="space-y-3">
        <Card to="/admin/moderation" title="審核管理" desc="待審核貼文、今日已處理、待處理請求" icon={ShieldCheck} />
        <Card to="/admin/comments" title="留言監控" desc="留言審核、統計分析、篩選搜尋" icon={MessagesSquare} />
        <Card to="/m/admin/chat" title="聊天室" desc="待處理請求、即時溝通" icon={MessageSquareDot} />
      </div>

      {/* 統合的桌面版功能提示 */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 px-2 mb-4">
          更多管理功能
        </h3>

        <DesktopOnlyFeatures userRole={role} />
      </div>
    </MobileAdminLayout>
  )
}
