/**
 * Instagram 模板列表組件
 */

import React, { useState, useEffect } from 'react';

interface IGTemplate {
  id: number;
  name: string;
  description: string;
  school_id: number | null;
  school_name?: string;
  template_type: 'announcement' | 'general';
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface TemplateListProps {
  onEdit: (template: IGTemplate) => void;
  onRefresh?: () => void;
  refreshTrigger?: number;
}

const TemplateList: React.FC<TemplateListProps> = ({ onEdit, onRefresh, refreshTrigger }) => {
  const [templates, setTemplates] = useState<IGTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    fetchTemplates();
  }, [typeFilter, refreshTrigger]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const url = new URL('/api/admin/ig/templates', window.location.origin);
      if (typeFilter !== 'all') {
        url.searchParams.set('template_type', typeFilter);
      }

      const response = await fetch(url.toString(), {
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
      setError(null);
    } catch (err: any) {
      setError(err.message || '載入模板失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (templateId: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/ig/templates/${templateId}`, {
        method: 'PATCH',
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
      fetchTemplates();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message || '更新失敗');
    }
  };

  const handleDuplicate = async (templateId: number) => {
    if (!confirm('確定要複製此模板嗎？')) return;

    try {
      const response = await fetch(`/api/admin/ig/templates/${templateId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '複製失敗');
      }
      alert('模板已複製');
      fetchTemplates();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message || '複製失敗');
    }
  };

  const handleDelete = async (templateId: number) => {
    if (!confirm('確定要刪除此模板嗎？此操作無法復原。')) return;
    if (!confirm('再次確認：刪除後無法復原，是否仍要繼續？')) return;

    try {
      const response = await fetch(`/api/admin/ig/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '刪除失敗');
      }
      alert('模板已刪除');
      fetchTemplates();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message || '刪除失敗');
    }
  };

  const getTypeText = (type: string) => {
    return type === 'announcement' ? '公告' : '一般';
  };

  const getTypeBadge = (type: string) => {
    const isAnnouncement = type === 'announcement';
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${
        isAnnouncement
          ? 'bg-warning-bg text-warning-text'
          : 'bg-info-bg text-info-text'
      }`}>
        {getTypeText(type)}
      </span>
    );
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
      
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            typeFilter === 'all'
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-fg hover:bg-surface'
          }`}
        >
          全部
        </button>
        <button
          onClick={() => setTypeFilter('announcement')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            typeFilter === 'announcement'
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-fg hover:bg-surface'
          }`}
        >
          公告模板
        </button>
        <button
          onClick={() => setTypeFilter('general')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            typeFilter === 'general'
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-fg hover:bg-surface'
          }`}
        >
          一般模板
        </button>
      </div>

      
      {templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          尚未建立任何模板
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition"
            >
              <div className="mb-3">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold">{template.name}</h3>
                  {template.is_active ? (
                    <span className="px-2 py-1 bg-success-bg text-success-text text-xs rounded">
                      啟用
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
                      停用
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {getTypeBadge(template.template_type)}
                  <span className="text-xs text-muted-foreground">
                    {template.school_name || '全平台'}
                  </span>
                </div>

                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1 mb-3 pb-3 border-b">
                <div>
                  <span className="font-medium">使用次數：</span>
                  {template.usage_count} 次
                </div>
                {template.last_used_at && (
                  <div>
                    <span className="font-medium">最後使用：</span>
                    {new Date(template.last_used_at).toLocaleString('zh-TW')}
                  </div>
                )}
                <div>
                  <span className="font-medium">創建時間：</span>
                  {new Date(template.created_at).toLocaleString('zh-TW')}
                </div>
              </div>

              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onEdit(template)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                >
                  編輯
                </button>
                <button
                  onClick={() => handleDuplicate(template.id)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                >
                  複製
                </button>
                <button
                  onClick={() => handleToggleActive(template.id, template.is_active)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover"
                >
                  {template.is_active ? '停用' : '啟用'}
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition bg-danger text-white hover:bg-danger-hover"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TemplateList;
