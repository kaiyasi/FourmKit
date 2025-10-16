(function() {
    'use strict';

    /**
     *Advanced anti-inspect and anti-debugging system for non-admin users.
     *- Blocks context menu and common devtools shortcuts
     *- Detects devtools open and shows overlay warning
     *- Infinite debugger trap
     *- Timing-based debugging detection
     *- Stack trace analysis
     *- Code integrity verification
     *- Opt-in via VITE_ANTI_INSPECT (default on)
     */

    type Options = {
      enabled?: boolean
      exemptRoles?: string[]
      message?: string
      // Timing detection tuning
      timingIntervalMs?: number
      timingMaxDeltaMs?: number
      timingConsecutive?: number
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

    function isIOSLike(): boolean {
      try {
        const ua = navigator.userAgent || ''
        const isiOSUA = /iPad|iPhone|iPod/.test(ua)
        const iPadOS = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1
        return isiOSUA || iPadOS
      } catch { return false }
    }

    function isDevtoolsOpen(exemptRoles: string[]): boolean {
      // dev_admin 直接返回 false，不進行檢測
      if (isExempt(exemptRoles)) return false

      // iOS / iPadOS Safari 會因工具列與視窗機制導致 outer/inner 差值異常，避免誤判
      if (isIOSLike()) return false

      const threshold = 160
      const w = (window.outerWidth - window.innerWidth)
      const h = (window.outerHeight - window.innerHeight)
      if (w > threshold || h > threshold) return true

      // 移除 debugger 檢測，只用視窗大小判斷
      return false
    }

    function hasAdminCookie(): boolean {
      try {
        return document.cookie.split(';').some(v => v.trim().startsWith('fk_admin=1'))
      } catch { return false }
    }

    function base64urlToString(input: string): string {
      // Convert base64url (RFC 7515) to base64 for atob
      const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
      const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
      try { return atob(b64) } catch { return '' }
    }

    function getJwtRole(): string | '' {
      try {
        const w: any = window
        const role = (w && typeof w.__FK_ROLE === 'string') ? w.__FK_ROLE : ''
        return role || ''
      } catch { return '' }
    }

    function isExempt(exemptRoles: string[]): boolean {
      try {
        const roleJWT = getJwtRole()
        return (
          exemptRoles.includes(roleJWT) ||
          hasAdminCookie()
        )
      } catch { return hasAdminCookie() }
    }

    function debuggerTrap(exemptRoles: string[]) {
      // 雙重保險：即使被調用也立即檢查豁免
      if (isExempt(exemptRoles)) return

      let trapped = false
      const trap = () => {
        if (isExempt(exemptRoles)) return
        if (trapped) return
        trapped = true
        const check = () => {
          if (isExempt(exemptRoles)) {
            trapped = false
            return
          }
          // 暫時禁用 debugger 語句，避免影響開發
          // 只使用其他檢測手段
          setTimeout(check, Math.random() * 1000 + 500)
        }
        check()
      }
      trap()
    }

    function timingCheck(
      exemptRoles: string[],
      cfg: { intervalMs: number; maxDeltaMs: number; consecutive: number }
    ) {
      let lastTime = Date.now()
      let suspiciousCount = 0

      const tick = () => {
        if (isExempt(exemptRoles)) return

        // 失焦或頁面背景化時，暫停檢測並重置計數，避免誤判
        if (document.hidden || !document.hasFocus()) {
          lastTime = Date.now()
          suspiciousCount = 0
          return
        }

        const now = Date.now()
        const delta = now - lastTime

        if (delta > cfg.maxDeltaMs) {
          suspiciousCount++
          if (suspiciousCount >= cfg.consecutive) {
            createOverlay('檢測到持續異常執行延遲。可能存在調試行為。')
            suspiciousCount = 0
          }
        } else {
          if (suspiciousCount > 0) suspiciousCount--
        }
        lastTime = now
      }

      setInterval(tick, cfg.intervalMs)
    }

    function stackTraceCheck(exemptRoles: string[]) {
      const original = Error.prepareStackTrace
      Error.prepareStackTrace = (err, stack) => {
        if (isExempt(exemptRoles)) {
          return original ? original(err, stack) : stack
        }
        const stackStr = stack.toString()
        if (stackStr.includes('webpack') || stackStr.includes('eval') || stackStr.includes('devtools')) {
          createOverlay('檢測到可疑堆棧追蹤。')
        }
        return original ? original(err, stack) : stack
      }
    }

    function integrityCheck(exemptRoles: string[]) {
      const scripts = Array.from(document.getElementsByTagName('script'))
      const checksums = new Map<string, string>()

      scripts.forEach(script => {
        if (script.src) {
          checksums.set(script.src, script.integrity || '')
        }
      })

      setInterval(() => {
        if (isExempt(exemptRoles)) return
        const currentScripts = Array.from(document.getElementsByTagName('script'))
        if (currentScripts.length !== scripts.length) {
          createOverlay('檢測到腳本注入。頁面完整性已被破壞。')
          setTimeout(() => window.location.reload(), 2000)
        }
      }, 3000)
    }

    function protectConsole(exemptRoles: string[]) {
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug,
        trace: console.trace,
        table: console.table,
        dir: console.dir,
        dirxml: console.dirxml,
        group: console.group,
        groupCollapsed: console.groupCollapsed,
        groupEnd: console.groupEnd,
        clear: console.clear,
      }

      const noop = () => {}

      const checkAndRestore = () => {
        if (isExempt(exemptRoles)) {
          Object.assign(console, originalConsole)
          return true
        }
        return false
      }

      if (!checkAndRestore()) {
        Object.keys(originalConsole).forEach(key => {
          (console as any)[key] = noop
        })
      }

      const restoreInterval = setInterval(() => {
        if (checkAndRestore()) {
          clearInterval(restoreInterval)
        }
      }, 1200)

      window.addEventListener('beforeunload', () => clearInterval(restoreInterval))
    }

    function initAntiInspect(opts: Options = {}) {
      const enabled = opts.enabled ?? ((import.meta as any).env.VITE_ANTI_INSPECT !== '0')
      if (!enabled) return

      const exemptRoles = opts.exemptRoles ?? ['dev_admin']

      // 調試信息：檢查豁免狀態
      const roleLS = localStorage.getItem('role') || ''
      const roleJWT = getJwtRole()
      const exemptFlag = localStorage.getItem('FK_ANTI_INSPECT_EXEMPT') === '1'

      console.log('[AntiInspect] Debug Info:', {
        roleLS,
        roleJWT,
        exemptFlag,
        exemptRoles,
        isExempt: isExempt(exemptRoles)
      })

      // Console 保護永遠啟動（會自動檢測豁免並恢復）
      protectConsole(exemptRoles)

      // 如果是豁免用戶，完全不啟動任何反調試機制
      if (isExempt(exemptRoles)) {
        console.log('[AntiInspect] ✅ dev_admin detected, all protections disabled')
        return
      }

      console.log('[AntiInspect] ⚠️ Starting protection mechanisms for non-admin user')

      // 只對非豁免用戶啟動這些機制
      debuggerTrap(exemptRoles)
      const intervalMs = Number(
        (opts.timingIntervalMs ?? (import.meta as any).env.VITE_ANTI_TIMING_INTERVAL_MS ?? 1500) as any
      )
      const maxDeltaMs = Number(
        (opts.timingMaxDeltaMs ?? (import.meta as any).env.VITE_ANTI_TIMING_MAX_DELTA_MS ?? 30000) as any
      )
      const consecutive = Number(
        (opts.timingConsecutive ?? (import.meta as any).env.VITE_ANTI_TIMING_CONSECUTIVE ?? 5) as any
      )
      timingCheck(exemptRoles, { intervalMs, maxDeltaMs, consecutive })
      stackTraceCheck(exemptRoles)
      integrityCheck(exemptRoles)

      let active = true

      // 1) 透過 console formatter 偵測（對 Chrome 有效）：
      //    使用 RegExp.toString 被 console 取值時觸發，僅在 DevTools 開啟與聚焦面板時機率高
      const consoleProbe = () => {
        if (!active || isExempt(exemptRoles)) return
        let tripped = false
        const re: any = /fk_anti_inspect_probe/ as any
        const orig = re.toString
        try {
          re.toString = function () {
            tripped = true
            return orig.call(this)
          }
        } catch {}
        try { console.log(re) } catch {}
        setTimeout(() => {
          if (!active || isExempt(exemptRoles)) return
          if (tripped) {
            createOverlay(opts.message || '偵測到瀏覽器開發者工具。非管理員請勿檢視或嘗試修改頁面。若有疑問，請聯繫管理員。')
          }
          try { re.toString = orig } catch {}
        }, 0)
      }

      const onContext = (e: Event) => { if (!active) return; e.preventDefault() }
      window.addEventListener('contextmenu', onContext)

      const onKeydown = (e: KeyboardEvent) => {
        if (!active) return
        const k = e.key.toLowerCase()
        const ctrl = e.ctrlKey || e.metaKey
        if (
          k === 'f12' ||
          (ctrl && e.shiftKey && ['i','j','c'].includes(k)) ||
          (ctrl && k === 'u')
        ) {
          e.preventDefault()
          e.stopPropagation()
          createOverlay(opts.message || '偵測到開發者工具快捷鍵。為了平台安全與公平，請勿嘗試檢視或修改頁面程式。若你有研究需求，歡迎向管理員申請開發者權限。')
        }
      }
      window.addEventListener('keydown', onKeydown, { capture: true })

      // 2) 立即與即時偵測：視窗尺寸變化（使用者以選單開啟面板）
      const onResize = () => {
        if (!active || isExempt(exemptRoles)) return
        if (isDevtoolsOpen(exemptRoles)) {
          createOverlay(opts.message || '偵測到瀏覽器開發者工具。非管理員請勿檢視或嘗試修改頁面。若有疑問，請聯繫管理員。')
        }
      }
      window.addEventListener('resize', onResize, { passive: true })

      const interval = setInterval(() => {
        try {
          if (isExempt(exemptRoles)) {
            active = false
            window.removeEventListener('contextmenu', onContext)
            window.removeEventListener('keydown', onKeydown, true as any)
            window.removeEventListener('resize', onResize, true as any)
            clearInterval(interval)
            const ov = document.getElementById('fk-anti-inspect-overlay')
            if (ov) ov.remove()
            return
          }
          // 定時檢測（視窗 + console probe）
          if (active && (isDevtoolsOpen(exemptRoles))) {
            createOverlay(opts.message || '偵測到瀏覽器開發者工具。非管理員請勿檢視或嘗試修改頁面。若有疑問，請聯繫管理員。')
          }
          consoleProbe()
        } catch {}
      }, 1200)

      window.addEventListener('beforeunload', () => clearInterval(interval))

      // 3) 避免覆蓋層被移除：監聽刪除行為並自動還原
      try {
        const mo = new MutationObserver(() => {
          if (!active || isExempt(exemptRoles)) return
          const ov = document.getElementById('fk-anti-inspect-overlay')
          if (!ov && isDevtoolsOpen(exemptRoles)) {
            createOverlay(opts.message || '偵測到瀏覽器開發者工具。非管理員請勿檢視或嘗試修改頁面。若有疑問，請聯繫管理員。')
          }
        })
        mo.observe(document.documentElement, { childList: true, subtree: true })
        window.addEventListener('beforeunload', () => mo.disconnect())
      } catch {}
    }

    // Automatically run the initialization
    initAntiInspect({ enabled: true });
})();
