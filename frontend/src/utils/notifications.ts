/**
 *
 */
export type FkNotification = {
  id: string
  type: string
  text: string
  ts: number
  school?: string | null
  user_id?: string | null  // 個人識別碼
  read?: boolean
}

const KEY = 'fk_notifications'
const CAP = 500

function readAll(): FkNotification[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (Array.isArray(arr)) {
      return arr.map((it:any)=> ({ ...it, read: Boolean(it?.read) }))
    }
    return []
  } catch {
    return []
  }
}

function writeAll(items: FkNotification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-CAP)))
    window.dispatchEvent(new CustomEvent('fk_notifications_changed'))
  } catch {}
}

const CENTER_KEY = 'forumkit_notifications'
const CENTER_CAP = 50

type CenterNotification = {
  id: string
  type: 'auth' | 'moderation' | 'comment' | 'reaction' | 'announcement' | 'system'
  title: string
  message: string
  timestamp: number
  read: boolean
  icon?: 'success' | 'warning' | 'error' | 'info'
  actionUrl?: string
  actionText?: string
  data?: Record<string, any>
}

function _centerReadAll(): CenterNotification[] {
  try {
    const raw = localStorage.getItem(CENTER_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function _centerWriteAll(items: CenterNotification[]) {
  try { localStorage.setItem(CENTER_KEY, JSON.stringify(items.slice(0, CENTER_CAP))) } catch {}
  try { window.dispatchEvent(new StorageEvent('storage', { key: CENTER_KEY })) } catch {}
}

function _mirrorToCenter(n: Omit<FkNotification, 'id'|'ts'> & { ts?: number }) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
  const ts = n.ts ?? Date.now()
  const m = (type: CenterNotification['type'], title: string, message: string, icon: CenterNotification['icon'] = 'info') => ({
    id,
    type,
    title,
    message,
    timestamp: ts,
    read: false,
    icon,
    data: n.school ? { school: n.school } : undefined,
  } as CenterNotification)

  let entry: CenterNotification | null = null
  switch (n.type) {
    case 'post.pending':
      entry = m('moderation', '已提交審核', n.text)
      break
    case 'post.approved':
      entry = m('moderation', '貼文已通過審核', n.text, 'success')
      break
    case 'post.rejected':
      entry = m('moderation', '貼文未通過審核', n.text, 'warning')
      break
    case 'comment.new':
      entry = m('comment', '新留言', n.text)
      break
    case 'announce.new':
      entry = m('announcement', '公告', n.text)
      break
    case 'reaction':
      entry = m('reaction', '新互動', n.text)
      break
    default:
      entry = m('system', '通知', n.text)
  }
  const cur = _centerReadAll()
  _centerWriteAll([entry, ...cur])
}

/**
 *
 */
export function addNotification(n: Omit<FkNotification, 'id'|'ts'> & { ts?: number }) {
  const it: FkNotification = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    ts: n.ts ?? Date.now(),
    type: n.type,
    text: n.text,
    school: n.school ?? null,
    user_id: n.user_id ?? null,  // 添加用戶ID
    read: false,
  }
  const cur = readAll()
  cur.push(it)
  writeAll(cur)
  try { _mirrorToCenter(n) } catch {}
}

/**
 *
 */
export function listNotifications(filter?: { school?: string | null; type?: string; read?: boolean; user_id?: string | null }) {
  const items = readAll().slice().reverse() // 最新在前
  if (!filter) return items
  return items.filter(it => {
    if (filter.type && it.type !== filter.type) return false
    if (filter.school !== undefined) {
      const target = (filter.school || null)
      if ((it.school || null) !== target) return false
    }
    if (filter.read !== undefined && Boolean(it.read) !== filter.read) return false
    if (filter.user_id !== undefined) {
      const target = (filter.user_id || null)
      if ((it.user_id || null) !== target) return false
    }
    return true
  })
}

/**
 *
 */
export function clearNotifications(filter?: { school?: string | null; type?: string }) {
  if (!filter) {
    writeAll([])
    return
  }
  const next = readAll().filter(it => {
    if (filter.type && it.type === filter.type) return false
    if (filter.school !== undefined) {
      const target = (filter.school || null)
      if ((it.school || null) === target) return false
    }
    return true
  })
  writeAll(next)
}

/**
 *
 */
export function markNotificationRead(id: string) {
  const cur = readAll()
  const next = cur.map(it => it.id === id ? { ...it, read: true } : it)
  writeAll(next)
}

/**
 *
 */
export function markAllNotificationsRead(filter?: { school?: string | null; type?: string }) {
  const cur = readAll()
  const next = cur.map(it => {
    if (filter?.type && it.type !== filter.type) return it
    if (filter?.school !== undefined) {
      const target = (filter.school || null)
      if ((it.school || null) !== target) return it
    }
    return { ...it, read: true }
  })
  writeAll(next)
}
