/**
 * 密碼規範與驗證工具函數
 * 符合新的安全要求：至少10碼、包含英數、不可連續序列
 */

export interface PasswordValidationResult {
  isValid: boolean
  checks: {
    minLength: boolean      // 至少 10 碼
    hasLetters: boolean     // 包含英文字母
    hasNumbers: boolean     // 包含數字
    notAllNumbers: boolean  // 不可全為數字
    noConsecutiveSequence: boolean // 不可有連續序列
  }
  errors: string[]
}

/**
 * 最小密碼長度
 */
export const MIN_PASSWORD_LENGTH = 10

/**
 * 偵測連續序列的函數
 * 檢查是否包含任一方向連續 4 碼以上的數字或字母片段
 */
function hasConsecutiveSequence(password: string): boolean {
  const digits = '0123456789'
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  
  const checkSequence = (str: string, sequence: string): boolean => {
    // 檢查遞增序列
    for (let i = 0; i <= sequence.length - 4; i++) {
      const substr = sequence.substring(i, i + 4)
      if (str.includes(substr)) {
        return true
      }
    }
    
    // 檢查遞減序列
    const reversedSequence = sequence.split('').reverse().join('')
    for (let i = 0; i <= reversedSequence.length - 4; i++) {
      const substr = reversedSequence.substring(i, i + 4)
      if (str.includes(substr)) {
        return true
      }
    }
    
    return false
  }
  
  const lowerPassword = password.toLowerCase()
  
  // 檢查數字序列
  if (checkSequence(lowerPassword, digits)) {
    return true
  }
  
  // 檢查字母序列
  if (checkSequence(lowerPassword, letters)) {
    return true
  }
  
  return false
}

/**
 * 驗證單個密碼的完整規範
 */
export function validatePassword(password: string): PasswordValidationResult {
  const checks = {
    minLength: password.length >= MIN_PASSWORD_LENGTH,
    hasLetters: /[a-zA-Z]/.test(password),
    hasNumbers: /[0-9]/.test(password),
    notAllNumbers: !/^[0-9]+$/.test(password),
    noConsecutiveSequence: !hasConsecutiveSequence(password)
  }
  
  const errors: string[] = []
  
  if (!checks.minLength) {
    errors.push(`密碼至少需要 ${MIN_PASSWORD_LENGTH} 個字元`)
  }
  
  if (!checks.hasLetters) {
    errors.push('密碼必須包含英文字母')
  }
  
  if (!checks.hasNumbers) {
    errors.push('密碼必須包含數字')
  }
  
  if (!checks.notAllNumbers) {
    errors.push('密碼不可全為數字')
  }
  
  if (!checks.noConsecutiveSequence) {
    errors.push('密碼不可包含連續序列（例如 1234、abcd、dcba、9876）')
  }
  
  const isValid = Object.values(checks).every(check => check === true)
  
  return {
    isValid,
    checks,
    errors
  }
}

/**
 * 驗證密碼與確認密碼是否一致
 */
export function validatePasswordConfirmation(
  password: string, 
  confirmPassword: string
): { isValid: boolean; error?: string } {
  if (!password || !confirmPassword) {
    return { 
      isValid: false, 
      error: '請輸入密碼和確認密碼' 
    }
  }
  
  if (password !== confirmPassword) {
    return { 
      isValid: false, 
      error: '兩次輸入的密碼不一致' 
    }
  }
  
  return { isValid: true }
}

/**
 * 完整的密碼驗證（包含確認密碼）
 */
export function validatePasswordWithConfirmation(
  password: string, 
  confirmPassword: string
): {
  isValid: boolean
  passwordValidation: PasswordValidationResult
  confirmationValidation: { isValid: boolean; error?: string }
} {
  const passwordValidation = validatePassword(password)
  const confirmationValidation = validatePasswordConfirmation(password, confirmPassword)
  
  return {
    isValid: passwordValidation.isValid && confirmationValidation.isValid,
    passwordValidation,
    confirmationValidation
  }
}

/**
 * 取得密碼強度指示器
 */
export function getPasswordStrength(password: string): {
  score: number // 0-4
  label: string
  color: string
} {
  if (!password) {
    return { score: 0, label: '請輸入密碼', color: 'text-muted' }
  }
  
  const validation = validatePassword(password)
  const passedChecks = Object.values(validation.checks).filter(Boolean).length
  
  if (passedChecks === 5) {
    return { score: 4, label: '強', color: 'text-green-600 dark:text-green-400' }
  } else if (passedChecks >= 4) {
    return { score: 3, label: '中等', color: 'text-yellow-600 dark:text-yellow-400' }
  } else if (passedChecks >= 2) {
    return { score: 2, label: '弱', color: 'text-orange-600 dark:text-orange-400' }
  } else {
    return { score: 1, label: '太弱', color: 'text-red-600 dark:text-red-400' }
  }
}

/**
 * 生成密碼規範提示列表
 */
export function getPasswordRequirements(): Array<{
  id: string
  text: string
  check: (password: string) => boolean
}> {
  return [
    {
      id: 'minLength',
      text: `至少 ${MIN_PASSWORD_LENGTH} 個字元`,
      check: (password: string) => password.length >= MIN_PASSWORD_LENGTH
    },
    {
      id: 'hasLetters',
      text: '包含英文字母',
      check: (password: string) => /[a-zA-Z]/.test(password)
    },
    {
      id: 'hasNumbers',
      text: '包含數字',
      check: (password: string) => /[0-9]/.test(password)
    },
    {
      id: 'notAllNumbers',
      text: '不可全為數字',
      check: (password: string) => !/^[0-9]+$/.test(password)
    },
    {
      id: 'noConsecutiveSequence',
      text: '不可包含連續序列（如 1234、abcd）',
      check: (password: string) => !hasConsecutiveSequence(password)
    }
  ]
}