import React, { useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import AnonymousAccountDisplay from '@/components/AnonymousAccountDisplay'
import { useAuth } from '@/contexts/AuthContext'
import { generateAnonymousCode, isSystemDemo } from '@/utils/client'

/**
 *
 */
export default function AnonymousTestPage() {
  const { isLoggedIn, username } = useAuth()
  const [demoMode, setDemoMode] = useState(false)

  const toggleDemoMode = () => {
    setDemoMode(!demoMode)
    if (!demoMode) {
      localStorage.setItem('forumkit_demo_mode', 'true')
    } else {
      localStorage.removeItem('forumkit_demo_mode')
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/anonymous-test" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-4xl px-3 sm:px-4 sm:pt-24 md:pt-28 pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">匿名帳號測試</h1>
          <p className="text-sm text-muted mt-1">測試不同狀態下的匿名帳號顯示</p>
        </div>
        
        <div className="space-y-4">
          
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <h2 className="text-lg font-semibold dual-text mb-4">當前狀態</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">登入狀態：</span>
                <span className={`text-sm font-medium ${isLoggedIn ? 'text-green-600' : 'text-red-600'}`}>
                  {isLoggedIn ? '已登入' : '未登入'}
                </span>
              </div>
              {isLoggedIn && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">用戶名：</span>
                  <span className="text-sm font-medium text-green-600">{username}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">裝置唯一碼：</span>
                <span className="text-sm font-medium text-blue-600">{generateAnonymousCode()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">系統展示模式：</span>
                <span className={`text-sm font-medium ${isSystemDemo() ? 'text-blue-600' : 'text-gray-600'}`}>
                  {isSystemDemo() ? '啟用' : '停用'}
                </span>
              </div>
            </div>
          </div>

          
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <h2 className="text-lg font-semibold dual-text mb-4">顯示測試</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl">
                <span className="text-sm text-muted">發文者顯示：</span>
                <AnonymousAccountDisplay showIcon={true} />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl">
                <span className="text-sm text-muted">貼文列表顯示：</span>
                <div className="text-xs text-muted">
                  #{123} • 2025/8/24 下午11:28:21 • 
                  <AnonymousAccountDisplay />
                </div>
              </div>
            </div>
          </div>

          
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <h2 className="text-lg font-semibold dual-text mb-4">控制面板</h2>
            <div className="space-y-3">
              <button
                onClick={toggleDemoMode}
                className={`px-4 py-2 rounded-xl border transition-all ${
                  demoMode ? 'bg-blue-600 text-white' : 'bg-surface hover:bg-surface/80 border-border'
                }`}
              >
                {demoMode ? '停用' : '啟用'} 系統展示模式
              </button>
              
              <div className="text-xs text-muted">
                <p>• 系統展示模式：顯示「系統展示」</p>
                <p>• 已登入：顯示用戶名</p>
                <p>• 未登入：顯示6碼唯一碼</p>
              </div>
            </div>
          </div>

          
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <h2 className="text-lg font-semibold dual-text mb-4">功能說明</h2>
            <div className="space-y-2 text-sm text-muted">
              <p>• <strong>已登入</strong>：顯示實際的帳號名稱</p>
              <p>• <strong>未登入</strong>：顯示基於裝置識別碼生成的6碼唯一碼</p>
              <p>• <strong>系統展示</strong>：顯示「系統展示」標識</p>
              <p>• <strong>6碼唯一碼</strong>：同一裝置每次顯示相同，不同裝置顯示不同</p>
              <p>• <strong>可重現性</strong>：基於裝置識別碼生成，可以通過6碼猜測可能是同一裝置</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
