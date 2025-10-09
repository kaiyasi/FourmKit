import React, { useEffect, useMemo, useRef, useState } from 'react'
import UploadArea from '@/components/UploadArea'
import { postFormData, postJSON, HttpError } from '@/lib/http'
import { validatePost } from '@/schemas/post'
import { canPublishAnnouncement, getRole } from '@/utils/auth'

type School = { id: number; slug: string; name: string }

export default function HomeComposer({ token }: { token: string }) {
  const role = getRole()
  const [schools, setSchools] = useState<School[]>([])
  const mySchoolId = (() => { try { const v = localStorage.getItem('school_id'); return v ? Number(v) : null } catch { return null } })()
  const defaultSlug = (() => { try { return localStorage.getItem('school_slug') || localStorage.getItem('current_school_slug') || localStorage.getItem('selected_school_slug') || '' } catch { return '' } })()
  const [targetSlug, setTargetSlug] = useState<string | ''>(defaultSlug)

  const [mode, setMode] = useState<'post'|'announcement'|'ad'>('post')
  const [announcementType, setAnnouncementType] = useState<'platform'|'cross'|'school'>('school')
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [lastSubmitTime, setLastSubmitTime] = useState(0)
  const maxChars = 800

  // autosize textarea
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const autosize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 20 // approx
    const min = 3 * lineHeight
    const max = 10 * lineHeight
    el.style.height = Math.max(min, Math.min(max, el.scrollHeight)) + 'px'
  }
  useEffect(() => { autosize() }, [content])

  // load schools
  useEffect(() => { (async() => { try { const r = await fetch('/api/schools', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); if (Array.isArray(j?.items)) setSchools(j.items) } catch {} })() }, [])
  useEffect(() => {
    try {
      if (schools.length === 0) return
      if (targetSlug) return
      const mySlug = mySchoolId ? (schools.find(s=>s.id===mySchoolId)?.slug || '') : ''
      setTargetSlug(mySlug || '')
    } catch {}
  }, [schools])

  const canAd = role === 'dev_admin'
  const canAnn = !!token && canPublishAnnouncement()
  const isAdmin = ['dev_admin','campus_admin','cross_admin'].includes(role || '')

  const isAnnouncement = mode === 'announcement'
  const isAd = mode === 'ad'

  // Enforce role-based constraints when switching modes or changing scope
  useEffect(() => {
    if (!isAdmin) {
      if (mode !== 'post') setMode('post')
      return
    }
    if (role === 'campus_admin' && isAnnouncement) {
      // lock to school
      const mySlug = mySchoolId ? (schools.find(s=>s.id===mySchoolId)?.slug || '') : ''
      if (mySlug && targetSlug !== mySlug) setTargetSlug(mySlug)
      if (announcementType !== 'school') setAnnouncementType('school')
    }
    if (role === 'cross_admin' && isAnnouncement) {
      // lock to cross
      if (targetSlug !== '') setTargetSlug('')
      if (announcementType !== 'cross') setAnnouncementType('cross')
    }
    if (role === 'dev_admin' && isAnnouncement) {
      // sync type with scope: '' => cross, else school (platform omitted per spec)
      const desired = targetSlug ? 'school' : 'cross'
      if (announcementType !== desired) setAnnouncementType(desired as any)
    }
    if (isAd && !canAd) setMode('post')
  }, [mode, isAnnouncement, isAd, role, targetSlug, schools, mySchoolId, isAdmin, canAd, announcementType])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)

    // 防止重複提交 - 檢查狀態和時間戳
    const now = Date.now();
    if (busy) {
      console.log('[HomeComposer] Already submitting, ignoring duplicate request');
      return;
    }
    if (now - lastSubmitTime < 1000) { // 1秒內不允許重複提交
      console.log('[HomeComposer] Too fast submit, ignoring duplicate request');
      return;
    }

    setLastSubmitTime(now);

    if (!content.trim() && files.length === 0) { setMsg('請先輸入內容或上傳附件'); return }
    setBusy(true)
    try {
      if (files.length > 0) {
        const fd = new FormData()
        fd.set('content', content.trim())
        if (targetSlug) fd.set('school_slug', targetSlug)
        if (isAnnouncement) { fd.set('is_announcement','true'); fd.set('announcement_type', announcementType) }
        if (isAd && canAd) fd.set('is_advertisement','true')
        files.forEach(f => fd.append('files', f))
        const result = await postFormData('/api/posts/with-media', fd)
        validatePost(result)
      } else {
        // reply-as-post 語法處理
        let replyToId: number | null = null
        let textBody = content.trim()
        const m = textBody.match(/^#(\d+)\s*(.*)$/s)
        if (m) { replyToId = parseInt(m[1], 10); textBody = (m[2] || '').trim() }
        const payload: any = { content: textBody }
        if (targetSlug) payload.school_slug = targetSlug
        if (isAnnouncement) { payload.is_announcement = true; payload.announcement_type = announcementType }
        if (isAd && canAd) payload.is_advertisement = true
        if (replyToId) payload.reply_to_id = replyToId
        const result = await postJSON('/api/posts', payload)
        validatePost(result)
      }
      setMsg('已送出，等待審核')
      setContent(''); setFiles([])
    } catch (e:any) {
      setMsg(e instanceof HttpError ? e.message : '送出失敗，請稍後再試')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Top controls: scope select + tabs (same row) */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="sr-only">發佈範圍</label>
        <select
          className="!w-auto select-compact text-sm border border-border bg-transparent focus:outline-none focus:ring-2 focus:ring-primary"
          value={targetSlug}
          onChange={(e)=> setTargetSlug(e.target.value as any)}
          disabled={mode==='announcement' && (role==='campus_admin' || role==='cross_admin')}
        >
          <option value="">跨校（全部）</option>
          {schools.map(s => (<option key={s.id} value={s.slug}>{s.name}</option>))}
        </select>

        {isAdmin && (
          <div className="inline-flex h-8 rounded-full overflow-hidden border border-border bg-transparent">
            <button
              type="button"
              onClick={()=>setMode('post')}
              className={`h-8 px-4 text-sm inline-flex items-center transition ${mode==='post' ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:bg-surface-hover text-fg'}`}
            >一般</button>
            {canAnn && (
              <button
                type="button"
                onClick={()=>setMode('announcement')}
                className={`h-8 px-4 text-sm inline-flex items-center transition ${mode==='announcement' ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:bg-surface-hover text-fg'}`}
              >公告</button>
            )}
            {canAd && (
              <button
                type="button"
                onClick={()=>setMode('ad')}
                className={`h-8 px-4 text-sm inline-flex items-center transition ${mode==='ad' ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:bg-surface-hover text-fg'}`}
              >廣告</button>
            )}
          </div>
        )}
      </div>
      {isAnnouncement && isAdmin && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">公告範圍</label>
          <select
            className="!w-auto select-compact text-sm border border-border bg-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            value={announcementType}
            onChange={(e)=>setAnnouncementType(e.target.value as any)}
            disabled={role==='campus_admin' || role==='cross_admin' || role==='dev_admin'}
          >
            {role==='dev_admin' && (<>
              <option value="platform">全平台</option>
              <option value="cross">跨校</option>
            </>)}
            <option value="school">學校</option>
          </select>
        </div>
      )}

      {/* Textarea with autosize + counter */}
      <div className="relative">
        <textarea
          ref={taRef}
          value={content}
          onChange={(e)=> setContent(e.target.value.slice(0, maxChars))}
          placeholder="匿名分享你的想法..."
          className="w-full bg-transparent text-fg border border-border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary min-h-[60px]"
        />
        <div className="absolute right-2 bottom-2 text-xs text-muted">{content.length}/{maxChars}</div>
      </div>

      {/* Attachments 2x2, max 4, hint bottom-right */}
      <div className="relative">
        <UploadArea value={files} onChange={setFiles} maxCount={4} />
        <div className="text-xs text-muted text-right mt-1">{files.length}/4 張，單檔 ≤ 8MB</div>
      </div>

      {/* Submit bar: desktop right-aligned inline; mobile fixed bottom */}
      <div className="hidden sm:flex items-center justify-end">
        <button
          type="submit"
          disabled={busy}
          className="btn-primary disabled:opacity-50"
          style={{ touchAction: 'manipulation' }}
        >
          {busy ? '送出中…' : '發佈'}
        </button>
      </div>
      <div className="sm:hidden fixed left-0 right-0 bottom-0 z-40" style={{ paddingBottom: 'var(--fk-bottomnav-offset, 72px)' }}>
        <div className="mx-4 mb-3 rounded-xl border border-border bg-surface shadow-soft p-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full btn-primary disabled:opacity-50"
            style={{ touchAction: 'manipulation' }}
          >
            {busy ? '送出中…' : '發佈'}
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-warning">{msg}</div>}
    </form>
  )
}
