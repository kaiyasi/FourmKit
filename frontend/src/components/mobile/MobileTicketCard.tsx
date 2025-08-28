import { useState } from 'react'
import { Clock, MessageCircle, ChevronDown, ChevronRight, User, Tag } from 'lucide-react'

interface MobileTicketProps {
  ticket: {
    ticket_id: string
    subject: string
    category: string
    status: string
    priority: string
    created_at: string
    updated_at: string
    response_count: number
    handler?: string
    scope: string
    is_urgent?: boolean
    replies?: Array<{
      message: string
      timestamp: string
      by: string
      author?: string
    }>
  }
  showDetails?: boolean
}

export function MobileTicketCard({ ticket, showDetails = true }: MobileTicketProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      '開啟': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      '已指派': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      '處理中': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      '等待回覆': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      '已解決': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      '已關閉': 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
    }
    return colors[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
  }

  const getPriorityColor = (priority: string) => {
    const colors: { [key: string]: string } = {
      'low': 'text-green-600 dark:text-green-400',
      'medium': 'text-yellow-600 dark:text-yellow-400',
      'high': 'text-orange-600 dark:text-orange-400',
      'urgent': 'text-red-600 dark:text-red-400'
    }
    return colors[priority] || 'text-gray-600 dark:text-gray-400'
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return '今天 ' + date.toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } else if (days === 1) {
      return '昨天 ' + date.toLocaleTimeString('zh-TW', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } else if (days < 7) {
      return `${days}天前`
    } else {
      return date.toLocaleDateString('zh-TW')
    }
  }

  return (
    <div className=\"bg-surface border border-border rounded-xl overflow-hidden shadow-sm\">
      {/* 主要內容 */}
      <div className=\"p-4\">
        {/* 工單號碼和狀態 */}
        <div className=\"flex items-center justify-between mb-3\">
          <div className=\"flex items-center gap-2\">
            <span className=\"font-mono text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded\">
              #{ticket.ticket_id}
            </span>
            {ticket.is_urgent && (
              <span className=\"text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 rounded-full font-medium\">
                緊急
              </span>
            )}
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
            {ticket.status}
          </span>
        </div>

        {/* 標題 */}
        <h3 className=\"font-medium text-fg text-sm leading-tight mb-3 line-clamp-2\">
          {ticket.subject}
        </h3>

        {/* 元信息 */}
        <div className=\"space-y-2 mb-3\">
          <div className=\"flex items-center justify-between text-xs text-muted\">
            <div className=\"flex items-center gap-1\">
              <Tag className=\"w-3 h-3\" />
              <span>{ticket.category}</span>
            </div>
            <div className=\"flex items-center gap-1\">
              <span className={getPriorityColor(ticket.priority)}>
                優先級：{ticket.priority === 'low' ? '低' : ticket.priority === 'medium' ? '中' : ticket.priority === 'high' ? '高' : '緊急'}
              </span>
            </div>
          </div>

          <div className=\"flex items-center justify-between text-xs text-muted\">
            <div className=\"flex items-center gap-1\">
              <Clock className=\"w-3 h-3\" />
              <span>{formatDate(ticket.created_at)}</span>
            </div>
            {ticket.response_count > 0 && (
              <div className=\"flex items-center gap-1\">
                <MessageCircle className=\"w-3 h-3\" />
                <span>{ticket.response_count} 個回覆</span>
              </div>
            )}
          </div>

          <div className=\"flex items-center justify-between text-xs text-muted\">
            <div className=\"flex items-center gap-1\">
              <User className=\"w-3 h-3\" />
              <span>{ticket.scope}</span>
            </div>
            {ticket.handler && (
              <span>處理人：{ticket.handler}</span>
            )}
          </div>
        </div>

        {/* 展開/收起按鈕 */}
        {showDetails && ticket.replies && ticket.replies.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className=\"w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors\"
          >
            {isExpanded ? <ChevronDown className=\"w-4 h-4\" /> : <ChevronRight className=\"w-4 h-4\" />}
            <span>{isExpanded ? '收起詳情' : `查看回覆 (${ticket.replies.length})`}</span>
          </button>
        )}
      </div>

      {/* 展開的回覆內容 */}
      {isExpanded && ticket.replies && ticket.replies.length > 0 && (
        <div className=\"border-t border-border bg-surface/50\">
          <div className=\"p-4 space-y-3\">
            <h4 className=\"text-sm font-medium text-fg mb-3\">回覆記錄</h4>
            {ticket.replies.map((reply, index) => (
              <div key={index} className=\"bg-surface rounded-lg p-3 border border-border/50\">
                <div className=\"flex items-center justify-between mb-2\">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    reply.by === '管理員' 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                  }`}>
                    {reply.by}
                  </span>
                  <span className=\"text-xs text-muted\">
                    {formatDate(reply.timestamp)}
                  </span>
                </div>
                <div className=\"text-sm text-fg leading-relaxed whitespace-pre-wrap break-words\">
                  {reply.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}