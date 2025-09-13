import React from 'react'
import { AlertTriangle, CheckCircle2, MessageSquare, Users, UserCheck, UserX, Tag as TagIcon, Star } from 'lucide-react'

export const TicketActions: React.FC<{
  status: string
  onStatus: (s: string)=>void
  assigneeName?: string
  onAssignMe: ()=>void
  onUnassign: ()=>void
  priority: string
  onPriority: (p: string)=>void
  labels?: string[]
}> = ({ status, onStatus, assigneeName, onAssignMe, onUnassign, priority, onPriority, labels }) => {
  return (
    <div className="space-y-6">
      {/* 狀態操作 */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <h3 className="text-lg font-semibold text-fg mb-3">狀態</h3>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>onStatus('open')} className={`support-control rounded-lg border ${status==='open'?'border-primary text-fg':'border-border text-muted'} flex items-center gap-2 px-3`}>
            <MessageSquare className="w-4 h-4" /> 開啟
          </button>
          <button onClick={()=>onStatus('awaiting_admin')} className={`support-control rounded-lg border ${status==='awaiting_admin'?'border-primary text-fg':'border-border text-muted'} flex items-center gap-2 px-3`}>
            <AlertTriangle className="w-4 h-4" /> 等待管理員
          </button>
          <button onClick={()=>onStatus('awaiting_user')} className={`support-control rounded-lg border ${status==='awaiting_user'?'border-primary text-fg':'border-border text-muted'} flex items-center gap-2 px-3`}>
            <AlertTriangle className="w-4 h-4" /> 等待用戶
          </button>
          <button onClick={()=>onStatus('resolved')} className={`support-control rounded-lg border ${status==='resolved'?'border-primary text-fg':'border-border text-muted'} flex items-center gap-2 px-3`}>
            <CheckCircle2 className="w-4 h-4" /> 已解決
          </button>
        </div>
      </div>

      {/* 分配 */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <h3 className="text-lg font-semibold text-fg mb-3">分配</h3>
        <div className="space-y-2">
          <div className="text-sm text-muted flex items-center gap-2"><Users className="w-4 h-4" /> 目前：{assigneeName || '未分配'}</div>
          <div className="flex gap-2">
            <button onClick={onAssignMe} className="support-control flex-1 rounded-lg border border-border hover:bg-surface-hover inline-flex items-center justify-center gap-2"><UserCheck className="w-4 h-4" /> 分配給我</button>
            <button onClick={onUnassign} className="support-control flex-1 rounded-lg border border-border hover:bg-surface-hover inline-flex items-center justify-center gap-2"><UserX className="w-4 h-4" /> 取消分配</button>
          </div>
        </div>
      </div>

      {/* 優先級 */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <h3 className="text-lg font-semibold text-fg mb-3">優先級</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['low','medium','high','urgent'] as const).map(p=> (
            <button key={p} onClick={()=>onPriority(p)} className={`support-control rounded-lg border ${priority===p?'border-primary text-fg':'border-border text-muted'} flex items-center gap-2 px-3`}>
              <Star className="w-4 h-4" /> {p==='low'?'低':p==='medium'?'中':p==='high'?'高':'緊急'}
            </button>
          ))}
        </div>
      </div>

      {/* 標籤（佔位） */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <h3 className="text-lg font-semibold text-fg mb-3">標籤</h3>
        <div className="text-sm text-muted inline-flex items-center gap-2"><TagIcon className="w-4 h-4" /> {labels?.length? labels.join('、') : '—'}</div>
      </div>
    </div>
  )
}

export default TicketActions

