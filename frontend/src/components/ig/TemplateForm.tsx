/**
 * Instagram 模板表單組件
 */

import React, { useState, useEffect } from 'react';

interface IGTemplate {
  id?: number;
  name: string;
  description: string;
  school_id: number | null;
  template_type: 'announcement' | 'general';
  is_active: boolean;
  canvas_config?: any;
  text_config?: any;
  attachment_config?: any;
  logo_config?: any;
  watermark_config?: any;
}

interface School {
  id: number;
  name: string;
}

interface Font {
  id: number;
  font_family: string;
  display_name: string;
  is_chinese_supported: boolean;
}

interface TemplateFormProps {
  template: IGTemplate | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const TemplateForm: React.FC<TemplateFormProps> = ({ template, onSuccess, onCancel }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<IGTemplate>({
    name: '',
    description: '',
    school_id: null,
    template_type: 'general',
    is_active: true,
    canvas_config: {
      width: 1080,
      height: 1080,
      background_color: '#FFFFFF'
    },
    text_config: {
      font_family: 'Arial',
      font_size: 32,
      color: '#000000',
      position: { x: 50, y: 50 },
      max_width: 980
    },
    attachment_config: {
      max_images: 4,
      layout: 'auto',
      padding: 20,
      spacing: 10
    }
  });

  useEffect(() => {
    fetchSchools();
    fetchFonts();
    if (template) {
      setFormData({
        ...template,
        canvas_config: template.canvas_config || formData.canvas_config,
        text_config: template.text_config || formData.text_config,
        attachment_config: template.attachment_config || formData.attachment_config
      });
    }
  }, [template]);

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
        throw new Error(data.error || '載入學校列表失敗');
      }
      setSchools(data.items || []);
    } catch (err) {
      console.error('載入學校列表失敗:', err);
    }
  };

  const fetchFonts = async () => {
    try {
      const response = await fetch('/api/admin/ig/fonts/available?per_page=100', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入字體列表失敗');
      }
      setFonts(data.fonts || []);
    } catch (err) {
      console.error('載入字體列表失敗:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = template?.id
        ? `/api/admin/ig/templates/${template.id}`
        : '/api/admin/ig/templates';

      const response = await fetch(url, {
        method: template?.id ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '儲存失敗');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || '儲存失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConfigChange = (configType: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [configType]: {
        ...prev[configType as keyof IGTemplate],
        [field]: value
      }
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-info-bg border border-info-border text-info-text px-4 py-3 rounded">
          {error}
        </div>
      )}

      
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">基本資訊</h3>

        <div>
          <label className="block text-sm font-medium mb-1">模板名稱 *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">模板類型 *</label>
            <select
              value={formData.template_type}
              onChange={(e) => handleChange('template_type', e.target.value)}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
              required
            >
              <option value="general">一般</option>
              <option value="announcement">公告</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              學校 <span className="text-muted-foreground text-xs">(空白 = 全校通用模板)</span>
            </label>
            <select
              value={formData.school_id || ''}
              onChange={(e) => handleChange('school_id', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
            >
              <option value="">全校通用</option>
              {schools.map(school => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_active"
            checked={formData.is_active}
            onChange={(e) => handleChange('is_active', e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="is_active" className="text-sm font-medium">啟用模板</label>
        </div>
      </div>

      
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">畫布配置</h3>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">寬度 (px)</label>
            <input
              type="number"
              value={formData.canvas_config?.width || 1080}
              onChange={(e) => handleConfigChange('canvas_config', 'width', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
              min="100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">高度 (px)</label>
            <input
              type="number"
              value={formData.canvas_config?.height || 1080}
              onChange={(e) => handleConfigChange('canvas_config', 'height', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
              min="100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">背景色</label>
            <input
              type="color"
              value={formData.canvas_config?.background_color || '#FFFFFF'}
              onChange={(e) => handleConfigChange('canvas_config', 'background_color', e.target.value)}
              className="w-full h-10 px-1 py-1 border rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">文字配置</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">字型</label>
            <select
              value={formData.text_config?.font_family || ''}
              onChange={(e) => handleConfigChange('text_config', 'font_family', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
            >
              <option value="">選擇字型</option>
              {fonts.map(font => (
                <option key={font.id} value={font.font_family}>
                  {font.display_name} {font.is_chinese_supported ? '（支援中文）' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">字體大小 (px)</label>
            <input
              type="number"
              value={formData.text_config?.font_size || 32}
              onChange={(e) => handleConfigChange('text_config', 'font_size', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
              min="8"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">文字顏色</label>
            <input
              type="color"
              value={formData.text_config?.color || '#000000'}
              onChange={(e) => handleConfigChange('text_config', 'color', e.target.value)}
              className="w-full h-10 px-1 py-1 border rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">最大寬度 (px)</label>
            <input
              type="number"
              value={formData.text_config?.max_width || 980}
              onChange={(e) => handleConfigChange('text_config', 'max_width', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#B8C5D6]"
              min="100"
            />
          </div>
        </div>
      </div>

      
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded hover:bg-hover transition"
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

export default TemplateForm;
