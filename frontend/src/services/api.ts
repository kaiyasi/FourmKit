export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `HTTP ${res.status}`);
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
  get: () => api<{ mode: "normal" | "dev" | "maintenance" | "development"; maintenance_message?: string; maintenance_until?: string }>("/api/mode"),
  set: (mode: "normal" | "dev" | "maintenance" | "development", maintenanceMessage?: string, maintenanceUntil?: string) =>
    api<{ ok: boolean; mode: string; config: any }>("/api/mode", {
      method: "POST",
      body: JSON.stringify({ 
        mode, 
        ...(maintenanceMessage && maintenanceMessage.trim() ? { notice: maintenanceMessage.trim() } : {}), 
        ...(maintenanceUntil && maintenanceUntil.trim() ? { eta: maintenanceUntil.trim() } : {}) 
      }),
    }),
};
