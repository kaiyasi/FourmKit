import React from 'react'
import { AlertTriangle, CheckCircle2, MessageSquare, Users, UserCheck, UserX, Tag as TagIcon, Star } from 'lucide-react'

interface TicketActionsProps {
  status: string;
  onStatus: (s: string) => void;
  assigneeName?: string
  onAssignMe: ()=>void
  onUnassign: ()=>void
  labels: { id: number; key: string; display_name: string; color: string }[];
}

const TicketActions: React.FC<TicketActionsProps> = ({ status, onStatus, assigneeName, onAssignMe, onUnassign, labels }) => {
  return (
    <div className="space-y-6 p-1">
      <div>
        <h3 className="text-lg font-semibold text-fg mb-3">狀態</h3>
        <select value={status} onChange={(e)=>onStatus(e.target.value)} className="support-control w-full bg-surface border border-border rounded-lg text-sm">
          <option value="open">開啟</option>
          <option value="awaiting_user">等待用戶</option>
          <option value="awaiting_admin">等待管理員</option>
          <option value="resolved">已解決</option>
          <option value="closed">已關閉</option>
        </select>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-fg mb-3">負責人</h3>
        <div className="text-sm text-muted flex items-center gap-2"><Users className="w-4 h-4" /> 目前：{assigneeName || '未分配'}</div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={onAssignMe} className="support-control flex-1 rounded-lg border border-border hover:bg-surface-hover inline-flex items-center justify-center gap-2"><UserCheck className="w-4 h-4" /> 分配給我</button>
          <button onClick={onUnassign} className="support-control flex-1 rounded-lg border border-border hover:bg-surface-hover inline-flex items-center justify-center gap-2"><UserX className="w-4 h-4" /> 取消分配</button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-fg mb-3">標籤</h3>
        <div className="flex flex-wrap gap-2">
          {labels.map(label => (
            <span key={label.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface-hover border border-border">
              <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: label.color }}></span>
              {label.display_name}
            </span>
          ))}
          {labels.length === 0 && <div className="text-sm text-muted">無標籤</div>}
        </div>
      </div>
    </div>
  );
};

export default TicketActions

