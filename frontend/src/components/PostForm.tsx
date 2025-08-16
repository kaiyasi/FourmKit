// frontend/src/components/PostForm.tsx
import { useState } from 'react'

export default function PostForm({ onCreated }: { onCreated: (post: any) => void }) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    const body = content.trim()
    if (body.length < 15) { setErr('內容太短（需 ≥ 15 字）'); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body })
      })
      const data = await r.json().catch(()=> ({}))
      if (!r.ok || !data?.ok) {
        setErr(data?.error || `發文失敗（HTTP ${r.status})`); return
      }
      onCreated?.(data.post)
      setContent('')              // ✅ 可重複提交
    } catch (e:any) {
      setErr(String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <h3 className="font-semibold dual-text mb-2">發表新貼文</h3>
      <textarea
        className="w-full px-3 py-2 rounded-xl border border-border bg-surface/70 text-fg min-h-[120px]"
        placeholder="想說點什麼？支援少量粗體/斜體/段落。"
        value={content}
        onChange={e=> setContent(e.target.value)}
      />
      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-xl border dual-btn disabled:opacity-50"
        >
          {busy ? '送出中…' : '送出'}
        </button>
      </div>
    </div>
  )
}
