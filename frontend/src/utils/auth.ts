export type Role =
  | "guest"           // 訪客
  | "user"            // 一般用戶
  | "campus_admin"    // 校內管理員
  | "cross_admin"     // 跨校管理員
  | "campus_moderator" // 校內板主
  | "cross_moderator" // 跨校板主
  | "dev_admin";      // 開發人員

// 重啟檢測機制
const RESTART_KEY = 'fk_restart_timestamp'
const RESTART_ID_KEY = 'fk_restart_id'

export function saveSession(token: string, role: Role, school_id: number | null, refresh_token?: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  localStorage.setItem("school_id", school_id !== null ? String(school_id) : "");
  if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
  
  // 設置重啟檢測時間戳
  localStorage.setItem(RESTART_KEY, Date.now().toString());
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role"); 
  localStorage.removeItem("school_id");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem(RESTART_KEY);
  localStorage.removeItem(RESTART_ID_KEY);
}

export function getRole(): Role { 
  return (localStorage.getItem("role") as Role) || "guest";
}

export function getSchoolId(): number | null {
  const schoolId = localStorage.getItem("school_id");
  return schoolId ? parseInt(schoolId) : null;
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}

// 檢查是否需要強制登出（重啟檢測）
export async function checkForRestart(): Promise<boolean> {
  try {
    // 檢查本地時間戳
    const lastTimestamp = localStorage.getItem(RESTART_KEY);
    if (!lastTimestamp) {
      // 沒有時間戳，可能是首次訪問或已清除
      return false;
    }
    
    const lastTime = parseInt(lastTimestamp, 10);
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTime;
    
    // 延長檢測間隔到 10 分鐘，避免過於頻繁的檢查
    if (timeDiff > 600 * 1000) {
      const response = await fetch('/api/healthz', { 
        method: 'GET',
        cache: 'no-cache'  // 確保每次都是最新的
      });
      if (response.ok) {
        const data = await response.json();
        const currentRestartId = data.restart_id;
        const storedRestartId = localStorage.getItem(RESTART_ID_KEY);
        
        // 只有在有存儲的重啟ID且與當前不同時才認為是重啟
        // 並且增加額外檢查：確保不是因為網路問題導致的誤判
        if (storedRestartId && storedRestartId !== currentRestartId) {
          console.log('[Auth] 檢測到服務重啟，重啟ID變更:', storedRestartId, '->', currentRestartId);
          // 再次確認，避免單次網路錯誤導致誤判
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
        
        // 更新重啟標識和時間戳
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

// 初始化時檢查重啟
export async function initRestartCheck(): Promise<void> {
  try {
    // 立即檢查重啟狀態（不等待時間間隔）
    const response = await fetch('/api/healthz');
    if (response.ok) {
      const data = await response.json();
      const currentRestartId = data.restart_id;
      const storedRestartId = localStorage.getItem(RESTART_ID_KEY);
      
      // 如果有存儲的重啟ID且與當前不同，說明服務已重啟
      if (storedRestartId && storedRestartId !== currentRestartId) {
        console.log('[Auth] 頁面載入時檢測到服務重啟，重啟ID變更:', storedRestartId, '->', currentRestartId);
        clearSession();
        // 如果不在登入頁面，重定向到登入頁面
        const pathname = window.location?.pathname;
        if (pathname && !pathname.startsWith('/auth')) {
          window.location.href = '/auth';
        }
        return;
      }
      
      // 更新重啟標識
      localStorage.setItem(RESTART_ID_KEY, currentRestartId);
    }
    
    // 額外檢查時間間隔的重啟檢測
    if (await checkForRestart()) {
      console.log('[Auth] 時間間隔檢測到服務重啟，已清除用戶會話');
      // 如果不在登入頁面，重定向到登入頁面
      const pathname = window.location?.pathname;
      if (pathname && !pathname.startsWith('/auth')) {
        window.location.href = '/auth';
      }
    }
  } catch (error) {
    console.warn('[Auth] 初始化重啟檢測失敗:', error);
  }
}

// 定期重啟檢查（每 30 分鐘檢查一次，減少誤判）
export function startPeriodicRestartCheck(): () => void {
  const interval = setInterval(async () => {
    try {
      if (await checkForRestart()) {
        console.log('[Auth] 定期檢查檢測到服務重啟，已清除用戶會話');
        // 如果不在登入頁面，重定向到登入頁面
        const pathname = window.location?.pathname;
        if (pathname && !pathname.startsWith('/auth')) {
          window.location.href = '/auth';
        }
      }
    } catch (error) {
      console.warn('[Auth] 定期重啟檢查失敗:', error);
    }
  }, 30 * 60 * 1000); // 每 30 分鐘檢查一次
  
  // 返回清理函數
  return () => clearInterval(interval);
}

export function canSetMode(): boolean {
  const r = getRole();
  return r === "dev_admin";
}

// 權限檢查函數
export function canAccessChatMonitoring(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

export function canAccessModeManagement(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

export function canAccessUserManagement(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

export function canAccessSchoolManagement(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

export function canAccessPageContent(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

export function canAccessAnnouncements(): boolean {
  const role = getRole();
  // campus_admin, cross_admin, dev_admin 可以進入公告系統
  // campus_moderator, cross_moderator 不能進入
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

export function canManageCrossSchool(): boolean {
  const role = getRole();
  return role === "dev_admin" || role === "cross_admin";
}

export function canManageCampusOnly(): boolean {
  const role = getRole();
  return role === "campus_admin";
}

export function canSelectSchool(): boolean {
  const role = getRole();
  return role === "dev_admin";
}

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

export function canPublishAnnouncement(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}

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
