import { useState } from 'react'
import { Send, Image, X, AlertCircle, CheckCircle } from 'lucide-react'

interface MobileSupportFormProps {
  isLoggedIn: boolean
  personalId?: string | null
  mySchool?: { slug: string; name: string } | null
  onSubmit: (data: any) => Promise<void>
  isSubmitting: boolean
  result?: 'ok' | 'err' | null
  message?: string
}

export function MobileSupportForm({ 
  isLoggedIn, 
  personalId, 
  mySchool, 
  onSubmit, 
  isSubmitting, 
  result, 
  message 
}: MobileSupportFormProps) {
  const [scope, setScope] = useState<'cross' | 'school'>('cross')
  const [category, setCategory] = useState('account')
  const [subject, setSubject] = useState('')
  const [email, setEmail] = useState('')
  const [messageText, setMessageText] = useState('')
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([])

  const handleSubmit = async () => {
    const text = messageText.trim()
    if (text.length < 5) {
      return
    }

    // 未登入：強制 Gmail 格式
    if (!isLoggedIn) {
      const emailTrim = email.trim()
      const gmailRe = /^[A-Za-z0-9._%+-]+@gmail\\.com$/
      if (!gmailRe.test(emailTrim)) {
        return
      }
    }

    try {
      // 讀取附件
      const attachments: any[] = []
      for (const f of files.map(x => x.file)) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('read_fail'))
          reader.onload = () => resolve(String(reader.result || ''))
          reader.readAsDataURL(f)
        })
        attachments.push({ name: f.name, type: f.type, size: f.size, data })
      }

      const payload: any = {
        category,
        subject: subject.trim() || undefined,
        message: text,
        email: isLoggedIn ? undefined : email.trim(),
        contact: isLoggedIn ? (personalId || undefined) : undefined,
        also_contact: true,
        source: 'mobile_support',
        scope,
        school_slug: scope === 'school' ? mySchool?.slug : undefined,
        ...(attachments.length ? { attachments } : {})
      }

      await onSubmit(payload)

      // 成功後重置表單
      if (result === 'ok') {
        setSubject('')
        setMessageText('')
        setFiles([])
        if (!isLoggedIn) setEmail('')
      }
    } catch (error) {
      // 錯誤處理由父組件處理
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []).slice(0, 3)
    Promise.all(
      fileList.map(f => new Promise<{ file: File; preview: string }>(res => {
        const reader = new FileReader()
        reader.onload = () => res({ file: f, preview: String(reader.result || '') })
        reader.readAsDataURL(f)
      }))
    ).then(arr => setFiles(arr))
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  return (
    <div className=\"space-y-4\">
      {/* 範圍選擇 */}
      <div>
        <label className=\"block text-sm font-medium text-fg mb-3\">問題範圍</label>
        <div className=\"grid grid-cols-2 gap-2\">
          <button
            type=\"button\"
            onClick={() => setScope('cross')}
            className={`p-3 rounded-xl border text-sm font-medium transition-all ${
              scope === 'cross'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface hover:bg-surface-hover text-muted'
            }`}
          >
            跨校
          </button>
          <button
            type=\"button\"
            onClick={() => setScope('school')}
            disabled={!isLoggedIn || !mySchool}
            className={`p-3 rounded-xl border text-sm font-medium transition-all ${
              scope === 'school'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface hover:bg-surface-hover text-muted'
            } ${!isLoggedIn || !mySchool ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            校內
            {mySchool && <div className=\"text-xs mt-1 opacity-75\">{mySchool.name}</div>}
          </button>
        </div>
      </div>

      {/* 分類選擇 */}
      <div>
        <label className=\"block text-sm font-medium text-fg mb-2\">分類</label>
        <select 
          value={category} 
          onChange={e => setCategory(e.target.value)} 
          className=\"form-control w-full\"
        >
          <option value=\"suggestion\">功能建議</option>
          <option value=\"report\">問題回報</option>
          <option value=\"abuse\">濫用/檢舉</option>
          <option value=\"account\">帳號/登入問題</option>
          <option value=\"other\">其他</option>
        </select>
      </div>

      {/* Email 或聯絡方式 */}
      {!isLoggedIn ? (
        <div>
          <label className=\"block text-sm font-medium text-fg mb-2\">
            Email <span className=\"text-red-500\">*</span>
          </label>
          <input 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            placeholder=\"example@gmail.com\" 
            className=\"form-control w-full\"
            type=\"email\"
          />
          <div className=\"text-xs text-muted mt-1\">僅接受 Gmail 地址</div>
        </div>
      ) : (
        <div>
          <label className=\"block text-sm font-medium text-fg mb-2\">聯絡方式</label>
          <div className=\"bg-surface-hover rounded-lg p-3 border border-border\">
            <div className=\"font-mono text-sm text-primary\">{personalId || '載入中...'}</div>
            <div className=\"text-xs text-muted mt-1\">將以站內通知回覆</div>
          </div>
        </div>
      )}

      {/* 主旨 */}
      <div>
        <label className=\"block text-sm font-medium text-fg mb-2\">主旨（可選）</label>
        <input 
          value={subject} 
          onChange={e => setSubject(e.target.value)} 
          placeholder=\"簡述您的問題\"
          className=\"form-control w-full\"
        />
      </div>

      {/* 內容 */}
      <div>
        <label className=\"block text-sm font-medium text-fg mb-2\">
          內容 <span className=\"text-red-500\">*</span>
        </label>
        <textarea 
          value={messageText} 
          onChange={e => setMessageText(e.target.value)} 
          rows={6} 
          placeholder=\"請描述您的情況，例如錯誤訊息、發生步驟、影響帳號等。\"
          className=\"form-control w-full resize-none\"
        />
        <div className=\"text-xs text-muted mt-1\">
          {messageText.length}/4000 字元
        </div>
      </div>

      {/* 附件上傳 */}
      <div>
        <label className=\"block text-sm font-medium text-fg mb-2\">
          附加截圖（選填，最多 3 張）
        </label>
        <div className=\"space-y-3\">
          <label className=\"flex items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-surface-hover transition-colors\">
            <div className=\"text-center\">
              <Image className=\"w-6 h-6 text-muted mx-auto mb-1\" />
              <span className=\"text-sm text-muted\">點擊上傳圖片</span>
            </div>
            <input 
              type=\"file\" 
              accept=\"image/*\" 
              multiple 
              onChange={handleFileChange}
              className=\"hidden\"
            />
          </label>

          {files.length > 0 && (
            <div className=\"grid grid-cols-3 gap-2\">
              {files.map((f, i) => (
                <div key={i} className=\"relative group\">
                  <img 
                    src={f.preview} 
                    alt=\"附件預覽\" 
                    className=\"w-full aspect-square object-cover rounded-lg border border-border\"
                  />
                  <button
                    onClick={() => removeFile(i)}
                    className=\"absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity\"
                  >
                    <X className=\"w-3 h-3\" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className=\"text-xs text-muted mt-1\">為保護隱私，請勿上傳個資。</div>
      </div>

      {/* 提交按鈕和結果 */}
      <div className=\"space-y-3\">
        <button 
          onClick={handleSubmit} 
          disabled={isSubmitting || messageText.length < 5 || (!isLoggedIn && !email.includes('@gmail.com'))}
          className=\"w-full btn-primary py-3 flex items-center justify-center gap-2 font-medium\"
        >
          <Send className={`w-4 h-4 ${isSubmitting ? 'animate-pulse' : ''}`} />
          {isSubmitting ? '送出中...' : '送出'}
        </button>

        {result === 'ok' && (
          <div className=\"bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3\">
            <div className=\"flex items-center gap-2 text-emerald-800 dark:text-emerald-200\">
              <CheckCircle className=\"w-4 h-4 flex-shrink-0\" />
              <div className=\"text-sm\">
                <div className=\"font-medium mb-1\">提交成功！</div>
                <div className=\"whitespace-pre-line text-xs\">{message}</div>
              </div>
            </div>
          </div>
        )}

        {result === 'err' && (
          <div className=\"bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3\">
            <div className=\"flex items-center gap-2 text-red-800 dark:text-red-200\">
              <AlertCircle className=\"w-4 h-4 flex-shrink-0\" />
              <span className=\"text-sm\">{message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}