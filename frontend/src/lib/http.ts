export class HttpError extends Error {
  status: number;
  body: any;
  
  constructor(status: number, body: any) {
    const message = typeof body?.error === 'string' 
      ? body.error 
      : body?.error?.message 
      ? body.error.message 
      : body?.error 
      ? String(body.error) 
      : `HTTP ${status}`;
    
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'HttpError';
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
  const token = localStorage.getItem("token");
  const res = await fetch(url, { 
    ...init, 
    headers: { 
      "Content-Type": "application/json", 
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    } 
  });
  
  const body = await safeJson(res);
  
  if (!res.ok || body?.ok === false) {
    throw new HttpError(res.status, body);
  }
  
  return body?.data as T;
}

export async function postJSON<T>(url: string, payload: any, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    method: 'POST',
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  
  const body = await safeJson(res);
  
  if (!res.ok || body?.ok === false) {
    throw new HttpError(res.status, body);
  }
  
  return body?.data as T;
}

export async function postFormData<T>(url: string, formData: FormData, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    method: 'POST',
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
      // 不設置 Content-Type，讓瀏覽器自動設置 multipart/form-data boundary
    },
    body: formData
  });
  
  const body = await safeJson(res);
  
  if (!res.ok || body?.ok === false) {
    throw new HttpError(res.status, body);
  }
  
  return body?.data as T;
}
