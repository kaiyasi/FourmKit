import { useState } from 'react'
import { Clock, MessageCircle, ChevronDown, ChevronRight, User, Tag } from 'lucide-react'

interface MobileTicketCardProps {
  ticket: {
    public_id: string;
    subject: string;
    status: string;
    last_activity_at: string;
    message_count: number;
  };
  onClick: () => void;
}

export const MobileTicketCard: React.FC<MobileTicketCardProps> = ({ ticket, onClick }) => {
  const getStatusColor = (status: string) => {
    const colors = {
      open: 'text-blue-600 dark:text-blue-400',
      awaiting_user: 'text-yellow-600 dark:text-yellow-400',
      awaiting_admin: 'text-yellow-600 dark:text-yellow-400',
      resolved: 'text-green-600 dark:text-green-400',
      closed: 'text-gray-500 dark:text-gray-400',
    };
    return colors[status] || 'text-gray-600 dark:text-gray-400';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) {
      return date.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return date.toLocaleDateString('zh-TW', {
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div onClick={onClick} className="bg-surface border border-border rounded-xl p-4 active:bg-surface-hover">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-medium text-fg text-sm leading-tight mb-3 line-clamp-2">{ticket.subject}</h3>
        <span className="text-xs text-muted whitespace-nowrap ml-2">#{ticket.public_id}</span>
      </div>
      <div className="flex justify-between items-center text-xs">
        <div className={`font-medium ${getStatusColor(ticket.status)}`}>
          {ticket.status.toUpperCase()}
        </div>
        <div className="text-muted flex items-center gap-2">
          <div className="flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            {ticket.message_count}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(ticket.last_activity_at)}
          </div>
        </div>
      </div>
    </div>
  );
};