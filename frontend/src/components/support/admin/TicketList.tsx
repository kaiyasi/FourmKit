import React from 'react'
import { Calendar, MessageSquare, User } from 'lucide-react'
import { StatusBadge, CategoryBadge } from '@/components/support/SupportComponents'

interface TicketListItemProps {
  ticket: {
    id: string;
    public_id: string;
    subject: string;
    status: string;
    category: string;
    assignee_name?: string;
    last_activity_at: string;
    message_count: number;
  };
  isSelected: boolean;
  onSelect: () => void;
}

const TicketListItem: React.FC<TicketListItemProps> = ({ ticket, isSelected, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`p-4 border-b border-border cursor-pointer ${isSelected ? 'bg-primary-bg' : 'hover:bg-surface-hover'}`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-sm font-semibold text-fg truncate pr-4" title={ticket.subject}>{ticket.subject}</span>
        <span className="text-xs text-muted flex-shrink-0">{new Date(ticket.last_activity_at).toLocaleDateString()}</span>
      </div>
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-2">
          <StatusBadge status={ticket.status} />
          <CategoryBadge category={ticket.category} />
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
      <div className="flex items-center justify-between text-sm mt-2">
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
  )
}

interface TicketListProps {
  tickets: TicketListItemProps['ticket'][];
  selectedTicketId: string | null;
  onSelectTicket: (id: string) => void;
}

const TicketList: React.FC<TicketListProps> = ({ tickets, selectedTicketId, onSelectTicket }) => {
  return (
    <div className="divide-y divide-border">
      {tickets.map(ticket => (
        <TicketListItem
          key={ticket.id}
          ticket={ticket}
          isSelected={selectedTicketId === ticket.id}
          onSelect={() => onSelectTicket(ticket.id)}
        />
      ))}
    </div>
  )
}

export default TicketList
