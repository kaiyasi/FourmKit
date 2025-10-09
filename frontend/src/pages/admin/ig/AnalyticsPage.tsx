/**
 * Instagram 統計分析頁面
 */

import React, { useState, useEffect } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';

interface Overview {
  period_days: number;
  total_posts: number;
  published_count: number;
  failed_count: number;
  pending_count: number;
  success_rate: number;
  today_published: number;
}

const AnalyticsPage: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchOverview();
  }, [days]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/ig/analytics/overview?days=${days}`);
      const data = await response.json();
      setOverview(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
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
      <NavBar pathname="/admin/ig/analytics" />
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
            <h1 className="text-xl sm:text-2xl font-semibold dual-text flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              數據分析
            </h1>
            <p className="text-sm text-muted mt-1">Instagram 發布效能分析</p>
          </div>
        </div>

        {/* 時間範圍選擇 */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-muted" />
            <span className="text-sm font-medium text-fg">時間範圍</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  days === d
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-fg hover:bg-surface'
                }`}
              >
                {d} 天
              </button>
            ))}
          </div>
        </div>

        {/* 統計卡片 */}
        {overview && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* 總貼文數 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-muted">總貼文數</div>
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-fg">{overview.total_posts}</div>
                <div className="text-xs text-muted mt-1">最近 {days} 天</div>
              </div>

              {/* 已發布 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-muted">已發布</div>
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-green-600">{overview.published_count}</div>
                <div className="text-xs text-muted mt-1">成功發布</div>
              </div>

              {/* 失敗 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-muted">失敗</div>
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-red-600">{overview.failed_count}</div>
                <div className="text-xs text-muted mt-1">發布失敗</div>
              </div>

              {/* 待處理 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-muted">待處理</div>
                  <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-yellow-600">{overview.pending_count}</div>
                <div className="text-xs text-muted mt-1">等待發布</div>
              </div>
            </div>

            {/* 成功率與今日發布 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 成功率 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">成功率</h3>
                <div className="text-5xl font-bold text-primary mb-4">{overview.success_rate}%</div>
                <div className="w-full bg-surface-hover rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-500"
                    style={{ width: `${overview.success_rate}%` }}
                  ></div>
                </div>
                <div className="mt-4 text-sm text-muted">
                  在最近 {days} 天內的發布成功率
                </div>
              </div>

              {/* 今日發布 */}
              <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">今日發布</h3>
                <div className="text-5xl font-bold text-purple-600 mb-4">{overview.today_published}</div>
                <div className="flex items-center gap-2 mt-4">
                  <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                  <div className="text-sm text-muted">今日已成功發布的貼文數量</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 重新整理按鈕 */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={fetchOverview}
            className="px-6 py-3 bg-surface border border-border rounded-lg text-fg hover:bg-surface-hover transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            重新整理數據
          </button>
        </div>
      </main>
    </div>
  );
};

export default AnalyticsPage;
