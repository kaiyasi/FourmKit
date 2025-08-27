import { clearSession } from "@/utils/auth";
import { messageFrom } from "@/utils/errors";
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';
const j = (u: string) => API_BASE ? API_BASE.replace(/\/?$/, '') + (u.startsWith('/')?u:`/${u}`) : u;

function getClientId(): string {
  let id = localStorage.getItem('client_id');
  if (!id) {
    id = 'c_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
    try { localStorage.setItem('client_id', id); } catch {}
  }
  return id;
}

function getSelectedSchoolSlug(): string | null {
  try {
    const v = localStorage.getItem('selected_school_slug');
    return v && v.trim() ? v.trim() : null;
  } catch { return null; }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = async (accessToken?: string) =>
  fetch(j(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        'X-Client-Id': getClientId(),
        ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let token = localStorage.getItem("token") || undefined;
  let res = await doFetch(token);

  if (res.status === 401) {
    // 試圖用 refresh_token 續期一次
    try {
      const bodyText = await res.clone().text();
      let body: any = {};
      try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
      const code = body?.error?.code || body?.code;
      const refreshToken = localStorage.getItem("refresh_token") || undefined;
      if (refreshToken && (code === "JWT_EXPIRED" || code === "JWT_INVALID" || code === "JWT_MISSING")) {
  const r = await fetch(j("/api/auth/refresh"), {
          method: "POST",
          headers: { Authorization: `Bearer ${refreshToken}` },
        });
        if (r.ok) {
          const j = (await r.json()) as { access_token: string };
          if (j?.access_token) {
            localStorage.setItem("token", j.access_token);
            token = j.access_token;
            res = await doFetch(token); // 重試一次
          }
        } else {
          // refresh 也失敗 → 清 session 並導回登入
          try { clearSession(); } catch {}
          const pathname = location?.pathname;
          if (pathname && !pathname.startsWith("/auth")) location.href = "/auth";
        }
      }
    } catch {
      // 忽略刷新錯誤，落入統一錯誤處理
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    try {
      const j = txt ? JSON.parse(txt) : {};
      // 若是未授權/無效憑證 → 清 session 並導向登入
      if (res.status === 401) {
        const code = j?.error?.code || j?.code;
        if (code === "JWT_INVALID" || code === "JWT_MISSING") {
          try { clearSession(); } catch {}
          const pathname = location?.pathname;
          if (pathname && !pathname.startsWith("/auth")) location.href = "/auth";
        }
      }
      const msg = messageFrom(res.status, j, txt || `HTTP ${res.status}`);
      throw new Error(msg);
    } catch {
      // 備援：即使 JSON.parse 失敗，嘗試從字串抽取常見格式的錯誤訊息
      let fallback = txt || `HTTP ${res.status}`;
      try {
        // 1) 嘗試抽取 {"msg":"..."}
        const m = fallback.match(/"msg"\s*:\s*"([\s\S]*?)"/);
        if (m && m[1]) {
          // 透過 JSON.parse 解碼內部的跳脫字元（如 \uXXXX）
          const decoded = JSON.parse(`"${m[1]}"`);
          throw new Error(decoded);
        }
      } catch {}
      try {
        // 2) 嘗試抽取 {"error":{"message":"..."}}
        const m2 = fallback.match(/"message"\s*:\s*"([\s\S]*?)"/);
        if (m2 && m2[1]) {
          const decoded2 = JSON.parse(`"${m2[1]}"`);
          throw new Error(decoded2);
        }
      } catch {}
      throw new Error(fallback);
    }
  }
  return res.json();
}

export const AuthAPI = {
  login: (payload: { username: string; password: string }) =>
  api<{ access_token: string; refresh_token: string; role: string; school_id: number | null }>(j("/api/auth/login"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  register: (payload: { username: string; email: string; password: string; school_slug?: string }) =>
  api<{ msg: string }>(j("/api/auth/register"), { method: "POST", body: JSON.stringify(payload) }),
};

export const ModeAPI = {
  get: () => api<{ 
    mode: "normal" | "test" | "maintenance" | "development"; 
    maintenance_message?: string; 
    maintenance_until?: string;
    login_mode?: "single" | "admin_only" | "open";
    enforce_min_post_chars?: boolean;
    min_post_chars?: number;
  }>(j("/api/mode")),
  set: (
    mode?: "normal" | "test" | "maintenance" | "development",
    maintenanceMessage?: string,
    maintenanceUntil?: string,
    loginMode?: "single" | "admin_only" | "open",
    extra?: { enforce_min_post_chars?: boolean; min_post_chars?: number }
  ) =>
  api<{ ok: boolean; mode: "normal" | "test" | "maintenance" | "development"; config: any }>(j("/api/mode"), {
      method: "POST",
      body: JSON.stringify({ 
        ...(mode ? { mode } : {}),
        ...(maintenanceMessage && maintenanceMessage.trim() ? { notice: maintenanceMessage.trim() } : {}), 
        ...(maintenanceUntil && maintenanceUntil.trim() ? { eta: maintenanceUntil.trim() } : {}),
        ...(loginMode ? { login_mode: loginMode } : {}),
        ...(extra || {})
      }),
    }),
};

export const ContentRulesAPI = {
  get: () => api<{ enforce_min_post_chars: boolean; min_post_chars: number }>(j("/api/settings/content_rules")),
  set: (payload: { enforce_min_post_chars?: boolean; min_post_chars?: number }) =>
    api<{ ok: boolean; config: any }>(j("/api/settings/content_rules"), { method: 'POST', body: JSON.stringify(payload) }),
};

export const AccountAPI = {
  changePassword: (payload: { current_password?: string; new_password: string }) =>
    api<{ ok: boolean }>(j("/api/auth/change_password"), { method: "POST", body: JSON.stringify(payload) }),
  profile: () => api<{ id:number; username:string; email:string; role:string; school?: {id:number;slug:string;name:string}|null; avatar_path?: string|null; auth_provider?: string; has_password?: boolean; personal_id?: string }>(j("/api/account/profile")),
  updateProfile: (payload: { username: string }) => api<{ ok: boolean }>(j("/api/account/profile"), { method: 'PUT', body: JSON.stringify(payload) }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData(); fd.append('file', file)
  const r = await fetch(j('/api/account/avatar'), { method:'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')||''}` }, body: fd })
    if (!r.ok) throw new Error(await r.text())
    return r.json() as Promise<{ ok: boolean; path: string }>
  }
  ,
  webhookGet: () => api<{ ok:boolean; config?: { url?: string; enabled?: boolean; school_slug?: string|null }; last_post_id?: number|null }>(j('/api/account/webhook')),
  webhookSet: (payload: { url?: string; enabled?: boolean; school_slug?: string|null }) => api<{ ok:boolean; config:any }>(j('/api/account/webhook'), { method:'POST', body: JSON.stringify(payload) }),
  webhookTest: (url?: string) => api<{ ok:boolean; status?: number; error?: string }>(j('/api/account/webhook/test'), { method:'POST', body: JSON.stringify({ url }) })
};

export async function createPost(token: string, payload: {title: string; content: string; files: File[]}) {
  const fd = new FormData();
  fd.set("title", payload.title);
  fd.set("content", payload.content);
  payload.files.forEach(f => fd.append("files", f));
  const r = await fetch(j("/api/posts/with-media"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
