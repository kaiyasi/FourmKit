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

/**
 *
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState({
    isLoggedIn: isLoggedIn(),
    role: getRole(),
    schoolId: getSchoolId(),
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
    try { localStorage.removeItem('username') } catch {}
    try { sessionStorage.removeItem('username') } catch {}
    setAuthState({
      isLoggedIn: false,
      role: 'guest',
      schoolId: null,
      username: null
    })
  }

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'role' || e.key === 'school_id' || e.key === 'username') {
        setAuthState({
          isLoggedIn: isLoggedIn(),
          role: getRole(),
          schoolId: getSchoolId(),
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

/**
 *
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
