export type Role =
  | "guest"
  | "user"
  | "admin"
  | "moderator"
  | "dev_admin"
  | "campus_admin"
  | "campus_moder"
  | "cross_admin"
  | "cross_moder";

export function saveSession(token: string, role: Role, school_id: number | null, refresh_token?: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  localStorage.setItem("school_id", school_id !== null ? String(school_id) : "");
  if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
}

export function clearSession() {
  localStorage.removeItem("token"); 
  localStorage.removeItem("role"); 
  localStorage.removeItem("school_id");
  localStorage.removeItem("refresh_token");
}

export function getRole(): Role { 
  return (localStorage.getItem("role") as Role) || "guest"; 
}

export function isLoggedIn() { 
  return !!localStorage.getItem("token"); 
}

export function canSetMode(): boolean {
  const r = getRole();
  return ["admin","dev_admin","campus_admin","cross_admin"].includes(r);
}
