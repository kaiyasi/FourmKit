import { useEffect, useState } from 'react'
import PostComposer from '../components/PostComposer'
import { PageLayout } from '@/components/layout/PageLayout'
import MobileHeader from '@/components/MobileHeader'


export default function CreatePostPage() {
  const [isMobile, setIsMobile] = useState(false)

  const token = localStorage.getItem("token") || '';

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 手機版仍使用同一佈局，但卡片與排版調整為接近電腦版首頁的發文樣式

  return (
    <PageLayout pathname="/create" maxWidth="max-w-2xl">
      {/* Header（沿用桌面首頁風格，縮減間距以適應手機） */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold dual-text">發布新貼文</h1>
        <p className="text-sm text-muted mt-1">創建新的討論話題，支援文字、圖片和影片。</p>
      </div>
      
      {/* Composer Card（沿用桌面卡片樣式，行動版保留貼底操作欄） */}
      <div className="bg-surface border border-border rounded-2xl shadow-soft mb-20 md:mb-4 p-4 sm:p-6 overflow-hidden">
        <PostComposer token={token} />
        {!token && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <strong>匿名模式：</strong> 您目前以匿名身分發文，系統會以裝置識別碼標示來源。如需管理權限，請先登入。
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}