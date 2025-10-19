/**
 * 網域限制頁面
 * 當用戶使用非 .edu/.edu.tw 域名時顯示
 */

import { useState } from 'react'
import { AlertTriangle, Mail, ExternalLink } from 'lucide-react'
import { getEmailDomainError, detectDomainSuffixFromEmail } from '@/utils/emailValidation'

interface DomainRestrictionPageProps {
  email: string
  onContactAdmin: () => void
  onTryAgain: () => void
}

/**
 *
 */
export default function DomainRestrictionPage({
  email,
  onContactAdmin,
  onTryAgain
}: DomainRestrictionPageProps) {
  const domainError = getEmailDomainError(email)
  const domain = email.includes('@') ? email.split('@')[1] : 'unknown'
  const detectedSuffix = detectDomainSuffixFromEmail(email)

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft text-center">
          
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>

          
          <h1 className="text-xl font-semibold text-fg mb-2">
            目前僅接受學校信箱
          </h1>

          
          <div className="text-sm text-muted mb-4 space-y-2">
            <p>
              請使用 <code className="bg-muted/30 px-1 py-0.5 rounded text-fg">.edu.tw</code> 或{' '}
              <code className="bg-muted/30 px-1 py-0.5 rounded text-fg">.edu</code> 結尾之學校 Email。
            </p>
            <p>
              若貴校尚未加入，請聯絡管理員協助開通。
            </p>
          </div>

          
          <div className="bg-muted/20 border border-border rounded-lg p-3 mb-4">
            <div className="flex items-center justify-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted" />
              <span className="text-muted">您使用的域名：</span>
              <code className="bg-muted/30 px-1 py-0.5 rounded text-fg">
                {domain}
              </code>
            </div>
            <p className="text-xs text-muted mt-2">
              {domainError}
            </p>
          </div>

          
          <div className="text-xs text-muted text-left mb-6 space-y-2">
            <p className="font-medium">為什麼需要學校信箱？</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>確保平台僅供教育用途使用</li>
              <li>維護校園討論環境的純淨性</li>
              <li>建立可信任的學術交流社群</li>
            </ul>
          </div>

          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
            <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">
              學校信箱格式範例：
            </p>
            <div className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
              <div className="font-mono">student@university.edu.tw</div>
              <div className="font-mono">name@college.edu</div>
              <div className="font-mono">user@school.ac.uk</div>
            </div>
          </div>

          
          <div className="space-y-3">
            <button
              onClick={onContactAdmin}
              className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              {detectedSuffix ? `聯絡管理員（判定尾綴：${detectedSuffix}）` : '聯絡管理員'}
            </button>
            
            <button
              onClick={onTryAgain}
              className="w-full px-4 py-2 border border-border rounded-xl hover:bg-surface/80 text-sm"
            >
              重新嘗試
            </button>

            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted">
                如果您確信您的學校信箱應該被接受，或者您的學校尚未在我們的系統中，
                請點擊「聯絡管理員」按鈕，我們會盡快為您的學校開通服務。
              </p>
            </div>
          </div>
        </div>

        
        <div className="mt-4 text-center">
          <p className="text-xs text-muted">
            ForumKit 校園匿名討論平台 - 專為教育環境設計
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * 聯絡管理員的簡化版元件
 */
export function ContactAdminPrompt({ 
  email, 
  onSubmit,
  onCancel,
  loading = false
}: {
  email: string
  onSubmit: (message: string) => Promise<void>
  onCancel: () => void
  loading?: boolean
}) {
  const [message, setMessage] = useState('')
  const suffix = detectDomainSuffixFromEmail(email)
  const domain = email.includes('@') ? email.split('@')[1] : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    await onSubmit(message.trim())
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-fg mb-4">聯絡管理員</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            您的 Email
          </label>
          <input
            type="email"
            value={email}
            readOnly
            className="form-control bg-muted/30 cursor-not-allowed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-fg mb-2">判定的網域</label>
            <input value={domain} readOnly className="form-control bg-muted/30 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg mb-2">判定尾綴</label>
            <input value={suffix || '未知'} readOnly className="form-control bg-muted/30 cursor-not-allowed" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg mb-2">
            學校名稱或說明 *
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="請告訴我們您的學校名稱，或說明為什麼您的 Email 應該被接受..."
            className="form-control min-h-[100px]"
            required
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-border rounded-xl hover:bg-surface/80 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading || !message.trim()}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? '送出中...' : '送出請求'}
          </button>
        </div>
      </form>
    </div>
  )
}

