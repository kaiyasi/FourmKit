import { useEffect, useState } from 'react'
import { NavBar } from './components/NavBar'
import { MobileFabNav } from './components/MobileFabNav'
import { ThemeSwitcher } from './components/ThemeSwitcher'

type PlatformMode = {
  mode: 'normal' | 'maintenance' | 'development'
  maintenance_message?: string
  maintenance_until?: string
}

type Role = 'guest' | 'user' | 'moderator' | 'admin'

// 開發進度資料型別
interface ProgressItem {
  name: string
  status: 'completed' | 'in_progress' | 'planned'
  description: string
}

interface ProgressData {
  progress_items: ProgressItem[]
  recent_updates: string[]
  last_updated: string
  error?: string
}

export default function App() {
  const [role, setRole] = useState<Role>('guest')
  const [pathname, setPathname] = useState(window.location.pathname)
  const [platform, setPlatform] = useState<PlatformMode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 開發進度相關狀態
  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(true)

  // 讀取模式
  useEffect(() => {
    const html = document.documentElement;
    // 若尚未設定主題，預設為 default（米白）
    if (!html.getAttribute('data-theme')) {
      html.setAttribute('data-theme', 'beige');
    }
    // App 掛載後讓畫面從 opacity:0 → 1
    html.classList.add('theme-ready');
    return () => {
      html.classList.remove('theme-ready');
    };
  }, []);

  useEffect(() => {
    fetch('/api/mode').then(r => r.json()).then(setPlatform).catch(e => setError(String(e))).finally(()=> setLoading(false))
  }, [])
  
  useEffect(()=> { console.log('[ForumKit] build tag', (import.meta as any).env?.VITE_BUILD_TAG) },[])
  
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 讀取開發進度資料（只在開發模式時執行）
  useEffect(() => {
    if (platform?.mode === 'development' && pathname === '/') {
      const fetchProgress = async () => {
        try {
          console.log('[ForumKit] 開始讀取開發進度資料...')
          const response = await fetch('/api/progress')
          console.log('[ForumKit] API 回應狀態:', response.status)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          const data = await response.json()
          console.log('[ForumKit] 收到的開發進度資料:', data)
          
          // 驗證資料格式
          if (data && typeof data === 'object') {
            if (data.error) {
              console.error('[ForumKit] 後端返回錯誤:', data.error)
              setProgressData({ ...data, progress_items: [], recent_updates: [] })
            } else if (Array.isArray(data.progress_items) && Array.isArray(data.recent_updates)) {
              setProgressData(data)
            } else {
              console.error('[ForumKit] 資料格式不正確:', data)
              setProgressData({
                progress_items: [],
                recent_updates: [],
                last_updated: new Date().toISOString(),
                error: '資料格式不正確'
              })
            }
          } else {
            console.error('[ForumKit] 收到非物件資料:', data)
            setProgressData({
              progress_items: [],
              recent_updates: [],
              last_updated: new Date().toISOString(),
              error: '收到非物件資料'
            })
          }
        } catch (error) {
          console.error('[ForumKit] 讀取開發進度失敗:', error)
          setProgressData({
            progress_items: [],
            recent_updates: [],
            last_updated: new Date().toISOString(),
            error: `讀取失敗: ${error instanceof Error ? error.message : String(error)}`
          })
        } finally {
          setProgressLoading(false)
        }
      }

      fetchProgress()
    }
  }, [platform?.mode, pathname])

  // 取得狀態標籤樣式
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'px-2 py-1 text-xs rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'in_progress':
        return 'px-2 py-1 text-xs rounded-lg bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'planned':
        return 'px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
      default:
        return 'px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
    }
  }

  // 取得狀態文字
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '完成'
      case 'in_progress':
        return '開發中'
      case 'planned':
        return '規劃中'
      default:
        return '未知'
    }
  }

    // Loading / error 狀態
    if (loading) {
      return (
        <div className="min-h-screen grid place-items-center bg-neutral-50 dark:bg-neutral-900">
          <div className="text-neutral-600 dark:text-neutral-300">載入中...</div>
        </div>
      );
    }
    if (error || !platform) {
      return (
        <div className="min-h-screen grid place-items-center bg-neutral-50 dark:bg-neutral-900">
          <div className="text-red-600 dark:text-red-400">
            {error ? `載入失敗：${error}` : '無法取得平台模式'}
          </div>
        </div>
      );
    }

  // 管理模式切換頁 (/mode) - 無論當前平台模式都允許進入（以便維護期間調整）
  if (pathname === '/mode') {
    return <AdminModePanel platform={platform} onUpdated={setPlatform} full />
  }

  // 維護模式畫面（除 /mode 外全部攔截）
  if (platform.mode === 'maintenance') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-2xl w-full rounded-2xl p-8 shadow-lg bg-white/70 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 backdrop-blur">
          <h1 className="text-3xl font-bold mb-2">系統維護中</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">我們正在升級服務以提供更佳體驗，造成不便敬請見諒。</p>
          <p className="mb-4 whitespace-pre-wrap">{platform.maintenance_message || '維護作業進行中。'}</p>
          {platform.maintenance_until && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-6">預計完成：{platform.maintenance_until}</p>
          )}
          <ReportForm />
        </div>
      </div>
    );
  }

function ReportForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('一般回報');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { ok: boolean; delivery?: string }>(null);
  const minRows = compact ? 3 : 5;

  const submit = async () => {
    if (!message || message.trim().length < 5) {
      alert('請至少填寫 5 個字的說明，謝謝！');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: email, category, message }),
      });
      const data = await r.json().catch(() => ({}));
      setDone({ ok: r.ok, delivery: data?.delivery });
      if (r.ok) {
        setMessage('');
      }
    } catch {
      setDone({ ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-left">
      <h3 className="font-semibold mb-3">回報問題 / 建議</h3>
      <div className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-2">
          <input
            type="text"
            placeholder="你的聯絡方式（DC ID 或 Email，可留空）"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70"
          />
          <select
            value={category}
            onChange={e=>setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70"
          >
            <option>一般回報</option>
            <option>無法載入</option>
            <option>帳號/登入</option>
            <option>安全性</option>
            <option>建議改善</option>
          </select>
        </div>
        <textarea
          placeholder="請描述你遇到的情況（盡量提供操作步驟與時間點）"
          value={message}
          onChange={e=>setMessage(e.target.value)}
          rows={minRows}
          className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50"
          >
            {busy ? '送出中...' : '送出回報'}
          </button>
          {done && (
            <span className={`text-sm ${done.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {done.ok ? (done.delivery === 'smtp' ? '已寄出' : '已送至 Discord') : '送出失敗'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

     // 開發模式頁面
   if (platform.mode === 'development' && pathname === '/') {
     return (
       <div className="min-h-screen flex flex-col items-center pt-24 md:pt-32 px-4">
         {/* 主題切換按鈕 */}
         <div className="fixed top-4 right-4 z-50">
           <ThemeSwitcher />
         </div>
         
         <div className="max-w-4xl w-full space-y-8">
            {/* 平台介紹區塊 */}
            <div className="bg-surface border border-border rounded-2xl p-8 shadow-soft">
             <div className="text-center mb-8">
               <h1 className="text-4xl font-bold dual-text mb-3">ForumKit</h1>
               <h2 className="text-lg text-fg mb-4">校園匿名討論平台</h2>
               <p className="leading-relaxed text-sm md:text-base text-fg">
                 ForumKit 是一個專為校園環境設計的現代化討論平台，提供安全、匿名且友善的交流空間。
                 我們致力於創造一個讓每個人都能自由表達想法、分享經驗的環境。
               </p>
             </div>
            
            {/* 特色介紹 */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-6 rounded-xl border border-border bg-surface shadow-soft">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-600/20 rounded-xl flex items-center justify-center mb-4 mx-auto">
                  <svg className="w-6 h-6 text-primary dark:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                                 <h3 className="font-semibold dual-text mb-2">安全匿名</h3>
                 <p className="text-sm text-fg">保護您的隱私，讓您能夠自由地表達想法，無需擔心身份暴露。</p>
               </div>
               
              <div className="text-center p-6 rounded-xl border border-border bg-surface shadow-soft">
                 <div className="w-12 h-12 bg-primary-100 dark:bg-primary-600/20 rounded-xl flex items-center justify-center mb-4 mx-auto">
                   <svg className="w-6 h-6 text-primary dark:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                   </svg>
                 </div>
                 <h3 className="font-semibold dual-text mb-2">友善社群</h3>
                 <p className="text-sm text-fg">建立一個互相尊重、支持成長的校園社群，讓每個人都能找到歸屬感。</p>
               </div>
               
              <div className="text-center p-6 rounded-xl border border-border bg-surface shadow-soft">
                 <div className="w-12 h-12 bg-primary-100 dark:bg-primary-600/20 rounded-xl flex items-center justify-center mb-4 mx-auto">
                   <svg className="w-6 h-6 text-primary dark:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                   </svg>
                 </div>
                 <h3 className="font-semibold dual-text mb-2">即時互動</h3>
                 <p className="text-sm text-fg">快速響應的介面設計，讓討論更加流暢自然，提升交流體驗。</p>
              </div>
            </div>
          </div>

          {/* 開發模式功能區塊 */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* 顏色搭配器 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <h3 className="font-semibold dual-text mb-4 flex items-center">
                <svg className="w-5 h-5 text-primary dark:text-primary-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                </svg>
                顏色搭配器
              </h3>
                             <p className="text-sm text-fg mb-4">
                 協助我們設計更好的視覺體驗！您可以自由搭配顏色，我們會參考您的建議來開發新的主題。
               </p>
              <ColorDesigner />
            </div>

            {/* 開發進度紀錄 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <h3 className="font-semibold dual-text mb-4 flex items-center">
                <svg className="w-5 h-5 text-primary dark:text-primary-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                開發進度紀錄
              </h3>
                             <p className="text-sm text-fg mb-4">
                 記錄 ForumKit 的開發進度和功能實現狀況。
               </p>
              
              {progressLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-2 text-fg">載入中...</span>
                </div>
              ) : progressData?.error ? (
                <div className="text-center py-8 text-rose-600">
                  <p>載入失敗：{progressData.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {progressData?.progress_items?.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface shadow-soft">
                        <div>
                          <h4 className="font-medium dual-text">{item.name}</h4>
                          {item.description && (
                            <p className="text-xs text-fg">{item.description}</p>
                          )}
                        </div>
                        <span className={getStatusBadge(item.status)}>
                          {getStatusText(item.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-surface rounded-xl p-4 border border-border shadow-soft">
                    <h4 className="font-semibold dual-text mb-2">最近更新</h4>
                    <div className="text-sm text-fg space-y-1">
                      {progressData?.recent_updates?.map((update, index) => (
                        <div key={index}>• {update}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 回報表單 */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <h3 className="font-semibold dual-text mb-4 flex items-center">
              <svg className="w-5 h-5 text-primary dark:text-primary-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              意見回饋
            </h3>
                         <p className="text-sm text-fg mb-4">
               您的意見對我們非常重要！請告訴我們您的想法、建議或遇到的問題。
             </p>
            <ReportForm compact />
          </div>
        </div>
      </div>
    )
  }

  // normal or development (其他頁)
  return (
    <div className="min-h-screen">
      <NavBar role={role} pathname={pathname} />
      <MobileFabNav role={role} />
      <main className="mx-auto max-w-5xl px-4 pt-24 md:pt-28">
        <section className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
          <h1 className="text-2xl font-semibold dual-text">ForumKit</h1>
          <p className="text-muted mt-2">主題切換：按導覽列或 FAB 的圖示循環 (預設→海霧→森雨→霧朦→暗夜)。</p>
          <div className="mt-6 flex gap-2 flex-wrap">
            {(['guest','user','moderator','admin'] as Role[]).map(r => (
              <button key={r} onClick={() => setRole(r)} className={`px-3 py-1.5 rounded-xl border dual-btn ${role===r? 'ring-2 ring-primary/50':''}`}>{r}</button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function ColorDesigner() {
  const [primaryColor, setPrimaryColor] = useState('#F8F5EE')
  const [secondaryColor, setSecondaryColor] = useState('#DCCFBD')
  const [colorType, setColorType] = useState<'light' | 'dark'>('light')
  const [themeName, setThemeName] = useState('')
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // 根據深淺色類型自動生成按鈕和文字顏色
  const getButtonColor = () => colorType === 'light' ? '#2E2F31' : '#F5F5F5'
  const getTextColor = () => colorType === 'light' ? '#2E2F31' : '#F5F5F5'

  const submitTheme = async () => {
    if (!themeName.trim()) {
      alert('請為您的主題命名！')
      return
    }
    
    setSubmitted(true)
    try {
      const themeData = {
        name: themeName,
        description: description,
        colors: {
          primary: primaryColor,
          secondary: secondaryColor,
          colorType: colorType,
          buttonColor: getButtonColor(),
          textColor: getTextColor()
        }
      }
      
      await fetch('/api/color_vote', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(themeData) 
      })
      
      alert('感謝您的設計建議！我們會認真考慮您的配色方案。')
      setThemeName('')
      setDescription('')
    } catch (error) {
      alert('提交失敗，請稍後再試')
    } finally {
      setSubmitted(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 顏色預覽 */}
      <div className="bg-surface/50 rounded-xl p-4 border border-border">
        <h4 className="font-semibold dual-text mb-3">主題預覽</h4>
        <div className="space-y-3">
          {/* 背景預覽 */}
          <div 
            className="h-20 rounded-xl flex items-center justify-center font-semibold shadow-sm border-2"
            style={{ 
              backgroundColor: primaryColor,
              borderColor: secondaryColor,
              color: getTextColor()
            }}
          >
            背景顏色 (主色)
          </div>
          
          {/* 按鈕預覽 */}
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded-xl font-semibold shadow-sm"
              style={{ 
                backgroundColor: getButtonColor(),
                color: colorType === 'light' ? '#FFFFFF' : '#1F1F1F'
              }}
            >
              按鈕樣式
            </button>
            <div 
              className="px-4 py-2 rounded-xl font-semibold shadow-sm border-2"
              style={{ 
                backgroundColor: 'transparent',
                borderColor: secondaryColor,
                color: getTextColor()
              }}
            >
              框線樣式
            </div>
          </div>
        </div>
      </div>

      {/* 顏色選擇器 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            主色調 (背景顏色)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
              placeholder="#F8F5EE"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            輔助色 (框線顏色)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
              placeholder="#DCCFBD"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            深淺色類型
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setColorType('light')}
              className={`px-3 py-2 rounded-xl border transition-colors ${
                colorType === 'light' 
                  ? 'dual-btn ring-2 ring-primary/50' 
                  : 'bg-surface/60 hover:bg-surface/80 border-border text-muted hover:text-fg'
              }`}
            >
              淺色主題 (黑字白按鈕)
            </button>
            <button
              onClick={() => setColorType('dark')}
              className={`px-3 py-2 rounded-xl border transition-colors ${
                colorType === 'dark' 
                  ? 'dual-btn ring-2 ring-primary/50' 
                  : 'bg-surface/60 hover:bg-surface/80 border-border text-muted hover:text-fg'
              }`}
            >
              深色主題 (白字黑按鈕)
            </button>
          </div>
        </div>
      </div>

      {/* 主題資訊 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            主題名稱 *
          </label>
          <input
            type="text"
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
            placeholder="例如：春日櫻花、深海藍調、溫暖日落"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            設計理念 (可選)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg"
            placeholder="請描述您的設計理念、靈感來源或使用場景..."
          />
        </div>
      </div>

      {/* 快速配色方案 */}
      <div>
        <label className="block text-sm font-medium text-fg mb-3">
          快速配色方案
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { name: '預設', primary: '#F8F5EE', secondary: '#DCCFBD', type: 'light' as const },
            { name: '海霧', primary: '#EEF5F8', secondary: '#BCD2DB', type: 'light' as const },
            { name: '森雨', primary: '#F1F6F1', secondary: '#C2D2C4', type: 'light' as const },
            { name: '霧朦', primary: '#F6F7F8', secondary: '#D3D9DD', type: 'light' as const },
            { name: '暗夜', primary: '#121212', secondary: '#5F5F5F', type: 'dark' as const },
            { name: '暖色', primary: '#FEF7ED', secondary: '#FED7AA', type: 'light' as const },
            { name: '粉調', primary: '#FDF2F8', secondary: '#F9A8D4', type: 'light' as const },
            { name: '灰調', primary: '#F9FAFB', secondary: '#D1D5DB', type: 'light' as const }
          ].map((scheme) => (
            <button
              key={scheme.name}
              onClick={() => {
                setPrimaryColor(scheme.primary)
                setSecondaryColor(scheme.secondary)
                setColorType(scheme.type)
              }}
              className="p-3 rounded-xl border border-border bg-surface/50 hover:bg-surface/70 transition-colors"
            >
              <div className="flex gap-1 mb-2">
                <div className="w-4 h-4 rounded border" style={{ backgroundColor: scheme.primary, borderColor: scheme.secondary }}></div>
                <div className="w-4 h-4 rounded" style={{ backgroundColor: scheme.secondary }}></div>
                <div className="w-4 h-4 rounded" style={{ backgroundColor: scheme.type === 'light' ? '#2E2F31' : '#F5F5F5' }}></div>
              </div>
                             <div className="text-xs text-fg">{scheme.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 提交按鈕 */}
      <button
        onClick={submitTheme}
        disabled={submitted || !themeName.trim()}
        className="w-full py-2 px-4 rounded-xl dual-btn disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitted ? '提交中...' : '提交配色方案'}
      </button>
    </div>
  )
}

function AdminModePanel({ platform, onUpdated, full }: { platform: PlatformMode; onUpdated: (p: PlatformMode)=> void; full?: boolean }) {
  const [mode, setMode] = useState(platform.mode)
  const [msg, setMsg] = useState(platform.maintenance_message || '')
  const [until, setUntil] = useState(platform.maintenance_until || '')
  const [saving, setSaving] = useState(false)
  const save = () => {
    setSaving(true)
    fetch('/api/mode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode, maintenance_message: msg, maintenance_until: until }) })
      .then(r=> r.json()).then(onUpdated).finally(()=> setSaving(false))
  }
  const inner = (
    <div className="max-w-xl w-full bg-surface/80 border border-border rounded-2xl p-6 shadow backdrop-blur mt-10">
      <h2 className="font-semibold text-xl mb-4">平台模式管理</h2>
      <div className="flex gap-4 flex-wrap mb-4">
        {(['normal','maintenance','development'] as PlatformMode['mode'][]).map(m => (
          <label key={m} className={`px-3 py-2 rounded-xl border cursor-pointer ${mode===m? 'dual-btn ring-2 ring-primary/50':'bg-surface/60 hover:bg-surface/80 border-border'}`}> 
            <input type="radio" name="mode" value={m} className="hidden" checked={mode===m} onChange={()=> setMode(m)} />{m}
          </label>
        ))}
      </div>
      {mode==='maintenance' && (
        <div className="space-y-3 mb-4">
          <textarea value={msg} onChange={e=> setMsg(e.target.value)} placeholder="維護訊息" className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 min-h-[80px]" />
          <input value={until} onChange={e=> setUntil(e.target.value)} placeholder="預計完成時間 (ISO 或描述)" className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70" />
        </div>
      )}
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50">{saving? '儲存中...' : '儲存'}</button>
      <p className="text-xs text-muted mt-4">尚未加入權限驗證（後續需登入才可操作）。</p>
    </div>
  )
  if (full) return <div className="min-h-screen flex flex-col items-center pt-24 md:pt-32 px-4">{inner}</div>
  return <div className="mt-10">{inner}</div>
}
