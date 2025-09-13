import React from 'react'
import { Calendar, MessageSquare, User } from 'lucide-react'
import { StatusBadge, CategoryBadge, PriorityBadge } from '@/components/support/SupportComponents'

export interface TicketListItem {
  id: string
  ticket_id: string
  subject: string
  status: string
  category: string
  priority: string
  created_at: string
  last_activity_at: string
  message_count: number
  user_name?: string
  assignee_name?: string
  processing?: boolean
}

export const TicketList: React.FC<{
  items: TicketListItem[]
  onSelect: (id: string) => void
}> = ({ items, onSelect }) => {
  if (!items?.length) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="w-12 h-12 mx-auto text-muted mb-4" />
        <p className="text-fg font-medium">找不到符合條件的工單</p>
        <p className="text-muted">試試調整搜尋條件或篩選器</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((ticket) => (
        <div key={ticket.id}
             onClick={() => !ticket.processing && onSelect(ticket.id)}
             className={`p-4 border border-border rounded-xl hover:bg-surface-hover transition-colors cursor-pointer ${ticket.processing ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-fg truncate">{ticket.subject}</h3>
                <span className="text-xs text-muted font-mono">#{ticket.ticket_id}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={ticket.status} />
                <CategoryBadge category={ticket.category} />
                <PriorityBadge priority={ticket.priority} />
              </div>
            </div>
            <div className="text-right text-sm text-muted">
              <div className="flex items-center gap-1 mb-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(ticket.created_at).toLocaleDateString('zh-TW')}
              </div>
              <div className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {ticket.message_count} 則訊息
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted">
              <User className="w-3.5 h-3.5" />
              {ticket.user_name || '—'}
            </div>
            <div className="flex items-center gap-2 text-muted">
              <User className="w-3.5 h-3.5" />
              {ticket.assignee_name || '未分配'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default TicketList

