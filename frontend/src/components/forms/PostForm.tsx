// frontend/src/components/PostForm.tsx
import { useState } from 'react'
import UploadArea from '../UploadArea'
import { postJSON, postFormData, HttpError } from '../../lib/http'
import { validatePost } from '../../schemas/post'
import { getClientId, newTxId } from '../../utils/client'

export default function PostForm({ onCreated }: { onCreated: (post: any) => void }) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    const body = content.trim()
    // 若有附件，略過最小字數檢查（由後端設定統一控管）
    if (files.length === 0 && body.length < 15) { setErr('內容太短（需 ≥ 15 字）'); return }
    setBusy(true); setErr(null)
    
    const clientId = getClientId()
    const txId = newTxId()
    const now = new Date().toISOString()

    // 私有占位：只在本機顯示的待審貼文卡，方便看到「送審中」
    const escapeHtml = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
    onCreated?.({
      tempKey: `tmp_${txId}`,
      client_tx_id: txId,
      content: `<p>${escapeHtml(body)}</p>`,
      author_hash: '您',
      created_at: now,
      pending_private: true,
    })
    
    try {
      let result
      
      if (files.length > 0) {
        // 有檔案時使用 FormData
        const fd = new FormData()
        fd.set('content', body)
        fd.set('client_tx_id', txId)
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
        result = await postJSON('/api/posts', { content: body, client_tx_id: txId }, { headers })
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
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4 shadow-soft">
      <h3 className="font-semibold dual-text mb-2 text-base sm:text-lg">發表新貼文</h3>
      <textarea
        className="form-control min-h-[100px] sm:min-h-[120px] text-sm sm:text-base"
        placeholder="想說點什麼？支援少量粗體/斜體/段落。"
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
