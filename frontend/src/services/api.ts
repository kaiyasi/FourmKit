import { clearSession } from "@/utils/auth";
import { messageFrom } from "@/utils/errors";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = async (accessToken?: string) =>
    fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
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
        const r = await fetch("/api/auth/refresh", {
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
          if (!location.pathname.startsWith("/auth")) location.href = "/auth";
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
          if (!location.pathname.startsWith("/auth")) location.href = "/auth";
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
    api<{ access_token: string; refresh_token: string; role: string; school_id: number | null }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  register: (payload: { username: string; email: string; password: string; school_slug?: string }) =>
    api<{ msg: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
};

export const ModeAPI = {
  get: () => api<{ 
    mode: "normal" | "test" | "maintenance" | "development"; 
    maintenance_message?: string; 
    maintenance_until?: string;
    enforce_min_post_chars?: boolean;
    min_post_chars?: number;
  }>("/api/mode"),
  set: (
    mode: "normal" | "test" | "maintenance" | "development",
    maintenanceMessage?: string,
    maintenanceUntil?: string,
    extra?: { enforce_min_post_chars?: boolean; min_post_chars?: number }
  ) =>
    api<{ ok: boolean; mode: "normal" | "test" | "maintenance" | "development"; config: any }>("/api/mode", {
      method: "POST",
      body: JSON.stringify({ 
        mode, 
        ...(maintenanceMessage && maintenanceMessage.trim() ? { notice: maintenanceMessage.trim() } : {}), 
        ...(maintenanceUntil && maintenanceUntil.trim() ? { eta: maintenanceUntil.trim() } : {}),
        ...(extra || {})
      }),
    }),
};

export async function createPost(token: string, payload: {title: string; content: string; files: File[]}) {
  const fd = new FormData();
  fd.set("title", payload.title);
  fd.set("content", payload.content);
  payload.files.forEach(f => fd.append("files", f));
  const r = await fetch("/api/posts/with-media", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
