/**
 * Instagram 貼文詳情頁面
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { normalizeCdnUrl } from '@/utils/cdn';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

interface PostDetail {
  id: number;
  public_id: string;
  forum_post_id: number;
  forum_post_title: string | null;
  forum_post_content: string | null;
  account_id: number;
  account_username: string;
  school_id: number | null;
  school_name: string;
  template_id: number;
  template_name: string | null;
  status: string;
  publish_mode: string;
  carousel_group_id: string | null;
  carousel_position: number | null;
  carousel_total: number | null;
  ig_media_id: string | null;
  ig_container_id: string | null;
  ig_permalink: string | null;
  rendered_image_cdn_path: string | null;
  rendered_caption: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  max_retries: number;
  last_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/ig/posts/${id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '載入失敗');
      }

      const data = await response.json();
      setPost(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPost();
  }, [id]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'rendering':
      case 'publishing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'ready':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'published':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-danger" />;
      default:
        return <AlertCircle className="w-5 h-5 text-muted" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      rendering: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      ready: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      publishing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      published: 'bg-success-bg text-success-text',
      failed: 'bg-danger-bg text-danger-text',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
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

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar pathname="/admin/ig/posts" />
        <MobileBottomNav />
        <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
          <div className="bg-surface border border-border rounded-2xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-fg mb-2">載入失敗</h2>
            <p className="text-muted mb-4">{error || '找不到該貼文'}</p>
            <button
              onClick={() => navigate('/admin/ig/queue')}
              className="btn-primary"
            >
              返回佇列
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar pathname="/admin/ig/posts" />
      <MobileBottomNav />

      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* Header */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/admin/ig/queue')}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回佇列
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(post.status)}
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold dual-text">{post.public_id}</h1>
                <p className="text-sm text-muted mt-1">發布記錄詳情</p>
              </div>
            </div>
            <button
              onClick={fetchPost}
              className="p-2 text-muted hover:text-fg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 基本資訊 */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-fg mb-4">基本資訊</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-muted">狀態</div>
                <div className="mt-1">{getStatusBadge(post.status)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">發布模式</div>
                <div className="mt-1 text-fg">{post.publish_mode.toUpperCase()}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Instagram 帳號</div>
                <div className="mt-1 text-fg">@{post.account_username}</div>
              </div>
              <div>
                <div className="text-sm text-muted">學校</div>
                <div className="mt-1 text-fg">{post.school_name}</div>
              </div>
              <div>
                <div className="text-sm text-muted">模板</div>
                <div className="mt-1 text-fg">{post.template_name || '未指定'}</div>
              </div>
              <div>
                <div className="text-sm text-muted">建立時間</div>
                <div className="mt-1 text-fg">{new Date(post.created_at).toLocaleString('zh-TW')}</div>
              </div>
              <div>
                <div className="text-sm text-muted">更新時間</div>
                <div className="mt-1 text-fg">{new Date(post.updated_at).toLocaleString('zh-TW')}</div>
              </div>
            </div>
          </div>

          {/* 論壇貼文資訊 */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-fg mb-4">原始貼文</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-muted">貼文 ID</div>
                <div className="mt-1 text-fg">#{post.forum_post_id}</div>
              </div>
              {post.forum_post_title && (
                <div>
                  <div className="text-sm text-muted">標題</div>
                  <div className="mt-1 text-fg">{post.forum_post_title}</div>
                </div>
              )}
              {post.forum_post_content && (
                <div>
                  <div className="text-sm text-muted">內容預覽</div>
                  <div className="mt-1 text-fg line-clamp-4">{post.forum_post_content}</div>
                </div>
              )}
            </div>
          </div>

          {/* 發布資訊 */}
          {(post.scheduled_at || post.published_at || post.ig_permalink) && (
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
              <h2 className="text-lg font-semibold text-fg mb-4">發布資訊</h2>
              <div className="space-y-3">
                {post.scheduled_at && (
                  <div>
                    <div className="text-sm text-muted">排程時間</div>
                    <div className="mt-1 text-fg">{new Date(post.scheduled_at).toLocaleString('zh-TW')}</div>
                  </div>
                )}
                {post.published_at && (
                  <div>
                    <div className="text-sm text-muted">發布時間</div>
                    <div className="mt-1 text-fg">{new Date(post.published_at).toLocaleString('zh-TW')}</div>
                  </div>
                )}
                {post.ig_permalink && (
                  <div>
                    <div className="text-sm text-muted">Instagram 連結</div>
                    <a
                      href={post.ig_permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 text-primary hover:underline break-all"
                    >
                      {post.ig_permalink}
                    </a>
                  </div>
                )}
                {post.ig_media_id && (
                  <div>
                    <div className="text-sm text-muted">Media ID</div>
                    <div className="mt-1 text-fg font-mono text-sm">{post.ig_media_id}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 錯誤資訊 */}
          {post.error_message && (
            <div className="bg-danger-bg border border-danger-text rounded-2xl p-6 shadow-soft">
              <h2 className="text-lg font-semibold text-danger-text mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                錯誤資訊
              </h2>
              <div className="space-y-3">
                {post.error_code && (
                  <div>
                    <div className="text-sm text-danger-text/70">錯誤代碼</div>
                    <div className="mt-1 text-danger-text font-mono">{post.error_code}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-danger-text/70">錯誤訊息</div>
                  <div className="mt-1 text-danger-text">{post.error_message}</div>
                </div>
                <div>
                  <div className="text-sm text-danger-text/70">重試次數</div>
                  <div className="mt-1 text-danger-text">{post.retry_count} / {post.max_retries}</div>
                </div>
                {post.last_retry_at && (
                  <div>
                    <div className="text-sm text-danger-text/70">最後重試時間</div>
                    <div className="mt-1 text-danger-text">{new Date(post.last_retry_at).toLocaleString('zh-TW')}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 渲染預覽 */}
          {post.rendered_image_cdn_path && (
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft lg:col-span-2">
              <h2 className="text-lg font-semibold text-fg mb-4">渲染預覽</h2>
              <img
                src={normalizeCdnUrl(post.rendered_image_cdn_path || '')}
                alt="Rendered post"
                className="max-w-full h-auto rounded-lg border border-border"
              />
            </div>
          )}

          {/* Caption */}
          {post.rendered_caption && (
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft lg:col-span-2">
              <h2 className="text-lg font-semibold text-fg mb-4">Caption</h2>
              <pre className="text-sm text-fg whitespace-pre-wrap font-sans">{post.rendered_caption}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PostDetailPage;
