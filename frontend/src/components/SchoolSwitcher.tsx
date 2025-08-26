import { useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'

type School = { id: number; slug: string; name: string }

function getStoredSchool(): string | null {
  try { return localStorage.getItem('school_slug') } catch { return null }
}

function setStoredSchool(slug: string | null) {
  try {
    if (slug) {
      localStorage.setItem('school_slug', slug)
      // 同步其他可能被讀取的 key，避免不同頁面取值不一致
      localStorage.setItem('current_school_slug', slug)
      localStorage.setItem('selected_school_slug', slug)
    } else {
      localStorage.removeItem('school_slug')
      localStorage.removeItem('current_school_slug')
      localStorage.removeItem('selected_school_slug')
    }
    // 通知全域有變更
    window.dispatchEvent(new CustomEvent('fk_school_changed', { detail: { slug } }))
  } catch {}
}

export default function SchoolSwitcher({ compact = false }: { compact?: boolean }) {
  const [schools, setSchools] = useState<School[]>([])
  const [slug, setSlug] = useState<string | null>(getStoredSchool())
  const [open, setOpen] = useState(false)
  const [userSchoolId, setUserSchoolId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        // 獲取用戶的學校ID和角色
        const userResponse = await fetch('/api/auth/profile', {
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          }
        })
        let currentUserSchoolId = null
        let userRole = null
        if (userResponse.ok) {
          const userData = await userResponse.json()
          currentUserSchoolId = userData.school_id || null
          userRole = userData.role || null
          setUserSchoolId(currentUserSchoolId)
        }
        
        // 獲取學校清單
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        if (Array.isArray(j?.items)) {
          // 總管理員可以看到所有學校，其他用戶只能看到自己綁定的學校
          const filteredSchools = j.items.filter((school: School) => {
            if (userRole === 'dev_admin') {
              return true // 總管理員可以看到所有學校
            }
            return school.id === currentUserSchoolId // 其他用戶只能看到綁定的學校
          })
          setSchools(filteredSchools)

          // 如果使用者已有綁定學校，且尚未選擇任何 slug，預設為該學校
          if (!getStoredSchool() && currentUserSchoolId && filteredSchools.length > 0) {
            const defaultSchool = filteredSchools[0]
            setSlug(defaultSchool.slug)
            setStoredSchool(defaultSchool.slug)
          }
        }
      } catch {
        setSchools([])
      }
    })()
  }, [])

  // 監聽全域學校切換事件，與 localStorage 同步
  useEffect(() => {
    const onChanged = (e: any) => {
      setSlug(e?.detail?.slug ?? getStoredSchool())
    }
    window.addEventListener('fk_school_changed', onChanged as any)
    return () => window.removeEventListener('fk_school_changed', onChanged as any)
  }, [])

  const active = schools.find(s => s.slug === slug) || null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl border border-border bg-surface/70 hover:bg-surface whitespace-nowrap text-sm text-center w-20 flex-shrink-0 font-medium h-7`}
        title="切換學校"
      >
        {active
          ? (() => {
              const name = active.name || active.slug
              const short = name.length > 4 ? name.slice(0,4) + '…' : name
              return short
            })()
          : '跨校'}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 w-56 rounded-xl border border-border bg-surface shadow-soft p-1">
          <button
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${!slug ? 'bg-primary-100/60 dark:bg-primary-600/20' : 'hover:bg-surface/70'}`}
            onClick={() => {
              setSlug(null);
              setStoredSchool(null);
              setOpen(false);
              setToast('已切換至：跨校（全部）')
              setTimeout(() => setToast(null), 1800)
            }}
          >跨校（全部）</button>
          <div className="max-h-64 overflow-auto">
            {schools.map(s => (
              <button
                key={s.id}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${slug===s.slug ? 'bg-primary-100/60 dark:bg-primary-600/20' : 'hover:bg-surface/70'}`}
                onClick={() => {
                  setSlug(s.slug);
                  setStoredSchool(s.slug);
                  setOpen(false);
                  setToast(`已切換至：${s.name || s.slug}`)
                  setTimeout(() => setToast(null), 1800)
                }}
              >{s.name}</button>
            ))}
            {schools.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted">尚無學校，待首次註冊自動新增</div>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30" aria-live="polite" role="status">
          <div className="w-[92vw] max-w-[420px] rounded-2xl border border-border bg-surface shadow-xl p-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 mt-0.5 text-success" />
              <div className="flex-1 text-sm font-medium text-fg">{toast}</div>
              <button
                className="px-2 py-1 text-xs rounded-lg border hover:bg-surface/70"
                onClick={() => setToast(null)}
                aria-label="關閉通知"
              >知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
