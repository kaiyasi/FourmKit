import { getSocket } from './socket'

declare global { 
  interface Window { 
    __SOCKET_NEW_COUNT?: number 
  }
}

let postListenerInstalled = false
const commentListenerInstalled = false
const announceListenerInstalled = false
let moderationListenerInstalled = false
let deleteReqListenerInstalled = false
let reactionListenerInstalled = false
let postEventCount = 0

let globalPostHandler: ((payload: any) => void) | null = null

const seenEvents = new Set<string>()
const SEEN_MAX = 2000

function getSeenKey(payload: any): string {
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
  
  if (seenEvents.size > SEEN_MAX) {
    const toKeep = Array.from(seenEvents).slice(-Math.floor(SEEN_MAX / 2))
    seenEvents.clear()
    toKeep.forEach(k => seenEvents.add(k))
    console.info(`[realtime] cleaned seen events cache, kept ${toKeep.length} items`)
  }
  
  return true
}

/**
 *
 */
export function installPostListener(handler: (payload: any) => void) {
  const s = getSocket()
  const timestamp = new Date().toISOString()
  
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
  
  console.info(`[realtime] current post_created listeners count:`, s.listeners('post_created')?.length || 0)
}

/**
 *
 */
export function ensurePostListener(onIncoming: (payload: any) => void) {
  installPostListener(onIncoming)
}

/**
 *
 */
export function ensureCommentListener(onIncoming: (payload: any) => void) {
  const s = getSocket()
  
  const handler = (payload: any) => {
    console.debug('[realtime] received comment_created:', payload)
    onIncoming(payload)
  }
  
  s.off('comment.created')
  s.on('comment.created', handler)
}

/**
 *
 */
export function ensureAnnounceListener(onIncoming: (payload: any) => void) {
  const s = getSocket()
  
  const handler = (payload: any) => {
    console.debug('[realtime] received announce:', payload)
    onIncoming(payload)
  }
  
  s.off('announce')
  s.on('announce', handler)
}

/**
 *
 */
export function ensureReactionListeners(onReacted: (payload: any) => void) {
  if (reactionListenerInstalled) return
  const s = getSocket()
  const handler = (payload:any) => {
    console.debug('[realtime] received reaction:', payload)
    onReacted(payload)
  }
  s.off('post.reacted'); s.off('reaction'); s.off('comment.reacted')
  s.on('post.reacted', handler)
  s.on('reaction', handler)
  s.on('comment.reacted', handler)
  reactionListenerInstalled = true
}

/**
 *
 */
export function ensureModerationListeners(onApproved: (payload: any) => void, onRejected: (payload: any) => void) {
  if (moderationListenerInstalled) return
  const s = getSocket()
  s.off('post.approved'); s.off('post.rejected')
  s.on('post.approved', onApproved)
  s.on('post.rejected', onRejected)
  moderationListenerInstalled = true
}

/**
 *
 */
export function ensureDeleteRequestListeners(onCreated: (payload:any)=>void, onApproved:(payload:any)=>void, onRejected:(payload:any)=>void) {
  if (deleteReqListenerInstalled) return
  const s = getSocket()
  s.off('delete_request.created'); s.off('delete_request.approved'); s.off('delete_request.rejected')
  s.on('delete_request.created', onCreated)
  s.on('delete_request.approved', onApproved)
  s.on('delete_request.rejected', onRejected)
  deleteReqListenerInstalled = true
}

