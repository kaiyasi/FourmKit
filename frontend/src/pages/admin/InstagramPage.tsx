import React, { useState, useEffect } from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { 
  Instagram, 
  Plus, 
  Settings, 
  Activity, 
  Users, 
  Image, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  BarChart3,
  RefreshCw,
  ArrowLeft,
  Shield,
  Eye,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { renderNodeToImage } from '@/utils/font-safe-render';

interface IGAccount {
  id: number;
  ig_username: string;
  display_name: string;
  status: string;
  publish_mode: string;
  school_name: string | null;
  total_posts: number;
  last_post_at: string | null;
  created_at: string;
}

interface IGPost {
  id: number;
  account_name: string;
  ig_username: string;
  forum_post_content: string;
  status: string;
  ig_post_url: string | null;
  created_at: string;
  published_at: string | null;
  error_message: string | null;
}

interface DashboardStats {
  accounts: {
    total: number;
    active: number;
    inactive: number;
  };
  posts: {
    total: number;
    published: number;
    pending: number;
    failed: number;
    success_rate: number;
  };
  recent: {
    published_last_7_days: number;
  };
}

const InstagramPage: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = ['dev_admin', 'admin'].includes(role || '');
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [accounts, setAccounts] = useState<IGAccount[]>([]);
  const [posts, setPosts] = useState<IGPost[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableIgAccounts, setAvailableIgAccounts] = useState<any[]>([]);
  const [selectedAutoIndex, setSelectedAutoIndex] = useState<number>(0);
  const [platformFonts, setPlatformFonts] = useState<any[]>([]);
  const [showManualInput, setShowManualInput] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  // 編輯帳號：模板清單與預設模板選擇
  const [editAccountTemplates, setEditAccountTemplates] = useState<any[]>([]);
  const [selectedDefaultTemplateId, setSelectedDefaultTemplateId] = useState<number | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  // 後端貼文預覽：以 forum_post_id 生成圖片
  const [backendPreviewPostId, setBackendPreviewPostId] = useState<string>('');
  const [backendPreviewUrl, setBackendPreviewUrl] = useState<string>('');
  const [schools, setSchools] = useState<{id: number, name: string, slug: string}[]>([]);
  // 預覽輔助：格線/座標
  const [showGrid, setShowGrid] = useState<boolean>(true);
  // 以實際貼文作為模板預覽範例
  const [previewPosts, setPreviewPosts] = useState<IGPost[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [previewData, setPreviewData] = useState<any>({
    background: { type: 'color', color: '#FFFFFF', image: null, url: null },
    content_block: {
      enabled: true,
      font_family: '',
      font_weight: '400',
      font_size: 28,
      color: '#000000',
      align: 'left',
      max_lines: 15
    },
    logo: { 
      enabled: true, 
      size: 80, 
      position: { x: 0.9, y: 0.1 },
      image: null,
      url: null
    },
    timestamp: {
      enabled: true,
      hour_format: '24',
      font_size: 16,
      color: '#666666',
      position: { x: 0.1, y: 0.9 },
      format: '%Y-%m-%d %H:%M',
      font_family: '',
      font_weight: '400'
    },
    post_id: {
      enabled: false,
      font_family: '',
      font_weight: '400',
      font_size: 14,
      color: '#999999',
      position: { x: 0.9, y: 0.9 },
      prefix: '#'
    }
  });
  // 自動輪播設定
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(false);
  const [rotateIntervalMs, setRotateIntervalMs] = useState(5000);
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string>('');
  const [serverPreviewLoading, setServerPreviewLoading] = useState<boolean>(false);
  const [serverPreviewError, setServerPreviewError] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  // 前端渲染發布（方案A）所需狀態
  const [clientPublishLoading, setClientPublishLoading] = useState(false);
  const [clientStageSelector, setClientStageSelector] = useState<string>('#ig-preview');
  const [clientFontsHref, setClientFontsHref] = useState<string>('');
  const [clientForumPostId, setClientForumPostId] = useState<string>('');

  // 動態載入 html2canvas（CDN），避免打包體積負擔
  const ensureHtml2Canvas = async (): Promise<any> => {
    // @ts-ignore
    if ((window as any).html2canvas) return (window as any).html2canvas;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('載入 html2canvas 失敗'));
      document.body.appendChild(s);
    });
    // @ts-ignore
    return (window as any).html2canvas;
  };

  // 載入平台字體列表
  const fetchPlatformFonts = async () => {
    try {
      console.log('開始載入平台字體...');
      const token = localStorage.getItem('token');
      console.log('Token exists:', !!token);

      const response = await fetch('/api/admin/fonts/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('字體 API 回應狀態:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('字體 API 回應內容:', result);
        if (result.success) {
          // 修復：後端返回 result.data.fonts 結構
          console.log('完整回應對象:', JSON.stringify(result, null, 2));

          const fonts = result.data?.fonts || [];
          console.log('字體數組內容:', JSON.stringify(fonts, null, 2));
          console.log('設定字體列表:', fonts.length, '個字體');
          setPlatformFonts(fonts);
        } else {
          console.warn('字體 API 回應失敗:', result);
          setPlatformFonts([]);
        }
      } else {
        const errorText = await response.text();
        console.error('字體 API 請求失敗:', response.status, errorText);
        setPlatformFonts([]);
      }
    } catch (error) {
      console.error('載入平台字體失敗:', error);
      setPlatformFonts([]);
    }
  };


  // 將指定選擇器的節點複製到離屏舞台（固定 1080x1350），渲染為 JPEG 上傳並建立 IG 任務
  const handleClientRenderPublish = async () => {
    if (!selectedAccount) return alert('請先選擇帳號');
    const defaultTpl = templates.find((t:any) => t.is_default) || templates[0];
    if (!defaultTpl) return alert('請先建立/選擇模板');
    const forumPostId = parseInt(clientForumPostId || '0');
    if (!forumPostId || Number.isNaN(forumPostId)) return alert('請輸入有效的論壇貼文 ID');

    setClientPublishLoading(true);
    try {
      const src = document.querySelector(clientStageSelector) as HTMLElement | null;
      if (!src) { alert(`找不到預覽容器：${clientStageSelector}`); return; }

      // 直接用共用工具將 DOM 轉成 1080x1080 JPEG Blob（與預設後端一致）
      const blob = await renderNodeToImage(src, { width: 1080, height: 1080, background: '#fff' });

      // 上傳圖片
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', blob, `ig_client_${Date.now()}.jpg`);
      fd.append('name', `ig_client_${Date.now()}.jpg`);
      fd.append('hash', `${Date.now()}`);
      fd.append('chunk','0'); fd.append('chunks','1');
      const up = await fetch('/api/media/upload', { method:'POST', headers:{ 'Authorization': `Bearer ${token}` }, body: fd });
      const uj = await up.json();
      const imageUrl = uj.url || uj.path || (uj.data && uj.data.url);
      if (!imageUrl) throw new Error('上傳失敗，無回傳 URL');

      // 獲取 HTML 內容
      const htmlContent = src.innerHTML;
      
      // 建立 IG 任務（帶前端產圖 URL 和 HTML 內容）
      const resp = await fetch('/api/instagram/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forum_post_id: forumPostId,
          account_id: selectedAccount,
          template_id: defaultTpl.id,
          client_generated_image_url: imageUrl,
          html_content: htmlContent  // 新增：發送 HTML 內容
        })
      });
      const jr = await resp.json();
      if (!resp.ok || !jr.success) throw new Error(jr.error || `建立任務失敗: ${resp.status}`);

      alert('已用前端渲染建立貼文任務！');
      setActiveTab('posts');
      loadData();
    } catch (e:any) {
      alert(e?.message || '前端渲染發布失敗');
    } finally {
      setClientPublishLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
      loadSchools();
      fetchPlatformFonts();
    }
  }, [activeTab, isAdmin]);

  // 監控 showAddAccount 狀態變化
  useEffect(() => {
    console.log('showAddAccount 狀態變化:', showAddAccount);
  }, [showAddAccount]);

  const loadData = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      
      if (activeTab === 'dashboard') {
        // 先偵測 Instagram 模組是否掛載
        const health = await fetch('/api/instagram/_health');
        if (!health.ok) {
          setError('Instagram 模組未啟用（/_health 404）');
          setStats(null);
          return;
        }
        const response = await fetch('/api/instagram/stats/dashboard', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
          throw new Error(`API 錯誤: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        } else {
          throw new Error(data.error || '載入統計數據失敗');
        }
      } else if (activeTab === 'accounts') {
        const response = await fetch('/api/instagram/accounts', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
          throw new Error(`API 錯誤: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
          setAccounts(data.data);
        } else {
          throw new Error(data.error || '載入帳號數據失敗');
        }
      } else if (activeTab === 'posts') {
        const response = await fetch('/api/instagram/posts?limit=50', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
          throw new Error(`API 錯誤: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
          setPosts(data.data);
        } else {
          throw new Error(data.error || '載入發文數據失敗');
        }
      } else if (activeTab === 'templates') {
        // 先載入所有帳號，供模板管理選擇
        const accountsResponse = await fetch('/api/instagram/accounts', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json();
          if (accountsData.success) {
            setAccounts(accountsData.data);
            // 如果有選定帳號，載入該帳號的模板
            if (selectedAccount) {
              await loadTemplates(selectedAccount, token);
            }
          }
        }
      }
    } catch (error) {
      console.error('載入數據失敗:', error);
      setError(error instanceof Error ? error.message : '載入數據失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadSchools = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/schools', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.items) {
          setSchools(data.items);
          console.log('已載入學校清單:', data.items);
        }
      } else {
        console.warn('載入學校清單失敗:', response.status);
      }
    } catch (error) {
      console.error('載入學校清單錯誤:', error);
    }
  };

  // 更新預覽數據的函數
  const updatePreviewData = (field: string, value: any) => {
    setPreviewData(prev => {
      const keys = field.split('.');
      const newData = { ...prev };
      let current = newData;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newData;
    });
  };

  // 初始化預覽數據（當編輯現有模板時）
  useEffect(() => {
    if (editingTemplate?.template_data) {
      setPreviewData({
        background: {
          type: editingTemplate.template_data.background?.type || 'color',
          color: editingTemplate.template_data.background?.color || '#FFFFFF',
          image: editingTemplate.template_data.background?.image || null,
          url: editingTemplate.template_data.background?.image_url || editingTemplate.template_data.background?.image || null
        },
        content_block: editingTemplate.template_data.content_block || {
          enabled: true,
          font_family: '',
          font_weight: '400',
          font_size: 28,
          color: '#000000',
          align: 'left',
          max_lines: 15,
          position: { x: 0.05, y: 0.05 }
        },
        logo: {
          enabled: editingTemplate.template_data.logo?.enabled ?? true,
          size: editingTemplate.template_data.logo?.size ?? 80,
          position: editingTemplate.template_data.logo?.position || { x: 0.9, y: 0.1 },
          image: editingTemplate.template_data.logo?.image || null,
          url: editingTemplate.template_data.logo?.image_url || null
        },
        timestamp: {
          enabled: editingTemplate.template_data.timestamp?.enabled ?? true,
          hour_format: editingTemplate.template_data.timestamp?.hour_format || '24',
          font_size: editingTemplate.template_data.timestamp?.font_size || 16,
          color: editingTemplate.template_data.timestamp?.color || '#666666',
          position: editingTemplate.template_data.timestamp?.position || { x: 0.1, y: 0.9 },
          format: editingTemplate.template_data.timestamp?.format || '%Y-%m-%d %H:%M',
          font_family: editingTemplate.template_data.timestamp?.font_family || '',
          font_weight: editingTemplate.template_data.timestamp?.font_weight || '400'
        },
        post_id: {
          enabled: editingTemplate.template_data.post_id?.enabled ?? false,
          font_family: editingTemplate.template_data.post_id?.font_family || '',
          font_weight: editingTemplate.template_data.post_id?.font_weight || '400',
          font_size: editingTemplate.template_data.post_id?.font_size || 14,
          color: editingTemplate.template_data.post_id?.color || '#999999',
          position: editingTemplate.template_data.post_id?.position || { x: 0.9, y: 0.9 },
          prefix: editingTemplate.template_data.post_id?.prefix || '#'
        }
      });
    }
  }, [editingTemplate]);


  // 檔案上傳：呼叫 API 取得 URL（若 API 不存在則回傳 null）
  const uploadImageAndGetUrl = async (file: File): Promise<string | null> => {
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      // 與後端 /api/media/upload 對齊（單檔上傳，chunks=1）
      fd.append('file', file);
      fd.append('name', file.name);
      fd.append('hash', `${file.name}-${file.size}-${file.type}`);
      fd.append('chunk', '0');
      fd.append('chunks', '1');
      const resp = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      // routes_media 回傳 { ok, path }；預覽可先用 DataURL，生成時後端會用本地檔案路徑。
      return j?.url || j?.data?.url || j?.path || null;
    } catch {
      return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'published': '已發布',
      'failed': '發布失敗',
      'pending': '待處理',
      'processing': '處理中',
      'queued': '已排隊'
    };
    return statusMap[status] || status;
  };


  const loadTemplates = async (accountId: number, token?: string) => {
    try {
      const authToken = token || localStorage.getItem('token');
      const response = await fetch(`/api/instagram/accounts/${accountId}/templates`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTemplates(data.data);
        }
      }
    } catch (error) {
      console.error('載入模板失敗:', error);
    }
  };

  const resetModalState = () => {
    setShowAddAccount(false);
    setTokenValidated(false);
    setAvailableIgAccounts([]);
    setShowManualInput(false);
    setError(null);
  };

  const validateToken = async (accessToken: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/instagram/validate-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          access_token: accessToken
        })
      });
      
      const data = await response.json();
      if (data.success) {
        const accs = data.ig_accounts || [];
        setAvailableIgAccounts(accs);
        setSelectedAutoIndex(0);
        setTokenValidated(true);
        setShowManualInput(accs.length === 0);
        setError(null);
        setTokenError(null);
      } else {
        setError(data.error);
        setTokenError(data.error || 'Token 驗證失敗');
        setTokenValidated(false);
        setAvailableIgAccounts([]);
        setShowManualInput(true);
      }
    } catch (err) {
      setError('驗證 Token 時發生錯誤');
      setTokenError('驗證 Token 時發生錯誤');
      setTokenValidated(false);
      setAvailableIgAccounts([]);
      setShowManualInput(true);
    }
  };

  // 載入用於預覽的近期貼文
  const loadPreviewPosts = async () => {
    try {
      const token = localStorage.getItem('token');
      // 先抓平台「論壇貼文」當作預覽來源（不限制範圍）
      const resp1 = await fetch('/api/posts/list?limit=20', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      let got = false;
      if (resp1.ok) {
        const j = await resp1.json();
        const items = Array.isArray(j?.items) ? j.items : Array.isArray(j?.data?.items) ? j.data.items : [];
        if (items.length) {
          const strip = (html: string) => (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
          const mapped = items.map((p: any) => ({
            id: p.id ?? p.post_id ?? null,
            forum_post_content: strip(p.content || ''),
            created_at: p.created_at || null,
            published_at: p.created_at || null,
          }));
          setPreviewPosts(mapped);
          const idx = mapped.length > 0 ? Math.floor(Math.random() * mapped.length) : 0;
          setSelectedPreviewIndex(idx);
          got = true;
        }
      }
      // 若沒有論壇貼文，再退回 IG 發文紀錄
      if (!got) {
        const resp2 = await fetch('/api/instagram/posts?limit=20', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp2.ok) {
          const data = await resp2.json();
          if (data.success && Array.isArray(data.data)) {
            setPreviewPosts(data.data);
            const idx = data.data.length > 0 ? Math.floor(Math.random() * data.data.length) : 0;
            setSelectedPreviewIndex(idx);
          }
        }
      }
    } catch (e) {
      console.warn('載入預覽貼文失敗:', e);
    }
  };

  // 打開模板編輯時載入預覽貼文
  useEffect(() => {
    if (showTemplateModal) {
      loadPreviewPosts();
    }
  }, [showTemplateModal, selectedAccount]);

  const formatPreviewTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso);
    // 轉換 Python 風格 strftime（常用子集）到實際字串
    const z = {
      '%Y': d.getFullYear().toString(),
      '%m': (d.getMonth() + 1).toString().padStart(2, '0'),
      '%-m': (d.getMonth() + 1).toString(),
      '%d': d.getDate().toString().padStart(2, '0'),
      '%-d': d.getDate().toString(),
      '%H': d.getHours().toString().padStart(2, '0'),
      '%I': (d.getHours() % 12 === 0 ? 12 : d.getHours() % 12).toString().padStart(2, '0'),
      '%M': d.getMinutes().toString().padStart(2, '0'),
      '%S': d.getSeconds().toString().padStart(2, '0'),
      '%p': d.getHours() >= 12 ? 'PM' : 'AM',
    } as Record<string, string>;
    const fmt = previewData?.timestamp?.format || ((previewData?.timestamp?.hour_format || '24') === '12' ? '%I:%M %p' : '%H:%M');
    return Object.keys(z).reduce((acc, k) => acc.split(k).join(z[k]), fmt);
  };

  const fetchTemplateDetail = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/instagram/templates/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const j = await r.json();
      if (j.success) return j.data;
    } catch (e) { console.error('讀取模板詳情失敗', e); }
    return null;
  };

  const handlePreviewTemplate = async (template: any) => {
    const detail = await fetchTemplateDetail(template.id);
    setPreviewTemplate(detail || template);
    setBackendPreviewPostId('');
    setBackendPreviewUrl('');
    setShowPreviewModal(true);
  };

  // 當開啟預覽模態框時，自動抓範例貼文並生成後端圖片作為背景
  useEffect(() => {
    const autoGen = async () => {
      if (!showPreviewModal || !previewTemplate) return;
      // 若尚未有預覽貼文，先載入
      if (!previewPosts.length) await loadPreviewPosts();
      // 若仍然沒貼文，略過
      if (!previewPosts.length) return;
      // 依模板畫布設定決定尺寸
      const canvasConf = (previewTemplate?.template_data?.canvas as any) || {};
      let baseW = 1080, baseH = 1080;
      const preset = String(canvasConf?.preset || '').toLowerCase();
      if (preset === 'portrait') { baseW = 1080; baseH = 1350; }
      else if (preset === 'landscape') { baseW = 1080; baseH = 608; }
      else if (Number.isInteger(canvasConf?.width) && Number.isInteger(canvasConf?.height)) {
        baseW = Math.max(1, parseInt(canvasConf.width));
        baseH = Math.max(1, parseInt(canvasConf.height));
      }
      // 以預覽模板的 account_id 覆寫帳號來源
      await regenerateServerPreview(baseW, baseH);
    };
    autoGen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreviewModal, previewTemplate]);

  // 以目前設定 + 選擇的範例貼文，向後端生成圖片，並將結果設為預覽背景
  const regenerateServerPreview = async (baseW: number, baseH: number) => {
    try {
      setServerPreviewLoading(true);
      setServerPreviewError('');
      setServerPreviewUrl('');
      const accountId = (previewTemplate?.account_id as number) || selectedAccount || null;
      if (!accountId) { setServerPreviewLoading(false); setServerPreviewError('找不到帳號資訊'); return; }
      const sample = previewPosts[selectedPreviewIndex];
      const forum_post_id = sample?.id;
      const token = localStorage.getItem('token');
      // 將前端設定映射為 TemplateConfig 所需欄位
      const cfg: any = {
        width: baseW,
        height: baseH,
        background_color: previewData?.background?.color || '#ffffff',
        font_family: previewData?.content_block?.font_family || '',
        font_size: previewData?.content_block?.font_size || 28,
        text_color: previewData?.content_block?.color || '#333333',
        text_align: previewData?.content_block?.align || 'left',
        line_height: 1.5,
        padding: 60,
        logo_enabled: previewData?.logo?.enabled !== false,
        logo_size: previewData?.logo?.size || 80,
        logo_shape: previewData?.logo?.shape || 'circle',
        show_timestamp: previewData?.timestamp?.enabled !== false,
        theme: 'modern'
      };
      // 增加 20 秒逾時控制，避免 504/長時間卡住
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const resp = await fetch('/api/ig/template/preview/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          account_id: accountId,
          template_config: cfg,
          forum_post_id: forum_post_id || undefined,
          type: 'image'
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      // 嘗試解析 JSON，若非 JSON（如 504 HTML），讀取文字以避免 SyntaxError
      let isJson = false; let j: any = null;
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        try { j = await resp.json(); isJson = true; } catch {}
      }
      if (isJson && resp.ok && j.success) {
        setServerPreviewUrl(j.data?.image_url || '');
      } else if (isJson && resp.status === 202 && j.fallback?.html) {
        setServerPreviewError('後端尚未安裝 Playwright 或渲染逾時，暫提供 HTML 預覽（請安裝 Playwright 或稍後重試）');
      } else {
        const text = isJson ? (j?.error || '預覽生成失敗') : await resp.text();
        setServerPreviewError(text?.slice(0, 300) || '預覽生成失敗');
      }
      setServerPreviewLoading(false);
    } catch (e) {
      console.error('重新生成預覽失敗', e);
      // 逾時或中斷
      // @ts-ignore
      if (e?.name === 'AbortError') {
        setServerPreviewError('連線逾時（20 秒），請稍後再試或檢查後端 Playwright 安裝');
      } else {
        setServerPreviewError('重新生成預覽失敗');
      }
      setServerPreviewLoading(false);
    }
  };

  const handleBackendPreviewByPost = async () => {
    try {
      if (!previewTemplate?.id) return;
      const pid = parseInt(backendPreviewPostId);
      if (!pid || Number.isNaN(pid)) { alert('請輸入有效的貼文 ID'); return; }
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/ig/template/preview/${previewTemplate.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ forum_post_id: pid })
      });
      const j = await r.json();
      if (r.ok && j.success) {
        setBackendPreviewUrl(j.data?.image_url || '');
      } else {
        alert(j.error || '預覽失敗');
      }
    } catch (e) {
      console.error('後端預覽失敗', e);
      alert('後端預覽失敗');
    }
  };

  const handleEditTemplate = async (template: any) => {
    const detail = await fetchTemplateDetail(template.id);
    setEditingTemplate(detail || template);
    setShowTemplateModal(true);
  };

  const handleToggleTemplate = async (template: any) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/instagram/templates/${template.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          is_active: !template.is_active
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // 重新載入模板列表
        if (selectedAccount) {
          loadTemplates(selectedAccount);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('操作失敗，請稍後再試');
    }
  };

  const handleDeleteTemplate = async (template: any) => {
    if (!confirm(`確定要刪除模板「${template.name}」嗎？`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/instagram/templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        // 重新載入模板列表
        if (selectedAccount) {
          loadTemplates(selectedAccount);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('刪除失敗，請稍後再試');
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    // is_default：若編輯中且表單未提供此欄位，保留原值，避免編輯後預設模板被清掉
    const incomingIsDefault = (formData.get('is_default') === 'on');
    const isDefault = editingTemplate ? (typeof formData.get('is_default') === 'string' ? incomingIsDefault : !!editingTemplate.is_default) : incomingIsDefault;
    const hourFormat = (formData.get('timestamp_hour_format') as string) || '24';
    const tsFormatInput = (formData.get('timestamp_format') as string) || '';
    const tsFontFamily = (formData.get('timestamp_font_family') as string) || '';
    const tsFontWeight = (formData.get('timestamp_font_weight') as string) || '400';
        const templateData = {
      name: formData.get('template_name') as string,
      description: formData.get('template_description') as string,
      template_data: {
        background: {
          type: formData.get('bg_type') as string,
          color: formData.get('bg_color') as string || '#FFFFFF',
          // 實際送出時：使用上傳後的 URL；若無則不存
          image: previewData?.background?.url || undefined,
          image_url: previewData?.background?.url || undefined
        },
        content_block: {
          enabled: formData.get('content_enabled') === 'on',
          font_family: (formData.get('content_font_family') as string) || '',
          font_family_name: (formData.get('content_font_family') as string) || '',
                    font_weight: (formData.get('content_font_weight') as string) || '400',
          font_size: parseInt(formData.get('content_font_size') as string) || 28,
          color: formData.get('content_color') as string || '#000000',
          align: formData.get('content_align') as string || 'left',
          max_lines: parseInt(formData.get('content_max_lines') as string) || 15,
          position: {
            x: parseFloat(formData.get('content_x') as string) || 0.05,
            y: parseFloat(formData.get('content_y') as string) || 0.05,
          }
        },
        logo: {
          enabled: formData.get('logo_enabled') === 'on',
          size: parseInt(formData.get('logo_size') as string) || 80,
          shape: formData.get('logo_shape') as string || 'circle',
          position: {
            x: parseFloat(formData.get('logo_x') as string) || 0.9,
            y: parseFloat(formData.get('logo_y') as string) || 0.1
          },
          image_url: previewData?.logo?.url || undefined
        },
        timestamp: {
          enabled: formData.get('timestamp_enabled') === 'on',
          // 與 UI 一致，存入 hour_format；同時提供 format 以兼容舊欄位
          hour_format: hourFormat,
          format: tsFormatInput || (hourFormat === '12' ? '%I:%M %p' : '%H:%M'),
          font_size: parseInt(formData.get('timestamp_font_size') as string) || 16,
          color: (formData.get('timestamp_color') as string) || '#666666',
          position: {
            x: parseFloat(formData.get('timestamp_x') as string) || 0.1,
            y: parseFloat(formData.get('timestamp_y') as string) || 0.9
          },
          font_family: tsFontFamily,
          font_family_name: tsFontFamily,
                    font_weight: tsFontWeight
        },
        post_id: {
          enabled: formData.get('post_id_enabled') === 'on',
          font_size: parseInt(formData.get('post_id_font_size') as string) || 14,
          color: (formData.get('post_id_color') as string) || '#999999',
          position: {
            x: parseFloat(formData.get('post_id_x') as string) || 0.9,
            y: parseFloat(formData.get('post_id_y') as string) || 0.9
          },
          font_family: (formData.get('post_id_font_family') as string) || '',
          font_family_name: (formData.get('post_id_font_family') as string) || '',
          font_weight: (formData.get('post_id_font_weight') as string) || '400',
          prefix: (formData.get('post_id_prefix') as string) || '#'
        }
      },
      is_default: isDefault,
      account_id: selectedAccount
    };

    try {
      const token = localStorage.getItem('token');
      const url = editingTemplate 
        ? `/api/instagram/templates/${editingTemplate.id}` 
        : '/api/instagram/templates';
      const method = editingTemplate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateData)
      });
      
      const data = await response.json();
      if (data.success) {
        setShowTemplateModal(false);
        setEditingTemplate(null);
        if (selectedAccount) {
          loadTemplates(selectedAccount);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('儲存失敗，請稍後再試');
    }
  };

  const handleEditAccount = async (account: any) => {
    setEditingAccount(account);
    setShowEditModal(true);
    // 載入該帳號的模板清單，供選擇預設模板
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/instagram/accounts/${account.id}/templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (resp.ok && data?.success) {
        setEditAccountTemplates(data.data || []);
        const def = (data.data || []).find((t: any) => t.is_default);
        setSelectedDefaultTemplateId(def ? def.id : null);
      } else {
        setEditAccountTemplates([]);
        setSelectedDefaultTemplateId(null);
      }
    } catch (e) {
      setEditAccountTemplates([]);
      setSelectedDefaultTemplateId(null);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!editingAccount) return;
    
    try {
      const formData = new FormData(e.currentTarget);
      const token = localStorage.getItem('token');
      
      const payload: any = {
        display_name: formData.get('display_name') as string,
        description: formData.get('description') as string,
        school_id: formData.get('school_id') ? parseInt(formData.get('school_id') as string) : null,
      };
      const pm = formData.get('publish_mode') as string | null;
      if (pm) payload.publish_mode = pm;
      const bt = formData.get('batch_threshold') as string | null;
      if (bt) payload.batch_threshold = Math.max(1, parseInt(bt));

      const response = await fetch(`/api/instagram/accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // 若選定預設模板，更新該模板為預設（會自動取消其他預設）
        if (selectedDefaultTemplateId) {
          try {
            await fetch(`/api/instagram/templates/${selectedDefaultTemplateId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ is_default: true })
            });
          } catch {}
        }
        setShowEditModal(false);
        setEditingAccount(null);
        setEditAccountTemplates([]);
        setSelectedDefaultTemplateId(null);
        loadData(); // 重新載入資料
      } else {
        const data = await response.json();
        alert(data.error || '更新失敗');
      }
    } catch (err) {
      alert('更新失敗，請稍後再試');
    }
  };

  const handleToggleAccountStatus = async (account: any) => {
    try {
      const token = localStorage.getItem('token');
      const newStatus = account.status === 'active' ? 'disabled' : 'active';
      
      const response = await fetch(`/api/instagram/accounts/${account.id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        // 重新載入資料
        loadData();
      } else {
        const data = await response.json();
        alert(data.error || '操作失敗');
      }
    } catch (err) {
      alert('操作失敗，請稍後再試');
    }
  };

  const handleAddAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const accessToken = formData.get('access_token') as string;
    const displayName = formData.get('display_name') as string;
    const description = formData.get('description') as string;
    const igAccountId = formData.get('ig_account_id') as string;
    
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // 簡化的 payload：只需要 Token、ID 和顯示資訊
      const payload = {
        access_token: accessToken,
        ig_account_id: igAccountId || (availableIgAccounts[0]?.id),
        display_name: displayName,
        description: description
      };

      const response = await fetch('/api/instagram/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API 錯誤: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        // 新增成功，關閉模態框並重新載入數據
        resetModalState();
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增帳號失敗');
    } finally {
      setLoading(false);
    }
  };

  const renderDashboard = () => {
    if (!stats) return null;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={async () => {
              try {
                setSyncing(true);
                const token = localStorage.getItem('token');
                const resp = await fetch('/api/instagram/sync/approved', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                await new Promise(r => setTimeout(r, 1200));
                await loadData();
                if (!resp.ok) {
                  const j = await resp.json().catch(() => ({} as any));
                  alert(j?.error || '同步觸發失敗');
                }
              } catch {
                alert('同步觸發失敗');
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className={`px-4 py-2 rounded-lg text-white ${syncing ? 'bg-gray-400' : 'bg-primary hover:bg-primary/90'} transition-colors`}
          >
            {syncing ? '同步中…' : '同步核准貼文'}
          </button>

          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded-lg border border-border hover:bg-surface-hover transition-colors"
          >
            重新整理統計
          </button>
        </div>
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">Instagram 帳號</p>
                <p className="text-2xl font-bold text-fg">
                  {stats.accounts.total}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">發布成功率</p>
                <p className="text-2xl font-bold text-fg">
                  {stats.posts.success_rate}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Image className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">總發文數</p>
                <p className="text-2xl font-bold text-fg">
                  {stats.posts.total}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-hover rounded-lg border border-border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Activity className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted">近 7 天發布</p>
                <p className="text-2xl font-bold text-fg">
                  {stats.recent.published_last_7_days}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 發文狀態概覽 */}
        <div className="bg-surface-hover rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold text-fg mb-4">發文狀態概覽</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.posts.published}</div>
              <div className="text-sm text-muted">已發布</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.posts.pending}</div>
              <div className="text-sm text-muted">待處理</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.posts.failed}</div>
              <div className="text-sm text-muted">失敗</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAccounts = () => {
    console.log('renderAccounts 被調用，showAddAccount:', showAddAccount);
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-fg">Instagram 帳號管理</h2>
        <button
          onClick={() => {
            console.log('新增帳號按鈕被點擊');
            console.log('當前 showAddAccount 狀態:', showAddAccount);
            setShowAddAccount(true);
            console.log('設置 showAddAccount 為 true');
          }}
          className="btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
          data-testid="add-account-button"
        >
          <Plus className="w-4 h-4" />
          新增帳號
        </button>
      </div>

      <div className="bg-surface-hover border border-border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                帳號
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                狀態
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                發布模式
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                學校
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                統計
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface-hover divide-y divide-border">
            {accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Instagram className="w-5 h-5 text-pink-500 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-fg">
                        @{account.ig_username}
                      </div>
                      <div className="text-sm text-muted">
                        {account.display_name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    account.status === 'active' 
                      ? 'bg-success-bg text-success-text'
                      : 'bg-danger-bg text-danger-text'
                  }`}>
                    {account.status === 'active' ? '正常' : '錯誤'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">
                  {account.publish_mode === 'immediate' ? '立即發布' : 
                   account.publish_mode === 'batch' ? '批量發布' : '定時發布'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">
                  {account.school_name || '全平台'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">
                  {account.total_posts} 則貼文
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => handleEditAccount(account)}
                    className="text-primary hover:text-primary-hover mr-3"
                  >
                    編輯
                  </button>
                  <button 
                    onClick={() => handleToggleAccountStatus(account)}
                    className="text-danger hover:text-danger-hover"
                  >
                    {account.status === 'active' ? '停用' : '啟用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

  const renderTemplates = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-fg">模板管理</h2>
        <button
          onClick={() => setShowTemplateModal(true)}
          disabled={!selectedAccount}
          className="btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          新增模板
        </button>
      </div>

      {/* 移除前端直接發布區塊 */}

      {/* 帳號選擇 */}
      <div className="bg-surface-hover border border-border rounded-lg p-4">
        <label className="block text-sm font-medium text-fg mb-2">
          選擇 Instagram 帳號
        </label>
        <select
          value={selectedAccount || ''}
          onChange={(e) => {
            const accountId = e.target.value ? parseInt(e.target.value) : null;
            setSelectedAccount(accountId);
            if (accountId) {
              loadTemplates(accountId);
            } else {
              setTemplates([]);
            }
          }}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">請選擇帳號</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              @{account.ig_username} - {account.display_name}
            </option>
          ))}
        </select>
      </div>

      {/* 模板列表 */}
      {selectedAccount && (
        <div className="bg-surface-hover border border-border rounded-lg overflow-hidden">
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <Settings className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-fg mb-2">暫無模板</h3>
              <p className="text-muted mb-4">開始創建第一個模板吧！</p>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="btn-primary px-4 py-2 text-sm font-medium"
              >
                新增模板
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {templates.map((template) => (
                <div key={template.id} className="p-4 hover:bg-surface transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h4 className="text-sm font-medium text-fg">
                          {template.name}
                          {template.is_default && (
                            <span className="ml-2 px-2 py-1 text-xs bg-primary/10 text-primary rounded">
                              預設
                            </span>
                          )}
                        </h4>
                        <span className={`px-2 py-1 text-xs rounded ${
                          template.is_active 
                            ? 'bg-success-bg text-success-text'
                            : 'bg-danger-bg text-danger-text'
                        }`}>
                          {template.is_active ? '啟用中' : '已停用'}
                        </span>
                      </div>
                      <p className="text-sm text-muted mt-1">
                        {template.description || '無描述'}
                      </p>
                      <div className="text-xs text-muted mt-2 flex items-center gap-4">
                        <span>使用次數: {template.usage_count}</span>
                        <span>建立時間: {new Date(template.created_at).toLocaleDateString('zh-TW')}</span>
                        <span>建立者: {template.creator_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePreviewTemplate(template)}
                        className="text-blue-600 hover:text-blue-700 p-1"
                        title="預覽"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditTemplate(template)}
                        className="text-primary hover:text-primary-hover p-1"
                        title="編輯"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleTemplate(template)}
                        className={`p-1 ${
                          template.is_active 
                            ? 'text-yellow-600 hover:text-yellow-700'
                            : 'text-green-600 hover:text-green-700'
                        }`}
                        title={template.is_active ? '停用' : '啟用'}
                      >
                        {template.is_active ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                      </button>
                      {!template.is_default && (
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="text-danger hover:text-danger-hover p-1"
                          title="刪除"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                        )}
                      <label className="flex items-center gap-2 ml-2">
                        <input
                          type="checkbox"
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                        />
                        <span>顯示格線/座標</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderPosts = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-fg">發文記錄</h2>

      <div className="bg-surface-hover border border-border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                帳號
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                內容預覽
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                狀態
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                建立時間
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                發布時間
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface-hover divide-y divide-border">
            {posts.map((post) => (
              <tr key={post.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-fg">
                    @{post.ig_username}
                  </div>
                  <div className="text-sm text-muted">
                    {post.account_name}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-fg max-w-xs truncate">
                    {post.forum_post_content}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {getStatusIcon(post.status)}
                    <span className="ml-2 text-sm text-fg">
                      {getStatusText(post.status)}
                    </span>
                  </div>
                  {post.error_message && (
                    <div className="text-xs text-danger mt-1">
                      {post.error_message}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">
                  {new Date(post.created_at).toLocaleString('zh-TW')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-fg">
                  {post.published_at 
                    ? new Date(post.published_at).toLocaleString('zh-TW')
                    : '-'
                  }
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {post.ig_post_url ? (
                    <a 
                      href={post.ig_post_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-hover"
                    >
                      查看
                    </a>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 權限檢查
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-fg mb-2">權限不足</h1>
          <p className="text-muted mb-4">只有管理員可以訪問 Instagram 整合功能</p>
          <div className="text-sm text-muted mt-4 p-3 bg-surface-hover rounded-lg">
            <p>當前角色: {role || 'undefined'}</p>
            <p>需要角色: dev_admin 或 admin</p>
            <p>localStorage role: {localStorage.getItem('role') || 'undefined'}</p>
          </div>
        </div>
      </div>
    );
  }

  // 錯誤顯示
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar pathname="/admin/instagram" />
        <MobileBottomNav />
        <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
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
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-fg mb-2">載入失敗</h1>
              <p className="text-muted mb-4">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                重試
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/instagram" />
      <MobileBottomNav />
      
      <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Instagram className="w-6 h-6 sm:w-8 sm:h-8 text-pink-500" />
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold dual-text">Instagram 整合管理</h1>
              </div>
              <p className="text-sm text-muted">
                管理 Instagram 帳號連結、發文模板和發布排程
              </p>
            </div>
          </div>
        </div>

        {/* 頁籤導航 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden mb-6">
          <div className="border-b border-border">
            <nav className="flex space-x-8 p-4" aria-label="頁籤">
              {[
                { id: 'dashboard', name: '儀表板', icon: BarChart3 },
                { id: 'accounts', name: '帳號管理', icon: Users },
                { id: 'posts', name: '發文記錄', icon: Image },
                { id: 'templates', name: '模板設定', icon: Settings },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted hover:text-fg hover:border-border'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* 內容區域 */}
        <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
              <p className="text-muted">載入中...</p>
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {activeTab === 'dashboard' && renderDashboard()}
              {activeTab === 'accounts' && renderAccounts()}
              {activeTab === 'posts' && renderPosts()}
              {activeTab === 'templates' && renderTemplates()}
            </div>
          )}
        </div>
      </main>

      {/* 新增帳號模態框 */}
        {showAddAccount && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-surface border border-border rounded-2xl shadow-soft max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-fg">新增 Instagram 帳號</h3>
                  <button
                    onClick={resetModalState}
                    className="text-muted hover:text-fg transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handleAddAccount} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">
                      Facebook Access Token
                    </label>
                    <input
                      type="text"
                      name="access_token"
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="輸入 Facebook Access Token (按 Enter 驗證)"
                      onChange={(e) => {
                        if (tokenValidated) {
                          setTokenValidated(false);
                          setAvailableIgAccounts([]);
                          setShowManualInput(false);
                          setTokenError(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const token = e.currentTarget.value;
                          if (token && !loading) {
                            validateToken(token);
                          }
                        }
                      }}
                    />
                    {tokenError && (
                      <div className="mt-2 px-3 py-2 rounded-md text-sm bg-orange-50 border border-orange-200 text-orange-700">
                        <div className="flex items-start gap-2">
                          <span>⚠️</span>
                          <div>
                            <div className="font-medium">Token 驗證失敗或無綁定粉專</div>
                            <div className="text-xs mt-1">{tokenError}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {showManualInput && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-800 mb-2">
                        手動輸入粉專 ID
                      </h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-fg mb-1">
                          Instagram 粉專 ID *
                        </label>
                        <input
                          type="text"
                          name="ig_account_id"
                          required={showManualInput}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          placeholder="輸入 Instagram Business Account ID"
                        />
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">
                      顯示名稱
                    </label>
                    <input
                      type="text"
                      name="display_name"
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="輸入帳號顯示名稱"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">
                      帳號描述
                    </label>
                    <textarea
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="輸入帳號描述（可選）"
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={resetModalState}
                      className="flex-1 px-4 py-2 border border-border rounded-lg text-fg hover:bg-surface-hover transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={!tokenValidated && !showManualInput}
                      className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {tokenValidated || showManualInput ? '新增帳號' : '驗證中'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* 編輯帳號模態框 */}
        {showEditModal && editingAccount && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-surface border border-border rounded-2xl shadow-soft max-w-lg w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-fg">編輯 Instagram 帳號</h3>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingAccount(null);
                    }}
                    className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-muted" />
                  </button>
                </div>
                
                <form onSubmit={handleUpdateAccount} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">
                      顯示名稱
                    </label>
                    <input
                      type="text"
                      name="display_name"
                      defaultValue={editingAccount.display_name}
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="輸入帳號顯示名稱"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">
                      帳號描述
                    </label>
                    <textarea
                      name="description"
                      rows={3}
                      defaultValue={editingAccount.description}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="輸入帳號描述（可選）"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">發布模式</label>
                    <select
                      name="publish_mode"
                      defaultValue={editingAccount.publish_mode || 'immediate'}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                    >
                      <option value="immediate">即時發布</option>
                      <option value="batch">定量（達門檻才批量送出）</option>
                      <option value="scheduled">定時（使用排程時間）</option>
                    </select>
                    <div className="mt-1 text-xs text-muted">定量/定時需要下方額外設定或在建立任務時提供排程時間。</div>
                  </div>

                  {/* 預設模板選擇（若有模板） */}
                  {editAccountTemplates.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-fg mb-2">預設模板</label>
                      <select
                        value={selectedDefaultTemplateId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSelectedDefaultTemplateId(v ? parseInt(v) : null);
                        }}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                      >
                        <option value="">（不變更）</option>
                        {editAccountTemplates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.is_default ? '⭐ ' : ''}{tpl.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-xs text-muted">選擇此帳號的預設發文模板（會自動取消其他預設）。</div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-fg mb-2">定量門檻（批量數）</label>
                    <input
                      type="number"
                      name="batch_threshold"
                      min={1}
                      max={50}
                      defaultValue={editingAccount.batch_threshold || 5}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                    />
                    <div className="mt-1 text-xs text-muted">當佇列中待發數量達到此數字時自動批量發送（僅限定量模式）。</div>
                  </div>

                  {role === 'dev_admin' && (
                    <div>
                      <label className="block text-sm font-medium text-fg mb-2">
                        發布範圍
                      </label>
                      <select
                        name="school_id"
                        defaultValue={editingAccount.school_id || ''}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="">全部學校</option>
                        {schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-xs text-muted">
                        選擇此帳號專屬的學校，留空則為全域帳號
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingAccount(null);
                      }}
                      className="flex-1 px-4 py-2 border border-border rounded-lg text-fg hover:bg-surface-hover transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      更新帳號
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* 模板編輯模態框 */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-surface border border-border rounded-2xl shadow-soft max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-fg">
                    {editingTemplate ? '編輯模板' : '新增模板'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowTemplateModal(false);
                      setEditingTemplate(null);
                    }}
                    className="text-muted hover:text-fg transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                
                <form id="template-form" key={editingTemplate?.id || 'new'} onSubmit={handleSaveTemplate} className="space-y-6">
                  {/* 基本資訊 */}
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-fg">基本資訊</h4>
                    <div>
                      <label className="block text-sm font-medium text-fg mb-2">模板名稱</label>
                      <input
                        type="text"
                        name="template_name"
                        required
                        defaultValue={editingTemplate?.name || ''}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                        placeholder="輸入模板名稱"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg mb-2">模板描述</label>
                      <textarea
                        name="template_description"
                        rows={3}
                        defaultValue={editingTemplate?.description || ''}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                        placeholder="輸入模板描述（可選）"
                      />
                    </div>
                  </div>

                  {/* 背景設定 */}
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-fg">背景設定</h4>
                    <div>
                      <label className="block text-sm font-medium text-fg mb-2">背景類型</label>
                      <select
                        name="bg_type"
                        defaultValue={editingTemplate?.template_data?.background?.type || 'color'}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                      >
                        <option value="color">純色</option>
                        <option value="gradient">漸層</option>
                        <option value="image">圖片</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">背景顏色</label>
                        <input
                          type="color"
                          name="bg_color"
                          defaultValue={editingTemplate?.template_data?.background?.color || '#FFFFFF'}
                          className="w-full h-10 border border-border rounded cursor-pointer"
                          onChange={(e) => updatePreviewData('background.color', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">背景圖片</label>
                        <input
                          type="file"
                          name="bg_image"
                          accept="image/*"
                          className="hidden"
                          id="bg-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              // 先嘗試上傳取得 URL；若失敗，再用 DataURL 做預覽
                              uploadImageAndGetUrl(file).then((url) => {
                                if (url) {
                                  updatePreviewData('background.url', url);
                                } else {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    updatePreviewData('background.image', event.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              });
                            }
                          }}
                        />
                        <label
                          htmlFor="bg-upload"
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface hover:bg-surface-hover cursor-pointer transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          <Image className="w-4 h-4" />
                          上傳圖片
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 內容設定 */}
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-fg">內容設定</h4>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="content_enabled"
                        id="content_enabled"
                        defaultChecked={editingTemplate?.template_data?.content_block?.enabled ?? true}
                        className="mr-2"
                        onChange={(e) => updatePreviewData('content_block.enabled', e.target.checked)}
                      />
                      <label htmlFor="content_enabled" className="text-sm text-fg">顯示內容區塊</label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">平台字體</label>
                        <select
                          name="content_font_family"
                          defaultValue={editingTemplate?.template_data?.content_block?.font_family}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('content_block.font_family', e.target.value)}
                        >
                          {platformFonts.length === 0 ? (
                            <option value="">平台內當前無字體</option>
                          ) : (
                            <>
                              <option value="">選擇字體</option>
                              {platformFonts.map(font => (
                                <option key={font.id} value={font.font_family}>
                                  {font.display_name || font.font_family}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">字重</label>
                        <select
                          name="content_font_weight"
                          defaultValue={editingTemplate?.template_data?.content_block?.font_weight || '400'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('content_block.font_weight', e.target.value)}
                        >
                          <option value="300">300 - Light</option>
                          <option value="400">400 - Regular</option>
                          <option value="500">500 - Medium</option>
                          <option value="600">600 - Semi Bold</option>
                          <option value="700">700 - Bold</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">字體大小</label>
                        <input
                          type="number"
                          name="content_font_size"
                          min="12"
                          max="48"
                          defaultValue={editingTemplate?.template_data?.content_block?.font_size || 28}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('content_block.font_size', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">最大行數</label>
                        <input
                          type="number"
                          name="content_max_lines"
                          min="1"
                          max="30"
                          defaultValue={editingTemplate?.template_data?.content_block?.max_lines || 15}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('content_block.max_lines', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">文字顏色</label>
                        <input
                          type="color"
                          name="content_color"
                          defaultValue={editingTemplate?.template_data?.content_block?.color || '#000000'}
                          className="w-full h-10 border border-border rounded cursor-pointer"
                          onChange={(e) => updatePreviewData('content_block.color', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">對齊方式</label>
                        <select
                          name="content_align"
                          defaultValue={editingTemplate?.template_data?.content_block?.align || 'left'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('content_block.align', e.target.value)}
                        >
                          <option value="left">靠左</option>
                          <option value="center">置中</option>
                          <option value="right">靠右</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">X 位置 (0-1)</label>
                        <input
                          type="number"
                          name="content_x"
                          min="0"
                          max="1"
                          step="0.001"
                          defaultValue={editingTemplate?.template_data?.content_block?.position?.x ?? 0.05}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('content_block.position.x', parseFloat(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">Y 位置 (0-1)</label>
                        <input
                          type="number"
                          name="content_y"
                          min="0"
                          max="1"
                          step="0.001"
                          defaultValue={editingTemplate?.template_data?.content_block?.position?.y ?? 0.05}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('content_block.position.y', parseFloat(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Logo 設定 */}
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-fg">Logo 設定</h4>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="logo_enabled"
                        id="logo_enabled"
                        defaultChecked={editingTemplate?.template_data?.logo?.enabled ?? true}
                        className="mr-2"
                        onChange={(e) => updatePreviewData('logo.enabled', e.target.checked)}
                      />
                      <label htmlFor="logo_enabled" className="text-sm text-fg">顯示 Logo</label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-fg mb-2">Logo 圖片</label>
                        <input
                          type="file"
                          name="logo_image"
                          accept="image/*"
                          className="hidden"
                          id="logo-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              uploadImageAndGetUrl(file).then((url) => {
                                if (url) {
                                  updatePreviewData('logo.url', url);
                                } else {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    updatePreviewData('logo.image', event.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              });
                            }
                          }}
                        />
                      <label
                        htmlFor="logo-upload"
                        className="px-4 py-2 border border-border rounded-lg bg-surface hover:bg-surface-hover cursor-pointer transition-colors flex items-center gap-2"
                      >
                        <Image className="w-4 h-4" />
                        上傳 Logo
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">Logo 大小</label>
                        <input
                          type="number"
                          name="logo_size"
                          min="40"
                          max="200"
                          defaultValue={editingTemplate?.template_data?.logo?.size || 80}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('logo.size', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">X 位置 (0-1)</label>
                        <input
                          type="number"
                          name="logo_x"
                          min="0"
                          max="1"
                          step="0.001"
                          defaultValue={editingTemplate?.template_data?.logo?.position?.x || 0.9}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('logo.position.x', parseFloat(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">Y 位置 (0-1)</label>
                        <input
                          type="number"
                          name="logo_y"
                          min="0"
                          max="1"
                          step="0.001"
                          defaultValue={editingTemplate?.template_data?.logo?.position?.y || 0.1}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('logo.position.y', parseFloat(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 時間戳設定 */}
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-fg">時間戳設定</h4>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="timestamp_enabled"
                        id="timestamp_enabled"
                        defaultChecked={editingTemplate?.template_data?.timestamp?.enabled ?? true}
                        className="mr-2"
                        onChange={(e) => updatePreviewData('timestamp.enabled', e.target.checked)}
                      />
                      <label htmlFor="timestamp_enabled" className="text-sm text-fg">顯示時間戳</label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">時間制式</label>
                        <select
                          name="timestamp_hour_format"
                          defaultValue={editingTemplate?.template_data?.timestamp?.hour_format || '24'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('timestamp.hour_format', e.target.value)}
                        >
                          <option value="24">24小時制 (%H:%m)</option>
                          <option value="12">12小時制 (%h:%m)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">字體大小</label>
                        <input
                          type="number"
                          name="timestamp_font_size"
                          min="10"
                          max="24"
                          value={previewData.timestamp?.font_size || 16}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('timestamp.font_size', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">時間格式</label>
                        <input
                          type="text"
                          name="timestamp_format"
                          placeholder="例如: %Y-%m-%d %H:%M 或 %m/%d %I:%M %p"
                          defaultValue={editingTemplate?.template_data?.timestamp?.format || '%Y-%m-%d %H:%M'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('timestamp.format', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">平台字體</label>
                        <select
                          name="timestamp_font_family"
                          defaultValue={editingTemplate?.template_data?.timestamp?.font_family}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('timestamp.font_family', e.target.value)}
                        >
                          {platformFonts.length === 0 ? (
                            <option value="">平台內當前無字體</option>
                          ) : (
                            <>
                              <option value="">選擇字體</option>
                              {platformFonts.map(font => (
                                <option key={font.id} value={font.font_family}>
                                  {font.display_name || font.font_family}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">字重</label>
                        <select
                          name="timestamp_font_weight"
                          defaultValue={editingTemplate?.template_data?.timestamp?.font_weight || '400'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('timestamp.font_weight', e.target.value)}
                        >
                          <option value="300">300 - Light</option>
                          <option value="400">400 - Regular</option>
                          <option value="500">500 - Medium</option>
                          <option value="600">600 - Semi Bold</option>
                          <option value="700">700 - Bold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">顏色</label>
                        <input
                          type="color"
                          name="timestamp_color"
                          value={previewData.timestamp?.color || '#666666'}
                          className="w-full h-10 border border-border rounded cursor-pointer"
                          onChange={(e) => updatePreviewData('timestamp.color', e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-fg mb-2">X 位置 (0-1)</label>
                          <input
                            type="number"
                            name="timestamp_x"
                            min="0"
                            max="1"
                            step="0.001"
                            defaultValue={editingTemplate?.template_data?.timestamp?.position?.x || 0.1}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                            onChange={(e) => updatePreviewData('timestamp.position.x', parseFloat(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-fg mb-2">Y 位置 (0-1)</label>
                          <input
                            type="number"
                            name="timestamp_y"
                            min="0"
                            max="1"
                            step="0.001"
                            defaultValue={editingTemplate?.template_data?.timestamp?.position?.y || 0.9}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                            onChange={(e) => updatePreviewData('timestamp.position.y', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 貼文ID設定 */}
                  <div className="space-y-4">
                    <h4 className="text-md font-semibold text-fg">貼文ID設定</h4>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="post_id_enabled"
                        id="post_id_enabled"
                        defaultChecked={editingTemplate?.template_data?.post_id?.enabled ?? false}
                        className="mr-2"
                        onChange={(e) => updatePreviewData('post_id.enabled', e.target.checked)}
                      />
                      <label htmlFor="post_id_enabled" className="text-sm text-fg">顯示貼文ID</label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">平台字體</label>
                        <select
                          name="post_id_font_family"
                          defaultValue={editingTemplate?.template_data?.post_id?.font_family}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('post_id.font_family', e.target.value)}
                        >
                          {platformFonts.length === 0 ? (
                            <option value="">平台內當前無字體</option>
                          ) : (
                            <>
                              <option value="">選擇字體</option>
                              {platformFonts.map(font => (
                                <option key={font.id} value={font.font_family}>
                                  {font.display_name || font.font_family}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">字重</label>
                        <select
                          name="post_id_font_weight"
                          defaultValue={editingTemplate?.template_data?.post_id?.font_weight || '400'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg"
                          onChange={(e) => updatePreviewData('post_id.font_weight', e.target.value)}
                        >
                          <option value="300">300 - Light</option>
                          <option value="400">400 - Regular</option>
                          <option value="500">500 - Medium</option>
                          <option value="600">600 - Semi Bold</option>
                          <option value="700">700 - Bold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">字體大小</label>
                        <input
                          type="number"
                          name="post_id_font_size"
                          min="10"
                          max="32"
                          value={previewData.post_id?.font_size || 14}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('post_id.font_size', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">顏色</label>
                        <input
                          type="color"
                          name="post_id_color"
                          value={previewData.post_id?.color || '#999999'}
                          className="w-full h-10 border border-border rounded cursor-pointer"
                          onChange={(e) => updatePreviewData('post_id.color', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg mb-2">前綴符號</label>
                        <input
                          type="text"
                          name="post_id_prefix"
                          placeholder="例如: # 或 Post："
                          defaultValue={editingTemplate?.template_data?.post_id?.prefix || '#'}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                          onChange={(e) => updatePreviewData('post_id.prefix', e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-fg mb-2">X 位置 (0-1)</label>
                          <input
                            type="number"
                            name="post_id_x"
                            min="0"
                            max="1"
                            step="0.001"
                            defaultValue={editingTemplate?.template_data?.post_id?.position?.x || 0.9}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                            onChange={(e) => updatePreviewData('post_id.position.x', parseFloat(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-fg mb-2">Y 位置 (0-1)</label>
                          <input
                            type="number"
                            name="post_id_y"
                            min="0"
                            max="1"
                            step="0.001"
                            defaultValue={editingTemplate?.template_data?.post_id?.position?.y || 0.9}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg"
                            onChange={(e) => updatePreviewData('post_id.position.y', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 模板預覽 */}
                  <div className="space-y-4 pt-6 border-t border-border">
                    <h4 className="text-md font-semibold text-fg">模板預覽</h4>
                    {/* 預覽控制：以實際貼文作為範例（手動重新生成） */}
                    <div className="flex items-center justify-between text-xs text-muted">
                      <div>
                        {previewPosts.length > 0 ? (
                          <span>使用近期貼文作為範例（{selectedPreviewIndex + 1}/{previewPosts.length}）</span>
                        ) : (
                          <span>尚無可用貼文，顯示空白預覽</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // 使用當前畫布設定重新生成，並將結果設為預覽背景
                          const canvasConf = (editingTemplate?.template_data?.canvas as any) || {};
                          let baseW = 1080, baseH = 1080;
                          const preset = String(canvasConf?.preset || '').toLowerCase();
                          if (preset === 'portrait') { baseW = 1080; baseH = 1350; }
                          else if (preset === 'landscape') { baseW = 1080; baseH = 608; }
                          else if (Number.isInteger(canvasConf?.width) && Number.isInteger(canvasConf?.height)) {
                            baseW = Math.max(1, parseInt(canvasConf.width));
                            baseH = Math.max(1, parseInt(canvasConf.height));
                          }
                          regenerateServerPreview(baseW, baseH);
                        }}
                        className="px-3 py-1.5 bg-primary text-white rounded hover:bg-primary/90"
                      >
                        重新生成預覽
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <div className="relative">
                        {(() => {
                          const sample = previewPosts[selectedPreviewIndex];
                          // 依模板 canvas 設定決定預覽比例（預設 1080x1080）
                          const canvasConf = (editingTemplate?.template_data?.canvas as any) || {};
                          let baseW = 1080, baseH = 1080;
                          const preset = String(canvasConf?.preset || '').toLowerCase();
                          if (preset === 'portrait') { baseW = 1080; baseH = 1350; }
                          else if (preset === 'landscape') { baseW = 1080; baseH = 608; }
                          else if (Number.isInteger(canvasConf?.width) && Number.isInteger(canvasConf?.height)) {
                            baseW = Math.max(1, parseInt(canvasConf.width));
                            baseH = Math.max(1, parseInt(canvasConf.height));
                          }
                          const boxW = 600; // 預覽顯示寬度（px）
                          const boxH = Math.max(200, Math.round(boxW * (baseH / baseW)));
                          const scale = boxW / baseW;
                          const logoSize = (previewData.logo?.size || 80) * scale;
                          const logoX = (previewData.logo?.position?.x ?? 0.9) * 100;
                          const logoY = (previewData.logo?.position?.y ?? 0.1) * 100;
                          const tsX = (previewData.timestamp?.position?.x ?? 0.1) * 100;
                          const tsY = (previewData.timestamp?.position?.y ?? 0.9) * 100;
                          const fontFamily = previewData.content_block?.font_family || '';
                          const fontWeight = previewData.content_block?.font_weight || '400';
                          const fontSize = (previewData.content_block?.font_size || 28) * scale;
                          const textColor = previewData.content_block?.color || '#000000';
                          const textAlign = previewData.content_block?.align || 'left';
                          const timestampText = formatPreviewTime(sample?.published_at || sample?.created_at);
                          const timestampSize = (previewData.timestamp?.font_size || 16) * scale;
                          const timestampColor = previewData.timestamp?.color || '#666666';
                          const tsFontFamily = previewData.timestamp?.font_family || '';
                          const tsFontWeight = previewData.timestamp?.font_weight || '400';
                          const contentX = (previewData.content_block?.position?.x ?? 0.05) * 100;
                          const contentY = (previewData.content_block?.position?.y ?? 0.05) * 100;
                          const contentW = (previewData.content_block?.position?.width ?? 0.8) * 100;
                          const contentH = (previewData.content_block?.position?.height ?? 0.8) * 100;
                          const contentEnabled = previewData.content_block?.enabled !== false;
                          const logoEnabled = previewData.logo?.enabled !== false;
                          const tsEnabled = previewData.timestamp?.enabled !== false;
                          return (
                            <>
                              <div
                                className="border-2 border-border rounded-lg relative overflow-hidden"
                                style={{
                                  width: `${boxW}px`,
                                  height: `${boxH}px`,
                                  backgroundColor: previewData.background.color,
                                  backgroundImage: serverPreviewUrl ? `url(${serverPreviewUrl})` : ((previewData.background.url || previewData.background.image) ? `url(${previewData.background.url || previewData.background.image})` : 'none'),
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  backgroundRepeat: 'no-repeat'
                                }}
                              >
                                {showGrid && (
                                  <>
                                    <div
                                      className="absolute inset-0 pointer-events-none"
                                      style={{
                                        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px)`,
                                        backgroundSize: `${boxW/10}px ${boxH/10}px`
                                      }}
                                    />
                                    {Array.from({length: 11}).map((_,i) => (
                                      <div key={`tx-${i}`}
                                        className="absolute text-[10px] text-muted pointer-events-none"
                                        style={{ left: `${(i*10)}%`, top: '0.5%', transform: 'translateX(-50%)' }}
                                      >{(i/10).toFixed(1)}</div>
                                    ))}
                                    {Array.from({length: 11}).map((_,i) => (
                                      <div key={`ty-${i}`}
                                        className="absolute text-[10px] text-muted pointer-events-none"
                                        style={{ top: `${(i*10)}%`, left: '0.5%', transform: 'translateY(-50%)' }}
                                      >{(i/10).toFixed(1)}</div>
                                    ))}
                                  </>
                                )}
                                {/* 貼文內容（若已載入後端預覽圖，隱藏前端文字覆蓋） */}
                                {contentEnabled && !serverPreviewUrl && (
                                  <div
                                    className="absolute overflow-hidden"
                                    style={{
                                      left: `${contentX}%`,
                                      top: `${contentY}%`,
                                      width: `${contentW}%`,
                                      height: `${contentH}%`,
                                      transform: 'translate(0, 0)',
                                      fontFamily,
                                      fontWeight: String(fontWeight) as any,
                                      fontSize,
                                      color: textColor as any,
                                      textAlign: textAlign as any,
                                      lineHeight: 1.5,
                                      overflow: 'hidden',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word'
                                    }}
                                  >
                                    {sample?.forum_post_content || ''}
                                  </div>
                                )}

                                {/* Logo 預覽（若已載入後端預覽圖則隱藏）*/}
                                {logoEnabled && !serverPreviewUrl && (previewData.logo?.url || previewData.logo?.image) && (
                                  <img
                                    src={(previewData.logo.url || previewData.logo.image) as string}
                                    alt="logo"
                                    className="absolute rounded-full"
                                    style={{
                                      width: logoSize,
                                      height: logoSize,
                                      left: `${logoX}%`,
                                      top: `${logoY}%`,
                                      transform: 'translate(0, 0)',
                                      objectFit: 'cover'
                                    }}
                                  />
                                )}

                                {/* 時間戳顯示（若已載入後端預覽圖則隱藏）*/}
                                {tsEnabled && !serverPreviewUrl && (
                                  <div
                                    className="absolute"
                                    style={{
                                      left: `${tsX}%`,
                                      top: `${tsY}%`,
                                      transform: 'translate(-0%, -50%)',
                                      fontSize: timestampSize,
                                      color: timestampColor as any,
                                      fontFamily: tsFontFamily,
                                      fontWeight: String(tsFontWeight) as any
                                    }}
                                  >
                                    {timestampText}
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 text-center text-xs text-muted">
                                Instagram 貼文預覽 ({baseW}x{baseH}px)
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTemplateModal(false);
                        setEditingTemplate(null);
                      }}
                      className="flex-1 px-4 py-2 border border-border rounded-lg text-fg hover:bg-surface-hover transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      {editingTemplate ? '更新模板' : '創建模板'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* 模板預覽模態框 */}
        {showPreviewModal && previewTemplate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-surface border border-border rounded-2xl shadow-soft max-w-lg w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-fg">
                    模板預覽 - {previewTemplate.name}
                  </h3>
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      setPreviewTemplate(null);
                    }}
                    className="text-muted hover:text-fg transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                
                {/* 僅顯示預覽圖片（自動生成），移除其他資訊 */}
                <div>
                  {serverPreviewUrl ? (
                    <img src={serverPreviewUrl} alt="模板預覽" className="w-full rounded border border-border" />
                  ) : serverPreviewLoading ? (
                    <div className="text-center text-sm text-muted">正在生成預覽圖片…</div>
                  ) : serverPreviewError ? (
                    <div className="text-center text-sm text-danger">{serverPreviewError}</div>
                  ) : (
                    <div className="text-center text-sm text-muted">尚未生成預覽</div>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      setPreviewTemplate(null);
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default InstagramPage;
