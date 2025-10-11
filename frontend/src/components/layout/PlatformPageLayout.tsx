import React from 'react'
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformNavigation } from './PlatformNavigation'

interface PlatformPageLayoutProps {
  children: React.ReactNode
  pathname: string
  className?: string
  maxWidth?: string
  mobileClassName?: string
  desktopClassName?: string
  tabletClassName?: string
  mobileMaxWidth?: string
  desktopMaxWidth?: string
  tabletMaxWidth?: string
  showNavigation?: boolean
  navigationProps?: any
}

/**
 * 平台特定頁面佈局組件
 * 根據設備類型提供不同的頁面佈局
 */
export function PlatformPageLayout({
  children,
  pathname,
  className = "",
  maxWidth = "max-w-4xl",
  mobileClassName = "",
  desktopClassName = "",
  tabletClassName = "",
  mobileMaxWidth = "max-w-full",
  desktopMaxWidth = "max-w-4xl",
  tabletMaxWidth = "max-w-3xl",
  showNavigation = true,
  navigationProps = {}
}: PlatformPageLayoutProps) {
  const { isMobile, isTablet, isDesktop } = usePlatform()
  
  let responsiveClassName = className
  let responsiveMaxWidth = maxWidth
  
  if (isMobile) {
    responsiveClassName += ` ${mobileClassName}`
    responsiveMaxWidth = mobileMaxWidth
  } else if (isTablet) {
    responsiveClassName += ` ${tabletClassName}`
    responsiveMaxWidth = tabletMaxWidth
  } else if (isDesktop) {
    responsiveClassName += ` ${desktopClassName}`
    responsiveMaxWidth = desktopMaxWidth
  }

  return (
    <div className="min-h-screen min-h-dvh">
      
      {showNavigation && (
        <PlatformNavigation pathname={pathname} {...navigationProps} />
      )}
      
      
      <main className={`mx-auto ${responsiveMaxWidth} px-3 sm:px-4 md:px-6 page-content ${responsiveClassName}`}>
        {children}
      </main>
    </div>
  )
}

/**
 * 手機專用頁面佈局
 */
export function MobilePageLayout({
  children,
  pathname,
  className = "",
  maxWidth = "max-w-full",
  showNavigation = true,
  navigationProps = {}
}: {
  children: React.ReactNode
  pathname: string
  className?: string
  maxWidth?: string
  showNavigation?: boolean
  navigationProps?: any
}) {
  const { isMobile } = usePlatform()
  
  if (!isMobile) {
    return null
  }
  
  return (
    <div className="min-h-screen min-h-dvh">
      {showNavigation && (
        <PlatformNavigation pathname={pathname} showDesktopNav={false} {...navigationProps} />
      )}
      
      <main className={`mx-auto ${maxWidth} px-3 sm:px-4 page-content ${className}`}>
        {children}
      </main>
    </div>
  )
}

/**
 * 桌面專用頁面佈局
 */
export function DesktopPageLayout({
  children,
  pathname,
  className = "",
  maxWidth = "max-w-4xl",
  showNavigation = true,
  navigationProps = {}
}: {
  children: React.ReactNode
  pathname: string
  className?: string
  maxWidth?: string
  showNavigation?: boolean
  navigationProps?: any
}) {
  const { isDesktop } = usePlatform()
  
  if (!isDesktop) {
    return null
  }
  
  return (
    <div className="min-h-screen">
      {showNavigation && (
        <PlatformNavigation pathname={pathname} showMobileNav={false} {...navigationProps} />
      )}
      
      <main className={`mx-auto ${maxWidth} px-4 md:px-6 page-content ${className}`}>
        {children}
      </main>
    </div>
  )
}

/**
 * 平板專用頁面佈局
 */
export function TabletPageLayout({
  children,
  pathname,
  className = "",
  maxWidth = "max-w-3xl",
  showNavigation = true,
  navigationProps = {}
}: {
  children: React.ReactNode
  pathname: string
  className?: string
  maxWidth?: string
  showNavigation?: boolean
  navigationProps?: any
}) {
  const { isTablet } = usePlatform()
  
  if (!isTablet) {
    return null
  }
  
  return (
    <div className="min-h-screen">
      {showNavigation && (
        <PlatformNavigation pathname={pathname} {...navigationProps} />
      )}
      
      <main className={`mx-auto ${maxWidth} px-4 page-content ${className}`}>
        {children}
      </main>
    </div>
  )
}
