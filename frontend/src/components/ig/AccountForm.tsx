/**
 * Instagram 帳號表單組件
 * 用於創建和編輯 IG 帳號
 */

import React, { useState, useEffect } from 'react';

interface School {
  id: number;
  name: string;
  short_name: string;
}

interface Template {
  id: number;
  name: string;
  template_type: string;
}

interface IGAccountFormData {
  school_id: number | null;
  ig_user_id: string;
  username: string;
  access_token: string;
  app_id: string;
  app_secret: string;
  publish_mode: 'instant' | 'batch' | 'scheduled';
  batch_count: number;
  scheduled_times: string[];
  announcement_template_id: number | null;
  general_template_id: number | null;
}

interface AccountFormProps {
  account?: any; // 編輯模式時傳入
  onSave: () => void;
  onCancel: () => void;
}

const AccountForm: React.FC<AccountFormProps> = ({ account, onSave, onCancel }) => {
  const [formData, setFormData] = useState<IGAccountFormData>({
    school_id: null, // 必填，會在第一次載入學校時自動設置
    ig_user_id: '',
    username: '',
    access_token: '',
    app_id: '',
    app_secret: '',
    publish_mode: 'batch',
    batch_count: 10,
    scheduled_times: [],
    announcement_template_id: null,
    general_template_id: null
  });

  const [schools, setSchools] = useState<School[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasAppSecret, setHasAppSecret] = useState(false);

  useEffect(() => {
    fetchSchools();
    fetchTemplates();

    if (account) {
      // Debug: 檢查後端返回的資料
      console.log('[AccountForm] Received account data:', {
        id: account.id,
        has_access_token: account.has_access_token,
        has_app_secret: account.has_app_secret,
        access_token: account.access_token,
        app_secret: account.app_secret,
        app_id: account.app_id
      });

      // 安全檢查：如果後端錯誤地返回了敏感資料，發出警告
      if (account.access_token || account.app_secret) {
        console.error('[AccountForm] SECURITY WARNING: Backend returned sensitive data!', {
          has_access_token_value: !!account.access_token,
          has_app_secret_value: !!account.app_secret
        });
      }

      setFormData({
        school_id: account.school_id,
        ig_user_id: account.ig_user_id,
        username: account.username,
        access_token: '', // 強制為空（安全考量）
        app_id: account.app_id || '',
        app_secret: '', // 強制為空（安全考量）
        publish_mode: account.publish_mode,
        batch_count: account.batch_count || 10,
        scheduled_times: account.scheduled_times || [],
        announcement_template_id: account.announcement_template_id,
        general_template_id: account.general_template_id
      });
      setHasAccessToken(account.has_access_token || false);
      setHasAppSecret(account.has_app_secret || false);
    }
  }, [account]);

  const fetchSchools = async () => {
    try {
      const response = await fetch('/api/schools/admin', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入學校失敗');
      }
      setSchools(data.items || []);
    } catch (err) {
      console.error('載入學校失敗:', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/admin/ig/templates', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入模板失敗');
      }
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('載入模板失敗:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 驗證
    if (!formData.school_id) {
      alert('請選擇學校');
      return;
    }

    if (!formData.ig_user_id || !formData.username) {
      alert('請填寫必填欄位');
      return;
    }

    if (!account && !formData.access_token) {
      alert('請輸入 Access Token');
      return;
    }

    if (formData.publish_mode === 'batch' && formData.batch_count < 1) {
      alert('批次數量必須至少為 1');
      return;
    }

    if (formData.publish_mode === 'scheduled' && formData.scheduled_times.length === 0) {
      alert('排程模式至少需要設定一個時間');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        ...formData,
        // 修剪空格
        ig_user_id: formData.ig_user_id.trim(),
        username: formData.username.trim(),
        // 只在有輸入新 token/app_id/app_secret 時才傳送
        ...(formData.access_token ? { access_token: formData.access_token } : {}),
        ...(formData.app_id ? { app_id: formData.app_id.trim() } : {}),
        ...(formData.app_secret ? { app_secret: formData.app_secret } : {})
      };

      const url = account
        ? `/api/admin/ig/accounts/${account.id}`
        : '/api/admin/ig/accounts';

      const response = await fetch(url, {
        method: account ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Backend error response:', data);
        const errorMsg = data.message || data.error || '儲存失敗';
        throw new Error(errorMsg);
      }

      console.log('Account saved successfully:', data);
      alert(account ? '帳號已更新' : '帳號已創建');
      onSave();
    } catch (err: any) {
      console.error('Account save error:', err);
      // 顯示更詳細的錯誤訊息
      const errorMessage = err.message || err.toString() || '儲存失敗';
      alert(`儲存失敗：${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddScheduledTime = () => {
    if (!timeInput) return;

    // 驗證時間格式 HH:MM
    if (!/^\d{2}:\d{2}$/.test(timeInput)) {
      alert('時間格式錯誤，請使用 HH:MM 格式（例如：09:00）');
      return;
    }

    if (formData.scheduled_times.includes(timeInput)) {
      alert('此時間已存在');
      return;
    }

    setFormData({
      ...formData,
      scheduled_times: [...formData.scheduled_times, timeInput].sort()
    });
    setTimeInput('');
  };

  const handleRemoveScheduledTime = (time: string) => {
    setFormData({
      ...formData,
      scheduled_times: formData.scheduled_times.filter(t => t !== time)
    });
  };

  const announcementTemplates = templates.filter(t => t.template_type === 'announcement');
  const generalTemplates = templates.filter(t => t.template_type === 'general');

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-bold">
        {account ? '編輯 Instagram 帳號' : '新增 Instagram 帳號'}
      </h2>

      {/* 基本資訊 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">基本資訊</h3>

        <div>
          <label className="block text-sm font-medium mb-1">
            學校 <span className="text-[#D6B8C5]">*</span>
          </label>
          <select
            value={formData.school_id || ''}
            onChange={(e) => setFormData({ ...formData, school_id: e.target.value ? Number(e.target.value) : null })}
            className="w-full border rounded px-3 py-2"
            required
          >
            <option value="">請選擇學校</option>
            {schools.map(school => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Instagram User ID <span className="text-[#D6B8C5]">*</span>
          </label>
          <input
            type="text"
            value={formData.ig_user_id}
            onChange={(e) => setFormData({ ...formData, ig_user_id: e.target.value })}
            className="w-full border rounded px-3 py-2"
            placeholder="例如：17841400000000000"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            用戶名 <span className="text-[#D6B8C5]">*</span>
          </label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="w-full border rounded px-3 py-2"
            placeholder="例如：my_account"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Access Token (短期) {!account && <span className="text-[#D6B8C5]">*</span>}
            {account && <span className="text-muted-foreground"> (留空表示不更新)</span>}
          </label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              name="ig_access_token"
              value={formData.access_token}
              onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              className="flex-1 border rounded px-3 py-2"
              placeholder={account && hasAccessToken ? '••••••••（已設定，留空表示不更新）' : '從 Graph API Explorer 獲取'}
              required={!account}
              autoComplete="off"
              data-form-type="other"
              data-lpignore="true"
              readOnly
              onFocus={(e) => e.target.removeAttribute('readonly')}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
            >
              {showToken ? '隱藏' : '顯示'}
            </button>
          </div>
          {account && hasAccessToken ? (
            <p className="text-xs text-[#7C9885] mt-1">
              ✓ 已設定 Access Token
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              從 <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="underline">Graph API Explorer</a> 獲取短期 Token，系統會自動轉換為長期 Token
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Facebook App ID
            {account && <span className="text-muted-foreground"> (選填，用於 Token 自動轉換)</span>}
          </label>
          <input
            type="text"
            value={formData.app_id}
            onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
            className="w-full border rounded px-3 py-2"
            placeholder="例如：123456789012345"
          />
          <p className="text-xs text-muted-foreground mt-1">
            提供 App ID 和 Secret 可自動將短期 Token 轉換為 60 天長期 Token
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Facebook App Secret
            {account && <span className="text-muted-foreground"> (選填，留空表示不更新)</span>}
          </label>
          <input
            type="password"
            name="fb_app_secret"
            value={formData.app_secret}
            onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            className="w-full border rounded px-3 py-2"
            placeholder={account && hasAppSecret ? '••••••••（已設定，留空表示不更新）' : '輸入 App Secret'}
            autoComplete="off"
            data-form-type="other"
            data-lpignore="true"
            readOnly
            onFocus={(e) => e.target.removeAttribute('readonly')}
          />
          {account && hasAppSecret && (
            <p className="text-xs text-[#7C9885] mt-1">
              ✓ 已設定 App Secret
            </p>
          )}
        </div>
      </div>

      {/* 發布模式 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">發布模式</h3>

        <div>
          <label className="block text-sm font-medium mb-1">模式 <span className="text-[#D6B8C5]">*</span></label>
          <select
            value={formData.publish_mode}
            onChange={(e) => setFormData({ ...formData, publish_mode: e.target.value as any })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="instant">即時發布（公告專用）</option>
            <option value="batch">批次發布（累積 N 篇後發布輪播）</option>
            <option value="scheduled">排程發布（固定時間發布）</option>
          </select>
        </div>

        {formData.publish_mode === 'batch' && (
          <div>
            <label className="block text-sm font-medium mb-1">批次數量（1-10 篇）</label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.batch_count}
              onChange={(e) => setFormData({ ...formData, batch_count: Number(e.target.value) })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        )}

        {formData.publish_mode === 'scheduled' && (
          <div>
            <label className="block text-sm font-medium mb-1">排程時間</label>
            <div className="flex gap-2 mb-2">
              <input
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="flex-1 border rounded px-3 py-2"
              />
              <button
                type="button"
                onClick={handleAddScheduledTime}
                className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
              >
                新增
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.scheduled_times.map(time => (
                <span key={time} className="px-3 py-1 bg-info-bg text-info-text rounded flex items-center gap-2">
                  {time}
                  <button
                    type="button"
                    onClick={() => handleRemoveScheduledTime(time)}
                    className="text-[#D6B8C5] hover:opacity-80"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 模板綁定 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">模板綁定</h3>

        <div>
          <label className="block text-sm font-medium mb-1">公告模板</label>
          <select
            value={formData.announcement_template_id || ''}
            onChange={(e) => setFormData({ ...formData, announcement_template_id: e.target.value ? Number(e.target.value) : null })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">未選擇</option>
            {announcementTemplates.map(template => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">一般模板</label>
          <select
            value={formData.general_template_id || ''}
            onChange={(e) => setFormData({ ...formData, general_template_id: e.target.value ? Number(e.target.value) : null })}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">未選擇</option>
            {generalTemplates.map(template => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 按鈕 */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 border border-border rounded hover:bg-hover"
          disabled={loading}
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '儲存中...' : '儲存'}
        </button>
      </div>
    </form>
  );
};

export default AccountForm;
