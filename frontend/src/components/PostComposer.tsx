import React, { useEffect, useState, useMemo, useRef } from "react";
import UploadArea from "./UploadArea";
import { postFormData, HttpError } from "../lib/http";
import { validatePost } from "../schemas/post";
import AnonymousAccountDisplay from "./AnonymousAccountDisplay";
import { canPublishAnnouncement, getRole } from "../utils/auth";
import { useAuth } from "@/contexts/AuthContext";
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import { Link } from 'react-router-dom'
import { textToHtml } from '@/utils/safeHtml'
import { Bold, Italic, Link as LinkIcon, List, Quote, Code, Eye, Paperclip } from 'lucide-react'

export default function PostComposer({ token }: { token: string }) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [announcementType, setAnnouncementType] = useState<'platform' | 'cross' | 'school'>('school');
  const [schools, setSchools] = useState<{ id:number; slug:string; name:string }[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [schoolSearch, setSchoolSearch] = useState('')
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
  const [mobilePreview, setMobilePreview] = useState(false)
  const [showUploads, setShowUploads] = useState(true)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  // Mobile editor helpers
  const insertText = (before: string, after = '', placeholder = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.slice(start, end)
    const replacement = before + (selectedText || placeholder) + after
    const newText = content.slice(0, start) + replacement + content.slice(end)
    setContent(newText)
    // restore caret
    setTimeout(() => {
      const newCursorPos = start + before.length + (selectedText || placeholder).length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    }, 0)
  }

  const toolbarButtons = [
    { Icon: Bold, onClick: () => insertText('**', '**', '粗體'), title: '粗體' },
    { Icon: Italic, onClick: () => insertText('*', '*', '斜體'), title: '斜體' },
    { Icon: LinkIcon, onClick: () => insertText('[', '](https://)', '連結文字'), title: '連結' },
    { Icon: List, onClick: () => insertText('- ', '', '清單項目'), title: '清單' },
    { Icon: Quote, onClick: () => insertText('> ', '', '引用'), title: '引用' },
    { Icon: Code, onClick: () => insertText('`', '`', '程式碼'), title: '行內程式碼' },
  ]

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
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl mx-auto md:pb-0">
      {/* 桌面版：發佈範圍內嵌選擇器（行動版維持送出前彈窗） */}
      <div className="hidden lg:flex items-center gap-3">
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
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] sm:w-[520px] rounded-2xl border border-border bg-surface shadow-2xl p-4">
            <h3 className="font-semibold dual-text mb-2">選擇發佈目標</h3>
            <div className="flex items-center gap-2 mb-3">
              <button type="button" className={`px-3 py-1.5 rounded-full border text-sm ${targetSlug===''?'bg-primary text-primary-foreground border-primary':'dual-btn'}`} onClick={()=>setTargetSlug('')}>跨校</button>
              {mySchoolId && (
                <button type="button" className={`px-3 py-1.5 rounded-full border text-sm ${targetSlug=== (schools.find(s=>s.id===mySchoolId)?.slug||'') ? 'bg-primary text-primary-foreground border-primary':'dual-btn'}`} onClick={()=>{ const my = schools.find(s=>s.id===mySchoolId)?.slug||''; setTargetSlug(my) }}>我的學校</button>
              )}
              <div className="ml-auto w-40">
                <input value={schoolSearch} onChange={e=>setSchoolSearch(e.target.value)} placeholder="搜尋學校" className="form-control form-control--compact w-full" />
              </div>
            </div>
            <div className="space-y-2 mb-3 max-h-[50vh] overflow-y-auto pr-1">
              <label className="flex items-center gap-2 p-2 rounded hover:bg-surface-hover">
                <input type="radio" name="scope" checked={targetSlug === ''} onChange={()=> setTargetSlug('')} />
                <span className="text-sm">跨校（全部）</span>
              </label>
              {schools
                .filter(s => {
                  const q = schoolSearch.trim().toLowerCase()
                  if (!q) return true
                  return s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)
                })
                .map(school => (
                  <label key={school.id} className="flex items-center gap-2 p-2 rounded hover:bg-surface-hover">
                    <input type="radio" name="scope" checked={targetSlug === school.slug} onChange={()=> setTargetSlug(school.slug) } />
                    <span className="text-sm">{school.name}</span>
                    <span className="text-xs text-muted ml-auto">{school.slug}</span>
                  </label>
                ))}
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
      {/* Mobile scope chip (opens selection modal; submit remains in bottom bar) */}
      <div className="md:hidden -mt-2">
        <button
          type="button"
          onClick={()=>setConfirmOpen(true)}
          className="text-xs px-2 py-1 rounded-full bg-surface-hover border border-border text-muted"
        >
          發佈到：{(() => { const f = schools.find(s=>s.slug===targetSlug); return f?.name || '跨校'; })()}
        </button>
      </div>

      {/* 改進的手機版工具欄 */}
      {toolbarOpen && (
        <div className="md:hidden bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50 border border-border rounded-xl p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">格式工具</span>
            <button
              type="button"
              onClick={() => setToolbarOpen(false)}
              className="text-xs text-muted hover:text-fg px-2 py-1 rounded-md hover:bg-surface-hover transition-colors"
            >
              收起
            </button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {toolbarButtons.map(({ Icon, onClick, title }, i) => (
              <button
                key={i}
                type="button"
                onClick={onClick}
                title={title}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-surface-hover active:bg-surface-active transition-colors"
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs text-muted">{title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 改進的文字輸入區域 */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          className="form-control min-h-[140px] text-base leading-relaxed resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200"
          placeholder="分享你的想法...支援 Markdown 語法"
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            try {
              const ta = textareaRef.current
              if (ta) {
                ta.style.height = 'auto'
                ta.style.height = Math.min(Math.max(ta.scrollHeight, 140), 320) + 'px'
              }
            } catch {}
          }}
          onFocus={() => {
            // 手機版自動展開工具欄提示
            if (window.innerWidth < 768 && !toolbarOpen) {
              setTimeout(() => setToolbarOpen(true), 200)
            }
          }}
        />

        {/* 字數統計 */}
        <div className="absolute bottom-3 right-3 text-xs text-muted bg-surface/80 backdrop-blur px-2 py-1 rounded-md">
          {content.length} 字
        </div>
      </div>

      {(showUploads || files.length > 0) && (
        <div id="composer-uploads">
          <UploadArea value={files} onChange={setFiles} maxCount={6} />
        </div>
      )}

      {/* 即時預覽（輕量）：轉義換行與連結，樣式與詳情頁一致 */}
      {/* Desktop or mobile preview (toggle) */}
      {(content.trim() && (mobilePreview || window.innerWidth >= 768)) && (
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
      <div className="hidden md:flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted">{files.length} 個附件</div>
          {/* 行動版隱藏「將發佈至」提示，避免與上方選單重複 */}
          <div className="text-sm text-muted hidden lg:block">
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
      {/* Sticky bottom action bar (mobile) */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur p-2 z-60">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            type="button"
            className={`px-3 py-2 rounded-xl border dual-btn flex items-center gap-2 ${toolbarOpen ? 'bg-surface-hover' : ''}`}
            onClick={() => setToolbarOpen(v=>!v)}
          >
            <Code className="w-4 h-4" /> 格式
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-xl border dual-btn flex items-center gap-2"
            onClick={() => {
              setShowUploads(true)
              setTimeout(() => {
                const el = document.getElementById('composer-uploads');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }, 50)
            }}
          >
            <Paperclip className="w-4 h-4" /> 附件
          </button>
          <button
            type="button"
            className={`px-3 py-2 rounded-xl border dual-btn flex items-center gap-2 ${mobilePreview ? 'bg-surface-hover' : ''}`}
            onClick={()=> setMobilePreview(v=>!v)}
          >
            <Eye className="w-4 h-4" /> {mobilePreview ? '隱藏預覽' : '預覽'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="ml-auto btn-primary disabled:opacity-60"
            style={{ touchAction: 'manipulation' }}
          >
            {submitting ? '送出中…' : '發佈'}
          </button>
        </div>
      </div>
    </form>
  );
}
