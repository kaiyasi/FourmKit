# Instagram Graph API 遷移指南

## 📋 概述

由於 Instagram Basic Display API 已於 2024年12月4日正式停用，ForumKit 已完成遷移到 **Instagram Graph API**（企業版）。本文檔提供完整的遷移說明和新的設定流程。

## 🚨 重要變更

### ❌ 停用的功能
- **Instagram Basic Display API** - 完全停用
- **個人 Instagram 帳號** - 不再支援
- **`ig_exchange_token`** - 端點已移除
- **舊的 Token 轉換流程** - 不再可用

### ✅ 新的要求
- **必須使用 Instagram Business 或 Creator 帳號**
- **必須連接到 Facebook 粉絲專頁**
- **使用 Facebook User Access Token**
- **通過 Facebook Login 授權**

## 🏗️ 新架構說明

### API 端點變更
```
舊：https://api.instagram.com/oauth/access_token
新：https://www.facebook.com/v23.0/dialog/oauth

舊：https://graph.instagram.com/access_token (ig_exchange_token)
新：https://graph.facebook.com/v23.0/oauth/access_token (fb_exchange_token)
```

### 授權流程變更
```
舊流程：Instagram 直接授權 → 短期 Token → 轉換長期 Token
新流程：Facebook Login → Facebook User Token → 取得 Page Token → 發布到 Instagram
```

## 🛠️ 設定步驟

### 1. Facebook App 設定

#### 1.1 創建/更新 Facebook App
1. 前往 [Facebook Developers](https://developers.facebook.com/)
2. 創建新應用或選擇現有應用
3. 添加以下產品：
   - **Facebook Login**
   - **Instagram Graph API**

#### 1.2 配置 Instagram Graph API
1. 在 Facebook App 中進入「Instagram Graph API」
2. 添加 Instagram Business 帳號到應用（如需要）
3. 設定權限：
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_content_publish`

### 2. Instagram 帳號設定

#### 2.1 轉換為 Business/Creator 帳號
1. 開啟 Instagram App
2. 前往「設定」→「帳號」
3. 選擇「切換到專業帳號」
4. 選擇「商業」或「創作者」

#### 2.2 連接 Facebook 粉絲專頁
1. 在 Instagram 設定中選擇「專業帳號」
2. 點擊「連接 Facebook 粉絲專頁」
3. 選擇要連接的粉絲專頁
4. 確認連接

### 3. ForumKit 系統設定

#### 3.1 環境變數設定
```bash
# .env 檔案
FACEBOOK_APP_ID=你的_Facebook_App_ID
FACEBOOK_APP_SECRET=你的_Facebook_App_Secret

# 或者使用舊的變數名（系統會自動讀取）
INSTAGRAM_CLIENT_ID=你的_Facebook_App_ID
INSTAGRAM_CLIENT_SECRET=你的_Facebook_App_Secret
```

#### 3.2 獲取新的 Access Token

**方法一：使用 Facebook Graph API Explorer**
1. 前往 [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. 選擇你的 Facebook App
3. 權限設定：
   ```
   pages_show_list
   pages_read_engagement
   pages_manage_posts
   instagram_basic
   instagram_content_publish
   ```
4. 點擊「Generate Access Token」
5. 複製生成的 User Access Token

**方法二：通過系統授權流程**
1. 在 ForumKit 管理後台點擊「Instagram 設定」
2. 點擊「連接 Instagram」
3. 系統會重導向到 Facebook Login
4. 授權後自動返回並配置

## 📝 使用新系統

### 新的 Token 類型
```
Facebook User Access Token
├── 可訪問用戶的所有 Facebook Pages
├── 包含 Instagram Business 帳號的 Pages
└── 有效期：60天（長期 Token）

Page Access Token
├── 特定於某個 Facebook Page
├── 用於發布 Instagram 內容
└── 從 User Token 獲取
```

### 發布流程
```
1. 使用 Facebook User Token 獲取 Pages
2. 找到連接 Instagram 的 Page
3. 獲取該 Page 的 Page Token
4. 使用 Page Token 發布到 Instagram
```

## 🔧 API 變更細節

### 新的服務類別
- `InstagramOAuthService` - 重寫以支援 Facebook Login
- `InstagramPagePublisher` - 已更新至 Graph API v23.0
- Token 驗證邏輯完全重寫

### 主要方法變更
```python
# 舊方法（已移除）
instagram_oauth_service.exchange_manual_token(short_token)

# 新方法
instagram_oauth_service.exchange_code_for_token(auth_code)
instagram_oauth_service.get_user_pages(access_token)
instagram_oauth_service.validate_token(access_token, page_id)
```

## 🚨 常見問題

### Q: 為什麼我的個人 Instagram 帳號無法使用？
A: Instagram Graph API 只支援 Business 和 Creator 帳號。請將個人帳號轉換為專業帳號。

### Q: 我的 Token 一直顯示過期？
A: 請確保：
1. 使用的是 Facebook User Access Token，不是 Instagram Token
2. Token 包含正確的權限
3. Instagram 帳號已連接到 Facebook 粉絲專頁

### Q: 發布失敗怎麼辦？
A: 檢查：
1. Instagram 帳號是否為 Business/Creator
2. 是否連接到 Facebook 粉絲專頁
3. Page Token 是否有效
4. 圖片 URL 是否可公開訪問

### Q: 如何檢查帳號狀態？
A: 使用除錯腳本：
```bash
docker exec forumkit-backend python3 fix_instagram_tokens.py
```

## 📋 檢查清單

遷移完成前請確認：

- [ ] Instagram 帳號已轉換為 Business/Creator
- [ ] Instagram 已連接到 Facebook 粉絲專頁
- [ ] Facebook App 已配置 Instagram Graph API
- [ ] 環境變數已更新
- [ ] 新的 Access Token 已獲取
- [ ] 系統驗證通過
- [ ] 發布測試成功

## 🎯 總結

新的 Instagram Graph API 提供了更穩定和功能豐富的整合方式，雖然設定步驟稍微複雜，但提供了更好的可靠性和更多的功能。

如有問題，請參考除錯腳本或聯繫系統管理員。