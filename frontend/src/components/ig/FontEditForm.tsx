/**
 * 字體編輯表單組件（Dev Admin Only）
 * 用於編輯已上傳字體的資訊
 */

import React, { useState, useEffect } from 'react';

interface School {
  id: number;
  name: string;
}

interface Font {
  id: number;
  font_family: string;
  display_name: string;
  description: string;
  file_format: string;
  is_chinese_supported: boolean;
  weight: string | null;
  style: string | null;
  scope: string;
  school_id?: number | null;
  usage_count: number;
  last_used_at: string | null;
}

interface FontEditFormProps {
  font: Font;
  onSuccess: () => void;
  onCancel: () => void;
}

const FontEditForm: React.FC<FontEditFormProps> = ({ font, onSuccess, onCancel }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [formData, setFormData] = useState({
    display_name: font.display_name,
    description: font.description || '',
    weight: font.weight || '400',
    style: font.style || 'normal',
    is_chinese_supported: font.is_chinese_supported,
    scope: font.scope,
    school_id: font.school_id?.toString() || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const response = await fetch('/api/schools/admin', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setSchools(data.items || []);
      }
    } catch (err) {
      console.error('載入學校列表失敗:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 驗證
    if (!formData.display_name.trim()) {
      setError('請填寫顯示名稱');
      setLoading(false);
      return;
    }

    if (formData.scope === 'school' && !formData.school_id) {
      setError('學校範圍必須選擇學校');
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        display_name: formData.display_name,
        description: formData.description || null,
        weight: formData.weight,
        style: formData.style,
        is_chinese_supported: formData.is_chinese_supported,
        scope: formData.scope,
        school_id: formData.scope === 'school' ? parseInt(formData.school_id) : null
      };

      const response = await fetch(`/api/admin/ig/fonts/${font.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '更新失敗');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || '更新失敗');
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

      {/* 字體家族名稱（唯讀）*/}
      <div>
        <label className="block text-sm font-medium mb-1">字體家族名稱（唯讀）</label>
        <input
          type="text"
          value={font.font_family}
          disabled
          className="w-full px-3 py-2 border border-border rounded bg-surface-hover text-muted font-mono cursor-not-allowed"
        />
        <p className="text-xs text-muted mt-1">字體家族名稱無法修改</p>
      </div>

      {/* 顯示名稱 */}
      <div>
        <label className="block text-sm font-medium mb-1">
          顯示名稱 <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          required
        />
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium mb-1">描述</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          rows={2}
        />
      </div>

      {/* 中文支援 */}
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.is_chinese_supported}
            onChange={(e) => setFormData({ ...formData, is_chinese_supported: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm font-medium">支援中文</span>
        </label>
      </div>

      {/* 字重和樣式 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">字重</label>
          <select
            value={formData.weight}
            onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          >
            <option value="100">100 - Thin</option>
            <option value="200">200 - Extra Light</option>
            <option value="300">300 - Light</option>
            <option value="400">400 - Normal</option>
            <option value="500">500 - Medium</option>
            <option value="600">600 - Semi Bold</option>
            <option value="700">700 - Bold</option>
            <option value="800">800 - Extra Bold</option>
            <option value="900">900 - Black</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">樣式</label>
          <select
            value={formData.style}
            onChange={(e) => setFormData({ ...formData, style: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          >
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
            <option value="oblique">Oblique</option>
          </select>
        </div>
      </div>

      {/* 作用範圍 */}
      <div>
        <label className="block text-sm font-medium mb-1">作用範圍</label>
        <select
          value={formData.scope}
          onChange={(e) => setFormData({ ...formData, scope: e.target.value, school_id: '' })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
        >
          <option value="global">全域（所有學校可用）</option>
          <option value="school">學校專屬</option>
        </select>
      </div>

      {/* 學校選擇（僅 SCHOOL 範圍） */}
      {formData.scope === 'school' && (
        <div>
          <label className="block text-sm font-medium mb-1">
            所屬學校 <span className="text-danger">*</span>
          </label>
          <select
            value={formData.school_id}
            onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
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
      )}

      {/* 使用統計（唯讀）*/}
      <div className="bg-surface-hover border border-border rounded-lg p-3">
        <div className="text-sm font-medium mb-2">使用統計</div>
        <div className="text-xs text-muted space-y-1">
          <div>使用次數：{font.usage_count}</div>
          {font.last_used_at && (
            <div>最後使用：{new Date(font.last_used_at).toLocaleString()}</div>
          )}
          <div>檔案格式：{font.file_format.toUpperCase()}</div>
        </div>
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
          {loading ? '更新中...' : '更新字體'}
        </button>
      </div>
    </form>
  );
};

export default FontEditForm;
