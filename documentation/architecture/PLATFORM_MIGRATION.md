# 平台架構遷移指南

## 概述

ForumKit 現在採用全新的平台架構，實現了清晰的電腦與手機專用界面分離，然後各自進行響應式優化。

## 架構變更

### 舊架構問題
- 混合使用 `isMobile`、`isSmallScreen` 等狀態
- 響應式檢測邏輯分散在各個組件中
- 平台特定樣式缺乏統一管理
- 界面分離不夠清晰

### 新架構優勢
- **統一平台檢測**：使用 `usePlatform()` Hook
- **清晰界面分離**：電腦、平板、手機專用組件
- **統一樣式系統**：平台特定的 CSS 類別
- **響應式優化**：每個平台內部再進行響應式調整

## 核心組件

### 1. 平台檢測 Hook

```typescript
import { usePlatform } from '@/hooks/usePlatform'

function MyComponent() {
  const { isMobile, isTablet, isDesktop, deviceType } = usePlatform()
  
  // 使用平台資訊
  return (
    <div>
      {isMobile && <MobileContent />}
      {isDesktop && <DesktopContent />}
    </div>
  )
}
```

### 2. 平台特定佈局

```typescript
import { PlatformPageLayout, MobileLayout, DesktopLayout } from '@/components/layout/PlatformPageLayout'

// 統一佈局
<PlatformPageLayout pathname="/example">
  <MobileLayout>
    <MobileContent />
  </MobileLayout>
  <DesktopLayout>
    <DesktopContent />
  </DesktopLayout>
</PlatformPageLayout>
```

### 3. 響應式容器

```typescript
import { ResponsiveContainer } from '@/components/layout/PlatformLayout'

<ResponsiveContainer 
  className="base-class"
  mobileClassName="mobile-specific-class"
  desktopClassName="desktop-specific-class"
>
  {children}
</ResponsiveContainer>
```

## 遷移步驟

### 步驟 1：更新導入

```typescript
// 舊方式
import { useEffect, useState } from 'react'

// 新方式
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformPageLayout, MobileLayout, DesktopLayout } from '@/components/layout/PlatformPageLayout'
```

### 步驟 2：替換平台檢測

```typescript
// 舊方式
const [isMobile, setIsMobile] = useState(false)
useEffect(() => {
  const checkMobile = () => setIsMobile(window.innerWidth < 768)
  checkMobile()
  window.addEventListener('resize', checkMobile)
  return () => window.removeEventListener('resize', checkMobile)
}, [])

// 新方式
const { isMobile, isDesktop, deviceType } = usePlatform()
```

### 步驟 3：使用平台特定佈局

```typescript
// 舊方式
if (isMobile) {
  return <MobileComponent />
}
return <DesktopComponent />

// 新方式
<PlatformPageLayout pathname="/example">
  <MobileLayout>
    <MobileComponent />
  </MobileLayout>
  <DesktopLayout>
    <DesktopComponent />
  </DesktopLayout>
</PlatformPageLayout>
```

### 步驟 4：應用平台特定樣式

```typescript
// 舊方式
className={`base-class ${isMobile ? 'mobile-class' : 'desktop-class'}`}

// 新方式
className="platform-mobile-button platform-desktop-button"
// 或使用 ResponsiveContainer
<ResponsiveContainer 
  mobileClassName="platform-mobile-container"
  desktopClassName="platform-desktop-container"
>
  {children}
</ResponsiveContainer>
```

## 樣式系統

### 平台特定 CSS 類別

#### 手機平台 (≤768px)
- `.platform-mobile-container`
- `.platform-mobile-button`
- `.platform-mobile-input`
- `.platform-mobile-text-sm/base/lg`
- `.platform-mobile-gap-sm/base/lg`

#### 平板平台 (769px-1024px)
- `.platform-tablet-container`
- `.platform-tablet-button`
- `.platform-tablet-input`
- `.platform-tablet-text-sm/base/lg`
- `.platform-tablet-gap-sm/base/lg`

#### 桌面平台 (≥1025px)
- `.platform-desktop-container`
- `.platform-desktop-button`
- `.platform-desktop-input`
- `.platform-desktop-text-sm/base/lg`
- `.platform-desktop-gap-sm/base/lg`

### 使用示例

```css
/* 自動根據平台應用樣式 */
.my-button {
  @apply platform-mobile-button platform-desktop-button;
}

.my-container {
  @apply platform-mobile-container platform-desktop-container;
}
```

## 頁面遷移示例

### 舊的 BoardsPage.tsx

```typescript
export default function BoardsPage() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (isMobile) {
    return (
      <PageLayout pathname="/boards">
        <MobilePostList />
      </PageLayout>
    )
  }

  return (
    <PageLayout pathname="/boards" maxWidth="max-w-5xl">
      <PostList />
    </PageLayout>
  )
}
```

### 新的 BoardsPage.tsx

```typescript
export default function BoardsPage() {
  return (
    <PlatformPageLayout 
      pathname="/boards"
      mobileMaxWidth="max-w-full"
      desktopMaxWidth="max-w-5xl"
    >
      <MobileLayout>
        <MobilePostList />
      </MobileLayout>
      <DesktopLayout>
        <PostList />
      </DesktopLayout>
    </PlatformPageLayout>
  )
}
```

## 最佳實踐

### 1. 優先使用平台特定組件

```typescript
// ✅ 推薦：使用平台特定佈局
<PlatformPageLayout pathname="/example">
  <MobileLayout>
    <MobileComponent />
  </MobileLayout>
  <DesktopLayout>
    <DesktopComponent />
  </DesktopLayout>
</PlatformPageLayout>

// ❌ 避免：條件渲染
{isMobile ? <MobileComponent /> : <DesktopComponent />}
```

### 2. 使用平台特定樣式

```typescript
// ✅ 推薦：使用平台特定 CSS 類別
<button className="platform-mobile-button platform-desktop-button">
  按鈕
</button>

// ❌ 避免：條件樣式
<button className={`button ${isMobile ? 'mobile' : 'desktop'}`}>
  按鈕
</button>
```

### 3. 響應式容器

```typescript
// ✅ 推薦：使用 ResponsiveContainer
<ResponsiveContainer 
  mobileClassName="platform-mobile-container"
  desktopClassName="platform-desktop-container"
>
  {children}
</ResponsiveContainer>
```

## 測試指南

### 1. 平台檢測測試

訪問 `/platform-example` 頁面查看：
- 設備類型檢測
- 螢幕尺寸顯示
- 平台狀態指示

### 2. 響應式測試

在不同設備上測試：
- 手機 (≤768px)
- 平板 (769px-1024px)
- 桌面 (≥1025px)

### 3. 樣式測試

檢查平台特定樣式是否正確應用：
- 間距和圓角
- 文字大小
- 按鈕尺寸

## 常見問題

### Q: 如何處理平板設備？
A: 使用 `TabletLayout` 組件或檢查 `isTablet` 狀態。

### Q: 如何自定義平台斷點？
A: 修改 `PLATFORM_BREAKPOINTS` 常量。

### Q: 如何添加新的平台特定樣式？
A: 在 `platform.css` 中添加新的 CSS 類別。

### Q: 如何處理橫屏模式？
A: 使用 `orientation` 屬性檢測方向。

## 總結

新的平台架構提供了：
- **清晰的界面分離**：電腦、平板、手機專用界面
- **統一的平台檢測**：使用 `usePlatform()` Hook
- **系統化的樣式管理**：平台特定的 CSS 類別
- **更好的開發體驗**：減少重複代碼，提高可維護性

通過遵循這個遷移指南，您可以輕鬆地將現有頁面遷移到新的平台架構，並享受更好的開發體驗和用戶體驗。
