/**
 * Instagram 管理中心
 */

import React from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  User,
  FileText,
  BarChart3,
  ListOrdered,
  TrendingUp,
  Settings,
  Instagram,
  Type
} from 'lucide-react';
import PublishStats from '../../../components/ig/PublishStats';
import PublishRecordList from '../../../components/ig/PublishRecordList';

const PublishDashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const handleRetry = async (postId: number) => {
    if (!confirm('確定要重試此貼文嗎？')) return;

    try {
      const response = await fetch(`/api/admin/ig/posts/${postId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '重試失敗');
      }
      alert('已加入重試佇列');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || '重試失敗');
    }
  };

  const quickLinks = [
    {
      title: '帳號管理',
      description: '管理 Instagram 發布帳號',
      icon: User,
      path: '/admin/ig/accounts',
      color: 'blue'
    },
    {
      title: '模板管理',
      description: '設定貼文渲染模板',
      icon: FileText,
      path: '/admin/ig/templates',
      color: 'purple'
    },
    {
      title: '字體管理',
      description: '管理模板使用的字體',
      icon: Type,
      path: '/admin/ig/fonts',
      color: 'indigo'
    },
    {
      title: '發布佇列',
      description: '查看待發布貼文',
      icon: ListOrdered,
      path: '/admin/ig/queue',
      color: 'green'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600',
      purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600',
      indigo: 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600',
      green: 'bg-green-100 dark:bg-green-900/20 text-green-600',
      orange: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600'
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/ig/dashboard" />
      <MobileBottomNav />

      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">Instagram 管理中心</h1>
              <p className="text-sm text-muted mt-1">管理 Instagram 發布系統與監控</p>
            </div>
          </div>
        </div>

        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="bg-surface border border-border rounded-2xl p-4 shadow-soft hover:shadow-md transition-all hover:scale-105 text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColorClasses(link.color)}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-fg group-hover:text-primary transition-colors">
                      {link.title}
                    </h3>
                    <p className="text-xs text-muted mt-1">{link.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        
        <div className="mb-6">
          <PublishStats />
        </div>

        
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-fg">發布記錄</h2>
            <button
              onClick={() => window.location.reload()}
              className="p-2 text-muted hover:text-fg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <PublishRecordList onRetry={handleRetry} />
        </div>
      </main>
    </div>
  );
};

export default PublishDashboardPage;
