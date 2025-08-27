import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { User, Shield, Bell, Save, Key, IdCard, Link as LinkIcon, Building2, BadgeCheck, Edit, AlertTriangle } from 'lucide-react'
import { AccountAPI } from '@/services/api'
import { getRole, isLoggedIn, getRoleDisplayName } from '@/utils/auth'

interface UserSettings {
  email?: string
  school_slug?: string
  notification_enabled?: boolean
  theme_preference?: string
  language?: string
}

export default function SettingsPage() {
  const { pathname } = useLocation()
  const role = getRole()
  const isAdmin = ['admin', 'dev_admin', 'campus_admin', 'cross_admin'].includes(role)
  
  const [settings, setSettings] = useState<UserSettings>({})
  const [profile, setProfile] = useState<{ username:string; email:string; role:string; school?: { id:number; slug:string; name:string }|null; avatar_path?: string|null; auth_provider?: string; has_password?: boolean; personal_id?: string } | null>(null)
  const [schoolSettings, setSchoolSettings] = useState<{ announcement?: string; allow_anonymous?: boolean; min_post_chars?: number }|null>(null)
  const [schoolMeta, setSchoolMeta] = useState<{ id:number; slug:string; name:string }|null>(null)
  const [canEditSchool, setCanEditSchool] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [currentTheme, setCurrentTheme] = useState(
    document.documentElement.getAttribute('data-theme') || 'beige'
  )
  const [cpw, setCpw] = useState({ current_password: '', new_password: '' })
  const [webhook, setWebhook] = useState<{ url: string; enabled: boolean; kinds: { posts:boolean; comments:boolean; announcements:boolean }, batch: number }>(()=>({ url:'', enabled:false, kinds:{ posts:true, comments:false, announcements:false }, batch:5 }))
  const [webhookStatus, setWebhookStatus] = useState<string>('')

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  useEffect(() => {
    loadSettings()
  }, [])

  // 監聽學校切換，重新載入該校設定
  useEffect(() => {
    const onChanged = () => loadSchoolSettings()
    window.addEventListener('fk_school_changed', onChanged as any)
    return () => window.removeEventListener('fk_school_changed', onChanged as any)
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const p = await AccountAPI.profile()
      setProfile(p)
      setSettings({
        email: p.email,
        school_slug: p.school?.slug || '',
        notification_enabled: true,
        theme_preference: currentTheme,
        language: 'zh-TW'
      })
      await loadSchoolSettings()
      try {
        const wh = await AccountAPI.webhookGet()
        const conf = wh?.config || {}
        setWebhook({ 
          url: conf.url || '', 
          enabled: Boolean(conf.enabled), 
          kinds: {
            posts: Boolean(conf?.kinds?.posts ?? true),
            comments: Boolean(conf?.kinds?.comments ?? false),
            announcements: Boolean(conf?.kinds?.announcements ?? false)
          },
          batch: Number(conf?.batch ?? 5)
        })
      } catch {}
    } catch (error) {
      setMessage('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }

  const getCurrentSchoolSlug = () => (localStorage.getItem('school_slug') || '').trim()

  const loadSchoolSettings = async () => {
    try {
      const slug = getCurrentSchoolSlug()
      if (!slug) { // 跨校視圖：唯讀且無具體學校
        setSchoolSettings(null)
        setSchoolMeta(null)
        setCanEditSchool(false)
        return
      }
      const r = await fetch(`/api/schools/${encodeURIComponent(slug)}/settings`, { cache: 'no-store' })
      if (!r.ok) throw new Error('學校設定載入失敗')
      const j = await r.json().catch(()=>({}))
      setSchoolMeta(j?.school || null)
      try {
        const data = j?.data
        const parsed = typeof data === 'string' ? JSON.parse(data || '{}') : (data || {})
        setSchoolSettings({
          announcement: parsed.announcement || '',
          allow_anonymous: Boolean(parsed.allow_anonymous ?? true),
          min_post_chars: Number(parsed.min_post_chars ?? 15),
        })
      } catch {
        setSchoolSettings({ announcement:'', allow_anonymous:true, min_post_chars:15 })
      }
      // 權限：dev_admin 可編輯；campus_admin 僅可編輯自己學校
      const role = getRole()
      const editable = role === 'dev_admin' || (role === 'campus_admin' && profile?.school?.slug === slug)
      setCanEditSchool(Boolean(editable))
    } catch {
      setSchoolSettings(null)
      setCanEditSchool(false)
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)
      setMessage(null)
      // 使用者一般設定（本地暫存即可）
      setMessage('設定已儲存')
    } catch (error) {
      setMessage('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const saveSchoolSettings = async () => {
    const slug = getCurrentSchoolSlug()
    if (!slug || !canEditSchool || !schoolSettings) return
    try {
      setSaving(true)
      setMessage(null)
      const payload = {
        announcement: schoolSettings.announcement || '',
        allow_anonymous: Boolean(schoolSettings.allow_anonymous),
        min_post_chars: Math.max(1, Number(schoolSettings.min_post_chars ?? 15)),
      }
      const r = await fetch(`/api/schools/${encodeURIComponent(slug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')||''}` },
        body: JSON.stringify(payload)
      })
      if (!r.ok) throw new Error(await r.text())
      setMessage('學校設定已儲存')
    } catch (e:any) {
      setMessage(e?.message || '學校設定儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  // 外觀與討論範圍已移除（由全站按鈕/SchoolSwitcher 控制）

  if (!isLoggedIn()) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/settings/profile" />
        <MobileBottomNav />
        <main className="mx-auto max-w-4xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
            <Key className="w-12 h-12 mx-auto mb-4 text-muted" />
            <h1 className="text-xl font-semibold dual-text mb-2">需要登入</h1>
            <p className="text-muted">請先登入才能查看和修改設定。</p>
          </div>
        </main>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <NavBar pathname={pathname} />
        <MobileBottomNav />
        <main className="mx-auto max-w-4xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
          <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted">
            載入中...
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-dvh">
      <NavBar pathname={pathname} />
      <MobileBottomNav />

      <main className="mx-auto max-w-4xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        {/* 頁首 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isAdmin ? <Shield className="w-5 h-5 sm:w-6 sm:h-6" /> : <User className="w-5 h-5 sm:w-6 sm:h-6" />}
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold dual-text">
                  {isAdmin ? '管理設定' : '個人設定'}
                </h1>
                <p className="text-sm text-muted">
                  自訂您的使用體驗與偏好設定
                </p>
              </div>
            </div>
            <div className="text-sm text-muted hidden sm:block">
              角色：{role}
            </div>
          </div>
          
          {message && (
            <div className={`mt-3 p-2 rounded-lg text-sm border ${
              message.includes('失敗') 
                ? 'bg-danger-bg text-danger-text border-danger-border' 
                : 'bg-success-bg text-success-text border-success-border'
            }`}>
              {message}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* 通知 Webhook 綁定 */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <LinkIcon className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold dual-text">通知 Webhook（Discord 相容）</h2>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Webhook URL</label>
                <input value={webhook.url} onChange={e=>setWebhook(prev=>({ ...prev, url:e.target.value }))} placeholder="https://discord.com/api/webhooks/..." className="form-control w-full" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl border border-border">
                  <div>
                    <div className="font-medium text-fg">啟用自動推送</div>
                    <div className="text-sm text-muted">最新貼文會自動推送至你的 Webhook</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={webhook.enabled} onChange={e=>setWebhook(prev=>({ ...prev, enabled:e.target.checked }))} />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="p-3 bg-surface-hover rounded-xl border border-border">
                  <div className="font-medium text-fg mb-2">推送類型</div>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={webhook.kinds.posts} onChange={e=>setWebhook(prev=>({ ...prev, kinds: { ...prev.kinds, posts:e.target.checked } }))} />
                      新貼文
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={webhook.kinds.comments} onChange={e=>setWebhook(prev=>({ ...prev, kinds: { ...prev.kinds, comments:e.target.checked } }))} />
                      新留言
                    </label>
                    <label className="inline-flex items-center gap-2 opacity-70">
                      <input type="checkbox" checked={webhook.kinds.announcements} onChange={e=>setWebhook(prev=>({ ...prev, kinds: { ...prev.kinds, announcements:e.target.checked } }))} />
                      公告（即將推出）
                    </label>
                  </div>
                </div>
                <div className="p-3 bg-surface-hover rounded-xl border border-border">
                  <div className="font-medium text-fg mb-2">每次推送最多</div>
                  <select className="form-control w-40" value={webhook.batch} onChange={e=>setWebhook(prev=>({ ...prev, batch: Number(e.target.value) }))}>
                    {Array.from({length:10},(_,i)=>i+1).map(n=> <option key={n} value={n}>{n} 則</option>)}
                  </select>
                  <div className="text-xs text-muted mt-1">全域頻率（管理員設定）：每 {import.meta.env?.VITE_USER_WEBHOOK_FEED_INTERVAL || '60'} 秒掃描一次</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={async()=>{ try{ const r= await AccountAPI.webhookSet({ url: webhook.url, enabled: webhook.enabled, kinds: webhook.kinds as any, batch: webhook.batch }); setWebhookStatus('已儲存'); setTimeout(()=>setWebhookStatus(''),1500)}catch(e:any){ setWebhookStatus(e?.message||'儲存失敗') } }} className="btn-primary px-4 py-2">儲存</button>
                <button onClick={async()=>{ try{ const r= await AccountAPI.webhookTest(webhook.url||undefined); setWebhookStatus(r.ok? '測試成功': ('測試失敗 '+(r.error||''))) }catch(e:any){ setWebhookStatus(e?.message||'測試失敗') } }} className="btn-ghost px-4 py-2">發送測試</button>
                {webhookStatus && <div className="text-sm text-muted">{webhookStatus}</div>}
              </div>
            </div>
          </div>
          {/* 學校設定（依 SchoolSwitcher 決定學校） */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold dual-text">學校設定</h2>
              <div className="ml-auto text-sm text-muted">
                目前學校：{schoolMeta?.name || '跨校（唯讀）'}
              </div>
            </div>

            {!schoolMeta && (
              <div className="mb-4 p-3 rounded-lg border border-border bg-surface-hover text-sm text-muted flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                跨校視圖僅供檢視。請透過上方學校切換選擇特定學校以進行設定。
              </div>
            )}

            {schoolMeta && !canEditSchool && (
              <div className="mb-4 p-3 rounded-lg border bg-warning-bg border-warning-border text-sm text-warning-text flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                權限不足：您只能檢視此學校的設定，無法修改。
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">公告文字</label>
                <textarea
                  value={schoolSettings?.announcement || ''}
                  onChange={(e)=> setSchoolSettings(prev=> ({ ...(prev||{}), announcement: e.target.value }))}
                  disabled={!canEditSchool || !schoolMeta}
                  className="w-full p-3 bg-surface-hover rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[88px]"
                  placeholder={schoolMeta? '顯示於該校頁面（可留空）' : '跨校視圖不可編輯'}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl border border-border">
                <div>
                  <div className="font-medium text-fg">允許匿名發文</div>
                  <div className="text-sm text-muted">限制該校是否允許匿名內容</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEditSchool || !schoolMeta}
                    checked={Boolean(schoolSettings?.allow_anonymous)}
                    onChange={(e)=> setSchoolSettings(prev=> ({ ...(prev||{}), allow_anonymous: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">最小發文字數</label>
                <input
                  type="number"
                  disabled={!canEditSchool || !schoolMeta}
                  value={Number(schoolSettings?.min_post_chars ?? 15)}
                  onChange={(e)=> setSchoolSettings(prev=> ({ ...(prev||{}), min_post_chars: Number(e.target.value || 15) }))}
                  className="w-40 p-3 bg-surface-hover rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  min={1}
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveSchoolSettings}
                  disabled={!canEditSchool || !schoolMeta || saving}
                  className="btn-primary flex items-center gap-2 px-6 py-3 whitespace-nowrap disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  儲存學校設定
                </button>
              </div>
            </div>
          </div>
          {/* 帳號資訊卡片 */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold dual-text">帳號資訊</h2>
            </div>
            
            {profile && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted">用戶名稱</label>
                  <div className="p-4 bg-surface-hover rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-fg" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-fg truncate" title={profile.username}>{profile.username}</div>
                        {profile.auth_provider && (
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <BadgeCheck className="w-3 h-3 text-fg" />
                            <span>已驗證</span>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          const newName = prompt('請輸入新的用戶名稱', profile.username)
                          if (newName && newName.trim() && newName !== profile.username) {
                            // 這裡應該調用 API 更新用戶名稱
                            setMessage('用戶名稱更新功能開發中')
                          }
                        }}
                        className="p-1 rounded hover:bg-surface transition-colors flex-shrink-0 ml-auto"
                        title="編輯用戶名稱"
                      >
                        <Edit className="w-4 h-4 text-fg" />
                      </button>
                    </div>
                  </div>
                </div>
                {/* 個人識別碼（亂碼） */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted">個人識別碼</label>
                  <div className="p-4 bg-surface-hover rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                        <IdCard className="w-5 h-5 text-fg" />
                      </div>
                      <div className="text-fg break-all min-w-0 flex-1 select-all" title="個人識別碼">
                        <div className="flex items-center gap-2">
                          <span>{profile.personal_id || '—'}</span>
                          <button
                            className="px-2 py-1 text-xs rounded-lg border hover:bg-surface"
                            onClick={async ()=>{ try{ await navigator.clipboard.writeText(profile.personal_id||''); setMessage('已複製識別碼'); setTimeout(()=>setMessage(null), 1200)}catch{}}}
                          >複製</button>
                        </div>
                        <div className="text-xs text-muted mt-1 flex items-center gap-2">
                          我的學校：
                          {profile.school?.name ? (
                            <button
                              className="px-2 py-0.5 rounded-full border text-xs hover:bg-surface"
                              onClick={()=>{
                                try {
                                  if (profile?.school?.slug) {
                                    localStorage.setItem('school_slug', profile.school.slug)
                                    localStorage.setItem('selected_school_slug', profile.school.slug)
                                    window.dispatchEvent(new CustomEvent('fk_school_changed', { detail: { slug: profile.school.slug } }))
                                  }
                                } catch {}
                                window.location.href = '/boards'
                              }}
                            >{profile.school.name}</button>
                          ) : (
                            <span>未設定</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted">用戶角色</label>
                  <div className="p-4 bg-surface-hover rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
                        <Shield className="w-5 h-5 text-fg" />
                      </div>
                                             <div className="text-fg">{getRoleDisplayName(profile.role as any)}</div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted">所屬學校</label>
                  <div className="p-4 bg-surface-hover rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-fg" />
                      </div>
                      <div className="text-fg">{profile.school?.name || '未設定'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 設定選項 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 密碼設定 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-3 mb-6">
                <Key className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-semibold dual-text">密碼設定</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">目前密碼</label>
                  <input
                    type="password"
                    value={cpw.current_password}
                    onChange={(e) => setCpw(prev => ({ ...prev, current_password: e.target.value }))}
                    className="w-full p-3 bg-surface-hover rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="輸入目前密碼"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">新密碼</label>
                  <input
                    type="password"
                    value={cpw.new_password}
                    onChange={(e) => setCpw(prev => ({ ...prev, new_password: e.target.value }))}
                    className="w-full p-3 bg-surface-hover rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="輸入新密碼"
                  />
                </div>
                
                <button 
                  onClick={async()=>{
                    try {
                      await AccountAPI.changePassword({ current_password: cpw.current_password || undefined, new_password: cpw.new_password })
                      setMessage('密碼已更新')
                      setCpw({ current_password:'', new_password:'' })
                    } catch (e:any) {
                      setMessage(e?.message || '密碼更新失敗')
                    }
                  }}
                  className="btn-primary px-6 py-3 text-sm w-full"
                >
                  更新密碼
                </button>
              </div>
            </div>

            {/* 通知設定 */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-semibold dual-text">通知設定</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-hover rounded-xl border border-border">
                  <div>
                    <div className="font-medium text-fg">推播通知</div>
                    <div className="text-sm text-muted">接收新回覆和系統消息</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notification_enabled}
                      onChange={(e) => setSettings(prev => ({ ...prev, notification_enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:border-primary"></div>
                  </label>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between p-3 bg-surface-hover rounded-lg">
                    <span className="text-muted">認證方式</span>
                    <span className="font-medium">{profile?.auth_provider || '本地帳號'}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-surface-hover rounded-lg">
                    <span className="text-muted">密碼設定</span>
                    <span className="font-medium">{profile?.has_password ? '已設定' : '未設定'}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-surface-hover rounded-lg">
                    <span className="text-muted">註冊時間</span>
                    <span className="font-medium">未知</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 儲存按鈕 */}
        <div className="flex justify-end mt-6">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="btn-primary flex items-center gap-2 px-6 py-3 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </main>
    </div>
  )
}
