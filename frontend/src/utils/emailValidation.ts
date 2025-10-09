/**
 * Email 網域驗證工具函數
 * 僅接受 .edu 和 .edu.tw 結尾的學校信箱
 */

export const ALLOWED_EMAIL_DOMAINS = ['.edu', '.edu.tw'] as const

/**
 * 檢查 email 是否符合學校網域要求
 */
export function isValidEducationalEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }

  const normalizedEmail = email.toLowerCase().trim()
  
  // 基本 email 格式檢查
  if (!/@/.test(normalizedEmail) || normalizedEmail.length < 5) {
    return false
  }

  // 檢查是否以允許的教育網域結尾
  return ALLOWED_EMAIL_DOMAINS.some(domain => normalizedEmail.endsWith(domain))
}

/**
 * 正規化 email（小寫、trim）
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * 從 email 中提取網域部分
 */
export function extractDomain(email: string): string | null {
  const normalizedEmail = normalizeEmail(email)
  const atIndex = normalizedEmail.indexOf('@')
  
  if (atIndex === -1 || atIndex === normalizedEmail.length - 1) {
    return null
  }
  
  return normalizedEmail.substring(atIndex + 1)
}

/**
 * 檢查 email 格式的前端驗證正則
 */
export const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 後端網域驗證正則（JavaScript 版本）
 * 對應後端的 (?i)@[^@]+\.(edu(\.tw)?)$
 */
export const EDU_DOMAIN_REGEX = /@[^@]+\.edu(\.tw)?$/i

/**
 * 完整的 email 教育網域驗證
 */
export function validateEducationalEmail(email: string): {
  valid: boolean
  error?: string
  normalizedEmail?: string
} {
  if (!email || typeof email !== 'string') {
    return { 
      valid: false, 
      error: 'Email 不能為空' 
    }
  }

  const normalizedEmail = normalizeEmail(email)

  // 基本格式檢查
  if (!EMAIL_VALIDATION_REGEX.test(normalizedEmail)) {
    return {
      valid: false,
      error: 'Email 格式不正確'
    }
  }

  // 教育網域檢查
  if (!isValidEducationalEmail(normalizedEmail)) {
    return {
      valid: false,
      error: '僅接受 .edu 或 .edu.tw 結尾的學校信箱'
    }
  }

  return {
    valid: true,
    normalizedEmail
  }
}

/**
 * 取得不合法網域的友善錯誤訊息
 */
export function getEmailDomainError(email: string): string {
  const domain = extractDomain(email)
  
  if (!domain) {
    return 'Email 格式不正確'
  }

  if (domain.includes('.edu.') || domain.includes('edu.')) {
    return '請確認您的學校 Email 格式，目前僅支援 .edu 或 .edu.tw 結尾的信箱'
  }

  if (domain.includes('gmail.com') || domain.includes('yahoo.com') || domain.includes('hotmail.com')) {
    return '不接受一般信箱服務，請使用學校提供的教育信箱'
  }

  return '目前僅接受學校信箱（.edu.tw 或 .edu 結尾），若貴校尚未加入，請聯絡管理員協助開通'
}

/**
 * 推斷網域的「尾綴」字串，供提示顯示（例如 .edu、.edu.tw、.ac.uk）。
 * 規則：
 * - 若以 .edu 結尾 → 回傳 .edu
 * - 否則回傳最後兩段（例如 domain=dept.uni.ac.uk → .ac.uk）
 */
export function detectDomainSuffixFromEmail(email: string): string | null {
  const domain = extractDomain(email)
  if (!domain) return null
  const d = domain.toLowerCase()
  if (d.endsWith('.edu')) return '.edu'
  const parts = d.split('.')
  if (parts.length >= 2) {
    const suf = `.${parts.slice(-2).join('.')}`
    return suf
  }
  return `.${d}`
}
