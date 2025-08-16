import { useState, useEffect } from 'react';
import { CheckCircle, Zap, AlertTriangle, Wrench } from 'lucide-react';
import { ModeAPI } from '@/services/api';

type ModeType = "normal" | "dev" | "maintenance" | "development";

interface ModeConfig {
  name: string;
  shortName: string;
  icon: any;
  color: string;
  bgColor: string;
}

const MODE_CONFIGS: Record<ModeType, ModeConfig> = {
  normal: {
    name: "正常模式",
    shortName: "正常",
    icon: CheckCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20"
  },
  development: {
    name: "開發模式",
    shortName: "開發",
    icon: Zap,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20"
  },
  maintenance: {
    name: "維護模式",
    shortName: "維護",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20"
  },
  dev: {
    name: "開發者模式",
    shortName: "Dev",
    icon: Wrench,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20"
  }
};

export function ModeIndicator({ showText = true }: { showText?: boolean }) {
  const [mode, setMode] = useState<ModeType>("normal");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMode();
    // 每30秒刷新一次模式狀態
    const interval = setInterval(loadMode, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadMode() {
    try {
      const r = await ModeAPI.get();
      setMode(r.mode);
    } catch (e) {
      console.warn('Failed to load mode:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-muted animate-pulse"></div>
        {showText && <span className="text-sm text-muted">載入中</span>}
      </div>
    );
  }

  const config = MODE_CONFIGS[mode];

  return (
    <div 
      className="flex items-center gap-2"
      title={`目前系統模式：${config.name}`}
    >
      <config.icon className={`w-4 h-4 ${config.color}`} />
      {showText && (
        <span className="text-sm font-medium text-fg">
          {config.shortName}
        </span>
      )}
    </div>
  );
}
