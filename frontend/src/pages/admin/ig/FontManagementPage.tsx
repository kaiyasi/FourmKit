/**
 * 字體管理頁面
 * 支援字體列表、申請、上傳（Dev Admin）
 */

import React, { useState } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import FontList from '@/components/ig/FontList';
import FontRequestForm from '@/components/ig/FontRequestForm';
import FontUploadForm from '@/components/ig/FontUploadForm';
import FontEditForm from '@/components/ig/FontEditForm';
import { Plus, Upload, ArrowLeft } from 'lucide-react';

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

const FontManagementPage: React.FC = () => {
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [editingFont, setEditingFont] = useState<Font | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const userRole = localStorage.getItem('role');
  const isDevAdmin = userRole === 'dev_admin';

  const handleRequestSuccess = () => {
    setShowRequestForm(false);
    alert('字體申請已提交，等待審核');
  };

  const handleUploadSuccess = () => {
    setShowUploadForm(false);
    setRefreshKey(prev => prev + 1);
    alert('字體上傳成功');
  };

  const handleEditSuccess = () => {
    setEditingFont(null);
    setRefreshKey(prev => prev + 1);
    alert('字體更新成功');
  };

  const handleEdit = (font: Font) => {
    setEditingFont(font);
    setShowRequestForm(false);
    setShowUploadForm(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/ig/fonts" />
      <MobileBottomNav />

      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        
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
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">字體管理</h1>
              <p className="text-sm text-muted mt-1">管理 Instagram 模板使用的字體資源</p>
            </div>
            <div className="flex gap-2">
              
              {!isDevAdmin && (
                <button
                  onClick={() => setShowRequestForm(!showRequestForm)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  申請字體
                </button>
              )}

              
              {isDevAdmin && (
                <button
                  onClick={() => setShowUploadForm(!showUploadForm)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition bg-primary text-white hover:bg-primary-hover flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  上傳字體
                </button>
              )}
            </div>
          </div>
        </div>

        
        {showRequestForm && !isDevAdmin && (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">申請新字體</h2>
              <button
                onClick={() => setShowRequestForm(false)}
                className="text-muted hover:text-fg transition-colors"
              >
                ✕
              </button>
            </div>
            <FontRequestForm
              onSuccess={handleRequestSuccess}
              onCancel={() => setShowRequestForm(false)}
            />
          </div>
        )}

        
        {showUploadForm && isDevAdmin && (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">上傳字體檔案</h2>
              <button
                onClick={() => setShowUploadForm(false)}
                className="text-muted hover:text-fg transition-colors"
              >
                ✕
              </button>
            </div>
            <FontUploadForm
              onSuccess={handleUploadSuccess}
              onCancel={() => setShowUploadForm(false)}
            />
          </div>
        )}

        
        {editingFont && isDevAdmin && (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">編輯字體資訊</h2>
              <button
                onClick={() => setEditingFont(null)}
                className="text-muted hover:text-fg transition-colors"
              >
                ✕
              </button>
            </div>
            <FontEditForm
              font={editingFont}
              onSuccess={handleEditSuccess}
              onCancel={() => setEditingFont(null)}
            />
          </div>
        )}

        
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-fg mb-4">可用字體</h2>
          <FontList key={refreshKey} onEdit={handleEdit} />
        </div>
      </main>
    </div>
  );
};

export default FontManagementPage;
