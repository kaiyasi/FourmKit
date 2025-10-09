/**
 * Instagram 帳號列表組件
 * 顯示所有 IG 帳號及其狀態
 */

import React, { useState, useEffect } from 'react';

interface IGAccount {
  id: number;
  school_id: number | null;
  school_name?: string;
  ig_user_id: string;
  username: string;
  app_id?: string;
  publish_mode: 'instant' | 'batch' | 'scheduled';
  batch_count: number;
  scheduled_times: string[] | null;
  is_active: boolean;
  token_status?: {
    expires_at: string | null;
    is_expired: boolean;
    needs_refresh: boolean;
    days_remaining: number;
  };
  last_publish_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

interface AccountListProps {
  onEdit: (account: IGAccount) => void;
  onRefresh: () => void;
}

const AccountList: React.FC<AccountListProps> = ({ onEdit, onRefresh }) => {
  const [accounts, setAccounts] = useState<IGAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/ig/accounts', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入帳號失敗');
      }
      setAccounts(data.accounts || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || '載入帳號失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (accountId: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/ig/accounts/${accountId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '更新失敗');
      }
      fetchAccounts();
      onRefresh();
    } catch (err: any) {
      alert(err.message || '更新失敗');
    }
  };

  const handleTestConnection = async (accountId: number) => {
    try {
      const response = await fetch(`/api/admin/ig/accounts/${accountId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '測試失敗');
      }
      if (data.is_valid) {
        alert(`✅ ${data.message || '連接測試成功！'}`);
      } else {
        alert(`❌ 連接測試失敗：${data.message || '未知錯誤'}`);
      }
    } catch (err: any) {
      alert(err.message || '測試失敗');
    }
  };

  const handleRefreshToken = async (accountId: number) => {
    if (!confirm('確定要刷新此帳號的 Token 嗎？')) return;

    try {
      const response = await fetch(`/api/admin/ig/accounts/${accountId}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        // 顯示更友好的錯誤訊息
        const errorMsg = data.message || data.error || 'Token 刷新失敗';
        throw new Error(errorMsg);
      }
      alert(`✅ ${data.message || 'Token 刷新成功！'}`);
      fetchAccounts();
    } catch (err: any) {
      alert(`❌ ${err.message || 'Token 刷新失敗'}`);
    }
  };

  const handleDelete = async (accountId: number) => {
    if (!confirm('確定要刪除此帳號嗎？此操作無法復原。')) return;

    try {
      const response = await fetch(`/api/admin/ig/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '刪除失敗');
      }
      alert('帳號已刪除');
      fetchAccounts();
      onRefresh();
    } catch (err: any) {
      alert(err.message || '刪除失敗');
    }
  };

  const getTokenStatus = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return { text: '未知', color: 'text-muted-foreground' };

    const now = new Date();
    const expires = new Date(expiresAt);
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return { text: '已過期', color: 'text-[#D6B8C5]' };
    if (daysLeft < 7) return { text: `${daysLeft} 天後過期`, color: 'text-[#D9C5B8]' };
    return { text: `${daysLeft} 天後過期`, color: 'text-[#7C9885]' };
  };

  const getPublishModeText = (mode: string) => {
    const modes = {
      instant: '即時發布',
      batch: '批次發布',
      scheduled: '排程發布'
    };
    return modes[mode as keyof typeof modes] || mode;
  };

  if (loading) {
    return <div className="text-center py-8">載入中...</div>;
  }

  if (error) {
    return (
      <div className="bg-info-bg border border-info-border text-info-text px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          尚未設定任何 Instagram 帳號
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => {
            const tokenStatus = getTokenStatus(account.token_status?.expires_at);

            return (
              <div
                key={account.id}
                className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  {/* 左側：帳號資訊 */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">@{account.username}</h3>
                      {account.is_active ? (
                        <span className="px-2 py-1 bg-success-bg text-success-text text-xs rounded">
                          啟用
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
                          停用
                        </span>
                      )}
                      <span className="px-2 py-1 bg-info-bg text-info-text text-xs rounded">
                        {getPublishModeText(account.publish_mode)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">學校：</span>
                        {account.school_name || '全平台'}
                      </div>
                      <div>
                        <span className="font-medium">IG User ID：</span>
                        {account.ig_user_id}
                      </div>
                      <div>
                        <span className="font-medium">Token 狀態：</span>
                        <span className={tokenStatus.color}>{tokenStatus.text}</span>
                      </div>
                      <div>
                        <span className="font-medium">最後發布：</span>
                        {account.last_publish_at
                          ? new Date(account.last_publish_at).toLocaleString('zh-TW')
                          : '尚未發布'}
                      </div>
                      {account.publish_mode === 'batch' && (
                        <div>
                          <span className="font-medium">批次數量：</span>
                          {account.batch_count} 篇
                        </div>
                      )}
                      {account.publish_mode === 'scheduled' && account.scheduled_times && (
                        <div>
                          <span className="font-medium">排程時間：</span>
                          {account.scheduled_times.join(', ')}
                        </div>
                      )}
                    </div>

                    {/* 錯誤訊息 */}
                    {account.last_error && (
                      <div className="mt-3 p-2 bg-warning-bg border border-warning-border rounded text-sm text-warning-text">
                        <div className="font-medium">最後錯誤：</div>
                        <div className="mt-1">{account.last_error}</div>
                        {account.last_error_at && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(account.last_error_at).toLocaleString('zh-TW')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 右側：操作按鈕 */}
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => onEdit(account)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleTestConnection(account.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                    >
                      測試連接
                    </button>
                    <button
                      onClick={() => handleRefreshToken(account.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                    >
                      刷新 Token
                    </button>
                    <button
                      onClick={() => handleToggleActive(account.id, account.is_active)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                    >
                      {account.is_active ? '停用' : '啟用'}
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition bg-danger text-white hover:bg-danger-hover"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AccountList;
