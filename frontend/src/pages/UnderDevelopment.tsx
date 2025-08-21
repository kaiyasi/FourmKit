import { Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export default function UnderDevelopment() {
  const { pathname } = useLocation()
  const name = (() => {
    if (pathname.startsWith('/settings/admin')) return '系統設定（管理）'
    if (pathname.startsWith('/settings/profile')) return '個人設定'
    if (pathname.startsWith('/admin')) return '後台主控台'
    if (pathname.startsWith('/boards')) return '貼文看板'
    if (pathname.startsWith('/about')) return '關於我們'
    if (pathname.startsWith('/rules')) return '版規'
    return '此頁面'
  })()

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
          <ThemeToggle />
          <span className="text-xs text-muted">主題</span>
        </div>
      </div>

      <div className="max-w-lg w-full rounded-2xl p-6 md:p-8 bg-surface/80 backdrop-blur border border-border shadow-soft text-center">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{name} 開發中</h1>
        <p className="text-muted mb-4">辛苦的工程師正在趕工，敬請期待！</p>
        <div className="text-xs text-muted mb-6">路徑：{pathname}</div>
        <div className="flex justify-center gap-3">
          <Link to="/" className="px-4 py-2 rounded-xl dual-btn font-semibold">回首頁</Link>
          <a href="https://github.com/" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-border">
            查看進度
          </a>
        </div>
      </div>
    </div>
  )
}

