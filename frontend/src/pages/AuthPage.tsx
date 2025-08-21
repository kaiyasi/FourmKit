import { useState, useEffect } from "react";
import { AuthAPI } from "@/services/api";
import { saveSession } from "@/utils/auth";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  // 初始化主題
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
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
      saveSession(r.access_token, r.role as any, r.school_id, r.refresh_token);
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
      {/* 右上角主題切換器 */}
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
          <ThemeToggle />
          <span className="text-xs text-muted">主題</span>
        </div>
      </div>

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

        {err && <div className="mb-4 p-3 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100 border border-rose-300 dark:border-rose-700">{err}</div>}

        {tab === "login" ? (
          <form onSubmit={onLogin} className="grid gap-4">
            <input name="username" placeholder="使用者名稱" className="form-control" required />
            <input name="password" placeholder="密碼" type="password" className="form-control" required />
            <button 
              disabled={loading} 
              className="px-4 py-3 rounded-xl dual-btn font-semibold disabled:opacity-60 transition-all"
            >
              {loading ? "登入中..." : "登入"}
            </button>
          </form>
        ) : (
          <form onSubmit={onRegister} className="grid gap-4">
            <input name="username" placeholder="使用者名稱" className="form-control" required />
            <input name="email" placeholder="Email" type="email" className="form-control" required />
            <input name="password" placeholder="密碼" type="password" className="form-control" required />
            <input name="school_slug" placeholder="校內綁定用 school slug（校外留空）" className="form-control" />
            <button 
              disabled={loading} 
              className="px-4 py-3 rounded-xl dual-btn font-semibold disabled:opacity-60 transition-all"
            >
              {loading ? "註冊中..." : "註冊"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
