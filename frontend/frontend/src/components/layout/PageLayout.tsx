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
      
      <main className={`mx-auto ${maxWidth} px-3 sm:px-4 md:px-6 pt-20 sm:pt-24 md:pt-28 pb-32 md:pb-8 mobile-navbar-spacing ${className}`}>
        {children}
      </main>
    </div>
  )
}
