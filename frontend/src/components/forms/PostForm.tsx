// frontend/src/components/PostForm.tsx
import { useEffect, useState } from 'react'
import UploadArea from '../UploadArea'
import { postJSON, postFormData, HttpError } from '../../lib/http'
import { validatePost } from '../../schemas/post'
import { getClientId, newTxId } from '../../utils/client'

type School = { id: number; slug: string; name: string }

export default function PostForm({ onCreated }: { onCreated: (post: any) => void }) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [schools, setSchools] = useState<School[]>([])
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
    const body = content.trim()
    // 最小字數交由後端依設定檢查（前端不硬卡）
    setBusy(true); setErr(null)
    
    const clientId = getClientId()
    const txId = newTxId()
    const now = new Date().toISOString()

    // 不再插入本地「送審中」占位卡
    
    try {
      let result
      
      if (files.length > 0) {
        // 有檔案時使用 FormData
        const fd = new FormData()
        fd.set('content', body)
        fd.set('client_tx_id', txId)
        if (finalSlug) fd.set('school_slug', finalSlug)
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
        const payload: any = { content: body, client_tx_id: txId }
        if (finalSlug) payload.school_slug = finalSlug
        result = await postJSON('/api/posts', payload, { headers })
      }
      
      // 後端已建立為 pending，前端不插入公開清單（保留私有占位即可），僅提示成功送審
      validatePost(result) // 校驗結構
      setContent('')
      setFiles([])
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
              {schools.map(s => (
                <label key={s.id} className="flex items-center gap-2">
                  <input type="radio" name="target" checked={targetSlug === s.slug} onChange={()=> setTargetSlug(s.slug)} />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input type="radio" name="target" checked={targetSlug === ''} onChange={()=> setTargetSlug('')} />
                <span className="text-sm">跨校（全部）</span>
              </label>
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
