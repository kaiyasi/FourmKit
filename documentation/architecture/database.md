# ForumKit 多資料庫架構設計

## 概述

ForumKit v1.4.0 引入了全新的多資料庫架構，將不同功能模組的資料分離到獨立的資料庫檔案中，提高系統穩定性和維護性。

## 設計理念

### 🎯 核心目標
- **服務隔離**: 不同功能模組使用獨立資料庫，故障不會相互影響
- **備份靈活**: 可針對不同服務進行獨立備份和恢復
- **擴展性強**: 未來可輕鬆將不同服務部署到不同伺服器
- **維護簡單**: 問題定位更精確，維護成本降低

### 📊 資料庫分離策略

#### 1. **Core Database** (`forumkit_core.db`)
**核心論壇功能**
- `users` - 用戶資料
- `posts` - 貼文內容  
- `delete_requests` - 刪文申請
- `comments` - 留言資料
- `post_reactions` - 貼文反應
- `comment_reactions` - 留言反應
- `media` - 媒體檔案
- `user_roles` - 用戶角色

#### 2. **Support Database** (`forumkit_support.db`)
**客服支援系統**
- `support_tickets` - 支援系統
- `support_messages` - 客服訊息

#### 3. **Chat Database** (`forumkit_chat.db`)
**聊天室系統**
- `chat_messages` - 聊天訊息
- `chat_rooms` - 聊天室
- `chat_room_members` - 聊天室成員

#### 4. **Moderation Database** (`forumkit_moderation.db`)
**審核和管理系統**
- `moderation_logs` - 審核記錄
- `system_events` - 系統事件
- `notification_preferences` - 通知偏好

#### 5. **Organization Database** (`forumkit_organization.db`)
**組織管理系統**
- `schools` - 學校資料
- `school_settings` - 學校設定
- `announcements` - 公告
- `announcement_reads` - 公告閱讀記錄

## 技術實現

### 🔧 資料庫管理器

```python
from utils.db_multi import (
    get_core_session,
    get_support_session,
    get_chat_session,
    get_moderation_session,
    get_organization_session
)

# 使用不同的資料庫會話
core_db = get_core_session()
support_db = get_support_session()
```

### 🛠️ CLI 管理工具

ForumKit 提供了完整的命令行管理工具：

```bash
# 查看資料庫狀態
python scripts/db_manager.py status

# 初始化所有資料庫
python scripts/db_manager.py init

# 備份所有資料庫
python scripts/db_manager.py backup

# 備份指定服務
python scripts/db_manager.py backup --service core

# 從舊資料庫遷移
python scripts/db_manager.py migrate old_database.db

# 清理舊備份
python scripts/db_manager.py cleanup --days 30
```

### 📦 自動遷移

系統提供自動遷移工具，將舊的單一資料庫轉換為多檔格式：

```bash
python scripts/migrate_to_multi_db.py [原始資料庫路徑]
```

遷移工具會：
1. 自動偵測原始資料庫
2. 初始化新的多資料庫架構  
3. 按表格分類遷移資料
4. 生成詳細的遷移報告

## 配置管理

### 🔐 連接設定

每個資料庫都使用優化的 SQLite 設定：

```python
# 連接參數
connect_args = {
    "check_same_thread": False,
    "timeout": 30,
    "isolation_level": None
}

# SQLite 優化
PRAGMA journal_mode=WAL
PRAGMA synchronous=NORMAL  
PRAGMA cache_size=10000
PRAGMA temp_store=MEMORY
```

### 📂 檔案結構

```
data/
├── forumkit_core.db           # 核心功能
├── forumkit_support.db        # 支援系統
├── forumkit_chat.db           # 聊天室
├── forumkit_moderation.db     # 審核管理
├── forumkit_organization.db   # 組織管理
├── database_info.md           # 資料庫說明
└── migration_report.md        # 遷移報告
```

## 備份策略

### 🔄 自動備份

```python
# 備份所有資料庫
backup_paths = backup_all_databases()

# 備份指定服務
backup_path = db_service.backup_database('core', './backups')

# 清理舊備份（保留30天）
db_service.cleanup_old_backups('./backups', keep_days=30)
```

### 📋 備份檔案命名

格式：`{服務名}_{時間戳}.db`
- `core_20250902_143022.db`
- `support_20250902_143022.db`
- `chat_20250902_143022.db`

## 監控和維護

### 🏥 健康檢查

```python
# 檢查所有資料庫健康狀態
health_status = db_service.get_database_status()

for service, info in health_status.items():
    print(f"{service}: {'✅' if info['health'] else '❌'}")
    print(f"  Size: {info['size_mb']} MB")
    print(f"  Tables: {len(info['tables'])}")
```

### 📊 狀態監控

- **檔案大小追蹤**: 監控各資料庫成長趨勢
- **連接健康檢查**: 定期驗證資料庫連接
- **備份狀態**: 追蹤備份成功率和頻率
- **效能指標**: 查詢回應時間統計

## 最佳實踐

### ✅ 建議做法

1. **定期備份**: 建議每日自動備份重要資料庫
2. **監控大小**: 關注資料庫檔案大小成長趨勢
3. **分離部署**: 可考慮將不同服務部署到不同伺服器
4. **測試恢復**: 定期測試備份檔案的恢復流程

### ⚠️ 注意事項

1. **跨資料庫查詢**: 避免跨資料庫的複雜 JOIN 查詢
2. **事務處理**: 跨資料庫的分散式事務需要特別處理
3. **外鍵約束**: 跨資料庫的外鍵關聯需要在應用層處理
4. **資料一致性**: 確保相關資料的一致性維護

## 升級指南

### 📈 從單一資料庫升級

1. **備份原始資料**: 務必先備份現有資料庫
2. **執行遷移工具**: 使用自動遷移腳本
3. **驗證資料完整性**: 檢查遷移後的資料
4. **更新應用配置**: 修改資料庫連接設定
5. **測試功能**: 全面測試各項功能

### 🔄 版本兼容性

- **v1.3.x**: 需要執行完整遷移
- **v1.4.0+**: 原生支持多資料庫架構
- **未來版本**: 向下兼容保證

## 故障排除

### 🚨 常見問題

#### Q: 遷移過程中斷怎麼辦？
A: 重新執行遷移腳本，系統會自動跳過已完成的部分。

#### Q: 某個資料庫損壞如何處理？
A: 使用對應的備份檔案進行恢復，其他資料庫不受影響。

#### Q: 如何監控資料庫效能？
A: 使用內建的 CLI 工具查看資料庫狀態和統計資訊。

---

**最後更新**: 2025-09-02  
**相關版本**: v1.4.0+