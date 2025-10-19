import React, { useState, useEffect } from 'react'
import AdminInstagramPage from '@/pages/admin/AdminInstagramPage'
import AdminInstagramMobilePage from '@/pages/admin/AdminInstagramMobilePage'

/**
 * 響應式 Instagram 管理頁面組件
 * 自動根據螢幕尺寸切換桌面版或手機版
 */
export default function ResponsiveInstagramAdmin() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      // 768px 以下視為手機版
      setIsMobile(window.innerWidth < 768)
    }

    // 初始檢查
    checkScreenSize()

    // 監聽視窗大小變化
    window.addEventListener('resize', checkScreenSize)

    // 清理事件監聽器
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // 根據螢幕尺寸返回對應的組件
  return isMobile ? <AdminInstagramMobilePage /> : <AdminInstagramPage />
}
