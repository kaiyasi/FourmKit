import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import FontManagement from '@/components/admin/FontManagement'

export default function FontManagementPage() {
  const { role } = useAuth()

  // 檢查權限，如果是 cross_admin 則重定向到主控台
  if (role === 'cross_admin') {
    window.location.href = '/admin'
    return null
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/fonts" />
      <MobileBottomNav />

      <FontManagement
        isOpen={true}
        onClose={() => window.location.href = '/admin'}
      />
    </div>
  )
}