export type ThemeName = 'default' | 'ocean' | 'forest' | 'mist' | 'dark'

const THEME_KEY = 'fk.theme'
const DARK_KEY = 'fk.dark'

export function applyTheme(theme: ThemeName, isDark: boolean){
  const html = document.documentElement
  if(theme === 'default') html.removeAttribute('data-theme')
  else html.setAttribute('data-theme', theme)
  html.classList.toggle('dark', isDark)
}

export function saveTheme(theme: ThemeName, isDark: boolean){
  try {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(DARK_KEY, isDark ? '1' : '0')
  } catch(_) { /* ignore */ }
}

export function loadTheme(): { theme: ThemeName; isDark: boolean }{
  let theme = 'default' as ThemeName
  try {
    const t = localStorage.getItem(THEME_KEY) as ThemeName | null
    if(t) theme = t
  } catch(_) { /* ignore */ }
  let isDark: boolean
  try {
    const d = localStorage.getItem(DARK_KEY)
    isDark = d ? d === '1' : window.matchMedia?.('(prefers-color-scheme: dark)').matches
  } catch(_) { isDark = false }
  return { theme, isDark }
}

export const THEME_ORDER: ThemeName[] = ['default','ocean','forest','mist','dark']

// Immediate apply to reduce flash
try {
  const { theme, isDark } = loadTheme()
  applyTheme(theme, isDark)
} catch(_) { /* no-op */ }
