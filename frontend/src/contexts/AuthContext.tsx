import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { clearSession, saveSession, isLoggedIn, getRole, getSchoolId, Role } from '@/utils/auth'

interface AuthContextType {
  isLoggedIn: boolean
  role: Role
  schoolId: number | null
  username: string | null
  login: (token: string, role: Role, schoolId: number | null, refreshToken?: string, username?: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState({
    isLoggedIn: isLoggedIn(),
    role: getRole(),
    schoolId: getSchoolId(),
    username: localStorage.getItem('username')
  })

  const login = (token: string, role: Role, schoolId: number | null, refreshToken?: string, username?: string) => {
    saveSession(token, role, schoolId, refreshToken)
    if (username) {
      localStorage.setItem('username', username)
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
    localStorage.removeItem('username')
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
          username: localStorage.getItem('username')
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
