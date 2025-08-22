import { useEffect, useState } from "react";
import { ModeAPI } from "@/services/api";
import { canSetMode, isLoggedIn, getRole } from "@/utils/auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Server, Wrench, AlertTriangle, Zap, CheckCircle, Database, Activity, RefreshCw, Cloud, CloudOff, ArrowLeft } from "lucide-react";

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
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    textColor: "text-green-800 dark:text-green-100"
  },
  development: {
    name: "開發模式", 
    description: "開發者模式，顯示額外的調試資訊",
    icon: Zap,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    textColor: "text-blue-800 dark:text-blue-100"
  },
  maintenance: {
    name: "維護模式",
    description: "系統維護中，部分功能受限",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400", 
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    textColor: "text-amber-800 dark:text-amber-100"
  },
  test: {
    name: "測試模式",
    description: "對外測試：管理員看正常頁，其他人看開發頁",
    icon: Wrench,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20", 
    textColor: "text-purple-800 dark:text-purple-100"
  }
};

export default function ModePage() {
  const [mode, setMode] = useState<ModeType>("normal");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceUntil, setMaintenanceUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [healthLoading, setHealthLoading] = useState(true);
  const [health, setHealth] = useState<any | null>(null);
  // 發文內容規則
  const [enforceMinChars, setEnforceMinChars] = useState(true)
  const [minChars, setMinChars] = useState(15)

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
      if (typeof r.enforce_min_post_chars === 'boolean') setEnforceMinChars(r.enforce_min_post_chars)
      if (typeof r.min_post_chars === 'number') setMinChars(r.min_post_chars)
    } catch (e: any) {
      showMessage(e.message || "載入模式失敗", "error");
    }
  }

  async function switchMode(newMode: ModeType) {
    if (!canSetMode()) {
      showMessage("權限不足：需要管理員權限才能切換模式", "error");
      return;
    }
    
    if (!isLoggedIn()) {
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
        { enforce_min_post_chars: enforceMinChars, min_post_chars: minChars }
      );
      setMode(r.mode); 
      showMessage(`已切換至${MODE_CONFIGS[newMode].name}`, "success");
      // 重新載入模式以獲取最新設定
      setTimeout(loadCurrentMode, 500);
    } catch (e: any) {
      console.error("Mode switch error:", e);
      let errorMsg = "切換失敗";
      
      if (e.message.includes("401") || e.message.includes("Unauthorized")) {
        errorMsg = "認證失敗：請重新登入";
      } else if (e.message.includes("403") || e.message.includes("Forbidden")) {
        errorMsg = "權限不足：需要管理員權限";
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
    <div className="min-h-screen">
      {/* 左上角返回按鈕 */}
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={() => { try { history.length > 1 ? history.back() : (window.location.href = '/'); } catch { window.location.href = '/'; } }}
          className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm hover:bg-surface/90"
          title="返回"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>
      </div>
      {/* 右上角主題切換器 */}
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/70 backdrop-blur border border-border shadow-sm">
          <ThemeToggle />
          <span className="text-xs text-muted">主題</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 標題區域 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Server className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold dual-text">系統模式管理</h1>
          </div>
          <p className="text-muted">管理平台運行模式和維護設定</p>
        </div>

        {/* 當前模式顯示 */}
        <div className={`rounded-2xl border p-6 mb-8 ${currentConfig.bgColor} border-current`}>
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl bg-white/50 dark:bg-black/20`}>
              <currentConfig.icon className={`w-6 h-6 ${currentConfig.color}`} />
            </div>
            <div>
              <h2 className={`text-xl font-semibold ${currentConfig.textColor}`}>
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

        {/* 健康檢查區塊 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-fg">系統健康檢查</h3>
            <button onClick={loadHealth} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-surface/80 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 重新整理
            </button>
          </div>
          {healthLoading ? (
            <div className="py-6 text-center text-muted">檢查中...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* 總狀態 */}
              <div className={`rounded-xl border p-4 ${health?.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-300/60' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-300/60'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Activity className={`w-5 h-5 ${health?.ok ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`} />
                  <div className="min-w-0">
                    <div className="font-medium text-fg">整體狀態：{health?.ok ? '正常' : '異常'}</div>
                    <div className="text-xs text-muted break-all font-mono">mode: {health?.mode || '-'} · build: {health?.build || '-'}</div>
                    <div className="text-xs text-muted break-all font-mono">request_id: {health?.request_id || '-'}</div>
                  </div>
                </div>
              </div>

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

        {/* 發文內容規則 */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-8">
          <h3 className="font-semibold text-fg mb-4">發文內容規則</h3>
          <div className="grid gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enforceMinChars} onChange={e=>setEnforceMinChars(e.target.checked)} />
              啟用最小字數審核
            </label>
            <div className="grid gap-2 max-w-xs">
              <label className="text-sm">最小字數</label>
              <input type="number" min={0} value={minChars} onChange={e=> setMinChars(Math.max(0, Number(e.target.value||0)))} className="form-control" />
              <p className="text-xs text-muted">若附有媒體檔案，將略過最小字數限制。</p>
            </div>
            <div>
              <button
                onClick={() => switchMode(mode)}
                className="px-4 py-2 rounded-xl border dual-btn"
                disabled={!canSetMode()}
              >
                保存設定
              </button>
            </div>
          </div>
        </div>

        {/* 權限提示和訊息 */}
        <div className="space-y-4">
          {!isLoggedIn() && (
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
          
          {isLoggedIn() && !canSetMode() && (
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
          
          {isLoggedIn() && canSetMode() && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <h4 className="font-medium text-green-800 dark:text-green-100">已授權</h4>
                  <p className="text-sm text-green-700 dark:text-green-200">
                    目前角色：{getRole()}，有權限切換系統模式
                  </p>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className={`rounded-xl p-4 ${
              messageType === "success" 
                ? "bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-100"
                : "bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-100"
            }`}>
              <div className="flex items-center gap-3">
                {messageType === "success" ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
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

