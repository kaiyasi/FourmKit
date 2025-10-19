/**
 * Instagram 模板表單組件（完整版）
 * 包含所有配置選項
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface IGTemplate {
  id?: number;
  name: string;
  description: string;
  school_id: number | null;
  template_type: 'announcement' | 'general';
  is_active: boolean;
  canvas_config?: any;
  text_with_attachment?: any;
  text_without_attachment?: any;
  attachment_config?: any;
  logo_config?: any;
  watermark_config?: any;
  caption_template?: any;
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
  onFormDataChange?: (data: IGTemplate) => void;
}

const TemplateFormEnhanced: React.FC<TemplateFormProps> = ({ template, onSuccess, onCancel, onFormDataChange }) => {
  const [schools, setSchools] = useState<School[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedSections, setExpandedSections] = useState({
    canvas: true,
    textWith: true,
    textWithout: false,
    attachment: false,
    logo: false,
    watermark: false,
    caption: true
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [formData, setFormData] = useState<IGTemplate>({
    name: '',
    description: '',
    school_id: null,
    template_type: 'general',
    is_active: true,
    canvas_config: {
      width: 1080,
      height: 1080,
      background_type: 'color',
      background_color: '#FFFFFF',
      background_image: ''
    },
    text_with_attachment: {
      font_family: '',
      font_size: 32,
      color: '#000000',
      max_chars_per_line: 28,
      line_spacing: 10,
      truncate_text: '...',
      newline_mode: 'convert',
      box_size: 640,
      box_center_x: 540,
      box_center_y: 730,
      max_lines: 10,
      align: 'left'
    },
    text_without_attachment: {
      font_family: '',
      font_size: 36,
      color: '#000000',
      max_chars_per_line: 32,
      line_spacing: 12,
      truncate_text: '...',
      newline_mode: 'convert',
      box_size: 880,
      box_center_x: 540,
      box_center_y: 540,
      max_lines: 14,
      align: 'left'
    },
    attachment_config: {
      enabled: true,
      base_size: 450,
      border_radius: 20,
      spacing: 15,
      position_x: 70,
      position_y: 70
    },
    logo_config: {
      enabled: false,
      source: 'school_logo',
      custom_image: '',
      position_x: 50,
      position_y: 950,
      width: 150,
      height: 80,
      opacity: 1.0,
      layer_order: 100
    },
    watermark_config: {
      layer_order: 200,
      items: {
        custom_text: {
          enabled: true,
          text: '{campus}',
          font_family: '',
          font_size: 14,
          color: '#000000',
          opacity: 0.3,
          position_x: 50,
          position_y: 1050
        },
        timestamp: {
          enabled: true,
          format: 'MM/DD/YYYY HH:mm',
          timezone: 'UTC',
          font_family: '',
          font_size: 14,
          color: '#000000',
          opacity: 0.3,
          position_x: 200,
          position_y: 1050
        },
        formatted_id: {
          enabled: false,
          id_template: '#{school_short_name}_{post_type}_{post_id}',
          font_family: '',
          font_size: 14,
          color: '#000000',
          opacity: 0.3,
          position_x: 350,
          position_y: 1050
        }
      }
    },
    caption_template: {
      structure: ['header', 'divider', 'content', 'divider', 'post_id', 'footer', 'hashtags'],
      header: {
        enabled: true,
        text: '📢 校園公告'
      },
      footer: {
        enabled: true,
        text: 'ForumKit 校園討論平台'
      },
      post_id_format: {
        enabled: true,
        template: '#{school_short_name}_{post_type}_{post_id}',
        style: 'hashtag'
      },
      hashtags: {
        enabled: true,
        tags: ['校園', '公告', '學生']
      },
      divider: {
        enabled: true,
        text: '━━━━━━━━━━'
      }
    }
  });

  useEffect(() => {
    fetchSchools();
    fetchFonts();
    if (template) {
      console.log('[Template Init] Loading template:', template.id, template.name);
      console.log('[Template Init] watermark_config:', template.watermark_config);
      setFormData(prev => ({
        ...prev,
        ...template,
        canvas_config: {
          ...prev.canvas_config,
          ...(template.canvas_config || {}),
        },
        text_with_attachment: {
          ...prev.text_with_attachment,
          ...(template.text_with_attachment || {}),
        },
        text_without_attachment: {
          ...prev.text_without_attachment,
          ...(template.text_without_attachment || {}),
        },
        attachment_config: {
          ...prev.attachment_config,
          ...(template.attachment_config || {}),
        },
        logo_config: {
          ...prev.logo_config,
          ...(template.logo_config || {}),
        },
        watermark_config: {
          ...prev.watermark_config,
          ...(template.watermark_config || {}),
        },
        caption_template: {
          ...prev.caption_template,
          ...(template.caption_template || {}),
        },
      }));
    }
  }, [template]);

  useEffect(() => {
    try { onFormDataChange?.(formData) } catch {}
  }, [formData])

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
      if (response.ok) {
        setFonts(data.fonts || []);
      }
    } catch (err) {
      console.error('載入字型失敗:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      let payload = { ...formData } as any;
      if (payload.logo_config?.source === 'custom' && logoFile) {
        const fd = new FormData();
        fd.append('file', logoFile);
        const upRes = await fetch('/api/admin/ig/templates/logo/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          },
          body: fd
        });
        const upData = await upRes.json();
        if (!upRes.ok) {
          throw new Error(upData.message || upData.error || 'Logo 上傳失敗');
        }
        payload = {
          ...payload,
          logo_config: {
            ...payload.logo_config,
            custom_image: upData.path
          }
        };
      }

      const url = template?.id
        ? `/api/admin/ig/templates/${template.id}`
        : '/api/admin/ig/templates';

      const response = await fetch(url, {
        method: template?.id ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '儲存失敗');
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
    setFormData(prev => {
      if (typeof value === 'number' && Number.isNaN(value)) {
        return prev;
      }
      const previousSection = (prev[configType as keyof IGTemplate] as any) || {};
      return {
        ...prev,
        [configType]: {
          ...previousSection,
          [field]: value,
        },
      };
    });
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const SectionHeader: React.FC<{ title: string; section: keyof typeof expandedSections }> = ({ title, section }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between text-lg font-semibold border-b pb-2 hover:text-primary transition-colors"
    >
      <span>{title}</span>
      {expandedSections[section] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-danger-bg border border-danger-border text-danger-text px-4 py-3 rounded">
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
            className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">模板類型 *</label>
            <select
              value={formData.template_type}
              onChange={(e) => handleChange('template_type', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              required
            >
              <option value="general">一般</option>
              <option value="announcement">公告</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              學校 <span className="text-muted text-xs">(空白 = 全域模板)</span>
            </label>
            <select
              value={formData.school_id || ''}
              onChange={(e) => handleChange('school_id', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
            >
              <option value="">全域模板</option>
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
        <SectionHeader title="畫布配置" section="canvas" />
        {expandedSections.canvas && (
          <div className="grid grid-cols-3 gap-4 pl-4">
            <div>
              <label className="block text-sm font-medium mb-1">寬度 (px)</label>
              <input
                type="number"
                value={formData.canvas_config?.width || 1080}
                onChange={(e) => handleConfigChange('canvas_config', 'width', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">高度 (px)</label>
              <input
                type="number"
                value={formData.canvas_config?.height || 1080}
                onChange={(e) => handleConfigChange('canvas_config', 'height', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">背景類型</label>
              <select
                value={formData.canvas_config?.background_type || 'color'}
                onChange={(e) => handleConfigChange('canvas_config', 'background_type', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="color">純色</option>
                <option value="image">圖片</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">背景色</label>
              <input
                type="color"
                value={formData.canvas_config?.background_color || '#FFFFFF'}
                onChange={(e) => handleConfigChange('canvas_config', 'background_color', e.target.value)}
                className="w-full h-10 px-1 py-1 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}
      </div>

      
      <div className="space-y-4">
        <SectionHeader title="文字配置（有附件圖片時）" section="textWith" />
        {expandedSections.textWith && (
          <div className="grid grid-cols-3 gap-4 pl-4">
            <div>
              <label className="block text-sm font-medium mb-1">字型</label>
              <select
                value={formData.text_with_attachment?.font_family || ''}
                onChange={(e) => handleConfigChange('text_with_attachment', 'font_family', e.target.value)}
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
                value={formData.text_with_attachment?.font_size || 32}
                onChange={(e) => handleConfigChange('text_with_attachment', 'font_size', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="8"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">文字顏色</label>
              <input
                type="color"
                value={formData.text_with_attachment?.color || '#000000'}
                onChange={(e) => handleConfigChange('text_with_attachment', 'color', e.target.value)}
                className="w-full h-10 px-1 py-1 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">對齊方式</label>
              <select
                value={formData.text_with_attachment?.align || 'left'}
                onChange={(e) => handleConfigChange('text_with_attachment', 'align', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="left">靠左</option>
                <option value="right">靠右</option>
                <option value="justify">填滿</option>
                <option value="center">置中</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">每行字數上限</label>
              <input
                type="number"
                value={formData.text_with_attachment?.max_chars_per_line ?? 28}
                onChange={(e) => handleConfigChange('text_with_attachment', 'max_chars_per_line', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">垂直對齊</label>
              <select
                value={formData.text_with_attachment?.vertical_align || 'top'}
                onChange={(e) => handleConfigChange('text_with_attachment', 'vertical_align', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="top">靠上</option>
                <option value="center">置中（以行數）</option>
                <option value="bottom">靠下</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">文字區塊大小 (px)</label>
              <input
                type="number"
                value={formData.text_with_attachment?.box_size || 640}
                onChange={(e) => handleConfigChange('text_with_attachment', 'box_size', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">區塊中心 X (px)</label>
              <input
                type="number"
                value={formData.text_with_attachment?.box_center_x || 540}
                onChange={(e) => handleConfigChange('text_with_attachment', 'box_center_x', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">區塊中心 Y (px)</label>
              <input
                type="number"
                value={formData.text_with_attachment?.box_center_y || 730}
                onChange={(e) => handleConfigChange('text_with_attachment', 'box_center_y', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">最多行數</label>
              <input
                type="number"
                value={formData.text_with_attachment?.max_lines || 10}
                onChange={(e) => handleConfigChange('text_with_attachment', 'max_lines', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">行間距 (px)</label>
              <input
                type="number"
                value={formData.text_with_attachment?.line_spacing || 10}
                onChange={(e) => handleConfigChange('text_with_attachment', 'line_spacing', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">截斷符號</label>
              <input
                type="text"
                value={formData.text_with_attachment?.truncate_text || '...'}
                onChange={(e) => handleConfigChange('text_with_attachment', 'truncate_text', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">\n 處理方式</label>
              <select
                value={formData.text_with_attachment?.newline_mode || 'convert'}
                onChange={(e) => handleConfigChange('text_with_attachment', 'newline_mode', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="convert">視為換行（將 \n 轉成換行）</option>
                <option value="literal">保留原樣（\n 顯示為文字）</option>
              </select>
            </div>
          </div>
        )}
      </div>

      
      <div className="space-y-4">
        <SectionHeader title="文字配置（無附件圖片時）" section="textWithout" />
        {expandedSections.textWithout && (
          <div className="grid grid-cols-3 gap-4 pl-4">
            
            <div>
              <label className="block text-sm font-medium mb-1">字型</label>
              <select
                value={formData.text_without_attachment?.font_family || ''}
                onChange={(e) => handleConfigChange('text_without_attachment', 'font_family', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="">選擇字型</option>
                {fonts.map(font => (
                  <option key={font.id} value={font.font_family}>
                    {font.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">字體大小 (px)</label>
              <input
                type="number"
                value={formData.text_without_attachment?.font_size || 36}
                onChange={(e) => handleConfigChange('text_without_attachment', 'font_size', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="8"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">文字顏色</label>
              <input
                type="color"
                value={formData.text_without_attachment?.color || '#000000'}
                onChange={(e) => handleConfigChange('text_without_attachment', 'color', e.target.value)}
                className="w-full h-10 px-1 py-1 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">對齊方式</label>
              <select
                value={formData.text_without_attachment?.align || 'left'}
                onChange={(e) => handleConfigChange('text_without_attachment', 'align', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="left">靠左</option>
                <option value="right">靠右</option>
                <option value="justify">填滿</option>
                <option value="center">置中</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">每行字數上限</label>
              <input
                type="number"
                value={formData.text_without_attachment?.max_chars_per_line ?? 32}
                onChange={(e) => handleConfigChange('text_without_attachment', 'max_chars_per_line', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">垂直對齊</label>
              <select
                value={formData.text_without_attachment?.vertical_align || 'top'}
                onChange={(e) => handleConfigChange('text_without_attachment', 'vertical_align', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="top">靠上</option>
                <option value="center">置中（以行數）</option>
                <option value="bottom">靠下</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">文字區塊大小 (px)</label>
              <input
                type="number"
                value={formData.text_without_attachment?.box_size || 880}
                onChange={(e) => handleConfigChange('text_without_attachment', 'box_size', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">區塊中心 X (px)</label>
              <input
                type="number"
                value={formData.text_without_attachment?.box_center_x || 540}
                onChange={(e) => handleConfigChange('text_without_attachment', 'box_center_x', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">區塊中心 Y (px)</label>
              <input
                type="number"
                value={formData.text_without_attachment?.box_center_y || 540}
                onChange={(e) => handleConfigChange('text_without_attachment', 'box_center_y', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">最多行數</label>
              <input
                type="number"
                value={formData.text_without_attachment?.max_lines || 14}
                onChange={(e) => handleConfigChange('text_without_attachment', 'max_lines', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">行間距 (px)</label>
              <input
                type="number"
                value={formData.text_without_attachment?.line_spacing || 12}
                onChange={(e) => handleConfigChange('text_without_attachment', 'line_spacing', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">截斷符號</label>
              <input
                type="text"
                value={formData.text_without_attachment?.truncate_text || '...'}
                onChange={(e) => handleConfigChange('text_without_attachment', 'truncate_text', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">\n 處理方式</label>
              <select
                value={formData.text_without_attachment?.newline_mode || 'convert'}
                onChange={(e) => handleConfigChange('text_without_attachment', 'newline_mode', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
              >
                <option value="convert">視為換行（將 \n 轉成換行）</option>
                <option value="literal">保留原樣（\n 顯示為文字）</option>
              </select>
            </div>
          </div>
        )}
      </div>

      
      <div className="space-y-4">
        <SectionHeader title="附件圖片配置" section="attachment" />
        {expandedSections.attachment && (
          <div className="space-y-4 pl-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="attachment_enabled"
                checked={formData.attachment_config?.enabled ?? true}
                onChange={(e) => handleConfigChange('attachment_config', 'enabled', e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="attachment_enabled" className="text-sm font-medium">啟用附件圖片</label>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">寬度 (px)</label>
                <input
                  type="number"
                  value={formData.attachment_config?.width || 450}
                  onChange={(e) => handleConfigChange('attachment_config', 'width', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">高度 (px)</label>
                <input
                  type="number"
                  value={formData.attachment_config?.height || 450}
                  onChange={(e) => handleConfigChange('attachment_config', 'height', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">圓角半徑 (px)</label>
                <input
                  type="number"
                  value={formData.attachment_config?.border_radius || 20}
                  onChange={(e) => handleConfigChange('attachment_config', 'border_radius', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">圖片間距 (px)</label>
                <input
                  type="number"
                  value={formData.attachment_config?.spacing || 15}
                  onChange={(e) => handleConfigChange('attachment_config', 'spacing', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">X 座標 (px)</label>
                <input
                  type="number"
                  value={formData.attachment_config?.position_x || 70}
                  onChange={(e) => handleConfigChange('attachment_config', 'position_x', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Y 座標 (px)</label>
                <input
                  type="number"
                  value={formData.attachment_config?.position_y || 70}
                  onChange={(e) => handleConfigChange('attachment_config', 'position_y', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      
      <div className="space-y-4">
        <SectionHeader title="Logo 配置" section="logo" />
        {expandedSections.logo && (
          <div className="space-y-4 pl-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="logo_enabled"
                checked={formData.logo_config?.enabled ?? false}
                onChange={(e) => handleConfigChange('logo_config', 'enabled', e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="logo_enabled" className="text-sm font-medium">啟用 Logo</label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Logo 來源</label>
                <select
                  value={formData.logo_config?.source || 'school_logo'}
                  onChange={(e) => handleConfigChange('logo_config', 'source', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                >
                  <option value="school_logo">學校 Logo</option>
                  <option value="platform_logo">平台 Logo</option>
                  <option value="custom">自訂圖片</option>
                </select>
              </div>

              {formData.logo_config?.source === 'custom' && (
                <div>
                  <label className="block text-sm font-medium mb-1">上傳 Logo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setLogoFile(e.target.files[0]);
                      }
                    }}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted mt-1">支援 PNG, JPG, SVG 格式</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">寬度 (px)</label>
                <input
                  type="number"
                  value={formData.logo_config?.width || 150}
                  onChange={(e) => handleConfigChange('logo_config', 'width', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">高度 (px)</label>
                <input
                  type="number"
                  value={formData.logo_config?.height || 80}
                  onChange={(e) => handleConfigChange('logo_config', 'height', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">透明度 (0-1)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={formData.logo_config?.opacity || 1.0}
                  onChange={(e) => handleConfigChange('logo_config', 'opacity', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">X 座標 (px)</label>
                <input
                  type="number"
                  value={formData.logo_config?.position_x || 50}
                  onChange={(e) => handleConfigChange('logo_config', 'position_x', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Y 座標 (px)</label>
                <input
                  type="number"
                  value={formData.logo_config?.position_y || 950}
                  onChange={(e) => handleConfigChange('logo_config', 'position_y', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">圖層順序</label>
                <input
                  type="number"
                  value={formData.logo_config?.layer_order || 100}
                  onChange={(e) => handleConfigChange('logo_config', 'layer_order', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

        
        <div className="space-y-4">
        <SectionHeader title="浮水印配置" section="watermark" />
        {expandedSections.watermark && (
          <div className="space-y-4 pl-4">
            
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">自訂文字</div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.watermark_config?.items?.custom_text?.enabled ?? false}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: {
                        ...prev.watermark_config,
                        items: {
                          ...(prev.watermark_config?.items||{}),
                          custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), enabled: e.target.checked }
                        }
                      }
                    }))}
                  /> 啟用
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">文字</label>
                  <input type="text" value={formData.watermark_config?.items?.custom_text?.text || ''}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: {
                        ...prev.watermark_config,
                        items: {
                          ...(prev.watermark_config?.items||{}),
                          custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), text: e.target.value }
                        }
                      }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                  <p className="text-xs text-muted mt-1">支援變數：{'{campus}'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">字型</label>
                  <select
                    value={formData.watermark_config?.items?.custom_text?.font_family || ''}
                    onChange={(e)=> {
                      console.log('[Watermark Custom Text] Font changed to:', e.target.value);
                      setFormData(prev=>{
                        const newData = {
                          ...prev,
                          watermark_config: {
                            ...prev.watermark_config,
                            items: {
                              ...(prev.watermark_config?.items||{}),
                              custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), font_family: e.target.value }
                            }
                          }
                        };
                        console.log('[Watermark Custom Text] New formData:', newData);
                        return newData;
                      });
                    }}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                  >
                    <option value="">選擇字型</option>
                    {fonts.map(font => (
                      <option key={font.id} value={font.font_family}>{font.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">X</label>
                  <input type="number" value={formData.watermark_config?.items?.custom_text?.position_x ?? 50}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), position_x: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Y</label>
                  <input type="number" value={formData.watermark_config?.items?.custom_text?.position_y ?? 1050}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), position_y: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">水平對齊</label>
                  <select
                    value={formData.watermark_config?.items?.custom_text?.align || 'center'}
                    onChange={(e)=> setFormData(prev=>(
                      {
                        ...prev,
                        watermark_config: {
                          ...prev.watermark_config,
                          items: {
                            ...(prev.watermark_config?.items||{}),
                            custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), align: e.target.value }
                          }
                        }
                      }
                    ))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                  >
                    <option value="left">靠左</option>
                    <option value="center">置中</option>
                    <option value="right">靠右</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">大小(px)</label>
                  <input type="number" value={formData.watermark_config?.items?.custom_text?.font_size || 14}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), font_size: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">顏色</label>
                  <input type="color" value={formData.watermark_config?.items?.custom_text?.color || '#000000'}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), color: e.target.value } } }
                    }))}
                    className="w-full h-10 px-1 py-1 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">透明度</label>
                  <input type="number" step="0.1" min="0" max="1" value={formData.watermark_config?.items?.custom_text?.opacity ?? 0.3}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), custom_text: { ...(prev.watermark_config?.items?.custom_text||{}), opacity: parseFloat(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
              </div>
            </div>

            
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">時間戳</div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.watermark_config?.items?.timestamp?.enabled ?? false}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), enabled: e.target.checked } } }
                    }))}
                  /> 啟用
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">格式</label>
                  <input type="text" value={formData.watermark_config?.items?.timestamp?.format || 'MM/DD/YYYY HH:mm'}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), format: e.target.value } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono text-sm"/>
                  <p className="text-xs text-muted mt-1">支援：YYYY/MM/DD、HH(24時) / hh(12時) 與 aa(am/pm)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">時區</label>
                  <select value={formData.watermark_config?.items?.timestamp?.timezone || 'UTC'}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), timezone: e.target.value } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary">
                    <option value="UTC">UTC</option>
                    <option value="Asia/Taipei">Asia/Taipei</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">字型</label>
                  <select value={formData.watermark_config?.items?.timestamp?.font_family || ''}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), font_family: e.target.value } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary">
                    <option value="">選擇字型</option>
                    {fonts.map(font => (
                      <option key={font.id} value={font.font_family}>{font.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">大小(px)</label>
                  <input type="number" value={formData.watermark_config?.items?.timestamp?.font_size || 14}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), font_size: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">顏色</label>
                  <input type="color" value={formData.watermark_config?.items?.timestamp?.color || '#000000'}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), color: e.target.value } } }
                    }))}
                    className="w-full h-10 px-1 py-1 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">透明度</label>
                  <input type="number" step="0.1" min="0" max="1" value={formData.watermark_config?.items?.timestamp?.opacity ?? 0.3}
                    onChange={(e)=> setFormData(prev=>({

                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), opacity: parseFloat(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">X</label>
                  <input type="number" value={formData.watermark_config?.items?.timestamp?.position_x ?? 200}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), position_x: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Y</label>
                  <input type="number" value={formData.watermark_config?.items?.timestamp?.position_y ?? 1050}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), timestamp: { ...(prev.watermark_config?.items?.timestamp||{}), position_y: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
              </div>
            </div>

            
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">格式化 ID</div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.watermark_config?.items?.formatted_id?.enabled ?? false}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), enabled: e.target.checked } } }
                    }))}
                  /> 啟用
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ID 生成模板</label>
                <input type="text" value={formData.watermark_config?.items?.formatted_id?.id_template || '#{school_short_name}_{post_type}_{post_id}'}
                  onChange={(e)=> setFormData(prev=>({
                    ...prev,
                    watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), id_template: e.target.value } } }
                  }))}
                  className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono text-sm"/>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">字型</label>
                  <select value={formData.watermark_config?.items?.formatted_id?.font_family || ''}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), font_family: e.target.value } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary">
                    <option value="">選擇字型</option>
                    {fonts.map(font => (
                      <option key={font.id} value={font.font_family}>{font.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">水平對齊</label>
                  <select value={formData.watermark_config?.items?.formatted_id?.align || 'center'}
                    onChange={(e)=> setFormData(prev=>(
                      {
                        ...prev,
                        watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), align: e.target.value } } }
                      }
                    ))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary">
                    <option value="left">靠左</option>
                    <option value="center">置中</option>
                    <option value="right">靠右</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">大小(px)</label>
                  <input type="number" value={formData.watermark_config?.items?.formatted_id?.font_size || 14}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), font_size: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">顏色</label>
                  <input type="color" value={formData.watermark_config?.items?.formatted_id?.color || '#000000'}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), color: e.target.value } } }
                    }))}
                    className="w-full h-10 px-1 py-1 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">X</label>
                  <input type="number" value={formData.watermark_config?.items?.formatted_id?.position_x ?? 350}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), position_x: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Y</label>
                  <input type="number" value={formData.watermark_config?.items?.formatted_id?.position_y ?? 1050}
                    onChange={(e)=> setFormData(prev=>({
                      ...prev,
                      watermark_config: { ...prev.watermark_config, items: { ...(prev.watermark_config?.items||{}), formatted_id: { ...(prev.watermark_config?.items?.formatted_id||{}), position_y: parseInt(e.target.value) } } }
                    }))}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"/>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

        
        <div className="space-y-4">
          <SectionHeader title="Caption 模板配置" section="caption" />
          {expandedSections.caption && (
            <div className="space-y-4 pl-4">
            
            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="caption_header_enabled"
                  checked={formData.caption_template?.header?.enabled ?? true}
                  onChange={(e) => {
                    const newHeader = { ...formData.caption_template?.header, enabled: e.target.checked };
                    setFormData(prev => ({
                      ...prev,
                      caption_template: { ...prev.caption_template, header: newHeader }
                    }));
                  }}
                  className="mr-2"
                />
                <label htmlFor="caption_header_enabled" className="text-sm font-medium">啟用標題區塊</label>
              </div>
              {formData.caption_template?.header?.enabled && (
                <div>
                  <label className="block text-sm font-medium mb-1">標題文字</label>
                  <input
                    type="text"
                    value={formData.caption_template?.header?.text || '📢 校園公告'}
                    onChange={(e) => {
                      const newHeader = { ...formData.caption_template?.header, text: e.target.value };
                      setFormData(prev => ({
                        ...prev,
                        caption_template: { ...prev.caption_template, header: newHeader }
                      }));
                    }}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                    placeholder="例如：📢 校園公告"
                  />
                </div>
              )}
            </div>

            
            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="caption_footer_enabled"
                  checked={formData.caption_template?.footer?.enabled ?? true}
                  onChange={(e) => {
                    const newFooter = { ...formData.caption_template?.footer, enabled: e.target.checked };
                    setFormData(prev => ({
                      ...prev,
                      caption_template: { ...prev.caption_template, footer: newFooter }
                    }));
                  }}
                  className="mr-2"
                />
                <label htmlFor="caption_footer_enabled" className="text-sm font-medium">啟用頁尾區塊</label>
              </div>
              {formData.caption_template?.footer?.enabled && (
                <div>
                  <label className="block text-sm font-medium mb-1">頁尾文字</label>
                  <input
                    type="text"
                    value={formData.caption_template?.footer?.text || 'ForumKit 校園討論平台'}
                    onChange={(e) => {
                      const newFooter = { ...formData.caption_template?.footer, text: e.target.value };
                      setFormData(prev => ({
                        ...prev,
                        caption_template: { ...prev.caption_template, footer: newFooter }
                      }));
                    }}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                    placeholder="例如：ForumKit 校園討論平台"
                  />
                </div>
              )}
            </div>

            
            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="caption_divider_enabled"
                  checked={formData.caption_template?.divider?.enabled ?? true}
                  onChange={(e) => {
                    const newDivider = { ...formData.caption_template?.divider, enabled: e.target.checked };
                    setFormData(prev => ({
                      ...prev,
                      caption_template: { ...prev.caption_template, divider: newDivider }
                    }));
                  }}
                  className="mr-2"
                />
                <label htmlFor="caption_divider_enabled" className="text-sm font-medium">啟用分隔線</label>
              </div>
              {formData.caption_template?.divider?.enabled && (
                <div>
                  <label className="block text-sm font-medium mb-1">分隔線樣式</label>
                  <input
                    type="text"
                    value={formData.caption_template?.divider?.text || '━━━━━━━━━━'}
                    onChange={(e) => {
                      const newDivider = { ...formData.caption_template?.divider, text: e.target.value };
                      setFormData(prev => ({
                        ...prev,
                        caption_template: { ...prev.caption_template, divider: newDivider }
                      }));
                    }}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                    placeholder="例如：━━━━━━━━━━"
                  />
                </div>
              )}
            </div>

            
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="caption_post_id_enabled"
                  checked={formData.caption_template?.post_id_format?.enabled ?? true}
                  onChange={(e) => {
                    const newPostIdFormat = { ...formData.caption_template?.post_id_format, enabled: e.target.checked };
                    setFormData(prev => ({
                      ...prev,
                      caption_template: { ...prev.caption_template, post_id_format: newPostIdFormat }
                    }));
                  }}
                  className="mr-2"
                />
                <label htmlFor="caption_post_id_enabled" className="text-sm font-medium">啟用格式化貼文ID</label>
              </div>
              {formData.caption_template?.post_id_format?.enabled && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">ID 格式模板</label>
                    <input
                      type="text"
                      value={formData.caption_template?.post_id_format?.template || '#{school_short_name}_{post_type}_{post_id}'}
                      onChange={(e) => {
                        const newPostIdFormat = { ...formData.caption_template?.post_id_format, template: e.target.value };
                        setFormData(prev => ({
                          ...prev,
                          caption_template: { ...prev.caption_template, post_id_format: newPostIdFormat }
                        }));
                      }}
                      className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder="#{school_short_name}_{post_type}_{post_id}"
                    />
                    <p className="text-xs text-muted mt-1">
                      可用變數：{'{school_short_name}'}, {'{post_type}'}, {'{post_id}'}, {'{timestamp}'}, {'{date}'}, {'{time}'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">樣式</label>
                    <select
                      value={formData.caption_template?.post_id_format?.style || 'hashtag'}
                      onChange={(e) => {
                        const newPostIdFormat = { ...formData.caption_template?.post_id_format, style: e.target.value };
                        setFormData(prev => ({
                          ...prev,
                          caption_template: { ...prev.caption_template, post_id_format: newPostIdFormat }
                        }));
                      }}
                      className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                    >
                      <option value="hashtag">Hashtag 格式（#開頭）</option>
                      <option value="plain">純文字</option>
                      <option value="brackets">方括號 [ID]</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

              
              <div className="space-y-2 border-t pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">時區</label>
                    <select
                      value={formData.caption_template?.time_format?.timezone || 'UTC'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        caption_template: {
                          ...prev.caption_template,
                          time_format: {
                            ...(prev.caption_template?.time_format || {}),
                            timezone: e.target.value
                          }
                        }
                      }))}
                      className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                    >
                      <option value="UTC">UTC</option>
                      <option value="Asia/Taipei">Asia/Taipei</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">日期格式</label>
                    <input
                      type="text"
                      value={formData.caption_template?.time_format?.date_format || '%Y-%m-%d'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        caption_template: {
                          ...prev.caption_template,
                          time_format: {
                            ...(prev.caption_template?.time_format || {}),
                            date_format: e.target.value
                          }
                        }
                      }))}
                      className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder="%Y-%m-%d"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">時間格式</label>
                    <input
                      type="text"
                      value={formData.caption_template?.time_format?.time_format || '%H:%M:%S'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        caption_template: {
                          ...prev.caption_template,
                          time_format: {
                            ...(prev.caption_template?.time_format || {}),
                            time_format: e.target.value
                          }
                        }
                      }))}
                      className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder="%H:%M:%S"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">日期時間格式</label>
                    <input
                      type="text"
                      value={formData.caption_template?.time_format?.datetime_format || '%Y-%m-%d %H:%M:%S'}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        caption_template: {
                          ...prev.caption_template,
                          time_format: {
                            ...(prev.caption_template?.time_format || {}),
                            datetime_format: e.target.value
                          }
                        }
                      }))}
                      className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder="%Y-%m-%d %H:%M:%S"
                    />
                  </div>
                </div>
              </div>

            
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="caption_hashtags_enabled"
                  checked={formData.caption_template?.hashtags?.enabled ?? true}
                  onChange={(e) => {
                    const newHashtags = { ...formData.caption_template?.hashtags, enabled: e.target.checked };
                    setFormData(prev => ({
                      ...prev,
                      caption_template: { ...prev.caption_template, hashtags: newHashtags }
                    }));
                  }}
                  className="mr-2"
                />
                <label htmlFor="caption_hashtags_enabled" className="text-sm font-medium">啟用 Hashtags</label>
              </div>
              {formData.caption_template?.hashtags?.enabled && (
                <div>
                  <label className="block text-sm font-medium mb-1">Hashtags（逗號分隔）</label>
                  <input
                    type="text"
                    value={formData.caption_template?.hashtags?.tags?.join(', ') || ''}
                    onChange={(e) => {
                      const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
                      const newHashtags = { ...formData.caption_template?.hashtags, tags };
                      setFormData(prev => ({
                        ...prev,
                        caption_template: { ...prev.caption_template, hashtags: newHashtags }
                      }));
                    }}
                    className="w-full px-3 py-2 border border-border rounded focus:ring-2 focus:ring-primary"
                    placeholder="校園, 公告, 學生"
                  />
                  <p className="text-xs text-muted mt-1">使用逗號分隔多個標籤</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded hover:bg-surface-hover transition"
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

export default TemplateFormEnhanced;
