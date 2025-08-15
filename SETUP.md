# ForumKit 快速設定

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
