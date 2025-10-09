# NavBar 事件訪問控制改進

## 概述

本次改進針對 NavBar 的事件頁面訪問進行了權限控制優化，確保只有 `dev_admin` 可以訪問事件記錄，其他管理員角色改為顯示支援頁面，避免 NavBar 過長。

## 主要改進

### 1. NavBar 導航項目調整

#### ✅ 改進內容
- **dev_admin**: 保留「事件」導航項目
- **其他管理員角色**: 移除「事件」導航項目，改為顯示「支援」
- **避免 NavBar 過長**: 減少非 dev_admin 的導航項目數量

#### 🔧 技術實現
- 修改 `frontend/src/components/layout/NavBar.tsx` 中的導航配置
- 從 `campus_admin`、`cross_admin`、`campus_moderator`、`cross_moderator` 的導航項目中移除事件頁面
- 保留支援頁面作為替代

### 2. 路由權限控制

#### ✅ 改進內容
- **事件頁面訪問限制**: 只有 `dev_admin` 可以訪問 `/admin/events`
- **權限驗證**: 使用 `RequireRoles` 組件進行權限控制

#### 🔧 技術實現
- 修改 `frontend/src/main.tsx` 中的路由配置
- 將事件頁面的 `allow` 參數從 `['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']` 改為 `['dev_admin']`

### 3. 後台主控台調整

#### ✅ 改進內容
- **事件記錄卡片**: 只在 dev_admin 的後台主控台顯示
- **條件渲染**: 根據用戶角色動態顯示事件記錄卡片

#### 🔧 技術實現
- 修改 `frontend/src/pages/AdminDashboard.tsx`
- 添加條件渲染邏輯：`{role === 'dev_admin' && (...)}`
- 導入 `Activity` 圖標用於事件記錄卡片

### 4. 手機版導航調整

#### ✅ 改進內容
- **手機版事件選項**: 只在 dev_admin 的更多選單中顯示
- **權限過濾**: 更新手機版導航的權限檢查邏輯

#### 🔧 技術實現
- 修改 `frontend/src/components/layout/MobileNavigation.tsx`
- 將事件日誌的 `require` 條件改為 `r => r === 'dev_admin'`

## 權限控制矩陣

### 桌面版 NavBar
| 角色 | 事件頁面 | 支援頁面 | 說明 |
|------|----------|----------|------|
| dev_admin | ✅ | ❌ | 顯示事件頁面 |
| campus_admin | ❌ | ✅ | 顯示支援頁面 |
| cross_admin | ❌ | ✅ | 顯示支援頁面 |
| campus_moderator | ❌ | ✅ | 顯示支援頁面 |
| cross_moderator | ❌ | ✅ | 顯示支援頁面 |

### 手機版導航
| 角色 | 事件日誌選項 | 說明 |
|------|-------------|------|
| dev_admin | ✅ | 在更多選單中顯示 |
| 其他管理員 | ❌ | 不顯示事件選項 |

### 後台主控台
| 角色 | 事件記錄卡片 | 說明 |
|------|-------------|------|
| dev_admin | ✅ | 顯示事件記錄卡片 |
| 其他管理員 | ❌ | 不顯示事件記錄卡片 |

## 用戶體驗改進

### 1. NavBar 長度優化
- **減少導航項目**: 非 dev_admin 的 NavBar 項目從 7 個減少到 6 個
- **避免過長**: 防止 NavBar 在小螢幕上顯示過多項目
- **保持一致性**: 所有非 dev_admin 角色都有相同的導航結構

### 2. 權限清晰化
- **明確分工**: dev_admin 負責系統事件監控，其他管理員專注於日常管理
- **減少混淆**: 避免非 dev_admin 用戶看到無法訪問的功能
- **提升效率**: 讓每個角色專注於其職責範圍內的功能

### 3. 導航邏輯優化
- **角色導向**: 根據用戶角色提供最相關的導航選項
- **功能聚焦**: 每個角色看到的功能都與其權限相符
- **使用體驗**: 減少無效連結和權限錯誤

## 技術實現細節

### 1. 條件渲染
```typescript
// 後台主控台中的條件渲染
{role === 'dev_admin' && (
  <Card to="/admin/events" title="事件記錄" desc="系統事件日誌、操作記錄、審計追蹤" icon={Activity} />
)}
```

### 2. 路由權限控制
```typescript
// 事件頁面路由配置
{
  path: "/admin/events",
  element: (
    <RequireRoles allow={['dev_admin']}>
      <AdminEventsPage />
    </RequireRoles>
  ),
  errorElement: <RouteError />,
}
```

### 3. 導航配置
```typescript
// dev_admin 導航配置
dev_admin: [
  { to: '/', label: '首頁', icon: Home },
  { to: '/boards', label: '貼文', icon: Newspaper },
  { to: '/admin', label: '後台', icon: LayoutDashboard },
  { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
  { to: '/admin/events', label: '事件', icon: Activity }, // 保留事件
  { to: '/settings/admin', label: '設定', icon: Settings },
]

// 其他管理員導航配置
campus_admin: [
  { to: '/', label: '首頁', icon: Home },
  { to: '/boards', label: '貼文', icon: Newspaper },
  { to: '/admin', label: '後台', icon: LayoutDashboard },
  { to: '/admin/chat', label: '聊天', icon: MessageSquareDot },
  { to: '/support', label: '支援', icon: LifeBuoy }, // 改為支援
  { to: '/settings/admin', label: '設定', icon: Settings },
]
```

## 測試建議

### 1. 權限測試
- 測試 dev_admin 可以正常訪問事件頁面
- 測試其他管理員角色無法訪問事件頁面
- 測試未登入用戶無法訪問事件頁面

### 2. 導航測試
- 測試不同角色的 NavBar 顯示正確的項目
- 測試手機版導航的更多選單顯示正確的選項
- 測試後台主控台只對 dev_admin 顯示事件記錄卡片

### 3. 路由測試
- 測試直接訪問 `/admin/events` 的權限控制
- 測試從其他頁面導航到事件頁面的行為
- 測試權限不足時的錯誤頁面顯示

## 部署注意事項

### 1. 前端部署
- 確保新的導航配置正確載入
- 檢查條件渲染邏輯正常工作
- 驗證路由權限控制生效

### 2. 用戶體驗
- 通知管理員關於事件頁面訪問權限的變更
- 確保支援頁面功能完整可用
- 檢查 NavBar 在不同螢幕尺寸下的顯示效果

## 總結

本次改進成功實現了：

1. **權限控制優化**: 只有 dev_admin 可以訪問事件頁面
2. **NavBar 長度控制**: 避免非 dev_admin 的 NavBar 過長
3. **用戶體驗提升**: 每個角色看到最相關的功能
4. **功能聚焦**: 讓管理員專注於其職責範圍內的工作

這些改進讓系統的權限控制更加清晰，用戶體驗更加友好，同時保持了功能的完整性和安全性。
