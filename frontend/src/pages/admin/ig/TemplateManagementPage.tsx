/**
 * Instagram 模板管理頁面
 */

import React, { useState } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, RefreshCw, Plus } from 'lucide-react';
import TemplateList from '../../../components/ig/TemplateList';
import TemplateFormEnhanced from '../../../components/ig/TemplateFormEnhanced';
import TemplatePreviewPane from '../../../components/ig/TemplatePreviewPane';

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

const TemplateManagementPage: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<IGTemplate | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveConfig, setLiveConfig] = useState<any | null>(null);

  const handleCreate = () => {
    setEditingTemplate(null);
    setShowForm(true);
  };

  const handleEdit = (template: IGTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleFormSuccess = () => {
    // 儲存成功後，刷新模板列表但保持在編輯頁面
    setRefreshKey(prev => prev + 1);
    // 如果需要重新載入編輯中的模板，可以重新獲取
    if (editingTemplate?.id) {
      // 重新載入模板資料以確保顯示最新內容
      fetch(`/api/admin/ig/templates/${editingTemplate.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.id) {
            setEditingTemplate(data);
          }
        })
        .catch(err => console.error('重新載入模板失敗:', err));
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/ig/templates" />
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
              返回管理中心
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">Instagram 模板管理</h1>
              <p className="text-sm text-muted mt-1">管理貼文渲染模板配置</p>
            </div>
            {!showForm && (
              <button
                onClick={handleCreate}
                className="px-4 py-2 btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                新增模板
              </button>
            )}
          </div>
        </div>

        {/* 表單或列表 */}
        {showForm ? (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">
                {editingTemplate ? '編輯模板' : '新增模板'}
              </h2>
              <button
                onClick={handleFormClose}
                className="text-muted hover:text-fg transition-colors"
              >
                ✕
              </button>
            </div>
            <TemplateFormEnhanced
              template={editingTemplate}
              onSuccess={handleFormSuccess}
              onCancel={handleFormClose}
              onFormDataChange={setLiveConfig}
            />
            <div className="mt-4">
              <TemplatePreviewPane templateConfig={liveConfig} />
            </div>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">模板列表</h2>
              <button
                onClick={handleRefresh}
                className="p-2 text-muted hover:text-fg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <TemplateList
              onEdit={handleEdit}
              onRefresh={handleRefresh}
              refreshTrigger={refreshKey}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default TemplateManagementPage;
