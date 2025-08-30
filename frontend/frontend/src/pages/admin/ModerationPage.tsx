import { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { api } from '@/services/api';
import io from 'socket.io-client';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, CheckCircle, XCircle, FileText, Image, Clock, User, MessageSquare, ThumbsUp, Filter, Search, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface ModerationItem {
  id: number;
  type: 'post' | 'media';
  content?: string;
  excerpt?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  mime_type?: string;
  status: string;
  created_at: string;
  author?: {
    id: number;
    username: string;
    school_name?: string;
  };
  school_name?: string;
  client_id?: string;
  ip?: string;
  comment_count?: number;
  like_count?: number;
  post_id?: number;
  path?: string;
  preview_url?: string;
}

interface ModerationLog {
  id: number;
  target_type: string;
  target_id: number;
  action: string;
  old_status: string;
  new_status: string;
  reason?: string;
  moderator?: {
    id: number;
    username: string;
  };
  created_at: string;
  // 新後端欄位（相容）
  action_display?: string;
  old_status_display?: string;
  new_status_display?: string;
  source?: string | null;
}

export default function ModerationPage() {
  const { role } = useAuth();
  const isDev = (role === 'dev_admin');
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [itemDetail, setItemDetail] = useState<any>(null);
  const [filters, setFilters] = useState({
    page: 1,
    per_page: 20,
    status: 'pending',
    type: '',
    school: '',
    client_id: '',
    ip: ''
  });
  const [stats, setStats] = useState<any>(null);
  const [deleteRequestStats, setDeleteRequestStats] = useState<any>(null);
  
  // 刪文請求相關狀態
  const [activeTab, setActiveTab] = useState<'queue' | 'delete_requests'>('queue');
  const [deleteRequests, setDeleteRequests] = useState<any[]>([]);
  const [deleteRequestFilter, setDeleteRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedDeleteRequest, setSelectedDeleteRequest] = useState<any>(null);
  const [processingDeleteRequest, setProcessingDeleteRequest] = useState<number | null>(null);
  const [deleteRequestNote, setDeleteRequestNote] = useState('');

  // 媒體預覽組件
  const MediaPreview = ({ id, path, kind, url: providedUrl }: { id: number; path: string; kind?: string; url?: string }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [status, setStatus] = useState<number | null>(null);
    const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(path || '') || kind === 'image';
    const isVid = /\.(mp4|webm|mov)$/i.test(path || '') || kind === 'video';

    useEffect(() => {
      let alive = true;
      let objUrl: string | null = null;
      
      const load = async () => {
        if (providedUrl) {
          console.log(`MediaPreview: Using provided URL for media ${id}:`, providedUrl);
          setUrl(providedUrl);
          return;
        }

        console.log(`MediaPreview: No provided URL, fetching media ${id} via authorized endpoint`);
        try {
          const r = await fetch(`/api/media/${id}/file`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
          });
          setStatus(r.status);
          console.log(`MediaPreview: Auth endpoint response for media ${id}:`, r.status, r.headers.get('Content-Type'));

          if (r.ok) {
            const ctype = r.headers.get('Content-Type') || '';
            if (ctype.includes('application/json')) {
              const txt = await r.text();
              console.log(`MediaPreview: JSON response for media ${id}:`, txt);
              throw new Error(txt || '服務回應非檔案');
            }
            const blob = await r.blob();
            objUrl = URL.createObjectURL(blob);
            if (alive) {
              console.log(`MediaPreview: Created blob URL for media ${id}:`, objUrl);
              setUrl(objUrl);
            }
            return;
          }
          throw new Error(`HTTP ${r.status}`);
        } catch (e: any) {
          if (!alive) return;
          console.log(`MediaPreview: Auth endpoint failed for media ${id}, trying direct uploads:`, e.message);
          try {
            let rel = (path || '').replace(/^\/+/, '');
            if (rel.startsWith('public/')) {
              // 對於已發布的媒體，直接使用 CDN URL
              rel = rel.replace(/^public\//, '');
              const direct = `https://cdn.serelix.xyz/${rel}?t=${Date.now()}`;
              console.log(`MediaPreview: Using direct CDN URL for media ${id}:`, direct);
              setUrl(direct);
              setErr(null);
              return;
            } else if (!rel.startsWith('pending/')) {
              // 對於其他媒體，嘗試 pending 路徑
              rel = `pending/${rel}`;
              const direct = `https://cdn.serelix.xyz/${rel}?t=${Date.now()}`;
              console.log(`MediaPreview: Using pending CDN URL for media ${id}:`, direct);
              setUrl(direct);
              setErr(null);
              return;
            }
          } catch (e2: any) {
            console.log(`MediaPreview: All methods failed for media ${id}:`, e2.message);
            setErr(e?.message || e2?.message || '載入失敗');
          }
        }
      };
      
      load();
      return () => {
        alive = false;
        if (objUrl) URL.revokeObjectURL(objUrl);
      };
    }, [id, path, providedUrl]);

    if (err) return (
      <div className="text-xs text-muted">
        無法載入附件{status ? `（${status}）` : ''}
        <div className="mt-1 break-all opacity-80">{String(err).slice(0, 180)}</div>
      </div>
    );
    
    if (!url) return <div className="h-24 grid place-items-center text-xs text-muted border border-border rounded">載入中…</div>;
    
    const openNew = () => { try { window.open(url!, '_blank'); } catch {} };
    
    if (isImg) return (
      <div>
        <img src={url} alt={`media-${id}`} className="max-h-64 rounded border border-border" />
        <div className="mt-1"><button onClick={openNew} className="text-xs underline">開新視窗預覽</button></div>
      </div>
    );
    
    if (isVid) return (
      <div>
        <video src={url} controls className="w-full max-h-64 rounded border border-border" />
        <div className="mt-1"><button onClick={openNew} className="text-xs underline">開新視窗預覽</button></div>
      </div>
    );
    
    return <a href={url} download className="text-xs underline">下載附件</a>;
  };

  // 獲取審核隊列
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });
      
      console.log('🔍 呼叫審核隊列 API...');
      const response = await api(`/api/moderation/queue?${params}`);
      console.log('📥 API 回應:', response);
      console.log('📊 response.ok:', response.ok);
      console.log('📊 response.data:', response.data);
      
      if (response.ok) {
        console.log('✅ 設定項目:', response.data.items || []);
        setItems(response.data.items || []);
      } else {
        console.log('❌ API 回應不正確');
      }
    } catch (error) {
      console.error('❌ Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // 獲取審核日誌
  const fetchLogs = useCallback(async () => {
    if (!isDev) return; // 僅 dev_admin 取用
    try {
      const response = await api('/api/moderation/logs?per_page=50');
      if (response.ok) {
        setLogs(response.data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, [isDev]);

  // 獲取統計
  const fetchStats = useCallback(async () => {
    try {
      const response = await api('/api/moderation/stats');
      if (response.ok) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  // 獲取刪文請求統計
  const fetchDeleteRequestStats = useCallback(async () => {
    try {
      const response = await api('/api/admin/delete-requests/stats');
      if (response.ok) {
        setDeleteRequestStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch delete request stats:', error);
    }
  }, []);

  // 載入刪文請求列表
  const loadDeleteRequests = useCallback(async () => {
    try {
      const params = deleteRequestFilter !== 'all' ? `?status=${deleteRequestFilter}` : '';
      const response = await fetch(`/api/admin/delete-requests${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDeleteRequests(data.items || []);
      }
    } catch (error) {
      console.error('Failed to load delete requests:', error);
    }
  }, [deleteRequestFilter]);

  // 處理刪文請求批准
  const handleApproveDeleteRequest = async (requestId: number) => {
    if (!deleteRequestNote.trim()) {
      alert('請填寫審核備註');
      return;
    }

    try {
      setProcessingDeleteRequest(requestId);
      const response = await fetch(`/api/admin/delete-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ note: deleteRequestNote.trim() || undefined })
      });

      if (response.ok) {
        await loadDeleteRequests();
        setDeleteRequestNote('');
        setSelectedDeleteRequest(null);
      } else {
        const errorData = await response.json();
        alert(errorData.msg || '批准失敗');
      }
    } catch (error) {
      console.error('Failed to approve delete request:', error);
      alert('批准失敗');
    } finally {
      setProcessingDeleteRequest(null);
    }
  };

  // 處理刪文請求拒絕
  const handleRejectDeleteRequest = async (requestId: number) => {
    try {
      setProcessingDeleteRequest(requestId);
      const response = await fetch(`/api/admin/delete-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ note: deleteRequestNote.trim() || undefined })
      });

      if (response.ok) {
        await loadDeleteRequests();
        setDeleteRequestNote('');
        setSelectedDeleteRequest(null);
      } else {
        const errorData = await response.json();
        alert(errorData.msg || '拒絕失敗');
      }
    } catch (error) {
      console.error('Failed to reject delete request:', error);
      alert('拒絕失敗');
    } finally {
      setProcessingDeleteRequest(null);
    }
  };

  // 獲取項目詳情
  const fetchItemDetail = useCallback(async (item: ModerationItem) => {
    if (item.type === 'post') {
      try {
        const response = await api(`/api/moderation/post/${item.id}`);
        if (response.ok) {
          setItemDetail(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch post detail:', error);
      }
    }
  }, []);

  // 核准內容
  const approveItem = useCallback(async (item: ModerationItem, reason?: string) => {
    try {
      const response = await api('/api/moderation/approve', {
        method: 'POST',
        body: JSON.stringify({
          type: item.type,
          id: item.id,
          reason: reason || ''
        })
      });
      
      if (response.ok) {
        await fetchQueue();
        await fetchLogs();
        await fetchStats();
        setSelectedItem(null);
        setItemDetail(null);
      }
    } catch (error) {
      console.error('Failed to approve item:', error);
    }
  }, [fetchQueue, fetchLogs, fetchStats]);

  // 拒絕內容
  const rejectItem = useCallback(async (item: ModerationItem, reason: string) => {
    try {
      const response = await api('/api/moderation/reject', {
        method: 'POST',
        body: JSON.stringify({
          type: item.type,
          id: item.id,
          reason: reason
        })
      });
      
      if (response.ok) {
        await fetchQueue();
        await fetchLogs();
        await fetchStats();
        setSelectedItem(null);
        setItemDetail(null);
      }
    } catch (error) {
      console.error('Failed to reject item:', error);
    }
  }, [fetchQueue, fetchLogs, fetchStats]);

  // 否決決策（高級權限）
  const overrideDecision = useCallback(async (item: ModerationItem, action: 'approve' | 'reject', reason: string) => {
    try {
      const response = await api('/api/moderation/override', {
        method: 'POST',
        body: JSON.stringify({
          type: item.type,
          id: item.id,
          action: action,
          reason: reason
        })
      });
      
      if (response.ok) {
        await fetchQueue();
        await fetchLogs();
        await fetchStats();
        setSelectedItem(null);
        setItemDetail(null);
      }
    } catch (error) {
      console.error('Failed to override decision:', error);
    }
  }, [fetchQueue, fetchLogs, fetchStats]);

  // 初始化
  useEffect(() => {
    if (activeTab === 'queue') {
      fetchQueue();
      fetchLogs();
      fetchStats();
    } else if (activeTab === 'delete_requests') {
      loadDeleteRequests();
    }
    fetchDeleteRequestStats();
    
    const socket = io('/', { path: '/socket.io' });
    socket.on('post.approved', fetchQueue);
    socket.on('post.rejected', fetchQueue);
    socket.on('media.approved', fetchQueue);
    socket.on('media.rejected', fetchQueue);
    
    // 監聽送審事件
    socket.on('post.pending', (data) => {
      console.log('📝 收到送審事件:', data);
      // 顯示通知
      if (data.post_id && data.content) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        const authorLine = isDev && data.author ? `作者: ${data.author} | ` : '';
        notification.innerHTML = `
          <div class="font-semibold">新貼文送審</div>
          <div class="text-sm">${data.content}</div>
          <div class="text-xs mt-1">${authorLine}時間: ${new Date(data.ts).toLocaleTimeString()}</div>
        `;
        document.body.appendChild(notification);
        
        // 3秒後自動移除
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 3000);
      }
      
      // 重新載入隊列
      fetchQueue();
      fetchStats();
    });
    
    return () => {
      socket.close();
    };
  }, [fetchQueue, fetchLogs, fetchStats, fetchDeleteRequestStats, loadDeleteRequests, activeTab]);

  // 當過濾器改變時重新獲取數據
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    try { const { formatLocalMinute } = require('@/utils/time'); return formatLocalMinute(dateString) } catch { return new Date(dateString).toLocaleString('zh-TW') }
  };

  const formatLocalMinute = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return '剛剛';
    if (diffMins < 60) return `${diffMins}分鐘前`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小時前`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-TW');
  };

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/moderation" />
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
              返回後台
            </button>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">審核管理</h1>
            <p className="text-sm text-muted mt-1">待審核貼文、今日已處理、待處理請求</p>
          </div>
        </div>

        {/* 標籤頁切換 */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-surface-hover p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'queue'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-muted hover:text-fg'
              }`}
            >
              審核隊列
            </button>
            <button
              onClick={() => setActiveTab('delete_requests')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'delete_requests'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-muted hover:text-fg'
              }`}
            >
              刪文請求
            </button>
          </div>
        </div>

        {activeTab === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 審核隊列 */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                審核隊列
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchQueue}
                  className="p-2 text-muted hover:text-fg transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 過濾器 */}
            <div className="mb-4 p-3 bg-surface-hover rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={filters.type}
                  onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                  className="form-control text-sm"
                >
                  <option value="">所有類型</option>
                  <option value="post">貼文</option>
                  <option value="media">媒體</option>
                </select>
                
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="form-control text-sm"
                >
                  <option value="pending">待審核</option>
                  <option value="approved">已核准</option>
                  <option value="rejected">已拒絕</option>
                </select>
                
                {isDev && (
                  <input
                    type="text"
                    placeholder="Client ID"
                    value={filters.client_id}
                    onChange={(e) => setFilters(prev => ({ ...prev, client_id: e.target.value }))}
                    className="form-control text-sm"
                  />
                )}
                
                {isDev && (
                  <input
                    type="text"
                    placeholder="IP 地址"
                    value={filters.ip}
                    onChange={(e) => setFilters(prev => ({ ...prev, ip: e.target.value }))}
                    className="form-control text-sm"
                  />
                )}
              </div>
            </div>

            {/* 項目列表 */}
            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  貼文已提交審核，通過後會在清單中顯示。
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`p-4 rounded-xl border border-border bg-surface-hover cursor-pointer transition-colors ${
                      selectedItem?.id === item.id && selectedItem?.type === item.type ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => {
                      setSelectedItem(item);
                      if (item.type === 'post') {
                        fetchItemDetail(item);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          item.type === 'post' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {item.type === 'post' ? '貼文' : '媒體'}
                        </span>
                        <span className="text-xs text-muted">#{item.id}</span>
                        {item.school_name && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                            {item.school_name}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">
                        <Clock className="inline w-3 h-3 mr-1" />
                        {formatDate(item.created_at)}
                      </span>
                    </div>

                    {item.type === 'post' ? (
                      <div>
                        <div className="mb-2 text-sm line-clamp-2" dangerouslySetInnerHTML={{ __html: item.excerpt || '' }} />
                        {isDev && item.author && (
                          <div className="text-xs text-muted mb-2">
                            作者: {(item as any).author?.username || ''}
                            {(item as any).author?.school_name && ` (${(item as any).author?.school_name})`}
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {item.comment_count || 0} 留言
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" />
                            {item.like_count || 0} 按讚
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 text-sm font-medium">{item.file_name}</div>
                        <div className="text-xs text-muted mb-2">
                          大小: {formatFileSize(item.file_size || 0)} | 類型: {item.file_type}
                        </div>
                        {item.author && (
                          <div className="text-xs text-muted mb-2">
                            作者: {item.author.username}
                            {item.author.school_name && ` (${item.author.school_name})`}
                          </div>
                        )}
                        {/* 媒體預覽 */}
                        <div className="mt-2">
                          <MediaPreview
                            id={item.id}
                            path={item.path || ''}
                            kind={item.file_type}
                            url={item.preview_url}
                          />
                        </div>
                      </div>
                    )}

                    {isDev && (
                      <div className="text-xs text-muted mt-2">
                        來源: {item.client_id ? `client_id=${item.client_id}` : 'client_id=-'} · {item.ip ? `IP=${item.ip}` : 'IP=-'}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 側邊欄 */}
          <div className="space-y-6">
            {/* 統計 */}
            {stats && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">審核統計</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待審核貼文</span>
                    <span className="text-sm font-medium">{(stats.pending?.posts || 0) + (stats.pending?.media || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日已處理</span>
                    <span className="text-sm font-medium">{stats.today?.processed || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待處理請求</span>
                    <span className="text-sm font-medium">{deleteRequestStats?.pending || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 刪文請求統計 */}
            {deleteRequestStats && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">刪文請求</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待審請求</span>
                    <span className="text-sm font-medium text-amber-600">{deleteRequestStats.pending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日處理</span>
                    <span className="text-sm font-medium">{deleteRequestStats.today_processed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日核准</span>
                    <span className="text-sm font-medium text-green-600">{deleteRequestStats.today_approved}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日拒絕</span>
                    <span className="text-sm font-medium text-red-600">{deleteRequestStats.today_rejected}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 選中項目詳情 */}
            {selectedItem && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">項目詳情</h3>
                
                {selectedItem.type === 'post' && itemDetail ? (
                  <div className="space-y-3">
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: itemDetail.content || '' }} />
                    
                    {itemDetail.media && itemDetail.media.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">媒體附件</h4>
                        <div className="space-y-2">
                          {itemDetail.media.map((media: any, index: number) => (
                            <div key={index} className="bg-surface-hover p-2 rounded border">
                              <div className="text-xs text-muted mb-1">{media.file_name}</div>
                              <MediaPreview
                                id={media.id}
                                path={media.path}
                                kind={media.file_type}
                                url={media.preview_url}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : selectedItem.type === 'media' ? (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">{selectedItem.file_name}</div>
                    <div className="text-xs text-muted">
                      大小: {formatFileSize(selectedItem.file_size || 0)}<br />
                      類型: {selectedItem.file_type}<br />
                      MIME: {selectedItem.mime_type}
                    </div>
                  </div>
                ) : null}

                {/* 操作按鈕 */}
                <div className="mt-4 space-y-2">
                  {/* 待審核狀態的操作 */}
                  {selectedItem.status === 'pending' && (
                    <>
                      <button
                        onClick={() => approveItem(selectedItem)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        核准
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('請輸入拒絕原因:');
                          if (reason) {
                            rejectItem(selectedItem, reason);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        拒絕
                      </button>
                    </>
                  )}
                  
                  {/* 已核准狀態的否決操作 */}
                  {selectedItem.status === 'approved' && (
                    <div className="border-t pt-2 mt-2">
                      <div className="text-xs text-muted mb-2">否決操作</div>
                      <button
                        onClick={() => {
                          const reason = prompt('請輸入否決原因:');
                          if (reason) {
                            overrideDecision(selectedItem, 'reject', reason);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        否決核准（下架）
                      </button>
                    </div>
                  )}
                  
                  {/* 已拒絕狀態的否決操作 */}
                  {selectedItem.status === 'rejected' && (
                    <div className="border-t pt-2 mt-2">
                      <div className="text-xs text-muted mb-2">否決操作</div>
                      <button
                        onClick={() => {
                          const reason = prompt('請輸入否決原因:');
                          if (reason) {
                            overrideDecision(selectedItem, 'approve', reason);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        否決拒絕（恢復）
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 審核日誌（僅 dev_admin 顯示） */}
            {isDev && (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">審核日誌</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="p-2 bg-surface-hover rounded text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        {(() => {
                          const isApprove = (log.action || '').startsWith('approve') || log.action === 'approve' || log.action === 'override_approve'
                          return <span className={`text-xs ${isApprove ? 'text-green-600' : 'text-red-600'}`}>●</span>
                        })()}
                        <span>
                          {(log.action_display || (log.action === 'approve' ? '核准' : '拒絕'))}
                          {' '}
                          {log.target_type === 'post' ? '貼文' : '媒體'} #{log.target_id}
                        </span>
                        {(log.old_status_display || log.old_status) && (log.new_status_display || log.new_status) && (
                          <span className="text-muted">
                            {(log.old_status_display || log.old_status)} → {(log.new_status_display || log.new_status)}
                          </span>
                        )}
                        {typeof log.source === 'string' && (
                          <span className="text-primary/80">來源：{log.source || '跨校'}</span>
                        )}
                      </div>
                      <div className="text-muted">
                        審核員: {log.moderator?.username || log.id} · 時間: {formatDate(log.created_at)}
                      </div>
                      {log.reason && (
                        <div className="text-muted mt-1">原因: {log.reason}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* 刪文請求頁面 */}
        {activeTab === 'delete_requests' && (
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                刪文請求管理
              </h2>
              <div className="flex gap-2">
                <select
                  value={deleteRequestFilter}
                  onChange={(e) => setDeleteRequestFilter(e.target.value as any)}
                  className="px-3 py-1.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-fg"
                >
                  <option value="all">全部</option>
                  <option value="pending">待審核</option>
                  <option value="approved">已批准</option>
                  <option value="rejected">已拒絕</option>
                </select>
                <button
                  onClick={loadDeleteRequests}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors"
                >
                  重新整理
                </button>
              </div>
            </div>
            
            {deleteRequests.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-muted">沒有刪文請求</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deleteRequests.map((request) => (
                  <div
                    key={request.id}
                    className="border border-border rounded-xl p-4 bg-surface-hover"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          request.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                          request.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {request.status === 'pending' ? '待審核' :
                           request.status === 'approved' ? '已批准' : '已拒絕'}
                        </span>
                        <span className="text-sm text-muted">#{request.post_id}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {formatLocalMinute(request.created_at)}
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="text-sm font-medium mb-1">刪文理由：</div>
                      <div className="text-sm text-fg bg-background p-2 rounded border">
                        {request.reason}
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="text-sm font-medium mb-1">貼文內容預覽：</div>
                      <div className="text-sm text-fg bg-background p-2 rounded border max-h-20 overflow-y-auto">
                        {request.post_content.length > 200 ? (
                          <>
                            <div 
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: request.post_content.substring(0, 200) + '...' }}
                            />
                            <button
                              onClick={() => {
                                const modal = document.createElement('div')
                                modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'
                                modal.innerHTML = `
                                  <div class="bg-surface border border-border rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                                    <div class="flex items-center justify-between mb-4">
                                      <h3 class="text-lg font-semibold text-fg">完整貼文內容</h3>
                                      <button onclick="this.closest('.fixed').remove()" class="text-muted hover:text-fg">✕</button>
                                    </div>
                                    <div class="prose prose-sm max-w-none text-fg bg-surface-hover p-4 rounded border">
                                      ${request.post_content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                                    </div>
                                  </div>
                                `
                                document.body.appendChild(modal)
                                modal.addEventListener('click', (e) => {
                                  if (e.target === modal) modal.remove()
                                })
                              }}
                              className="text-primary hover:text-primary-dark text-sm ml-2 underline"
                            >
                              查看完整內容
                            </button>
                          </>
                        ) : (
                          <div 
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: request.post_content }}
                          />
                        )}
                      </div>
                    </div>

                    {request.media_files && request.media_files.length > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-medium mb-1">媒體檔案 ({request.media_files.length})：</div>
                        <div className="space-y-2">
                          {request.media_files.map((media: any) => (
                            <div key={media.id} className="bg-background p-2 rounded border">
                              <div className="text-xs text-muted mb-1">{media.file_name}</div>
                              <MediaPreview
                                id={media.id}
                                path={media.path}
                                kind={media.file_type}
                                url={media.preview_url}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {request.review_note && (
                      <div className="mb-3">
                        <div className="text-sm font-medium mb-1">審核備註：</div>
                        <div className="text-sm text-fg bg-background p-2 rounded border">
                          {request.review_note}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <div className="text-xs text-muted">
                        <div>請求者IP: {request.requester_ip || '未知'}</div>
                        {request.reviewed_at && (
                          <div>審核時間: {formatLocalMinute(request.reviewed_at)}</div>
                        )}
                      </div>

                      {request.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedDeleteRequest(request)}
                            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors"
                          >
                            處理請求
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 刪文請求處理對話框 */}
        {selectedDeleteRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-fg mb-4">處理刪文請求</h3>
              <p className="text-sm text-muted mb-4">
                請選擇操作並填寫備註（可選）：
              </p>
              
              <textarea
                value={deleteRequestNote}
                onChange={(e) => setDeleteRequestNote(e.target.value)}
                placeholder="審核備註..."
                className="w-full p-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                rows={3}
              />
              
              <div className="flex gap-3 justify-end mt-4">
                <button
                  onClick={() => {
                    setSelectedDeleteRequest(null)
                    setDeleteRequestNote('')
                  }}
                  className="px-4 py-2 bg-surface-hover text-fg rounded-lg hover:bg-surface-hover/80 transition-colors"
                >
                  取消
                </button>
                
                <button
                  onClick={() => handleRejectDeleteRequest(selectedDeleteRequest.id)}
                  disabled={processingDeleteRequest === selectedDeleteRequest.id}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {processingDeleteRequest === selectedDeleteRequest.id ? '處理中...' : '拒絕'}
                </button>
                
                <button
                  onClick={() => handleApproveDeleteRequest(selectedDeleteRequest.id)}
                  disabled={processingDeleteRequest === selectedDeleteRequest.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {processingDeleteRequest === selectedDeleteRequest.id ? '處理中...' : '批准刪除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
