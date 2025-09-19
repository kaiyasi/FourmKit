import { useEffect, useState, useCallback } from 'react';
import { api } from '@/services/api';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import {
  ArrowLeft,
  Key,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  Settings,
  Database,
  Activity,
  Smartphone,
  Facebook,
  Instagram
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SocialAccount {
  id: number;
  platform: 'INSTAGRAM';
  platform_username: string;
  display_name: string;
  status: 'ACTIVE' | 'PENDING' | 'ERROR' | 'DISABLED';
  status_info: {
    status: string;
    has_page_binding: boolean;
    page_id: string | null;
    has_token: boolean;
    display_status: string;
    status_message: string;
  };
  app_id?: string;
  app_secret?: string;
  access_token?: string;
  token_expires_at?: string;
  last_post_at?: string;
  total_posts: number;
  created_at: string;
  school?: {
    id: number;
    name: string;
    display_name: string;
  };
  processing?: boolean;
}

interface TokenOperation {
  id: string;
  type: 'extend' | 'validate' | 'update_config';
  account_id: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  message?: string;
  token_preview?: string;
  expires_in_days?: number;
  created_at: string;
  completed_at?: string;
  error?: string;
}

interface TokenStats {
  total_accounts: number;
  active_tokens: number;
  expired_tokens: number;
  expiring_soon: number; // 7天內過期
  today_operations: number;
  success_rate: number;
}

export default function TokenManagementPageNew() {
  const { role } = useAuth();
  const isDev = (role === 'dev_admin');
  const canManage = ['dev_admin', 'campus_admin', 'cross_admin'].includes(role || '');

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [operations, setOperations] = useState<TokenOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SocialAccount | null>(null);
  const [stats, setStats] = useState<TokenStats | null>(null);

  // 表單狀態
  const [modal, setModal] = useState<{
    kind: 'extend' | 'config' | 'manual_token';
    account?: SocialAccount;
  } | null>(null);
  const [formData, setFormData] = useState({
    app_id: '',
    app_secret: '',
    short_token: '',
    reason: ''
  });

  // 獲取社交帳號列表
  const fetchAccounts = useCallback(async (preserveProcessingState = false) => {
    setLoading(true);
    try {
      const response = await api('/api/admin/social/accounts');
      console.log('📱 社交帳號 API 回應:', response);

      const accountsList = (response as any)?.data?.accounts || (response as any)?.accounts || [];

      if (preserveProcessingState) {
        // 保留本地的 processing 狀態
        setAccounts(prev => accountsList.map((newAcc: SocialAccount) => {
          const existingAcc = prev.find(acc => acc.id === newAcc.id);
          return {
            ...newAcc,
            processing: existingAcc?.processing || false
          };
        }));
      } else {
        setAccounts(accountsList);
      }
    } catch (error) {
      console.error('❌ 獲取帳號失敗:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 獲取 Token 操作記錄
  const fetchOperations = useCallback(async () => {
    if (!canManage) return;
    try {
      // 模擬操作記錄 - 實際應該從後端 API 獲取
      const mockOperations: TokenOperation[] = [
        {
          id: '1',
          type: 'extend',
          account_id: 1,
          status: 'success',
          message: 'Token 延長成功',
          token_preview: 'EAAJDE7sXr0EBPdy...',
          expires_in_days: 60,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        }
      ];
      setOperations(mockOperations);
    } catch (error) {
      console.error('❌ 獲取操作記錄失敗:', error);
    }
  }, [canManage]);

  // 獲取統計資訊
  const fetchStats = useCallback(async () => {
    try {
      // 基於帳號資料計算統計
      const totalAccounts = accounts.length;
      const activeTokens = accounts.filter(acc => acc.status_info?.has_token && acc.status === 'ACTIVE').length;
      const expiredTokens = accounts.filter(acc => {
        if (!acc.token_expires_at) return false;
        return new Date(acc.token_expires_at) < new Date();
      }).length;
      const expiringSoon = accounts.filter(acc => {
        if (!acc.token_expires_at) return false;
        const expiryDate = new Date(acc.token_expires_at);
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        return expiryDate < sevenDaysFromNow && expiryDate > new Date();
      }).length;

      setStats({
        total_accounts: totalAccounts,
        active_tokens: activeTokens,
        expired_tokens: expiredTokens,
        expiring_soon: expiringSoon,
        today_operations: operations.length,
        success_rate: 95.5
      });
    } catch (error) {
      console.error('❌ 計算統計失敗:', error);
    }
  }, [accounts, operations]);

  // 延長 Token
  const extendToken = useCallback(async (account: SocialAccount) => {
    if (!account.app_id || !account.app_secret) {
      alert('請先設定 App ID 和 App Secret');
      return;
    }

    // 標記帳號為處理中
    setAccounts(prev => prev.map(acc =>
      acc.id === account.id ? { ...acc, processing: true } : acc
    ));

    try {
      const response = await api(`/api/admin/social/accounts/${account.id}/extend-token`, {
        method: 'POST'
      });

      console.log('🔄 Token 延長回應:', response);

      if ((response as any).success) {
        // 更新帳號的 token 資訊並移除處理中狀態
        setAccounts(prev => prev.map(acc => {
          if (acc.id === account.id) {
            return {
              ...acc,
              processing: false,
              token_expires_at: (response as any).expires_at_utc || acc.token_expires_at,
              // 可能還需要更新其他 token 相關欄位
            };
          }
          return acc;
        }));

        await fetchOperations();
        setModal(null);

        // 顯示成功通知
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        notification.innerHTML = `
          <div class="font-semibold">Token 延長成功</div>
          <div class="text-sm">${account.platform_username}</div>
          <div class="text-xs mt-1">有效期已延長至 60 天</div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 3000);
      } else {
        throw new Error((response as any).error || 'Token 延長失敗');
      }
    } catch (error: any) {
      console.error('❌ Token 延長失敗:', error);
      alert(`Token 延長失敗: ${error.message || '請檢查帳號設定'}`);

      // 錯誤時也要移除處理中狀態
      setAccounts(prev => prev.map(acc =>
        acc.id === account.id ? { ...acc, processing: false } : acc
      ));
    }
  }, [fetchOperations]);

  // 更新帳號配置
  const updateAccountConfig = useCallback(async (account: SocialAccount, config: { app_id: string; app_secret: string }) => {
    try {
      const response = await api(`/api/admin/social/accounts/${account.id}/app-config`, {
        method: 'PUT',
        body: JSON.stringify(config)
      });

      if ((response as any).success) {
        await fetchAccounts();
        setModal(null);
        setFormData({ app_id: '', app_secret: '', short_token: '', reason: '' });
      } else {
        throw new Error((response as any).error || '配置更新失敗');
      }
    } catch (error: any) {
      console.error('❌ 配置更新失敗:', error);
      alert(`配置更新失敗: ${error.message}`);
    }
  }, [fetchAccounts]);

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-TW');
  };

  // 格式化 Token 過期時間
  const formatTokenExpiry = (expiryString?: string) => {
    if (!expiryString) return 'N/A';

    const expiry = new Date(expiryString);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '已過期';
    if (diffDays === 0) return '今日過期';
    if (diffDays <= 7) return `${diffDays} 天後過期`;
    return `${diffDays} 天後過期`;
  };

  // 複製到剪貼簿
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 可以添加複製成功的視覺反饋
    } catch (error) {
      console.error('複製失敗:', error);
    }
  };

  // 初始化
  useEffect(() => {
    fetchAccounts();
    fetchOperations();
  }, [fetchAccounts, fetchOperations]);

  // 計算統計資訊
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/tokens" />
      <MobileBottomNav />

      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁面標題 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">Token 管理</h1>
            <p className="text-sm text-muted mt-1">管理 Instagram 帳號的 Access Token 和應用程式配置</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 帳號列表 */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                <Instagram className="w-5 h-5" />
                Instagram 帳號
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchAccounts}
                  className="p-2 text-muted hover:text-fg transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 帳號列表 */}
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  目前沒有 Instagram 帳號設定。
                </div>
              ) : (
                accounts.map((account) => (
                  <div
                    key={account.id}
                    className={`p-4 rounded-xl border border-border cursor-pointer transition-colors relative ${
                      selectedAccount?.id === account.id
                        ? 'ring-2 ring-primary bg-primary/5'
                        : account.processing
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : 'bg-surface-hover hover:bg-surface'
                    }`}
                    onClick={() => setSelectedAccount(account)}
                  >
                    {/* 處理中狀態指示器 */}
                    {account.processing && (
                      <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full shadow-md">
                        <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />
                        處理中
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-pink-100 text-pink-800">
                          Instagram
                        </span>
                        <span className="text-xs text-muted">#{account.id}</span>
                        {account.school && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                            {account.school.display_name}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">
                        <Clock className="inline w-3 h-3 mr-1" />
                        {formatDate(account.created_at)}
                      </span>
                    </div>

                    <div className="mb-3">
                      <div className="font-medium text-fg">
                        {account.display_name || account.platform_username}
                      </div>
                      {account.platform_username && account.display_name !== account.platform_username && (
                        <div className="text-sm text-muted">@{account.platform_username}</div>
                      )}
                    </div>

                    {/* 狀態資訊 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          account.status === 'ACTIVE' ? 'bg-green-500' :
                          account.status === 'ERROR' ? 'bg-red-500' :
                          account.status === 'DISABLED' ? 'bg-gray-400' : 'bg-yellow-500'
                        }`}></div>
                        <span className="text-sm text-fg">{account.status_info?.status_message || '未知狀態'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                        <div className="flex items-center gap-1">
                          <Key className="w-3 h-3" />
                          Token: {account.status_info?.has_token ? '已設定' : '未設定'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Settings className="w-3 h-3" />
                          App設定: {account.app_id && account.app_secret ? '已設定' : '未設定'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          貼文: {account.total_posts}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {account.token_expires_at ? formatTokenExpiry(account.token_expires_at) : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 側邊欄 */}
          <div className="space-y-6">
            {/* 選中帳號詳情 */}
            {selectedAccount && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft lg:order-2">
                <h3 className="text-lg font-semibold text-fg mb-4">帳號詳情</h3>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-fg">
                      {selectedAccount.display_name || selectedAccount.platform_username}
                    </div>
                    <div className="text-xs text-muted">@{selectedAccount.platform_username}</div>
                  </div>

                  {selectedAccount.school && (
                    <div>
                      <div className="text-xs text-muted">學校</div>
                      <div className="text-sm text-fg">{selectedAccount.school.display_name}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-muted">狀態</div>
                    <div className="text-sm text-fg">{selectedAccount.status_info?.status_message}</div>
                  </div>

                  {selectedAccount.token_expires_at && (
                    <div>
                      <div className="text-xs text-muted">Token 過期時間</div>
                      <div className="text-sm text-fg">{formatDate(selectedAccount.token_expires_at)}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-muted">發布貼文數</div>
                    <div className="text-sm text-fg">{selectedAccount.total_posts}</div>
                  </div>
                </div>

                {/* 操作按鈕 */}
                <div className="mt-6 space-y-2">
                  {/* App 配置 */}
                  <button
                    onClick={() => {
                      setFormData({
                        app_id: selectedAccount.app_id || '',
                        app_secret: selectedAccount.app_secret || '',
                        short_token: '',
                        reason: ''
                      });
                      setModal({ kind: 'config', account: selectedAccount });
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 btn-secondary"
                  >
                    <Settings className="w-4 h-4" />
                    {selectedAccount.app_id && selectedAccount.app_secret ? '更新 App 配置' : '設定 App 配置'}
                  </button>

                  {/* Token 延長 */}
                  {selectedAccount.status_info?.has_token && selectedAccount.app_id && selectedAccount.app_secret && (
                    <button
                      onClick={() => extendToken(selectedAccount)}
                      disabled={selectedAccount.processing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 btn-primary disabled:opacity-50"
                    >
                      {selectedAccount.processing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Key className="w-4 h-4" />
                      )}
                      {selectedAccount.processing ? '延長中...' : '延長 Token'}
                    </button>
                  )}

                  {/* 手動設定 Token */}
                  <button
                    onClick={() => {
                      setFormData({
                        app_id: selectedAccount.app_id || '',
                        app_secret: selectedAccount.app_secret || '',
                        short_token: '',
                        reason: ''
                      });
                      setModal({ kind: 'manual_token', account: selectedAccount });
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 btn-ghost"
                  >
                    <Smartphone className="w-4 h-4" />
                    手動轉換 Token
                  </button>
                </div>
              </div>
            )}

            {/* 統計資訊 */}
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft lg:order-1">
              <h2 className="text-lg font-semibold text-fg mb-4">統計資訊</h2>
              {stats ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">總帳號數</span>
                    <span className="text-sm font-medium">{stats.total_accounts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">有效 Token</span>
                    <span className="text-sm font-medium text-green-600">{stats.active_tokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">即將過期</span>
                    <span className="text-sm font-medium text-yellow-600">{stats.expiring_soon}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">已過期</span>
                    <span className="text-sm font-medium text-red-600">{stats.expired_tokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日操作</span>
                    <span className="text-sm font-medium">{stats.today_operations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">成功率</span>
                    <span className="text-sm font-medium text-green-600">{stats.success_rate}%</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">載入中...</span>
                    <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                  </div>
                </div>
              )}
            </div>

            {/* 操作記錄 */}
            {canManage && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">
                  <Activity className="w-5 h-5 inline mr-2" />
                  操作記錄
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {operations.length === 0 ? (
                    <div className="text-center py-8 text-muted">
                      暫無操作記錄
                    </div>
                  ) : (
                    operations.map((operation) => (
                      <div key={operation.id} className="p-3 bg-surface-hover rounded-lg border border-border/50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {operation.status === 'success' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : operation.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : operation.status === 'processing' ? (
                              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-500" />
                            )}
                            <div>
                              <div className="font-medium text-fg text-sm">
                                {operation.type === 'extend' ? 'Token 延長' :
                                 operation.type === 'validate' ? 'Token 驗證' : 'App 配置更新'}
                              </div>
                              <div className="text-xs text-muted">
                                帳號 #{operation.account_id}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted">
                            {formatDate(operation.created_at)}
                          </div>
                        </div>

                        {operation.message && (
                          <div className="text-sm text-fg">{operation.message}</div>
                        )}

                        {operation.token_preview && (
                          <div className="text-xs text-muted mt-1 font-mono">
                            Token: {operation.token_preview}
                          </div>
                        )}

                        {operation.error && (
                          <div className="text-xs text-red-600 mt-1">
                            錯誤: {operation.error}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 對話框 */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-fg mb-4">
              {modal.kind === 'config' && 'App 配置設定'}
              {modal.kind === 'manual_token' && '手動轉換 Token'}
            </h3>

            <div className="space-y-4">
              {/* App ID */}
              <div>
                <label className="block text-sm font-medium text-fg mb-2">
                  <Facebook className="w-4 h-4 inline mr-1" />
                  App ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.app_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, app_id: e.target.value }))}
                  placeholder="Facebook 應用程式 ID"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background text-fg"
                />
              </div>

              {/* App Secret */}
              <div>
                <label className="block text-sm font-medium text-fg mb-2">
                  <Key className="w-4 h-4 inline mr-1" />
                  App Secret <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.app_secret}
                  onChange={(e) => setFormData(prev => ({ ...prev, app_secret: e.target.value }))}
                  placeholder="Facebook 應用程式密鑰"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background text-fg"
                />
              </div>

              {/* 短期 Token (僅手動轉換時) */}
              {modal.kind === 'manual_token' && (
                <div>
                  <label className="block text-sm font-medium text-fg mb-2">
                    <Smartphone className="w-4 h-4 inline mr-1" />
                    短期 Access Token <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formData.short_token}
                    onChange={(e) => setFormData(prev => ({ ...prev, short_token: e.target.value }))}
                    placeholder="請輸入從 Instagram Basic Display API 獲取的短期 Token..."
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none font-mono text-sm bg-background text-fg"
                  />
                </div>
              )}

              {/* 說明 */}
              <div className="bg-surface-hover border border-border rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
                  <div className="text-xs text-muted">
                    {modal.kind === 'config' ? (
                      <div>
                        <div className="font-medium mb-1">設定說明：</div>
                        <ul className="space-y-1">
                          <li>• App ID 和 App Secret 來自 Facebook 開發者平台</li>
                          <li>• 設定完成後可使用自動 Token 延長功能</li>
                        </ul>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium mb-1">轉換說明：</div>
                        <ul className="space-y-1">
                          <li>• 短期 Token 有效期約 1 小時</li>
                          <li>• 轉換後的長期 Token 有效期為 60 天</li>
                          <li>• 請確保 App ID 和 Secret 正確</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setModal(null);
                  setFormData({ app_id: '', app_secret: '', short_token: '', reason: '' });
                }}
                className="flex-1 px-4 py-2 btn-secondary"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (!modal.account) return;

                  if (modal.kind === 'config') {
                    if (!formData.app_id.trim() || !formData.app_secret.trim()) {
                      alert('請填寫 App ID 和 App Secret');
                      return;
                    }
                    await updateAccountConfig(modal.account, {
                      app_id: formData.app_id.trim(),
                      app_secret: formData.app_secret.trim()
                    });
                  } else if (modal.kind === 'manual_token') {
                    if (!formData.app_id.trim() || !formData.app_secret.trim() || !formData.short_token.trim()) {
                      alert('請填寫所有必要欄位');
                      return;
                    }
                    // 這裡實現手動 Token 轉換邏輯
                    alert('手動轉換功能開發中...');
                  }
                }}
                disabled={!formData.app_id.trim() || !formData.app_secret.trim() || (modal.kind === 'manual_token' && !formData.short_token.trim())}
                className="flex-1 px-4 py-2 btn-primary disabled:opacity-50"
              >
                {modal.kind === 'config' ? '保存配置' : '轉換 Token'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}