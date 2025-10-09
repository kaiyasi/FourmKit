/**
 * 字體申請表單組件（Campus Admin）
 * 用於向 Dev Admin 申請新字體
 */

import React, { useState } from 'react';

interface FontRequestFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const FontRequestForm: React.FC<FontRequestFormProps> = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    font_name: '',
    font_url: '',
    description: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 驗證
    if (!formData.font_name.trim()) {
      setError('請輸入字體名稱');
      setLoading(false);
      return;
    }

    if (!formData.reason.trim()) {
      setError('請說明申請理由');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/ig/fonts/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '提交失敗');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || '提交失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-danger-bg border border-danger-border text-danger-text px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* 字體名稱 */}
      <div>
        <label className="block text-sm font-medium mb-1">
          字體名稱 <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.font_name}
          onChange={(e) => setFormData({ ...formData, font_name: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          placeholder="例如：Noto Sans TC"
          required
        />
      </div>

      {/* 字體來源 URL */}
      <div>
        <label className="block text-sm font-medium mb-1">
          字體來源 URL（可選）
        </label>
        <input
          type="url"
          value={formData.font_url}
          onChange={(e) => setFormData({ ...formData, font_url: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          placeholder="https://fonts.google.com/..."
        />
        <p className="text-xs text-muted mt-1">提供字體下載或資訊頁面的連結</p>
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium mb-1">
          字體描述（可選）
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          rows={3}
          placeholder="簡短描述字體的特色和用途"
        />
      </div>

      {/* 申請理由 */}
      <div>
        <label className="block text-sm font-medium mb-1">
          申請理由 <span className="text-danger">*</span>
        </label>
        <textarea
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          rows={4}
          placeholder="說明為什麼需要這個字體，預計用於什麼樣的內容..."
          required
        />
      </div>

      {/* 按鈕 */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg hover:bg-surface-hover transition-colors"
          disabled={loading}
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '提交中...' : '提交申請'}
        </button>
      </div>
    </form>
  );
};

export default FontRequestForm;
