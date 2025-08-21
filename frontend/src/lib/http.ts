import { messageFrom } from '@/utils/errors';

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
    const r = await fetch("/api/auth/refresh", {
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

export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  let token = getStoredToken();
  let res = await fetch(url, { 
    ...init, 
    headers: { 
      "Content-Type": "application/json", 
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    } 
  });
  if (res.status === 401) {
    const at = await tryRefresh();
    if (at) {
      token = at;
      res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
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
  let res = await fetch(url, {
    method: 'POST',
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) {
    const at = await tryRefresh();
    if (at) {
      token = at;
      res = await fetch(url, {
        method: 'POST',
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
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
  let res = await fetch(url, {
    method: 'POST',
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
      // 不設置 Content-Type，讓瀏覽器自動設置 multipart/form-data boundary
    },
    body: formData
  });
  if (res.status === 401) {
    const at = await tryRefresh();
    if (at) {
      token = at;
      res = await fetch(url, {
        method: 'POST',
        ...init,
        headers: {
          ...(init?.headers || {}),
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
