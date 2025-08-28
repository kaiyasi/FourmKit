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
    fetchQueue();
    fetchLogs();
    fetchStats();
    
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
  }, [fetchQueue, fetchLogs, fetchStats]);

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
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">內容審核</h1>
            <p className="text-sm text-muted mt-1">審核待處理的貼文和媒體內容</p>
          </div>
        </div>

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
                <h3 className="text-lg font-semibold text-fg mb-4">統計</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待審貼文</span>
                    <span className="text-sm font-medium">{stats.pending.posts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">待審媒體</span>
                    <span className="text-sm font-medium">{stats.pending.media}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日處理</span>
                    <span className="text-sm font-medium">{stats.today.processed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日核准</span>
                    <span className="text-sm font-medium text-green-600">{stats.today.approved}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted">今日拒絕</span>
                    <span className="text-sm font-medium text-red-600">{stats.today.rejected}</span>
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
      </main>
    </div>
  );
}
