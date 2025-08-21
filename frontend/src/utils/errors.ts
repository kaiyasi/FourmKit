export function decodeUnicode(str: string): string {
  try {
    return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
  } catch {
    return str;
  }
}

export function messageFrom(status?: number, body?: any, fallback?: string): string {
  // 1) 標準欄位
  let raw = body?.msg || body?.error?.message || body?.error || fallback || '';
  if (typeof raw !== 'string') raw = String(raw || '');

  // 2) 常見代碼映射
  const code = body?.error?.code || body?.code || '';
  const map: Record<string, string> = {
    JWT_EXPIRED: '登入逾時，請重新登入',
    JWT_INVALID: '登入憑證無效，請重新登入',
    JWT_MISSING: '請先登入再繼續',
  };
  if (map[code]) return map[code];

  // 3) 權限相關字眼
  const lower = raw.toLowerCase();
  if (lower.includes('permission denied') || lower.includes('forbidden')) return '權限不足，請聯絡管理員';

  // 4) unicode 還原
  if (/\\u[0-9a-fA-F]{4}/.test(raw)) return decodeUnicode(raw);

  // 5) HTTP 狀態語意
  if (status === 401) return raw || '尚未登入或登入逾時';
  if (status === 403) return raw || '權限不足';
  if (status === 404) return raw || '找不到資源';
  if (status && status >= 500) {
    const hint = body?.error?.hint || body?.hint
    const msg = raw || '伺服器忙碌，請稍後再試'
    return hint ? `${msg}（${String(hint)}）` : msg
  }

  return raw || '發生未知錯誤';
}
