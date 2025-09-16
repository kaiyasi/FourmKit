# Instagram Graph API 快速設定指南

## 🚀 5分鐘設定流程

### 步驟 1: 準備 Instagram 帳號（2分鐘）

1. **轉換為 Business 帳號**
   - 開啟 Instagram App
   - 設定 → 帳號 → 切換到專業帳號
   - 選擇「商業」

2. **連接 Facebook 粉絲專頁**
   - 在 Instagram 中選擇「連接 Facebook 粉絲專頁」
   - 選擇或創建一個粉絲專頁

### 步驟 2: 獲取 Access Token（2分鐘）

1. **前往 Facebook Graph API Explorer**
   ```
   https://developers.facebook.com/tools/explorer/
   ```

2. **設定權限**
   ```
   pages_show_list
   pages_manage_posts
   instagram_basic
   instagram_content_publish
   ```

3. **生成 Token**
   - 點擊「Generate Access Token」
   - 登入並授權
   - 複製長期 Token

### 步驟 3: 更新 ForumKit（1分鐘）

1. **在管理後台更新 Token**
   - 前往 Instagram 管理頁面
   - 點擊「更新 Token」
   - 貼上新的 Facebook User Access Token

2. **驗證設定**
   - 點擊「驗證帳號」
   - 確認狀態顯示為「活躍」

## ✅ 設定完成！

現在可以正常使用 Instagram 自動發布功能了。

## 🔧 除錯命令

如遇問題，執行：
```bash
docker exec forumkit-backend python3 fix_instagram_tokens.py
```

## 📞 需要協助？

- 查看完整文檔：`instagram_graph_api_migration.md`
- 檢查系統日誌：`docker logs forumkit-backend`