/*
  Simple anti-inspect deterrent for non-admin users.
  - Blocks context menu and common devtools shortcuts
  - Detects devtools open and shows overlay warning
  - Opt-in via VITE_ANTI_INSPECT (default on)
*/

type Options = {
  enabled?: boolean
  exemptRoles?: string[]
  message?: string
}

function createOverlay(message: string) {
  const id = 'fk-anti-inspect-overlay'
  if (document.getElementById(id)) return
  const el = document.createElement('div')
  el.id = id
  el.style.position = 'fixed'
  el.style.inset = '0'
  el.style.zIndex = '99999'
  el.style.background = 'rgba(0,0,0,0.6)'
  el.style.backdropFilter = 'blur(3px)'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.innerHTML = `
    <div style="max-width: 520px; margin: 16px; background: var(--surface, #111); color: var(--fg, #eee); border: 1px solid var(--border, #444); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.4);">
      <div style="padding: 18px 20px; border-bottom: 1px solid var(--border, #444); font-weight: 700;">安全提醒</div>
      <div style="padding: 18px 20px; font-size: 14px; line-height: 1.6;">
        ${message}
      </div>
      <div style="padding: 0 20px 18px; display: flex; gap: 8px; justify-content: flex-end;">
        <button id="fk-anti-inspect-close" style="padding: 8px 12px; border: 1px solid var(--border, #444); border-radius: 10px; background: var(--surface, #111); color: var(--fg, #eee); cursor: pointer">我知道了</button>
      </div>
    </div>
  `
  document.body.appendChild(el)
  const btn = document.getElementById('fk-anti-inspect-close')
  btn?.addEventListener('click', () => {
    el.remove()
  })
}

function isDevtoolsOpen(): boolean {
  // Heuristic: large devtools panel width/height difference or time to eval debugger
  const threshold = 160
  const w = window.outerWidth - window.innerWidth
  const h = window.outerHeight - window.innerHeight
  if (w > threshold || h > threshold) return true
  const start = performance.now()
  // eslint-disable-next-line no-debugger
  debugger
  const cost = performance.now() - start
  return cost > 100
}

function hasAdminCookie(): boolean {
  try {
    return document.cookie.split(';').some(v => v.trim().startsWith('fk_admin=1'))
  } catch { return false }
}

function getJwtRole(): string | '' {
  try {
    const t = localStorage.getItem('token')
    if (!t) return ''
    const parts = t.split('.')
    if (parts.length < 2) return ''
    const payload = JSON.parse(atob(parts[1]))
    return (payload?.role || '').toString()
  } catch { return '' }
}

function isExempt(exemptRoles: string[]): boolean {
  try {
    const roleLS = localStorage.getItem('role') || ''
    const roleJWT = getJwtRole()
    const flag = localStorage.getItem('FK_ANTI_INSPECT_EXEMPT') === '1'
    return (
      flag ||
      exemptRoles.includes(roleLS) ||
      exemptRoles.includes(roleJWT) ||
      hasAdminCookie()
    )
  } catch { return hasAdminCookie() }
}

export function initAntiInspect(opts: Options = {}) {
  const enabled = opts.enabled ?? (import.meta.env.VITE_ANTI_INSPECT !== '0')
  if (!enabled) return

  const exemptRoles = opts.exemptRoles ?? ['dev_admin']
  if (isExempt(exemptRoles)) return

  // 狀態：允許在獲得豁免後自動停用阻擋（避免你登入後仍被攔）
  let active = true

  // Block context menu
  const onContext = (e: Event) => { if (!active) return; e.preventDefault() }
  window.addEventListener('contextmenu', onContext)

  // Block common devtools shortcuts
  const onKeydown = (e: KeyboardEvent) => {
    if (!active) return
    const k = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey
    if (
      k === 'f12' ||
      (ctrl && e.shiftKey && ['i','j','c'].includes(k)) ||
      (ctrl && k === 'u') // view-source
    ) {
      e.preventDefault()
      e.stopPropagation()
      createOverlay(opts.message || '偵測到開發者工具快捷鍵。為了平台安全與公平，請勿嘗試檢視或修改頁面程式。若你有研究需求，歡迎向管理員申請開發者權限。')
    }
  }
  window.addEventListener('keydown', onKeydown, { capture: true })

  // Poll devtools open
  const interval = setInterval(() => {
    try {
      // 若中途取得豁免（登入變 dev_admin 或獲得 cookie），自動解除阻擋
      if (isExempt(exemptRoles)) {
        active = false
        window.removeEventListener('contextmenu', onContext)
        window.removeEventListener('keydown', onKeydown, true as any)
        clearInterval(interval)
        const ov = document.getElementById('fk-anti-inspect-overlay')
        if (ov) ov.remove()
        return
      }
      if (active && isDevtoolsOpen()) {
        createOverlay(opts.message || '偵測到瀏覽器開發者工具。非管理員請勿檢視或嘗試修改頁面。若有疑問，請聯繫管理員。')
      }
    } catch {}
  }, 1200)

  window.addEventListener('beforeunload', () => clearInterval(interval))
}
