import { useState, useEffect } from "react";
import { AuthAPI } from "@/services/api";
import { saveSession } from "@/utils/auth";
import { useNavigate, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  const { login } = useAuth();
  const { pathname } = useLocation()

  // 初始化主題
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    // Google OAuth 回跳：從 fragment 拿取 token 並存入
    try {
      const h = window.location.hash || ''
      if (h.startsWith('#')) {
        const params = new URLSearchParams(h.slice(1))
        const at = params.get('access_token')
        const rt = params.get('refresh_token')
        const role = (params.get('role') || 'user') as any
        const schoolId = params.get('school_id')
        if (at && rt) {
          login(at, role, schoolId ? Number(schoolId) : null, rt)
          // 清 hash 避免重複處理
          try {
            const currentPathname = window?.location?.pathname || '/'
            history.replaceState(null, '', currentPathname)
          } catch (error) {
            console.warn('[AuthPage] Failed to get pathname:', error)
            history.replaceState(null, '', '/')
          }
          // 回首頁
          setTimeout(() => { window.location.href = '/' }, 10)
        }
      }
    } catch {}
    return () => html.classList.remove('theme-ready')
  }, [])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); 
    setErr("");
    const f = new FormData(e.target as HTMLFormElement);
    const toMessage = (x: any): string => {
      // 統一抽取字串（包含 Error.message）
      const raw = (x && typeof x === 'object' && typeof x.message === 'string')
        ? x.message
        : (typeof x === 'string' ? x : (x?.toString?.() ?? '登入失敗'));
      const s = String(raw);
      // 1) 嘗試整串 JSON 解析
      try {
        const j = s ? JSON.parse(s) : {};
        const msg = j?.msg || j?.error?.message || j?.error || s;
        if (typeof msg === 'string') {
          try { return JSON.parse(`"${msg.replace(/"/g, '\\"')}"`); } catch { return msg; }
        }
        return String(msg);
      } catch {}
      // 2) 從字串抽取常見欄位
      try {
        const m = s.match(/"msg"\s*:\s*"([\s\S]*?)"/);
        if (m && m[1]) {
          try { return JSON.parse(`"${m[1].replace(/"/g, '\\"')}"`); } catch { return m[1]; }
        }
      } catch {}
      try {
        const m2 = s.match(/"message"\s*:\s*"([\s\S]*?)"/);
        if (m2 && m2[1]) {
          try { return JSON.parse(`"${m2[1].replace(/"/g, '\\"')}"`); } catch { return m2[1]; }
        }
      } catch {}
      // 3) 最後備援
      return s || '登入失敗';
    }
    try {
      const r = await AuthAPI.login({ 
        username: String(f.get("username")||""), 
        password: String(f.get("password")||"") 
      });
      login(r.access_token, r.role as any, r.school_id, r.refresh_token, String(f.get("username")||""));
      nav("/"); // 登入後回首頁，由 Navbar 顯示後台入口
    } catch (e:any) { 
      setErr(toMessage(e)); 
    } finally { 
      setLoading(false); 
    }
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault(); 
    setLoading(true); 
    setErr("");
    const f = new FormData(e.target as HTMLFormElement);
    try {
      await AuthAPI.register({
        username: String(f.get("username")||""),
        email: String(f.get("email")||""),
        password: String(f.get("password")||""),
        ...(String(f.get("school_slug")||"") ? { school_slug: String(f.get("school_slug")||"") } : {})
      });
      setTab("login");
    } catch (e:any) { 
      // 與登入相同的錯誤解碼策略
      const toMessage = (x: any): string => {
        const raw = (x && typeof x === 'object' && typeof x.message === 'string')
          ? x.message
          : (typeof x === 'string' ? x : (x?.toString?.() ?? '註冊失敗'));
        const s = String(raw);
        try {
          const j = s ? JSON.parse(s) : {};
          const msg = j?.msg || j?.error?.message || j?.error || s;
          if (typeof msg === 'string') {
            try { return JSON.parse(`"${msg.replace(/"/g, '\\"')}"`); } catch { return msg; }
          }
          return String(msg);
        } catch {}
        try {
          const m = s.match(/"msg"\s*:\s*"([\s\S]*?)"/);
          if (m && m[1]) {
            try { return JSON.parse(`"${m[1].replace(/"/g, '\\"')}"`); } catch { return m[1]; }
          }
        } catch {}
        try {
          const m2 = s.match(/"message"\s*:\s*"([\s\S]*?)"/);
          if (m2 && m2[1]) {
            try { return JSON.parse(`"${m2[1].replace(/"/g, '\\"')}"`); } catch { return m2[1]; }
          }
        } catch {}
        return s || '註冊失敗';
      }
      setErr(toMessage(e)); 
    } finally { 
      setLoading(false); 
    }
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <NavBar pathname={pathname} />

      <div className="w-full max-w-md p-6 md:p-8 bg-surface border border-border rounded-2xl shadow-soft backdrop-blur">
        <div className="flex items-center gap-4 mb-6">
          <button 
            className={`px-4 py-2 rounded-xl border transition-all ${tab==='login'?'dual-btn':'bg-surface hover:bg-surface/80 border-border'}`} 
            onClick={()=>setTab("login")}
          >
            登入
          </button>
          <button 
            className={`px-4 py-2 rounded-xl border transition-all ${tab==='register'?'dual-btn':'bg-surface hover:bg-surface/80 border-border'}`} 
            onClick={()=>setTab("register")}
          >
            註冊
          </button>
          <div className="ml-auto text-sm text-muted">ForumKit</div>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100 border border-rose-300 dark:border-rose-700">
            {err}
            <div className="mt-2 text-sm">
              需要協助？<a href="/support" className="underline">留言給管理員</a>
            </div>
          </div>
        )}

        {tab === "login" ? (
          <form onSubmit={onLogin} className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm text-muted">帳號/Email</label>
              <input name="username" placeholder="帳號/Email" className="form-control" autoComplete="username" required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted">密碼</label>
              <input name="password" placeholder="請輸入密碼" type="password" className="form-control" autoComplete="current-password" required />
            </div>
            <button 
              disabled={loading} 
              className="px-4 py-3 rounded-xl dual-btn font-semibold disabled:opacity-60 transition-all"
            >
              {loading ? "登入中..." : "登入"}
            </button>
            <div className="relative my-3">
              <div className="h-px bg-border" />
              <div className="absolute inset-0 -top-2 flex justify-center">
                <span className="px-2 text-xs text-muted bg-surface">或</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = '/api/auth/google/login' }}
              className="px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface/80"
            >
              使用 Google 校園帳號登入
            </button>
            <button type="button" disabled className="px-4 py-3 rounded-xl border border-border bg-surface text-muted disabled:opacity-80">
              使用 Blurizon 帳號登入（預留）
            </button>
            <p className="text-xs text-muted">僅接受學校網域（.edu/.edu.tw 等）之 Google 帳號；一般 gmail.com 暫不開放。</p>
          </form>
        ) : (
          <form onSubmit={onRegister} className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm text-muted">使用者名稱</label>
              <input name="username" placeholder="用於登入與顯示" className="form-control" autoComplete="username" required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted">Email</label>
              <input name="email" placeholder="example@school.edu" type="email" className="form-control" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted">密碼</label>
              <input name="password" placeholder="至少 8 碼" type="password" className="form-control" autoComplete="new-password" required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm text-muted">校內綁定（選填）</label>
              <input name="school_slug" placeholder="school-slug（校外留空）" className="form-control" />
            </div>
            <button 
              disabled={loading} 
              className="px-4 py-3 rounded-xl dual-btn font-semibold disabled:opacity-60 transition-all"
            >
              {loading ? "註冊中..." : "註冊"}
            </button>
            <p className="text-xs text-muted">註冊僅接受校園信箱（.edu/.edu.tw 等），gmail.com 不開放。</p>
          </form>
        )}
      </div>
      <MobileFabNav />
    </div>
  );
}
