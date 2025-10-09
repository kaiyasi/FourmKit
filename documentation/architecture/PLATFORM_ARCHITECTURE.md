# ForumKit 平台架構設計

## 架構概述

ForumKit 採用全新的平台架構，實現了清晰的電腦與手機專用界面分離，然後各自進行響應式優化。

## 架構特點

### 1. 清晰的界面分離
- **電腦專用界面**：針對桌面設備優化，使用滑鼠和鍵盤操作
- **手機專用界面**：針對觸控設備優化，使用手勢和觸控操作
- **平板專用界面**：針對中等尺寸觸控設備優化

### 2. 統一的平台檢測
- 使用 `usePlatform()` Hook 統一管理平台檢測
- 支援設備類型、螢幕尺寸、方向、觸控能力檢測
- 自動響應視窗大小和方向變化

### 3. 系統化的樣式管理
- 平台特定的 CSS 類別系統
- 自動根據設備類型應用不同樣式
- 支援響應式容器和自適應佈局

## 核心組件

### 1. 平台檢測 Hook (`usePlatform`)

```typescript
interface PlatformInfo {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isSmallScreen: boolean
  isTinyScreen: boolean
  screenWidth: number
  screenHeight: number
  orientation: 'portrait' | 'landscape'
  deviceType: 'mobile' | 'tablet' | 'desktop'
  userAgent: string
  isTouchDevice: boolean
}
```

### 2. 平台特定佈局組件

#### PlatformPageLayout
- 統一的頁面佈局組件
- 自動根據平台選擇合適的樣式
- 支援自定義最大寬度和樣式

#### MobileLayout / DesktopLayout / TabletLayout
- 平台專用的佈局組件
- 只在對應平台顯示內容
- 支援自定義樣式和屬性

#### ResponsiveContainer
- 響應式容器組件
- 根據平台自動應用不同樣式
- 支援基礎樣式和平台特定樣式

### 3. 平台特定導航

#### PlatformNavigation
- 統一的導航組件
- 自動顯示對應平台的導航
- 支援自定義導航屬性

## 樣式系統

### 平台斷點
- **手機**：≤768px
- **平板**：769px-1024px
- **桌面**：≥1025px

### CSS 類別系統

#### 手機平台樣式
```css
.platform-mobile-container
.platform-mobile-button
.platform-mobile-input
.platform-mobile-text-sm/base/lg
.platform-mobile-gap-sm/base/lg
```

#### 平板平台樣式
```css
.platform-tablet-container
.platform-tablet-button
.platform-tablet-input
.platform-tablet-text-sm/base/lg
.platform-tablet-gap-sm/base/lg
```

#### 桌面平台樣式
```css
.platform-desktop-container
.platform-desktop-button
.platform-desktop-input
.platform-desktop-text-sm/base/lg
.platform-desktop-gap-sm/base/lg
```

## 使用方式

### 基本使用

```typescript
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformPageLayout, MobileLayout, DesktopLayout } from '@/components/layout/PlatformPageLayout'

export default function MyPage() {
  const { isMobile, isDesktop } = usePlatform()
  
  return (
    <PlatformPageLayout pathname="/my-page">
      <MobileLayout>
        <MobileComponent />
      </MobileLayout>
      <DesktopLayout>
        <DesktopComponent />
      </DesktopLayout>
    </PlatformPageLayout>
  )
}
```

### 響應式容器

```typescript
import { ResponsiveContainer } from '@/components/layout/PlatformLayout'

<ResponsiveContainer 
  className="base-class"
  mobileClassName="platform-mobile-container"
  desktopClassName="platform-desktop-container"
>
  {children}
</ResponsiveContainer>
```

### 平台特定樣式

```typescript
// 自動根據平台應用樣式
<button className="platform-mobile-button platform-desktop-button">
  按鈕
</button>
```

## 架構優勢

### 1. 開發效率
- **統一平台檢測**：減少重複的平台檢測代碼
- **清晰組件分離**：每個平台有專用的組件和樣式
- **系統化樣式**：使用預定義的 CSS 類別

### 2. 維護性
- **模組化設計**：平台特定代碼分離，易於維護
- **統一樣式系統**：減少樣式衝突和不一致
- **清晰的架構**：容易理解和擴展

### 3. 用戶體驗
- **平台優化**：每個平台都有最佳的用戶體驗
- **響應式設計**：在平台內部再進行響應式調整
- **性能優化**：只載入需要的組件和樣式

### 4. 擴展性
- **易於添加新平台**：可以輕鬆添加新的設備類型
- **靈活的樣式系統**：可以自定義平台特定樣式
- **組件化設計**：可以組合和重用組件

## 遷移策略

### 1. 漸進式遷移
- 新頁面使用新架構
- 舊頁面逐步遷移
- 保持向後兼容

### 2. 組件重用
- 將現有組件改造成平台特定組件
- 使用 ResponsiveContainer 包裝現有組件
- 應用平台特定樣式

### 3. 測試驗證
- 在不同設備上測試
- 驗證平台檢測準確性
- 檢查樣式應用正確性

## 最佳實踐

### 1. 平台檢測
- 使用 `usePlatform()` Hook 而不是手動檢測
- 避免在組件中重複平台檢測邏輯
- 利用平台資訊進行條件渲染

### 2. 組件設計
- 優先使用平台特定佈局組件
- 避免條件渲染，使用專用組件
- 保持組件的單一職責

### 3. 樣式應用
- 使用平台特定的 CSS 類別
- 避免條件樣式，使用 ResponsiveContainer
- 保持樣式的一致性和可預測性

### 4. 性能優化
- 只載入需要的組件
- 使用 React.memo 優化渲染
- 避免不必要的重新渲染

## 未來發展

### 1. 新平台支援
- 支援更多設備類型（如智能手錶、VR 設備）
- 自定義平台斷點
- 動態平台檢測

### 2. 樣式系統擴展
- 更多平台特定樣式類別
- 主題系統整合
- 動畫和過渡效果

### 3. 開發工具
- 平台檢測調試工具
- 樣式預覽工具
- 自動化測試工具

## 總結

ForumKit 的新平台架構提供了：

- **清晰的界面分離**：電腦、平板、手機專用界面
- **統一的平台檢測**：使用 `usePlatform()` Hook
- **系統化的樣式管理**：平台特定的 CSS 類別
- **更好的開發體驗**：減少重複代碼，提高可維護性
- **優化的用戶體驗**：每個平台都有最佳的交互體驗

這個架構為 ForumKit 提供了堅實的基礎，支援未來的擴展和優化。
