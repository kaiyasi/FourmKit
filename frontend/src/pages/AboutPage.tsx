import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PageLayout } from '@/components/layout/PageLayout'
import MobileHeader from '@/components/MobileHeader'

export default function AboutPage() {
  const { pathname } = useLocation()
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState('')
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null)
        const r = await fetch('/api/pages/about', { cache: 'no-store' })
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
    <PageLayout pathname={pathname} maxWidth="max-w-3xl">
      <MobileHeader subtitle="About" />
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
        <h1 className="text-2xl font-semibold dual-text mb-3">關於我們</h1>
        {loading ? (
          <div className="text-muted">載入中...</div>
        ) : error ? (
          <div className="text-rose-600">{error}</div>
        ) : (
          <div className="prose prose-sm max-w-none text-fg prose-rules" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </PageLayout>
  )
}
