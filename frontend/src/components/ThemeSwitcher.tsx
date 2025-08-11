import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, saveTheme, loadTheme, ThemeName } from '../lib/theme'

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'default', label: '米白' },
  { key: 'ocean',   label: '霧藍' },
  { key: 'forest',  label: '霧綠' },
  { key: 'mist',    label: '灰白' },
  { key: 'dark',    label: '灰黑' },
]

export function ThemeSwitcher(){
  const [{ theme, isDark }, setState] = useState(loadTheme())
  useEffect(()=>{ applyTheme(theme, isDark) }, [theme, isDark])

  return (
    <div className="flex items-center gap-2">
      <select
        className="border border-border bg-surface rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
        value={theme}
        onChange={e => {
          const t = e.target.value as ThemeName
          setState((s: { theme: ThemeName; isDark: boolean }) => { const n={...s, theme:t}; saveTheme(n.theme,n.isDark); return n })
          applyTheme(t, isDark)
        }}
      >
        {THEMES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>

      <button
        className="inline-flex items-center gap-1 border border-border bg-surface rounded-xl px-2 py-1 text-sm hover:bg-surface-hover transition"
        onClick={() => {
          setState((s: { theme: ThemeName; isDark: boolean }) => { const n={...s, isDark:!s.isDark}; saveTheme(n.theme,n.isDark); applyTheme(n.theme,n.isDark); return n })
        }}
        aria-label={isDark ? '切到淺色' : '切到深色'}
        title={isDark ? '切到淺色' : '切到深色'}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span>{isDark ? '淺色' : '深色'}</span>
      </button>
    </div>
  )
}
