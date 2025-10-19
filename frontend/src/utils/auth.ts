/**
 *
 */
export type Role =
  | "guest"           // 訪客
  | "user"            // 一般用戶
  | "campus_admin"    // 校內管理員
  | "cross_admin"     // 跨校管理員
  | "campus_moderator" // 校內板主
  | "cross_moderator" // 跨校板主
  | "dev_admin";      // 開發人員

const RESTART_KEY = 'fk_restart_timestamp'
const RESTART_ID_KEY = 'fk_restart_id'

/**
 *
 */
export function saveSession(token: string, role: Role, school_id: number | null, refresh_token?: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  localStorage.setItem("school_id", school_id !== null ? String(school_id) : "");
  if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
  
  localStorage.setItem(RESTART_KEY, Date.now().toString());
}

/**
 *
 */
export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role"); 
  localStorage.removeItem("school_id");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem(RESTART_KEY);
  localStorage.removeItem(RESTART_ID_KEY);
}

/**
 *
 */
export function getRole(): Role { 
  return (localStorage.getItem("role") as Role) || "guest";
}

/**
 *
 */
export function getSchoolId(): number | null {
  const schoolId = localStorage.getItem("school_id");
  return schoolId ? parseInt(schoolId) : null;
}

/**
 *
 */
export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}

/**
 *
 */
export async function checkForRestart(): Promise<boolean> {
  try {
    const lastTimestamp = localStorage.getItem(RESTART_KEY);
    if (!lastTimestamp) {
      return false;
    }
    
    const lastTime = parseInt(lastTimestamp, 10);
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTime;
    
    if (timeDiff > 600 * 1000) {
      const response = await fetch('/api/healthz', { 
        method: 'GET',
        cache: 'no-cache'  // 確保每次都是最新的
      });
      if (response.ok) {
        const data = await response.json();
        const currentRestartId = data.restart_id;
        const storedRestartId = localStorage.getItem(RESTART_ID_KEY);
        
        if (storedRestartId && storedRestartId !== currentRestartId) {
          console.log('[Auth] 檢測到服務重啟，重啟ID變更:', storedRestartId, '->', currentRestartId);
          try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
            const confirmResponse = await fetch('/api/healthz', { cache: 'no-cache' });
            if (confirmResponse.ok) {
              const confirmData = await confirmResponse.json();
              if (confirmData.restart_id !== currentRestartId) {
                console.log('[Auth] 重啟檢測確認不一致，可能是網路問題，取消登出');
                return false;
              }
            }
          } catch (confirmError) {
            console.warn('[Auth] 重啟檢測確認失敗，可能是網路問題，取消登出');
            return false;
          }
          
          clearSession();
          return true;
        }
        
        localStorage.setItem(RESTART_ID_KEY, currentRestartId);
        localStorage.setItem(RESTART_KEY, currentTime.toString());
      }
    }
    
    return false;
  } catch (error) {
    console.warn('[Auth] 重啟檢測失敗:', error);
    return false;
  }
}

/**
 *
 */
export async function initRestartCheck(): Promise<void> {
  try {
    const response = await fetch('/api/healthz');
    if (response.ok) {
      const data = await response.json();
      const currentRestartId = data.restart_id;
      const storedRestartId = localStorage.getItem(RESTART_ID_KEY);
      
      if (storedRestartId && storedRestartId !== currentRestartId) {
        console.log('[Auth] 頁面載入時檢測到服務重啟，重啟ID變更:', storedRestartId, '->', currentRestartId);
        clearSession();
        const pathname = window.location?.pathname;
        if (pathname && !pathname.startsWith('/auth')) {
          window.location.href = '/auth';
        }
        return;
      }
      
      localStorage.setItem(RESTART_ID_KEY, currentRestartId);
    }
    
    if (await checkForRestart()) {
      console.log('[Auth] 時間間隔檢測到服務重啟，已清除用戶會話');
      const pathname = window.location?.pathname;
      if (pathname && !pathname.startsWith('/auth')) {
        window.location.href = '/auth';
      }
    }
  } catch (error) {
    console.warn('[Auth] 初始化重啟檢測失敗:', error);
  }
}

/**
 *
 */
export function startPeriodicRestartCheck(): () => void {
  const interval = setInterval(async () => {
    try {
      if (await checkForRestart()) {
        console.log('[Auth] 定期檢查檢測到服務重啟，已清除用戶會話');
        const pathname = window.location?.pathname;
        if (pathname && !pathname.startsWith('/auth')) {
          window.location.href = '/auth';
        }
      }
    } catch (error) {
      console.warn('[Auth] 定期重啟檢查失敗:', error);
    }
  }, 30 * 60 * 1000); // 每 30 分鐘檢查一次
  
  return () => clearInterval(interval);
}

/**
 *
 */
export function canSetMode(): boolean {
  const r = getRole();
  return r === "dev_admin";
}

/**
 *
 */
export function canAccessChatMonitoring(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

/**
 *
 */
export function canAccessModeManagement(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

/**
 *
 */
export function canAccessUserManagement(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

/**
 *
 */
export function canAccessSchoolManagement(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

/**
 *
 */
export function canAccessPageContent(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

/**
 *
 */
export function canAccessAnnouncements(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

/**
 *
 */
export function canManageCrossSchool(): boolean {
  const role = getRole();
  return role === "dev_admin" || role === "cross_admin";
}

/**
 *
 */
export function canManageCampusOnly(): boolean {
  const role = getRole();
  return role === "campus_admin";
}

/**
 *
 */
export function canSelectSchool(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

/**
 *
 */
export function getDefaultSchoolScope(): "campus" | "cross" | "all" {
  const role = getRole();
  if (role === "dev_admin") return "all";
  if (role === "cross_admin") return "cross";
  if (role === "campus_admin") return "campus";
  return "campus";
}

/** 解析 JWT 並回傳 sub（使用者 ID） */
export function getUserId(): string | null {
  try {
    const t = localStorage.getItem('token') || ''
    if (!t || t.split('.').length < 2) return null
    const payload = JSON.parse(atob(t.split('.')[1]))
    const sub = payload?.sub
    return (typeof sub === 'string' || typeof sub === 'number') ? String(sub) : null
  } catch { return null }
}

/**
 *
 */
export function canPublishAnnouncement(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

/**
 *
 */
export function getRoleDisplayName(role: Role): string {
  const roleNames: Record<Role, string> = {
    guest: '訪客',
    user: '一般用戶',
    campus_moderator: '校內審核',
    cross_moderator: '跨校審核',
    campus_admin: '校內板主',
    cross_admin: '跨校板主',
    dev_admin: '開發人員'
  }
  return roleNames[role] || role
}
