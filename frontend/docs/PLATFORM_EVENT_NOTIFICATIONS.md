# 平台事件通知系統

## 概述

本次新增了完整的平台事件通知系統，用於記錄和監控 ForumKit 平台的啟動、關閉和重啟事件。系統會自動記錄平台生命週期事件，並提供管理員手動記錄功能。

## 功能特性

### 1. 自動事件記錄
- **平台啟動**: 應用程序啟動時自動記錄
- **平台關閉**: 應用程序關閉時自動記錄（包括信號處理）
- **運行時間追蹤**: 記錄平台運行時間和啟動時間

### 2. 手動事件記錄
- **管理員重啟記錄**: dev_admin 可以手動記錄重啟事件
- **管理員關閉記錄**: dev_admin 可以手動記錄關閉事件
- **腳本集成**: 重啟腳本自動記錄重啟事件

### 3. 平台狀態監控
- **實時狀態**: 顯示當前平台運行狀態
- **系統資源**: 監控記憶體和 CPU 使用率
- **環境信息**: 顯示 Python 版本和平台信息

## 技術實現

### 1. 事件類型定義

在 `backend/services/event_service.py` 中新增了平台相關事件類型：

```python
# 系統管理
"system.platform_started": {"category": "system", "title": "平台啟動"},
"system.platform_stopped": {"category": "system", "title": "平台關閉"},
"system.platform_restarted": {"category": "system", "title": "平台重啟"},
```

### 2. 平台事件服務

創建了 `backend/services/platform_event_service.py` 來處理平台事件：

#### 主要功能
- **單例模式**: 確保全局只有一個實例
- **信號處理**: 處理 SIGTERM、SIGINT 等信號
- **自動記錄**: 應用程序啟動和關閉時自動記錄事件
- **運行時間追蹤**: 計算平台運行時間

#### 核心方法
```python
def record_platform_started(self, reason: str = "應用程序啟動") -> None
def record_platform_stopped(self, reason: str = "應用程序關閉") -> None
def record_platform_restarted(self, reason: str = "平台重啟") -> None
```

### 3. 應用程序集成

在 `backend/app.py` 的 `create_app()` 函數中集成平台事件記錄：

```python
# 記錄平台啟動事件
try:
    from services.platform_event_service import platform_event_service
    from datetime import datetime
    platform_event_service.set_start_time(datetime.now())
    platform_event_service.record_platform_started(f"應用程序啟動 - 重啟ID: {restart_id}")
    print("[ForumKit] 平台啟動事件已記錄")
except Exception as e:
    print(f"[ForumKit] 記錄平台啟動事件失敗: {e}")
```

### 4. API 端點

在 `backend/routes/routes_admin.py` 中新增了平台事件管理 API：

#### 記錄平台重啟事件
```http
POST /api/admin/platform/restart
Content-Type: application/json
Authorization: Bearer <token>

{
  "reason": "管理員手動重啟"
}
```

#### 記錄平台關閉事件
```http
POST /api/admin/platform/stop
Content-Type: application/json
Authorization: Bearer <token>

{
  "reason": "管理員手動關閉"
}
```

#### 獲取平台狀態
```http
GET /api/admin/platform/status
Authorization: Bearer <token>
```

### 5. 前端界面

創建了 `frontend/src/pages/admin/PlatformStatusPage.tsx` 提供平台狀態管理界面：

#### 功能特性
- **實時狀態顯示**: 進程 ID、運行時間、啟動時間
- **系統資源監控**: 記憶體使用、CPU 使用率
- **環境信息**: Python 版本、平台類型
- **手動操作**: 記錄重啟/關閉事件
- **權限控制**: 僅 dev_admin 可訪問

#### 界面組件
- 基本狀態卡片
- 系統資源卡片
- 環境信息卡片
- 平台操作按鈕

### 6. 腳本集成

修改了 `scripts/prod_maintenance_restart.sh` 腳本，在重啟過程中自動記錄平台重啟事件：

```bash
# STEP 8: 記錄平台重啟事件
step "$ICON_INFO 記錄平台重啟事件"
info "記錄生產環境維護重啟事件..."
if [ "$backend_ready" = "true" ]; then
    # 嘗試記錄重啟事件
    if curl -fsS -X POST "http://localhost:12005/api/admin/platform/restart" \
        -H "Content-Type: application/json" \
        -d '{"reason": "生產環境維護重啟 - 腳本執行"}' >/dev/null 2>&1; then
        success "平台重啟事件已記錄"
    else
        warning "無法記錄平台重啟事件（可能需要管理員權限）"
    fi
else
    warning "後端服務未就緒，跳過事件記錄"
fi
```

## 事件記錄內容

### 平台啟動事件
```json
{
  "event_type": "system.platform_started",
  "title": "平台啟動",
  "description": "平台已啟動 - 應用程序啟動 - 重啟ID: xxx",
  "severity": "low",
  "actor_name": "System",
  "actor_role": "system",
  "target_type": "platform",
  "target_name": "ForumKit Platform",
  "metadata": {
    "startup_reason": "應用程序啟動 - 重啟ID: xxx",
    "startup_time": "2025-01-XX...",
    "process_id": 12345,
    "python_version": "3.12.x"
  },
  "is_important": true
}
```

### 平台關閉事件
```json
{
  "event_type": "system.platform_stopped",
  "title": "平台關閉",
  "description": "平台已關閉 - 應用程序正常關閉",
  "severity": "low",
  "actor_name": "System",
  "actor_role": "system",
  "target_type": "platform",
  "target_name": "ForumKit Platform",
  "metadata": {
    "shutdown_reason": "應用程序正常關閉",
    "shutdown_time": "2025-01-XX...",
    "process_id": 12345,
    "uptime_seconds": 3600
  },
  "is_important": true
}
```

### 平台重啟事件
```json
{
  "event_type": "system.platform_restarted",
  "title": "平台重啟",
  "description": "平台已重啟 - 生產環境維護重啟 - 腳本執行",
  "severity": "medium",
  "actor_name": "System",
  "actor_role": "system",
  "target_type": "platform",
  "target_name": "ForumKit Platform",
  "metadata": {
    "restart_reason": "生產環境維護重啟 - 腳本執行",
    "restart_time": "2025-01-XX...",
    "process_id": 12345,
    "uptime_seconds": 7200
  },
  "is_important": true
}
```

## 權限控制

### 訪問權限
- **平台狀態頁面**: 僅 `dev_admin` 可訪問
- **API 端點**: 僅 `dev_admin` 可調用
- **事件記錄**: 自動記錄（系統級別）

### 路由配置
```typescript
{
  path: "/admin/platform",
  element: (
    <RequireRoles allow={['dev_admin']}>
      <PlatformStatusPage />
    </RequireRoles>
  ),
  errorElement: <RouteError />,
}
```

## 使用方式

### 1. 自動記錄
- 平台啟動時自動記錄啟動事件
- 平台關閉時自動記錄關閉事件
- 無需人工干預

### 2. 手動記錄
1. 登入 dev_admin 帳號
2. 訪問 `/admin/platform` 頁面
3. 點擊「記錄平台重啟」或「記錄平台關閉」按鈕
4. 系統會記錄相應事件到事件日誌

### 3. 腳本記錄
- 執行 `scripts/prod_maintenance_restart.sh` 時會自動記錄重啟事件
- 腳本會檢查後端服務狀態，確保事件記錄成功

### 4. 查看事件
1. 訪問 `/admin/events` 頁面
2. 在事件列表中查看平台相關事件
3. 可以按類別篩選「system」事件

## 監控和維護

### 1. 狀態監控
- 定期檢查平台狀態頁面
- 監控記憶體和 CPU 使用率
- 關注運行時間和重啟頻率

### 2. 事件分析
- 分析重啟原因和頻率
- 檢查是否有異常關閉事件
- 追蹤平台穩定性

### 3. 故障排除
- 檢查事件日誌中的錯誤信息
- 確認 API 端點是否正常響應
- 驗證權限配置是否正確

## 未來改進

### 1. 功能擴展
- 添加更詳細的系統資源監控
- 實現自動警報機制
- 支持歷史數據分析

### 2. 性能優化
- 優化事件記錄性能
- 實現事件數據壓縮
- 添加事件清理機制

### 3. 用戶體驗
- 添加實時狀態更新
- 實現事件通知推送
- 支持自定義監控面板

## 總結

平台事件通知系統成功實現了：

1. **自動化記錄**: 平台生命週期事件自動記錄
2. **手動控制**: 管理員可以手動記錄事件
3. **狀態監控**: 實時顯示平台運行狀態
4. **腳本集成**: 重啟腳本自動記錄事件
5. **權限控制**: 僅 dev_admin 可訪問管理功能

這個系統為 ForumKit 平台提供了完整的運行狀態追蹤和事件記錄能力，有助於系統監控和故障排除。
