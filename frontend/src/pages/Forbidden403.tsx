import { ShieldAlert, Home, ArrowLeft } from 'lucide-react'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

export default function Forbidden403() {
  return (
    <div className="min-h-screen grid place-items-center p-6 pb-24">
      <div className="max-w-lg w-full rounded-2xl border border-border bg-surface p-6 shadow-soft text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-3">
          <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-300" />
        </div>
        <h1 className="text-2xl font-bold dual-text mb-1">沒有權限</h1>
        <p className="text-sm text-muted mb-4">你沒有存取此頁面的權限，或需要更高的角色身份。</p>
        <div className="flex items-center justify-center gap-3">
          <a href="/" className="px-3 py-2 rounded-xl border hover:bg-surface/80 flex items-center gap-2">
            <Home className="w-4 h-4" /> 回到首頁
          </a>
          <button onClick={() => history.back()} className="px-3 py-2 rounded-xl border hover:bg-surface/80 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> 返回上一頁
          </button>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  )
}
