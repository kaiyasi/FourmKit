// 輕量版學校網域偵測（免依賴 tldts）
// 參考需求：辨識 .edu.tw（K-12 與大學）與 .edu（大學），清除常見無用子網域前綴

export type SchoolLevel = 'university' | 'senior_high' | 'junior_high' | 'elementary' | 'unknown'

export interface DetectResult {
  ok: boolean
  confidence: 'high' | 'medium' | 'low'
  reason: string
  slug?: string
  school_name?: string
  level?: SchoolLevel
  canonical_domain?: string
  city_code?: string
  city_name?: string
  candidates?: {
    canonicalGuess?: string
    slugGuess?: string
    cityGuess?: string
  }
}

const USELESS_PREFIXES = [
  'mail', 'mx', 'gs', 'o365', 'owa', 'webmail', 'imap', 'smtp',
  'student', 'stud', 'std', 'alumni', 'staff', 'teacher', 'teachers',
]

const CITY_CODE_MAP: Record<string, string> = {
  tp: '臺北市',
  ntpc: '新北市',
  tc: '臺中市',
  tn: '臺南市',
  kh: '高雄市',
  ty: '桃園市',
  hc: '新竹市',
  hcc: '新竹縣',
  ml: '苗栗縣',
  ch: '彰化縣',
  yl: '雲林縣',
  cy: '嘉義市',
  cyc: '嘉義縣',
  il: '宜蘭縣',
  hl: '花蓮縣',
  tt: '臺東縣',
  ph: '澎湖縣',
  km: '金門縣',
  ly: '連江縣',
  kl: '基隆市',
  pt: '屏東縣',
}

function stripUselessPrefixes(sub: string): string[] {
  const parts = sub.split('.').filter(Boolean)
  while (parts.length && USELESS_PREFIXES.includes(parts[0].toLowerCase())) {
    parts.shift()
  }
  return parts
}

function safeDomainFromEmail(email: string): string | null {
  const i = email.lastIndexOf('@')
  if (i < 0) return null
  const host = email.slice(i + 1).trim().toLowerCase()
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  return host
}

export function detectSchoolFromEmail(email: string): DetectResult {
  const host = safeDomainFromEmail(email)
  if (!host) return { ok: false, confidence: 'low', reason: '不是合法 email（無法解析網域）' }

  // 只處理 edu 與 edu.tw；其餘標記為不支援
  if (!(host.endsWith('.edu') || host.endsWith('.edu.tw'))) {
    const suf = host.split('.').slice(-2).join('.')
    return { ok: false, confidence: 'low', reason: `非教育網域（.${suf}）` }
  }

  // Taiwan K-12 or TW universities
  if (host.endsWith('.edu.tw')) {
    const parts = host.split('.') // e.g. nhsh.tp.edu.tw | ncku.edu.tw
    if (parts.length < 3) {
      return { ok: false, confidence: 'low', reason: '網域層級不足' }
    }
    const last = parts.slice(-2).join('.') // 'edu.tw'
    const rest = parts.slice(0, -2)        // ['nhsh','tp'] or ['ncku']
    if (rest.length === 1) {
      // 大學樣式: ncku.edu.tw
      const uniSlug = rest[0]
      return {
        ok: true,
        confidence: 'medium',
        reason: '大學樣式（registrable: *.edu.tw）',
        slug: uniSlug,
        level: 'university',
        canonical_domain: `${uniSlug}.edu.tw`,
        candidates: { canonicalGuess: `${uniSlug}.edu.tw`, slugGuess: uniSlug },
      }
    }
    // K-12: <school>.<city>.edu.tw，或帶無用前綴
    const sub = rest.join('.') // e.g. 'nhsh.tp' | 'mail.nhsh.tp'
    const cleaned = stripUselessPrefixes(sub)
    // cleaned 可能是 ['nhsh','tp'] 或 ['dept','nhsh','tp']
    const city = cleaned.slice(-1)[0]
    const schoolSlug = cleaned[0]
    if (!city || !schoolSlug) {
      return {
        ok: false,
        confidence: 'low',
        reason: 'K-12 樣式但無法推斷 slug 或城市',
      }
    }
    return {
      ok: true,
      confidence: CITY_CODE_MAP[city] ? 'high' : 'medium',
      reason: CITY_CODE_MAP[city] ? 'K-12 樣式，slug+city 推斷' : 'K-12 樣式（城市代碼不在常見清單）',
      slug: schoolSlug,
      level: 'senior_high',
      canonical_domain: `${schoolSlug}.${city}.edu.tw`,
      city_code: city,
      city_name: CITY_CODE_MAP[city],
      candidates: { canonicalGuess: `${schoolSlug}.${city}.edu.tw`, slugGuess: schoolSlug, cityGuess: city },
    }
  }

  // .edu 國際大學：<slug>.edu 或 dept.<slug>.edu
  if (host.endsWith('.edu')) {
    const parts = host.split('.') // e.g. nthu.edu | mail.stanford.edu
    const rest = parts.slice(0, -1) // remove 'edu'
    if (rest.length === 0) return { ok: false, confidence: 'low', reason: '網域層級不足' }
    const cleaned = stripUselessPrefixes(rest.join('.')).filter(Boolean)
    const slug = cleaned.slice(-1)[0] || rest[0]
    return {
      ok: true,
      confidence: 'medium',
      reason: '大學樣式（.edu）',
      slug,
      level: 'university',
      canonical_domain: `${slug}.edu`,
      candidates: { canonicalGuess: `${slug}.edu`, slugGuess: slug },
    }
  }

  return { ok: false, confidence: 'low', reason: '未支援的網域樣式' }
}

