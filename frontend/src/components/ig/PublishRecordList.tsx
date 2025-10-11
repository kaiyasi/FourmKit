/**
 * Instagram 發布記錄列表組件
 */

import React, { useState, useEffect } from 'react';
import { normalizeCdnUrl } from '@/utils/cdn';

interface PublishRecord {
  id: number;
  public_id: string;
  forum_post_id: number;
  username: string;
  status: string;
  publish_mode: string;
  rendered_image_cdn_path: string | null;
  rendered_caption: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  max_retries: number;
  published_at: string | null;
  created_at: string;
}

interface PublishRecordListProps {
  onRetry: (postId: number) => void;
}

const PublishRecordList: React.FC<PublishRecordListProps> = ({ onRetry }) => {
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 15000); // 每 15 秒更新
    return () => clearInterval(interval);
  }, [statusFilter]);

  const fetchRecords = async () => {
    try {
      const url = new URL('/api/admin/ig/posts', window.location.origin);
      url.searchParams.set('per_page', '50');
      if (statusFilter !== 'all') {
        url.searchParams.set('status', statusFilter);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入記錄失敗');
      }
      setRecords(data.posts || []);
    } catch (err) {
      console.error('載入記錄失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { text: '等待中', color: 'text-[#8B9CAA]' },      // 莫蘭迪灰藍
      rendering: { text: '渲染中', color: 'text-[#7C9DB8]' },    // 莫蘭迪藍
      ready: { text: '準備發布', color: 'text-[#7C9885]' },      // 莫蘭迪綠
      publishing: { text: '發布中', color: 'text-[#B89F7C]' },   // 莫蘭迪橙
      published: { text: '已發布', color: 'text-[#7C9885]' },    // 莫蘭迪綠
      failed: { text: '失敗', color: 'text-[#B87C8B]' },         // 莫蘭迪紅
      cancelled: { text: '已取消', color: 'text-[#8B9CAA]' }     // 莫蘭迪灰藍
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return <span className={`text-sm font-medium ${config.color}`}>{config.text}</span>;
  };

  const getPublishModeText = (mode: string) => {
    const modes = {
      instant: '即時',
      batch: '批次',
      scheduled: '排程'
    };
    return modes[mode as keyof typeof modes] || mode;
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return <div className="text-center py-8 text-muted">載入中...</div>;
  }

  return (
    <div className="space-y-4">
      
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: '全部' },
          { value: 'pending', label: '等待中' },
          { value: 'rendering', label: '渲染中' },
          { value: 'ready', label: '準備發布' },
          { value: 'published', label: '已發布' },
          { value: 'failed', label: '失敗' }
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              statusFilter === value
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-fg hover:bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      
      {records.length === 0 ? (
        <div className="text-center py-8 text-muted">無發布記錄</div>
      ) : (
        <div className="space-y-2">
          {records.map(record => (
            <div
              key={record.id}
              className="bg-surface border border-border rounded-xl shadow-soft hover:shadow-md transition"
            >
              
              <div
                className="p-4 cursor-pointer"
                onClick={() => toggleExpand(record.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono text-muted">{record.public_id}</div>
                    {getStatusBadge(record.status)}
                    <span className="text-sm text-[#9B8BA8]">
                      {getPublishModeText(record.publish_mode)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-muted">
                    <span>@{record.username}</span>
                    <span>{new Date(record.created_at).toLocaleString('zh-TW')}</span>
                    <svg
                      className={`w-5 h-5 transition-transform ${expandedId === record.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              
              {expandedId === record.id && (
                <div className="border-t border-border px-4 py-4 bg-surface-hover space-y-4">
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted mb-1">貼文 ID</div>
                      <div className="text-fg">#{record.forum_post_id}</div>
                    </div>
                    <div>
                      <div className="text-muted mb-1">帳號</div>
                      <div className="text-fg">@{record.username}</div>
                    </div>
                    <div>
                      <div className="text-muted mb-1">狀態</div>
                      <div>{getStatusBadge(record.status)}</div>
                    </div>
                    <div>
                      <div className="text-muted mb-1">發布模式</div>
                      <div className="text-fg">{getPublishModeText(record.publish_mode)}</div>
                    </div>
                    <div>
                      <div className="text-muted mb-1">建立時間</div>
                      <div className="text-fg">{new Date(record.created_at).toLocaleString('zh-TW')}</div>
                    </div>
                    {record.published_at && (
                      <div>
                        <div className="text-muted mb-1">發布時間</div>
                        <div className="text-fg">{new Date(record.published_at).toLocaleString('zh-TW')}</div>
                      </div>
                    )}
                  </div>

                  
                  {record.rendered_image_cdn_path && (
                    <div>
                      <div className="text-sm font-medium text-fg mb-2">渲染圖片：</div>
                      <img
                        src={normalizeCdnUrl(record.rendered_image_cdn_path)}
                        alt="渲染預覽"
                        className="max-w-md rounded-lg border border-border shadow-soft"
                      />
                    </div>
                  )}

                  
                  {record.rendered_caption && (
                    <div>
                      <div className="text-sm font-medium text-fg mb-2">Caption：</div>
                      <div className="bg-surface border border-border rounded-lg p-3 text-sm text-fg whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {record.rendered_caption}
                      </div>
                    </div>
                  )}

                  
                  {record.ig_permalink && (
                    <div>
                      <div className="text-sm font-medium text-fg mb-2">Instagram 連結：</div>
                      <a
                        href={record.ig_permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {record.ig_permalink}
                      </a>
                    </div>
                  )}

                  
                  {record.error_message && (
                    <div>
                      <div className="text-sm font-medium text-[#B87C8B] mb-2">錯誤訊息：</div>
                      <div className="bg-danger-bg border border-danger-border rounded-lg p-3 text-sm text-danger-text">
                        <div className="font-medium">錯誤碼：{record.error_code || 'N/A'}</div>
                        <div className="mt-1">{record.error_message}</div>
                        <div className="mt-2 text-xs">
                          重試次數：{record.retry_count}/{record.max_retries}
                        </div>
                      </div>
                    </div>
                  )}

                  
                  {record.status === 'failed' && record.retry_count < record.max_retries && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => onRetry(record.id)}
                        className="px-4 py-2 btn-primary text-sm"
                      >
                        重試發布
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PublishRecordList;
