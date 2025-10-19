import React, { useState } from 'react';
import { X, Instagram, AlertCircle, CheckCircle } from 'lucide-react';

interface InstagramAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const InstagramAccountModal: React.FC<InstagramAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    access_token: '',
    display_name: '',
    description: '',
    publish_mode: 'immediate',
    batch_threshold: 5,
    auto_hashtags: '',
    school_id: null as number | null,
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: 輸入token, 2: 選擇帳號, 3: 設定
  const [igAccounts, setIgAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  const handleTokenValidation = async () => {
    if (!formData.access_token.trim()) {
      setError('請輸入 Facebook Access Token');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/instagram/validate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          access_token: formData.access_token
        })
      });

      const data = await response.json();
      
      if (data.success && data.ig_accounts && data.ig_accounts.length > 0) {
        setIgAccounts(data.ig_accounts);
        setStep(2);
      } else {
        setError(data.error || 'Token 驗證失敗，請確認 Token 是否正確且具有 Instagram Business Account 權限');
      }
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSelect = (account: any) => {
    setSelectedAccount(account);
    setFormData(prev => ({
      ...prev,
      display_name: account.name || `@${account.username}`
    }));
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!formData.display_name.trim()) {
      setError('請輸入顯示名稱');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/instagram/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          access_token: formData.access_token,
          display_name: formData.display_name,
          description: formData.description,
          publish_mode: formData.publish_mode,
          batch_threshold: formData.batch_threshold,
          auto_hashtags: formData.auto_hashtags ? formData.auto_hashtags.split(',').map(tag => tag.trim()) : [],
          school_id: formData.school_id,
          selected_account: selectedAccount
        })
      });

      const data = await response.json();
      
      if (data.success) {
        onSuccess();
        handleClose();
      } else {
        setError(data.error || '創建帳號失敗');
      }
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      access_token: '',
      display_name: '',
      description: '',
      publish_mode: 'immediate',
      batch_threshold: 5,
      auto_hashtags: '',
      school_id: null,
    });
    setStep(1);
    setError('');
    setIgAccounts([]);
    setSelectedAccount(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <Instagram className="w-6 h-6 text-pink-500 mr-2" />
            <h3 className="text-lg font-semibold">新增 Instagram 帳號</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-2 bg-gray-50">
          <div className="flex items-center text-sm text-gray-600">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mr-2 ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300'
            }`}>
              1
            </div>
            <span className={step >= 1 ? 'text-blue-600' : ''}>驗證 Token</span>
            
            <div className="flex-1 border-t mx-2"></div>
            
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mr-2 ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300'
            }`}>
              2
            </div>
            <span className={step >= 2 ? 'text-blue-600' : ''}>選擇帳號</span>
            
            <div className="flex-1 border-t mx-2"></div>
            
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mr-2 ${
              step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-300'
            }`}>
              3
            </div>
            <span className={step >= 3 ? 'text-blue-600' : ''}>帳號設定</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Facebook Access Token
                </label>
                <textarea
                  value={formData.access_token}
                  onChange={(e) => setFormData({...formData, access_token: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="請貼上您的 Facebook User Access Token..."
                  disabled={loading}
                />
              </div>
              
              <div className="bg-blue-50 p-4 rounded-md">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">如何獲取 Access Token？</h4>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>前往 Facebook 開發者工具</li>
                  <li>選擇您的應用程式</li>
                  <li>確保應用程式具有 Instagram Basic Display 和 Pages 權限</li>
                  <li>生成用戶 Access Token</li>
                </ol>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center text-green-600 mb-4">
                <CheckCircle className="w-5 h-5 mr-2" />
                <span className="text-sm font-medium">Token 驗證成功！請選擇要連接的 Instagram 帳號：</span>
              </div>
              
              <div className="space-y-3">
                {igAccounts.map((account) => (
                  <div 
                    key={account.id} 
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedAccount?.id === account.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                    onClick={() => handleAccountSelect(account)}
                  >
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                        {account.profile_picture_url ? (
                          <img 
                            src={account.profile_picture_url} 
                            alt={account.username}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <Instagram className="w-6 h-6 text-pink-500" />
                        )}
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="font-semibold">@{account.username}</div>
                        <div className="text-sm text-gray-600">{account.name}</div>
                        <div className="text-xs text-gray-500">{account.media_count} 則貼文</div>
                      </div>
                      {selectedAccount?.id === account.id && (
                        <CheckCircle className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center text-blue-600 mb-4">
                <Instagram className="w-5 h-5 mr-2" />
                <span className="text-sm font-medium">
                  設定 @{selectedAccount?.username} 的發文參數
                </span>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  顯示名稱 *
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：學校官方 Instagram"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="帳號用途說明..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  發布模式
                </label>
                <select
                  value={formData.publish_mode}
                  onChange={(e) => setFormData({...formData, publish_mode: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="immediate">立即發布</option>
                  <option value="batch">批量發布</option>
                  <option value="scheduled">定時發布</option>
                </select>
              </div>

              {formData.publish_mode === 'batch' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    批量閾值
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formData.batch_threshold}
                    onChange={(e) => setFormData({...formData, batch_threshold: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    累積多少則貼文時自動批量發布
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  預設標籤
                </label>
                <input
                  type="text"
                  value={formData.auto_hashtags}
                  onChange={(e) => setFormData({...formData, auto_hashtags: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：校園生活,學生活動（用逗號分隔）"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            取消
          </button>
          
          {step === 1 ? (
            <button
              onClick={handleTokenValidation}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={loading || !formData.access_token.trim()}
            >
              {loading ? '驗證中...' : '驗證 Token'}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={loading || !formData.display_name.trim()}
            >
              {loading ? '創建中...' : '創建帳號'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstagramAccountModal;