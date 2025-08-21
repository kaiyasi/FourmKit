export type ThemeName = 'auto' | 'beige' | 'ocean' | 'forest' | 'mist' | 'dark'

const THEME_KEY = 'fk.theme'
const DARK_KEY = 'fk.dark'

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  } catch { return false }
}

export function applyTheme(theme: ThemeName, isDark?: boolean){
  const html = document.documentElement
  if (theme === 'auto') {
    const dark = systemPrefersDark()
    html.setAttribute('data-theme', dark ? 'dark' : 'beige')
    html.classList.toggle('dark', dark)
    return
  }
  html.setAttribute('data-theme', theme)
  html.classList.toggle('dark', !!isDark)
}

export function saveTheme(theme: ThemeName, isDark: boolean){
  try {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(DARK_KEY, isDark ? '1' : '0')
  } catch(_) { /* ignore */ }
}

export function loadTheme(): { theme: ThemeName; isDark: boolean }{
  let theme = 'beige' as ThemeName
  try {
    const t = localStorage.getItem(THEME_KEY) as ThemeName | null
    if(t) theme = t
  } catch(_) { /* ignore */ }
  let isDark: boolean
  try {
    if (theme === 'auto') {
      isDark = systemPrefersDark()
    } else {
      const d = localStorage.getItem(DARK_KEY)
      isDark = d ? d === '1' : systemPrefersDark()
    }
  } catch(_) { isDark = false }
  return { theme, isDark }
}

export const THEME_ORDER: ThemeName[] = ['auto','beige','ocean','forest','mist','dark']

// 在自動模式下，監聽系統主題變化
function startSystemThemeSync(){
  try {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mql) return
    const handler = () => {
      try {
        const t = (localStorage.getItem(THEME_KEY) as ThemeName | null) ?? 'beige'
        if (t === 'auto') applyTheme('auto')
      } catch { /* ignore */ }
    }
    mql.addEventListener?.('change', handler)
    // 一些舊瀏覽器
    // @ts-ignore
    mql.addListener?.(handler)
  } catch { /* ignore */ }
}

// Immediate apply to reduce flash
try {
  const { theme, isDark } = loadTheme()
  applyTheme(theme, isDark)
  startSystemThemeSync()
} catch(_) { /* no-op */ }
