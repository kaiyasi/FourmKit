import React from 'react'
import { Monitor, Smartphone } from 'lucide-react'

interface DesktopOnlyNoticeProps {
  title: string
  description?: string
  className?: string
}

export function DesktopOnlyNotice({
  title,
  description,
  className = ""
}: DesktopOnlyNoticeProps) {
  return (
    <div className={`p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 ${className}`}>
      <div className="text-center space-y-4">
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
          {title}
        </h3>

        <div className="space-y-2">
          <p className="text-blue-700 dark:text-blue-300 font-medium">
            請使用電腦版以確保最佳使用體驗
          </p>
          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
          此功能需要較大的螢幕空間和完整的鍵鼠操作體驗
        </div>
      </div>
    </div>
  )
}