import React from 'react'
import { usePlatform } from '@/hooks/usePlatform'

interface PlatformLayoutProps {
  children: React.ReactNode
  mobileComponent?: React.ComponentType<any>
  desktopComponent?: React.ComponentType<any>
  tabletComponent?: React.ComponentType<any>
  mobileProps?: any
  desktopProps?: any
  tabletProps?: any
  fallback?: React.ReactNode
}

/**
 * 平台特定佈局組件
 * 根據設備類型渲染不同的組件
 */
export function PlatformLayout({
  children,
  mobileComponent: MobileComponent,
  desktopComponent: DesktopComponent,
  tabletComponent: TabletComponent,
  mobileProps = {},
  desktopProps = {},
  tabletProps = {},
  fallback
}: PlatformLayoutProps) {
  const { isMobile, isTablet, isDesktop } = usePlatform()

  if (isMobile && MobileComponent) {
    return <MobileComponent {...mobileProps} />
  }
  
  if (isTablet && TabletComponent) {
    return <TabletComponent {...tabletProps} />
  }
  
  if (isDesktop && DesktopComponent) {
    return <DesktopComponent {...desktopProps} />
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * 手機專用佈局組件
 */
export function MobileLayout({ children, ...props }: { children: React.ReactNode } & any) {
  const { isMobile } = usePlatform()
  
  if (!isMobile) {
    return null
  }
  
  return <div {...props}>{children}</div>
}

/**
 * 桌面專用佈局組件
 */
export function DesktopLayout({ children, ...props }: { children: React.ReactNode } & any) {
  const { isDesktop } = usePlatform()
  
  if (!isDesktop) {
    return null
  }
  
  return <div {...props}>{children}</div>
}

/**
 * 平板專用佈局組件
 */
export function TabletLayout({ children, ...props }: { children: React.ReactNode } & any) {
  const { isTablet } = usePlatform()
  
  if (!isTablet) {
    return null
  }
  
  return <div {...props}>{children}</div>
}

/**
 * 響應式容器組件
 * 根據平台提供不同的樣式和佈局
 */
export function ResponsiveContainer({ 
  children, 
  className = "",
  mobileClassName = "",
  desktopClassName = "",
  tabletClassName = ""
}: {
  children: React.ReactNode
  className?: string
  mobileClassName?: string
  desktopClassName?: string
  tabletClassName?: string
}) {
  const { isMobile, isTablet, isDesktop } = usePlatform()
  
  let responsiveClassName = className
  
  if (isMobile && mobileClassName) {
    responsiveClassName += ` ${mobileClassName}`
  } else if (isTablet && tabletClassName) {
    responsiveClassName += ` ${tabletClassName}`
  } else if (isDesktop && desktopClassName) {
    responsiveClassName += ` ${desktopClassName}`
  }
  
  return (
    <div className={responsiveClassName}>
      {children}
    </div>
  )
}
