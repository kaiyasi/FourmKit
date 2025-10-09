/**
 * Instagram 佇列管理頁面
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, RefreshCw, Filter } from 'lucide-react';

interface QueuePost {
  id: number;
  public_id: string;
  forum_post_title: string;
  account_username: string;
  status: string;
  publish_mode: string;
  carousel_group_id?: string;
  scheduled_at?: string;
  created_at: string;
}

interface QueueStats {
  total_pending: number;
  total_ready: number;
  total_publishing: number;
  accounts: Array<{
    account_id: number;
    username: string;
    publish_mode: string;
    ready_count: number;
    batch_ready: boolean;
  }>;
}

const QueueManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueuePost[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchQueue = async () => {
    try {
      const statusParam = filter !== 'all' ? `?status=${filter.toUpperCase()}` : '';
      const response = await fetch(`/api/admin/ig/queue${statusParam}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      setQueue(data.queue || []);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/ig/queue/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    Promise.all([fetchQueue(), fetchStats()]).finally(() => setLoading(false));
  }, [filter]);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      rendering: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      ready: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      publishing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/ig/queue" />
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
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">發布佇列管理</h1>
            <p className="text-sm text-muted mt-1">管理待發布的貼文佇列</p>
          </div>
        </div>

        {/* 統計卡片 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="text-sm text-muted">等待處理</div>
              <div className="text-2xl font-bold text-fg mt-1">{stats.total_pending}</div>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="text-sm text-muted">準備發布</div>
              <div className="text-2xl font-bold text-fg mt-1">{stats.total_ready}</div>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
              <div className="text-sm text-muted">發布中</div>
              <div className="text-2xl font-bold text-fg mt-1">{stats.total_publishing}</div>
            </div>
          </div>
        )}

        {/* 篩選器 */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-muted" />
            <span className="text-sm font-medium text-fg">篩選狀態</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'rendering', 'ready', 'publishing'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  filter === status
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-fg hover:bg-surface'
                }`}
              >
                {status === 'all' ? '全部' : status.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* 佇列列表 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-fg">佇列項目</h2>
            <button
              onClick={() => {
                fetchQueue();
                fetchStats();
              }}
              className="p-2 text-muted hover:text-fg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">標題</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">帳號</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">狀態</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">模式</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">建立時間</th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-border">
                {queue.map(post => (
                  <tr
                    key={post.id}
                    onClick={() => navigate(`/admin/ig/posts/${post.id}`)}
                    className="hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-fg">{post.public_id}</td>
                    <td className="px-6 py-4 text-sm text-fg">{post.forum_post_title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">{post.account_username}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(post.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">{post.publish_mode}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                      {new Date(post.created_at).toLocaleString('zh-TW')}
                    </td>
                  </tr>
                ))}
              </tbody>
            {queue.length === 0 && (
              <div className="px-6 py-6 text-sm text-muted">
                無資料，請確認是否有符合篩選條件的佇列項目。
              </div>
            )}

            </table>
            {queue.length === 0 && (
              <div className="text-center py-12 text-muted">
                <p>目前沒有待發布的貼文</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default QueueManagementPage;
