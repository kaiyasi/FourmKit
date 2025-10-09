# ForumKit 安全性指南

> **Serelix Studio 開發的校園匿名討論平台安全性文檔**

## 🔒 安全性特性

### 已實施的安全措施

#### 1. **後端安全性**
- ✅ 強制 SECRET_KEY 設定（生產環境）
- ✅ CORS 來源限制（不允許 `*`）
- ✅ Socket.IO 來源限制
- ✅ 輸入驗證與長度限制
- ✅ 顏色格式驗證（防 XSS）
- ✅ 錯誤處理統一化

#### 2. **前端安全性**
- ✅ CSP (Content Security Policy) 設定
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection 啟用
- ✅ Referrer-Policy 限制
- ✅ Permissions-Policy 設定

#### 3. **網路安全性**
- ✅ Nginx 速率限制（API: 30req/min, 一般: 60req/min）
- ✅ 隱藏伺服器版本資訊
- ✅ 靜態檔案快取設定
- ✅ 反向代理安全標頭

#### 4. **容器安全性**
- ✅ 最小權限原則（cap_drop: ALL）
- ✅ 必要權限白名單（CHOWN, SETGID, SETUID）
- ✅ tmpfs 安全掛載
- ✅ 唯讀檔案系統（部分）

## 🚨 安全性最佳實踐

### 部署前檢查清單

#### 環境變數安全
- [ ] 設定強密鑰 `SECRET_KEY`（至少 32 字元）
- [ ] 設定強密鑰 `JWT_SECRET_KEY`
- [ ] 設定安全的 `ADMIN_PASSWORD`
- [ ] 設定正確的 `ALLOWED_ORIGINS`
- [ ] 更改預設資料庫密碼

#### 網路安全
- [ ] 使用 HTTPS（建議透過 Cloudflare 或 Let's Encrypt）
- [ ] 設定防火牆規則
- [ ] 定期更新 SSL 憑證
- [ ] 限制管理員 IP 存取

#### 容器安全
- [ ] 定期更新基底映像
- [ ] 掃描容器漏洞
- [ ] 設定日誌監控
- [ ] 備份重要資料

### 推薦的生產環境設定

#### 1. 反向代理（Cloudflare + Nginx）
```nginx
# 在 Cloudflare 後方額外加強
real_ip_header CF-Connecting-IP;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
# ... 其他 Cloudflare IP 範圍
```

#### 2. 環境變數範例
```bash
# 生產環境設定
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -base64 24)
ALLOWED_ORIGINS=https://forum.serelix.xyz
```

#### 3. 資料庫安全
```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: $(openssl rand -base64 32)
    POSTGRES_USER: forumkit_$(openssl rand -hex 4)
```

## 🔍 安全性監控

### 日誌監控重點
- 異常 API 呼叫頻率
- 失敗的登入嘗試
- 大量 4xx/5xx 錯誤
- 不正常的 User-Agent

### 定期檢查項目
- [ ] 檢查依賴套件漏洞
- [ ] 審核存取日誌
- [ ] 驗證 CORS 設定
- [ ] 測試速率限制
- [ ] 檢查 CSP 違規日誌

## 🚨 已知風險與緩解

### 中等風險
1. **Socket.IO 開放連線**
   - 風險：潛在 DoS 攻擊
   - 緩解：已實施速率限制與來源限制

2. **檔案上傳功能**
   - 風險：目前未實施
   - 計畫：未來需加入檔案類型驗證

### 低風險
1. **開發模式洩露**
   - 風險：除錯資訊洩露
   - 緩解：已移除生產環境除錯日誌

## 📞 安全事件回應

### 發現漏洞時
1. 立即評估影響範圍
2. 暫時停用受影響功能
3. 修補漏洞
4. 通知使用者（如必要）
5. 事後檢討與改進

### 聯絡方式
- 安全問題回報：[建立 GitHub Issue]
- 緊急事件：[Discord 伺服器]

---

**注意：** 這是開源專案，歡迎安全研究人員協助改進。請負責任地披露發現的漏洞。
