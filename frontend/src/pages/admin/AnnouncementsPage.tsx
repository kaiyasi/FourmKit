import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { Megaphone, Send, RefreshCw, Building2 } from 'lucide-react'
import { getRole, getSchoolId } from '@/utils/auth'
import AdminCard from '@/components/admin/AdminCard'

type Ann = { id?: number; ts?: number; title: string; description: string }
type School = { id: number; name: string; slug: string }

export default function AnnouncementsPage(){
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [items, setItems] = useState<Ann[]>([])
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState('')
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null)
  const [loadingSchools, setLoadingSchools] = useState(false)
  
  const role = getRole()
  const userSchoolId = getSchoolId()

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/announcements', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }, cache: 'no-store' })
      const j = await r.json().catch(()=>({}))
      setItems(Array.isArray(j?.items) ? j.items : [])
    } finally{ setLoading(false) }
  }

  // 載入學校列表（僅 dev_admin 需要）
  const loadSchools = async () => {
    if (role !== 'dev_admin') return
    
    setLoadingSchools(true)
    try {
      const response = await fetch('/api/schools', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.ok && Array.isArray(data.schools)) {
          setSchools(data.schools)
        }
      }
    } catch (error) {
      console.error('Failed to load schools:', error)
    } finally {
      setLoadingSchools(false)
    }
  }

  useEffect(() => { 
    load() 
    loadSchools()
  }, [])

  const submit = async () => {
    if (!title.trim() || !message.trim()) { setInfo('請輸入標題與內容'); return }
    
    // 根據角色確定 school_id
    let schoolId: number | null = null
    if (role === 'campus_admin') {
      schoolId = userSchoolId
    } else if (role === 'cross_admin') {
      schoolId = null // 全平台公告
    } else if (role === 'dev_admin') {
      schoolId = selectedSchoolId // 可以選擇學校或全平台
    }
    
    setSending(true); setInfo('')
    try {
      const r = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')||''}` },
        body: JSON.stringify({ 
          title: title.trim(), 
          content: message.trim(),
          school_id: schoolId
        })
      })
      const j = await r.json().catch(()=>({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || '發布失敗')
      setInfo('已發布公告並送達 Webhook/使用者訂閱')
      setTitle(''); setMessage('')
      load()
    } catch (e:any) {
      setInfo(e?.message || '發布失敗')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/announcements" />
      <MobileBottomNav />
      <main className="mx-auto max-w-5xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center gap-3 mb-2">
            <Megaphone className="w-5 h-5" />
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">發布公告</h1>
          </div>
          <div className="grid gap-3">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="公告標題" className="form-control" />
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={6} placeholder="公告內容（支援純文字；會送達已開啟公告推送的用戶 Webhook）" className="form-control" />
            
            {/* 學校選擇（僅 dev_admin 顯示） */}
            {role === 'dev_admin' && (
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-muted" />
                <select 
                  value={selectedSchoolId || ''} 
                  onChange={e => setSelectedSchoolId(e.target.value ? parseInt(e.target.value) : null)}
                  className="form-control flex-1"
                >
                  <option value="">全平台公告</option>
                  {loadingSchools ? (
                    <option disabled>載入學校中...</option>
                  ) : (
                    schools.map(school => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
            
            {/* 角色說明 */}
            <div className="text-sm text-muted">
              {role === 'campus_admin' && '將發布給您學校的所有用戶'}
              {role === 'cross_admin' && '將發布給全平台的所有用戶'}
              {role === 'dev_admin' && (selectedSchoolId ? `將發布給選定學校的所有用戶` : '將發布給全平台的所有用戶')}
            </div>
            
            <div className="flex items-center gap-3">
              <button onClick={submit} disabled={sending} className="btn-primary px-4 py-2 flex items-center gap-2">
                <Send className={`w-4 h-4 ${sending?'animate-pulse':''}`} /> 發布
              </button>
              {info && <div className="text-sm text-muted">{info}</div>}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold dual-text">最近公告</h2>
            <button onClick={load} className="btn-secondary px-3 py-2 flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4"/> 重新載入</button>
          </div>
          {loading ? (
            <div className="text-muted">載入中...</div>
          ) : items.length === 0 ? (
            <div className="text-muted">尚無公告</div>
          ) : (
            <div className="space-y-3">
              {items.map((a, i) => (
                <AdminCard
                  key={i}
                  title={<div className="font-medium text-fg">{a.title}</div>}
                  content={<div className="text-sm text-muted whitespace-pre-wrap">{a.description}</div>}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

