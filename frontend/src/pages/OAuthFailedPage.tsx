import React from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react'

export default function OAuthFailedPage() {
  return (
    <PageLayout pathname="/error/oauth-failed">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft max-w-lg mx-auto text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
        <h1 className="text-xl font-semibold dual-text mb-2">Google 登入失敗</h1>
        <p className="text-sm text-muted mb-6">授權流程未完成或驗證被拒絕。請稍後重試，或改用其他方式登入。</p>

        <div className="flex items-center justify-center gap-3">
          <a href="/api/auth/google/login" className="btn-primary inline-flex items-center gap-2 px-4 py-2">
            <RefreshCw className="w-4 h-4" />
            重新嘗試 Google 登入
          </a>
          <a href="/auth" className="btn-secondary inline-flex items-center gap-2 px-4 py-2">
            <LogIn className="w-4 h-4" />
            返回登入頁
          </a>
        </div>
      </div>
    </PageLayout>
  )
}

