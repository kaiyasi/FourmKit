import { messageFrom } from '@/utils/errors';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

function join(url: string): string {
  if (!API_BASE) return url; // 相對路徑
  return API_BASE.replace(/\/?$/, '') + (url.startsWith('/') ? url : `/${url}`);
}

export class HttpError extends Error {
  status: number;
  body: any;
  
  /**
   *
   */
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

/**
 *
 */
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
    const v = localStorage.getItem('selected_school_slug') || localStorage.getItem('school_slug');
    if (!v) return null;
    const trimmed = v.trim();
    if (!trimmed || trimmed === '__ALL__') return null; // 全部：不送 Header，改用 all_schools 參數
    return trimmed;
  } catch { return null; }
}

/**
 *
 */
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
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return (body as any).data as T;
  }
  return body as T;
}

/**
 *
 */
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

/**
 *
 */
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
