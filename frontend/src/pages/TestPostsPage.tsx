import { useEffect, useState } from 'react'
import PostList from '@/components/PostList'
import { MobilePostList } from '@/components/mobile/MobilePostList'
import { PageLayout } from '@/components/layout/PageLayout'
import FilterBar from '@/components/FilterBar'

/**
 *
 */
export default function TestPostsPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [injected, setInjected] = useState<any[]>([])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (isMobile) {
    return (
      <PageLayout pathname="/test-posts">
        <div className="space-y-6">
          
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <h2 className="text-lg font-semibold mb-3">首頁樣式（最新 10 則貼文）</h2>
            <MobilePostList injectedItems={injected} showAll={false} />
          </div>

          
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <h2 className="text-lg font-semibold mb-3">看板樣式（全部貼文）</h2>
            <MobilePostList injectedItems={injected} showAll={true} />
          </div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout pathname="/test-posts" maxWidth="max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <h2 className="text-lg font-semibold mb-3">首頁樣式（最新 10 則貼文）</h2>
          <FilterBar />
          <PostList injectedItems={injected} showAll={false} />
        </div>

        
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <h2 className="text-lg font-semibold mb-3">看板樣式（全部貼文）</h2>
          <FilterBar />
          <PostList injectedItems={injected} showAll={true} />
        </div>
      </div>
    </PageLayout>
  )
}
