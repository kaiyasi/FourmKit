/**
 * Instagram 發布統計組件
 * 顯示發布概覽數據
 */

import React, { useState, useEffect } from 'react';

interface StatsData {
  today_published: number;
  total_pending: number;
  total_ready: number;
  total_failed: number;
  success_rate: number;
  period_days: number;
}

const PublishStats: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // 每 30 秒更新
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/ig/posts/stats', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入統計失敗');
      }
      setStats(data);
    } catch (err) {
      console.error('載入統計失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted">載入中...</div>;
  }

  if (!stats) {
    return null;
  }

  const statCards = [
    {
      title: '今日發布',
      value: stats.today_published,
      icon: '✓',
      bgColor: 'bg-success-bg',
      textColor: 'text-success-text'
    },
    {
      title: '待發布',
      value: stats.total_ready,
      icon: '◷',
      bgColor: 'bg-info-bg',
      textColor: 'text-info-text'
    },
    {
      title: '處理中',
      value: stats.total_pending,
      icon: '↻',
      bgColor: 'bg-warning-bg',
      textColor: 'text-warning-text'
    },
    {
      title: '失敗',
      value: stats.total_failed,
      icon: '✗',
      bgColor: 'bg-danger-bg',
      textColor: 'text-danger-text'
    }
  ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((card, index) => (
          <div
            key={index}
            className={`${card.bgColor} border border-border rounded-2xl p-4 shadow-soft`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${card.textColor} opacity-80`}>{card.title}</div>
                <div className={`text-3xl font-bold mt-1 ${card.textColor}`}>{card.value}</div>
              </div>
              <div className={`text-4xl ${card.textColor} opacity-40`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted">
            成功率（{stats.period_days} 天）
          </span>
          <span className="text-2xl font-bold text-success">
            {stats.success_rate.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-surface-hover rounded-full h-3">
          <div
            className="bg-success h-3 rounded-full transition-all"
            style={{ width: `${stats.success_rate}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default PublishStats;
