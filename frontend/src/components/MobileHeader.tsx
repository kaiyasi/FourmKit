import React from 'react'
import { usePlatform } from '@/hooks/usePlatform'

export default function MobileHeader({ subtitle }: { subtitle: string }) {
  // 以畫面寬度為準（與 BoardsPage 一致），避免 UA 導致 iPad/桌面模式誤判
  const { isSmallScreen } = usePlatform()
  if (!isSmallScreen) return null
  return (
    <div className="text-center mb-4 sm:hidden">
      <h1 className="text-2xl font-extrabold dual-text tracking-wide">ForumKit</h1>
      <p className="text-sm text-muted">{subtitle}</p>
    </div>
  )
}
