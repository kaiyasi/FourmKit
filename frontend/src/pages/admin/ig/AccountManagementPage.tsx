/**
 * Instagram 帳號管理頁面
 */

import React, { useState } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, RefreshCw, Plus } from 'lucide-react';
import AccountList from '../../../components/ig/AccountList';
import AccountForm from '../../../components/ig/AccountForm';

const AccountManagementPage: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleEdit = async (account: any) => {
    try {
      const response = await fetch(`/api/admin/ig/accounts/${account.id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入帳號詳情失敗');
      }
      setEditingAccount(data);
      setShowForm(true);
    } catch (err: any) {
      alert(err.message || '載入帳號詳情失敗');
    }
  };

  const handleCreate = () => {
    setEditingAccount(null);
    setShowForm(true);
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingAccount(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingAccount(null);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/ig/accounts" />
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
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">Instagram 帳號管理</h1>
              <p className="text-sm text-muted mt-1">管理 Instagram 發布帳號與設定</p>
            </div>
            {!showForm && (
              <button
                onClick={handleCreate}
                className="px-4 py-2 btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                新增帳號
              </button>
            )}
          </div>
        </div>

        
        {showForm ? (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">
                {editingAccount ? '編輯帳號' : '新增帳號'}
              </h2>
              <button
                onClick={handleCancel}
                className="text-muted hover:text-fg transition-colors"
              >
                ✕
              </button>
            </div>
            <AccountForm
              account={editingAccount}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">帳號列表</h2>
              <button
                onClick={handleRefresh}
                className="p-2 text-muted hover:text-fg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <AccountList
              key={refreshKey}
              onEdit={handleEdit}
              onRefresh={handleRefresh}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default AccountManagementPage;
