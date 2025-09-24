import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { ArrowLeft, MoreHorizontal, Plus, School, Users, MessageSquare, Camera, Edit, Trash2, Eye, Info, Globe, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface School {
  id: number
  slug: string
  name: string
  logo_path?: string
  logo_url?: string
}

interface SchoolStats {
  users_total: number
  posts_total: number
  comments_total: number
  media_total: number
  periods: {
    today: { users: number; posts: number; comments: number; media: number }
    week: { users: number; posts: number; comments: number; media: number }
    month: { users: number; posts: number; comments: number; media: number }
  }
  cross_split: {
    campus_posts: number
    cross_posts: number
  }
  top_email_domains: Array<{ domain: string; count: number }>
  gmail_count: number
  edu_email_count: number
}

export default function AdminSchoolsPage() {
  const { role } = useAuth()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null)
  const [schoolStats, setSchoolStats] = useState<SchoolStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState<number | null>(null)
  const [domains, setDomains] = useState<Record<string, string[]>>({})
  const [crossLogoUrl, setCrossLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    // Remove hardcoded theme - let theme system handle it
    const html = document.documentElement
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  async function authed(url: string, init?: RequestInit) {
    const doFetch = async (token?: string) => fetch(url, {
      ...(init||{}),
      headers: {
        ...(init?.headers||{}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
    })
    let token = localStorage.getItem('token') || undefined
    let r = await doFetch(token)
    if (r.status === 401) {
      try {
        const txt = await r.clone().text()
        const j = txt ? JSON.parse(txt) : {}
        const code = j?.error?.code || j?.code
        const rt = localStorage.getItem('refresh_token') || undefined
        if (rt && (code === 'JWT_EXPIRED' || code === 'JWT_INVALID' || code === 'JWT_MISSING')) {
          const rf = await fetch('/api/auth/refresh', { method:'POST', headers:{ Authorization: `Bearer ${rt}` } })
          if (rf.ok) {
            const jj = await rf.json()
            if (jj?.access_token) {
              localStorage.setItem('token', jj.access_token)
              token = jj.access_token
              r = await doFetch(token)
            }
          }
        }
      } catch {}
    }
    return r
  }

  const loadSchools = async () => {
    try {
      setLoading(true)
      setError(null)
      const url = (role === 'dev_admin' || role === 'campus_admin') ? '/api/schools/admin' : '/api/schools'
      const r = await authed(url, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      setSchools(Array.isArray(j?.items) ? j.items : [])
    } catch (e: any) {
      setError(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const loadCrossLogo = async () => {
    try {
      const r = await authed('/api/schools/cross/logo', { cache: 'no-store' })
      const j = await r.json().catch(()=>({}))
      setCrossLogoUrl(j?.url || null)
    } catch {}
  }

  const loadSchoolStats = async (slug: string) => {
    try {
      setStatsLoading(true)
      const r = await authed(`/api/schools/${slug}/admin_overview`, { cache: 'no-store' })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setSchoolStats(j.stats)
      setSelectedSchool(slug)
      try {
        const r2 = await authed(`/api/schools/${slug}/domains`, { cache: 'no-store' })
        const j2 = await r2.json().catch(()=>({}))
        setDomains(prev => ({ ...prev, [slug]: Array.isArray(j2?.items) ? j2.items : [] }))
      } catch {}
    } catch (e: any) {
      setError(e?.message || '載入統計失敗')
    } finally {
      setStatsLoading(false)
    }
  }

  const addDomain = async (slug: string) => {
    const input = prompt('新增完整網域（例如：@nhsh.tp.edu.tw）')?.trim()
    if (!input) return
    try {
      const r = await authed(`/api/schools/${slug}/domains`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: input })
      })
      const j = await r.json().catch(()=>({}))
      if (!r.ok) { alert(j?.msg || '新增失敗'); return }
      setDomains(prev => ({ ...prev, [slug]: j.items || [] }))
    } catch (e:any) { alert(e?.message || '新增失敗') }
  }

  const removeDomain = async (slug: string, domain: string) => {
    if (!confirm(`移除網域 ${domain} ？`)) return
    try {
      const r = await authed(`/api/schools/${slug}/domains`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain })
      })
      const j = await r.json().catch(()=>({}))
      if (!r.ok) { alert(j?.msg || '移除失敗'); return }
      setDomains(prev => ({ ...prev, [slug]: j.items || [] }))
    } catch (e:any) { alert(e?.message || '移除失敗') }
  }

  const createSchool = async () => {
    const slug = prompt('新學校代碼（a-z0-9-_）')?.trim()
    if (!slug) return
    const name = prompt('學校名稱')?.trim() || slug

    try {
      const r = await authed('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name })
      })
      if (!r.ok) {
        alert(await r.text())
        return
      }
      loadSchools()
    } catch (e: any) {
      alert(e?.message || '建立失敗')
    }
  }

  const updateSchoolName = async (school: School) => {
    const name = prompt('更新學校名稱', school.name || school.slug)
    if (!name) return

    try {
      const r = await authed(`/api/schools/${school.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!r.ok) {
        alert(await r.text())
        return
      }
      loadSchools()
    } catch (e: any) {
      alert(e?.message || '更新失敗')
    }
  }

  const deleteSchool = async (school: School) => {
    if (!confirm(`確定要刪除「${school.name || school.slug}」嗎？`)) return

    try {
      let r = await authed(`/api/schools/${school.id}`, { method: 'DELETE' })
      if (r.status === 409) {
        const force = confirm('偵測到相關資料。是否強制刪除並清理關聯內容？')
        if (!force) return
        r = await authed(`/api/schools/${school.id}?force=1`, { method: 'DELETE' })
      }
      if (!r.ok) {
        alert(await r.text())
        return
      }
      loadSchools()
    } catch (e: any) {
      alert(e?.message || '刪除失敗')
    }
  }

  const uploadLogo = async (school: School, file: File) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await authed(`/api/schools/${school.id}/logo`, { method: 'POST', body: fd })
      if (!r.ok) {
        alert(await r.text())
        return
      }
      loadSchools()
    } catch (e: any) {
      alert(e?.message || '上傳失敗')
    }
  }

  const uploadCrossLogo = async (file: File) => {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await authed('/api/schools/cross/logo', { method: 'POST', body: fd })
      if (!r.ok) { alert(await r.text()); return }
      loadCrossLogo()
    } catch (e:any) {
      alert(e?.message || '上傳失敗')
    }
  }

  useEffect(() => { loadSchools(); loadCrossLogo() }, [])

  const ActionMenu = ({ school, onClose }: { school: School; onClose: () => void }) => (
    <div className="absolute right-0 top-8 z-50 bg-surface border border-border rounded-lg shadow-soft py-1 min-w-40">
      <button
        onClick={() => { loadSchoolStats(school.slug); onClose() }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text"
      >
        <Info className="w-4 h-4" />
        查看統計
      </button>
      <button
        onClick={() => { addDomain(school.slug); onClose() }}
        className="w-full text左 px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text"
      >
        <Globe className="w-4 h-4" />
        管理網域
      </button>
      
      {(role === 'dev_admin' || role === 'campus_admin') && (
        <>
          <button
            onClick={() => { updateSchoolName(school); onClose() }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text"
          >
            <Edit className="w-4 h-4" />
            重新命名
          </button>
          
          <label className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 cursor-pointer dual-text">
            <Camera className="w-4 h-4" />
            上傳校徽
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadLogo(school, file)
                onClose()
              }}
            />
          </label>
        </>
      )}
      
      {role === 'dev_admin' && (
        <button
          onClick={() => { deleteSchool(school); onClose() }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          刪除學校
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/schools" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* Header */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">學校管理</h1>
              <p className="text-sm text-muted mt-1">管理註冊學校和查看統計資料</p>
            </div>
            
            {role === 'dev_admin' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={createSchool}
                  className="btn-primary flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">新增學校</span>
                  <span className="sm:hidden">新增</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* 跨校 Logo 區塊（僅提供上傳校徽） */}
          <div className="lg:col-span-3">
            <div className="bg-surface border border-border rounded-2xl shadow-soft p-4 sm:p-6 mb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-border bg-surface-hover flex items-center justify-center">
                    {crossLogoUrl ? (
                      <img src={crossLogoUrl} alt="Cross Logo" className="w-12 h-12 object-contain" />
                    ) : (
                      <Globe className="w-6 h-6 text-muted" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold dual-text">跨校</div>
                    <div className="text-xs text-muted">只提供上傳校徽，代表跨校區域</div>
                  </div>
                </div>
                {(role === 'dev_admin' || role === 'cross_admin') && (
                  <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer">
                    <Camera className="w-4 h-4" /> 上傳校徽
                    <input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) uploadCrossLogo(f) }} />
                  </label>
                )}
              </div>
            </div>
          </div>
          {/* 學校列表 */}
          <div className="lg:col-span-2">
            <div className="bg-surface border border-border rounded-2xl shadow-soft">
              <div className="p-4 sm:p-6 border-b border-border">
                <h2 className="text-lg font-medium dual-text">已註冊學校</h2>
                <p className="text-sm text-muted mt-1">
                  {schools.length} 所學校已入駐平台
                </p>
              </div>
              
              <div className="divide-y divide-border overflow-visible">
                {loading ? (
                  <div className="p-6 text-center text-muted">載入中...</div>
                ) : error ? (
                  <div className="p-6 text-center text-red-600">{error}</div>
                ) : schools.length === 0 ? (
                  <div className="p-6 text-center text-muted">
                    尚無已註冊學校。學生首次透過 Google OAuth 登入時會自動建立學校。
                  </div>
                ) : (
                  schools.map((school) => {
                    const logoUrl = (school.logo_url && typeof school.logo_url === 'string')
                      ? school.logo_url
                      : (school.logo_path ? `/uploads/${school.logo_path}` : null)
                      
                    return (
                      <div key={school.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg border border-border bg-surface-hover overflow-hidden">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt={school.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                  }}
                                />
                              ) : null}
                              <div className={`w-full h-full flex items-center justify-center text-xs text-muted ${logoUrl ? 'hidden' : ''}`}>
                                無徽章
                              </div>
                            </div>
                            
                            <div>
                              <h3 className="font-medium dual-text">{school.name}</h3>
                              <p className="text-sm text-muted">
                                {school.slug} • ID: {school.id}
                              </p>
                            </div>
                          </div>
                          
                          <div className="relative overflow-visible">
                            <button
                              onClick={() => setShowActionMenu(showActionMenu === school.id ? null : school.id)}
                              className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            
                            {showActionMenu === school.id && (
                              <ActionMenu
                                school={school}
                                onClose={() => setShowActionMenu(null)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* 統計面板 */}
          <div>
            {selectedSchool && schoolStats ? (
              <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium dual-text">
                      {schools.find(s => s.slug === selectedSchool)?.name} 統計
                    </h3>
                    <button
                      onClick={() => { setSelectedSchool(null); setSchoolStats(null) }}
                      className="text-muted hover:text-fg text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                </div>
                
              <div className="p-4 sm:p-6 space-y-6">
                {/* 綁定網域清單 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium dual-text flex items-center gap-2"><Globe className="w-4 h-4" /> 綁定網域</h4>
                    <button onClick={() => addDomain(selectedSchool!)} className="btn-secondary px-3 py-1.5 text-sm">新增網域</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(domains[selectedSchool!]||[]).length === 0 ? (
                      <div className="text-sm text-muted">尚未綁定任何網域</div>
                    ) : (
                      (domains[selectedSchool!]||[]).map((d) => (
                        <span key={d} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface-hover text-sm">
                          {d}
                          <button onClick={() => removeDomain(selectedSchool!, d)} className="text-muted hover:text-fg" aria-label="移除">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                  {/* 基本統計 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-surface-hover rounded-lg border border-border">
                      <div className="flex items-center justify-center mb-2">
                        <Users className="w-4 h-4 text-primary" />
                      </div>
                      <div className="text-2xl font-semibold dual-text">{schoolStats.users_total}</div>
                      <div className="text-xs text-muted">用戶數</div>
                    </div>
                    
                    <div className="text-center p-3 bg-surface-hover rounded-lg border border-border">
                      <div className="flex items-center justify-center mb-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      <div className="text-2xl font-semibold dual-text">{schoolStats.posts_total}</div>
                      <div className="text-xs text-muted">貼文數</div>
                    </div>
                  </div>

                  {/* 活躍度 */}
                  <div>
                    <h4 className="font-medium dual-text mb-3">活躍度</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">今日新增</span>
                        <span className="font-medium dual-text">{schoolStats.periods.today.posts} 貼文</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">本週新增</span>
                        <span className="font-medium dual-text">{schoolStats.periods.week.posts} 貼文</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">本月新增</span>
                        <span className="font-medium dual-text">{schoolStats.periods.month.posts} 貼文</span>
                      </div>
                    </div>
                  </div>

                  {/* 內容分布 */}
                  <div>
                    <h4 className="font-medium dual-text mb-3">內容分布</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">校內貼文</span>
                        <span className="font-medium dual-text">{schoolStats.cross_split.campus_posts}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">跨校貼文</span>
                        <span className="font-medium dual-text">{schoolStats.cross_split.cross_posts}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">媒體檔案</span>
                        <span className="font-medium dual-text">{schoolStats.media_total}</span>
                      </div>
                    </div>
                  </div>

                  {/* Email 分布 */}
                  {schoolStats.top_email_domains.length > 0 && (
                    <div>
                      <h4 className="font-medium dual-text mb-3">Email 網域</h4>
                      <div className="space-y-2">
                        {schoolStats.top_email_domains.slice(0, 3).map((domain, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-muted">{domain.domain}</span>
                            <span className="font-medium dual-text">{domain.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-2xl shadow-soft p-6">
                <div className="text-center text-muted">
                  <Eye className="w-8 h-8 mx-auto mb-3 opacity-60" />
                  <p className="text-sm">選擇學校查看統計資料</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 點擊外部關閉選單 */}
      {showActionMenu && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setShowActionMenu(null)}
        />
      )}
    </div>
  )
}
