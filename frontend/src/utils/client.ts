// frontend/src/utils/client.ts
export function getClientId() {
  const k = 'forumkit_client_id'
  let v = localStorage.getItem(k)
  if (!v) { 
    v = crypto.randomUUID()
    localStorage.setItem(k, v)
  }
  return v
}

export function newTxId() { 
  return crypto.randomUUID() 
}

// 工具函數：簡單哈希函數
export const hash = (s: string) => {
  let h = 0; 
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// 製作穩定的暫時鍵
export const makeTempKey = (content: string, created_at: string, author_hash: string, txId?: string) => {
  return `tmp_${hash(`${content}|${created_at}|${author_hash}|${txId || ''}`)}`;
}

// 列表去重函數
export function dedup(arr: any[]) {
  const seen = new Set<string|number>()
  const out: any[] = []
  for (const x of arr) {
    const k = x.id ?? x.tempKey ?? (x.client_tx_id ? `tx:${x.client_tx_id}` : `h:${hash(x.content || '')}`)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

// Upsert 函數：替換或插入（嚴格去重版本）
export function upsertByIdOrTemp(items: any[], incoming: any) {
  if (!incoming) {
    console.warn('[upsert] incoming item is null/undefined')
    return items
  }

  const id = incoming.id
  const sig = incoming.client_tx_id || incoming.tempKey
  let changed = false
  let action = ''

  // 先做去重映射，避免重複處理
  const processedItems = dedup(items)

  const next = processedItems.map((x: any) => {
    // 1) 以 id 取代（正式）- 最高優先級
    if (id != null && x.id === id) { 
      changed = true
      action = `replaced by id: ${id}`
      console.info(`[upsert] ${action}`)
      return { ...x, ...incoming }
    }
    
    // 2) 以 client_tx_id/tempKey 對應樂觀項目替換
    const xsig = x.client_tx_id || x.tempKey
    if (sig && xsig && sig === xsig) { 
      changed = true
      action = `replaced by signature: ${sig}`
      console.info(`[upsert] ${action}`)
      return { ...x, ...incoming }
    }
    
    return x
  })

  // 若沒找到對象，視為新貼文，prepend
  if (!changed) {
    action = `prepended new item: id=${id || 'none'} sig=${sig || 'none'}`
    console.info(`[upsert] ${action}`)
    next.unshift(incoming)
  }
  
  // 最終去重確保沒有重複
  const result = dedup(next)
  console.debug(`[upsert] result: ${items.length} -> ${result.length} items (${action})`)
  return result
}

// 強化版本：專門處理 socket 廣播的 upsert
export function upsertSocketPayload(items: any[], payload: any) {
  if (!payload) return items
  
  // 從 payload 中提取 post 數據
  const post = payload.post || payload
  if (!post) {
    console.warn('[upsert] payload has no post data')
    return items
  }
  
  // 保留 socket payload 的額外信息
  const enrichedPost = {
    ...post,
    client_tx_id: payload.client_tx_id || post.client_tx_id,
    origin: payload.origin,
    event_id: payload.event_id
  }
  
  return upsertByIdOrTemp(items, enrichedPost)
}
