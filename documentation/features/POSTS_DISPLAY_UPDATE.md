# 貼文顯示功能更新

## 修改目標

根據用戶需求，實現以下功能：
- **首頁**：只顯示最新的 10 則貼文（分頁顯示）
- **看板頁面**：顯示所有貼文（不分頁）

## 修改內容

### 1. 前端組件修改

#### PostList.tsx
- 添加 `showAll` 屬性（預設為 `false`）
- 當 `showAll=true` 時，`perPage` 設為 1000（顯示大量貼文）
- 當 `showAll=false` 時，`perPage` 設為 10（分頁顯示）

#### MobilePostList.tsx
- 添加 `showAll` 屬性（預設為 `false`）
- 當 `showAll=true` 時，`perPage` 設為 1000
- 當 `showAll=false` 時，`perPage` 設為 15

#### BoardsPage.tsx
- 修改看板頁面，設置 `showAll={true}`
- 桌面版和手機版都啟用全部顯示模式

### 2. 後端 API 修改

#### routes_posts.py
- 修改 `/api/posts/list` 的 `limit` 最大值從 100 增加到 1000
- 修改 `/api/posts` 的 `per_page` 最大值從 100 增加到 1000

### 3. 新增測試頁面

#### TestPostsPage.tsx
- 創建測試頁面，同時展示首頁樣式和看板樣式
- 方便比較兩種顯示模式的差異

## 使用方式

### 首頁（分頁顯示）
```tsx
<PostList showAll={false} />  // 預設值，可省略
<MobilePostList showAll={false} />
```

### 看板頁面（全部顯示）
```tsx
<PostList showAll={true} />
<MobilePostList showAll={true} />
```

## 技術細節

### 分頁邏輯
- **首頁模式**：每次載入 10/15 則貼文，支援無限滾動載入更多
- **看板模式**：一次載入最多 1000 則貼文，基本涵蓋所有內容

### 性能考量
- 1000 則貼文的限制是為了避免過大的 API 響應
- 如果需要顯示更多貼文，可以進一步調整限制或實現虛擬滾動

### 向後相容性
- 所有現有頁面保持不變
- 新增的 `showAll` 屬性有預設值，不會影響現有功能

## 測試建議

1. 訪問首頁，確認只顯示最新 10 則貼文
2. 訪問看板頁面，確認顯示所有貼文
3. 訪問測試頁面 `/test-posts`，比較兩種模式的差異
4. 測試手機版和桌面版的響應式效果

## 未來改進

1. **虛擬滾動**：對於大量貼文，可以實現虛擬滾動來提升性能
2. **動態載入**：可以根據用戶滾動位置動態載入更多貼文
3. **快取機制**：實現貼文快取來減少 API 請求
