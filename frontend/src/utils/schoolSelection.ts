/**
 * 學校選擇與 slug 管理工具函數
 */

export interface School {
  id: number
  name: string
  slug: string
  domain?: string
  region?: string
  type?: 'university' | 'college' | 'institute' | 'other'
}

export interface SchoolSelectionState {
  selectedSchoolId: number | null
  selectedSchool: School | null
  customSchoolRequested: boolean
  slugReportRequested: boolean
}

/**
 * 特殊選項：找不到我的學校
 */
export const CUSTOM_SCHOOL_OPTION: School = {
  id: -1,
  name: '找不到我的學校',
  slug: 'custom-request',
  type: 'other'
}

/**
 * 從學校清單中尋找學校
 */
export function findSchoolById(schools: School[], id: number): School | null {
  return schools.find(school => school.id === id) || null
}

/**
 * 從學校清單中根據 slug 尋找學校
 */
export function findSchoolBySlug(schools: School[], slug: string): School | null {
  return schools.find(school => school.slug === slug) || null
}

/**
 * 根據學校名稱模糊搜尋
 */
export function searchSchools(schools: School[], query: string): School[] {
  if (!query.trim()) {
    return schools
  }
  
  const normalizedQuery = query.toLowerCase().trim()
  
  return schools.filter(school => 
    school.name.toLowerCase().includes(normalizedQuery) ||
    school.slug.toLowerCase().includes(normalizedQuery) ||
    school.domain?.toLowerCase().includes(normalizedQuery)
  )
}

/**
 * 建議學校（根據 email 域名）
 */
export function suggestSchoolFromEmail(schools: School[], email: string): School | null {
  if (!email || !email.includes('@')) {
    return null
  }
  
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) {
    return null
  }
  
  // 嘗試完全匹配域名
  const exactMatch = schools.find(school => 
    school.domain?.toLowerCase() === domain
  )
  
  if (exactMatch) {
    return exactMatch
  }
  
  // 嘗試模糊匹配（去除 .edu.tw 或 .edu 後匹配）
  const baseDomain = domain.replace(/\.edu(\.tw)?$/, '')
  const fuzzyMatch = schools.find(school => {
    const schoolBaseDomain = school.domain?.replace(/\.edu(\.tw)?$/, '')
    return schoolBaseDomain && baseDomain.includes(schoolBaseDomain)
  })
  
  return fuzzyMatch || null
}

/**
 * 驗證學校 slug 格式
 */
export function validateSchoolSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, error: '學校代碼不能為空' }
  }
  
  const normalizedSlug = slug.trim().toLowerCase()
  
  // 基本格式檢查：只允許字母、數字、連字號
  if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
    return { 
      valid: false, 
      error: '學校代碼只能包含英文字母、數字和連字號' 
    }
  }
  
  // 長度檢查
  if (normalizedSlug.length < 2 || normalizedSlug.length > 50) {
    return { 
      valid: false, 
      error: '學校代碼長度需要在 2-50 字元之間' 
    }
  }
  
  // 不能以連字號開頭或結尾
  if (normalizedSlug.startsWith('-') || normalizedSlug.endsWith('-')) {
    return { 
      valid: false, 
      error: '學校代碼不能以連字號開頭或結尾' 
    }
  }
  
  return { valid: true }
}

/**
 * 格式化學校顯示名稱
 */
export function formatSchoolDisplayName(school: School): string {
  if (!school.name) {
    return school.slug || '未知學校'
  }
  
  return school.name
}

/**
 * 取得學校類型的中文名稱
 */
export function getSchoolTypeDisplayName(type?: School['type']): string {
  const typeNames: Record<NonNullable<School['type']>, string> = {
    university: '大學',
    college: '學院',
    institute: '研究所',
    other: '其他'
  }
  
  return type ? typeNames[type] : '未分類'
}

/**
 * 學校清單排序
 */
export function sortSchools(schools: School[]): School[] {
  return [...schools].sort((a, b) => {
    // 先按類型排序（大學優先）
    const typeOrder = { university: 0, college: 1, institute: 2, other: 3 }
    const aTypeOrder = typeOrder[a.type || 'other']
    const bTypeOrder = typeOrder[b.type || 'other']
    
    if (aTypeOrder !== bTypeOrder) {
      return aTypeOrder - bTypeOrder
    }
    
    // 再按名稱排序
    return a.name.localeCompare(b.name, 'zh-TW')
  })
}

/**
 * 生成管理員通知的學校請求資訊
 */
export function generateSchoolRequestInfo(
  userEmail: string,
  customSchoolName?: string,
  customSchoolDomain?: string,
  additionalInfo?: string
): {
  type: 'school_request'
  userEmail: string
  timestamp: string
  details: {
    requestedSchoolName?: string
    requestedDomain?: string
    userProvidedInfo?: string
    detectedDomain: string
  }
} {
  const domain = userEmail.includes('@') ? userEmail.split('@')[1] : 'unknown'
  
  return {
    type: 'school_request',
    userEmail,
    timestamp: new Date().toISOString(),
    details: {
      requestedSchoolName: customSchoolName,
      requestedDomain: customSchoolDomain,
      userProvidedInfo: additionalInfo,
      detectedDomain: domain
    }
  }
}

/**
 * 生成 slug 錯誤回報資訊
 */
export function generateSlugReportInfo(
  userEmail: string,
  schoolId: number,
  schoolName: string,
  currentSlug: string,
  reportReason?: string
): {
  type: 'slug_report'
  userEmail: string
  timestamp: string
  details: {
    schoolId: number
    schoolName: string
    currentSlug: string
    reportReason?: string
  }
} {
  return {
    type: 'slug_report',
    userEmail,
    timestamp: new Date().toISOString(),
    details: {
      schoolId,
      schoolName,
      currentSlug,
      reportReason
    }
  }
}