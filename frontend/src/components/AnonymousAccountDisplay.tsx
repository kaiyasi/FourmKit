import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { generateAnonymousCode, isSystemDemo } from '@/utils/client'

interface AnonymousAccountDisplayProps {
  className?: string
  showIcon?: boolean
}

export default function AnonymousAccountDisplay({ 
  className = '', 
  showIcon = false 
}: AnonymousAccountDisplayProps) {
  const { isLoggedIn, username } = useAuth()
  
  const getDisplayText = () => {
    // 如果是預填內容，顯示「系統展示」
    if (isSystemDemo()) {
      return '系統展示'
    }
    
    // 如果已登入，顯示帳號名稱
    if (isLoggedIn && username) {
      return username
    }
    
    // 未登入，顯示6碼唯一碼
    return generateAnonymousCode()
  }
  
  const getDisplayClass = () => {
    if (isSystemDemo()) {
      return 'text-fg'
    }
    if (isLoggedIn) {
      return 'text-fg'
    }
    return 'text-muted'
  }
  
  return (
    <span className={`text-sm font-medium ${getDisplayClass()} ${className}`}>
      {showIcon && (
        <span className="mr-1">
          {isSystemDemo() ? '🔧' : isLoggedIn ? '👤' : '🕵️'}
        </span>
      )}
      {getDisplayText()}
    </span>
  )
}
