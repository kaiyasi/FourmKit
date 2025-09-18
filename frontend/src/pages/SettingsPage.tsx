import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PageLayout } from '@/components/layout/PageLayout'
import MobileHeader from '@/components/MobileHeader'
import { User, Shield, Bell, Save, Key, IdCard, Link as LinkIcon, Building2, BadgeCheck, Edit, AlertTriangle, LogOut, BellRing, Trash2, Eye, EyeOff, Crown } from 'lucide-react'
import { listNotifications, clearNotifications, markNotificationRead, markAllNotificationsRead } from '@/utils/notifications'
import { AccountAPI } from '@/services/api'
import { getRole, isLoggedIn, getRoleDisplayName } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

interface UserSettings {
  email?: string
  school_slug?: string
  notification_enabled?: boolean
  theme_preference?: string
  language?: string
}

export default function SettingsPage() {
  // 全部學校清單（供 dev_admin 切換）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        const j = await r.json()
        if (Array.isArray(j?.items)) {
          window.__allSchools = j.items
        }
      } catch {}
    })()
  }, [])
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const { pathname } = useLocation()
  const { logout, role } = useAuth()
  const isAdmin = role ? ['admin', 'dev_admin', 'campus_admin', 'campus_moderator', 'cross_admin'].includes(role) : false
  
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
  const [webhookLoaded, setWebhookLoaded] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState<string>('')
  const [notifFilterSchoolOnly, setNotifFilterSchoolOnly] = useState(true)
  const [notifs, setNotifs] = useState<any[]>([])
  const [notifOpen, setNotifOpen] = useState(true) // 預設顯示最新通知
  const [quietMode, setQuietMode] = useState<boolean>(()=>{ try { return localStorage.getItem('fk_quiet_toasts')==='1' } catch { return false } })
  const [showCount, setShowCount] = useState<number>(20)

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  useEffect(() => {
    loadSettings()
  }, [])

  // 通知中心：訂閱變更
  useEffect(() => {
    const read = () => {
      const currentSlug = (localStorage.getItem('school_slug')||'') || null
      const currentUserId = profile?.personal_id || null
      const userRole = role
      
      // 根據用戶角色決定過濾條件
      let filter: any = {}
      
      if (userRole === 'dev_admin') {
        // dev_admin 可以看到所有通知，但根據學校過濾選項
        if (notifFilterSchoolOnly) {
          filter.school = currentSlug
        }
        // dev_admin 不需要 user_id 過濾，可以看到所有通知
      } else {
        // 其他用戶只能看到與自己相關的通知
        filter.user_id = currentUserId
        if (notifFilterSchoolOnly) {
          filter.school = currentSlug
        }
      }
      
      const itemsAll = listNotifications(filter)
      setNotifs(itemsAll)
    }
    read()
    const onChanged = () => read()
    window.addEventListener('fk_notifications_changed', onChanged as any)
    window.addEventListener('fk_school_changed', onChanged as any)
    return () => {
      window.removeEventListener('fk_notifications_changed', onChanged as any)
      window.removeEventListener('fk_school_changed', onChanged as any)
    }
  }, [notifFilterSchoolOnly, profile])

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
      // 依角色自動選擇學校（校內管理員/校內版主不可自選）
      try {
        const r = role
        const userSchoolSlug = p?.school?.slug || ''
        if ((r === 'campus_admin' || r === 'campus_moderator') && userSchoolSlug) {
          const cur = (localStorage.getItem('school_slug')||'').trim()
          if (cur !== userSchoolSlug) {
            localStorage.setItem('school_slug', userSchoolSlug)
            localStorage.setItem('selected_school_slug', userSchoolSlug)
            window.dispatchEvent(new CustomEvent('fk_school_changed', { detail: { slug: userSchoolSlug } } as any))
          }
        }
      } catch {}
      await loadSchoolSettings(p)
      try {
        const wh = await AccountAPI.webhookGet()
        const conf = wh?.config || {}
        // 僅在尚未載入過時才覆寫，以免覆蓋使用者正在輸入的內容
        if (!webhookLoaded) {
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
          setWebhookLoaded(true)
        }
      } catch {}
    } catch (error) {
      setMessage('載入設定失敗')
    } finally {
      setLoading(false)
    }
  }

  const getCurrentSchoolSlug = () => {
    // 角色強制：校內管理員/校內版主 → 永遠鎖定自己的學校
    try {
              const r = role
      const forced = profile?.school?.slug || ''
      if ((r === 'campus_admin' || r === 'campus_moderator') && forced) {
        return forced
      }
    } catch {}
    const raw = (localStorage.getItem('school_slug') || '').trim()
    return raw === '__ALL__' ? '' : raw
  }

  const loadSchoolSettings = async (overrideProfile?: { username:string; email:string; role:string; school?: { id:number; slug:string; name:string }|null; avatar_path?: string|null; auth_provider?: string; has_password?: boolean; personal_id?: string } ) => {
    try {
      const slug = getCurrentSchoolSlug()
      if (!slug) { // 未選擇學校或跨校：唯讀且無具體學校
        setSchoolSettings(null)
        setSchoolMeta(null)
        setCanEditSchool(false)
        return
      }
      const r = await fetch(`/api/schools/${encodeURIComponent(slug)}/settings`, { cache: 'no-store' })
      if (!r.ok) throw new Error('學校設定載入失敗')
      const j = await r.json().catch(()=>({}))
      const currentSchoolMeta = j?.school || null
      setSchoolMeta(currentSchoolMeta)
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
      // 權限：dev_admin 可編輯所有學校設定；campus_admin 可編輯自己學校設定
              // role already available from useAuth
      const prof = overrideProfile || profile
      // 檢查當前用戶是否有權限編輯此學校設定
      const editable = role === 'dev_admin' || (role === 'campus_admin' && prof?.school?.slug === slug)
      setCanEditSchool(Boolean(editable))
      
      // 添加除錯資訊
      console.log('[DEBUG] 學校設定權限檢查:', {
        role,
        userSchoolSlug: profile?.school?.slug,
        userSchoolId: profile?.school?.id,
        currentSlug: slug,
        schoolMetaId: currentSchoolMeta?.id,
        editable,
        canEditSchoolBefore: canEditSchool,
        comparison: role === 'campus_admin' && prof?.school?.slug === slug
      })
      
      if ((role === 'campus_admin' || role === 'campus_moderator') && !editable) {
        console.log('[DEBUG] 權限檢查失敗 - 詳細資訊:', {
          role,
          reason: role === 'campus_admin' ? 'campus_admin school slug mismatch' : 'only dev_admin can edit school settings'
        })
      }
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
      <PageLayout pathname="/settings/profile">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
          <Key className="w-12 h-12 mx-auto mb-4 text-muted" />
          <h1 className="text-xl font-semibold dual-text mb-2">需要登入</h1>
          <p className="text-muted">請先登入才能查看和修改設定。</p>
        </div>
      </PageLayout>
    )
  }

  if (loading) {
    return (
      <PageLayout pathname={pathname}>
        <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted">
          載入中...
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout pathname={pathname}>
      <MobileHeader subtitle="Settings" />
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
              <h2 className="text-xl font-semibold dual-text">通知 Webhook</h2>
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
                      <input type="checkbox" checked={webhook.kinds.announcements} disabled onChange={e=>setWebhook(prev=>({ ...prev, kinds: { ...prev.kinds, announcements:e.target.checked } }))} />
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
          {/* 學校設定（依 SchoolSwitcher 決定學校）- 僅管理員可見 */}
          {isAdmin && (
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold dual-text">學校設定</h2>
              <div className="ml-auto text-xs text-muted leading-none">
                目前學校：{schoolMeta?.name || '未選擇'}
              </div>
            </div>

            {/* dev_admin 可選擇學校；校內管理員/校內版主不可自選，固定自己學校 */}
            {role === 'dev_admin' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted mb-1">選擇學校</label>
                <select
                  className="form-control w-64"
                  value={schoolMeta?.slug || ''}
                  onChange={async e => {
                    localStorage.setItem('school_slug', e.target.value)
                    window.dispatchEvent(new CustomEvent('fk_school_changed'))
                  }}
                >
                  <option value="" disabled>請選擇學校</option>
                  {/* 取得全部學校清單 */}
                  {Array.isArray(window.__allSchools) && window.__allSchools.map(s => (
                    <option key={s.slug} value={s.slug}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 校管理員只顯示自己學校（無下拉） */}
            {role !== 'dev_admin' && schoolMeta && (
              <div className="mb-2 text-sm text-muted">（僅能管理自己學校：{schoolMeta.name}）</div>
            )}

            {!schoolMeta && (
              <div className="mb-4 p-3 rounded-lg border border-border bg-surface-hover text-sm text-muted flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                尚未選擇學校。請在上方選單選擇欲管理的學校以進行設定。
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
          )}

          {/* 通知中心：顯示於學校設定下方 */}
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <div className="flex items-center gap-3">
                <BellRing className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-semibold dual-text">通知中心</h2>
                <span className="ml-2 inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-surface-hover border border-border text-muted">{notifs.filter((n:any)=>!n.read).length} 未讀</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="text-xs sm:text-sm text-muted flex items-center gap-2">
                  <input type="checkbox" checked={quietMode} onChange={e=>{ setQuietMode(e.target.checked); try{ localStorage.setItem('fk_quiet_toasts', e.target.checked? '1':'0') }catch{} }} />
                  安靜模式
                </label>
                <label className="text-xs sm:text-sm text-muted flex items-center gap-2">
                  <input type="checkbox" checked={notifFilterSchoolOnly} onChange={e=>setNotifFilterSchoolOnly(e.target.checked)} />
                  {role === 'dev_admin' ? '只顯示目前學校' : '只顯示目前學校'}
                </label>
                <button
                  className="px-2 py-1 text-xs sm:px-3 sm:py-2 sm:text-sm rounded-lg border hover:bg-surface shrink-0"
                  onClick={() => {
                    const slug = (localStorage.getItem('school_slug')||'') || null
                    markAllNotificationsRead(notifFilterSchoolOnly ? { school: slug } : undefined)
                  }}
                >全部標為已讀</button>
                <button
                  className="px-2 py-1 text-xs sm:px-3 sm:py-2 sm:text-sm rounded-lg border hover:bg-surface shrink-0"
                  onClick={() => {
                    if (window.confirm('確定要清除所有通知嗎？此操作無法復原。')) {
                      const slug = (localStorage.getItem('school_slug')||'') || null
                      clearNotifications(notifFilterSchoolOnly ? { school: slug } : undefined)
                      setNotifs([])
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 inline mr-1" /> 清除
                </button>
              </div>
            </div>
            {/* 未讀列表（預設顯示） */}
            {notifs.filter((n:any)=>!n.read).length === 0 ? (
              <div className="text-sm text-muted">沒有未讀通知</div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden mb-4">
                {notifs.filter((n:any)=>!n.read).slice(0, showCount).map((n:any) => {
                  const labelSchool = (slug?: string|null) => {
                    if (!slug || slug === '__ALL__') return '跨校'
                    try {
                      const all: any[] = (window as any).__allSchools
                      if (Array.isArray(all)) {
                        const found = all.find(s => s.slug === slug)
                        return (found?.name || slug)
                      }
                    } catch {}
                    return slug
                  }
                  
                  // 為 dev_admin 添加詳細信息
                  const isDevAdmin = role === 'dev_admin'
                  const showUserInfo = isDevAdmin && n.user_id
                  
                  return (
                  <div key={n.id} className="p-2 sm:p-3 bg-surface">
                    <div className="text-[11px] text-muted mb-1 flex flex-wrap items-center gap-2">
                      <span>{new Date(n.ts).toLocaleString()}</span>
                      {n.school ? (
                        <span className="px-2 py-0.5 text-[11px] rounded bg-surface-hover border border-border">{labelSchool(n.school)}</span>
                      ) : (
                        <span className="text-muted">跨校</span>
                      )}
                      {showUserInfo && (
                        <span className="px-2 py-0.5 text-[11px] rounded bg-blue-100 border border-blue-200 text-blue-700">
                          用戶: {n.user_id}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-fg flex items-start sm:items-center justify-between gap-3 break-words">
                      <span className="min-w-0 break-words block line-clamp-3 md-line-clamp-5">{n.text}</span>
                      <button className="text-xs px-2 py-1 rounded border hover:bg-surface shrink-0" onClick={()=> markNotificationRead(n.id)}>標為已讀</button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
            {/* 已讀區（可展開） */}
            <div className="flex items-center justify-between mb-2 mt-2">
              <button className="text-sm text-muted underline-offset-4 hover:underline" onClick={()=> setNotifOpen(v=>!v)}>
                {notifOpen ? '收起歷史' : '展開歷史'}
              </button>
              {notifOpen && notifs.filter((n:any)=>n.read).length > showCount && (
                <button className="text-sm text-muted underline-offset-4 hover:underline" onClick={()=> setShowCount(c => Math.min(c+20, notifs.filter((n:any)=>n.read).length))}>顯示更多</button>
              )}
            </div>
            {notifOpen && (
              notifs.filter((n:any)=>n.read).length === 0 ? (
                <div className="text-sm text-muted">沒有歷史通知</div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {notifs.filter((n:any)=>n.read).slice(0, showCount).map((n:any) => (
                    <div key={n.id} className="p-2 sm:p-3 bg-surface opacity-80">
                      <div className="text-[11px] text-muted mb-1 flex flex-wrap items-center gap-2">
                        <span>{new Date(n.ts).toLocaleString()}</span>
                        {n.school ? (
                          <span className="px-2 py-0.5 text-[11px] rounded bg-surface-hover border border-border">{(window as any).__allSchools?.find?.((s:any)=>s.slug===n.school)?.name || (n.school==='__ALL__'? '跨校': n.school)}</span>
                        ) : (
                          <span className="text-muted">跨校</span>
                        )}
                      </div>
                      <div className="text-sm text-fg break-words line-clamp-3 md-line-clamp-5">{n.text}</div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
          {/* 帳號資訊卡片 */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold dual-text">帳號資訊</h2>
            </div>
            
            {profile && (
              <>
                {/* （已停用）手機合併卡，改為沿用分卡樣式在手機以單欄排列 */}
                <div className="hidden space-y-2">
                  <div className="p-4 bg-surface-hover rounded-xl border border-border">
                    <div className="text-base font-medium text-fg truncate" title={profile.username}>
                      {profile.username}
                    </div>
                    <div className="mt-2 text-xs text-fg break-all select-all" title="個人識別碼">
                      {profile.personal_id || '—'}
                      {profile.personal_id && (
                        <button
                          className="ml-2 px-2 py-0.5 text-xs rounded-lg border hover:bg-surface"
                          onClick={async ()=>{ try{ await navigator.clipboard.writeText(profile.personal_id||''); setMessage('已複製識別碼'); setTimeout(()=>setMessage(null), 1200)}catch{}}}
                        >
                          複製
                        </button>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-muted">
                      {getRoleDisplayName(profile.role as any)}
                      <span className="mx-1">·</span>
                      {profile.school?.name || '未設定學校'}
                    </div>
                  </div>
                </div>

                {/* 分卡樣式：手機單欄、平板以上雙欄 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted">用戶名稱</label>
                    <div className="p-4 bg-surface-hover rounded-xl border border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-fg" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-fg truncate" title={profile.username}>{profile.username}</div>
                        {profile.is_premium && (
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Crown className="w-3 h-3 text-yellow-500" />
                            <span className="text-yellow-600">已訂閱</span>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={async () => {
                          const newName = prompt('請輸入新的用戶名稱\n規則：至少2字符，只能包含英數字和 - _ .', profile.username)
                          if (newName && newName.trim() && newName !== profile.username) {
                            const trimmedName = newName.trim()
                            
                            // 基本驗證
                            if (trimmedName.length < 2) {
                              setMessage('用戶名稱至少需要 2 個字符')
                              return
                            }
                            
                            if (!/^[a-zA-Z0-9\-_.]+$/.test(trimmedName)) {
                              setMessage('用戶名稱只能包含英數字和 - _ .')
                              return
                            }
                            
                            try {
                              setSaving(true)
                              await AccountAPI.updateProfile({ username: trimmedName })
                              setMessage('用戶名稱更新成功')
                              // 重新載入個人資料
                              const updatedProfile = await AccountAPI.profile()
                              setProfile(updatedProfile)
                            } catch (error: any) {
                              setMessage(error?.message || '用戶名稱更新失敗')
                            } finally {
                              setSaving(false)
                            }
                          }
                        }}
                        className="p-1 rounded hover:bg-surface transition-colors flex-shrink-0 ml-auto"
                        title="編輯用戶名稱"
                        disabled={saving}
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
            </>
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
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={cpw.current_password}
                      onChange={(e) => setCpw(prev => ({ ...prev, current_password: e.target.value }))}
                      className="w-full p-3 bg-surface-hover rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary pr-10"
                      placeholder="輸入目前密碼"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                      tabIndex={-1}
                      onClick={()=>setShowCurrentPassword(v=>!v)}
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-2">新密碼</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={cpw.new_password}
                      onChange={(e) => setCpw(prev => ({ ...prev, new_password: e.target.value }))}
                      className="w-full p-3 bg-surface-hover rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary pr-10"
                      placeholder="輸入新密碼"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                      tabIndex={-1}
                      onClick={()=>setShowNewPassword(v=>!v)}
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
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

            {/* 手機版登出區塊 */}
            <div className="md:hidden bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="w-6 h-6 text-red-500" />
                <h2 className="text-xl font-semibold dual-text">帳號管理</h2>
              </div>
              
              <div className="space-y-4">
                <button
                  onClick={() => {
                    if (confirm('確定要登出嗎？')) {
                      logout();
                      window.location.href = '/';
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors mobile-touch-target"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">登出帳號</span>
                </button>
                
                <div className="p-4 bg-surface-hover rounded-xl border border-border">
                  <div className="text-sm text-muted text-center">
                    登出後需要重新登入才能存取個人化內容
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
      </PageLayout>
    )
  }
