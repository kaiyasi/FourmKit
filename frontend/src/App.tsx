import { useEffect, useState } from 'react'
import { NavBar } from './components/NavBar'
import { MobileFabNav } from './components/MobileFabNav'

type Role = 'guest' | 'user' | 'moderator' | 'admin'

export default function App() {
  const [role, setRole] = useState<Role>('guest')
  const [pathname, setPathname] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <div className="min-h-screen">
      <NavBar role={role} pathname={pathname} />
      <MobileFabNav role={role} />
      <main className="mx-auto max-w-5xl px-4 pt-24 md:pt-28">
        <section className="bg-surface/90 border border-border rounded-2xl p-6 shadow-sm backdrop-blur">
          <h1 className="text-2xl font-semibold dual-text">ForumKit</h1>
          <p className="text-muted mt-2">主題切換：按導覽列或 FAB 的圖示循環 (預設→海霧→森雨→霧朦→暗夜)。</p>
          <div className="mt-6 flex gap-2 flex-wrap">
            {(['guest','user','moderator','admin'] as Role[]).map(r => (
              <button key={r} onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-xl border dual-btn ${role===r? 'ring-2 ring-primary/50':''}` }>
                {r}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
