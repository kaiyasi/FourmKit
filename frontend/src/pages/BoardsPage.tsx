import { useEffect, useState } from 'react'
import PostList from '@/components/PostList'
import { MobilePostList } from '@/components/mobile/MobilePostList'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { NavBar } from '@/components/layout/NavBar'

export default function BoardsPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [injected, setInjected] = useState<any[]>([])

  // 響應式檢測
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 手機版使用專用組件
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* 頂部標題欄 */}
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border px-4 py-3">
          <h1 className="font-semibold text-lg text-fg">討論看板</h1>
          <p className="text-sm text-muted">校園匿名討論</p>
        </header>

        {/* 貼文列表 */}
        <div className="flex-1">
          <MobilePostList injectedItems={injected} />
        </div>

        {/* 底部導航 */}
        <MobileBottomNav />
      </div>
    )
  }

  // 桌面版使用原有佈局
  return (
    <div className="min-h-screen">
      <NavBar pathname="/boards" />

      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">看板</h1>
          <p className="text-sm text-muted mt-1">瀏覽已審核通過的貼文。依目前選擇的學校載入貼文。</p>
        </div>

        {/* 貼文清單（含封面與張數徽章） */}
        <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 shadow-soft">
          <PostList injectedItems={injected} />
        </div>
      </main>
    </div>
  )
}
