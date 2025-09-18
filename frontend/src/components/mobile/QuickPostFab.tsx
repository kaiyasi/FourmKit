import { useState } from 'react'
import { Edit3, X, Image, Mic, Send } from 'lucide-react'
import { postJSON, postFormData, HttpError } from '@/lib/http'
import { getClientId, newTxId } from '@/utils/client'
import { useAuth } from '@/contexts/AuthContext'

interface QuickPostFabProps {
  onPostCreated?: (post: any) => void
}

export function QuickPostFab({ onPostCreated }: QuickPostFabProps) {
  const { isLoggedIn } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const haptic = (ms = 10) => { 
    try { 
      if ('vibrate' in navigator) navigator.vibrate(ms) 
    } catch {} 
  }

  if (!isLoggedIn) return null

  const handleSubmit = async () => {
    if (!content.trim()) return
    
    haptic(12)
    setIsSubmitting(true)
    setError(null)

    const clientId = getClientId()
    const txId = newTxId()
    const now = new Date().toISOString()

    // 創建本地占位項
    const placeholderPost = {
      tempKey: `tmp_${txId}`,
      client_tx_id: txId,
      content: content.trim(),
      author_hash: '您',
      created_at: now,
      pending_private: true,
    }

    try {
      let result
      // 特殊語法：#<id> → 發文但標記 reply_to_id
      let replyToId: number | null = null
      let textBody = content.trim()
      if (files.length === 0) {
        const m = textBody.match(/^#(\d+)\s*(.*)$/s)
        if (m) {
          replyToId = parseInt(m[1], 10)
          textBody = (m[2] || '').trim()
        }
      }

      if (files.length > 0) {
        const fd = new FormData()
        fd.set('content', content.trim())
        fd.set('client_tx_id', txId)
        files.forEach(f => fd.append('files', f))
        
        const headers = { 
          'X-Client-Id': clientId, 
          'X-Tx-Id': txId 
        }
        result = await postFormData('/api/posts/with-media', fd, { headers })
      } else {
        const payload: any = { content: textBody, client_tx_id: txId }
        if (replyToId) payload.reply_to_id = replyToId
        result = await postJSON('/api/posts/create', payload, {
          headers: { 'X-Client-Id': clientId, 'X-Tx-Id': txId }
        })
      }

      // 通知父組件
      onPostCreated?.(placeholderPost)
      
      // 重置狀態
      setContent('')
      setFiles([])
      setIsOpen(false)
      
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message)
      } else {
        setError('發文失敗，請稍後再試')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...selected].slice(0, 4)) // 最多 4 個檔案
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <>
      {/* 主 FAB 按鈕 */}
      <button
        onClick={() => {
          haptic(8)
          setIsOpen(true)
        }}
        className="fixed right-4 bottom-20 z-40 w-14 h-14 bg-primary hover:bg-primary-hover
                   rounded-full shadow-xl border border-primary/20
                   flex items-center justify-center transition-all duration-200
                   active:scale-95 md:hidden"
        aria-label="快速發文"
      >
        <Edit3 className="w-6 h-6 text-white" />
      </button>

      {/* 快速發文面板 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
          <div className="w-full bg-surface rounded-t-2xl border-t border-border shadow-2xl
                          max-h-[80vh] flex flex-col">
            {/* 頭部 */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-fg">快速發文</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-hover 
                           flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 內容 */}
            <div className="flex-1 p-4 space-y-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="匿名分享你的想法..."
                className="w-full h-32 p-3 bg-bg border border-border rounded-lg
                           text-fg placeholder-muted resize-none
                           focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />

              {/* 文件預覽 */}
              {files.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {files.map((file, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-surface-hover">
                      {file.type.startsWith('image/') ? (
                        <img 
                          src={URL.createObjectURL(file)} 
                          alt={`預覽 ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-sm text-muted truncate px-2">
                            {file.name}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(index)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full
                                   flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="p-4 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="w-10 h-10 rounded-full bg-surface-hover hover:bg-surface-active
                                  flex items-center justify-center cursor-pointer transition-colors">
                  <Image className="w-5 h-5" />
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                
                <button
                  className="w-10 h-10 rounded-full bg-surface-hover hover:bg-surface-active
                             flex items-center justify-center transition-colors"
                  title="語音輸入（即將推出）"
                  disabled
                >
                  <Mic className="w-5 h-5 text-muted" />
                </button>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting}
                className="px-6 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50
                           text-white rounded-full font-medium
                           flex items-center gap-2 transition-all duration-200
                           active:scale-95 disabled:active:scale-100"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? '發文中...' : '發文'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
