# 通知系統重新設計

## 問題描述

原通知系統存在以下問題：
1. **常駐顯示1**：不管有無通知都會常駐顯示1
2. **10秒倒計時**：新增通知應該在10秒後變為紅點
3. **已讀處理**：點開或標已讀後不應該再顯示數字
4. **NavBar顯示**：通知數量顯示為黑底黑字，需要配合主題系統

## 解決方案

### 1. 核心邏輯改進

#### `useNotifications` Hook 修改
- 新增 `showCount` 狀態：控制是否顯示數字徽章
- 新增 `lastNotificationTime` 狀態：記錄最後通知時間
- 實現10秒倒計時邏輯：新通知顯示數字，10秒後變為紅點
- 已讀處理：標記已讀後立即隱藏數字徽章

#### 通知狀態管理
```typescript
interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  showBadge: boolean
  showCount: boolean // 是否顯示數字徽章
  lastNotificationTime: number // 最後通知時間
}
```

### 2. UI 組件改進

#### NotificationButton 組件
- **數字徽章**：使用主題色 `bg-primary text-primary-foreground`
- **紅點徽章**：保持紅色 `bg-red-500`
- **動畫效果**：數字徽章時顯示呼吸光暈
- **條件顯示**：只在 `showCount && unreadCount > 0` 時顯示數字

#### NotificationCount 組件（新增）
- 在 NavBar 中顯示通知數量
- 配合主題系統使用 `bg-primary text-primary-foreground`
- 只在有未讀通知且處於數字顯示模式時顯示

### 3. 用戶體驗流程

#### 新通知流程
1. **收到通知** → 顯示數字徽章（主題色）
2. **10秒後** → 自動變為紅點
3. **點擊通知中心** → 標記已讀，隱藏數字
4. **標記已讀** → 立即隱藏數字徽章

#### 視覺反饋
- **數字徽章**：圓形背景，主題色，顯示具體數量
- **紅點徽章**：小圓點，紅色，表示有未讀通知
- **動畫效果**：數字徽章時有呼吸光暈效果

### 4. 主題系統整合

#### 顏色配置
- **數字徽章**：`bg-primary text-primary-foreground`
- **NavBar數量**：`bg-primary text-primary-foreground`
- **紅點徽章**：`bg-red-500`（保持固定）

#### 響應式設計
- 支持不同尺寸：`sm`、`md`、`lg`
- 移動端適配：在 MobileBottomNav 中使用 NotificationBadge

### 5. 技術實現

#### 狀態管理
```typescript
// 新增通知時
setState(prev => ({
  ...prev,
  showCount: true, // 顯示數字徽章
  lastNotificationTime: now
}))

// 10秒後自動變為紅點
setTimeout(() => {
  setState(prev => ({
    ...prev,
    showCount: false
  }))
}, 10000)

// 標記已讀時
setState(prev => ({
  ...prev,
  showCount: false // 隱藏數字徽章
}))
```

#### 條件渲染
```typescript
{showBadge && (
  <div className="absolute -top-1 -right-1">
    {showCount && unreadCount > 0 ? (
      // 顯示數字徽章
      <div className="bg-primary text-primary-foreground">
        {unreadCount}
      </div>
    ) : (
      // 顯示紅點
      <div className="bg-red-500 rounded-full" />
    )}
  </div>
)}
```

## 測試驗證

### 測試腳本
使用 `scripts/test_notification_system.sh` 進行功能測試：

```bash
./scripts/test_notification_system.sh
```

### 驗證項目
1. ✅ 新通知顯示數字徽章（10秒內）
2. ✅ 10秒後自動變為紅點
3. ✅ 點擊通知中心後數字消失
4. ✅ NavBar 中顯示通知數量
5. ✅ 主題系統顏色正確應用
6. ✅ 已讀通知不再顯示數字

## 文件修改清單

### 核心文件
- `frontend/src/hooks/useNotifications.ts` - 通知邏輯核心
- `frontend/src/components/notifications/NotificationButton.tsx` - 通知按鈕
- `frontend/src/components/notifications/NotificationCount.tsx` - 通知數量顯示（新增）
- `frontend/src/components/layout/NavBar.tsx` - 導航欄整合

### 測試文件
- `scripts/test_notification_system.sh` - 功能測試腳本（新增）

### 文檔
- `docs/NOTIFICATION_SYSTEM_REDESIGN.md` - 設計文檔（新增）

## 總結

新的通知系統解決了所有原有問題：
- ✅ 根據實際通知量顯示
- ✅ 10秒倒計時機制
- ✅ 已讀後不再顯示數字
- ✅ 配合主題系統的顏色設計
- ✅ 更好的用戶體驗和視覺反饋
