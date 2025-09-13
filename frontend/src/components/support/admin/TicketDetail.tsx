import React from 'react'
import { ArrowLeft, MessageSquare, RefreshCw, Send, Calendar, User } from 'lucide-react'

export interface AdminMessage {
  id: number|string
  body: string
  author_type: 'user'|'admin'|'system'
  author_display_name?: string
  author_name?: string
  created_at: string
}

export interface AdminTicketDetailData {
  id: string
  ticket_id: string
  subject: string
  status: string
  priority: string
  category: string
  created_at: string
  user_name?: string
  assignee_name?: string
  messages: AdminMessage[]
}

export const TicketDetail: React.FC<{
  data: AdminTicketDetailData
  onBack: () => void
  onRefresh: () => void
  onReply: (text: string) => Promise<void>
  replying?: boolean
}> = ({ data, onBack, onRefresh, onReply, replying }) => {
  const [text, setText] = React.useState('')

  const doReply = async () => {
    if (!text.trim()) return
    await onReply(text)
    setText('')
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="page-content">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-fg transition-colors">
                <ArrowLeft className="w-5 h-5" />
                返回列表
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-fg">工單 #{data.ticket_id}</h1>
                <p className="text-muted mt-1">{data.subject}</p>
              </div>
              <button onClick={onRefresh} className="form-control form-control--compact support-control flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                重新載入
              </button>
            </div>
          </div>

          {/* Conversation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2 mb-4">
                <MessageSquare className="w-5 h-5" />
                對話記錄
              </h2>
              <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto">
                {data.messages.map((msg)=>{
                  const role = msg.author_type
                  const isUser = role === 'user'
                  const isAdmin = role === 'admin'
                  const bubble = isUser ? 'bg-info-bg text-info-text border border-info-border' : isAdmin ? 'bg-primary-100 text-primary border border-primary' : 'bg-warning-bg text-warning-text border border-warning-border'
                  const name = msg.author_display_name || msg.author_name || (isAdmin? '管理員':'用戶')
                  return (
                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%]">
                        <div className={`p-4 rounded-xl ${bubble}`}>
                          <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                          <div className="text-xs mt-2 opacity-70 flex items-center gap-2">
                            <User className="w-3.5 h-3.5" />
                            {name}
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(msg.created_at).toLocaleString('zh-TW')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* reply */}
              <div className="p-4 bg-surface-hover rounded-lg">
                <div className="flex gap-3">
                  <textarea
                    value={text}
                    onChange={(e)=>setText(e.target.value)}
                    rows={3}
                    placeholder="輸入回覆…"
                    className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                  <button onClick={doReply} disabled={!text.trim() || !!replying} className="support-control px-4 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
                    {replying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    發送
                  </button>
                </div>
              </div>
            </div>

            {/* Right slot for actions supplied by parent */}
            <div id="ticket-actions-slot" className="space-y-6" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default TicketDetail

