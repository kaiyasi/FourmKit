import React from 'react'
import { usePlatform } from '@/hooks/usePlatform'
import { NavBar } from './NavBar'
import { MobileBottomNav } from './MobileBottomNav'

interface PlatformNavigationProps {
  pathname: string
  showMobileNav?: boolean
  showDesktopNav?: boolean
  mobileNavProps?: any
  desktopNavProps?: any
}

/**
 * 平台特定導航組件
 * 根據設備類型顯示不同的導航
 */
export function PlatformNavigation({
  pathname,
  showMobileNav = true,
  showDesktopNav = true,
  mobileNavProps = {},
  desktopNavProps = {}
}: PlatformNavigationProps) {
  const { isMobile, isDesktop } = usePlatform()

  return (
    <>
      {/* 桌面導航 */}
      {isDesktop && showDesktopNav && (
        <NavBar pathname={pathname} {...desktopNavProps} />
      )}
      
      {/* 手機底部導航 */}
      {isMobile && showMobileNav && (
        <MobileBottomNav {...mobileNavProps} />
      )}
    </>
  )
}

/**
 * 手機專用導航組件
 */
export function MobileNavigation({ pathname, ...props }: { pathname: string } & any) {
  const { isMobile } = usePlatform()
  
  if (!isMobile) {
    return null
  }
  
  return <MobileBottomNav {...props} />
}

/**
 * 桌面專用導航組件
 */
export function DesktopNavigation({ pathname, ...props }: { pathname: string } & any) {
  const { isDesktop } = usePlatform()
  
  if (!isDesktop) {
    return null
  }
  
  return <NavBar pathname={pathname} {...props} />
}
