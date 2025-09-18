import { useState } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import MobileHeader from '@/components/MobileHeader'
import {
  Key,
  RefreshCw,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink
} from 'lucide-react'

interface TokenConversionResult {
  success: boolean
  long_lived_token?: string
  expires_in?: number
  error?: string
}

export default function TokenManagementPage() {
  const [shortTermToken, setShortTermToken] = useState('')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [result, setResult] = useState<TokenConversionResult | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)

  const handleConvertToken = async () => {
    if (!shortTermToken.trim() || !appId.trim() || !appSecret.trim()) {
      setResult({
        success: false,
        error: '請填寫所有必要欄位'
      })
      return
    }

    setIsConverting(true)
    setResult(null)

    try {
      const response = await fetch('/api/admin/instagram/convert-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          short_lived_token: shortTermToken.trim(),
          app_id: appId.trim(),
          app_secret: appSecret.trim()
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult({
          success: true,
          long_lived_token: data.data.access_token,
          expires_in: data.data.expires_in
        })
      } else {
        setResult({
          success: false,
          error: data.message || '轉換失敗，請檢查 Token 和應用程式資訊'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        error: '網路錯誤，請稍後再試'
      })
    } finally {
      setIsConverting(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } catch (error) {
      console.error('複製失敗:', error)
    }
  }

  const clearForm = () => {
    setShortTermToken('')
    setAppId('')
    setAppSecret('')
    setResult(null)
  }

  const formatExpiresIn = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 3600))
    return `${days} 天`
  }

  return (
    <PageLayout pathname="/admin/tokens" maxWidth="max-w-4xl">
      <MobileHeader subtitle="Tokens" />
      <div className="p-1 sm:p-0">
        {/* 頁面標題 */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Key className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Token 管理工具</h1>
              <p className="text-gray-600">Instagram 短期 Token 轉長期 Token</p>
            </div>
          </div>
        </div>

        {/* 說明卡片 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
            <div>
              <h3 className="font-semibold dual-text mb-2">使用說明</h3>
              <ul className="text-sm text-muted space-y-1">
                <li>• 短期 Token 從 Instagram Basic Display API 獲取，有效期約 1 小時</li>
                <li>• 長期 Token 有效期為 60 天，可用於長期存取 Instagram 資料</li>
                <li>• App ID 和 App Secret 來自 Facebook 開發者平台的應用程式設定</li>
                <li>• 轉換成功後請立即將長期 Token 複製並安全保存</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 轉換表單 */}
        <div className="bg-surface rounded-2xl shadow-soft border border-border p-6 mb-6">
          <h2 className="font-semibold dual-text mb-4">Token 轉換</h2>

          <div className="space-y-4">
            {/* 短期 Token */}
            <div>
              <label className="block text-sm font-medium text-fg mb-2">
                短期 Access Token <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={shortTermToken}
                onChange={(e) => setShortTermToken(e.target.value)}
                placeholder="請輸入從 Instagram Basic Display API 獲取的短期 Token..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm bg-background text-fg"
              />
            </div>

            {/* App ID */}
            <div>
              <label className="block text-sm font-medium text-fg mb-2">
                App ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Facebook 應用程式 ID"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-fg"
              />
            </div>

            {/* App Secret */}
            <div>
              <label className="block text-sm font-medium text-fg mb-2">
                App Secret <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="Facebook 應用程式密鑰"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-fg"
              />
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-3 pt-2">
              <button onClick={handleConvertToken} disabled={isConverting} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {isConverting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                {isConverting ? '轉換中...' : '轉換 Token'}
              </button>

              <button onClick={clearForm} className="btn-ghost">
                清除表單
              </button>
            </div>
          </div>
        </div>

        {/* 結果顯示 */}
        {result && (
          <div className="bg-surface rounded-2xl shadow-soft border border-border p-6">
            <h2 className="font-semibold dual-text mb-4">轉換結果</h2>

            {result.success ? (
              <div className="space-y-4">
                {/* 成功狀態 */}
                <div className="flex items-center gap-2 text-green-600 mb-4">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">轉換成功！</span>
                </div>

                {/* 長期 Token */}
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    長期 Access Token
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      readOnly
                      rows={3}
                      value={result.long_lived_token}
                      className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg font-mono text-sm text-fg"
                    />
                    <button onClick={() => copyToClipboard(result.long_lived_token!)} className="btn-ghost" title="複製 Token">
                      {copiedToken ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Token 資訊 */}
                {result.expires_in && (
                  <div className="bg-success/10 border border-success rounded-lg p-4">
                    <div className="flex items-center gap-2 text-success">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">
                        <strong>有效期限：</strong>{formatExpiresIn(result.expires_in)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* 錯誤狀態 */}
                <div className="flex items-center gap-2 text-red-600 mb-4">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">轉換失敗</span>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">{result.error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 相關連結 */}
        <div className="bg-surface rounded-2xl shadow-soft border border-border p-6 mt-6">
          <h2 className="font-semibold dual-text mb-4">相關資源</h2>

          <div className="space-y-3">
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Facebook 開發者平台
            </a>

            <a
              href="https://developers.facebook.com/docs/instagram-basic-display-api/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Instagram Basic Display API 文件
            </a>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
