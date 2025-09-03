import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { clearSession, saveSession, isLoggedIn, getRole, getSchoolId, Role } from '@/utils/auth'

interface AuthContextType {
  isLoggedIn: boolean
  role: Role
  schoolId: number | null
  username: string | null
  login: (
    token: string,
    role: Role,
    schoolId: number | null,
    refreshToken?: string,
    username?: string,
    rememberUsername?: boolean
  ) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState({
    isLoggedIn: isLoggedIn(),
    role: getRole(),
    schoolId: getSchoolId(),
    // 先讀 localStorage（使用者有勾記住），否則退回 sessionStorage（僅本分頁／本次瀏覽）
    username: localStorage.getItem('username') || sessionStorage.getItem('username')
  })

  const login = (
    token: string,
    role: Role,
    schoolId: number | null,
    refreshToken?: string,
    username?: string,
    rememberUsername?: boolean
  ) => {
    saveSession(token, role, schoolId, refreshToken)
    // 僅在勾選「記住我的帳號」時，才寫入 localStorage；否則寫入 sessionStorage
    if (username) {
      try {
        if (rememberUsername) {
          sessionStorage.removeItem('username')
          localStorage.setItem('username', username)
        } else {
          localStorage.removeItem('username')
          sessionStorage.setItem('username', username)
        }
      } catch {}
    }
    setAuthState({
      isLoggedIn: true,
      role,
      schoolId,
      username: username || null
    })
  }

  const logout = () => {
    clearSession()
    // 清除兩邊的暱稱儲存，避免殘留
    try { localStorage.removeItem('username') } catch {}
    try { sessionStorage.removeItem('username') } catch {}
    setAuthState({
      isLoggedIn: false,
      role: 'guest',
      schoolId: null,
      username: null
    })
  }

  // 監聽 localStorage 變化（跨標籤頁同步）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'role' || e.key === 'school_id' || e.key === 'username') {
        setAuthState({
          isLoggedIn: isLoggedIn(),
          role: getRole(),
          schoolId: getSchoolId(),
          // 優先 localStorage，其次 sessionStorage
          username: localStorage.getItem('username') || sessionStorage.getItem('username')
        })
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <AuthContext.Provider value={{
      isLoggedIn: authState.isLoggedIn,
      role: authState.role,
      schoolId: authState.schoolId,
      username: authState.username,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
