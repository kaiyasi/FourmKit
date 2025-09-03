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
    // 只有 dark 主題才設定為暗色模式
    applyTheme(theme, theme === 'dark')
  }, [theme])

    const cycle = () => {
    const idx = THEME_ORDER.indexOf(theme)
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length]
    setTheme(next)
    // auto 模式不強制指定 isDark，讓系統決定
    // 只有 dark 主題才設定為暗色模式
    saveTheme(next, next === 'dark')
    
    // 觸覺反饋
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } catch {}
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
      requestAnimationFrame(()=> {
        document.documentElement.classList.add('theme-ready');
      });
    },[]);

  // 只在主題真正改變時添加過渡動畫
  const [prevTheme, setPrevTheme] = useState<ThemeName | null>(null);
  
  useEffect(() => {
    if (prevTheme && prevTheme !== theme) {
      // 添加主題切換動畫類
      document.documentElement.classList.add('theme-transition');
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 300);
    }
    setPrevTheme(theme);
  }, [theme, prevTheme]);

  return (
      <button
        onClick={cycle}
        className="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-surface/70 hover:bg-surface border border-border transition text-fg touch-target mobile-btn-sm"
        aria-label={`切換主題，目前：${NAME_MAP[theme]}`}
        title={`切換主題，目前：${NAME_MAP[theme]}`}
        data-tip={`目前：${NAME_MAP[theme]} (點擊切換)`}
      >
        {icon()}
      </button>
  )
}
