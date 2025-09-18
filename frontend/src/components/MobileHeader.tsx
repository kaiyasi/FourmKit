import React from 'react'
import { usePlatform } from '@/hooks/usePlatform'

export default function MobileHeader({ subtitle }: { subtitle: string }) {
  const { isMobile } = usePlatform()
  if (!isMobile) return null
  return (
    <div className="text-center mb-4 sm:hidden">
      <h1 className="text-2xl font-extrabold dual-text tracking-wide">ForumKit</h1>
      <p className="text-sm text-muted">{subtitle}</p>
    </div>
  )
}

