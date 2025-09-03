import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { Search, Filter, CheckCircle, XCircle, Eye, Clock, User, Calendar, Download, RefreshCw, AlertTriangle, FileText, History, Trash2, MessageSquareDot } from 'lucide-react'
import { HttpError, getJSON } from '@/lib/http'
import DesktopOnly from '@/components/ui/DesktopOnly'
import ErrorPage from '@/components/ui/ErrorPage'
import { formatLocalMinute } from '@/utils/time'
import { getRole, getRoleDisplayName } from '@/utils/auth'

type School = { id: number; slug: string; name: string }

type QueueResp = {
  posts?: PostItem[]
  items?: PostItem[]
}

interface PostItem {
  id: number
  excerpt: string
  content: string
  created_at?: string
  client_id?: string
  ip?: string
  author_hash?: string
  school_name?: string
  media?: MediaItem[]
}

interface MediaItem {
  id: number
  path: string
  file_name?: string
  file_size?: number
  file_type?: string
  mime_type?: string
  status?: string
  created_at?: string
  client_id?: string
  ip?: string
  preview_url?: string
}

interface AuditLog {
  id: number
  action: string
  target_type: string
  target_id: number
  moderator: string
  moderator_id: number
  created_at: string
  details?: string
  old_status?: string
  new_status?: string
  reason?: string
  // 新後端欄位（相容舊版）
  action_display?: string
  old_status_display?: string
  new_status_display?: string
  source?: string | null
}

export default function GeneralAdminPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<PostItem[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'posts' | 'logs' | 'delete_requests'>('posts')
  const [showRejectModal, setShowRejectModal] = useState<{ type: 'post' | 'media', id: number } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  
  // 審核紀錄詳情狀態
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [logDetail, setLogDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  
  // 貼文詳情狀態
  const [showPostDetailModal, setShowPostDetailModal] = useState<{ id: number, content: string } | null>(null)
  
  // 刪文請求狀態
  const [deleteRequests, setDeleteRequests] = useState<any[]>([])
  const [deleteRequestFilter, setDeleteRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [selectedDeleteRequest, setSelectedDeleteRequest] = useState<any>(null)
  const [processingDeleteRequest, setProcessingDeleteRequest] = useState<number | null>(null)
  const [deleteRequestNote, setDeleteRequestNote] = useState('')
  
  // 篩選狀態
  const [showFilters, setShowFilters] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [source, setSource] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [schoolSlug, setSchoolSlug] = useState('')
  
  const [schools, setSchools] = useState<School[]>([])
  const [stats, setStats] = useState({ pending_posts: 0, processed_today: 0 })


  const role = getRole()

  // 角色階層（數字越大權限越高）
  const roleRank = (r?: string|null) => {
    switch (r) {
      case 'dev_admin': return 100
      case 'cross_admin': return 90
      case 'campus_admin': return 80
      case 'cross_moderator': return 70
      case 'campus_moderator': return 60
      default: return 50
    }
  }
  
  // 僅桌面顯示主要內容
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
  
  // 建構查詢字串
  const buildQueryString = () => {
    const params = new URLSearchParams()
    if (keyword) params.append('q', keyword)
    if (authorName) params.append('author_name', authorName)
    if (source) params.append('source', source)
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (schoolSlug) params.append('school', schoolSlug)
    const q = params.toString()
    return q ? `?${q}` : ''
  }

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = buildQueryString()
      const [postsData, schoolsData] = await Promise.all([
        getJSON<QueueResp>(`/api/moderation/queue${params}`),
        getJSON<{ items: School[] }>('/api/schools')
      ])
      
      // 處理新的 API 格式：postsData 可能是 {items: [...]} 或 {posts: [...]}
      const posts = postsData.posts || postsData.items || []
      setPosts(posts)
      setSchools(schoolsData.items || [])
      setStats(prev => ({ ...prev, pending_posts: posts.length || 0 }))
      
      try {
        const m = await getJSON<{ processed_today: number; pending_posts: number }>(`/api/moderation/stats`)
        setStats(prev => ({ ...prev, processed_today: m.processed_today || 0 }))
      } catch (e) {
        console.error('載入統計失敗:', e)
      }
      

      
    } catch (e) {
      if (e instanceof HttpError) {
        setError(e.message)
      } else {
        setError('載入失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    try {
      const response = await getJSON<{ logs?: AuditLog[], items?: AuditLog[] }>('/api/moderation/logs')
      // 處理新的 API 格式：response 可能是 {logs: [...]} 或 {items: [...]} 
      const logs = response.logs || response.items || []
      setAuditLogs(logs)
    } catch (e) {
      console.error('載入審核紀錄失敗:', e)
    }
  }

  const loadDeleteRequests = async () => {
    try {
      const params = deleteRequestFilter !== 'all' ? `?status=${deleteRequestFilter}` : ''
      const response = await fetch(`/api/admin/delete-requests${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      })
      
      if (!response.ok) {
        throw new Error('載入失敗')
      }
      
      const data = await response.json()
      setDeleteRequests(data.items || [])
    } catch (e: any) {
      console.error('載入刪文請求失敗:', e)
    }
  }

  const handleApproveDeleteRequest = async (requestId: number) => {
    if (!confirm('確定要批准這個刪文請求嗎？此操作不可撤銷。')) {
      return
    }

    try {
      setProcessingDeleteRequest(requestId)
      const response = await fetch(`/api/admin/delete-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ note: deleteRequestNote.trim() || undefined })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '操作失敗')
      }

      await loadDeleteRequests()
      setDeleteRequestNote('')
      setSelectedDeleteRequest(null)
    } catch (e: any) {
      alert(e.message || '操作失敗')
    } finally {
      setProcessingDeleteRequest(null)
    }
  }

  const handleRejectDeleteRequest = async (requestId: number) => {
    if (!confirm('確定要拒絕這個刪文請求嗎？')) {
      return
    }

    try {
      setProcessingDeleteRequest(requestId)
      const response = await fetch(`/api/admin/delete-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ note: deleteRequestNote.trim() || undefined })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '操作失敗')
      }

      await loadDeleteRequests()
      setDeleteRequestNote('')
      setSelectedDeleteRequest(null)
    } catch (e: any) {
      alert(e.message || '操作失敗')
    } finally {
      setProcessingDeleteRequest(null)
    }
  }

  const loadLogDetail = async (targetId: number, targetType: string) => {
    try {
      setLoadingDetail(true)
      if (targetType === 'post') {
        const response = await getJSON(`/api/moderation/post/${targetId}`)
        setLogDetail(response)
      } else if (targetType === 'media') {
        // 將媒體紀錄映射回其所屬貼文，統一在貼文詳情中處理
        try {
          const mediaResp = await getJSON(`/api/moderation/media/${targetId}`)
          const postId = mediaResp.post_id
          if (postId) {
            const postResp = await getJSON(`/api/moderation/post/${postId}`)
            setLogDetail(postResp)
          } else {
            setLogDetail({ type: 'media', id: targetId })
          }
        } catch (e) {
          setLogDetail({ type: 'media', id: targetId })
        }
      }
    } catch (e) {
      console.error('載入詳情失敗:', e)
      setLogDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  const approvePost = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/moderation/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ 
          type: 'post',
          id: id,
          reason: '' 
        })
      })
      if (!response.ok) throw new Error('批准失敗')
      await load()
    } catch (e) {
      setError('批准失敗')
    } finally {
      setBusy(null)
    }
  }

  const rejectPost = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/moderation/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ 
          type: 'post',
          id: id,
          reason: rejectReason || '未符合社群規範' 
        })
      })
      if (!response.ok) throw new Error('拒絕失敗')
      await load()
      setShowRejectModal(null)
      setRejectReason('')
    } catch (e) {
      setError('拒絕失敗')
    } finally {
      setBusy(null)
    }
  }

  const approveMedia = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/moderation/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ 
          type: 'media',
          id: id,
          reason: '' 
        })
      })
      if (!response.ok) throw new Error('批准失敗')
      await load()
    } catch (e) {
      setError('批准失敗')
    } finally {
      setBusy(null)
    }
  }

  const rejectMedia = async (id: number) => {
    try {
      setBusy(id)
      const response = await fetch(`/api/moderation/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ 
          type: 'media',
          id: id,
          reason: rejectReason || '未符合社群規範' 
        })
      })
      if (!response.ok) throw new Error('拒絕失敗')
      await load()
      setShowRejectModal(null)
      setRejectReason('')
    } catch (e) {
      setError('拒絕失敗')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (activeTab === 'posts') {
      load()
    } else if (activeTab === 'logs') {
      loadAuditLogs()
    } else if (activeTab === 'delete_requests') {
      loadDeleteRequests()
    }
  }, [activeTab, keyword, authorName, source, startDate, endDate, schoolSlug, deleteRequestFilter])

  if (error) {
    return <ErrorPage title="管理後台載入失敗" message={error} />
  }

  return (
    <div className="min-h-screen min-h-dvh bg-base">
      <NavBar pathname="/admin/moderation" />

      <div className="container mx-auto px-4 py-6 max-w-7xl pt-20 sm:pt-24 md:pt-28">
        <div className="flex flex-col gap-6">
          {/* 標題與刷新 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-2xl font-bold text-fg">管理後台</h1>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="text-sm text-muted">身份：{getRoleDisplayName(role)}</span>
              <button
                onClick={() => activeTab === 'posts' ? load() : activeTab === 'logs' ? loadAuditLogs() : loadDeleteRequests()}
                className="btn-secondary px-3 py-2 flex items-center gap-2"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>

          {/* 統計卡片 + 快捷連結 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface border border-border rounded-xl p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-fg">{stats.pending_posts}</div>
                  <div className="text-sm text-muted">待審核貼文</div>
                </div>
              </div>
            </div>
            
            <div className="bg-surface border border-border rounded-xl p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-700" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-fg">{stats.processed_today}</div>
                  <div className="text-sm text-muted">今日已處理</div>
                </div>
              </div>
            </div>

            {/* 聊天室快捷卡片 */}
            <div className="bg-surface border border-border rounded-xl p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MessageSquareDot className="w-6 h-6 text-blue-700" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-fg">聊天室</div>
                  <div className="text-sm text-muted">待處理請求</div>
                </div>
              </div>
            </div>
          </div>

          {/* 頁籤 */}
          <div className="border-b border-border">
            <nav className="flex space-x-8" aria-label="頁籤">
              <button
                onClick={() => setActiveTab('posts')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'posts'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg hover:border-border'
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                待審核貼文
              </button>
              
              {role === 'dev_admin' && (
              <button
                onClick={() => setActiveTab('logs')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'logs'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg hover:border-border'
                }`}
              >
                <History className="w-4 h-4 inline mr-2" />
                審核紀錄
              </button>
              )}

              <button
                onClick={() => setActiveTab('delete_requests')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'delete_requests'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg hover:border-border'
                }`}
              >
                <Trash2 className="w-4 h-4 inline mr-2" />
                刪文請求
              </button>
            </nav>
          </div>

          {/* 內容區域 */}
          <div className="space-y-4">
            {activeTab === 'posts' && (
              <>
                {/* 篩選器 */}
                <div className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-fg">篩選條件</h3>
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className="text-sm text-primary hover:text-primary-dark"
                    >
                      <Filter className="w-4 h-4 inline mr-1" />
                      {showFilters ? '隱藏' : '顯示'}篩選
                    </button>
                  </div>
                  
                  {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-muted mb-1">關鍵字</label>
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          placeholder="搜尋內容..."
                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      
                                             <div>
                         <label className="block text-sm font-medium text-muted mb-1">作者名稱</label>
                         <input
                           type="text"
                           value={authorName}
                           onChange={(e) => setAuthorName(e.target.value)}
                           placeholder="搜尋作者名稱..."
                           className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                         />
                       </div>
                       
                       <div>
                         <label className="block text-sm font-medium text-muted mb-1">來源</label>
                         <select
                           value={source}
                           onChange={(e) => setSource(e.target.value)}
                           className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                         >
                           <option value="">全部來源</option>
                           <option value="cross">跨校</option>
                           <option value="all">全部</option>
                           {schools.map(school => (
                             <option key={school.id} value={school.slug}>{school.name}</option>
                           ))}
                         </select>
                       </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-muted mb-1">開始日期</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-muted mb-1">結束日期</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-muted mb-1">學校</label>
                        <select
                          value={schoolSlug}
                          onChange={(e) => setSchoolSlug(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          <option value="">全部學校</option>
                          {schools.map(school => (
                            <option key={school.id} value={school.slug}>{school.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 貼文列表 */}
                <div className="space-y-4">
                  {loading ? (
                    <div className="text-center py-8">
                      <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                      <p className="text-muted">載入中...</p>
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-muted">目前沒有待審核的貼文</p>
                    </div>
                  ) : (
                    posts.map(post => (
                      <div key={post.id} className="bg-surface border border-border rounded-xl p-6 space-y-4">
                        <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-fg">貼文 #{post.id}</span>
                              <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                                {post.school_name || '跨校'}
                              </span>
                            </div>
                            
                            <div className="prose prose-sm max-w-none mb-3">
                              <div 
                                className="text-fg" 
                                dangerouslySetInnerHTML={{ __html: post.excerpt || post.content || '' }}
                              />
                              {(post.excerpt || post.content || '').length > 200 && (
                                <button
                                  onClick={() => setShowPostDetailModal({ id: post.id, content: post.content || '' })}
                                  className="text-primary hover:text-primary-dark text-sm mt-2 underline"
                                >
                                  查看完整內容
                                </button>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-muted">
                              {post.created_at && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatLocalMinute(post.created_at)}
                                </span>
                              )}
                              {role === 'dev_admin' && post.client_id && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {post.client_id}
                                </span>
                              )}
                              {role === 'dev_admin' && post.ip && (
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {post.ip}
                                </span>
                              )}
                            </div>
                            
                            {/* 媒體附件 */}
                            {post.media && post.media.length > 0 && (
                              <div className="mt-3">
                                <h4 className="text-sm font-medium mb-2">媒體附件 ({post.media.length})</h4>
                                <div className="space-y-2">
                                  {post.media.map((media: any, index: number) => (
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
                          
                          <div className="flex items-center gap-2 sm:ml-4 mt-2 sm:mt-0 flex-wrap">
                            <button
                              onClick={() => approvePost(post.id)}
                              disabled={busy === post.id}
                              className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              批准
                            </button>
                            
                            <button
                              onClick={() => setShowRejectModal({ type: 'post', id: post.id })}
                              disabled={busy === post.id}
                              className="btn-danger px-4 py-2 text-sm flex items-center gap-2"
                            >
                              <XCircle className="w-4 h-4" />
                              拒絕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeTab === 'logs' && role === 'dev_admin' && (
              <div className="bg-surface border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-fg">審核紀錄</h3>
                  <button
                    onClick={loadAuditLogs}
                    className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                  >
                    <RefreshCw className="w-4 h-4" />
                    刷新
                  </button>
                </div>
                
                {auditLogs.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-muted">目前沒有審核紀錄</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                                         {auditLogs.map(log => (
                       <div key={log.id} className="border border-border rounded-xl p-4 bg-surface/50">
                         {/* 主要資訊行 */}
                         <div className="flex items-start justify-between mb-3">
                           <div className="flex-1">
                             <div className="flex items-center gap-2 mb-2">
                               {(() => {
                                 const isApprove = (log.action || '').startsWith('approve') || log.action === 'approve' || log.action === 'override_approve'
                                 const label = log.action_display || (isApprove ? '核准' : '拒絕')
                                 return (
                                   <span className={`px-2 py-1 rounded-full text-xs font-medium ${isApprove ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text'}`}>
                                     {label}
                                   </span>
                                 )
                               })()}
                               <span className="text-xs px-2 py-1 bg-muted/10 text-muted rounded">
                                 {log.target_type === 'post' ? '貼文' : '媒體'} #{log.target_id}
                               </span>
                             </div>
                             
                             {/* 狀態變更 */}
                             {(log.old_status_display || log.old_status) && (log.new_status_display || log.new_status) && (
                               <div className="text-xs text-muted mb-1">
                                 {(log.old_status_display || log.old_status)} → {(log.new_status_display || log.new_status)}
                               </div>
                             )}
                             
                             {/* 來源學校 */}
                             {typeof log.source === 'string' && (
                               <div className="text-xs text-muted mb-1">
                                 來源：{log.source || '跨校'}
                               </div>
                             )}
                           </div>
                           
                           <div className="text-xs text-muted text-right ml-4">
                             {formatLocalMinute(log.created_at)}
                           </div>
                         </div>
                         
                         {/* 審核者資訊 */}
                         <div className="flex items-center justify-between mb-3">
                           <div className="flex items-center gap-2 text-sm">
                             <User className="w-4 h-4 text-muted" />
                             <span className="text-muted">審核者:</span>
                             <span className="font-medium text-fg">
                               {log.moderator || `ID: ${log.moderator_id}`}
                             </span>
                           </div>
                           <button
                             onClick={() => {
                               if (selectedLog?.id === log.id) {
                                 setSelectedLog(null)
                                 setLogDetail(null)
                               } else {
                                 setSelectedLog(log)
                                 loadLogDetail(log.target_id, log.target_type)
                               }
                             }}
                             className="text-xs text-primary hover:text-primary-dark flex items-center gap-1"
                           >
                             <Eye className="w-3 h-3" />
                             {selectedLog?.id === log.id ? '隱藏詳情' : '查看詳情'}
                           </button>
                         </div>
                         
                         {/* 拒絕理由 */}
                         {log.reason && (
                           <div className="mb-2">
                             <div className="text-xs text-muted mb-1">原因:</div>
                             <div className="text-sm text-fg bg-surface-hover p-2 rounded border">
                               {log.reason}
                             </div>
                           </div>
                         )}
                         
                         {/* 備註 */}
                         {log.details && (
                           <div className="mb-2">
                             <div className="text-xs text-muted mb-1">備註:</div>
                             <div className="text-sm text-fg bg-surface-hover p-2 rounded border">
                               {log.details}
                             </div>
                           </div>
                         )}
                        
                        {/* 詳情展開區域 */}
                        {selectedLog?.id === log.id && (
                          <div className="mt-3 p-3 bg-surface-hover rounded-lg border">
                            {loadingDetail ? (
                              <div className="flex items-center justify-center py-4">
                                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                <span className="text-sm text-muted">載入詳情中...</span>
                              </div>
                            ) : logDetail ? (
                              logDetail.type === 'media' ? (
                                <div className="text-sm">
                                  <div className="font-medium mb-2">媒體檔案詳情</div>
                                  <div className="text-muted">媒體 ID: {logDetail.id}</div>
                                  <div className="text-muted">詳情功能開發中...</div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div>
                                    <div className="font-medium mb-2">貼文內容：</div>
                                    <div className="text-sm text-fg bg-surface p-2 rounded border max-h-32 overflow-y-auto">
                                      <div 
                                        className="prose prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: logDetail.content || '無內容' }}
                                      />
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <span className="text-muted">作者：</span>
                                      <span className="font-medium">{logDetail.author || '匿名'}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted">留言數：</span>
                                      <span className="font-medium">{logDetail.comment_count || 0}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted">按讚數：</span>
                                      <span className="font-medium">{logDetail.like_count || 0}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted">狀態：</span>
                                      <span className="font-medium">{logDetail.status || '未知'}</span>
                                    </div>
                                  </div>
                                  
                                  {logDetail.media && logDetail.media.length > 0 && (
                                    <div>
                                      <div className="font-medium mb-2">媒體檔案：</div>
                                      <div className="space-y-2">
                                        {logDetail.media.map((media: any) => (
                                          <div key={media.id} className="bg-surface p-2 rounded border">
                                            <div className="text-xs text-muted mb-1">{media.file_name || media.path}</div>
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

                                  {/* 否決操作（dev_admin / campus_admin / cross_admin 可見） */}
                                  {(() => {
                                    // 僅當前使用者權限高於原審核者才顯示「否決」操作；
                                    // 若未知原審核者角色，僅 dev_admin 可複決。
                                    const myRank = roleRank(role)
                                    const moderatorRole = (selectedLog as any)?.moderator_role as (string|undefined)
                                    const hasModRole = typeof moderatorRole === 'string' && moderatorRole.length > 0
                                    const modRank = roleRank(hasModRole ? moderatorRole : null)
                                    const canOverride = hasModRole ? (myRank > modRank) : (role === 'dev_admin')
                                    return canOverride && logDetail.status && logDetail.id
                                  })() && (
                                    <div className="border-t pt-2 mt-2">
                                      <div className="text-xs text-muted mb-2">否決操作</div>
                                      {logDetail.status === 'approved' ? (
                                        <button
                                          onClick={async () => {
                                            const reason = prompt('請輸入否決原因:')
                                            if (!reason) return
                                            try {
                                              await fetch('/api/moderation/override', {
                                                method: 'POST',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                                                },
                                                body: JSON.stringify({ type: 'post', id: logDetail.id, action: 'reject', reason })
                                              })
                                              await loadAuditLogs()
                                              setSelectedLog(null)
                                              setLogDetail(null)
                                            } catch (e) {
                                              alert('否決操作失敗')
                                            }
                                          }}
                                          className="btn-danger px-3 py-1.5 text-sm flex items-center gap-2"
                                        >
                                          否決核准（下架）
                                        </button>
                                      ) : logDetail.status === 'rejected' ? (
                                        <button
                                          onClick={async () => {
                                            const reason = prompt('請輸入否決原因:')
                                            if (!reason) return
                                            try {
                                              await fetch('/api/moderation/override', {
                                                method: 'POST',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                                                },
                                                body: JSON.stringify({ type: 'post', id: logDetail.id, action: 'approve', reason })
                                              })
                                              await loadAuditLogs()
                                              setSelectedLog(null)
                                              setLogDetail(null)
                                            } catch (e) {
                                              alert('否決操作失敗')
                                            }
                                          }}
                                          className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2"
                                        >
                                          否決拒絕（恢復）
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              )
                            ) : (
                              <div className="text-sm text-muted">無法載入詳情</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'delete_requests' && (
              <div className="bg-surface border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-fg">刪文請求管理</h3>
                  <div className="flex gap-2">
                    <select
                      value={deleteRequestFilter}
                      onChange={(e) => setDeleteRequestFilter(e.target.value as any)}
                      className="form-control text-sm"
                    >
                      <option value="all">全部</option>
                      <option value="pending">待審核</option>
                      <option value="approved">已批准</option>
                      <option value="rejected">已拒絕</option>
                    </select>
                    <button
                      onClick={loadDeleteRequests}
                      className="px-3 py-1.5 text-sm rounded-xl border dual-btn"
                    >
                      重新整理
                    </button>
                  </div>
                </div>
                
                {deleteRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-muted">沒有刪文請求</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deleteRequests.map((request) => (
                      <div
                        key={request.id}
                        className="border border-border rounded-xl p-4 bg-surface/50"
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
                          <div className="text-sm text-fg bg-surface-hover p-2 rounded border">
                            {request.reason}
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="text-sm font-medium mb-1">貼文內容預覽：</div>
                          <div className="text-sm text-fg bg-surface-hover p-2 rounded border max-h-20 overflow-y-auto">
                            {request.post_content.length > 200 ? (
                              <>
                                <div 
                                  className="prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: request.post_content.substring(0, 200) + '...' }}
                                />
                                <button
                                  onClick={() => {
                                    // 創建一個更好的詳情查看對話框
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
                                <div key={media.id} className="bg-surface-hover p-2 rounded border">
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
                            <div className="text-sm text-fg bg-surface-hover p-2 rounded border">
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
                                className="px-3 py-1.5 text-sm rounded-xl border dual-btn"
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
          </div>
        </div>
      </div>

      {/* 拒絕確認對話框 */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-fg mb-4">
              {showRejectModal.type === 'post' ? '拒絕貼文' : 
               showRejectModal.type === 'media' ? '拒絕媒體' : '拒絕項目'}
            </h3>
            <p className="text-sm text-muted mb-4">
              請填寫拒絕理由（可選）：
            </p>
            
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="不符合社群規範..."
              className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              rows={3}
            />
            
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(null)
                  setRejectReason('')
                }}
                className="btn-secondary px-4 py-2"
              >
                取消
              </button>
              
              <button
                onClick={() => {
                  if (showRejectModal.type === 'post') {
                    rejectPost(showRejectModal.id)
                  } else if (showRejectModal.type === 'media') {
                    rejectMedia(showRejectModal.id)
                  }
                }}
                className="btn-danger px-4 py-2"
              >
                確認拒絕
              </button>
            </div>
          </div>
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
              className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              rows={3}
            />
            
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => {
                  setSelectedDeleteRequest(null)
                  setDeleteRequestNote('')
                }}
                className="btn-secondary px-4 py-2"
              >
                取消
              </button>
              
              <button
                onClick={() => handleRejectDeleteRequest(selectedDeleteRequest.id)}
                disabled={processingDeleteRequest === selectedDeleteRequest.id}
                className="btn-secondary px-4 py-2"
              >
                {processingDeleteRequest === selectedDeleteRequest.id ? '處理中...' : '拒絕'}
              </button>
              
              <button
                onClick={() => handleApproveDeleteRequest(selectedDeleteRequest.id)}
                disabled={processingDeleteRequest === selectedDeleteRequest.id}
                className="btn-danger px-4 py-2"
              >
                {processingDeleteRequest === selectedDeleteRequest.id ? '處理中...' : '批准刪除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 貼文詳情對話框 */}
      {showPostDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-fg">貼文完整內容</h3>
              <button
                onClick={() => setShowPostDetailModal(null)}
                className="text-muted hover:text-fg"
              >
                ✕
              </button>
            </div>
            
            <div className="bg-surface-hover border border-border rounded-lg p-4">
              <div 
                className="prose prose-sm max-w-none text-fg"
                dangerouslySetInnerHTML={{ __html: showPostDetailModal.content || '' }}
              />
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav />
    </div>
  )
}
