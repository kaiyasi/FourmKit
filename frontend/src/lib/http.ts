import { messageFrom } from '@/utils/errors';

// 允許以環境變數設定 API 基底 URL；若未設定則使用相對路徑交由開發代理或反向代理處理
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

function join(url: string): string {
  if (!API_BASE) return url; // 相對路徑
  // 確保不重複斜線
  return API_BASE.replace(/\/?$/, '') + (url.startsWith('/') ? url : `/${url}`);
}

export class HttpError extends Error {
  status: number;
  body: any;
  
  constructor(status: number, body: any) {
    const message = messageFrom(status, body, `HTTP ${status}`);
    
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'HttpError';
  }
}

async function tryRefresh(): Promise<string | null> {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return null;
  try {
  const r = await fetch(join("/api/auth/refresh"), {
      method: "POST",
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null) as any;
    const at = j?.access_token as string | undefined;
    if (!at) return null;
    localStorage.setItem("token", at);
    return at;
  } catch {
    return null;
  }
}

export async function safeJson(res: Response) {
  const text = await res.text();
  try { 
    return text ? JSON.parse(text) : null; 
  } catch { 
    return text; // 不是 JSON 就原樣回傳，讓上游決定
  }
}

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

export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  let token = getStoredToken();
  let res = await fetch(join(url), { 
    ...init, 
    headers: { 
      "Content-Type": "application/json", 
      ...(init?.headers || {}),
      'X-Client-Id': getClientId(),
      ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    } 
  });
  if (res.status === 401) {
    const at = await tryRefresh();
    if (at) {
      token = at;
  res = await fetch(join(url), {
        ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        'X-Client-Id': getClientId(),
        ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
        Authorization: `Bearer ${token}`,
      },
    });
    }
  }
  
  const body = await safeJson(res);
  
  if (!res.ok || body?.ok === false) {
    throw new HttpError(res.status, body);
  }
  // 後端有兩種回傳風格：
  // 1) 包在 { ok?, data } 內（較新）
  // 2) 直接回傳物件（舊/部分 API）
  // 這裡做寬鬆處理：有 data 就回 data；否則整個 body 當結果。
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as any).data as T;
  }
  return body as T;
}

export async function postJSON<T>(url: string, payload: any, init?: RequestInit): Promise<T> {
  let token = getStoredToken();
  let res = await fetch(join(url), {
    method: 'POST',
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      'X-Client-Id': getClientId(),
      ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) {
    const at = await tryRefresh();
    if (at) {
      token = at;
  res = await fetch(join(url), {
        method: 'POST',
        ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        'X-Client-Id': getClientId(),
        ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload)
    });
    }
  }
  
  const body = await safeJson(res);
  
  if (!res.ok || body?.ok === false) {
    throw new HttpError(res.status, body);
  }
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as any).data as T;
  }
  return body as T;
}

export async function postFormData<T>(url: string, formData: FormData, init?: RequestInit): Promise<T> {
  let token = getStoredToken();
  let res = await fetch(join(url), {
    method: 'POST',
    ...init,
    headers: {
      ...(init?.headers || {}),
      'X-Client-Id': getClientId(),
      ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
      // 不設置 Content-Type，讓瀏覽器自動設置 multipart/form-data boundary
    },
    body: formData
  });
  if (res.status === 401) {
    const at = await tryRefresh();
    if (at) {
      token = at;
  res = await fetch(join(url), {
        method: 'POST',
        ...init,
      headers: {
        ...(init?.headers || {}),
        'X-Client-Id': getClientId(),
        ...(getSelectedSchoolSlug() ? { 'X-School-Slug': getSelectedSchoolSlug()! } : {}),
        Authorization: `Bearer ${token}`,
      },
      body: formData
    });
    }
  }
  
  const body = await safeJson(res);
  
  if (!res.ok || body?.ok === false) {
    throw new HttpError(res.status, body);
  }
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as any).data as T;
  }
  return body as T;
}
function getStoredToken(): string | null {
  let t = localStorage.getItem("token");
  if (!t) {
    const legacy = localStorage.getItem("jwt");
    if (legacy) {
      localStorage.setItem("token", legacy);
      localStorage.removeItem("jwt");
      t = legacy;
    }
  }
  return t;
}
