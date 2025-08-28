// InstagramAdmin_refactor.tsx
// Drop-in refactor of your Instagram admin page with cleaner state, reusable pieces,
// and safer API handling. Paths and endpoints preserved for compatibility.

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Eye,
  Hash,
  Image as ImageIcon,
  Instagram,
  MoreHorizontal,
  Palette,
  Plus,
  Send,
  X,
} from 'lucide-react'
import { formatLocalMinute } from '@/utils/time'
import { useAuth } from '@/contexts/AuthContext'

// -----------------------------------------------
// Types
// -----------------------------------------------

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

interface InstagramPost {
  id?: number
  post_id?: string
  status: 'published' | 'pending' | 'generated' | 'failed' | string
  account_name?: string
  template_name?: string
  caption?: string
  scheduled_at?: string
  published_at?: string
  created_at: string
  instagram_permalink?: string
}

interface InstagramStats {
  accounts: { total: number; active: number }
  templates: { total: number }
  posts: { total_published: number; pending: number; failed: number; recent_7days: number }
  queue: { pending: number }
}

// -----------------------------------------------
// Defaults
// -----------------------------------------------

const DEFAULT_TEMPLATE_CONFIGS = {
  minimal: {
    name: '簡約風格',
    description: '乾淨簡約的設計，適合文字內容',
    background_color: '#FFFFFF',
    text_color: '#333333',
    accent_color: '#3B82F6',
    title_font_google: 'Noto Sans TC',
    content_font_google: 'Noto Sans TC',
    layout_config: {
      margin: 40,
      content_max_lines: 8,
      line_spacing: 1.5,
      logo_position: 'bottom-right',
      logo_size: 80,
      timestamp_show: true,
      timestamp_format: '%Y-%m-%d %H:%M',
    },
  },
  colorful: {
    name: '活潑彩色',
    description: '鮮明色彩搭配，吸引目光',
    background_color: '#F97316',
    text_color: '#FFFFFF',
    accent_color: '#FFF7ED',
    title_font_google: 'Noto Sans TC',
    content_font_google: 'Noto Sans TC',
    layout_config: {
      margin: 50,
      top_accent_height: 120,
      content_max_lines: 6,
      line_spacing: 1.6,
      logo_position: 'top-left',
      logo_size: 100,
      timestamp_show: true,
      timestamp_format: '%m/%d %H:%M',
    },
  },
  academic: {
    name: '學術專業',
    description: '專業學術風格，適合正式內容',
    background_color: '#1E293B',
    text_color: '#F1F5F9',
    accent_color: '#0EA5E9',
    title_font_google: 'Noto Sans TC',
    content_font_google: 'Noto Sans TC',
    layout_config: {
      margin: 60,
      content_max_lines: 10,
      line_spacing: 1.4,
      logo_position: 'top-center',
      logo_size: 120,
      timestamp_show: false,
    },
  },
}

// -----------------------------------------------
// Small utilities
// -----------------------------------------------

const useResponsive = () => {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return { isMobile }
}

const useSchools = () => {
  const [schools, setSchools] = useState<{ id: number; slug: string; name: string }[]>([])
  useEffect(() => {
    let abort = new AbortController()
    ;(async () => {
      try {
        const r = await fetch('/api/schools', { signal: abort.signal })
        const j = await r.json().catch(() => ({}))
        if (Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
    return () => abort.abort()
  }, [])
  return schools
}

// Generic authed fetch with refresh
const useApi = () => {
  const refreshingRef = useRef<Promise<string | null> | null>(null)

  const refresh = async (): Promise<string | null> => {
    try {
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) return null
      const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { Authorization: `Bearer ${refreshToken}` } })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      if (data?.access_token) {
        localStorage.setItem('token', data.access_token)
        return data.access_token
      }
      return null
    } catch {
      return null
    }
  }

  const authed = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('token')
    const doFetch = (tk: string | null) =>
      fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
        },
      })

    let res = await doFetch(token)

    if (res.status === 401) {
      if (!refreshingRef.current) refreshingRef.current = refresh()
      const newToken = await refreshingRef.current
      refreshingRef.current = null
      if (newToken) res = await doFetch(newToken)
    }

    return res
  }

  return { authed }
}

// -----------------------------------------------
// Reusable UI bits
// -----------------------------------------------

const SectionCard: React.FC<{ title: string; desc?: string; children: React.ReactNode; icon?: any }> = ({ title, desc, children, icon: Icon }) => (
  <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
    <div className="flex items-center gap-2 mb-4">
      {Icon ? <Icon className="w-5 h-5 text-primary" /> : null}
      <h3 className="text-lg font-medium dual-text">{title}</h3>
    </div>
    {desc ? <p className="text-sm text-muted mb-4">{desc}</p> : null}
    {children}
  </div>
)

const StatCard: React.FC<{
  title: string
  desc: string
  icon: any
  value: number | string
  subValue?: string
  onClick?: () => void
}> = ({ title, desc, icon: Icon, value, subValue, onClick }) => (
  <button
    className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft hover:shadow-md transition-all text-left"
    onClick={onClick}
  >
    <div className="w-12 h-12 rounded-xl bg-surface-hover border border-border flex items-center justify-center mb-3">
      <Icon className="w-6 h-6 text-primary" />
    </div>
    <div className="text-2xl font-bold dual-text mb-1">{value}</div>
    <div className="text-sm font-medium dual-text">{title}</div>
    <div className="text-xs text-muted mt-1">{subValue || desc}</div>
  </button>
)

const EmptyState: React.FC<{ icon: any; title: string; desc: string; action?: React.ReactNode }> = ({ icon: Icon, title, desc, action }) => (
  <div className="p-12 text-center">
    <div className="w-16 h-16 bg-surface-hover border border-border rounded-full flex items-center justify-center mx-auto mb-4">
      <Icon className="w-8 h-8 text-muted" />
    </div>
    <h4 className="font-medium dual-text mb-2">{title}</h4>
    <p className="text-sm text-muted mb-4">{desc}</p>
    {action}
  </div>
)

const Pill: React.FC<{ tone: 'success' | 'info' | 'warn' | 'muted'; children: React.ReactNode }> = ({ tone, children }) => {
  const map: Record<string, string> = {
    success: 'bg-success-bg text-success-text',
    info: 'bg-primary/10 text-primary',
    warn: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    muted: 'bg-surface-hover text-muted',
  }
  return <span className={`text-xs px-2 py-1 rounded-full ${map[tone]}`}>{children}</span>
}

// Action menu (simple, accessible-ish)
const RowMenu: React.FC<{
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onClose: () => void
}> = ({ onView, onEdit, onDelete, onClose }) => (
  <div className="absolute right-0 top-8 z-50 bg-surface border border-border rounded-lg shadow-soft py-1 min-w-40" role="menu">
    {onView && (
      <button onClick={() => (onView(), onClose())} className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text" role="menuitem">
        <Eye className="w-4 h-4" /> 查看詳情
      </button>
    )}
    {onEdit && (
      <button onClick={() => (onEdit(), onClose())} className="w-full text-left px-4 py-2 text-sm hover:bg-surface-hover flex items-center gap-2 dual-text" role="menuitem">
        編輯設定
      </button>
    )}
    {onDelete && (
      <button
        onClick={() => (onClose(), onDelete())}
        className="w-full text-left px-4 py-2 text-sm hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 flex items-center gap-2"
        role="menuitem"
      >
        刪除
      </button>
    )}
  </div>
)

// -----------------------------------------------
// Modal state machine (shared)
// -----------------------------------------------

type ModalKind = 'view' | 'edit' | 'create'
type ModalType = 'account' | 'template' | 'scheduler'

interface ModalState {
  open: boolean
  kind: ModalKind
  type: ModalType
  id?: number
}

type ModalAction =
  | { type: 'OPEN'; payload: ModalState }
  | { type: 'CLOSE' }

const modalReducer = (s: ModalState | null, a: ModalAction): ModalState | null => {
  switch (a.type) {
    case 'OPEN':
      return { ...a.payload, open: true }
    case 'CLOSE':
      return null
    default:
      return s
  }
}

// -----------------------------------------------
// Template wizard state machine
// -----------------------------------------------

type WizardStep = 'style' | 'customize'

interface WizardState {
  step: WizardStep
  selectedStyle?: keyof typeof DEFAULT_TEMPLATE_CONFIGS
  previewUrl?: string
  isGenerating?: boolean
}

type WizardAction =
  | { type: 'RESET' }
  | { type: 'SET_STYLE'; style: keyof typeof DEFAULT_TEMPLATE_CONFIGS }
  | { type: 'SET_PREVIEW_URL'; url?: string }
  | { type: 'SET_GENERATING'; value: boolean }
  | { type: 'NEXT' }
  | { type: 'PREV' }

const wizardReducer = (s: WizardState, a: WizardAction): WizardState => {
  switch (a.type) {
    case 'RESET':
      return { step: 'style' }
    case 'SET_STYLE':
      return { ...s, selectedStyle: a.style }
    case 'SET_PREVIEW_URL':
      return { ...s, previewUrl: a.url }
    case 'SET_GENERATING':
      return { ...s, isGenerating: a.value }
    case 'NEXT':
      return { ...s, step: s.step === 'style' ? 'customize' : s.step }
    case 'PREV':
      return { ...s, step: s.step === 'customize' ? 'style' : s.step }
    default:
      return s
  }
}

// -----------------------------------------------
// Main Component
// -----------------------------------------------

export default function InstagramAdminRefactor() {
  const { role } = useAuth()
  const { isMobile } = useResponsive()
  const schools = useSchools()
  const { authed } = useApi()

  const canUse = ['dev_admin', 'campus_admin', 'cross_admin'].includes(role)
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'templates' | 'schedulers' | 'posts'>('overview')

  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [templates, setTemplates] = useState<InstagramTemplate[]>([])
  const [schedulers, setSchedulers] = useState<InstagramScheduler[]>([])
  const [stats, setStats] = useState<InstagramStats | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [menuId, setMenuId] = useState<number | null>(null)
  const [modal, dispatchModal] = useReducer(modalReducer, null)

  const [form, setForm] = useState<any>({})
  const onField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const [wizard, dispatchWizard] = useReducer(wizardReducer, { step: 'style' })

  // cosmetic html flag
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // Load initial data per tab
  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [statsRes, accRes, tplRes, schRes] = await Promise.all([
        authed('/api/instagram/stats'),
        authed('/api/instagram/accounts'),
        authed('/api/instagram/templates'),
        authed('/api/instagram/schedulers'),
      ])

      if (statsRes.ok) {
        const d = await statsRes.json()
        setStats(d.data)
      }
      if (accRes.ok) {
        const d = await accRes.json()
        setAccounts(d.data || [])
      }
      if (tplRes.ok) {
        const d = await tplRes.json()
        setTemplates(d.data || [])
      }
      if (schRes.ok) {
        const d = await schRes.json()
        setSchedulers(d.data || [])
      }

      const failed = [statsRes, accRes, tplRes, schRes].filter((r) => !r.ok)
      if (failed.length) setError('部分功能載入失敗，Instagram 整合可能尚未完全設定')
    } catch (e: any) {
      setError(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // -------------------------------------------
  // Template: preview + save
  // -------------------------------------------

  const generatePreview = async (templateConfig: any) => {
    try {
      dispatchWizard({ type: 'SET_GENERATING', value: true })
      const sampleContent = '<h2>範例標題</h2><p>這是一段範例內容，展示模板的視覺效果。</p>'
      const res = await authed('/api/instagram/generate-preview', {
        method: 'POST',
        body: JSON.stringify({ template_config: templateConfig, sample_content: sampleContent, school_slug: '' }),
      })
      if (!res.ok) throw new Error('預覽生成失敗')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      dispatchWizard({ type: 'SET_PREVIEW_URL', url })
    } catch (e) {
      console.error(e)
    } finally {
      dispatchWizard({ type: 'SET_GENERATING', value: false })
    }
  }

  const saveTemplate = async () => {
    const style = wizard.selectedStyle
    if (!style) return
    try {
      const cfg = (DEFAULT_TEMPLATE_CONFIGS as any)[style]
      const payload = { ...cfg, ...form, name: form.name || cfg.name, description: form.description || cfg.description }
      const res = await authed('/api/instagram/templates', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(await res.text())
      await loadData()
      dispatchModal({ type: 'CLOSE' })
      setForm({})
      dispatchWizard({ type: 'RESET' })
    } catch (e: any) {
      alert(e?.message || '儲存模板失敗')
    }
  }

  // -------------------------------------------
  // CRUD helpers shared by Account/Scheduler
  // -------------------------------------------

  const saveAccount = async (mode: 'create' | 'edit', id?: number) => {
    const payload = {
      account_name: form.account_name || '',
      username: form.username || '',
      account_id: form.account_id || '',
      access_token: form.access_token || '',
      school_id: form.school_id || null,
    }
    if (!payload.account_name || !payload.username || !payload.account_id || !payload.access_token) {
      alert('請填寫完整資訊')
      return
    }
    const res = await authed(`/api/instagram/accounts${mode === 'edit' && id ? `/${id}` : ''}`, {
      method: mode === 'create' ? 'POST' : 'PUT',
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
  }

  const saveScheduler = async (mode: 'create' | 'edit', id?: number) => {
    const payload = {
      name: form.name || '',
      account_id: form.account_id || null,
      template_id: form.template_id || null,
      trigger_type: form.trigger_type || 'manual',
      trigger_count: form.trigger_type === 'count' ? form.trigger_count || null : null,
      trigger_time: form.trigger_type === 'time' ? form.trigger_time || null : null,
      school_id: form.school_id || null,
      filter_school_only: !!form.filter_school_only,
      filter_exclude_media: !!form.filter_exclude_media,
      filter_min_length: form.filter_min_length || 10,
    }
    if (!payload.name || !payload.account_id || !payload.template_id) {
      alert('請填寫排程名稱並選擇帳號和模板')
      return
    }
    const res = await authed(`/api/instagram/schedulers${mode === 'edit' && id ? `/${id}` : ''}`, {
      method: mode === 'create' ? 'POST' : 'PUT',
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
  }

  const deleteEntity = async (type: ModalType, id: number) => {
    const target = type === 'account' ? 'accounts' : type === 'template' ? 'templates' : 'schedulers'
    const res = await authed(`/api/instagram/${target}/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
  }

  // -------------------------------------------
  // Tabs
  // -------------------------------------------

  const OverviewTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Instagram 帳號"
          desc="已連接的帳號"
          icon={Instagram}
          value={stats?.accounts.active || 0}
          subValue={`共 ${stats?.accounts.total || 0} 個帳號`}
          onClick={() => setActiveTab('accounts')}
        />
        <StatCard
          title="已發布貼文"
          desc="成功發送的貼文"
          icon={Send}
          value={stats?.posts.total_published || 0}
          subValue={`7天內: ${stats?.posts.recent_7days || 0}`}
          onClick={() => setActiveTab('posts')}
        />
        <StatCard
          title="待處理佇列"
          desc="等待發送的貼文"
          icon={Hash}
          value={stats?.queue.pending || 0}
          subValue="等待發送"
          onClick={() => setActiveTab('posts')}
        />
        <StatCard
          title="可用模板"
          desc="設計模板數量"
          icon={ImageIcon}
          value={stats?.templates.total || 0}
          subValue="設計模板"
          onClick={() => setActiveTab('templates')}
        />
      </div>

      <SectionCard title="快速開始" icon={CheckCircle}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'account' } })} className="p-4 border border-border rounded-xl hover:bg-surface-hover transition-colors text-left group">
            <Instagram className="w-8 h-8 text-pink-500 mb-3 group-hover:scale-110 transition-transform" />
            <div className="font-medium dual-text">連接 Instagram</div>
            <div className="text-xs text-muted mt-1">添加您的 Instagram 商業帳號</div>
          </button>
          <button onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'template' } })} className="p-4 border border-border rounded-xl hover:bg-surface-hover transition-colors text-left group">
            <Palette className="w-8 h-8 text-purple-500 mb-3 group-hover:scale-110 transition-transform" />
            <div className="font-medium dual-text">設計模板</div>
            <div className="text-xs text-muted mt-1">創建美觀的貼文模板</div>
          </button>
          <button onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'scheduler' } })} className="p-4 border border-border rounded-xl hover:bg-surface-hover transition-colors text-left group">
            <Calendar className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
            <div className="font-medium dual-text">設定排程</div>
            <div className="text-xs text-muted mt-1">自動發布貼文到 Instagram</div>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="系統狀態">
        <div className="grid gap-4">
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-success-text" />
              <span className="text-sm dual-text">Instagram 整合服務</span>
            </div>
            <Pill tone={error ? 'warn' : 'success'}>{error ? '部分功能可用' : '運行正常'}</Pill>
          </div>
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <Hash className="w-5 h-5 text-primary" />
              <span className="text-sm dual-text">API 連接狀態</span>
            </div>
            <Pill tone="info">已連接</Pill>
          </div>
        </div>
      </SectionCard>
    </div>
  )

  const AccountsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium dual-text">Instagram 帳號管理</h3>
          <p className="text-sm text-muted">管理連接的 Instagram 商業帳號</p>
        </div>
        {['dev_admin', 'campus_admin'].includes(role) && (
          <button className="btn-primary flex items-center gap-2" onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'account' } })}>
            <Plus className="w-4 h-4" /> 連接帳號
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {accounts.length === 0 ? (
          <EmptyState
            icon={Instagram}
            title="尚未連接 Instagram 帳號"
            desc="連接您的 Instagram 商業帳號來開始自動發布貼文"
            action={<button className="btn-primary" onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'account' } })}>立即連接</button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((a) => (
              <div key={a.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                      <Instagram className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium dual-text">{a.account_name}</h4>
                      <p className="text-sm text-muted">@{a.username}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {a.school_name ? <span className="text-xs text-muted">{a.school_name}</span> : null}
                        {a.has_token && <Pill tone="success">已驗證</Pill>}
                        {a.is_active && <Pill tone="info">活躍</Pill>}
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <button onClick={() => setMenuId(menuId === a.id ? null : a.id)} className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuId === a.id && (
                      <RowMenu
                        onView={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'view', type: 'account', id: a.id } })}
                        onEdit={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'edit', type: 'account', id: a.id } })}
                        onDelete={async () => {
                          if (!confirm('確定要刪除嗎？此操作無法復原。')) return
                          try {
                            await deleteEntity('account', a.id)
                            await loadData()
                          } catch (e: any) {
                            alert(e?.message || '刪除失敗')
                          }
                        }}
                        onClose={() => setMenuId(null)}
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

  const TemplatesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium dual-text">貼文模板管理</h3>
          <p className="text-sm text-muted">設計和管理 Instagram 貼文的視覺模板</p>
        </div>
        {['dev_admin', 'campus_admin'].includes(role) && (
          <button className="btn-primary flex items-center gap-2" onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'template' } })}>
            <Plus className="w-4 h-4" /> 創建模板
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {templates.length === 0 ? (
          <EmptyState
            icon={Palette}
            title="尚無貼文模板"
            desc="創建美觀的模板來自動生成 Instagram 貼文"
            action={<button className="btn-primary" onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'template' } })}>創建第一個模板</button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {templates.map((t) => (
              <div key={t.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center border border-border text-white font-bold" style={{ backgroundColor: t.background_color, color: t.text_color }}>
                      Aa
                    </div>
                    <div>
                      <h4 className="font-medium dual-text">{t.name}</h4>
                      <p className="text-sm text-muted line-clamp-1">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {t.school_name ? <span className="text-xs text-muted">{t.school_name}</span> : null}
                        {t.is_default && <Pill tone="info">預設</Pill>}
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <button onClick={() => setMenuId(menuId === t.id ? null : t.id)} className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuId === t.id && (
                      <RowMenu
                        onView={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'view', type: 'template', id: t.id } })}
                        onEdit={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'edit', type: 'template', id: t.id } })}
                        onDelete={async () => {
                          if (!confirm('確定要刪除嗎？此操作無法復原。')) return
                          try {
                            await deleteEntity('template', t.id)
                            await loadData()
                          } catch (e: any) {
                            alert(e?.message || '刪除失敗')
                          }
                        }}
                        onClose={() => setMenuId(null)}
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
          <h3 className="text-lg font-medium dual-text">自動發布排程</h3>
          <p className="text-sm text-muted">設定自動發送 Instagram 貼文的規則</p>
        </div>
        {['dev_admin', 'campus_admin'].includes(role) && (
          <button className="btn-primary flex items-center gap-2" onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'scheduler' } })}>
            <Plus className="w-4 h-4" /> 新增排程
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        {schedulers.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="尚無自動排程"
            desc="設定排程來自動發布貼文到 Instagram"
            action={<button className="btn-primary" onClick={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'create', type: 'scheduler' } })}>創建第一個排程</button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {schedulers.map((s) => (
              <div key={s.id} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-hover border border-border flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium dual-text">{s.name}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <span>{s.school_name}</span>
                        <span>•</span>
                        <span>
                          {s.trigger_type === 'count' ? `每 ${s.trigger_count} 篇` : s.trigger_type === 'time' ? `定時 ${s.trigger_time}` : '手動'}
                        </span>
                        {s.is_active && (
                          <>
                            <span>•</span>
                            <span className="text-success-text">運行中</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1">{s.account_name} → {s.template_name}</div>
                    </div>
                  </div>

                  <div className="relative">
                    <button onClick={() => setMenuId(menuId === s.id ? null : s.id)} className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuId === s.id && (
                      <RowMenu
                        onView={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'view', type: 'scheduler', id: s.id } })}
                        onEdit={() => dispatchModal({ type: 'OPEN', payload: { open: true, kind: 'edit', type: 'scheduler', id: s.id } })}
                        onDelete={async () => {
                          if (!confirm('確定要刪除嗎？此操作無法復原。')) return
                          try {
                            await deleteEntity('scheduler', s.id)
                            await loadData()
                          } catch (e: any) {
                            alert(e?.message || '刪除失敗')
                          }
                        }}
                        onClose={() => setMenuId(null)}
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
    const [posts, setPosts] = useState<InstagramPost[]>([])
    const [postsLoading, setPostsLoading] = useState(false)
    const [page, setPage] = useState(1)
    const pageSize = 20

    const totalPages = Math.max(1, Math.ceil(posts.length / pageSize))
    const paged = useMemo(() => posts.slice((page - 1) * pageSize, page * pageSize), [posts, page])

    useEffect(() => {
      let abort = new AbortController()
      ;(async () => {
        try {
          setPostsLoading(true)
          const r = await authed('/api/instagram/posts', { signal: abort.signal as any })
          if (r.ok) {
            const d = await r.json()
            setPosts(d.data || [])
          }
        } catch (e) {
          // noop
        } finally {
          setPostsLoading(false)
        }
      })()
      return () => abort.abort()
    }, [])

    const color = (status: string) =>
      status === 'published'
        ? 'text-success-text bg-success-bg'
        : status === 'pending'
        ? 'text-orange-600 bg-orange-100 dark:bg-orange-900/30'
        : status === 'failed'
        ? 'text-red-600 bg-red-100 dark:bg-red-900/30'
        : 'text-muted bg-surface-hover'

    const label = (status: string) => (status === 'published' ? '已發布' : status === 'pending' ? '處理中' : status === 'generated' ? '已生成' : status === 'failed' ? '失敗' : status)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium dual-text">發布記錄</h3>
            <p className="text-sm text-muted">查看 Instagram 貼文的發送狀態和歷史記錄</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          {postsLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted">載入發布記錄中...</p>
            </div>
          ) : posts.length === 0 ? (
            <EmptyState icon={Send} title="尚無發布記錄" desc="當排程開始運作時，這裡會顯示發送記錄" />
          ) : (
            <>
              <div className="divide-y divide-border">
                {paged.map((post, idx) => (
                  <div key={post.id || post.post_id || idx} className="p-4 sm:p-6 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-surface-hover border border-border flex items-center justify-center">
                          <Send className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium dual-text">#{post.post_id || 'N/A'}</h4>
                            <span className={`text-xs px-2 py-1 rounded-full ${color(post.status)}`}>{label(post.status)}</span>
                          </div>
                          <div className="text-sm text-muted mb-2">
                            {post.account_name} • {post.template_name}
                          </div>
                          {post.caption ? <div className="text-sm dual-text mb-2 line-clamp-2">{post.caption}</div> : null}
                          <div className="flex items-center gap-4 text-xs text-muted">
                            {post.scheduled_at ? <span>排程: {formatLocalMinute(post.scheduled_at)}</span> : null}
                            {post.published_at ? <span>發布: {formatLocalMinute(post.published_at)}</span> : null}
                            <span>建立: {formatLocalMinute(post.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      {post.instagram_permalink ? (
                        <a href={post.instagram_permalink} target="_blank" rel="noopener noreferrer" className="p-2 text-muted hover:text-fg hover:bg-surface-hover rounded-lg transition-colors" title="在 Instagram 查看">
                          <Eye className="w-4 h-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-4 border-t border-border">
                <span className="text-xs text-muted">共 {posts.length} 筆，{page}/{totalPages}</span>
                <div className="flex items-center gap-2">
                  <button className="btn-ghost text-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    上一頁
                  </button>
                  <button className="btn-ghost text-sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    下一頁
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------
  // Modal content
  // -------------------------------------------

  const closeModal = () => {
    dispatchModal({ type: 'CLOSE' })
    setForm({})
    dispatchWizard({ type: 'RESET' })
  }

  const TemplateWizard = () => (
    <div className="space-y-6">
      {wizard.step === 'style' && (
        <div className="space-y-6">
          <div className="text-center">
            <Palette className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold dual-text mb-2">選擇模板風格</h3>
            <p className="text-sm text-muted">選擇一個預設風格，然後您可以進一步自訂</p>
          </div>
          <div className="grid gap-4">
            {Object.entries(DEFAULT_TEMPLATE_CONFIGS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => {
                  dispatchWizard({ type: 'SET_STYLE', style: key as keyof typeof DEFAULT_TEMPLATE_CONFIGS })
                  setForm({ ...config })
                  generatePreview(config)
                }}
                className={`p-4 border-2 rounded-xl text-left transition-all ${wizard.selectedStyle === key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-border flex items-center justify-center text-white font-bold" style={{ backgroundColor: (config as any).background_color, color: (config as any).text_color }}>
                    Aa
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium dual-text">{(config as any).name}</h4>
                    <p className="text-sm text-muted mt-1">{(config as any).description}</p>
                  </div>
                  {wizard.selectedStyle === key && <CheckCircle className="w-5 h-5 text-primary" />}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-between pt-4">
            <button onClick={closeModal} className="btn-ghost">
              取消
            </button>
            <button onClick={() => dispatchWizard({ type: 'NEXT' })} disabled={!wizard.selectedStyle} className="btn-primary">
              下一步：自訂設定
            </button>
          </div>
        </div>
      )}

      {wizard.step === 'customize' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => dispatchWizard({ type: 'PREV' })} className="text-muted hover:text-fg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-semibold dual-text">自訂模板設定</h3>
              <p className="text-sm text-muted">調整模板的基本資訊和顏色</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium dual-text mb-2">模板名稱</label>
                <input id="template_name" type="text" value={form.name || ''} onChange={(e) => onField('name', e.target.value)} className="form-control w-full" placeholder={wizard.selectedStyle ? (DEFAULT_TEMPLATE_CONFIGS as any)[wizard.selectedStyle].name : ''} />
              </div>
              <div>
                <label className="block text-sm font-medium dual-text mb-2">描述</label>
                <textarea id="template_description" value={form.description || ''} onChange={(e) => onField('description', e.target.value)} className="form-control w-full" rows={2} placeholder={wizard.selectedStyle ? (DEFAULT_TEMPLATE_CONFIGS as any)[wizard.selectedStyle].description : ''} />
              </div>
              <div>
                <label className="block text-sm font-medium dual-text mb-2">適用學校</label>
                <select id="template_school_id" value={form.school_id || ''} onChange={(e) => onField('school_id', e.target.value ? Number(e.target.value) : null)} className="form-control w-full">
                  <option value="">跨校通用</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium dual-text">顏色主題</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">背景色</label>
                    <input id="template_background_color" type="color" value={form.background_color || '#ffffff'} onChange={(e) => onField('background_color', e.target.value)} className="w-full h-10 rounded border border-border" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">文字色</label>
                    <input id="template_text_color" type="color" value={form.text_color || '#333333'} onChange={(e) => onField('text_color', e.target.value)} className="w-full h-10 rounded border border-border" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">強調色</label>
                    <input id="template_accent_color" type="color" value={form.accent_color || '#3b82f6'} onChange={(e) => onField('accent_color', e.target.value)} className="w-full h-10 rounded border border-border" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-hover rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium dual-text">即時預覽</h4>
                <button onClick={() => generatePreview(form)} disabled={!!wizard.isGenerating} className="text-xs btn-secondary px-3 py-1">
                  {wizard.isGenerating ? '生成中...' : '更新預覽'}
                </button>
              </div>
              <div className="aspect-square bg-surface rounded-lg border border-border flex items-center justify-center">
                {wizard.isGenerating ? (
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                    <span className="text-xs text-muted">生成預覽中...</span>
                  </div>
                ) : wizard.previewUrl ? (
                  <img src={wizard.previewUrl} alt="預覽" className="max-w-full max-h-full rounded" />
                ) : (
                  <div className="text-center text-muted">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span className="text-xs">點擊「更新預覽」查看效果</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={closeModal} className="btn-ghost">
              取消
            </button>
            <div className="space-x-3">
              <button onClick={() => dispatchWizard({ type: 'PREV' })} className="btn-ghost">
                上一步
              </button>
              <button onClick={saveTemplate} className="btn-primary">
                創建模板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const AccountForm = (mode: 'create' | 'edit' | 'view', id?: number) => {
    const acc = accounts.find((x) => x.id === id)
    if (mode === 'view')
      return (
        <div className="bg-surface-hover rounded-xl p-4 border border-border">
          <pre className="text-sm text-muted overflow-auto">{JSON.stringify(acc, null, 2)}</pre>
        </div>
      )

    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium dual-text mb-2">顯示名稱</label>
            <input id="account_name" type="text" value={form.account_name || ''} onChange={(e) => onField('account_name', e.target.value)} className="form-control w-full" placeholder="我的學校官方帳號" />
          </div>
          <div>
            <label className="block text-sm font-medium dual-text mb-2">Instagram 用戶名</label>
            <input id="account_username" type="text" value={form.username || ''} onChange={(e) => onField('username', e.target.value)} className="form-control w-full" placeholder="myschool_official (不含 @)" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium dual-text mb-2">適用學校</label>
            <select id="account_school_id" value={form.school_id || ''} onChange={(e) => onField('school_id', e.target.value ? Number(e.target.value) : null)} className="form-control w-full">
              <option value="">跨校通用</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium dual-text mb-2">商業帳號 ID</label>
            <input id="account_id" type="text" value={form.account_id || ''} onChange={(e) => onField('account_id', e.target.value)} className="form-control w-full" placeholder="17841400000000000" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium dual-text mb-2">Access Token</label>
          <input id="account_access_token" type="password" value={form.access_token || ''} onChange={(e) => onField('access_token', e.target.value)} className="form-control w-full" placeholder="請輸入 Instagram Basic Display API Token" />
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">設定說明：</p>
              <ul className="text-xs space-y-1 text-blue-700 dark:text-blue-300">
                <li>• 需要 Instagram 商業帳號或創作者帳號</li>
                <li>• 請先在 Facebook 開發者平台設定應用程式</li>
                <li>• Access Token 需要具備發布權限</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button onClick={closeModal} className="btn-ghost">
            取消
          </button>
          <button
            onClick={async () => {
              try {
                await saveAccount(mode, id)
                await loadData()
                closeModal()
              } catch (e: any) {
                alert(e?.message || '儲存失敗')
              }
            }}
            className="btn-primary"
          >
            {mode === 'create' ? '新增帳號' : '儲存變更'}
          </button>
        </div>
      </div>
    )
  }

  const SchedulerForm = (mode: 'create' | 'edit' | 'view', id?: number) => {
    const sch = schedulers.find((x) => x.id === id)
    if (mode === 'view')
      return (
        <div className="bg-surface-hover rounded-xl p-4 border border-border">
          <pre className="text-sm text-muted overflow-auto">{JSON.stringify(sch, null, 2)}</pre>
        </div>
      )

    return (
      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium dual-text mb-2">排程名稱</label>
          <input id="scheduler_name" type="text" value={form.name || ''} onChange={(e) => onField('name', e.target.value)} className="form-control w-full" placeholder="每日貼文自動發布" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium dual-text mb-2">Instagram 帳號</label>
            <select id="scheduler_account_id" value={form.account_id || ''} onChange={(e) => onField('account_id', Number(e.target.value))} className="form-control w-full">
              <option value="">選擇帳號</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium dual-text mb-2">使用模板</label>
            <select id="scheduler_template_id" value={form.template_id || ''} onChange={(e) => onField('template_id', Number(e.target.value))} className="form-control w-full">
              <option value="">選擇模板</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium dual-text mb-2">適用學校</label>
            <select id="scheduler_school_id" value={form.school_id || ''} onChange={(e) => onField('school_id', e.target.value ? Number(e.target.value) : null)} className="form-control w-full">
              <option value="">跨校</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium dual-text mb-2">觸發方式</label>
            <select id="scheduler_trigger_type" value={form.trigger_type || 'manual'} onChange={(e) => onField('trigger_type', e.target.value)} className="form-control w-full">
              <option value="manual">手動觸發</option>
              <option value="count">累積篇數</option>
              <option value="time">定時發送</option>
            </select>
          </div>
          {form.trigger_type === 'count' && (
            <div>
              <label className="block text-sm font-medium dual-text mb-2">累積篇數</label>
              <input id="scheduler_trigger_count" type="number" value={form.trigger_count || ''} onChange={(e) => onField('trigger_count', Number(e.target.value))} className="form-control w-full" placeholder="5" min={1} />
            </div>
          )}
          {form.trigger_type === 'time' && (
            <div>
              <label className="block text-sm font-medium dual-text mb-2">發送時間</label>
              <input id="scheduler_trigger_time" type="time" value={form.trigger_time || ''} onChange={(e) => onField('trigger_time', e.target.value)} className="form-control w-full" />
            </div>
          )}
        </div>
        <div className="bg-surface-hover rounded-xl p-4 border border-border">
          <h4 className="text-sm font-medium dual-text mb-3">篩選條件</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input id="scheduler_filter_school_only" type="checkbox" checked={!!form.filter_school_only} onChange={(e) => onField('filter_school_only', e.target.checked)} className="rounded" />
              <span className="dual-text">只發送本校貼文</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input id="scheduler_filter_exclude_media" type="checkbox" checked={!!form.filter_exclude_media} onChange={(e) => onField('filter_exclude_media', e.target.checked)} className="rounded" />
              <span className="dual-text">排除包含媒體的貼文</span>
            </label>
            <div>
              <label className="block text-xs text-muted mb-1">最少字數</label>
              <input id="scheduler_filter_min_length" type="number" value={form.filter_min_length || 10} onChange={(e) => onField('filter_min_length', Number(e.target.value))} className="form-control w-full" min={1} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button onClick={closeModal} className="btn-ghost">
            取消
          </button>
          <button
            onClick={async () => {
              try {
                await saveScheduler(mode, id)
                await loadData()
                closeModal()
              } catch (e: any) {
                alert(e?.message || '儲存失敗')
              }
            }}
            className="btn-primary"
          >
            {mode === 'create' ? '創建排程' : '儲存變更'}
          </button>
        </div>
      </div>
    )
  }

  const Modal = () => {
    if (!modal) return null
    const isCreate = modal.kind === 'create'
    const isEdit = modal.kind === 'edit'
    const isView = modal.kind === 'view'

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={(e) => e.key === 'Escape' && closeModal()}>
        <div className="absolute inset-0 bg-black/30" onClick={closeModal} />
        <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-2xl border border-border" role="dialog" aria-modal="true">
          <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold dual-text">
              {modal.type === 'template' && isCreate ? '創建模板' : modal.type === 'account' ? 'Instagram 帳號' : modal.type === 'scheduler' ? '排程設定' : '管理'}
            </h2>
            <button onClick={closeModal} className="text-muted hover:text-fg" aria-label="關閉">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            {modal.type === 'template' && isCreate && <TemplateWizard />}
            {modal.type === 'account' && (isCreate || isEdit || isView) && AccountForm(isCreate ? 'create' : isEdit ? 'edit' : 'view', modal.id)}
            {modal.type === 'scheduler' && (isCreate || isEdit || isView) && SchedulerForm(isCreate ? 'create' : isEdit ? 'edit' : 'view', modal.id)}
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------
  // Guards and overall frame
  // -------------------------------------------

  if (!canUse) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/instagram" />
        <MobileBottomNav />
        <main className="mx-auto max-w-xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
            <Instagram className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
            <h1 className="text-lg font-semibold dual-text mb-2">需要管理員權限</h1>
            <p className="text-sm text-muted">此功能僅限管理組使用</p>
          </div>
        </main>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="min-h-screen">
        <NavBar pathname="/admin/instagram" />
        <MobileBottomNav />
        <main className="mx-auto max-w-xl px-4 pt-20 sm:pt-24 md:pt-28 pb-24">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Instagram className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-lg font-semibold dual-text mb-2">Instagram 整合管理</h1>
            <p className="text-sm text-muted mb-4">此功能建議在電腦上使用以獲得最佳體驗</p>
            <div className="text-xs text-muted">請使用電腦或大螢幕裝置開啟</div>
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
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => window.history.back()} className="flex items-center gap-2 text-muted hover:text-fg transition-colors">
              <ArrowLeft className="w-4 h-4" /> 返回後台
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">Instagram 整合管理</h1>
              <p className="text-sm text-muted">自動將論壇貼文轉為精美圖片發布到 Instagram</p>
            </div>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-soft mb-6">
          <div className="border-b border-border">
            <nav className="flex space-x-8 px-6" aria-label="標籤">
              {[
                { id: 'overview', label: '總覽', icon: Eye },
                { id: 'accounts', label: 'Instagram 帳號', icon: Instagram },
                { id: 'templates', label: '貼文模板', icon: Palette },
                { id: 'schedulers', label: '自動排程', icon: Calendar },
                { id: 'posts', label: '發布記錄', icon: Hash },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === (tab.id as any) ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg hover:border-border'}`}
                >
                  <tab.icon className="w-4 h-4" /> {tab.label}
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
              </>
            )}
          </div>
        </div>

        <Modal />
      </main>

      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}
    </div>
  )
}
