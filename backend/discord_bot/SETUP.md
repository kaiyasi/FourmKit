# ForumKit Discord Bot 設定指南

## 1. 建立 Discord 應用程式和 Bot

### 步驟 A: 前往 Discord Developer Portal
1. 前往 https://discord.com/developers/applications
2. 點擊 "New Application"
3. 輸入應用程式名稱（如："ForumKit Bot"）

### 步驟 B: 建立 Bot
1. 在左側選單點擊 "Bot"
2. 點擊 "Add Bot"
3. 複製 "Token"（這就是您的 `DISCORD_BOT_TOKEN`）

### 步驟 C: 設定 Bot 權限
在 "Bot" 頁面中，啟用以下設定：
- ✅ Message Content Intent
- ✅ Server Members Intent
- ✅ Presence Intent

## 2. 環境設定

### 步驟 A: 複製環境變數檔案
```bash
cp .env.discord .env
```

### 步驟 B: 編輯 .env 檔案
填入以下必要資訊：
```env
DISCORD_BOT_TOKEN=您的機器人Token
DISCORD_OWNER_IDS=您的Discord用戶ID
DATABASE_URL=您的資料庫連接字串
REDIS_URL=redis://localhost:6379/1
DISCORD_ENCRYPTION_KEY=32個字元的加密密鑰
```

#### 如何取得您的 Discord 用戶 ID：
1. 在 Discord 中啟用開發者模式（用戶設定 > 進階 > 開發者模式）
2. 右鍵點擊您的用戶名，選擇 "複製 ID"

#### 產生加密密鑰：
```python
from cryptography.fernet import Fernet
key = Fernet.generate_key()
print(key.decode())
```

## 3. 資料庫初始化

```bash
# 啟動虛擬環境
source discord_bot_env/bin/activate

# 初始化資料庫
python discord_bot/init_db.py
```

## 4. 啟動機器人

```bash
# 啟動虛擬環境（如果尚未啟動）
source discord_bot_env/bin/activate

# 啟動機器人
python discord_bot/run_bot.py
```

## 5. 邀請機器人到伺服器

### 步驟 A: 產生邀請連結
1. 回到 Discord Developer Portal
2. 選擇您的應用程式
3. 點擊左側的 "OAuth2" > "URL Generator"
4. 在 "SCOPES" 中選擇：
   - ✅ bot
   - ✅ applications.commands
5. 在 "BOT PERMISSIONS" 中選擇：
   - ✅ Send Messages
   - ✅ Use Slash Commands
   - ✅ Read Message History
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Mention Everyone
   - ✅ Add Reactions

### 步驟 B: 使用邀請連結
1. 複製產生的 URL
2. 在瀏覽器中開啟該 URL
3. 選擇要邀請機器人的伺服器
4. 點擊 "授權"

## 6. 測試機器人

在 Discord 中輸入以下指令來測試：

```
!fk ping
!fk help
!fk status
```

## 常見問題

### Q: 機器人沒有回應
A: 檢查：
1. Bot Token 是否正確
2. 機器人是否有訊息權限
3. 是否啟用了 Message Content Intent

### Q: 斜線指令不顯示
A: 執行以下指令同步命令：
```
!fk sync
```

### Q: 權限錯誤
A: 確認：
1. 您的 Discord ID 在 DISCORD_OWNER_IDS 中
2. 機器人在伺服器中有適當的權限角色

## 7. 生產環境部署

### 使用 systemd 服務（推薦）

1. 建立服務檔案：
```bash
sudo nano /etc/systemd/system/forumkit-discord-bot.service
```

2. 內容：
```ini
[Unit]
Description=ForumKit Discord Bot
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/ForumKit/backend
Environment=PATH=/path/to/ForumKit/backend/discord_bot_env/bin
ExecStart=/path/to/ForumKit/backend/discord_bot_env/bin/python discord_bot/run_bot.py
Restart=always

[Install]
WantedBy=multi-user.target
```

3. 啟用服務：
```bash
sudo systemctl daemon-reload
sudo systemctl enable forumkit-discord-bot
sudo systemctl start forumkit-discord-bot
```

### 使用 Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY discord_bot/requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["python", "discord_bot/run_bot.py"]
```