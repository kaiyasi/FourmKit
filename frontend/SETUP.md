# ForumKit 快速設定

> **Serelix Studio 開發的校園匿名討論平台配置指南**

## Google OAuth（校園帳號）

1. 前往 Google Cloud Console 建立 OAuth 2.0 Client（Web application）。
2. 在 OAuth 用戶端中新增 Authorized redirect URI：
   - `http://localhost:12005/api/auth/google/callback`
3. 於 `.env` 新增（或覆寫）下列變數並填入：
```
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URL=http://localhost:12005/api/auth/google/callback
```
4. 重新啟動服務後，前往 `http://localhost:12005/auth` 點選「使用 Google 校園帳號登入」。
   - 非校園帳號（如 gmail.com）會被拒絕（403）。
   - 首次來自新校園網域登入時，系統會自動建立暫存學校，並（若設定 `ADMIN_NOTIFY_WEBHOOK`）發送「SchoolOnboarding」通知。

### 後台通知 Webhook（統一端口）

將後台所有通知（問題回報、主題提案、學校入駐等）統一送到一個 Webhook：

```
ADMIN_NOTIFY_WEBHOOK=https://discord.com/api/webhooks/xxx
```

系統會依事件類型套用不同作者/頁尾/顏色的 Discord embed。

## Discord Webhook 設定

### 1. 建立 Discord Webhook

1. 在您的 Discord 伺服器中，前往頻道設定
2. 選擇「整合」→「Webhook」
3. 點擊「新增 Webhook」
4. 設定名稱（例如：ForumKit 回饋）
5. 複製 Webhook URL

### 2. 設定環境變數

在 `docker-compose.yml` 中設定：

```yaml
backend:
  environment:
    # Discord Webhook 設定
    DISCORD_THEME_WEBHOOK: https://discord.com/api/webhooks/your-theme-webhook-url
    DISCORD_REPORT_WEBHOOK: https://discord.com/api/webhooks/your-report-webhook-url
```

### 3. 重新啟動服務

```bash
docker-compose down
docker-compose up -d
```

### 4. 測試功能

1. 訪問開發模式：`http://localhost:12005/mode`
2. 選擇 "development" 模式
3. 測試顏色搭配器或意見回饋功能
4. 檢查 Discord 頻道是否收到訊息

## 注意事項

- 如果未設定 Webhook，系統會顯示「已記錄（未設定 Discord）」訊息
- 所有提交內容仍會記錄在後端日誌中
- 建議為不同功能建立不同的 Webhook 以便管理
