# PageLayout 組件使用說明

## 概述

`PageLayout` 是一個統一的頁面佈局組件，用於確保所有頁面都有正確的 NavBar 留白，避免手機版 NavBar 擋住頁面內容。

## 功能

- 自動添加 NavBar 和 MobileBottomNav
- 為手機版提供正確的頂部留白 (88px)
- 響應式設計，適配不同螢幕尺寸
- 統一的頁面結構和樣式

## 使用方法

### 基本用法

```tsx
import { PageLayout } from '@/components/layout/PageLayout'

export default function MyPage() {
  return (
    <PageLayout pathname="/my-page">
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h1>我的頁面內容</h1>
        <p>這裡是頁面的主要內容...</p>
      </div>
    </PageLayout>
  )
}
```

### 自定義最大寬度

```tsx
<PageLayout pathname="/admin" maxWidth="max-w-6xl">
  {/* 管理員頁面內容 */}
</PageLayout>
```

### 添加自定義樣式

```tsx
<PageLayout 
  pathname="/settings" 
  maxWidth="max-w-4xl"
  className="bg-gradient-to-br from-blue-50 to-indigo-100"
>
  {/* 設定頁面內容 */}
</PageLayout>
```

## 參數說明

- `pathname`: 當前頁面路徑，用於 NavBar 高亮顯示
- `maxWidth`: 頁面最大寬度 (預設: "max-w-4xl")
- `className`: 額外的 CSS 類名

## 遷移指南

### 從舊佈局遷移

**舊方式:**
```tsx
<div className="min-h-screen">
  <NavBar pathname="/page" />
  <MobileBottomNav />
  <main className="mx-auto max-w-4xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-24 md:pb-8">
    {/* 頁面內容 */}
  </main>
</div>
```

**新方式:**
```tsx
<PageLayout pathname="/page">
  {/* 頁面內容 */}
</PageLayout>
```

## 注意事項

1. 手機版會自動應用 `mobile-navbar-spacing` 類，提供 88px 的頂部留白
2. 桌面版保持原有的響應式留白設置
3. 所有頁面內容都應該放在 PageLayout 內部
4. 不需要手動添加 NavBar 或 MobileBottomNav
