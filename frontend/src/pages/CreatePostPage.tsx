import { useEffect, useState } from 'react'
import PostComposer from '../components/PostComposer'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { NavBar } from '@/components/layout/NavBar'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CreatePostPage() {
  const [isMobile, setIsMobile] = useState(false)
  const token = localStorage.getItem("token") || '';

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 手機版發文頁面
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        {/* 頂部導航 */}
        <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/boards"
              className="w-8 h-8 rounded-full hover:bg-surface-hover flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="font-semibold text-lg text-fg">發表貼文</h1>
              <p className="text-sm text-muted">匿名分享你的想法</p>
            </div>
          </div>
        </header>

        {/* 發文表單 */}
        <div className="flex-1 p-4 pb-24">
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <PostComposer token={token} />
            {!token && (
              <div className="mt-4 p-3 rounded-xl bg-warning/10 border border-warning/20">
                <div className="text-sm text-warning-text">
                  <strong>匿名模式：</strong> 您目前以匿名身分發文，系統會以裝置識別碼標示來源。
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部導航 */}
        <MobileBottomNav />
      </div>
    )
  }

  // 桌面版發文頁面
  return (
    <div className="min-h-screen">
      <NavBar pathname="/create" />
      
      <main className="mx-auto max-w-4xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">發布新貼文</h1>
          <p className="text-sm text-muted mt-1">創建新的討論話題，支援文字、圖片和影片。</p>
        </div>
        
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
          <PostComposer token={token} />
          {!token && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <strong>匿名模式：</strong> 您目前以匿名身分發文，系統會以裝置識別碼標示來源。如需管理權限，請先登入。
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}