import { useEffect, useState } from "react";
import { ModeAPI, ContentRulesAPI } from "@/services/api";
import { canSetMode, getRole } from "@/utils/auth";
import { useAuth } from "@/contexts/AuthContext";
import { NavBar } from "@/components/layout/NavBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Server, Wrench, AlertTriangle, Zap, CheckCircle, Database, Activity, RefreshCw, Cloud, CloudOff, Lock, Shield } from "lucide-react";

type ModeType = "normal" | "test" | "maintenance" | "development";

interface ModeConfig {
  name: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  textColor: string;
}

const MODE_CONFIGS: Record<ModeType, ModeConfig> = {
  normal: {
    name: "正常模式",
    description: "平台正常運行，所有功能可用",
    icon: CheckCircle,
    color: "text-success",
    bgColor: "bg-success-bg",
    textColor: "text-success-text"
  },
  development: {
    name: "開發模式", 
    description: "開發者模式，顯示額外的調試資訊",
    icon: Zap,
    color: "text-info",
    bgColor: "bg-info-bg",
    textColor: "text-info-text"
  },
  maintenance: {
    name: "維護模式",
    description: "系統維護中，部分功能受限",
    icon: AlertTriangle,
    color: "text-warning", 
    bgColor: "bg-warning-bg",
    textColor: "text-warning-text"
  },
  test: {
    name: "測試模式",
    description: "對外測試：管理員看正常頁，其他人看開發頁",
    icon: Wrench,
    color: "text-accent",
    bgColor: "bg-accent/10", 
    textColor: "text-accent"
  }
};

export default function ModePage() {
  const { isLoggedIn } = useAuth()
  const [mode, setMode] = useState<ModeType>("normal");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceUntil, setMaintenanceUntil] = useState("");
  const [loginMode, setLoginMode] = useState<"single" | "admin_only" | "open">("admin_only");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [healthLoading, setHealthLoading] = useState(true);
  const [health, setHealth] = useState<any | null>(null);
  // 發文內容規則
  const [enforceMinChars, setEnforceMinChars] = useState(true)
  const [minChars, setMinChars] = useState(15)
  // 手機版維護
  const [mobileMaintenance, setMobileMaintenance] = useState(false)
  const [mobileMessage, setMobileMessage] = useState('')

  // 初始化主題
  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  useEffect(() => { 
    loadCurrentMode();
    loadHealth();
  }, []);

  // 每 30 秒自動刷新健康狀態
  useEffect(() => {
    const id = setInterval(loadHealth, 30000)
    return () => clearInterval(id)
  }, [])

  async function loadCurrentMode() {
    try {
      const r = await ModeAPI.get();
      setMode(r.mode);
      setMaintenanceMessage(r.maintenance_message || "");
      setMaintenanceUntil(r.maintenance_until || "");
      setLoginMode(r.login_mode || "admin_only");
      setMobileMaintenance(Boolean(r.mobile_maintenance));
      setMobileMessage(r.mobile_maintenance_message || '手機版目前正在優化中，建議使用桌面版瀏覽器獲得完整體驗。');
      try {
        const cr = await ContentRulesAPI.get()
        if (typeof cr.enforce_min_post_chars === 'boolean') setEnforceMinChars(cr.enforce_min_post_chars)
        if (typeof cr.min_post_chars === 'number') setMinChars(cr.min_post_chars)
      } catch {}
    } catch (e: any) {
      showMessage(e.message || "載入模式失敗", "error");
    }
  }

  async function saveLoginMode(next: "single" | "admin_only" | "open") {
    if (!canSetMode()) {
      showMessage("權限不足：僅 dev_admin 可設定登入模式", "error");
      return;
    }
    
    if (!isLoggedIn) {
      showMessage("請先登入後再設定登入模式", "error");
      return;
    }
    
    setLoading(true);
    try {
      const r = await ModeAPI.set(undefined, undefined, undefined, next);
      // 以後端回傳為準；若無則採用 next
      const applied = (r as any)?.config?.login_mode || next;
      setLoginMode(applied);
      showMessage(`登入模式已更新為：${applied === "single" ? "單一模式" : applied === "admin_only" ? "管理組模式" : "全開模式"}`, "success");
      try { window.dispatchEvent(new Event('fk_mode_updated')) } catch {}
    } catch (e: any) {
      console.error("Login mode save error:", e);
      let errorMsg = "保存失敗";
      
      if (e.message.includes("401") || e.message.includes("Unauthorized")) {
        errorMsg = "認證失敗：請重新登入";
      } else if (e.message.includes("403") || e.message.includes("Forbidden")) {
        errorMsg = "權限不足：僅 dev_admin 可執行此操作";
      } else if (e.message) {
        errorMsg = e.message;
      }
      
      showMessage(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function switchMode(newMode: ModeType) {
    if (!canSetMode()) {
      showMessage("權限不足：僅 dev_admin 可切換模式", "error");
      return;
    }
    
    if (!isLoggedIn) {
      showMessage("請先登入後再切換模式", "error");
      return;
    }
    
    // 顯示確認對話框
    const confirmMessage = `確定要切換到「${MODE_CONFIGS[newMode].name}」嗎？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setLoading(true);
    try {
      const r = await ModeAPI.set(
        newMode, 
        newMode === "maintenance" ? maintenanceMessage : undefined,
        newMode === "maintenance" ? maintenanceUntil : undefined,
      );
      setMode(r.mode); 
      showMessage(`已切換至${MODE_CONFIGS[newMode].name}`, "success");
      // 重新載入模式以獲取最新設定
      setTimeout(loadCurrentMode, 500);
      try { window.dispatchEvent(new Event('fk_mode_updated')) } catch {}
    } catch (e: any) {
      console.error("Mode switch error:", e);
      let errorMsg = "切換失敗";
      
      if (e.message.includes("401") || e.message.includes("Unauthorized")) {
        errorMsg = "認證失敗：請重新登入";
      } else if (e.message.includes("403") || e.message.includes("Forbidden")) {
        errorMsg = "權限不足：僅 dev_admin 可執行此操作";
      } else if (e.message) {
        errorMsg = e.message;
      }
      
      showMessage(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadHealth() {
    try {
      setHealthLoading(true)
      const r = await fetch('/api/healthz', { cache: 'no-store' })
      const j = await r.json().catch(()=> ({}))
      setHealth(j)
    } catch (e) {
      setHealth({ ok: false, error: String(e) })
    } finally {
      setHealthLoading(false)
    }
  }

  function showMessage(text: string, type: "success" | "error") {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 3000);
  }

  const currentConfig = MODE_CONFIGS[mode];

  return (
    <div className="min-h-screen min-h-dvh">
      <NavBar pathname="/mode" />
      <MobileBottomNav />

      <div className="max-w-4xl mx-auto px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 標題區域 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Server className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold dual-text">系統模式管理</h1>
          </div>
          <p className="text-muted">管理平台運行模式和維護設定</p>
        </div>

        {/* 當前模式顯示 */}
        <div className={`rounded-2xl border p-4 sm:p-6 mb-8 ${currentConfig.bgColor} border-current`}>
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl bg-white/50 dark:bg-black/20`}>
              <currentConfig.icon className={`w-6 h-6 ${currentConfig.color}`} />
            </div>
            <div>
              <h2 className={`text-lg sm:text-xl font-semibold ${currentConfig.textColor}`}>
                目前模式：{currentConfig.name}
              </h2>
              <p className={`text-sm ${currentConfig.textColor} opacity-80`}>
                {currentConfig.description}
              </p>
            </div>
          </div>

          {mode === "maintenance" && (maintenanceMessage || maintenanceUntil) && (
            <div className={`mt-4 p-4 rounded-xl ${currentConfig.bgColor} border border-current/20`}>
              {maintenanceMessage && (
                <div className="mb-2">
                  <span className={`text-sm font-medium ${currentConfig.textColor} opacity-80`}>維護公告：</span>
                  <span className={`${currentConfig.textColor}`}>{maintenanceMessage}</span>
                </div>
              )}
              {maintenanceUntil && (
                <div>
                  <span className={`text-sm font-medium ${currentConfig.textColor} opacity-80`}>預計完成：</span>
                  <span className={`${currentConfig.textColor}`}>{maintenanceUntil}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 模式切換卡片 */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {Object.entries(MODE_CONFIGS).map(([modeKey, config]) => {
            const isActive = mode === modeKey;
            const isDisabled = !canSetMode() || loading;
            
            return (
              <button
                key={modeKey}
                onClick={() => switchMode(modeKey as ModeType)}
                disabled={isDisabled}
                className={`
                  p-6 rounded-2xl border transition-all text-left
                  ${isActive 
                    ? `${config.bgColor} border-current ring-2 ring-current/20` 
                    : 'bg-surface border-border hover:border-primary/50 hover:shadow-md'
                  }
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-center gap-4 mb-3">
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-white/50 dark:bg-black/20' : 'bg-surface'}`}>
                    <config.icon className={`w-5 h-5 ${isActive ? config.color : 'text-muted'}`} />
                  </div>
                  <h3 className={`font-semibold ${isActive ? config.textColor : 'text-fg'}`}>
                    {config.name}
                  </h3>
                  {isActive && (
                    <span className={`text-xs px-2 py-1 rounded-full bg-white/60 dark:bg-black/30 ${config.textColor}`}>
                      目前
                    </span>
                  )}
                </div>
                <p className={`text-sm ${isActive ? `${config.textColor} opacity-80` : 'text-muted'}`}>
                  {config.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* 登入模式設定 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-fg" />
            <h3 className="font-semibold text-fg">登入模式設定</h3>
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            {/* 單一模式 */}
            <button
              onClick={() => saveLoginMode("single")}
              disabled={loading}
              className={`
                p-4 rounded-xl border transition-all text-left
                ${loginMode === "single" 
                  ? 'bg-danger-bg border-danger-border ring-2 ring-danger-border/20' 
                  : 'bg-surface border-border hover:border-danger-border/50 hover:shadow-md'
                }
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${loginMode === "single" ? 'bg-surface-hover' : 'bg-surface'}`}>
                  <AlertTriangle className={`w-4 h-4 ${loginMode === "single" ? 'text-danger' : 'text-muted'}`} />
                </div>
                <h4 className={`font-medium ${loginMode === "single" ? 'text-danger-text' : 'text-fg'}`}>
                  單一模式
                </h4>
                {loginMode === "single" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-danger-bg text-danger-text border border-danger-border">
                    目前
                  </span>
                )}
              </div>
              <p className={`text-sm ${loginMode === "single" ? 'text-danger-text' : 'text-muted'}`}>
                僅允許指定帳號登入
              </p>
            </button>

            {/* 管理組模式 */}
            <button
              onClick={() => saveLoginMode("admin_only")}
              disabled={loading}
              className={`
                p-4 rounded-xl border transition-all text-left
                ${loginMode === "admin_only" 
                  ? 'bg-warning-bg border-warning-border ring-2 ring-warning-border/20' 
                  : 'bg-surface border-border hover:border-warning-border/50 hover:shadow-md'
                }
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${loginMode === "admin_only" ? 'bg-surface-hover' : 'bg-surface'}`}>
                  <Shield className={`w-4 h-4 ${loginMode === "admin_only" ? 'text-warning' : 'text-muted'}`} />
                </div>
                <h4 className={`font-medium ${loginMode === "admin_only" ? 'text-warning-text' : 'text-fg'}`}>
                  管理組模式
                </h4>
                {loginMode === "admin_only" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-warning-bg text-warning-text border border-warning-border">
                    目前
                  </span>
                )}
              </div>
              <p className={`text-sm ${loginMode === "admin_only" ? 'text-warning-text' : 'text-muted'}`}>
                僅允許管理員帳號登入
              </p>
            </button>

            {/* 全開模式 */}
            <button
              onClick={() => saveLoginMode("open")}
              disabled={loading}
              className={`
                p-4 rounded-xl border transition-all text-left
                ${loginMode === "open" 
                  ? 'bg-success-bg border-success-border ring-2 ring-success-border/20' 
                  : 'bg-surface border-border hover:border-success-border/50 hover:shadow-md'
                }
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${loginMode === "open" ? 'bg-surface-hover' : 'bg-surface'}`}>
                  <CheckCircle className={`w-4 h-4 ${loginMode === "open" ? 'text-success' : 'text-muted'}`} />
                </div>
                <h4 className={`font-medium ${loginMode === "open" ? 'text-success-text' : 'text-fg'}`}>
                  全開模式
                </h4>
                {loginMode === "open" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-success-bg text-success-text border border-success-border">
                    目前
                  </span>
                )}
              </div>
              <p className={`text-sm ${loginMode === "open" ? 'text-success-text' : 'text-muted'}`}>
                允許所有用戶登入和註冊
              </p>
            </button>
          </div>
        </div>

        {/* 手機版維護設定 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <CloudOff className="w-5 h-5 text-fg" />
            <h3 className="font-semibold text-fg">手機版維護設定</h3>
          </div>
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-xl border border-border mb-3">
            <div>
              <div className="font-medium text-fg">啟用手機版維護頁</div>
              <div className="text-sm text-muted">行動裝置進站時顯示臨時頁，建議改用電腦瀏覽</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={mobileMaintenance} onChange={e=>setMobileMaintenance(e.target.checked)} />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">維護訊息（選填）</label>
            <input className="form-control" value={mobileMessage} onChange={e=>setMobileMessage(e.target.value)} placeholder="手機版目前正在優化中，建議使用桌面版瀏覽器獲得完整體驗。" />
            <div className="text-xs text-muted mt-1">留空將使用預設訊息</div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={async()=>{
                try{
                  setLoading(true)
                  await ModeAPI.set(undefined, undefined, undefined, undefined, { mobile_maintenance: mobileMaintenance, mobile_maintenance_message: mobileMessage })
                  showMessage('手機版維護設定已更新', 'success')
                  try { window.dispatchEvent(new Event('fk_mode_updated')) } catch {}
                }catch(e:any){
                  showMessage(e?.message || '更新失敗','error')
                }finally{ setLoading(false) }
              }}
              className="btn-primary px-4 py-2"
            >儲存</button>
          </div>
        </div>

        {/* 健康檢查區塊 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-fg">系統健康檢查</h3>
            <button onClick={loadHealth} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-surface/80 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 重新整理
            </button>
          </div>
          {healthLoading ? (
            <div className="py-8 text-center text-muted">檢查中...</div>
          ) : (
            <div className="space-y-4">
              {/* 總狀態 */}
              <div className={`rounded-xl border p-4 ${health?.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-300/60' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-300/60'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Activity className={`w-5 h-5 ${health?.ok ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`} />
                                      <div className="min-w-0">
                      <div className="font-medium text-fg">整體狀態：{health?.ok ? '正常' : '異常'}</div>
                      <div className="text-xs text-muted break-all font-mono">
                        版本: {health?.version || '-'} · 
                        環境: {health?.environment || '-'}
                      </div>
                      <div className="text-xs text-muted break-all font-mono">
                        運行時間: {health?.uptime ? Math.floor(health.uptime / 3600) + '小時' : '-'} · 
                        重啟ID: {health?.restart_id || '-'}
                      </div>
                    </div>
                </div>
              </div>

              {/* 服務狀態網格 */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* DB 狀態 */}
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Database className="w-5 h-5 text-fg" />
                    <div className="font-medium text-fg">資料庫</div>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded ${health?.db?.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>{health?.db?.ok ? 'OK' : 'FAIL'}</span>
                  </div>
                  <div className="text-xs text-muted space-y-1 break-all font-mono">
                    <div>driver：{health?.db?.driver || '-'}</div>
                    <div>url：{health?.db?.url || '-'}</div>
                    {health?.db?.error && <div className="text-rose-600 dark:text-rose-400 break-all">{health.db.error}</div>}
                  </div>
                </div>

                {/* Redis 狀態 */}
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    {health?.redis?.ok ? <Cloud className="w-5 h-5 text-fg" /> : <CloudOff className="w-5 h-5 text-fg" />}
                    <div className="font-medium text-fg">Redis</div>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded ${health?.redis?.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>{health?.redis?.ok ? 'OK' : 'FAIL'}</span>
                  </div>
                  <div className="text-xs text-muted space-y-1 break-all font-mono">
                    <div>url：{health?.redis?.url || '-'}</div>
                    {health?.redis?.error && <div className="text-rose-600 dark:text-rose-400 break-all">{health.redis.error}</div>}
                  </div>
                </div>

                {/* CDN 狀態 */}
                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Cloud className="w-5 h-5 text-fg" />
                    <div className="font-medium text-fg">CDN</div>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded ${health?.cdn?.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>{health?.cdn?.status || (health?.cdn?.ok ? 'OK' : 'FAIL')}</span>
                  </div>
                  <div className="text-xs text-muted space-y-1 break-all font-mono">
                    <div>host：{health?.cdn?.host || '-'}</div>
                    <div>port：{health?.cdn?.port || '-'}</div>
                    {health?.cdn?.tcp_ok !== undefined && (
                      <div>TCP連線：{health.cdn.tcp_ok ? 'OK' : 'FAIL'}</div>
                    )}
                    {health?.cdn?.http_ok !== undefined && (
                      <div>HTTP狀態：{health.cdn.http_ok ? 'OK' : 'FAIL'} ({health.cdn.http_status || 'N/A'})</div>
                    )}
                    {health?.cdn?.file_test_ok !== undefined && (
                      <div>檔案服務：{health.cdn.file_test_ok ? 'OK' : 'FAIL'}</div>
                    )}
                    {health?.cdn?.error && <div className="text-rose-600 dark:text-rose-400 break-all">{health.cdn.error}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 維護模式設定 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <h3 className="font-semibold text-fg mb-4">維護模式設定</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-fg mb-2">維護公告</label>
              <textarea
                value={maintenanceMessage}
                onChange={e => setMaintenanceMessage(e.target.value)}
                placeholder="例：系統升級中，暫停服務約30分鐘，造成不便敬請見諒"
                className="form-control w-full"
                rows={3}
              />
              <p className="text-xs text-muted mt-1">如果留空，將顯示預設的維護訊息</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg mb-2">預計完成時間</label>
              <input
                type="text"
                value={maintenanceUntil}
                onChange={e => setMaintenanceUntil(e.target.value)}
                placeholder="例：2025-08-17 12:00 或 約2小時後"
                className="form-control w-full"
              />
              <p className="text-xs text-muted mt-1">可選填預計維護完成的時間</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-xl p-3">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-100 mb-1">快速設定</h4>
              <div className="flex gap-2 flex-wrap">
        <button 
                  type="button"
                  onClick={() => {
                    setMaintenanceMessage("系統升級中，預計30分鐘內完成，造成不便敬請見諒");
                    setMaintenanceUntil("約30分鐘後");
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                >
                  升級維護
        </button>
        <button 
                  type="button"
                  onClick={() => {
                    setMaintenanceMessage("資料庫維護作業進行中，請稍候再試");
                    setMaintenanceUntil("約1小時後");
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                >
                  資料庫維護
        </button>
        <button 
                  type="button"
                  onClick={() => {
                    setMaintenanceMessage("緊急維護中，請關注官方公告");
                    setMaintenanceUntil("預計2小時內");
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                >
                  緊急維護
        </button>
      </div>
            </div>
          </div>
        </div>

        {/* 發文內容規則（獨立保存） */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <h3 className="font-semibold text-fg mb-4">發文內容規則</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enforceMinChars} onChange={e=>setEnforceMinChars(e.target.checked)} />
              啟用最小字數限制
            </label>
            <div>
              <label className="block text-sm text-muted mb-1">最小字數</label>
              <input type="number" value={minChars} min={0} onChange={e=>setMinChars(Math.max(0, Number(e.target.value||0)))} className="form-control w-32" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={async()=>{
              try{
                await ContentRulesAPI.set({ enforce_min_post_chars: enforceMinChars, min_post_chars: minChars })
                showMessage('已保存發文內容規則', 'success')
              }catch(e:any){ showMessage(e?.message || '保存失敗', 'error') }
            }} className="btn-primary px-4 py-2">保存規則</button>
          </div>
        </div>

        

        {/* 權限提示和訊息 */}
        <div className="space-y-4">
          {!isLoggedIn && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <h4 className="font-medium text-red-800 dark:text-red-100">未登入</h4>
                  <p className="text-sm text-red-700 dark:text-red-200">
                    請先登入才能切換系統模式
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isLoggedIn && !canSetMode() && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-100">權限不足</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-200">
                    目前角色：{getRole()}，僅 dev_admin、campus_admin、cross_admin 可切換系統模式
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isLoggedIn && canSetMode() && (
            <div className="bg-success-bg border border-success-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-success" />
                <div>
                  <h4 className="font-medium text-success-text">已授權</h4>
                  <p className="text-sm text-success-text/80">
                    目前角色：{getRole()}，有權限切換系統模式
                  </p>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className={`rounded-xl p-4 ${
              messageType === "success" 
                ? "bg-success-bg border border-success-border text-success-text"
                : "bg-danger-bg border border-danger-border text-danger-text"
            }`}>
              <div className="flex items-center gap-3">
                {messageType === "success" ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-danger" />
                )}
                <span className="font-medium">{message}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

