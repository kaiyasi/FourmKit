import { useState, useEffect } from 'react';
import { CheckCircle, Zap, AlertTriangle, Wrench } from 'lucide-react';
import { ModeAPI } from '@/services/api';

type ModeType = "normal" | "test" | "maintenance" | "development";

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
    color: "text-success",
    bgColor: "bg-success-bg"
  },
  development: {
    name: "開發模式",
    shortName: "開發",
    icon: Zap,
    color: "text-info",
    bgColor: "bg-info-bg"
  },
  maintenance: {
    name: "維護模式",
    shortName: "維護",
    icon: AlertTriangle,
    color: "text-warning",
    bgColor: "bg-warning-bg"
  },
  test: {
    name: "測試模式",
    shortName: "Test",
    icon: Wrench,
    color: "text-accent",
    bgColor: "bg-accent/10"
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
