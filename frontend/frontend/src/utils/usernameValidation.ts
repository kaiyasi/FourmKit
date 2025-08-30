/**
 * 暱稱/使用者名稱驗證工具函數
 */

export interface UsernameValidationResult {
  isValid: boolean
  errors: string[]
  normalizedUsername?: string
}

/**
 * 暱稱長度限制
 */
export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 20

/**
 * 允許的暱稱字元正則（中英文、數字、底線、句點）
 */
export const USERNAME_ALLOWED_CHARS_REGEX = /^[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff01-\uff60a-zA-Z0-9_.]+$/

/**
 * 檢查是否全為空白或標點符號
 */
function isOnlyWhitespaceOrPunctuation(username: string): boolean {
  // 移除允許的字母數字字元，看看剩下什麼
  const withoutAlphaNumeric = username.replace(/[\u4e00-\u9fff\u3400-\u4dbf\a-zA-Z0-9]/g, '')
  return withoutAlphaNumeric.length === username.length && username.length > 0
}

/**
 * 驗證暱稱格式
 */
export function validateUsername(username: string): UsernameValidationResult {
  const errors: string[] = []
  
  if (!username || typeof username !== 'string') {
    errors.push('暱稱不能為空')
    return { isValid: false, errors }
  }
  
  const trimmedUsername = username.trim()
  
  // 長度檢查
  if (trimmedUsername.length < USERNAME_MIN_LENGTH) {
    errors.push(`暱稱至少需要 ${USERNAME_MIN_LENGTH} 個字元`)
  }
  
  if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
    errors.push(`暱稱不能超過 ${USERNAME_MAX_LENGTH} 個字元`)
  }
  
  // 字元檢查
  if (!USERNAME_ALLOWED_CHARS_REGEX.test(trimmedUsername)) {
    errors.push('暱稱只能包含中英文、數字、底線和句點')
  }
  
  // 檢查是否全為空白或標點
  if (isOnlyWhitespaceOrPunctuation(trimmedUsername)) {
    errors.push('暱稱不可全為空白或標點符號')
  }
  
  // 檢查是否以特殊字元開頭或結尾
  if (trimmedUsername.startsWith('.') || trimmedUsername.startsWith('_')) {
    errors.push('暱稱不能以句點或底線開頭')
  }
  
  if (trimmedUsername.endsWith('.') || trimmedUsername.endsWith('_')) {
    errors.push('暱稱不能以句點或底線結尾')
  }
  
  // 檢查是否包含連續的特殊字元
  if (/[._]{2,}/.test(trimmedUsername)) {
    errors.push('暱稱不能包含連續的句點或底線')
  }
  
  const isValid = errors.length === 0
  
  return {
    isValid,
    errors,
    normalizedUsername: isValid ? trimmedUsername : undefined
  }
}

/**
 * 檢查暱稱是否可能是真名（簡單啟發式檢查）
 */
export function looksLikeRealName(username: string): boolean {
  const trimmedUsername = username.trim()
  
  // 檢查常見的真名模式
  const realNamePatterns = [
    /^[\u4e00-\u9fff]{2,4}$/, // 2-4個中文字（可能是中文姓名）
    /^[a-zA-Z]+\s[a-zA-Z]+$/, // 英文名字 空格 英文姓氏
    /^[A-Z][a-z]+[A-Z][a-z]+$/, // 駝峰式命名（可能是英文姓名縮寫）
  ]
  
  return realNamePatterns.some(pattern => pattern.test(trimmedUsername))
}

/**
 * 生成暱稱建議
 */
export function generateUsernameSuggestions(baseName: string): string[] {
  const suggestions: string[] = []
  const normalized = baseName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
  
  if (normalized.length >= USERNAME_MIN_LENGTH) {
    suggestions.push(normalized)
  }
  
  // 加上數字後綴
  for (let i = 1; i <= 5; i++) {
    const withNumber = normalized + i
    if (withNumber.length <= USERNAME_MAX_LENGTH) {
      suggestions.push(withNumber)
    }
  }
  
  // 加上隨機後綴
  const randomSuffix = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
  const withRandom = normalized + randomSuffix
  if (withRandom.length <= USERNAME_MAX_LENGTH) {
    suggestions.push(withRandom)
  }
  
  return suggestions.slice(0, 5) // 最多返回 5 個建議
}

/**
 * 取得暱稱建議的錯誤訊息
 */
export function getUsernameErrorMessage(username: string): string {
  const validation = validateUsername(username)
  
  if (validation.isValid) {
    return ''
  }
  
  // 返回第一個錯誤訊息
  return validation.errors[0] || '暱稱格式不正確'
}

/**
 * 暱稱規範說明
 */
export const USERNAME_RULES = [
  `長度需要在 ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 個字元之間`,
  '只能包含中英文、數字、底線(_)和句點(.)',
  '不可全為空白或標點符號',
  '不能以底線或句點開頭/結尾',
  '不能包含連續的特殊字元'
] as const