/**
 * 字體上傳表單組件（Dev Admin Only）
 * 用於上傳字體檔案到系統
 */

import React, { useState, useEffect } from 'react';

interface School {
  id: number;
  name: string;
}

interface FontUploadFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const FontUploadForm: React.FC<FontUploadFormProps> = ({ onSuccess, onCancel }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    font_family: '',
    display_name: '',
    description: '',
    weight: '400',
    style: 'normal',
    scope: 'global',
    school_id: '',
    language_support: 'universal' as 'chinese' | 'english' | 'universal'
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();

      if (!['ttf', 'otf', 'woff2'].includes(ext || '')) {
        setError('只支援 .ttf, .otf, .woff2 格式');
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('檔案大小不能超過 10MB');
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!file) {
      setError('請選擇字體檔案');
      setLoading(false);
      return;
    }

    if (!formData.font_family.trim() || !formData.display_name.trim()) {
      setError('請填寫所有必填欄位');
      setLoading(false);
      return;
    }

    if (formData.scope === 'SCHOOL' && !formData.school_id) {
      setError('學校範圍必須選擇學校');
      setLoading(false);
      return;
    }

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('font_family', formData.font_family);
      uploadData.append('display_name', formData.display_name);
      if (formData.description) uploadData.append('description', formData.description);
      uploadData.append('weight', formData.weight);
      uploadData.append('style', formData.style);
      uploadData.append('scope', formData.scope);
      uploadData.append('language_support', formData.language_support);
      if (formData.school_id) uploadData.append('school_id', formData.school_id);

      const response = await fetch('/api/admin/ig/fonts/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: uploadData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '上傳失敗');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || '上傳失敗');
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

      
      <div>
        <label className="block text-sm font-medium mb-1">
          字體檔案 <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <input
            type="file"
            accept=".ttf,.otf,.woff2"
            onChange={handleFileChange}
            className="hidden"
            id="font-file-input"
            required
          />
          <label
            htmlFor="font-file-input"
            className="block w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary cursor-pointer hover:bg-surface-hover transition-colors text-center"
          >
            {file ? (
              <span className="text-success-text">
                {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </span>
            ) : (
              <span className="text-muted">點擊選擇檔案</span>
            )}
          </label>
        </div>
        <p className="text-xs text-muted mt-1">
          支援格式：TTF, OTF, WOFF2 | 最大 10MB
        </p>
      </div>

      
      <div>
        <label className="block text-sm font-medium mb-1">
          字體家族名稱（CSS） <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.font_family}
          onChange={(e) => setFormData({ ...formData, font_family: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono"
          placeholder="例如：Noto-Sans-TC"
          required
        />
        <p className="text-xs text-muted mt-1">用於 CSS font-family，建議使用英文和連字號</p>
      </div>

      
      <div>
        <label className="block text-sm font-medium mb-1">
          顯示名稱 <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          placeholder="例如：思源黑體"
          required
        />
      </div>

      
      <div>
        <label className="block text-sm font-medium mb-1">描述</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          rows={2}
          placeholder="字體的簡短描述"
        />
      </div>

      
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

      
      <div>
        <label className="block text-sm font-medium mb-1">
          語言支援 <span className="text-danger">*</span>
        </label>
        <select
          value={formData.language_support}
          onChange={(e) => setFormData({ ...formData, language_support: e.target.value as 'chinese' | 'english' | 'universal' })}
          className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
          required
        >
          <option value="universal">通用（中英文皆支援）</option>
          <option value="chinese">僅中文</option>
          <option value="english">僅英文</option>
        </select>
        <p className="text-xs text-muted mt-1">根據字體檔案包含的字符集選擇</p>
      </div>

      
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
          {loading ? '上傳中...' : '上傳字體'}
        </button>
      </div>
    </form>
  );
};

export default FontUploadForm;
