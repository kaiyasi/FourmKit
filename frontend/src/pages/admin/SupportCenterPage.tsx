import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { NavBar } from '@/components/layout/NavBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { ArrowLeft, RefreshCw, FileText, Clock, User } from 'lucide-react';
 
function formatError(err: any): string {
  if (!err) return '發生未知錯誤';
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
import { getRole } from '@/utils/auth';

type Ticket = {
  id: number;
  public_id: string;
  subject: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'pending' | 'solved' | 'closed';
  school_name?: string;
  source: 'Web' | 'Discord';
  assigned_to?: string;
  last_activity_at: string;
  unread_count?: number;
  requester_name?: string;
  requester_ip?: string;
};

type Assignee = {
  id: number;
  username: string;
  display_name?: string;
};

// 移除測試單：改由 API 載入

function Badge({ children, color }: { children: React.ReactNode; color?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' }) {
  const cls = useMemo(() => {
    switch (color) {
      case 'blue': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'green': return 'bg-green-100 text-green-700 border-green-200';
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'red': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-muted/20 text-muted border-border';
    }
  }, [color]);
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{children}</span>;
}

function statusColor(s: Ticket['status']): 'gray' | 'blue' | 'green' | 'yellow' | 'red' {
  switch (s) {
    case 'open': return 'blue';
    case 'in_progress': return 'yellow';
    case 'pending': return 'gray';
    case 'solved': return 'green';
    case 'closed': return 'gray';
  }
}

const statusDisplay: Record<Ticket['status'], string> = {
  open: '開啟',
  in_progress: '處理中',
  pending: '等待用戶',
  solved: '已解決',
  closed: '已關閉',
};

const priorityDisplay: Record<Ticket['priority'], string> = {
  low: '低',
  normal: '中',
  high: '高',
  urgent: '緊急',
};

const categoryDisplay = (x?: string) => ({
  account: '帳號',
  appeal: '申覆',
  report: '檢舉',
  technical: '技術',
  other: '其他',
}[String(x || '').toLowerCase()] || (x || '其他'));

function mapCategoryToPrefix(category?: string): string {
  const c = String(category || '').toLowerCase();
  if (c.includes('帳號') || c === 'account' || c === 'acc') return 'ACC';
  if (c.includes('支援') || c === 'support' || c === 'sup') return 'SUP';
  return 'SUP';
}

function generateRandom(n: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function stableRandomString(seed: string, length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h) + seed.charCodeAt(i);
  let out = '';
  for (let i = 0; i < length; i++) {
    h = (h * 33) ^ (h >>> 2);
    const idx = Math.abs(h) % alphabet.length;
    out += alphabet[idx];
  }
  return out;
}

function displayPublicId(t: Ticket): string {
  const prefix = mapCategoryToPrefix(t.category);
  const hasUser = !!t.requester_name && t.requester_name !== '匿名';
  if (hasUser) return `${prefix}-${t.requester_name}${stableRandomString(t.public_id || `${t.id}`, 3)}`;
  return `${prefix}-${stableRandomString(t.public_id || `${t.id}`, 8)}`;
}

export default function SupportCenterPage() {
  const nav = useNavigate();
  const role = getRole();
  const isDevAdmin = role === 'dev_admin';
  const isLimited = role === 'campus_admin' || role === 'cross_admin' || role === 'campus_moderator' || role === 'cross_moderator';
  const [filterMine] = useState<boolean>(false); // 已移除 UI，僅保留狀態佔位
  const [query, setQuery] = useState<string>('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeId, setActiveId] = useState<number | null>(null);

  // 載入隊列（以後可加入條件）
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true); setError('');

// ...

const j = await api<{ ok:boolean; tickets:any[] }>(`/api/admin/support/tickets?limit=100&offset=0`);
        const items = ((j?.tickets||[]) as any[]).map((x: any, idx: number): Ticket => ({
          id: idx + 1,
          public_id: x.public_id,
          subject: x.subject,
          category: x.category,
          priority: 'normal',
          status: x.status,
          school_name: x.school || undefined,
          source: 'Web',
          assigned_to: x.assignee || undefined,
          last_activity_at: x.last_activity_at,
          requester_name: x.submitter,
          requester_ip: undefined,
        }));
        setTickets(items);
        if (items.length && activeId === null) setActiveId(items[0].id);
      } catch (e:any) {
        setError(e?.message || '載入失敗');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter(t => {
      // 角色可見範圍：dev_admin 看全部；其他僅看指派給自己
      if (isLimited && t.assigned_to !== 'Me') return false;
      if (!q) return true;
      return (
        t.public_id.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.school_name || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, isLimited, query]);

  const active = useMemo(() => filtered.find(t => t.id === activeId) || filtered[0] || null, [filtered, activeId]);

  const [messages, setMessages] = useState<Array<{ id: string; from: string; text: string; at: string }>>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [messagesAllowed, setMessagesAllowed] = useState<boolean>(true);

  useEffect(() => {
    const loadMessages = async () => {
      if (!active?.public_id) { setMessages([]); return; }
      setMessagesLoading(true);
      setMessagesAllowed(true);
      try {
        const r = await fetch(`/api/support/tickets/${active.public_id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok && j?.ticket) {
          // 訊息在 j.ticket.messages 陣列中
          const messages = j.ticket.messages || [];
          const list = messages.map((m: any, idx: number) => ({
            id: String(m.id ?? idx + 1),
            from: m.author_type || m.from || 'user',
            text: m.body || m.text || m.content || '',
            at: m.created_at || m.at || new Date().toISOString(),
          }));
          setMessages(list);
          return;
        }
        if (r.status === 405) { setMessagesAllowed(false); setMessages([]); return; }
        // 後備：示意訊息
        setMessages([
          { id: 'd1', from: 'user', text: '哈囉，我登入遇到問題', at: new Date(Date.now()-3600_000).toISOString() },
          { id: 'd2', from: 'admin', text: '已收到，我來幫你查看', at: new Date(Date.now()-3500_000).toISOString() },
        ]);
      } catch {
        setMessages([
          { id: 'd1', from: 'user', text: '哈囉，我登入遇到問題', at: new Date(Date.now()-3600_000).toISOString() },
          { id: 'd2', from: 'admin', text: '已收到，我來幫你查看', at: new Date(Date.now()-3500_000).toISOString() },
        ]);
      } finally {
        setMessagesLoading(false);
      }
    };
    loadMessages();
  }, [active?.public_id]);

  const reloadQueue = async () => {
    try {
      setLoading(true);
      const j = await api<{ ok:boolean; tickets:any[] }>(`/api/admin/support/tickets?limit=100&offset=0`);
      const items = ((j?.tickets||[]) as any[]).map((x: any, idx: number): Ticket => ({
        id: idx + 1,
        public_id: x.public_id,
        subject: x.subject,
        category: x.category,
        priority: 'normal',
        status: x.status,
        school_name: x.school || undefined,
        source: 'Web',
        assigned_to: x.assignee || undefined,
        last_activity_at: x.last_activity_at,
        requester_name: x.submitter,
        requester_ip: undefined,
      }));
      setTickets(items);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/support" />
      <MobileBottomNav />
      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
      {/* 頁面標題（比照審核管理） */}
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
          <h1 className="text-xl sm:text-2xl font-semibold dual-text">客服管理</h1>
          <p className="text-sm text-muted mt-1">管理與回應用戶支援工單</p>
        </div>
      </div>

      {/* 篩選列（比照留言監控） */}
      <div className="bg-surface border border-border rounded-xl p-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="搜尋：主旨 / 編號 / 用戶"
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-hover text-sm"
              value={query}
              onChange={(e)=> setQuery(e.target.value)}
            />
          </div>
          {/* 移除「只看指派給我」：非 dev_admin 預設只顯示指派給自己，dev_admin 看全部 */}
          <select className="px-3 py-2 rounded-lg border border-border bg-surface text-sm">
            <option>所有狀態</option>
            <option>開啟</option>
            <option>處理中</option>
            <option>等待用戶</option>
            <option>已解決</option>
          </select>
          <select className="px-3 py-2 rounded-lg border border-border bg-surface text-sm">
            <option>所有優先級</option>
            <option>低</option>
            <option>中</option>
            <option>高</option>
            <option>緊急</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 客服單隊列 */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              客服單隊列
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={reloadQueue}
                className="p-2 text-muted hover:text-fg transition-colors"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* 項目列表 */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted">
                目前沒有待處理的客服工單。
              </div>
            ) : (
              filtered.map((t) => (
                <div
                  key={t.id}
                  className={`p-4 rounded-xl border border-border cursor-pointer transition-colors relative ${
                    active?.id === t.id 
                      ? 'ring-2 ring-primary bg-primary/5' 
                      : 'bg-surface-hover hover:bg-surface'
                  }`}
                  onClick={() => setActiveId(t.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                        工單
                      </span>
                      <span className="text-xs text-muted">{displayPublicId(t)}</span>
                      {t.school_name && (
                        <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                          {t.school_name}
                        </span>
                      )}
                      {t.unread_count ? (
                        <span className="text-xs px-2 py-1 bg-red-600 text-white rounded-full">
                          未讀 {t.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted">
                      {new Date(t.last_activity_at).toLocaleString('zh-TW')}
                    </span>
                  </div>

                  <div className="mb-2">
                    <h3 className="font-medium text-fg mb-1 line-clamp-2">{t.subject}</h3>
                    
                    <div className="text-xs text-muted mb-2 space-y-1">
                      <div>類別: {categoryDisplay(t.category)} | 優先級: {priorityDisplay[t.priority]}</div>
                      <div>
                        申請人: {t.requester_name || '匿名用戶'}
                        {isDevAdmin && t.requester_ip && ` | IP: ${t.requester_ip}`}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted">
                      <Badge color={statusColor(t.status)}>{statusDisplay[t.status]}</Badge>
                      <span>來源: {t.source}</span>
                      {t.assigned_to && (
                        <span>指派給: {t.assigned_to}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 側邊欄 */}
        <div className="space-y-6">
          {/* 選中工單詳情 */}
          {active && (
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft lg:order-2">
              <h3 className="text-lg font-semibold text-fg mb-4">工單詳情</h3>
              
              <div className="space-y-3">
                <div className="border-b border-border pb-3">
                  <div className="text-sm text-muted">{active.public_id}</div>
                  <h4 className="text-lg font-semibold text-fg">{active.subject}</h4>
                  <div className="mt-2 text-xs text-muted space-y-1">
                    <div>類別: {categoryDisplay(active.category)} | 優先級: {priorityDisplay[active.priority]}</div>
                    <div>狀態: <Badge color={statusColor(active.status)}>{statusDisplay[active.status]}</Badge></div>
                    {isDevAdmin ? (
                      <>
                        <div>申請人: {active.requester_name || '匿名'}</div>
                        <div>IP: {active.requester_ip || '未知'}</div>
                      </>
                    ) : (
                      <>
                        <div>申請人: {active.requester_name || '匿名'}</div>
                        <div>學校: {active.school_name || '未指定'}</div>
                      </>
                    )}
                    {active.assigned_to && (
                      <div>指派給: {active.assigned_to}</div>
                    )}
                  </div>
                </div>

                {messagesAllowed && (messagesLoading || messages.length > 0) && (
                  <div className="border border-border rounded-lg p-3 bg-surface-hover max-h-64 overflow-y-auto">
                    <div className="text-sm font-medium mb-2">對話記錄</div>
                    {messagesLoading ? (
                      <div className="text-muted text-sm">載入訊息中…</div>
                    ) : (
                      <div className="space-y-2">
                        {messages.map(m => (
                          <div key={m.id} className={`max-w-[80%] p-2 rounded-lg text-sm ${m.from==='admin' ? 'bg-primary/10 text-fg ml-auto' : 'bg-surface text-fg'}`}>
                            <div className="whitespace-pre-wrap break-words">{m.text}</div>
                            <div className="text-[10px] text-muted mt-1 text-right">{new Date(m.at).toLocaleString('zh-TW')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input 
                      className="col-span-2 px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg text-sm" 
                      placeholder="輸入回覆內容…" 
                    />
                    <button className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-sm">
                      送出回覆
                    </button>
                  </div>
                  
                  {/* 狀態更新控件 */}
                  <StatusUpdater publicId={active.public_id} current={active.status} onDone={reloadQueue} />
                  
                  {isDevAdmin && (
                    <div className="flex items-center gap-2">
                      <AssignButton publicId={active.public_id} onDone={reloadQueue} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 統計資訊 - 比照審核管理 */}
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft lg:order-1">
            <h2 className="text-lg font-semibold text-fg mb-4">統計資訊</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted">開啟工單</span>
                <span className="text-sm font-medium">{filtered.filter(t => t.status === 'open').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted">處理中</span>
                <span className="text-sm font-medium">{filtered.filter(t => t.status === 'in_progress').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted">等待用戶</span>
                <span className="text-sm font-medium">{filtered.filter(t => t.status === 'pending').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted">已解決</span>
                <span className="text-sm font-medium text-green-600">{filtered.filter(t => t.status === 'solved').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted">總工單數</span>
                <span className="text-sm font-medium">{filtered.length}</span>
              </div>
            </div>
          </div>

          {/* 最近活動 */}
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <h3 className="text-lg font-semibold text-fg mb-4">最近活動</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filtered.slice(0, 10).map((t) => (
                <div key={t.id} className="p-3 bg-surface-hover rounded-lg border border-border/50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        t.status === 'solved' ? 'bg-green-500' : 
                        t.status === 'in_progress' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}></span>
                      <div>
                        <div className="font-medium text-fg text-sm">{t.subject}</div>
                        <div className="text-xs text-muted">{displayPublicId(t)}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(t.last_activity_at).toLocaleString('zh-TW')}
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted">
                    <Badge color={statusColor(t.status)}>{statusDisplay[t.status]}</Badge>
                    <span className="ml-2">{categoryDisplay(t.category)}</span>
                    {t.requester_name && (
                      <span className="ml-2">by {t.requester_name}</span>
                    )}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-muted">
                  暫無活動記錄
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}


function AssignButton({ publicId, onDone }: { publicId: string; onDone?: ()=>void }){
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [candidates, setCandidates] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        // 主要端點（避免 404）：先查詢管理後台使用者名單
        let r = await fetch('/api/admin/users?role=support', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } });
        let j = await r.json().catch(() => ({}));
        if (!r.ok || !(Array.isArray(j?.data) || Array.isArray(j))) {
          // 後備端點（若後端提供）
          r = await fetch('/api/support/assignees', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } });
          j = await r.json().catch(() => ({}));
        }
        const arr = (j?.data || j || []).filter(Boolean).map((u: any) => ({ id: Number(u.id), username: u.username || String(u.name || u.id), display_name: u.display_name || u.username }));
        if (alive) setCandidates(arr);
      } catch {
        if (alive) setCandidates([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false };
  }, [open]);
  return (
    <>
      <button onClick={()=> setOpen(true)} className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm">指派/轉單</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-surface border border-border rounded-2xl p-4 w-full max-w-md">
            <h3 className="text-lg font-semibold text-fg mb-3">指派工單</h3>
            <div className="space-y-3">
              {candidates.length > 0 ? (
                <select value={userId} onChange={e=> setUserId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg text-sm">
                  <option value="">不指派（取消指派）</option>
                  {candidates.map(u => (
                    <option key={u.id} value={String(u.id)}>{u.display_name || u.username}（ID: {u.id}）</option>
                  ))}
                </select>
              ) : (
                <input value={userId} onChange={e=> setUserId(e.target.value)} placeholder="輸入要指派的使用者 ID（留空=取消指派）" className="w-full px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg text-sm" />
              )}
              {loading && <div className="text-xs text-muted">載入候選人中…</div>}
              {err && <div className="text-danger text-sm">{err}</div>}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={()=> setOpen(false)} className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm">取消</button>
              <button disabled={busy} onClick={async()=>{
                try{
                  setBusy(true); setErr('');
                  const r = await fetch(`/api/support/tickets/${publicId}/assign`, { method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}`}, body: JSON.stringify({ assignee_user_id: userId ? Number(userId) : null }) });
                  const j = await r.json().catch(()=> ({}));
                  if (!r.ok || !j?.ok) throw new Error(j?.error || 'ASSIGN_FAIL');
                  setOpen(false); onDone?.();
                }catch(e:any){ setErr(formatError(e) || '操作失敗'); }
                finally{ setBusy(false); }
              }} className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-sm">{busy?'指派中…':'確認指派'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusUpdater({ publicId, current, onDone }: { publicId: string; current: Ticket['status']; onDone?: ()=>void }){
  const [status, setStatus] = useState<Ticket['status']>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(()=>{ setStatus(current) }, [current]);
  return (
    <div className="mt-3 flex items-center gap-2">
      <select value={status} onChange={e=> setStatus(e.target.value as Ticket['status'])} className="px-3 py-2 rounded-lg border border-border bg-surface text-sm">
        <option value="open">開啟</option>
        <option value="in_progress">處理中</option>
        <option value="pending">等待用戶</option>
        <option value="solved">已解決</option>
        <option value="closed">已關閉</option>
      </select>
      <button disabled={busy} onClick={async()=>{
        try{
          setBusy(true); setErr('');
          const r = await fetch(`/api/support/tickets/${publicId}/status`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${localStorage.getItem('token') || ''}`}, body: JSON.stringify({ status }) });
          const j = await r.json().catch(()=> ({}));
          if (!r.ok || !j?.ok) throw new Error(j?.error || 'STATUS_UPDATE_FAIL');
          onDone?.();
        }catch(e:any){ setErr((e?.message)||'更新失敗'); }
        finally{ setBusy(false); }
      }} className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm">更新狀態</button>
      {err && <span className="text-danger text-sm">{err}</span>}
    </div>
  );
}

