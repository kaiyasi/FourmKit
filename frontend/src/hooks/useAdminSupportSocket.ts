import { useEffect } from 'react'
import { on, off } from '@/services/socket'

/**
 *
 */
export type AdminSupportEvent = {
  event_type: 'ticket_created' | 'message_sent' | 'status_changed'
  ticket_id: string
  payload: any
  ts: string
}

/**
 *
 */
export function useAdminSupportSocket(handler: (ev: AdminSupportEvent)=>void) {
  useEffect(() => {
    const h = (payload: any) => {
      try { handler(payload as AdminSupportEvent) } catch (e) { console.warn('[support] bad admin_event', e) }
    }
    on('support:admin_event', h)
    return () => { off('support:admin_event', h) }
  }, [handler])
}

