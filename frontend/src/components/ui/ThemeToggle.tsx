import { Moon, Sun, Cloud, Leaf, Eye, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ThemeName, loadTheme, applyTheme, saveTheme, THEME_ORDER } from '../../lib/theme'

const NAME_MAP: Record<ThemeName,string> = {
  auto: '跟隨系統',
  beige: '米白',
  ocean: '霧藍',
  forest: '霧綠',
  mist: '灰白',
  dark: '灰黑'
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const initial = loadTheme().theme
  const [theme, setTheme] = useState<ThemeName>(initial)

  useEffect(() => { 
    // auto 模式由 applyTheme 自行判斷深淺色
    applyTheme(theme, theme==='dark')
  }, [theme])

    const cycle = () => {
    const idx = THEME_ORDER.indexOf(theme)
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length]
    setTheme(next)
    // auto 模式不強制指定 isDark，讓系統決定
    saveTheme(next, next==='dark')
  }

  // 僅設定尺寸，顏色交給父層（避免變數色彩 + 透明度組合造成不可見）
  const baseIconCls = 'w-4 h-4';
  const icon = () => {
    switch(theme){
      case 'auto': return <Monitor className={baseIconCls} />
      case 'beige': return <Sun className={baseIconCls} />
      case 'ocean': return <Cloud className={baseIconCls} />
      case 'forest': return <Leaf className={baseIconCls} />
      case 'mist': return <Eye className={baseIconCls} />
      case 'dark': return <Moon className={baseIconCls} />
      default: return <Sun className={baseIconCls} />
    }
  }

    useEffect(()=>{
      // 標記已就緒避免 FOUC
      requestAnimationFrame(()=> document.documentElement.classList.add('theme-ready'));
    },[theme]);

  return (
      <button
        onClick={cycle}
        className="p-2 rounded-full bg-surface hover:bg-surface-hover active:bg-surface-active border border-border shadow hover:scale-105 active:scale-95 transition flex items-center justify-center text-fg dark:text-white"
        aria-label={`切換主題，目前：${NAME_MAP[theme]}`}
        title={`切換主題，目前：${NAME_MAP[theme]}`}
        data-tip={`目前：${NAME_MAP[theme]} (點擊切換)`}
      >
        {icon()}
      </button>
  )
}
