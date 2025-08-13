# ForumKit SMTP 郵件設定

## 概述

ForumKit 的意見回饋和顏色搭配器功能需要 SMTP 設定才能正常發送郵件。如果沒有設定 SMTP，系統會進入 "dry-run" 模式，只記錄內容而不實際發送郵件。

## 環境變數設定

在 `docker-compose.yml` 的 `backend` 服務中添加以下環境變數：

```yaml
backend:
  build: ./backend
  environment:
    # 現有設定...
    FLASK_ENV: production
    SECRET_KEY: change-me
    APP_MODE: dev
    FORUMKIT_DB: sqlite:////data/forumkit.db
    JWT_SECRET_KEY: change-me
    ADMIN_PASSWORD: change-me-strong
    REDIS_URL: redis://redis:6379/0
    MAINT_ALLOWLIST: 127.0.0.1
    
    # SMTP 郵件設定
    SMTP_HOST: smtp.gmail.com
    SMTP_PORT: 587
    SMTP_USER: your-email@gmail.com
    SMTP_PASSWORD: your-app-password
    SMTP_FROM: your-email@gmail.com
    REPORT_TO: zengcode0315@gmail.com
```

## Gmail SMTP 設定

### 1. 啟用兩步驟驗證
1. 登入 Google 帳戶
2. 前往 [安全性設定](https://myaccount.google.com/security)
3. 啟用「兩步驟驗證」

### 2. 生成應用程式密碼
1. 在安全性設定中找到「應用程式密碼」
2. 選擇「郵件」和「其他（自訂名稱）」
3. 輸入名稱（例如：ForumKit）
4. 複製生成的 16 位元密碼

### 3. 設定環境變數
```yaml
SMTP_HOST: smtp.gmail.com
SMTP_PORT: 587
SMTP_USER: your-email@gmail.com
SMTP_PASSWORD: your-16-digit-app-password
SMTP_FROM: your-email@gmail.com
REPORT_TO: zengcode0315@gmail.com
```

## 其他郵件服務商

### Outlook/Hotmail
```yaml
SMTP_HOST: smtp-mail.outlook.com
SMTP_PORT: 587
```

### Yahoo Mail
```yaml
SMTP_HOST: smtp.mail.yahoo.com
SMTP_PORT: 587
```

### 自架 SMTP 伺服器
```yaml
SMTP_HOST: your-smtp-server.com
SMTP_PORT: 587
```

## 測試郵件功能

設定完成後，重新啟動 Docker 容器：

```bash
docker-compose down
docker-compose up -d
```

然後測試：
1. 在開發模式中提交顏色搭配方案
2. 提交意見回饋
3. 檢查指定的收件信箱是否收到郵件

## 除錯

如果郵件無法發送，檢查：

1. **Docker 日誌**：
   ```bash
   docker-compose logs backend
   ```

2. **常見錯誤**：
   - `Authentication failed`: 檢查 SMTP_USER 和 SMTP_PASSWORD
   - `Connection refused`: 檢查 SMTP_HOST 和 SMTP_PORT
   - `SSL/TLS error`: 確保使用正確的埠口（587 或 465）

3. **Gmail 特定問題**：
   - 確保已啟用兩步驟驗證
   - 使用應用程式密碼而非帳戶密碼
   - 檢查 Gmail 的安全性設定

## 安全注意事項

1. **不要將密碼提交到版本控制**：
   - 使用 `.env` 文件
   - 將 `.env` 加入 `.gitignore`

2. **使用應用程式密碼**：
   - 不要使用主要帳戶密碼
   - 定期更換應用程式密碼

3. **限制郵件權限**：
   - 只允許發送到指定的收件信箱
   - 監控郵件發送記錄

## 範例 .env 文件

創建 `backend/.env` 文件：

```env
# SMTP 設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
REPORT_TO=zengcode0315@gmail.com

# 其他設定
FLASK_ENV=production
SECRET_KEY=your-secret-key
APP_MODE=dev
```

然後在 `docker-compose.yml` 中引用：

```yaml
backend:
  build: ./backend
  env_file:
    - ./backend/.env
``` 