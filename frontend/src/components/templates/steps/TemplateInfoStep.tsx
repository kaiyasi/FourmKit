import React from 'react'
import { Info, User, Calendar, TrendingUp } from 'lucide-react'

interface TemplateInfo {
  name: string
  description: string
  account_id: number
  is_default: boolean
  created_at?: string
  updated_at?: string
  usage_count?: number
}

interface SocialAccount {
  id: number
  platform_username: string
  display_name: string
}

interface TemplateInfoStepProps {
  templateInfo: TemplateInfo
  accounts: SocialAccount[]
  onUpdate: (updates: Partial<TemplateInfo>) => void
  isEditing?: boolean
}

export default function TemplateInfoStep({
  templateInfo,
  accounts,
  onUpdate,
  isEditing = false
}: TemplateInfoStepProps) {
  const selectedAccount = accounts.find(acc => acc.id === templateInfo.account_id)

  return (
    <div className="space-y-6">

      {/* 基本資訊卡片 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Info className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">基本資訊</h3>
            <p className="text-sm text-gray-500">設定模板的基本信息</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              模板名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={templateInfo.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="輸入模板名稱，例如：校園活動宣傳模板"
              className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            {!templateInfo.name.trim() && (
              <p className="mt-1 text-sm text-red-600">請輸入模板名稱</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              模板描述 <span className="text-gray-400">(可選)</span>
            </label>
            <textarea
              rows={3}
              value={templateInfo.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="簡短描述這個模板的用途和特色..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 帳號綁定卡片 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">帳號綁定</h3>
            <p className="text-sm text-gray-500">選擇要使用此模板的 Instagram 帳號</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              選擇 Instagram 帳號 <span className="text-red-500">*</span>
            </label>

            <div className="space-y-3">
              {accounts.map(account => (
                <div
                  key={account.id}
                  onClick={() => onUpdate({ account_id: account.id })}
                  className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    templateInfo.account_id === account.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {account.platform_username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        @{account.platform_username}
                      </div>
                      <div className="text-sm text-gray-500">
                        {account.display_name}
                      </div>
                    </div>
                    {templateInfo.account_id === account.id && (
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {accounts.length === 0 && (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-xl">
                <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>尚未綁定任何 Instagram 帳號</p>
                <p className="text-sm mt-1">請先到帳號管理頁面綁定帳號</p>
              </div>
            )}
          </div>

          {selectedAccount && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="is_default"
                checked={templateInfo.is_default}
                onChange={(e) => onUpdate({ is_default: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="is_default" className="text-sm text-gray-700">
                設為 <span className="font-medium">@{selectedAccount.platform_username}</span> 的預設模板
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 製作紀錄卡片 */}
      {isEditing && (templateInfo.created_at || templateInfo.updated_at || templateInfo.usage_count !== undefined) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">製作紀錄</h3>
              <p className="text-sm text-gray-500">模板的使用歷史與統計</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templateInfo.created_at && (
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm text-gray-500 mb-1">建立時間</div>
                <div className="font-medium text-gray-900">
                  {new Date(templateInfo.created_at).toLocaleDateString('zh-TW', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            )}

            {templateInfo.updated_at && (
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm text-gray-500 mb-1">最後修改</div>
                <div className="font-medium text-gray-900">
                  {new Date(templateInfo.updated_at).toLocaleDateString('zh-TW', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            )}

            {templateInfo.usage_count !== undefined && (
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-500">使用次數</span>
                </div>
                <div className="font-medium text-gray-900">
                  {templateInfo.usage_count} 次
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 提示卡片 */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex gap-3">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <Info className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-medium text-blue-900 mb-2">📋 模板設定提示</h4>
            <div className="text-sm text-blue-800 space-y-2">
              <p>• <strong>模板名稱</strong>：建議使用描述性的名稱，方便之後管理和選擇</p>
              <p>• <strong>模板描述</strong>：可以記錄適用場景，例如「適用於活動宣傳」、「一般公告使用」</p>
              <p>• <strong>預設模板</strong>：設為預設後，該帳號發布貼文時會優先使用此模板</p>
              <p>• <strong>下一步</strong>：接下來將設定貼文樣式、相片處理和文案格式</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}