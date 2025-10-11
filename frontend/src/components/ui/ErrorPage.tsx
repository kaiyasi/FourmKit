import { AlertTriangle, Ban, LockKeyhole, SearchX, ShieldAlert, Timer, WifiOff, ServerCrash, Home, LifeBuoy, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import { IpBlockedError } from '@/contexts/AppContext';
import { api } from '@/services/api';

type Props = {
  status?: number;
  title?: string;
  message?: string;
  hint?: string;
  actionHref?: string;
  actionText?: string;
  showSupport?: boolean;
  showRetry?: boolean;
  onRetry?: () => void;
  actions?: IpBlockedError['actions'];
}

/**
 *
 */
export default function ErrorPage({ 
  status, 
  title, 
  message, 
  hint, 
  actionHref = '/', 
  actionText = '回到首頁',
  showSupport = true,
  showRetry = false,
  onRetry,
  actions
}: Props) {
  const variant = pickVariant(status);
  const Icon = variant.icon;
  
  const [activeTab, setActiveTab] = useState(actions?.[0]?.type || '');
  const [formData, setFormData] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = actions?.find(a => a.type === activeTab);
    if (!action) return;

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      await api(action.endpoint, {
        method: action.method,
        body: JSON.stringify(formData),
      });
      setSubmitStatus({ type: 'success', message: '請求已成功提交！頁面將在 3 秒後重新整理。' });
      setTimeout(() => window.location.reload(), 3000);
    } catch (err: any) {
      const message = err.message || '提交失敗，請稍後再試。';
      setSubmitStatus({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentAction = actions?.find(a => a.type === activeTab);

  const supportUrl = `/support?prefill=${encodeURIComponent(JSON.stringify({
    category: 'technical',
    priority: 'medium',
    subject: `系統錯誤 ${status || '未知'}`,
    body: `錯誤訊息：${message || '發生未知錯誤'}\n錯誤代碼：${status || '未知'}\n相關提示：${hint || '無'}`,
  }))}`;
  
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-surface via-surface to-surface/50">
      <div className="max-w-lg w-full rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-8 shadow-soft text-center">
        <div className={`mx-auto w-16 h-16 rounded-2xl ${variant.badgeBg} flex items-center justify-center mb-4 shadow-lg`}>
          <Icon className={`w-8 h-8 ${variant.badgeFg}`} />
        </div>
        
        {status && (
          <div className="text-sm text-muted mb-2 font-mono bg-muted/30 px-3 py-1 rounded-lg inline-block">
            錯誤代碼 {status}
          </div>
        )}
        
        <h1 className="text-2xl font-bold dual-text mb-3">{title || variant.title}</h1>
        
        {message && (
          <div className="text-sm text-muted mb-4 p-3 bg-muted/20 rounded-lg border border-border/50">
            <p className="whitespace-pre-wrap break-words">{message}</p>
          </div>
        )}
        
        {hint && !actions && (
          <div className="text-xs text-muted mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="whitespace-pre-wrap break-words">{hint}</p>
          </div>
        )}

        
        {actions ? (
          <div className="mt-6 text-left">
            <div className="border-b border-border mb-4">
              <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                {actions.map(action => (
                  <button
                    key={action.type}
                    onClick={() => setActiveTab(action.type)}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === action.type
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted hover:text-fg hover:border-border'
                    }`}>
                    {action.label}
                  </button>
                ))}
              </nav>
            </div>

            <form onSubmit={handleSubmit}>
              {currentAction?.fields.map(field => (
                <div key={field.name} className="mb-4">
                  <label htmlFor={field.name} className="block text-sm font-medium text-fg mb-1">
                    {field.label}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={field.name}
                      name={field.name}
                      rows={4}
                      value={formData[field.name] || ''}
                      onChange={handleInputChange}
                      className="form-control w-full"
                      required
                    />
                  ) : (
                    <input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={handleInputChange}
                      className="form-control w-full"
                      required
                    />
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-white font-bold py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50">
                {isSubmitting ? '提交中...' : '提交'}
              </button>
            </form>

            {submitStatus && (
              <div className={`mt-4 text-center p-2 rounded-md text-sm ${
                submitStatus.type === 'success' ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text'
              }`}>
                {submitStatus.message}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link 
              to={actionHref} 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border hover:bg-surface/80 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {actionText}
            </Link>
            
            {showRetry && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border hover:bg-surface/80 text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> 重試
              </button>
            )}
            
            {showSupport && (
              <Link 
                to={supportUrl}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 text-sm font-medium transition-colors shadow-sm"
              >
                <LifeBuoy className="w-4 h-4" /> 聯繫管理員
              </Link>
            )}
          </div>
        )}
        
        {!actions && showSupport && (
          <p className="text-xs text-muted mt-4">
            如果問題持續發生，請<Link to={supportUrl} className="text-primary hover:text-primary/80 underline">聯繫系統管理員</Link>獲取協助
          </p>
        )}
      </div>
    </div>
  )
}

function pickVariant(status?: number) {
  if (!status) return base('發生錯誤', AlertTriangle)
  if (status === 400) return base('請求有誤', AlertTriangle)
  if (status === 401) return base('需要登入', LockKeyhole)
  if (status === 403) return base('沒有權限', ShieldAlert)
  if (status === 404) return base('找不到頁面', SearchX)
  if (status === 408) return base('請求逾時', Timer)
  if (status === 429) return base('請求過於頻繁', Ban)
  if (status === 451) return {
    title: '此 IP 已受限制',
    icon: Ban,
    badgeBg: 'bg-red-100 dark:bg-red-900/30',
    badgeFg: 'text-red-700 dark:text-red-300',
  }
  if (status === 500) return base('伺服器錯誤', ServerCrash)
  if (status === 502 || status === 503 || status === 504) return base('服務暫時不可用', WifiOff)
  return base('發生錯誤', AlertTriangle)
}

function base(title: string, icon: any) {
  return {
    title,
    icon,
    badgeBg: 'bg-amber-100 dark:bg-amber-900/30',
    badgeFg: 'text-amber-700 dark:text-amber-300',
  }
}
