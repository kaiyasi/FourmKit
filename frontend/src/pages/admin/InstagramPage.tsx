import { useState, useEffect } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { 
  ArrowLeft, Instagram, Plus, Settings, Play, Eye, Calendar, Hash, 
  Image, Send, Clock, Users, AlertCircle, CheckCircle, Globe, 
  MoreHorizontal, Edit, Trash2, ChevronDown 
} from 'lucide-react'
import { formatLocalMinute } from '@/utils/time'
import { useAuth } from '@/contexts/AuthContext'

interface InstagramAccount {
  id: number
  account_name: string
  username: string
  is_active: boolean
  school_id: number | null
  school_name: string
  has_token: boolean
  created_at: string
}

interface InstagramTemplate {
  id: number
  name: string
  description: string
  background_color: string
  text_color: string
  accent_color: string
  is_default: boolean
  school_name: string
}

interface InstagramScheduler {
  id: number
  name: string
  trigger_type: 'count' | 'time' | 'manual'
  trigger_count?: number
  trigger_time?: string
  is_active: boolean
  school_name: string
  account_name: string
  template_name: string
}

interface InstagramStats {
  accounts: { total: number; active: number }
  templates: { total: number }
  posts: { total_published: number; pending: number; failed: number; recent_7days: number }
  queue: { pending: number }
}

export default function InstagramPage() {
  const { role } = useAuth()
  if (!['dev_admin','campus_admin','cross_admin'].includes(role)) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/instagram" />
        <MobileBottomNav />
        <main className="mx-auto max-w-xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
            <h1 className="text-lg font-semibold dual-text mb-2">無權限</h1>
            <p className="text-sm text-muted">此功能僅限管理組（跨校/校內/總管）。</p>
          </div>
        </main>
      </div>
    )
  }
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'templates' | 'schedulers' | 'posts'>('overview')
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [templates, setTemplates] = useState<InstagramTemplate[]>([])
  const [schedulers, setSchedulers] = useState<InstagramScheduler[]>([])
  const [stats, setStats] = useState<InstagramStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showActionMenu, setShowActionMenu] = useState<number | null>(null)
  const [modal, setModal] = useState<null | { kind: 'view'|'edit'|'create'; type: 'account'|'template'|'scheduler'; id?: number }>(null)
  const [form, setForm] = useState<any>({})
  const [schools, setSchools] = useState<{id:number;slug:string;name:string}[]>([])

  useEffect(() => {
    const html = document.documentElement
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 僅桌面版可用：手機顯示受限提示
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // 載入學校（建立/編輯時使用）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/schools')
        const j = await r.json().catch(()=>({}))
        if (Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
  }, [])

  const authed = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('token')
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    // 處理 401 刷新 token
    if (response.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${refreshToken}` }
          })
          if (refreshResponse.ok) {
            const data = await refreshResponse.json()
            localStorage.setItem('token', data.access_token)
            // 重新發送原始請求
            return fetch(url, {
              ...options,
              headers: {
                ...options.headers,
                'Authorization': `Bearer ${data.access_token}`,
                'Content-Type': 'application/json'
              }
            })
          }
        } catch (e) {
          console.error('Token refresh failed:', e)
        }
      }
    }

    return response
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [statsRes, accountsRes, templatesRes, schedulersRes] = await Promise.allSettled([
        authed('/api/instagram/stats'),
        authed('/api/instagram/accounts'),
        authed('/api/instagram/templates'),
        authed('/api/instagram/schedulers')
      ])

      // 處理統計數據
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const data = await statsRes.value.json()
        setStats(data.data)
      }

      // 處理帳號數據
      if (accountsRes.status === 'fulfilled' && accountsRes.value.ok) {
        const data = await accountsRes.value.json()
        setAccounts(data.data || [])
      }

      // 處理模板數據
      if (templatesRes.status === 'fulfilled' && templatesRes.value.ok) {
        const data = await templatesRes.value.json()
        setTemplates(data.data || [])
      }

      // 處理排程數據
      if (schedulersRes.status === 'fulfilled' && schedulersRes.value.ok) {
        const data = await schedulersRes.value.json()
        setSchedulers(data.data || [])
      }

      // 檢查是否有任何請求失敗
      const failures = [statsRes, accountsRes, templatesRes, schedulersRes]
        .filter(res => res.status === 'rejected' || !res.value?.ok)
      
      if (failures.length > 0) {
        console.warn('Some Instagram API endpoints failed to load')
        setError('部分功能載入失敗，Instagram 整合可能尚未完全設定')
      }

    } catch (error: any) {
      console.error('載入 Instagram 數據失敗:', error)
      setError(error?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeTab])

  const Card = ({ 
    title, 
    desc, 
    icon: Icon, 
    value, 
    subValue,
    color = 'primary',
    onClick 
  }: {
    title: string
    desc: string
    icon: any
    value: number | string
    subValue?: string
    color?: string
    onClick?: () => void
  }) => {
    const colorClasses = {
      primary: 'text-primary',
      pink: 'text-primary',
      green: 'text-primary',
      orange: 'text-primary',
      purple: 'text-primary'
    }

    return (
      <div 
        className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft hover:shadow-md transition-all cursor-pointer"
        onClick={onClick}
      >
        <div className="flex items-center justify-between mb-3">
          <div className={`w-12 h-12 rounded-xl bg-surface-hover border border-border flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.primary}`} />
          </div>
        </div>
        <div className="text-2xl font-bold dual-text mb-1">{value}</div>
        <div className="text-sm font-medium dual-text">{title}</div>
        <div className="text-xs text-muted mt-1">{subValue || desc}</div>
      </div>
    )
  }

  const ActionMenu = ({ id, type, onClose }: { id: number; type: 'account' | 'template' | 'scheduler'; onClose: () => void }) => (
    <div className="absolute right-0 top-8 z-50 bg-surface border border-border rounded-lg shadow-soft py-1 min-w-40">
      <button
        onClick={() => { setModal({ kind: 'view', type, id }); onClose() }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text"
      >
        <Eye className="w-4 h-4" />
        查看詳情
      </button>
      <button
        onClick={() => { setModal({ kind: 'edit', type, id }); onClose() }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text"
      >
        <Edit className="w-4 h-4" />
        編輯設定
      </button>
      {role === 'dev_admin' && (
        <button
          onClick={async () => {
            onClose()
            if (!confirm('確定要刪除嗎？此操作無法復原。')) return
            try {
              const target = type === 'account' ? 'accounts' : (type === 'template' ? 'templates' : 'schedulers')
              const res = await authed(`/api/instagram/${target}/${id}`, { method: 'DELETE' })
              if (!res.ok) throw new Error(await res.text())
              await loadData()
            } catch (e:any) {
              alert(e?.message || '刪除失敗')
            }
          }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          刪除
        </button>
      )}
    </div>
  )

  const onField = (k:string, v:any) => setForm((f:any)=>({ ...f, [k]: v }))

  const Modal = () => {
    if (!modal) return null
    const close = () => { setModal(null); setForm({}) }
    const isCreate = modal.kind === 'create'
    const isEdit = modal.kind === 'edit'
    const isView = modal.kind === 'view'

    const tpl = modal.type === 'template' ? templates.find(x=>x.id===modal.id) : undefined
    const acc = modal.type === 'account' ? accounts.find(x=>x.id===modal.id) : undefined
    const sch = modal.type === 'scheduler' ? schedulers.find(x=>x.id===modal.id) : undefined

    const save = async () => {
      try {
        if (modal.type === 'template') {
          // 組裝 layout_config（僅帶入有提供的欄位）
          const layout: any = {}
          const n = (k:string) => (form[k] !== undefined && form[k] !== '' ? Number(form[k]) : undefined)
          const s = (k:string) => (form[k] !== undefined ? String(form[k]) : undefined)
          const b = (k:string) => (typeof form[k] === 'boolean' ? form[k] : undefined)
          const assign = (k:string, v:any) => { if (v !== undefined && v !== null && v !== '') layout[k] = v }
          assign('margin', n('layout_margin'))
          assign('top_accent_height', n('layout_top_accent_height'))
          assign('content_max_lines', n('layout_content_max_lines'))
          assign('line_spacing', n('layout_line_spacing'))
          assign('content_x', n('content_x'))
          assign('content_y', n('content_y'))
          assign('content_width', n('content_width'))
          assign('content_height', n('content_height'))
          assign('logo_x', n('logo_x'))
          assign('logo_y', n('logo_y'))
          assign('logo_size', n('logo_size'))
          assign('logo_position', s('logo_position'))
          assign('timestamp_show', !!form['timestamp_show'])
          assign('timestamp_format', s('timestamp_format'))
          assign('timestamp_12h', !!form['timestamp_12h'])
          assign('timestamp_x', n('timestamp_x'))
          assign('timestamp_y', n('timestamp_y'))
          assign('timestamp_size', n('timestamp_size'))
          assign('timestamp_color', s('timestamp_color'))
          assign('timestamp_font_google', s('timestamp_font_google'))
          assign('timestamp_font_url', s('timestamp_font_url'))

          const payload = { ...form, layout_config: layout }
          if (isCreate) {
            const res = await authed('/api/instagram/templates', { method:'POST', body: JSON.stringify(payload) })
            if (!res.ok) throw new Error(await res.text())
          } else if (isEdit && modal.id) {
            const res = await authed(`/api/instagram/templates/${modal.id}`, { method:'PUT', body: JSON.stringify(payload) })
            if (!res.ok) throw new Error(await res.text())
          }
        } else if (modal.type === 'account') {
          const name = String(form.account_name||'').trim()
          const username = String(form.username||'').trim()
          const accId = String(form.account_id||'').trim()
          const token = String(form.access_token||'').trim()
          if (!name || !username || !accId || !token) {
            alert('請填寫完整：顯示名稱、用戶名、商業帳號ID、Access Token')
            return
          }
          if (isCreate) {
            const res = await authed('/api/instagram/accounts', { method:'POST', body: JSON.stringify(form) })
            if (!res.ok) throw new Error(await res.text())
          } else if (isEdit && modal.id) {
            const res = await authed(`/api/instagram/accounts/${modal.id}`, { method:'PUT', body: JSON.stringify(form) })
            if (!res.ok) throw new Error(await res.text())
          }
        } else if (modal.type === 'scheduler') {
          if (isCreate) {
            const res = await authed('/api/instagram/schedulers', { method:'POST', body: JSON.stringify(form) })
            if (!res.ok) throw new Error(await res.text())
          } else if (isEdit && modal.id) {
            const res = await authed(`/api/instagram/schedulers/${modal.id}`, { method:'PUT', body: JSON.stringify(form) })
            if (!res.ok) throw new Error(await res.text())
          }
        }
        await loadData(); close()
      } catch (e:any) { alert(e?.message || '儲存失敗') }
    }

    const renderFields = () => {
      if (modal.type === 'template') {
        const base:any = isCreate ? {} : (tpl || {})
        const get = (k:string, def:any) => (isCreate? form[k] : (form[k] ?? base[k])) ?? def
        const buildPayload = () => {
          const layout:any = {}
          const val = (k:string) => (document.getElementById(k) as HTMLInputElement | null)?.value
          const bool = (k:string) => (document.getElementById(k) as HTMLInputElement | null)?.checked
          const num = (k:string) => { const v = val(k); return v ? Number(v) : undefined }
          const put = (k:string, v:any) => { if (v!==undefined && v!==null && v!=='') layout[k]=v }
          put('margin', num('layout_margin'))
          put('top_accent_height', num('layout_top_accent_height'))
          put('content_max_lines', num('layout_content_max_lines'))
          put('line_spacing', num('layout_line_spacing'))
          put('content_x', num('content_x'))
          put('content_y', num('content_y'))
          put('content_width', num('content_width'))
          put('content_height', num('content_height'))
          put('logo_x', num('logo_x'))
          put('logo_y', num('logo_y'))
          put('logo_size', num('logo_size'))
          put('logo_position', val('logo_position'))
          put('timestamp_show', !!bool('timestamp_show'))
          put('timestamp_format', val('timestamp_format'))
          put('timestamp_12h', !!bool('timestamp_12h'))
          put('timestamp_x', num('timestamp_x'))
          put('timestamp_y', num('timestamp_y'))
          put('timestamp_size', num('timestamp_size'))
          put('timestamp_color', val('timestamp_color'))
          put('timestamp_font_google', val('timestamp_font_google'))
          put('timestamp_font_url', val('timestamp_font_url'))
          return {
            background_color: (document.getElementById('background_color') as HTMLInputElement|null)?.value || get('background_color','#ffffff'),
            text_color: (document.getElementById('text_color') as HTMLInputElement|null)?.value || get('text_color','#333333'),
            accent_color: (document.getElementById('accent_color') as HTMLInputElement|null)?.value || get('accent_color','#3b82f6'),
            title_font: get('title_font','NotoSansTC'),
            content_font: get('content_font','NotoSansTC'),
            title_font_google: (document.getElementById('title_font_google') as HTMLInputElement|null)?.value || get('title_font_google',''),
            content_font_google: (document.getElementById('content_font_google') as HTMLInputElement|null)?.value || get('content_font_google',''),
            title_font_url: (document.getElementById('title_font_url') as HTMLInputElement|null)?.value || get('title_font_url',''),
            content_font_url: (document.getElementById('content_font_url') as HTMLInputElement|null)?.value || get('content_font_url',''),
            layout_config: layout,
          }
        }
        const [previewUrl, setPreviewUrl] = useState<string | null>(null as any)
        const [previewing, setPreviewing] = useState(false as any)
        const doPreview = async () => {
          try {
            setPreviewing(true); setPreviewUrl(null)
            const payload = buildPayload()
            const sampleContent = (document.getElementById('preview_sample') as HTMLTextAreaElement|null)?.value || '<p>即時預覽：這是一段示範內容</p>'
            const schoolSlug = (document.getElementById('preview_school') as HTMLInputElement|null)?.value || ''
            const res = await authed('/api/instagram/generate-preview', { method:'POST', body: JSON.stringify({ template_config: payload, sample_content: sampleContent, school_slug: schoolSlug }) })
            if (!res.ok) throw new Error(await res.text())
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            setPreviewUrl(url)
          } catch (e:any) { console.warn('預覽失敗', e) } finally { setPreviewing(false) }
        }
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input className="form-control" placeholder="名稱" defaultValue={base.name} onChange={e=>onField('name', e.target.value)} />
              <select className="form-control" defaultValue={String(base.school_id ?? '')} onChange={e=>onField('school_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">跨校（通用）</option>
                {schools.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <textarea className="form-control" placeholder="描述" defaultValue={base.description} onChange={e=>onField('description', e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              <input id="background_color" type="color" className="h-10 w-full rounded border" defaultValue={get('background_color', '#ffffff')} onChange={e=>onField('background_color', e.target.value)} />
              <input id="text_color" type="color" className="h-10 w-full rounded border" defaultValue={get('text_color', '#333333')} onChange={e=>onField('text_color', e.target.value)} />
              <input id="accent_color" type="color" className="h-10 w-full rounded border" defaultValue={get('accent_color', '#3b82f6')} onChange={e=>onField('accent_color', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input id="title_font_google" className="form-control" placeholder="Google 標題字型（如 Noto Sans TC）" defaultValue={base.title_font_google} onChange={e=>onField('title_font_google', e.target.value)} />
              <input id="content_font_google" className="form-control" placeholder="Google 內文字型（如 Noto Sans TC）" defaultValue={base.content_font_google} onChange={e=>onField('content_font_google', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input id="title_font_url" className="form-control" placeholder="標題字型 URL (.ttf/.otf)" defaultValue={base.title_font_url} onChange={e=>onField('title_font_url', e.target.value)} />
              <input id="content_font_url" className="form-control" placeholder="內文字型 URL (.ttf/.otf)" defaultValue={base.content_font_url} onChange={e=>onField('content_font_url', e.target.value)} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <input id="content_x" className="form-control" placeholder="內容X" type="number" />
              <input id="content_y" className="form-control" placeholder="內容Y" type="number" />
              <input id="content_width" className="form-control" placeholder="內容寬" type="number" />
              <input id="content_height" className="form-control" placeholder="內容高" type="number" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <select id="logo_position" className="form-control" onChange={e=>onField('logo_position', e.target.value)}>
                <option value="">Logo 位置（自訂座標用不到）</option>
                <option value="top-left">左上</option>
                <option value="top-right">右上</option>
                <option value="bottom-left">左下</option>
                <option value="bottom-right">右下</option>
              </select>
              <input id="logo_x" className="form-control" placeholder="Logo X（可選）" type="number" />
              <input id="logo_y" className="form-control" placeholder="Logo Y（可選）" type="number" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input id="logo_size" className="form-control" placeholder="Logo 大小" type="number" />
              <input id="layout_line_spacing" className="form-control" placeholder="內容行距" type="number" />
              <input id="layout_content_max_lines" className="form-control" placeholder="內容最大行數" type="number" />
            </div>
            <div className="grid grid-cols-4 gap-3 items-center text-sm">
              <label className="flex items-center gap-2"><input id="timestamp_show" type="checkbox" />顯示時間戳</label>
              <label className="flex items-center gap-2"><input id="timestamp_12h" type="checkbox" />12小時制</label>
              <input id="timestamp_format" className="form-control col-span-2" placeholder="時間格式（strftime，例如 %Y-%m-%d %H:%M）" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <input id="timestamp_x" className="form-control" placeholder="時間X" type="number" />
              <input id="timestamp_y" className="form-control" placeholder="時間Y" type="number" />
              <input id="timestamp_size" className="form-control" placeholder="時間字體大小" type="number" />
              <input id="timestamp_color" className="form-control" type="color" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input id="timestamp_font_google" className="form-control" placeholder="時間字型（Google）" />
              <input id="timestamp_font_url" className="form-control" placeholder="時間字型 URL (.ttf/.otf)" />
            </div>
            <div className="mt-4 border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted">即時預覽</div>
                <button type="button" className="btn-secondary text-sm px-3 py-1.5" onClick={doPreview} disabled={previewing}>{previewing ? '生成中…' : '更新預覽'}</button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <input id="preview_school" className="form-control" placeholder="預覽學校 slug（可留空）" />
                <textarea id="preview_sample" className="form-control" placeholder="預覽內容（HTML 或純文字）"></textarea>
              </div>
              <div className="grid place-items-center min-h-[220px] bg-surface-hover rounded-md">
                {previewUrl ? <img src={previewUrl} className="max-w-full max-h-[480px] rounded" /> : <div className="text-sm text-muted">尚未生成</div>}
              </div>
            </div>
          </div>
        )
      }
      if (modal.type === 'account') {
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input className="form-control" placeholder="顯示名稱" onChange={e=>onField('account_name', e.target.value)} required />
              <input className="form-control" placeholder="用戶名（@ 不用填）" onChange={e=>onField('username', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="form-control" onChange={e=>onField('school_id', e.target.value ? Number(e.target.value) : null)} defaultValue="">
                <option value="">跨校（通用）</option>
                {schools.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="form-control" placeholder="商業帳號 ID" onChange={e=>onField('account_id', e.target.value)} required />
            </div>
            <input className="form-control" placeholder="Access Token" onChange={e=>onField('access_token', e.target.value)} required />
          </div>
        )
      }
      if (modal.type === 'scheduler') {
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input className="form-control" placeholder="排程名稱" onChange={e=>onField('name', e.target.value)} />
              <select className="form-control" onChange={e=>onField('school_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">跨校</option>
                {schools.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="form-control" onChange={e=>onField('account_id', Number(e.target.value))}>
                <option value="">選擇 IG 帳號</option>
                {accounts.map(a=> <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
              <select className="form-control" onChange={e=>onField('template_id', Number(e.target.value))}>
                <option value="">選擇模板</option>
                {templates.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="form-control" onChange={e=>onField('trigger_type', e.target.value)}>
                <option value="manual">手動</option>
                <option value="count">累積數量</option>
                <option value="time">定時</option>
              </select>
              <input className="form-control" placeholder="觸發數量（count）" onChange={e=>onField('trigger_count', Number(e.target.value||0))} />
            </div>
            <input className="form-control" placeholder="觸發時間 HH:MM:SS（time）" onChange={e=>onField('trigger_time', e.target.value)} />
            <div className="grid grid-cols-3 gap-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" onChange={e=>onField('filter_school_only', e.target.checked)} />只發本校貼文</label>
              <label className="flex items-center gap-2"><input type="checkbox" onChange={e=>onField('filter_exclude_media', e.target.checked)} />排除有媒體</label>
              <input className="form-control" placeholder="內容最小字數（預設10）" onChange={e=>onField('filter_min_length', Number(e.target.value||10))} />
            </div>
          </div>
        )
      }
      return null
    }

    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={close} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] sm:w-[640px] rounded-2xl border border-border bg-surface shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold dual-text">{isCreate? '新增' : isEdit? '編輯' : '查看'} {modal.type==='account'?'帳號':modal.type==='template'?'模板':'排程'}</h3>
            <button className="text-muted hover:text-fg" onClick={close}>✕</button>
          </div>
          {isView ? (
            <pre className="text-xs bg-surface-hover border border-border rounded p-3 overflow-auto max-h-[60vh]">{JSON.stringify({ acc, tpl, sch }, null, 2)}</pre>
          ) : (
            <div className="space-y-3">
              {renderFields()}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button className="btn-ghost text-sm" onClick={close}>取消</button>
                <button className="btn-primary text-sm" onClick={save}>儲存</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const OverviewTab = () => (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          title="Instagram 帳號"
          desc="已連接的帳號"
          icon={Instagram}
          value={stats?.accounts.active || 0}
          subValue={`共 ${stats?.accounts.total || 0} 個帳號`}
          color="pink"
          onClick={() => setActiveTab('accounts')}
        />
        
        <Card
          title="已發布貼文"
          desc="成功發送的貼文"
          icon={Send}
          value={stats?.posts.total_published || 0}
          subValue={`7天內: ${stats?.posts.recent_7days || 0}`}
          color="green"
          onClick={() => setActiveTab('posts')}
        />

        <Card
          title="待處理佇列"
          desc="等待發送的貼文"
          icon={Clock}
          value={stats?.queue.pending || 0}
          subValue="等待發送"
          color="orange"
          onClick={() => setActiveTab('posts')}
        />

        <Card
          title="可用模板"
          desc="設計模板數量"
          icon={Image}
          value={stats?.templates.total || 0}
          subValue="設計模板"
          color="purple"
          onClick={() => setActiveTab('templates')}
        />
      </div>

      {/* 系統狀態 */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
        <h3 className="text-lg font-medium dual-text mb-4">系統狀態</h3>
        <div className="grid gap-4">
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-success-text" />
              <span className="text-sm dual-text">Instagram 整合服務</span>
            </div>
            <span className="text-xs px-2 py-1 bg-success-bg text-success-text rounded-full">
              {error ? '部分功能可用' : '運行正常'}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary" />
              <span className="text-sm dual-text">API 連接狀態</span>
            </div>
            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
              已連接
            </span>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
        <h3 className="text-lg font-medium dual-text mb-4">快速操作</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { tab: 'accounts', icon: Instagram, title: '管理帳號', desc: `${accounts.length} 個帳號`, color: 'text-pink-500' },
            { tab: 'templates', icon: Image, title: '設計模板', desc: `${templates.length} 個模板`, color: 'text-purple-500' },
            { tab: 'schedulers', icon: Calendar, title: '排程設定', desc: `${schedulers.length} 個排程`, color: 'text-primary' },
            { tab: 'posts', icon: Hash, title: '貼文管理', desc: '發送記錄', color: 'text-success-text' }
          ].map((item, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(item.tab as any)}
              className="p-4 border border-border rounded-xl hover:bg-surface-hover transition-colors text-left"
            >
              <item.icon className={`w-6 h-6 ${item.color} mb-2`} />
              <div className="font-medium dual-text">{item.title}</div>
              <div className="text-xs text-muted">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const AccountsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium dual-text">Instagram 帳號管理</h3>
          <p className="text-sm text-muted">管理連接的 Instagram 帳號</p>
        </div>
        {['dev_admin', 'campus_admin'].includes(role) && (
          <button className="btn-primary flex items-center gap-2" onClick={() => setModal({ kind:'create', type:'account' })}>
            <Plus className="w-4 h-4" />
            新增帳號
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {accounts.length === 0 ? (
          <div className="p-12 text-center">
            <Instagram className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
            <p className="text-muted">尚未設定 Instagram 帳號</p>
            <p className="text-sm text-muted mt-2">新增帳號以開始自動發布貼文</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((account) => (
              <div key={account.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                      <Instagram className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium dual-text truncate max-w-[220px]">{account.account_name}</h4>
                      <p className="text-sm text-muted truncate max-w-[220px]">@{account.username}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted">{account.school_name}</span>
                        {account.has_token && (
                          <span className="text-xs px-2 py-1 bg-success-bg text-success-text rounded-full">
                            已連接
                          </span>
                        )}
                        {account.is_active && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                            活躍
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowActionMenu(showActionMenu === account.id ? null : account.id)}
                      className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {showActionMenu === account.id && (
                      <ActionMenu
                        id={account.id}
                        type="account"
                        onClose={() => setShowActionMenu(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const SchedulersTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium dual-text">排程管理</h3>
          <p className="text-sm text-muted">設定自動發送 Instagram 貼文的排程規則</p>
        </div>
        {['dev_admin', 'campus_admin'].includes(role) && (
          <button className="btn-primary flex items-center gap-2" onClick={() => setModal({ kind:'create', type:'scheduler' })}>
            <Plus className="w-4 h-4" />
            新增排程
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {schedulers.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
            <p className="text-muted">尚無排程設定</p>
            <p className="text-sm text-muted mt-2">建立排程來自動發送貼文到 Instagram</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {schedulers.map((scheduler) => (
              <div key={scheduler.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-hover border border-border flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium dual-text truncate max-w-[220px]">{scheduler.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted">{scheduler.school_name}</span>
                        <span className="text-xs text-muted">•</span>
                        <span className="text-xs text-muted">
                          {scheduler.trigger_type === 'count' ? `每 ${scheduler.trigger_count} 篇貼文` : 
                           scheduler.trigger_type === 'time' ? `定時 ${scheduler.trigger_time}` : '手動觸發'}
                        </span>
                        {scheduler.is_active && (
                          <span className="text-xs px-2 py-1 bg-success-bg text-success-text rounded-full">
                            運行中
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        帳號: {scheduler.account_name} • 模板: {scheduler.template_name}
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowActionMenu(showActionMenu === scheduler.id ? null : scheduler.id)}
                      className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {showActionMenu === scheduler.id && (
                      <ActionMenu
                        id={scheduler.id}
                        type="scheduler"
                        onClose={() => setShowActionMenu(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const PostsTab = () => {
    const [posts, setPosts] = useState<any[]>([])
    const [postsLoading, setPostsLoading] = useState(false)

    useEffect(() => {
      const loadPosts = async () => {
        try {
          setPostsLoading(true)
          const response = await authed('/api/instagram/posts')
          if (response.ok) {
            const data = await response.json()
            setPosts(data.data || [])
          }
        } catch (error) {
          console.error('載入 IG 貼文失敗:', error)
        } finally {
          setPostsLoading(false)
        }
      }
      loadPosts()
    }, [])

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'published': return 'text-success-text bg-success-bg'
        case 'pending': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'
        case 'failed': return 'text-red-600 bg-red-100 dark:bg-red-900/30'
        default: return 'text-muted bg-surface-hover'
      }
    }

    const getStatusLabel = (status: string) => {
      switch (status) {
        case 'published': return '已發布'
        case 'pending': return '處理中'
        case 'generated': return '已生成'
        case 'failed': return '失敗'
        default: return status
      }
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium dual-text">貼文發送記錄</h3>
            <p className="text-sm text-muted">查看 Instagram 貼文的發送狀態和記錄</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          {postsLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted">載入貼文記錄中...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="p-12 text-center">
              <Hash className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
              <p className="text-muted">尚無發送記錄</p>
              <p className="text-sm text-muted mt-2">當排程開始運作時，這裡會顯示發送記錄</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {posts.map((post: any, index: number) => (
                <div key={post.id || index} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-surface-hover border border-border flex items-center justify-center">
                        <Send className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium dual-text">#{post.post_id || 'N/A'}</h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(post.status)}`}>
                            {getStatusLabel(post.status)}
                          </span>
                        </div>
                        <div className="text-sm text-muted mb-2">
                          帳號: {post.account_name} • 模板: {post.template_name}
                        </div>
                        {post.caption && (
                          <div className="text-sm dual-text mb-2 line-clamp-2">
                            {post.caption}
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted">
                          {post.scheduled_at && (
                            <span>排程: {formatLocalMinute(post.scheduled_at)}</span>
                          )}
                          {post.published_at && (
                            <span>發布: {formatLocalMinute(post.published_at)}</span>
                          )}
                          <span>建立: {formatLocalMinute(post.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {post.instagram_permalink && (
                        <a
                          href={post.instagram_permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors"
                          title="在 Instagram 查看"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const TemplatesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium dual-text">貼文模板管理</h3>
          <p className="text-sm text-muted">設計和管理 Instagram 貼文模板</p>
        </div>
        {['dev_admin', 'campus_admin'].includes(role) && (
          <button className="btn-primary flex items-center gap-2" onClick={() => setModal({ kind:'create', type:'template' })}>
            <Plus className="w-4 h-4" />
            新增模板
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {templates.length === 0 ? (
          <div className="p-12 text-center">
            <Image className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
            <p className="text-muted">尚無貼文模板</p>
            <p className="text-sm text-muted mt-2">建立模板來自動生成 Instagram 貼文</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {templates.map((template) => (
              <div key={template.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center border border-border"
                      style={{ backgroundColor: template.background_color }}
                    >
                      <Image className="w-6 h-6" style={{ color: template.text_color }} />
                    </div>
                    <div>
                      <h4 className="font-medium dual-text truncate max-w-[220px]">{template.name}</h4>
                      <p className="text-sm text-muted line-clamp-2 max-w-[420px]">{template.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted">{template.school_name}</span>
                        {template.is_default && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                            預設模板
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowActionMenu(showActionMenu === template.id ? null : template.id)}
                      className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    
                    {showActionMenu === template.id && (
                      <ActionMenu
                        id={template.id}
                        type="template"
                        onClose={() => setShowActionMenu(null)}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/instagram" />
        <MobileBottomNav />
        <main className="mx-auto max-w-xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
            <h1 className="text-lg font-semibold dual-text mb-2">Instagram 整合管理</h1>
            <p className="text-sm text-muted mb-4">此頁面功能較多，為確保體驗，僅支援在電腦桌面使用。</p>
            <div className="text-xs text-muted">請改以電腦或大尺寸平板開啟。</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/instagram" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        {/* Header */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">Instagram 整合管理</h1>
              <p className="text-sm text-muted">自動將通過審核的貼文發送到 Instagram</p>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
            </div>
          )}
        </div>

        {/* 標籤切換 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft mb-6">
          <div className="border-b border-border">
            <nav className="flex space-x-8 px-6" aria-label="標籤">
              {[
                { id: 'overview', label: '總覽', icon: Eye },
                { id: 'accounts', label: 'IG 帳號', icon: Instagram },
                { id: 'templates', label: '貼文模板', icon: Image },
                { id: 'schedulers', label: '排程設定', icon: Calendar },
                { id: 'posts', label: '發送記錄', icon: Hash }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg hover:border-border'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted">載入中...</span>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'accounts' && <AccountsTab />}
                {activeTab === 'templates' && <TemplatesTab />}
                {activeTab === 'schedulers' && <SchedulersTab />}
                {activeTab === 'posts' && <PostsTab />}
                <Modal />
              </>
            )}
          </div>
        </div>
      </main>

      {/* 點擊外部關閉選單 */}
      {showActionMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowActionMenu(null)}
        />
      )}
    </div>
  )
}
