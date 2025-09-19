import React, { useEffect, useState, useMemo } from "react";
import UploadArea from "./UploadArea";
import { postFormData, HttpError } from "../lib/http";
import { validatePost } from "../schemas/post";
import AnonymousAccountDisplay from "./AnonymousAccountDisplay";
import { canPublishAnnouncement, getRole } from "../utils/auth";
import { useAuth } from "@/contexts/AuthContext";
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import { Link } from 'react-router-dom'
import { textToHtml } from '@/utils/safeHtml'

export default function PostComposer({ token }: { token: string }) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [announcementType, setAnnouncementType] = useState<'platform' | 'cross' | 'school'>('school');
  const [schools, setSchools] = useState<{ id:number; slug:string; name:string }[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isAd, setIsAd] = useState(false)
  const [lastSubmitTime, setLastSubmitTime] = useState(0)
  const { role } = useAuth()
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

  // 桌面版：學校清單載入後，若尚未選定，帶入預設（登入者=自己的學校；未登入=跨校）
  useEffect(() => {
    try {
      if (schools.length === 0) return
      if (targetSlug) return
      const mySlug = mySchoolId ? (schools.find(s=>s.id===mySchoolId)?.slug || '') : ''
      setTargetSlug(mySlug || '')
    } catch {}
  }, [schools])

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
      const mySlug = mySchoolId ? (schools.find(s=>s.id===mySchoolId)?.slug || '') : ''
      if (mySlug) setTargetSlug(mySlug)
      else if (defaultSlug) setTargetSlug(defaultSlug)
      else if (schools.length > 0) setTargetSlug('') // 預設跨校
    }
  }, [confirmOpen, defaultSlug, schools, targetSlug, mySchoolId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    
    if (!content.trim()) { 
      setMsg("請輸入內容"); 
      return; 
    }
    // 桌面版：直接依目前選擇送出；行動版保留確認視窗流程
    const isDesktop = (()=>{ try { return window.innerWidth >= 768 } catch { return true } })()
    if (isDesktop) {
      await doSubmit(targetSlug)
      return
    }
    setConfirmOpen(true)
  }

  async function doSubmit(finalSlug: string | '') {
    // 防止重複提交 - 檢查狀態和時間戳
    const now = Date.now();
    if (submitting) {
      console.log('[PostComposer] Already submitting, ignoring duplicate request');
      return;
    }
    if (now - lastSubmitTime < 1000) { // 1秒內不允許重複提交
      console.log('[PostComposer] Too fast submit, ignoring duplicate request');
      return;
    }

    setLastSubmitTime(now);

    setSubmitting(true)
    try {
      // 優先使用純文本API，如果有檔案則使用多媒體API
      if (files.length > 0) {
        const fd = new FormData()
        fd.set('content', content.trim())
        if (finalSlug) fd.set('school_slug', finalSlug)
        if (isAnnouncement) {
          fd.set('is_announcement', 'true')
          fd.set('announcement_type', announcementType)
        }
        if (isAd && role === 'dev_admin') fd.set('is_advertisement', 'true')
        try { console.log('[PostComposer] submit with files, school_slug =', finalSlug || '(cross)') } catch {}
        files.forEach(f => fd.append('files', f))
        const result = await postFormData("/api/posts/with-media", fd)
        const validatedPost = validatePost(result)
        setMsg("已送出，等待審核")
        setContent(""); setFiles([]); setIsAnnouncement(false)
        console.log('created:', validatedPost)
      } else {
        // 特殊語法：#<id> → 發文但標記 reply_to_id
        let replyToId: number | null = null
        let textBody = content.trim()
        const m = textBody.match(/^#(\d+)\s*(.*)$/s)
        if (m) {
          replyToId = parseInt(m[1], 10)
          textBody = (m[2] || '').trim()
        }
        // 純文本發文
        const { postJSON } = await import('../lib/http')
        const payload: any = { content: textBody }
        if (finalSlug) payload.school_slug = finalSlug
        if (isAnnouncement) {
          payload.is_announcement = true
          payload.announcement_type = announcementType
        }
        if (replyToId) payload.reply_to_id = replyToId
        if (isAd && role === 'dev_admin') payload.is_advertisement = true
        try { console.log('[PostComposer] submit text only, school_slug =', finalSlug || '(cross)') } catch {}
        
        const result = await postJSON('/api/posts', payload)
        const validatedPost = validatePost(result)
        setMsg("已送出，等待審核")
        setContent(""); setFiles([]); setIsAnnouncement(false)
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
      {/* 桌面版：發佈範圍內嵌選擇器（行動版維持送出前彈窗） */}
      <div className="hidden md:flex items-center gap-3">
        <label className="text-sm text-muted">發佈範圍</label>
        <select
          className="form-control !w-auto"
          value={targetSlug}
          onChange={(e)=> setTargetSlug(e.target.value as any)}
        >
          <option value="">跨校（全部）</option>
          {schools.map(s => (
            <option key={s.id} value={s.slug}>{s.name}</option>
          ))}
        </select>
        {/* 公告選項 - 依角色顯示不同選項 */}
        {token && canPublishAnnouncement() && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isAnnouncement}
                onChange={(e) => setIsAnnouncement(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>公告貼文</span>
            </label>
            {isAnnouncement && (
              <select
                value={announcementType}
                onChange={(e) => setAnnouncementType(e.target.value as any)}
                className="form-control !w-auto text-sm"
              >
                {role === 'dev_admin' && (
                  <>
                    <option value="platform">全平台公告</option>
                    <option value="cross">跨校公告</option>
                    <option value="school">學校公告</option>
                  </>
                )}
                {role === 'campus_admin' && (
                  <option value="school">學校公告</option>
                )}
                {role === 'cross_admin' && (
                  <option value="cross">跨校公告</option>
                )}
              </select>
            )}
          </div>
        )}
        {/* 廣告選項 - 僅 dev_admin */}
        {token && role === 'dev_admin' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAd}
              onChange={(e) => setIsAd(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>廣告貼文</span>
          </label>
        )}
      </div>
      {/* 確認對話框：選擇發文範圍 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setConfirmOpen(false)}></div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] sm:w-[480px] rounded-2xl border border-border bg-surface shadow-2xl p-4">
            <h3 className="font-semibold dual-text mb-2">選擇發文範圍</h3>
            <p className="text-sm text-muted mb-3">請確認要發佈到哪裡：</p>
            <div className="space-y-2 mb-3">
              {/* 所有人可選擇任一學校 */}
              {schools.map(school => (
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
            {/* 公告選項 - 依角色顯示不同選項 */}
            {token && canPublishAnnouncement() && (
              <div className="mb-3 p-3 rounded-xl bg-muted/20 border border-border">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={isAnnouncement}
                    onChange={(e) => setIsAnnouncement(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">公告貼文</span>
                </label>
                {isAnnouncement && (
                  <select
                    value={announcementType}
                    onChange={(e) => setAnnouncementType(e.target.value as any)}
                    className="form-control text-sm mb-2"
                  >
                    {role === 'dev_admin' && (
                      <>
                        <option value="platform">全平台公告</option>
                        <option value="cross">跨校公告</option>
                        <option value="school">學校公告</option>
                      </>
                    )}
                    {role === 'campus_admin' && (
                      <option value="school">學校公告</option>
                    )}
                    {role === 'cross_admin' && (
                      <option value="cross">跨校公告</option>
                    )}
                  </select>
                )}
                <p className="text-xs text-muted">
                  {announcementType === 'platform' && '全平台公告將向所有用戶顯示'}
                  {announcementType === 'cross' && '跨校公告將在跨校區域顯示'}
                  {announcementType === 'school' && '學校公告將向對應學校用戶顯示'}
                </p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={()=>setConfirmOpen(false)} disabled={submitting}>取消</button>
              <button
                type="button"
                className="btn-primary text-sm disabled:opacity-60"
                onClick={()=>doSubmit(targetSlug)}
                disabled={submitting}
              >
                {submitting ? "送出中…" : "確認送出"}
              </button>
            </div>
          </div>
        </div>
      )}
      <textarea className="form-control min-h-[140px]" placeholder="匿名分享你的想法..." value={content} onChange={(e) => setContent(e.target.value)}/>
      <UploadArea value={files} onChange={setFiles} maxCount={6} />

      {/* 即時預覽（輕量）：轉義換行與連結，樣式與詳情頁一致 */}
      {content.trim() && (
        (() => {
          const m = content.trim().match(/^#(\d+)\s*(.*)$/s)
          if (m && files.length === 0) {
            const replyId = m[1]
            const replyText = (m[2] || '').trim()
            return (
              <div className="rounded-2xl border border-border bg-surface/70 p-3 sm:p-4 shadow-soft">
                <div className="text-sm text-muted mb-2">預覽</div>
                <div className="text-sm text-fg whitespace-pre-wrap">
                  <Link to={`/posts/${replyId}`} className="text-xs text-muted mr-2 hover:underline">回覆貼文 #{replyId}</Link>
                  {replyText || '（無內容）'}
                </div>
              </div>
            )
          }
          return (
            <div className="rounded-2xl border border-border bg-surface/70 p-3 sm:p-4 shadow-soft">
              <div className="text-sm text-muted mb-2">預覽</div>
              <div className="prose prose-sm max-w-none text-fg prose-rules">
                <SafeHtmlContent html={textToHtml(content)} allowLinks={true} />
              </div>
            </div>
          )
        })()
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted">{files.length} 個附件</div>
          <div className="text-sm text-muted">
            將發佈至：{(() => {
              const found = schools.find(s=>s.slug===targetSlug)
              return (found?.name) || '跨校'
            })()}
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary disabled:opacity-60"
          style={{ touchAction: 'manipulation' }}
        >
          {submitting ? "送出中…" : "發佈"}
        </button>
      </div>
      {msg && <div className="text-sm text-warning">{msg}</div>}
    </form>
  );
}
