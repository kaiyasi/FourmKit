/**
 * 快速註冊表單元件
 * Google OAuth 通過後的註冊表單，預填 email 並鎖定
 */

import { useState, useEffect, useMemo } from 'react'
import { Eye, EyeOff, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { validatePassword, validatePasswordWithConfirmation, getPasswordRequirements } from '@/utils/passwordValidation'
import { validateUsername } from '@/utils/usernameValidation'
import { School, CUSTOM_SCHOOL_OPTION, findSchoolById, suggestSchoolFromEmail } from '@/utils/schoolSelection'
import { detectSchoolFromEmail } from '@/utils/schoolDetection'
import { NewAuthAPI } from '@/services/authApi'

interface QuickRegistrationFormProps {
  googleEmail: string // 來自 Google，唯讀
  googleName: string
  googlePicture?: string
  onSubmit: (data: {
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
  }) => Promise<void>
  onCancel: () => void
  loading?: boolean
  error?: string
}

export default function QuickRegistrationForm({
  googleEmail,
  googleName,
  googlePicture,
  onSubmit,
  onCancel,
  loading = false,
  error
}: QuickRegistrationFormProps) {
  // 表單狀態
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null)
  const [customSchoolRequested, setCustomSchoolRequested] = useState(false)
  const [customSchoolName, setCustomSchoolName] = useState('')
  const [customSchoolDomain, setCustomSchoolDomain] = useState('')
  const [customSchoolInfo, setCustomSchoolInfo] = useState('')
  
  // UI 狀態
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)
  const [slugReportRequested, setSlugReportRequested] = useState(false)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [requestingSchool, setRequestingSchool] = useState(false)
  const [requestSent, setRequestSent] = useState<null | 'ok' | 'fail'>(null)
  
  // 驗證結果
  const passwordValidation = useMemo(() => 
    validatePasswordWithConfirmation(password, confirmPassword), 
    [password, confirmPassword]
  )
  
  const usernameValidation = useMemo(() => 
    validateUsername(username), 
    [username]
  )
  
  const passwordRequirements = useMemo(() => 
    getPasswordRequirements(), 
    []
  )

  // 載入學校清單
  useEffect(() => {
    const loadSchools = async () => {
      try {
        const response = await NewAuthAPI.getSchools()
        setSchools([...response.schools, CUSTOM_SCHOOL_OPTION])
        // 自動建議學校：先做網域偵測（slug/city），再回退到簡易匹配
        const detect = detectSchoolFromEmail(googleEmail)
        let preselect: School | null = null
        if (detect.ok && detect.slug) {
          preselect = response.schools.find(s => s.slug.toLowerCase() === detect.slug!.toLowerCase()) || null
        }
        if (!preselect) {
          preselect = suggestSchoolFromEmail(response.schools, googleEmail)
        }
        if (preselect) setSelectedSchoolId(preselect.id)
      } catch (error) {
        console.error('Failed to load schools:', error)
      } finally {
        setSchoolsLoading(false)
      }
    }
    loadSchools()
    // 確保用戶名永遠不會被自動填入
    setUsername('')
  }, [googleEmail])

  // 確保組件掛載時用戶名為空
  useEffect(() => {
    setUsername('')
  }, [])

  // 檢查使用者名稱可用性（防抖）
  useEffect(() => {
    if (!username || !usernameValidation.isValid) {
      setUsernameAvailable(null)
      return
    }

    const timer = setTimeout(async () => {
      try {
        setUsernameChecking(true)
        const response = await NewAuthAPI.checkUsernameAvailability(username)
        setUsernameAvailable(response.available)
      } catch (error) {
        console.error('Failed to check username availability:', error)
        setUsernameAvailable(null)
      } finally {
        setUsernameChecking(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [username, usernameValidation.isValid])

  // 處理學校選擇變更
  const handleSchoolChange = (schoolId: string) => {
    const id = schoolId === '' ? null : parseInt(schoolId)
    setSelectedSchoolId(id)
    
    if (id === CUSTOM_SCHOOL_OPTION.id) {
      setCustomSchoolRequested(true)
    } else {
      setCustomSchoolRequested(false)
      setCustomSchoolName('')
      setCustomSchoolDomain('')
      setCustomSchoolInfo('')
    }
  }

  // 處理 slug 錯誤回報
  const handleSlugReport = async () => {
    if (!selectedSchoolId || selectedSchoolId === CUSTOM_SCHOOL_OPTION.id) return
    
    const school = findSchoolById(schools, selectedSchoolId)
    if (!school) return
    
    try {
      await NewAuthAPI.reportSlugError({
        userEmail: googleEmail,
        schoolId: school.id,
        schoolName: school.name,
        currentSlug: school.slug,
        reportReason: '使用者回報的 slug 錯誤'
      })
      
      setSlugReportRequested(true)
      setTimeout(() => setSlugReportRequested(false), 3000)
    } catch (error) {
      console.error('Failed to report slug error:', error)
    }
  }

  // 回報「找不到我的學校」：直接送出新增學校請求
  const handleRequestNewSchool = async () => {
    try {
      setRequestingSchool(true)
      setRequestSent(null)
      const payload = {
        userEmail: googleEmail,
        schoolName: customSchoolName || undefined,
        schoolDomain: customSchoolDomain || undefined,
        additionalInfo: customSchoolInfo || undefined,
      }
      const r = await NewAuthAPI.requestSchool(payload)
      setRequestSent(r.success ? 'ok' : 'fail')
      if (r.success) {
        // 清空輸入以避免重複誤送
        setCustomSchoolName('')
        setCustomSchoolDomain('')
        setCustomSchoolInfo('')
      }
      setTimeout(()=> setRequestSent(null), 3500)
    } catch {
      setRequestSent('fail')
      setTimeout(()=> setRequestSent(null), 3500)
    } finally {
      setRequestingSchool(false)
    }
  }

  // 表單提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!passwordValidation.isValid || 
        !usernameValidation.isValid || 
        usernameAvailable === false) {
      return
    }

    const formData = {
      email: googleEmail,
      username: username.trim(),
      password,
      schoolId: selectedSchoolId === CUSTOM_SCHOOL_OPTION.id ? null : selectedSchoolId,
      customSchoolRequested,
      customSchoolInfo: customSchoolRequested ? {
        name: customSchoolName.trim() || undefined,
        domain: customSchoolDomain.trim() || undefined,
        additionalInfo: customSchoolInfo.trim() || undefined
      } : undefined
    }

    await onSubmit(formData)
  }

  const selectedSchool = selectedSchoolId ? findSchoolById(schools, selectedSchoolId) : null
  const canSubmit = passwordValidation.isValid && 
                   usernameValidation.isValid && 
                   usernameAvailable === true && 
                   !loading

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
        {/* 標題與 Google 資訊 */}
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            {googlePicture && (
              <img 
                src={googlePicture} 
                alt="Google 頭像"
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <h1 className="text-xl font-semibold">完成註冊</h1>
              <p className="text-sm text-muted">使用 Google 帳號快速註冊</p>
            </div>
          </div>
        </div>

        {/* 錯誤提示 */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-danger-bg border border-danger-border text-danger-text">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Gmail（唯讀） */}
          <div>
            <label className="block text-sm font-medium text-fg mb-2">
              Gmail
            </label>
            <div className="relative">
              <input 
                type="email"
                value={googleEmail}
                readOnly
                className="form-control bg-muted/30 cursor-not-allowed"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted mt-1">
              此 Email 來自 Google，已通過驗證
            </p>
          </div>

          {/* 學校選擇 */}
          <div>
            <label className="block text-sm font-medium text-fg mb-2">
              學校 *
            </label>
            {/* 偵測提示 */}
            {(() => {
              const d = detectSchoolFromEmail(googleEmail)
              if (!d.ok) return null
              return (
                <div className="mb-2 text-xs text-muted">
                  偵測到學校代稱：<span className="text-fg font-medium">{d.slug || '未知'}</span>
                  {d.city_name || d.city_code ? (
                    <>（{d.city_name || d.city_code}）</>
                  ) : null}
                  <span className="ml-1">推斷信心：{d.confidence}</span>
                </div>
              )
            })()}
            {schoolsLoading ? (
              <div className="form-control bg-muted/30">載入中...</div>
            ) : (
              <select
                value={selectedSchoolId?.toString() || ''}
                onChange={(e) => handleSchoolChange(e.target.value)}
                className="form-control"
                required
              >
                <option value="">請選擇學校</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                    {school.domain && ` (${school.domain})`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 學校 slug 顯示 */}
          {selectedSchool && selectedSchool.id !== CUSTOM_SCHOOL_OPTION.id && (
            <div>
              <label className="block text-sm font-medium text-fg mb-2">
                學校代稱 (slug)
              </label>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={selectedSchool.slug}
                  readOnly
                  className="form-control bg-muted/30 cursor-not-allowed flex-1"
                />
                <button
                  type="button"
                  onClick={handleSlugReport}
                  disabled={slugReportRequested}
                  className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-surface/80 disabled:opacity-50"
                >
                  {slugReportRequested ? '已回報' : '回報錯誤'}
                </button>
              </div>
              <p className="text-xs text-muted mt-1">
                學校代稱用於系統識別，如有錯誤請點擊回報
              </p>
              {slugReportRequested && (
                <p className="text-xs text-green-600 mt-1">
                  已收到你的回報，我們會盡快確認學校代稱（slug）
                </p>
              )}
            </div>
          )}

          {/* 自訂學校資訊 */}
          {customSchoolRequested && (
            <div className="space-y-3 p-3 bg-muted/20 rounded-lg border border-border">
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  學校名稱
                </label>
                <input
                  type="text"
                  value={customSchoolName}
                  onChange={(e) => setCustomSchoolName(e.target.value)}
                  placeholder="請輸入學校全名"
                  className="form-control"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  學校網域
                </label>
                <input
                  type="text"
                  value={customSchoolDomain}
                  onChange={(e) => setCustomSchoolDomain(e.target.value)}
                  placeholder="例如：university.edu.tw"
                  className="form-control"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  補充資訊
                </label>
                <textarea
                  value={customSchoolInfo}
                  onChange={(e) => setCustomSchoolInfo(e.target.value)}
                  placeholder="任何有助於我們新增學校的資訊..."
                  className="form-control min-h-[60px]"
                />
              </div>
              <p className="text-xs text-amber-600">
                你可以先完成註冊，我們會通知管理員新增學校
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRequestNewSchool}
                  disabled={requestingSchool}
                  className="px-3 py-2 rounded-lg border border-border hover:bg-surface/80 text-sm disabled:opacity-50"
                >
                  {requestingSchool ? '送出中…' : '回報新增學校'}
                </button>
                {requestSent === 'ok' && <span className="text-xs text-green-600">已送出，管理員會儘速處理</span>}
                {requestSent === 'fail' && <span className="text-xs text-rose-600">送出失敗，稍後重試</span>}
              </div>
            </div>
          )}

          {/* 暱稱 */}
          <div>
            <label className="block text-sm font-medium text-fg mb-2">
              暱稱 *
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請不要使用真名或學號"
                className={`form-control pr-10 ${
                  username && !usernameValidation.isValid ? 'border-red-500' : ''
                } ${
                  username && usernameValidation.isValid && usernameAvailable === true ? 'border-green-500' : ''
                } ${
                  username && usernameValidation.isValid && usernameAvailable === false ? 'border-red-500' : ''
                }`}
                autoComplete="off"
                required
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameChecking && (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
                {!usernameChecking && username && usernameValidation.isValid && usernameAvailable === true && (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
                {!usernameChecking && username && ((!usernameValidation.isValid) || usernameAvailable === false) && (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
            </div>
            {username && !usernameValidation.isValid && (
              <p className="text-xs text-red-600 mt-1">
                {usernameValidation.errors[0]}
              </p>
            )}
            {username && usernameValidation.isValid && usernameAvailable === false && (
              <p className="text-xs text-red-600 mt-1">
                此暱稱已被使用，請選擇其他暱稱
              </p>
            )}
          </div>

          {/* 密碼 */}
          <div>
            <label className="block text-sm font-medium text-fg mb-2">
              密碼 *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control pr-10"
                required
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

          {/* 確認密碼 */}
          <div>
            <label className="block text-sm font-medium text-fg mb-2">
              確認密碼 *
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-control pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && !passwordValidation.confirmationValidation.isValid && (
              <p className="text-xs text-red-600 mt-1">
                {passwordValidation.confirmationValidation.error}
              </p>
            )}
          </div>

          {/* 密碼規範檢查 */}
          {password && (
            <div className="p-3 bg-muted/20 rounded-lg">
              <p className="text-sm font-medium text-fg mb-2">密碼規範：</p>
              <ul className="space-y-1">
                {passwordRequirements.map((requirement) => {
                  const isValid = requirement.check(password)
                  return (
                    <li
                      key={requirement.id}
                      className={`text-xs flex items-center gap-2 ${
                        isValid ? 'text-green-600' : 'text-muted'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
                        isValid ? 'bg-green-100 text-green-600' : 'bg-muted/30'
                      }`}>
                        {isValid && <CheckCircle2 className="w-2 h-2" />}
                      </div>
                      {requirement.text}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* 提交按鈕 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-3 border border-border rounded-xl hover:bg-surface/80 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '註冊中...' : '完成註冊'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
