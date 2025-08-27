import React, { useEffect, useState } from "react";
import UploadArea from "./UploadArea";
import { postFormData, HttpError } from "../lib/http";
import { validatePost } from "../schemas/post";
import AnonymousAccountDisplay from "./AnonymousAccountDisplay";

export default function PostComposer({ token }: { token: string }) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [schools, setSchools] = useState<{ id:number; slug:string; name:string }[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const mySchoolId = (() => { try { const v = localStorage.getItem('school_id'); return v ? Number(v) : null } catch { return null } })()
  const defaultSlug = (() => {
    try {
      return (
        localStorage.getItem('school_slug') ||
        localStorage.getItem('current_school_slug') ||
        localStorage.getItem('selected_school_slug') ||
        ''
      )
    } catch {
      return ''
    }
  })()
  const [targetSlug, setTargetSlug] = useState<string | ''>(defaultSlug)

  // 載入學校清單，預設使用 Navbar 的選擇（localStorage）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
  }, [])

  // 監聽全域學校切換事件，隨時同步到發文選擇
  useEffect(() => {
    const onChanged = (e: any) => {
      try {
        const slug = e?.detail?.slug ?? localStorage.getItem('school_slug') ?? ''
        setTargetSlug(slug || '')
      } catch {}
    }
    window.addEventListener('fk_school_changed', onChanged as any)
    return () => window.removeEventListener('fk_school_changed', onChanged as any)
  }, [])

  // 開啟確認對話框時，若尚未選擇且有預設或清單，設置預設學校
  useEffect(() => {
    if (confirmOpen && !targetSlug) {
      if (defaultSlug) setTargetSlug(defaultSlug)
      else if (localStorage.getItem('role') === 'dev_admin' && schools.length > 0) {
        setTargetSlug(schools[0].slug)
      }
    }
  }, [confirmOpen, defaultSlug, schools, targetSlug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    
    if (!content.trim()) { 
      setMsg("請輸入內容"); 
      return; 
    }
    
    // 若具備校內身分或是 dev_admin，送出前先確認發文範圍；否則直接跨校
    if (mySchoolId || localStorage.getItem('role') === 'dev_admin') { 
      setConfirmOpen(true); 
      return 
    }
    await doSubmit('')
  }

  async function doSubmit(finalSlug: string | '') {
    setSubmitting(true)
    try {
      // 優先使用純文本API，如果有檔案則使用多媒體API
      if (files.length > 0) {
        const fd = new FormData()
        fd.set('content', content.trim())
        if (finalSlug) fd.set('school_slug', finalSlug)
        try { console.log('[PostComposer] submit with files, school_slug =', finalSlug || '(cross)') } catch {}
        files.forEach(f => fd.append('files', f))
        const result = await postFormData("/api/posts/with-media", fd)
        const validatedPost = validatePost(result)
        setMsg("已送出，等待審核")
        setContent(""); setFiles([])
        console.log('created:', validatedPost)
      } else {
        // 純文本發文
        const { postJSON } = await import('../lib/http')
        const payload: any = { content: content.trim() }
        if (finalSlug) payload.school_slug = finalSlug
        try { console.log('[PostComposer] submit text only, school_slug =', finalSlug || '(cross)') } catch {}
        
        const result = await postJSON('/api/posts', payload)
        const validatedPost = validatePost(result)
        setMsg("已送出，等待審核")
        setContent(""); setFiles([])
        console.log('created:', validatedPost)
      }
    } catch (e:any) {
      if (e instanceof HttpError) setMsg(`送出失敗：${e.message}`)
      else if (e instanceof Error) setMsg(`送出失敗：${e.message}`)
      else setMsg('送出失敗：未知錯誤')
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl mx-auto">
      {/* 確認對話框：選擇發文範圍 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setConfirmOpen(false)}></div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] sm:w-[480px] rounded-2xl border border-border bg-surface shadow-2xl p-4">
            <h3 className="font-semibold dual-text mb-2">選擇發文範圍</h3>
            <p className="text-sm text-muted mb-3">請確認要發佈到哪裡：</p>
            <div className="space-y-2 mb-3">
              {/* 如果有綁定學校，顯示我的學校選項 */}
              {mySchoolId && (
                <label className="flex items-center gap-2">
                  <input type="radio" name="scope" checked={targetSlug === (schools.find(s=>s.id===mySchoolId)?.slug || '')}
                         onChange={()=> setTargetSlug(schools.find(s=>s.id===mySchoolId)?.slug || '') } />
                  <span className="text-sm">我的學校：{schools.find(s=>s.id===mySchoolId)?.name || '（未知）'}</span>
                </label>
              )}
              {/* 如果是 dev_admin，顯示所有學校選項 */}
              {localStorage.getItem('role') === 'dev_admin' && schools.map(school => (
                <label key={school.id} className="flex items-center gap-2">
                  <input type="radio" name="scope" checked={targetSlug === school.slug}
                         onChange={()=> setTargetSlug(school.slug) } />
                  <span className="text-sm">{school.name}</span>
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" checked={targetSlug === ''}
                       onChange={()=> setTargetSlug('') } />
                <span className="text-sm">跨校（全部）</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={()=>setConfirmOpen(false)}>取消</button>
              <button type="button" className="btn-primary text-sm" onClick={()=>doSubmit(targetSlug)}>確認送出</button>
            </div>
          </div>
        </div>
      )}
      <textarea className="form-control min-h-[140px]" placeholder="匿名分享你的想法..." value={content} onChange={(e) => setContent(e.target.value)}/>
      <UploadArea value={files} onChange={setFiles} maxCount={6} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted">{files.length} 個附件</div>
          <div className="text-sm text-muted">
            發文者：<AnonymousAccountDisplay showIcon={true} />
          </div>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
          {submitting ? "送出中…" : "發佈"}
        </button>
      </div>
      {msg && <div className="text-sm text-warning">{msg}</div>}
    </form>
  );
}
