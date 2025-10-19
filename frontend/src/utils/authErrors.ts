/**
 * 認證錯誤處理與文案工具函數
 */

export const AUTH_ERROR_CODES = {
  INVALID_EMAIL_DOMAIN: 'INVALID_EMAIL_DOMAIN',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  PASSWORD_POLICY_VIOLATION: 'PASSWORD_POLICY_VIOLATION',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  USERNAME_INVALID: 'USERNAME_INVALID',
  
  GOOGLE_AUTH_FAILED: 'GOOGLE_AUTH_FAILED',
  GOOGLE_TOKEN_INVALID: 'GOOGLE_TOKEN_INVALID',
  GOOGLE_EMAIL_MISMATCH: 'GOOGLE_EMAIL_MISMATCH',
  
  SCHOOL_NOT_FOUND: 'SCHOOL_NOT_FOUND',
  SCHOOL_SLUG_INVALID: 'SCHOOL_SLUG_INVALID',
  
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED'
} as const

/**
 *
 */
export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES]

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  [AUTH_ERROR_CODES.INVALID_EMAIL_DOMAIN]: '目前僅接受學校信箱（.edu.tw 或 .edu 結尾），若貴校尚未加入，請聯絡管理員協助開通。',
  [AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED]: '您的 Email 尚未通過驗證，請檢查信箱並點擊驗證連結。',
  [AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS]: '此 Email 已被註冊，請使用其他信箱或嘗試登入。',
  
  [AUTH_ERROR_CODES.PASSWORD_TOO_WEAK]: '密碼強度不足，請確保符合安全規範。',
  [AUTH_ERROR_CODES.PASSWORD_POLICY_VIOLATION]: '密碼需至少 10 碼，包含英數，且不得出現連續序列（例如 1234、abcd）。',
  [AUTH_ERROR_CODES.INVALID_CREDENTIALS]: '帳號或密碼錯誤。',
  
  [AUTH_ERROR_CODES.USERNAME_TAKEN]: '此暱稱已被使用，請選擇其他暱稱。',
  [AUTH_ERROR_CODES.USERNAME_INVALID]: '暱稱格式不符合規範，請檢查長度與字元要求。',
  
  [AUTH_ERROR_CODES.GOOGLE_AUTH_FAILED]: '無法完成 Google 登入，請稍後再試。',
  [AUTH_ERROR_CODES.GOOGLE_TOKEN_INVALID]: 'Google 驗證已過期，請重新登入。',
  [AUTH_ERROR_CODES.GOOGLE_EMAIL_MISMATCH]: 'Google 帳號 Email 與註冊 Email 不符。',
  
  [AUTH_ERROR_CODES.SCHOOL_NOT_FOUND]: '找不到指定的學校，請重新選擇或聯絡管理員。',
  [AUTH_ERROR_CODES.SCHOOL_SLUG_INVALID]: '學校代碼格式錯誤。',
  
  [AUTH_ERROR_CODES.RATE_LIMITED]: '操作過於頻繁，請稍後再試。',
  [AUTH_ERROR_CODES.SERVER_ERROR]: '伺服器暫時無法處理請求，請稍後再試。',
  [AUTH_ERROR_CODES.VALIDATION_FAILED]: '輸入的資料格式不正確，請檢查後重新提交。'
}

/**
 * 根據錯誤代碼獲取對應的中文錯誤訊息
 */
export function getErrorMessage(errorCode: string | AuthErrorCode): string {
  if (errorCode in ERROR_MESSAGES) {
    return ERROR_MESSAGES[errorCode as AuthErrorCode]
  }
  
  const lowerCode = errorCode.toLowerCase()
  
  if (lowerCode.includes('domain') || lowerCode.includes('email')) {
    return ERROR_MESSAGES[AUTH_ERROR_CODES.INVALID_EMAIL_DOMAIN]
  }
  
  if (lowerCode.includes('password')) {
    return ERROR_MESSAGES[AUTH_ERROR_CODES.PASSWORD_POLICY_VIOLATION]
  }
  
  if (lowerCode.includes('username') || lowerCode.includes('name')) {
    return ERROR_MESSAGES[AUTH_ERROR_CODES.USERNAME_INVALID]
  }
  
  if (lowerCode.includes('rate') || lowerCode.includes('limit')) {
    return ERROR_MESSAGES[AUTH_ERROR_CODES.RATE_LIMITED]
  }
  
  if (lowerCode.includes('google') || lowerCode.includes('oauth')) {
    return ERROR_MESSAGES[AUTH_ERROR_CODES.GOOGLE_AUTH_FAILED]
  }
  
  return '操作失敗，請稍後重試或聯絡管理員。'
}

/**
 * 解析 API 錯誤回應並返回友善的錯誤訊息
 */
export function parseAuthError(error: any): {
  message: string
  code?: string
  errorId?: string
} {
  let errorCode: string | undefined
  let errorMessage: string
  let errorId: string | undefined
  
  if (typeof error === 'string') {
    errorMessage = error
  } else if (error && typeof error === 'object') {
    errorCode = error.code || error.errorCode
    errorMessage = error.message || error.error || error.msg
    errorId = error.errorId || error.error_id
    
    if (!errorMessage && error.error && typeof error.error === 'object') {
      errorMessage = error.error.message || error.error.msg
      errorCode = errorCode || error.error.code
    }
  } else {
    errorMessage = String(error)
  }
  
  if (errorCode) {
    return {
      message: getErrorMessage(errorCode),
      code: errorCode,
      errorId
    }
  }
  
  return {
    message: errorMessage || '未知錯誤',
    errorId
  }
}

/**
 * 根據錯誤類型提供對應的建議行動
 */
export function getErrorSuggestion(errorCode: string): {
  action: 'retry' | 'contact_admin' | 'fix_input' | 'wait' | 'redirect'
  actionText: string
  actionUrl?: string
} {
  switch (errorCode) {
    case AUTH_ERROR_CODES.INVALID_EMAIL_DOMAIN:
      return {
        action: 'contact_admin',
        actionText: '聯絡管理員申請開通'
      }
    
    case AUTH_ERROR_CODES.PASSWORD_POLICY_VIOLATION:
    case AUTH_ERROR_CODES.USERNAME_INVALID:
    case AUTH_ERROR_CODES.VALIDATION_FAILED:
      return {
        action: 'fix_input',
        actionText: '修正輸入內容'
      }
    
    case AUTH_ERROR_CODES.RATE_LIMITED:
      return {
        action: 'wait',
        actionText: '請稍後再試'
      }
    
    case AUTH_ERROR_CODES.GOOGLE_AUTH_FAILED:
    case AUTH_ERROR_CODES.GOOGLE_TOKEN_INVALID:
      return {
        action: 'retry',
        actionText: '重新使用 Google 登入'
      }
    
    case AUTH_ERROR_CODES.SERVER_ERROR:
      return {
        action: 'retry',
        actionText: '重新載入頁面'
      }
    
    case AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS:
      return {
        action: 'redirect',
        actionText: '前往登入頁面',
        actionUrl: '/auth?mode=login'
      }
    
    default:
      return {
        action: 'contact_admin',
        actionText: '需要協助？聯絡管理員'
      }
  }
}

/**
 * 生成包含錯誤代碼的完整錯誤訊息（用於技術性錯誤）
 */
export function formatTechnicalError(
  errorMessage: string, 
  errorCode?: string, 
  errorId?: string
): string {
  let message = errorMessage
  
  if (errorId) {
    message += `若持續發生，請提供錯誤代碼給管理員：${errorId}。`
  } else if (errorCode) {
    message += `（錯誤代碼：${errorCode}）`
  }
  
  return message
}

/**
 * 檢查錯誤是否需要顯示技術細節
 */
export function shouldShowTechnicalDetails(errorCode?: string): boolean {
  if (!errorCode) return false
  
  const technicalErrors = [
    AUTH_ERROR_CODES.GOOGLE_AUTH_FAILED,
    AUTH_ERROR_CODES.SERVER_ERROR
  ]
  
  return technicalErrors.includes(errorCode as AuthErrorCode)
}