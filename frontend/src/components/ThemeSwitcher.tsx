import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, saveTheme, loadTheme, ThemeName } from '../lib/theme'

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'beige', label: '米白' },
  { key: 'ocean',   label: '霧藍' },
  { key: 'forest',  label: '霧綠' },
  { key: 'mist',    label: '灰白' },
  { key: 'dark',    label: '灰黑' },
]

export function ThemeSwitcher(){
  const [theme, setTheme] = useState(loadTheme().theme)
  useEffect(()=>{ applyTheme(theme, true) }, [theme])

  return (
    <div className="flex items-center gap-2">
      <select
        className="border border-border bg-surface rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
        value={theme}
        onChange={e => {
          const t = e.target.value as ThemeName
          setTheme(t)
          saveTheme(t, true)
          applyTheme(t, true)
        }}
      >
        {THEMES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      {/* 已移除深/淺色切換，僅保留主題選擇 */}
    </div>
  )
}
