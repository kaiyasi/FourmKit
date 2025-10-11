import React from 'react'
import { ArrowLeft, RefreshCw, Send } from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Button } from '@/components/support/SupportComponents'

interface Message {
  id: number | string
  body: string
  author_type: string
  author_display_name: string
  created_at: string
  is_internal?: boolean
}

interface TicketDetailLite {
  id?: number
  ticket_id: string
  subject: string
  status: string
  category: string
  created_at: string
  messages: Message[]
}

export default function MobileSupportDetailPage({
  ticket,
  newMessage,
  setNewMessage,
  sending,
  onSend,
  onBack,
  refreshing,
  onReload,
}: {
  ticket: TicketDetailLite
  newMessage: string
  setNewMessage: (v: string) => void
  sending: boolean
  onSend: () => void
  onBack: () => void
  refreshing: boolean
  onReload: () => void
}) {
  return (
    <PageLayout pathname="/support">
      <div className="max-w-4xl mx-auto">
        <div className="px-4 py-3 border-b border-border bg-surface/95 backdrop-blur sticky top-0 z-20 flex items-center gap-2">
          <button onClick={onBack} className="w-8 h-8 rounded-lg hover:bg-surface-hover flex items-center justify-center text-muted" aria-label="返回">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">工單 #{ticket.ticket_id}</div>
            <div className="text-xs text-muted truncate">{ticket.subject}</div>
          </div>
          <Button variant="ghost" size="sm" icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />} onClick={onReload} disabled={refreshing} />
        </div>

        <div className="px-4 py-4">
          <div className="rounded-2xl bg-surface/70 border border-border p-3 mb-3 mobile-card w-full">
            <div className="grid grid-cols-2 gap-3 text-xs text-muted">
              <div>
                <div className="text-muted">工單編號</div>
                <div className="font-medium text-fg">#{ticket.ticket_id}</div>
              </div>
              <div>
                <div className="text-muted">狀態</div>
                <div className="font-medium text-fg">{ticket.status === 'open' ? '開啟' : ticket.status}</div>
              </div>
              <div>
                <div className="text-muted">分類</div>
                <div className="font-medium text-fg">{ticket.category}</div>
              </div>
              <div>
                <div className="text-muted">建立時間</div>
                <div className="font-medium text-fg">{new Date(ticket.created_at).toLocaleString('zh-TW')}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {(ticket.messages || []).map((message) => (
              <div key={message.id} className={`flex ${message.author_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  <div className={`px-3 py-2 rounded-2xl ${message.author_type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-surface border border-border'}`}>
                    {message.body.split('\n').map((line, idx) => (
                      <p key={idx} className={`text-sm ${message.author_type === 'user' ? 'text-primary-foreground' : 'text-fg'}`}>{line}</p>
                    ))}
                    <div className={`text-[11px] mt-1 leading-tight ${message.author_type === 'user' ? 'text-primary-foreground/80' : 'text-muted'}`}>
                      <div className="font-medium">{message.author_display_name}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div id="support-messages-end" className="h-1" />
          </div>
        </div>

        {ticket.status !== 'closed' && (
          <div className="fixed left-0 right-0 border-t border-border bg-surface/95 backdrop-blur p-2 z-40" style={{ bottom: 'var(--fk-bottomnav-offset, 64px)' }}>
            <div className="max-w-4xl mx-auto flex items-center gap-2 px-2">
              <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="輸入您的回應..." rows={1} className="flex-1 form-control form-control--compact resize-none" />
              <Button onClick={onSend} loading={sending} disabled={!newMessage.trim()} icon={<Send className="w-4 h-4" />}>發送</Button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
