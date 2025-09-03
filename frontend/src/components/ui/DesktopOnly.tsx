import { useEffect, useState } from 'react'

export default function DesktopOnly({ children, minWidth = 1024, title = '此功能僅支援電腦桌面', desc = '為確保操作體驗與資料可讀性，請使用電腦或大尺寸平板開啟。' }: { children: any; minWidth?: number; title?: string; desc?: string }) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < minWidth)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [minWidth])

  if (!isMobile) return children

  return (
    <main className="mx-auto max-w-xl px-4 sm:pt-24 md:pt-28 pb-24">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
        <h1 className="text-lg font-semibold dual-text mb-2">{title}</h1>
        <p className="text-sm text-muted">{desc}</p>
      </div>
    </main>
  )
}

