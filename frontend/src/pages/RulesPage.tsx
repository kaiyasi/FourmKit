import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

export default function RulesPage() {
  const { pathname } = useLocation()
  // 主題初始化已由 theme.ts 統一處理，無需重複初始化
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState('')
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null)
        const r = await fetch('/api/pages/rules', { cache: 'no-store' })
        const j = await r.json()
        setHtml(String(j?.html || ''))
      } catch (e:any) {
        setError(e?.message || '載入失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="min-h-screen">
      <NavBar pathname={pathname} />
      <MobileBottomNav />
      <main className="mx-auto max-w-3xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
          <h1 className="text-xl sm:text-2xl font-semibold dual-text mb-3">社群規範</h1>
          {loading ? (
            <div className="text-muted">載入中...</div>
          ) : error ? (
            <div className="text-rose-600">{error}</div>
          ) : (
            <div className="prose prose-sm max-w-none text-fg" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </main>
    </div>
  )
}
