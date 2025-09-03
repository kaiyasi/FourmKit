import { useState, useEffect, useRef } from "react";
import { AuthAPI, ModeAPI } from "@/services/api";
import { useNavigate, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Eye, EyeOff } from 'lucide-react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthPage() {
  // 僅保留登入分頁；註冊一律走 Google
  const [tab, setTab] = useState<"login">("login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  const { login } = useAuth();
  const [loginMode, setLoginMode] = useState<"single" | "admin_only" | "open">("admin_only");
  const canPublicRegister = false; // 強制關閉傳統註冊入口
  const { pathname } = useLocation()
  const [showLoginPw, setShowLoginPw] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  // 初始化主題 + 讀取登入模式（用於是否顯示註冊）
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    
    // 檢查是否有記住的登入資訊
    const rememberedUsername = localStorage.getItem('remembered_username')
    if (rememberedUsername) {
      setRememberMe(true)
      // 預填用戶名
      if (usernameRef.current) {
        usernameRef.current.value = rememberedUsername
      }
    }
    
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
    ;(async () => {
      try {
        const r = await ModeAPI.get();
        setLoginMode((r.login_mode as any) || 'admin_only');
      } catch {}
    })()
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
      const username = String(f.get("username")||"")
      const password = String(f.get("password")||"")
      
      const r = await AuthAPI.login({ 
        username, 
        password 
      });
      
      // 處理記住我的功能
      if (rememberMe) {
        localStorage.setItem('remembered_username', username)
      } else {
        localStorage.removeItem('remembered_username')
      }
      
      // 傳入 rememberMe，決定是否將 username 永久寫入 localStorage（否則僅存於 sessionStorage）
      login(r.access_token, r.role as any, r.school_id, r.refresh_token, username, rememberMe);
      nav("/"); // 登入後回首頁，由 Navbar 顯示後台入口
    } catch (e:any) { 
      setErr(toMessage(e)); 
    } finally { 
      setLoading(false); 
    }
  }

  // 傳統註冊已移除（統一走 Google OAuth）

  return (
    <div className="min-h-screen grid place-items-center" style={{ paddingTop: 'var(--fk-navbar-offset, 0px)' }}>
      <NavBar pathname={pathname} />

      <div className="w-full max-w-md p-6 md:p-8 bg-surface border border-border rounded-2xl shadow-soft backdrop-blur">
        <div className="text-center mb-6">
          {/* 移除登入按鈕，因為現在都是透過 Google 帳號判定直接登入還是註冊 */}
          <h1 className="text-2xl font-semibold text-black dark:text-white">ForumKit</h1>
          <p className="text-sm text-muted mt-1">新世代校園匿名平台</p>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100 border border-rose-300 dark:border-rose-700">
            {err}
            <div className="mt-2 text-sm">
              需要協助？請聯繫系統管理員
            </div>
          </div>
        )}

        <form onSubmit={onLogin} className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm text-muted">帳號/Email</label>
            <input 
              ref={usernameRef}
              name="username" 
              placeholder="帳號/Email" 
              className="form-control" 
              autoComplete="username" 
              required 
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-muted">密碼</label>
            <div className="relative">
              <input name="password" placeholder="請輸入密碼" type={showLoginPw? 'text':'password'} className="form-control pr-10" autoComplete="current-password" required />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted" onClick={()=>setShowLoginPw(v=>!v)} aria-label={showLoginPw? '隱藏密碼':'顯示密碼'}>
                {showLoginPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          {/* 記住我選項 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remember-me"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-primary bg-surface-hover border-border rounded focus:ring-primary focus:ring-2"
            />
            <label htmlFor="remember-me" className="text-sm text-muted cursor-pointer">
              記住我的帳號
            </label>
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
            onClick={() => { window.location.href = '/api/auth/google/oauth' }}
            className="px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface/80"
          >
            使用 Google 校園帳號 繼續
          </button>
          <button type="button" disabled className="px-4 py-3 rounded-xl border border-border bg-surface text-muted disabled:opacity-80">
            使用 Blurizon 帳號登入（預留）
          </button>
          <p className="text-xs text-muted">僅接受學校網域（.edu/.edu.tw/.edu.hk/.edu.cn 等）之 Google 帳號；一般 gmail.com 暫不開放。</p>
          <p className="text-xs text-muted">初次使用平台服務請使用 Google 校園帳號 登入，並註冊平台匿名帳號。</p>
        </form>
      </div>
      <MobileBottomNav />
    </div>
  );
}
