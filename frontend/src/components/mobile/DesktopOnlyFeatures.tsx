import React from 'react'
import { Monitor, Smartphone, LifeBuoy, Users, Building2, LayoutDashboard, Instagram, Type, Server, Key, BarChart3 } from 'lucide-react'

interface DesktopFeature {
  title: string
  description: string
  icon: React.ComponentType<any>
}

interface DesktopOnlyFeaturesProps {
  userRole?: string
  className?: string
}

export function DesktopOnlyFeatures({ userRole = '', className = "" }: DesktopOnlyFeaturesProps) {
  const baseFeatures: DesktopFeature[] = [
    {
      title: "客服管理",
      description: "支援單審核、狀態管理、訊息回覆與統計報表",
      icon: LifeBuoy
    },
    {
      title: "系統管理",
      description: "使用者管理、學校管理、整合狀態監控",
      icon: Users
    },
    {
      title: "內容管理",
      description: "頁面編輯、模式切換、事件記錄",
      icon: LayoutDashboard
    }
  ]

  const instagramFeatures: DesktopFeature[] = [
    {
      title: "Instagram 整合",
      description: "帳號管理、模板設定、發布狀態與統計",
      icon: Instagram
    }
  ]

  const devAdminFeatures: DesktopFeature[] = [
    {
      title: "會員管理",
      description: "會員訂閱管理、廣告貼文審核、用戶狀態管理",
      icon: Users
    },
    {
      title: "伺服器狀態",
      description: "系統資源、服務運行時間、技術指標監控",
      icon: Server
    },
    {
      title: "Token 管理工具",
      description: "短期 Token 轉長期、Instagram API 密鑰管理",
      icon: Key
    }
  ]

  const fontFeatures: DesktopFeature[] = [
    {
      title: "字體管理",
      description: "字體上傳、預覽效果、圖片生成支援",
      icon: Type
    }
  ]

  const projectFeatures: DesktopFeature[] = [
    {
      title: "專案空間狀態",
      description: "用戶活動、內容統計、整合服務狀態",
      icon: BarChart3
    }
  ]

  // 根據角色決定顯示的功能
  let features: DesktopFeature[] = [...baseFeatures]

  if (['dev_admin', 'campus_admin', 'cross_admin'].includes(userRole)) {
    features.push(...instagramFeatures)
  }

  if (userRole === 'dev_admin') {
    features.push(...devAdminFeatures)
  }

  if (['dev_admin', 'campus_admin'].includes(userRole)) {
    features.push(...fontFeatures)
  }

  if (['dev_admin', 'campus_admin', 'cross_admin'].includes(userRole)) {
    features.push(...projectFeatures)
  }

  return (
    <div className={`p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 ${className}`}>
      <div className="space-y-4">
        {/* 頭部提示 */}
        <div className="text-center space-y-3">
          <div className="flex justify-center items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/50">
              <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-2xl text-blue-300 dark:text-blue-600">→</div>
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/50">
              <Monitor className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            桌面版限定功能
          </h3>

          <p className="text-blue-700 dark:text-blue-300 font-medium">
            請使用電腦版以確保最佳使用體驗
          </p>

          <div className="text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
            以下功能需要較大的螢幕空間和完整的鍵鼠操作體驗
          </div>
        </div>

        {/* 功能列表 */}
        <div className="space-y-3">
          {features.map((feature, index) => {
            const IconComponent = feature.icon
            return (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
              >
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                  <IconComponent className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {feature.title}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {feature.description}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}