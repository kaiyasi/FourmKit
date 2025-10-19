/**
 *
 */
export function getClientId() {
  const k = 'forumkit_client_id'
  try {
    const store = window.sessionStorage
    let v = store.getItem(k)
    if (!v) { v = crypto.randomUUID(); store.setItem(k, v) }
    return v
  } catch {
    let v = localStorage.getItem(k)
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v) }
    return v
  }
}

/**
 *
 */
export function newTxId() { 
  return crypto.randomUUID() 
}

/**
 *
 */
export function generateAnonymousCode(): string {
  const clientId = getClientId()
  const hash = clientId.replace(/-/g, '').substring(0, 6)
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  
  for (let i = 0; i < 6; i++) {
    const charCode = hash.charCodeAt(i) || 0
    const index = charCode % chars.length
    result += chars[index]
  }
  
  return result
}

/**
 *
 */
export function isSystemDemo(): boolean {
  const demoPatterns = [
    '歡迎來到 ForumKit',
    '這是一個示例貼文',
    '系統展示',
    'demo',
    'test'
  ]
  
  const isDemoMode = localStorage.getItem('forumkit_demo_mode') === 'true'
  
  return isDemoMode
}

export const hash = (s: string) => {
  let h = 0; 
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export const makeTempKey = (content: string, created_at: string, author_hash: string, txId?: string) => {
  return `tmp_${hash(`${content}|${created_at}|${author_hash}|${txId || ''}`)}`;
}

/**
 *
 */
export function dedup(arr: any[]) {
  const seen = new Set<string | number>()
  const out: any[] = []
  for (const x of arr) {
    const fallbackSig = `h:${hash(`${x.content || ''}|${x.created_at || ''}|${x.author_hash || ''}`)}`
    const k = x.id ?? x.tempKey ?? (x.client_tx_id ? `tx:${x.client_tx_id}` : fallbackSig)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

/**
 *
 */
export function upsertByIdOrTemp(items: any[], incoming: any) {
  if (!incoming) {
    console.warn('[upsert] incoming item is null/undefined')
    return items
  }

  const id = incoming.id
  const sig = incoming.client_tx_id || incoming.tempKey
  let changed = false
  let action = ''

  const processedItems = dedup(items)

  const next = processedItems.map((x: any) => {
    if (id != null && x.id === id) { 
      changed = true
      action = `replaced by id: ${id}`
      console.info(`[upsert] ${action}`)
      return { ...x, ...incoming }
    }
    
    const xsig = x.client_tx_id || x.tempKey
    if (sig && xsig && sig === xsig) { 
      changed = true
      action = `replaced by signature: ${sig}`
      console.info(`[upsert] ${action}`)
      return { ...x, ...incoming }
    }
    
    return x
  })

  if (!changed) {
    action = `prepended new item: id=${id || 'none'} sig=${sig || 'none'}`
    console.info(`[upsert] ${action}`)
    next.unshift(incoming)
  }
  
  const result = dedup(next)
  console.debug(`[upsert] result: ${items.length} -> ${result.length} items (${action})`)
  return result
}

/**
 *
 */
export function upsertSocketPayload(items: any[], payload: any) {
  if (!payload) return items
  
  const post = payload.post || payload
  if (!post) {
    console.warn('[upsert] payload has no post data')
    return items
  }
  
  const enrichedPost = {
    ...post,
    client_tx_id: payload.client_tx_id || post.client_tx_id,
    origin: payload.origin,
    event_id: payload.event_id
  }
  
  return upsertByIdOrTemp(items, enrichedPost)
}
