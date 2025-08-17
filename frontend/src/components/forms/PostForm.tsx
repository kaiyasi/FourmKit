// frontend/src/components/PostForm.tsx
import { useState } from 'react'
import UploadArea from '../UploadArea'
import { postJSON, postFormData, HttpError } from '../../lib/http'
import { validatePost } from '../../schemas/post'
import { getClientId, newTxId, makeTempKey } from '../../utils/client'

export default function PostForm({ onCreated }: { onCreated: (post: any) => void }) {
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    const body = content.trim()
    if (body.length < 15) { setErr('內容太短（需 ≥ 15 字）'); return }
    setBusy(true); setErr(null)
    
    const clientId = getClientId()
    const txId = newTxId()
    const now = new Date().toISOString()
    
    // 樂觀插入：立即顯示暫時貼文
    const optimisticPost = {
      tempKey: makeTempKey(body, now, '', txId),
      client_tx_id: txId,
      content: body,
      author_hash: '您',
      created_at: now,
    }
    onCreated?.(optimisticPost)
    
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
      
      // 驗證返回的貼文資料，添加 client_tx_id 用於替換樂觀項目
      const validatedPost = validatePost(result)
      validatedPost.client_tx_id = txId
      onCreated?.(validatedPost)  // 這會觸發替換
      
      setContent('')
      setFiles([])
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
        className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg min-h-[100px] sm:min-h-[120px] text-sm sm:text-base"
        placeholder="想說點什麼？支援少量粗體/斜體/段落。"
        value={content}
        onChange={e=> setContent(e.target.value)}
      />
      
      {/* 媒體上傳區域 */}
      <div className="mt-3">
        <UploadArea value={files} onChange={setFiles} maxCount={6} />
      </div>
      
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
