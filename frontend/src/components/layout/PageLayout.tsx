import React from 'react'
import { NavBar } from './NavBar'
import { MobileBottomNav } from './MobileBottomNav'

interface PageLayoutProps {
  children: React.ReactNode
  pathname: string
  className?: string
  maxWidth?: string
}

export function PageLayout({ 
  children, 
  pathname, 
  className = "", 
  maxWidth = "max-w-4xl" 
}: PageLayoutProps) {
  return (
    <div className="min-h-screen min-h-dvh">
      <NavBar pathname={pathname} />
      <MobileBottomNav />
      
      {/* 使用動態導覽高度與底部導航高度，避免被遮擋或頂到畫面 */}
      <main className={`mx-auto ${maxWidth} px-3 sm:px-4 md:px-6 page-content ${className}`}>
        {children}
      </main>
    </div>
  )
}
