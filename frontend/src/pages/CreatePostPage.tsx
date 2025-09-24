import { useEffect, useState } from 'react'
import PostComposer from '../components/PostComposer'
import { PageLayout } from '@/components/layout/PageLayout'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import MobileHeader from '@/components/MobileHeader'
import { usePlatform } from '@/hooks/usePlatform'

export default function CreatePostPage() {
  // 與 BoardsPage 一致：以寬度（<768px）決定行動版版型
  const { isSmallScreen } = usePlatform()
  const token = localStorage.getItem("token") || '';

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 手機版發文頁面（以寬度偵測）
  if (isSmallScreen) {
    return (
      <PageLayout pathname="/create">
        <MobileHeader subtitle="分享想法" showBack={true} />

        {/* 發文提示卡片 */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-4 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="font-medium text-blue-900 dark:text-blue-100">創建新貼文</h2>
              <p className="text-sm text-blue-700 dark:text-blue-300">分享您的想法，支援文字、圖片和 Markdown 格式</p>
            </div>
          </div>
        </div>

        {/* 主要編輯器卡片 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft mb-20 overflow-hidden">
          <PostComposer token={token} />
        </div>

        {/* 匿名模式提示 */}
        {!token && (
          <div className="mx-4 mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>匿名模式</strong>
                  <p className="text-xs mt-1 opacity-90">系統會以裝置識別碼標示您的貼文來源</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageLayout>
    )
  }

  // 桌面版發文頁面
  return (
    <PageLayout pathname="/create">
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
    </PageLayout>
  )
}
