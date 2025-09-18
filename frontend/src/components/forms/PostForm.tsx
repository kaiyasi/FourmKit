// frontend/src/components/PostForm.tsx
import { useEffect, useState } from 'react'
import UploadArea from '../UploadArea'
import { postJSON, postFormData, HttpError } from '../../lib/http'
import { validatePost } from '../../schemas/post'
import { getClientId, newTxId } from '../../utils/client'
import { getRole, canPublishAnnouncement } from '../../utils/auth'
import { SafeHtmlContent } from '@/components/ui/SafeHtmlContent'
import { Link } from 'react-router-dom'
import { textToHtml } from '@/utils/safeHtml'

type School = { id: number; slug: string; name: string }

export default function PostForm({ onCreated }: { onCreated: (post: any) => void }) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
  const [publishType, setPublishType] = useState<'normal' | 'announcement'>('normal')
  const [announcementType, setAnnouncementType] = useState<'platform' | 'cross' | 'school'>('school')
  const defaultSlug = (() => {
    try {
      return (
        localStorage.getItem('school_slug') ||
        localStorage.getItem('current_school_slug') ||
        localStorage.getItem('selected_school_slug') ||
        ''
      )
    } catch { return '' }
  })()
  const [targetSlug, setTargetSlug] = useState<string | ''>(defaultSlug)
  
  const role = getRole()
  const canAnnounce = canPublishAnnouncement()

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (alive && Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  const doSubmit = async (finalSlug: string | '') => {
    // 根據 publishType 決定是否為公告
    const isAnnouncement = publishType === 'announcement'
    const body = content.trim()
    // 最小字數交由後端依設定檢查（前端不硬卡）
    setBusy(true); setErr(null)
    
    const clientId = getClientId()
    const txId = newTxId()
    const now = new Date().toISOString()

    // 不再插入本地「送審中」占位卡
    
    try {
      let result
      let replyToId: number | null = null
      let textBody = body
      // 特殊語法：以 #<id> 開頭 → 發文，但標記 reply_to_id
      if (files.length === 0) {
        const m = body.match(/^#(\d+)\s*(.*)$/s)
        if (m) {
          replyToId = parseInt(m[1], 10)
          textBody = (m[2] || '').trim()
        }
      }
      
      if (files.length > 0) {
        // 有檔案時使用 FormData
        const fd = new FormData()
        fd.set('content', body)
        fd.set('client_tx_id', txId)
        if (finalSlug) fd.set('school_slug', finalSlug)
        if (isAnnouncement) {
          fd.set('is_announcement', 'true')
          fd.set('announcement_type', announcementType)
        }
        files.forEach(f => fd.append('files', f))
        
        const headers = { 
          'X-Client-Id': clientId, 
          'X-Tx-Id': txId 
        }
        result = await postFormData('/api/posts/with-media', fd, { headers })
      } else {
        // 沒有檔案時使用 JSON
        const headers = { 
          'Content-Type': 'application/json',
          'X-Client-Id': clientId, 
          'X-Tx-Id': txId 
        }
        const payload: any = { content: textBody, client_tx_id: txId }
        if (finalSlug) payload.school_slug = finalSlug
        if (isAnnouncement) {
          payload.is_announcement = true
          payload.announcement_type = announcementType
        }
        if (replyToId) payload.reply_to_id = replyToId
        result = await postJSON('/api/posts', payload, { headers })
      }
      
      // 後端已建立為 pending，前端不插入公開清單（保留私有占位即可），僅提示成功送審
      validatePost(result) // 校驗結構（一般貼文）
      setContent('')
      setFiles([])
      setPublishType('normal') // 重置為一般貼文
      setNotice('貼文已提交審核，通過後會在清單中顯示。')
    } catch (e) {
      if (e instanceof HttpError) {
        setErr(e.message)
      } else if (e instanceof Error) {
        setErr(e.message)
      } else {
        setErr("發文時發生未知錯誤")
      }
    } finally { 
      setBusy(false) 
      setConfirmOpen(false)
    }
  }

  const submit = async () => {
    if (!content.trim()) {
      setErr('請先輸入內容')
      return
    }
    // 桌面：按下送出先跳出選擇框
    setConfirmOpen(true)
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4 shadow-soft">
      <h3 className="font-semibold dual-text mb-2 text-base sm:text-lg">發表新貼文</h3>
      {confirmOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setConfirmOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] sm:w-[520px] rounded-2xl border border-border bg-surface shadow-2xl p-4">
            <h4 className="font-semibold dual-text mb-2">選擇發佈範圍</h4>
            <p className="text-sm text-muted mb-3">請選擇要把這則貼文送到哪裡：</p>
            <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
              {/* 一般學校選項 */}
              {schools.map(s => (
                <label key={s.id} className="flex items-center gap-2 hover:bg-surface-hover rounded-lg p-2">
                  <input 
                    type="radio" 
                    name="target" 
                    checked={targetSlug === s.slug && publishType === 'normal'} 
                    onChange={() => {
                      setTargetSlug(s.slug)
                      setPublishType('normal')
                    }} 
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
              
              {/* 跨校選項 */}
              <label className="flex items-center gap-2 hover:bg-surface-hover rounded-lg p-2">
                <input 
                  type="radio" 
                  name="target" 
                  checked={targetSlug === '' && publishType === 'normal'} 
                  onChange={() => {
                    setTargetSlug('')
                    setPublishType('normal')
                  }} 
                />
                <span className="text-sm">跨校（全部）</span>
              </label>

              {/* 公告選項 - 依管理員角色顯示 */}
              {canAnnounce && (
                <>
                  {/* 全平台公告 - 只有 dev_admin 可見 */}
                  {role === 'dev_admin' && (
                    <label className="flex items-center gap-2 hover:bg-surface-hover rounded-lg p-2">
                      <input 
                        type="radio" 
                        name="target" 
                        checked={publishType === 'announcement' && announcementType === 'platform'} 
                        onChange={() => {
                          setPublishType('announcement')
                          setAnnouncementType('platform')
                          setTargetSlug('')
                        }} 
                      />
                      <span className="text-sm">全平台公告</span>
                      <span className="text-xs text-muted ml-auto">向所有用戶顯示</span>
                    </label>
                  )}

                  {/* 跨校公告 - dev_admin 和 cross_admin 可見 */}
                  {(role === 'dev_admin' || role === 'cross_admin') && (
                    <label className="flex items-center gap-2 hover:bg-surface-hover rounded-lg p-2">
                      <input 
                        type="radio" 
                        name="target" 
                        checked={publishType === 'announcement' && announcementType === 'cross'} 
                        onChange={() => {
                          setPublishType('announcement')
                          setAnnouncementType('cross')
                          setTargetSlug('')
                        }} 
                      />
                      <span className="text-sm">跨校公告</span>
                      <span className="text-xs text-muted ml-auto">在跨校區域顯示</span>
                    </label>
                  )}

                  {/* 學校公告 - 根據管理員身份顯示對應學校 */}
                  {(role === 'dev_admin' || role === 'campus_admin') && schools
                    .filter(s => role === 'dev_admin' || s.slug === defaultSlug)
                    .map(s => (
                      <label key={`announcement-${s.id}`} className="flex items-center gap-2 hover:bg-surface-hover rounded-lg p-2">
                        <input 
                          type="radio" 
                          name="target" 
                          checked={publishType === 'announcement' && announcementType === 'school' && targetSlug === s.slug} 
                          onChange={() => {
                            setPublishType('announcement')
                            setAnnouncementType('school')
                            setTargetSlug(s.slug)
                          }} 
                        />
                        <span className="text-sm">{s.name}公告</span>
                        <span className="text-xs text-muted ml-auto">向該校用戶顯示</span>
                      </label>
                    ))
                  }
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-ghost text-sm" onClick={()=>setConfirmOpen(false)}>取消</button>
              <button className="btn-primary text-sm" onClick={()=>doSubmit(targetSlug)}>確認送出</button>
            </div>
          </div>
        </div>
      )}
      <textarea
        className="form-control min-h-[100px] sm:min-h-[120px] text-sm sm:text-base"
        placeholder="想說點什麼？支援 Markdown 語法：**粗體**、*斜體*、`程式碼`、[連結](網址)、# 標題、- 清單"
        value={content}
        onChange={e=> setContent(e.target.value)}
      />
      
      {/* 媒體上傳區域 */}
      <div className="mt-3">
        <UploadArea value={files} onChange={setFiles} maxCount={6} />
      </div>

      {/* 輕量預覽：回覆語法優先，否則 Markdown 預覽 */}
      {content.trim() && (
        (() => {
          const m = content.trim().match(/^#(\d+)\s*(.*)$/s)
          if (m && files.length === 0) {
            const replyId = m[1]
            const replyText = (m[2] || '').trim()
            return (
              <div className="mt-3 rounded-2xl border border-border bg-surface/70 p-3 sm:p-4">
                <div className="text-sm text-muted mb-2">預覽</div>
                <div className="text-sm text-fg whitespace-pre-wrap">
                  <Link to={`/posts/${replyId}`} className="text-xs text-muted mr-2 hover:underline">回覆貼文 #{replyId}</Link>
                  {replyText || '（無內容）'}
                </div>
              </div>
            )
          }
          return (
            <div className="mt-3 rounded-2xl border border-border bg-surface/70 p-3 sm:p-4 preview-prose">
              <div className="text-sm text-muted mb-2">預覽</div>
              <div className="prose prose-sm max-w-none text-fg prose-rules">
                <SafeHtmlContent html={textToHtml(content)} allowLinks={true} />
              </div>
            </div>
          )
        })()
      )}
      
      {notice && <p className="text-sm text-green-700 dark:text-green-300 mt-2">{notice}</p>}
      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
      <div className="mt-3 flex gap-2 justify-between items-center">
        <div className="text-sm text-muted">
          {files.length > 0 && `${files.length} 個檔案`}
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50 text-sm sm:text-base"
        >
          {busy ? '送出中…' : '送出'}
        </button>
      </div>
    </div>
  )
}
