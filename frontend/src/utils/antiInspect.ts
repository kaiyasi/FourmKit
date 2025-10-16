/*
 Anti-inspect protection for non-dev_admin users.
 - Blocks DevTools hotkeys (F12, Ctrl/Meta+Shift+I/J, Ctrl/Meta+U)
 - Detects DevTools open via window size heuristics and timing traps
 - Shows full-screen overlay and prevents interaction when triggered
 - Automatically disables itself for dev_admin role
 */

type Cleanup = () => void

function isDevAdmin(): boolean {
  try {
    const role = (window as any).__FK_ROLE || 'guest'
    return role === 'dev_admin'
  } catch { return false }
}

function createOverlay(): HTMLElement {
  const el = document.createElement('div')
  el.id = 'fk-antiinspect-overlay'
  el.style.position = 'fixed'
  el.style.inset = '0'
  el.style.zIndex = '2147483647'
  el.style.background = 'rgba(0,0,0,0.8)'
  el.style.backdropFilter = 'blur(2px)'
  el.style.color = '#fff'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  el.style.userSelect = 'none'
  el.innerHTML = '<div style="text-align:center;padding:24px;max-width:720px"><div style="font-size:18px;font-weight:600;margin-bottom:8px">安全保護已啟用</div><div style="font-size:14px;opacity:.9">為保護平台安全，已停用除錯工具與檢視原始碼。若需開發權限，請使用具管理身份的帳號登入。</div></div>'
  return el
}

function lockScroll(): void {
  try { document.documentElement.style.overflow = 'hidden' } catch {}
  try { document.body.style.overflow = 'hidden' } catch {}
}

function unlockScroll(): void {
  try { document.documentElement.style.overflow = '' } catch {}
  try { document.body.style.overflow = '' } catch {}
}

function isIOSLike(): boolean {
  try {
    const ua = navigator.userAgent || ''
    const isiOSUA = /iPad|iPhone|iPod/.test(ua)
    const iPadOS = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1
    return isiOSUA || iPadOS
  } catch { return false }
}

function devtoolsHeuristicOpen(): boolean {
  try {
    // iOS / iPadOS Safari 可能因工具列與 PWA 視窗導致 outer/inner 差值異常，避免誤判
    if (isIOSLike()) {
      return false
    }
    const w = Math.abs((window.outerWidth || 0) - (window.innerWidth || 0))
    const h = Math.abs((window.outerHeight || 0) - (window.innerHeight || 0))
    return (w > 160) || (h > 160)
  } catch { return false }
}

function timingTrapTriggered(): boolean {
  try {
    const t0 = performance.now()
    // eslint-disable-next-line no-debugger
    debugger
    const t1 = performance.now()
    return (t1 - t0) > 250
  } catch { return false }
}

export function enableAntiInspect(): Cleanup {
  if (isDevAdmin()) {
    try { console.log('[AntiInspect] dev_admin detected, protections disabled') } catch {}
    return () => {}
  }
  try { console.log('[AntiInspect] Enabled for non-admin user') } catch {}

  let overlayShown = false
  let overlayEl: HTMLElement | null = null
  let shadowHost: HTMLElement | null = null
  let shadowRoot: ShadowRoot | null = null
  let triggerCount = 0

  const showOverlay = (reason: string = 'unknown') => {
    if (overlayShown) return
    overlayShown = true
    try {
      const _post = (window as any).fetch ? fetch('/api/security/devtools_event', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind:'overlay_show', meta:{ reason, path: location.pathname } }) }).catch(()=>{}) : null
    } catch {}
    try {
      shadowHost = document.createElement('div')
      shadowHost.id = 'fk-antiinspect-host-' + Math.random().toString(36).slice(2)
      shadowRoot = shadowHost.attachShadow({ mode: 'closed' }) as any
      overlayEl = createOverlay()
      ;(shadowRoot as any).appendChild(overlayEl)
      document.documentElement.appendChild(shadowHost)
    } catch {
      overlayEl = createOverlay()
      document.body.appendChild(overlayEl)
    }
    lockScroll()
  }

  const hideOverlay = () => {
    overlayShown = false
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl)
    overlayEl = null
    unlockScroll()
  }

  // Block common hotkeys
  const onKeyDown = (e: KeyboardEvent) => {
    if (isDevAdmin()) return // dynamic exemption
    const k = e.key?.toLowerCase?.() || ''
    const combo = {
      f12: k === 'f12',
      openDevTools: (e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j'),
      viewSource: (e.ctrlKey || e.metaKey) && k === 'u',
    }
    if (combo.f12 || combo.openDevTools || combo.viewSource) {
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation()
      try { fetch('/api/security/devtools_event', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind:'hotkey', meta:{ key: k, path: location.pathname } }) }).catch(()=>{}) } catch {}
      triggerCount++
      showOverlay('hotkey')
    }
  }

  // Block context menu (optional hardening)
  const onContext = (e: MouseEvent) => {
    if (isDevAdmin()) return
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation()
    try { fetch('/api/security/devtools_event', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind:'context', meta:{ path: location.pathname } }) }).catch(()=>{}) } catch {}
  }

  // Polling detection (size + timing)
  const interval = window.setInterval(() => {
    if (isDevAdmin()) { hideOverlay(); return }
    if (devtoolsHeuristicOpen() || timingTrapTriggered()) {
      try { fetch('/api/security/devtools_event', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind:'open', meta:{ path: location.pathname } }) }).catch(()=>{}) } catch {}
      triggerCount++
      showOverlay('detect')
    }
  }, 800)

  function attachHandlers() {
    try { window.addEventListener('keydown', onKeyDown, { capture: true }) } catch {}
    try { window.addEventListener('contextmenu', onContext, { capture: true }) } catch {}
    try { document.addEventListener('contextmenu', onContext as any, { capture: true }) } catch {}
    try { document.documentElement?.addEventListener('contextmenu', onContext as any, { capture: true }) } catch {}
    try { document.body?.addEventListener('contextmenu', onContext as any, { capture: true }) } catch {}
  }
  attachHandlers()

  // Re-attach on navigation or visibility changes
  const reattach = () => { if (!isDevAdmin()) attachHandlers() }
  window.addEventListener('pageshow', reattach)
  window.addEventListener('popstate', reattach)
  window.addEventListener('hashchange', reattach)
  document.addEventListener('visibilitychange', reattach)

  // Console probe
  try {
    let consoleOpened = false
    const probe: any = {}
    Object.defineProperty(probe, 'id', { get() { consoleOpened = true } })
    console.log(probe)
    setTimeout(() => { if (consoleOpened) { try { fetch('/api/security/devtools_event', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind:'console_open', meta:{ path: location.pathname } }) }).catch(()=>{}) } catch {}; showOverlay('console') } }, 0)
  } catch {}

  // Self-heal overlay
  const mo = new MutationObserver(() => {
    if (isDevAdmin()) return
    try {
      const exists = (shadowHost && document.documentElement.contains(shadowHost)) || (overlayEl && document.body.contains(overlayEl))
      if (!exists && overlayShown) {
        try { fetch('/api/security/devtools_event', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind:'overlay_removed', meta:{ path: location.pathname } }) }).catch(()=>{}) } catch {}
        overlayShown = false
        showOverlay('self_heal')
      }
    } catch {}
  })
  try { mo.observe(document.documentElement, { childList: true, subtree: true }) } catch {}

  // In case role changes to dev_admin at runtime, keep checking and disable protections
  const roleWatch = window.setInterval(() => {
    if (isDevAdmin()) {
      hideOverlay()
    }
  }, 2000)

  return () => {
    window.removeEventListener('keydown', onKeyDown, { capture: true } as any)
    window.removeEventListener('contextmenu', onContext, { capture: true } as any)
    document.removeEventListener('contextmenu', onContext as any, { capture: true } as any)
    document.documentElement?.removeEventListener('contextmenu', onContext as any, { capture: true } as any)
    document.body?.removeEventListener('contextmenu', onContext as any, { capture: true } as any)
    window.removeEventListener('pageshow', reattach)
    window.removeEventListener('popstate', reattach)
    window.removeEventListener('hashchange', reattach)
    document.removeEventListener('visibilitychange', reattach)
    window.clearInterval(interval)
    window.clearInterval(roleWatch)
    try { mo.disconnect() } catch {}
    hideOverlay()
  }
}
