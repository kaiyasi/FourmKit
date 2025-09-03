import { useState, useEffect } from 'react'

export interface PlatformInfo {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isSmallScreen: boolean
  isTinyScreen: boolean
  screenWidth: number
  screenHeight: number
  orientation: 'portrait' | 'landscape'
  deviceType: 'mobile' | 'tablet' | 'desktop'
  userAgent: string
  isTouchDevice: boolean
}

export function usePlatform(): PlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    isSmallScreen: false,
    isTinyScreen: false,
    screenWidth: 0,
    screenHeight: 0,
    orientation: 'portrait',
    deviceType: 'desktop',
    userAgent: '',
    isTouchDevice: false
  })

  useEffect(() => {
    const updatePlatformInfo = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const userAgent = navigator.userAgent
      
      // 檢測觸控設備
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      
      // 檢測設備類型
      const isMobileDevice = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      const isTabletDevice = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/i.test(userAgent) || 
                            (width >= 768 && width <= 1024 && isTouchDevice)
      
      // 螢幕尺寸分類
      const isSmallScreen = width < 768
      const isTinyScreen = width < 640
      
      // 設備類型判斷
      let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop'
      if (isMobileDevice && !isTabletDevice) {
        deviceType = 'mobile'
      } else if (isTabletDevice || (width >= 768 && width <= 1024)) {
        deviceType = 'tablet'
      }
      
      // 方向檢測
      const orientation = width > height ? 'landscape' : 'portrait'
      
      setPlatformInfo({
        isMobile: deviceType === 'mobile',
        isTablet: deviceType === 'tablet',
        isDesktop: deviceType === 'desktop',
        isSmallScreen,
        isTinyScreen,
        screenWidth: width,
        screenHeight: height,
        orientation,
        deviceType,
        userAgent,
        isTouchDevice
      })
    }

    // 初始化
    updatePlatformInfo()
    
    // 監聽視窗大小變化
    window.addEventListener('resize', updatePlatformInfo)
    window.addEventListener('orientationchange', updatePlatformInfo)
    
    return () => {
      window.removeEventListener('resize', updatePlatformInfo)
      window.removeEventListener('orientationchange', updatePlatformInfo)
    }
  }, [])

  return platformInfo
}

// 平台特定的斷點常量
export const PLATFORM_BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
  DESKTOP: 1025,
  TINY: 640,
  SMALL: 768,
  MEDIUM: 1024,
  LARGE: 1280,
  XLARGE: 1536
} as const

// 平台特定的 Hook
export function useMobile() {
  const { isMobile } = usePlatform()
  return isMobile
}

export function useDesktop() {
  const { isDesktop } = usePlatform()
  return isDesktop
}

export function useTablet() {
  const { isTablet } = usePlatform()
  return isTablet
}

export function useSmallScreen() {
  const { isSmallScreen } = usePlatform()
  return isSmallScreen
}
