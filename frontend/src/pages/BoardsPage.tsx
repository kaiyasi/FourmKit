import { useEffect, useState } from 'react'
import PostList from '@/components/PostList'
import { MobilePostList } from '@/components/mobile/MobilePostList'
import { PageLayout } from '@/components/layout/PageLayout'
import MobileHeader from '@/components/MobileHeader'
import FilterBar from '@/components/FilterBar'

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
      <PageLayout pathname="/boards">
        <div className="sm:hidden text-center py-2 mb-1">
        <div className="h-2" />
          <h1 className="text-3xl font-extrabold dual-text tracking-wide leading-tight">ForumKit</h1>
          <p className="text-base text-muted -mt-1">新世紀校園匿名平台</p>
        </div>
        <MobilePostList injectedItems={injected} showAll={true} />
      </PageLayout>
    )
  }

  // 桌面版使用原有佈局
  return (
    <PageLayout pathname="/boards" maxWidth="max-w-5xl">
      {/* 頁首 */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold dual-text">貼文</h1>
        <p className="text-sm text-muted mt-1">瀏覽已審核通過的貼文。依目前選擇的學校載入貼文。</p>
      </div>

      {/* 貼文清單（含封面與張數徽章） */}
      <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 shadow-soft">
        <FilterBar />
        <PostList injectedItems={injected} showAll={true} />
      </div>
    </PageLayout>
  )
}
