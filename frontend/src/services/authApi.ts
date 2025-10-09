/**
 * 新的認證 API 服務
 * 支援 Google OAuth 流程和增強的註冊登入功能
 */

import { api } from './api'

// 類型定義
export interface GoogleAuthResponse {
  success: boolean
  requiresRegistration: boolean
  user?: {
    id: number
    email: string
    username: string
    role: string
    school_id: number | null
  }
  tokens?: {
    access_token: string
    refresh_token: string
  }
  googleData?: {
    email: string
    name: string
    picture?: string
    verified_email: boolean
  }
  error?: string
  errorCode?: string
}

export interface School {
  id: number
  name: string
  slug: string
  domain?: string
  region?: string
  type?: 'university' | 'college' | 'institute' | 'other'
}

export interface QuickRegistrationPayload {
  email: string // 來自 Google，唯讀
  username: string
  password: string
  confirmPassword: string
  schoolId: number | null
  customSchoolRequested?: boolean
  customSchoolInfo?: {
    name?: string
    domain?: string
    additionalInfo?: string
  }
  googleData?: {
    email: string
    name: string
    picture?: string
    sub: string
  }
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AdminNotificationEvent {
  type: 'school_request' | 'slug_report' | 'domain_attempt' | 'google_binding'
  timestamp: string
  userEmail?: string
  details: Record<string, any>
}

export interface AuditLogEntry {
  id: number
  event_type: string
  user_id?: number
  user_email?: string
  ip_address?: string
  user_agent?: string
  details: Record<string, any>
  created_at: string
}

/**
 * 新的認證 API
 */
export const NewAuthAPI = {
  /**
   * Google OAuth 登入/註冊入口
   * 重定向到 Google OAuth
   */
  redirectToGoogleAuth(): void {
    window.location.href = '/api/auth/google/oauth'
  },

  /**
   * 處理 Google OAuth 回調
   */
  async handleGoogleCallback(
    code: string, 
    state?: string
  ): Promise<GoogleAuthResponse> {
    return api<GoogleAuthResponse>('/api/auth/google/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state })
    })
  },

  /**
   * 驗證 email 域名是否被允許
   */
  async validateEmailDomain(email: string): Promise<{
    valid: boolean
    domain: string
    error?: string
  }> {
    return api<{
      valid: boolean
      domain: string
      error?: string
    }>('/api/auth/validate-domain', {
      method: 'POST',
      body: JSON.stringify({ email })
    })
  },

  /**
   * 快速註冊（Google 流程後）
   */
  async quickRegister(payload: QuickRegistrationPayload): Promise<{
    success: boolean
    user?: {
      id: number
      email: string
      username: string
      role: string
      school_id: number | null
    }
    tokens?: {
      access_token: string
      refresh_token: string
    }
    error?: string
    errorCode?: string
  }> {
    return api<any>('/api/auth/quick-register', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  /**
   * 一般登入（帳密）
   */
  async login(payload: LoginPayload): Promise<{
    success: boolean
    user?: {
      id: number
      email: string
      username: string
      role: string
      school_id: number | null
    }
    tokens?: {
      access_token: string
      refresh_token: string
    }
    error?: string
    errorCode?: string
  }> {
    return api<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  /**
   * 備援註冊（無 Google 流程）
   */
  async fallbackRegister(payload: {
    email: string
    username: string
    password: string
    confirmPassword: string
    schoolId: number | null
    customSchoolRequested?: boolean
    customSchoolInfo?: {
      name?: string
      domain?: string
      additionalInfo?: string
    }
  }): Promise<{
    success: boolean
    message?: string
    error?: string
    errorCode?: string
  }> {
    return api<any>('/api/auth/fallback-register', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  /**
   * 檢查使用者名稱是否可用
   */
  async checkUsernameAvailability(username: string): Promise<{
    available: boolean
    suggestions?: string[]
  }> {
    return api<{
      available: boolean
      suggestions?: string[]
    }>('/api/auth/check-username', {
      method: 'POST',
      body: JSON.stringify({ username })
    })
  },

  /**
   * 取得學校清單
   */
  async getSchools(): Promise<{
    schools: School[]
  }> {
    return api<{ schools: School[] }>('/api/auth/schools')
  },

  /**
   * 送出學校新增請求
   */
  async requestSchool(payload: {
    userEmail: string
    schoolName?: string
    schoolDomain?: string
    additionalInfo?: string
  }): Promise<{
    success: boolean
    ticketId?: string
    message?: string
  }> {
    return api<any>('/api/auth/request-school', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  /**
   * 回報 slug 錯誤
   */
  async reportSlugError(payload: {
    userEmail: string
    schoolId: number
    schoolName: string
    currentSlug: string
    reportReason?: string
  }): Promise<{
    success: boolean
    ticketId?: string
    message?: string
  }> {
    return api<any>('/api/auth/report-slug', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  /**
   * 綁定/解綁 Google 帳號
   */
  async bindGoogleAccount(googleData: {
    email: string
    sub: string
    name: string
    picture?: string
  }): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    return api<any>('/api/auth/bind-google', {
      method: 'POST',
      body: JSON.stringify(googleData)
    })
  },

  async unbindGoogleAccount(): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    return api<any>('/api/auth/unbind-google', {
      method: 'POST'
    })
  },

  /**
   * 登出
   */
  async logout(): Promise<{ success: boolean }> {
    return api<{ success: boolean }>('/api/auth/logout', {
      method: 'POST'
    })
  }
}

/**
 * 管理員相關 API
 */
export const AdminAuthAPI = {
  /**
   * 取得管理員通知事件
   */
  async getNotificationEvents(
    limit?: number,
    offset?: number
  ): Promise<{
    events: AdminNotificationEvent[]
    total: number
  }> {
    const params = new URLSearchParams()
    if (limit) params.set('limit', limit.toString())
    if (offset) params.set('offset', offset.toString())
    
    return api<{
      events: AdminNotificationEvent[]
      total: number
    }>(`/api/admin/auth/notifications?${params.toString()}`)
  },

  /**
   * 取得審計日誌
   */
  async getAuditLogs(
    eventType?: string,
    limit?: number,
    offset?: number
  ): Promise<{
    logs: AuditLogEntry[]
    total: number
  }> {
    const params = new URLSearchParams()
    if (eventType) params.set('event_type', eventType)
    if (limit) params.set('limit', limit.toString())
    if (offset) params.set('offset', offset.toString())
    
    return api<{
      logs: AuditLogEntry[]
      total: number
    }>(`/api/admin/auth/audit-logs?${params.toString()}`)
  },

  /**
   * 處理學校新增請求
   */
  async processSchoolRequest(
    requestId: string,
    action: 'approve' | 'reject',
    schoolData?: {
      name: string
      slug: string
      domain?: string
      region?: string
      type?: School['type']
    }
  ): Promise<{
    success: boolean
    message?: string
    school?: School
  }> {
    return api<any>('/api/admin/auth/school-requests/process', {
      method: 'POST',
      body: JSON.stringify({
        requestId,
        action,
        schoolData
      })
    })
  },

  /**
   * 更新學校資訊（處理 slug 錯誤回報）
   */
  async updateSchool(
    schoolId: number,
    updates: Partial<Pick<School, 'name' | 'slug' | 'domain' | 'region' | 'type'>>
  ): Promise<{
    success: boolean
    school?: School
    message?: string
  }> {
    return api<any>(`/api/admin/auth/schools/${schoolId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
  }
}