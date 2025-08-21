// frontend/src/services/realtime.ts
import { getSocket } from './socket'

declare global { 
  interface Window { 
    __SOCKET_NEW_COUNT?: number 
  }
}

let postListenerInstalled = false
let commentListenerInstalled = false
let announceListenerInstalled = false
let moderationListenerInstalled = false
let postEventCount = 0

// 全域唯一的 post listener 管理器
let globalPostHandler: ((payload: any) => void) | null = null

// 事件去重 Set
const seenEvents = new Set<string>()
const SEEN_MAX = 2000

function getSeenKey(payload: any): string {
  // 使用 event_id 或回退到 id + tx_id 組合
  const p = payload?.post || payload
  return payload.event_id || `${p?.id ?? 'temp'}:${payload?.client_tx_id ?? p?.client_tx_id ?? ''}`
}

function markSeenOnce(payload: any): boolean {
  const key = getSeenKey(payload)
  if (seenEvents.has(key)) {
    console.debug(`[realtime] duplicate event ignored: ${key}`)
    return false
  }
  
  seenEvents.add(key)
  
  // 簡單的 LRU：當太多時清理一半
  if (seenEvents.size > SEEN_MAX) {
    const toKeep = Array.from(seenEvents).slice(-Math.floor(SEEN_MAX / 2))
    seenEvents.clear()
    toKeep.forEach(k => seenEvents.add(k))
    console.info(`[realtime] cleaned seen events cache, kept ${toKeep.length} items`)
  }
  
  return true
}

export function installPostListener(handler: (payload: any) => void) {
  const s = getSocket()
  const timestamp = new Date().toISOString()
  
  // 無論如何都先清理現有的監聽器
  console.info(`[realtime] cleaning existing post_created listeners...`)
  s.off('post_created')
  
  if (postListenerInstalled) {
    console.warn('[realtime] post listener was already installed, re-registering')
  }
  
  postListenerInstalled = true
  globalPostHandler = handler
  
  const wrappedHandler = (payload: any) => {
    postEventCount++
    const post_id = payload?.post?.id || payload?.id || 'unknown'
    const origin = payload?.origin || 'unknown'
    const tx_id = payload?.client_tx_id || 'none'
    
    console.info(`[realtime] received post_created #${postEventCount}: post_id=${post_id} origin=${origin} tx_id=${tx_id}`)
    console.debug('[realtime] full payload:', payload)
    
    // 去重檢查
    if (!markSeenOnce(payload)) {
      return // 重複事件，忽略
    }
    
    if (globalPostHandler) {
      globalPostHandler(payload)
    }
  }
  
  console.info(`[realtime] installing new post_created listener at ${timestamp}`)
  s.on('post_created', wrappedHandler)
  
  console.info(`[realtime] post_created listener installed successfully`)
  
  // 提供調試信息
  console.info(`[realtime] current post_created listeners count:`, s.listeners('post_created')?.length || 0)
}

// 向後相容的包裝函數
export function ensurePostListener(onIncoming: (payload: any) => void) {
  installPostListener(onIncoming)
}

export function ensureCommentListener(onIncoming: (payload: any) => void) {
  const s = getSocket()
  
  const handler = (payload: any) => {
    console.debug('[realtime] received comment_created:', payload)
    onIncoming(payload)
  }
  
  s.off('comment.created')
  s.on('comment.created', handler)
}

export function ensureAnnounceListener(onIncoming: (payload: any) => void) {
  const s = getSocket()
  
  const handler = (payload: any) => {
    console.debug('[realtime] received announce:', payload)
    onIncoming(payload)
  }
  
  s.off('announce')
  s.on('announce', handler)
}

export function ensureModerationListeners(onApproved: (payload: any) => void, onRejected: (payload: any) => void) {
  if (moderationListenerInstalled) return
  const s = getSocket()
  s.off('post.approved'); s.off('post.rejected')
  s.on('post.approved', onApproved)
  s.on('post.rejected', onRejected)
  moderationListenerInstalled = true
}
