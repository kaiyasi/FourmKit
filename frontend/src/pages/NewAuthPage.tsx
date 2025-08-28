/**
 * 全新的認證頁面
 * 整合 Google OAuth 優先的註冊登入流程
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useAuth } from '@/contexts/AuthContext'
import { NewAuthAPI } from '@/services/authApi'
import { validateEducationalEmail, isValidEducationalEmail } from '@/utils/emailValidation'
import { validatePasswordWithConfirmation } from '@/utils/passwordValidation'
import { validateUsername } from '@/utils/usernameValidation'
import QuickRegistrationForm from '@/components/auth/QuickRegistrationForm'
import DomainRestrictionPage, { ContactAdminPrompt } from '@/components/auth/DomainRestrictionPage'

type AuthFlow = 
  | 'initial'           // 初始狀態，顯示 Google 登入按鈕
  | 'traditional_login' // 傳統帳密登入
  | 'google_callback'   // 處理 Google 回調
  | 'quick_register'    // 快速註冊（Google 後）
  | 'domain_restricted' // 網域受限
  | 'contact_admin'     // 聯絡管理員
  | 'fallback_register' // 備援註冊（無 Google）

interface GoogleCallbackData {
  email: string
  name: string
  picture?: string
  verified_email: boolean
  requiresRegistration: boolean
}

export default function NewAuthPage() {
  const [flow, setFlow] = useState<AuthFlow>('initial')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Google 相關狀態
  const [googleData, setGoogleData] = useState<GoogleCallbackData | null>(null)
  
  // 表單狀態
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  // 聯絡管理員狀態
  const [adminContactMessage, setAdminContactMessage] = useState('')
  
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()

  // 處理 URL 參數和 Google 回調
  useEffect(() => {
    const handleUrlParams = async () => {
      // 檢查是否是 Google OAuth 回調
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')
      
      if (error) {
        setError('Google 登入被取消或發生錯誤')
        setFlow('initial')
        return
      }
      
      if (code) {
        setFlow('google_callback')
        setLoading(true)
        
        try {
          const response = await NewAuthAPI.handleGoogleCallback(code, state || undefined)
          
          if (!response.success) {
            throw new Error(response.error || 'Google 登入失敗')
          }
          
          if (response.user && response.tokens) {
            // 已存在用戶，直接登入
            login(
              response.tokens.access_token,
              response.user.role as any,
              response.user.school_id,
              response.tokens.refresh_token,
              response.user.username
            )
            navigate('/')
            return
          }
          
          if (response.requiresRegistration && response.googleData) {
            // 檢查 email 網域
            if (!isValidEducationalEmail(response.googleData.email)) {
              setGoogleData({
                ...response.googleData,
                requiresRegistration: true
              })
              setFlow('domain_restricted')
            } else {
              // 進入快速註冊流程
              setGoogleData({
                ...response.googleData,
                requiresRegistration: true
              })
              setFlow('quick_register')
            }
          }
          
        } catch (error: any) {
          console.error('Google callback error:', error)
          setError(error.message || '無法完成 Google 登入，請稍後再試')
          setFlow('initial')
        } finally {
          setLoading(false)
          // 清理 URL 參數
          window.history.replaceState({}, '', location.pathname)
        }
      }
    }

    handleUrlParams()
  }, [searchParams, login, navigate, location.pathname])

  // 主題初始化
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // Google OAuth 登入
  const handleGoogleAuth = () => {
    setError('')
    NewAuthAPI.redirectToGoogleAuth()
  }

  // 傳統登入
  const handleTraditionalLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await NewAuthAPI.login({ email, password })
      
      if (!response.success) {
        throw new Error(response.error || '登入失敗')
      }
      
      if (response.user && response.tokens) {
        login(
          response.tokens.access_token,
          response.user.role as any,
          response.user.school_id,
          response.tokens.refresh_token,
          response.user.username
        )
        navigate('/')
      }
      
    } catch (error: any) {
      setError(error.message || '帳號或密碼錯誤')
    } finally {
      setLoading(false)
    }
  }

  // 快速註冊提交
  const handleQuickRegistration = async (data: {
    email: string
    username: string
    password: string
    schoolId: number | null
    customSchoolRequested: boolean
    customSchoolInfo?: {
      name?: string
      domain?: string
      additionalInfo?: string
    }
  }) => {
    setLoading(true)
    setError('')

    try {
      const response = await NewAuthAPI.quickRegister({
        ...data,
        confirmPassword: data.password, // 前端已驗證一致性
        googleData: googleData ? {
          email: googleData.email,
          name: googleData.name,
          picture: googleData.picture,
          sub: 'placeholder' // 實際應從後端獲取
        } : undefined
      })
      
      if (!response.success) {
        throw new Error(response.error || '註冊失敗')
      }
      
      if (response.user && response.tokens) {
        login(
          response.tokens.access_token,
          response.user.role as any,
          response.user.school_id,
          response.tokens.refresh_token,
          response.user.username
        )
        setSuccess('註冊成功，已為你登入。')
        setTimeout(() => navigate('/'), 1500)
      }
      
    } catch (error: any) {
      setError(error.message || '註冊失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  // 聯絡管理員
  const handleContactAdmin = async (message: string) => {
    if (!googleData) return
    
    setLoading(true)
    setError('')

    try {
      const domain = googleData.email.split('@')[1]
      // 嘗試推斷尾綴（與限制頁一致的規則）
      const suffix = ((): string => {
        const parts = domain.toLowerCase().split('.')
        if (domain.toLowerCase().endsWith('.edu')) return '.edu'
        if (parts.length >= 2) return `.${parts.slice(-2).join('.')}`
        return `.${domain}`
      })()
      const response = await NewAuthAPI.requestSchool({
        userEmail: googleData.email,
        schoolName: undefined,
        schoolDomain: googleData.email.split('@')[1],
        additionalInfo: `${message}\n\n[detected] domain=${domain} suffix=${suffix}`
      })
      
      if (response.success) {
        setSuccess('已收到您的請求，管理員會盡快處理。')
        setTimeout(() => {
          setFlow('initial')
          setGoogleData(null)
        }, 2000)
      } else {
        throw new Error('送出請求失敗')
      }
      
    } catch (error: any) {
      setError(error.message || '送出請求失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  // 渲染不同的流程頁面
  const renderFlow = () => {
    switch (flow) {
      case 'google_callback':
        return (
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted">處理 Google 登入中...</p>
          </div>
        )

      case 'quick_register':
        if (!googleData) {
          setFlow('initial')
          return null
        }
        return (
          <QuickRegistrationForm
            googleEmail={googleData.email}
            googleName={googleData.name}
            googlePicture={googleData.picture}
            onSubmit={handleQuickRegistration}
            onCancel={() => {
              setFlow('initial')
              setGoogleData(null)
            }}
            loading={loading}
            error={error}
          />
        )

      case 'domain_restricted':
        if (!googleData) {
          setFlow('initial')
          return null
        }
        return (
          <DomainRestrictionPage
            email={googleData.email}
            onContactAdmin={() => setFlow('contact_admin')}
            onTryAgain={() => {
              setFlow('initial')
              setGoogleData(null)
            }}
          />
        )

      case 'contact_admin':
        if (!googleData) {
          setFlow('initial')
          return null
        }
        return (
          <ContactAdminPrompt
            email={googleData.email}
            onSubmit={handleContactAdmin}
            onCancel={() => setFlow('domain_restricted')}
            loading={loading}
          />
        )

      case 'traditional_login':
        return (
          <div className="w-full max-w-md mx-auto">
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="text-center mb-6">
                <h1 className="text-xl font-semibold">登入</h1>
                <p className="text-sm text-muted mt-1">使用帳號密碼登入</p>
              </div>

              <form onSubmit={handleTraditionalLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-control"
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    密碼
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-control pr-10"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50"
                >
                  {loading ? '登入中...' : '登入'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setFlow('initial')}
                  className="text-sm text-muted hover:text-fg"
                >
                  ← 返回主頁面
                </button>
              </div>
            </div>
          </div>
        )

      default: // 'initial'
        return (
          <div className="w-full max-w-md mx-auto">
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-semibold">ForumKit</h1>
                <p className="text-sm text-muted mt-1">校園匿名討論平台</p>
              </div>

              <div className="space-y-4">
                {/* Google 登入（主要入口） */}
                <button
                  onClick={handleGoogleAuth}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  使用 Google 繼續
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-surface px-2 text-muted">或</span>
                  </div>
                </div>

                {/* 傳統登入 */}
                <button
                  onClick={() => setFlow('traditional_login')}
                  className="w-full px-4 py-3 border border-border rounded-xl hover:bg-surface/80"
                >
                  使用帳號密碼登入
                </button>
              </div>

              <div className="mt-4 text-xs text-muted text-center space-y-1">
                <p>註冊僅接受學校信箱（.edu/.edu.tw 結尾）</p>
                <p>一般 gmail.com 等信箱暫不開放</p>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname={location.pathname} />

      <div className="min-h-screen flex items-center justify-center p-4">
        {/* 成功訊息 */}
        {success && (
          <div className="fixed top-4 right-4 z-50 p-3 bg-success-bg border border-success-border text-success-text rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* 錯誤訊息 */}
        {error && flow !== 'domain_restricted' && (
          <div className="fixed top-4 right-4 z-50 max-w-md p-3 bg-danger-bg border border-danger-border text-danger-text rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                {error}
                <div className="mt-2">
                  需要協助？<a href="/support" className="underline">留言給管理員</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {renderFlow()}
      </div>

      <MobileBottomNav />
    </div>
  )
}
