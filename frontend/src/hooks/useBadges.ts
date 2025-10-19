import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSocket } from '@/socket'

type Counts = Record<string, number>

interface UseBadgesOptions {
  watched?: string[]
  useSocket?: boolean
  storagePrefix?: string
}

const DEFAULT_PREFIX = 'badge:'

/**
 *
 */
export function useBadges(opts: UseBadgesOptions = {}) {
  const { watched = [], useSocket = true, storagePrefix = DEFAULT_PREFIX } = opts
  const [counts, setCounts] = useState<Counts>(() => {
    const init: Counts = {}
    try {
      for (const p of watched) {
        const raw = localStorage.getItem(storagePrefix + p)
        const n = raw ? parseInt(raw, 10) : 0
        if (Number.isFinite(n) && n > 0) init[p] = Math.min(n, 99)
      }
    } catch {}
    return init
  })

  const apply = useCallback((path: string, n: number) => {
    setCounts(prev => {
      const next = { ...prev }
      if (!Number.isFinite(n) || n <= 0) delete next[path]
      else next[path] = Math.min(Math.floor(n), 99)
      return next
    })
    try {
      if (!Number.isFinite(n) || n <= 0) localStorage.removeItem(storagePrefix + path)
      else localStorage.setItem(storagePrefix + path, String(Math.min(Math.floor(n), 99)))
    } catch {}
  }, [storagePrefix])

  const inc = useCallback((path: string, delta = 1) => {
    const cur = counts[path] || 0
    apply(path, cur + delta)
  }, [counts, apply])

  const clear = useCallback((path: string) => apply(path, 0), [apply])

  const get = useCallback((path: string) => counts[path] || 0, [counts])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(storagePrefix)) return
      const path = e.key.replace(storagePrefix, '')
      const n = e.newValue ? parseInt(e.newValue, 10) : 0
      setCounts(prev => ({ ...prev, [path]: Number.isFinite(n) ? Math.min(Math.max(n, 0), 99) : 0 }))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storagePrefix])

  useEffect(() => {
    if (!useSocket) return
    let s: ReturnType<typeof getSocket> | null = null
    try {
      s = getSocket()
      const onUpdate = (payload: any) => {
        if (payload && typeof payload === 'object') {
          if (payload.path && typeof payload.count === 'number') {
            apply(String(payload.path), Number(payload.count))
          } else if (payload.counts && typeof payload.counts === 'object') {
            const c = payload.counts as Counts
            for (const k of Object.keys(c)) apply(k, c[k])
          }
        }
      }
      const onClear = (payload: any) => {
        if (!payload) return
        if (typeof payload === 'string') clear(payload)
        else if (payload.path) clear(String(payload.path))
      }
      s.on('badge.update', onUpdate)
      s.on('badge.clear', onClear)
      return () => {
        try { s?.off('badge.update', onUpdate) } catch {}
        try { s?.off('badge.clear', onClear) } catch {}
      }
    } catch {
      return
    }
  }, [apply, clear, useSocket])

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + (b || 0), 0), [counts])

  return { counts, get, set: apply, inc, clear, total }
}

export default useBadges

