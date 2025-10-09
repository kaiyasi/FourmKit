# 公告權限系統

## 概述

本文件描述了 ForumKit 公告系統的權限控制機制，確保不同角色的用戶只能在其權限範圍內發布和管理公告。

## 權限規則

### 1. 角色權限矩陣

| 角色 | 可以進入公告頁面 | 可以發布公告 | 公告範圍 | 可以編輯/刪除 |
|------|------------------|--------------|----------|---------------|
| `dev_admin` | ✅ | ✅ | 全平台或指定學校 | 任何公告 |
| `campus_admin` | ✅ | ✅ | 僅自己學校 | 自己學校的公告 |
| `cross_admin` | ✅ | ✅ | 僅全平台 | 全平台公告 |
| `campus_moderator` | ❌ | ❌ | 無權限 | 無權限 |
| `cross_moderator` | ❌ | ❌ | 無權限 | 無權限 |

### 2. 詳細權限說明

#### `dev_admin` (開發人員)
- **進入權限**: ✅ 可以進入公告頁面
- **發布權限**: ✅ 可以發布公告
- **公告範圍**: 
  - 全平台公告 (`school_id = null`)
  - 指定學校公告 (`school_id = 學校ID`)
- **編輯/刪除權限**: ✅ 可以編輯和刪除任何公告
- **UI 功能**: 顯示學校選擇下拉選單

#### `campus_admin` (校內管理員)
- **進入權限**: ✅ 可以進入公告頁面
- **發布權限**: ✅ 可以發布公告
- **公告範圍**: 僅自己學校 (`school_id = 用戶的學校ID`)
- **編輯/刪除權限**: ✅ 只能編輯和刪除自己學校的公告
- **UI 功能**: 顯示"將發布給您學校的所有用戶"

#### `cross_admin` (跨校管理員)
- **進入權限**: ✅ 可以進入公告頁面
- **發布權限**: ✅ 可以發布公告
- **公告範圍**: 僅全平台 (`school_id = null`)
- **編輯/刪除權限**: ✅ 只能編輯和刪除全平台公告
- **UI 功能**: 顯示"將發布給全平台的所有用戶"

#### `campus_moderator` (校內審核)
- **進入權限**: ❌ 不能進入公告頁面
- **發布權限**: ❌ 不能發布公告
- **公告範圍**: 無權限
- **編輯/刪除權限**: ❌ 無權限
- **UI 功能**: 公告卡片變灰且不可點擊

#### `cross_moderator` (跨校審核)
- **進入權限**: ❌ 不能進入公告頁面
- **發布權限**: ❌ 不能發布公告
- **公告範圍**: 無權限
- **編輯/刪除權限**: ❌ 無權限
- **UI 功能**: 公告卡片變灰且不可點擊

## 技術實現

### 1. 後端權限控制

#### API 端點權限
```python
@bp.post("/")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def create_announcement():
    # 角色特定權限檢查
    if user.role == "campus_admin":
        # 只能為自己的學校創建公告
        if school_id != user.school_id:
            return jsonify({"ok": False, "error": "權限不足"}), 403
    elif user.role == "cross_admin":
        # 只能為全平台創建公告
        if school_id is not None:
            return jsonify({"ok": False, "error": "權限不足"}), 403
    # dev_admin 可以選擇任何範圍
```

#### 編輯/刪除權限檢查
```python
# campus_admin: 只能編輯自己學校的公告
if user.role == "campus_admin":
    if announcement.school_id != user.school_id:
        return jsonify({"ok": False, "error": "權限不足"}), 403

# cross_admin: 只能編輯全平台公告
elif user.role == "cross_admin":
    if announcement.school_id is not None:
        return jsonify({"ok": False, "error": "權限不足"}), 403

# dev_admin: 可以編輯任何公告
```

### 2. 前端權限控制

#### 路由保護
```typescript
{
    path: "/admin/announcements",
    element: (
        <RequireRoles allow={['dev_admin','campus_admin','cross_admin']}>
            <AdminAnnouncementsPage />
        </RequireRoles>
    ),
    errorElement: <RouteError />,
}
```

#### 權限檢查函數
```typescript
export function canAccessAnnouncements(): boolean {
  const role = getRole();
  return ["dev_admin", "campus_admin", "cross_admin"].includes(role);
}
```

#### 管理員儀表板卡片
```typescript
<Card 
  to="/admin/announcements" 
  title="公告發佈" 
  desc="發布系統公告，同步送往 Webhook 與訂閱" 
  icon={Wrench} 
  disabled={!canAccessAnnouncements()} 
/>
```

### 3. UI 適配

#### 學校選擇 (僅 dev_admin)
```typescript
{role === 'dev_admin' && (
  <div className="flex items-center gap-3">
    <Building2 className="w-4 h-4 text-muted" />
    <select 
      value={selectedSchoolId || ''} 
      onChange={e => setSelectedSchoolId(e.target.value ? parseInt(e.target.value) : null)}
      className="form-control flex-1"
    >
      <option value="">全平台公告</option>
      {schools.map(school => (
        <option key={school.id} value={school.id}>
          {school.name}
        </option>
      ))}
    </select>
  </div>
)}
```

#### 角色說明
```typescript
<div className="text-sm text-muted">
  {role === 'campus_admin' && '將發布給您學校的所有用戶'}
  {role === 'cross_admin' && '將發布給全平台的所有用戶'}
  {role === 'dev_admin' && (selectedSchoolId ? `將發布給選定學校的所有用戶` : '將發布給全平台的所有用戶')}
</div>
```

## 測試

### 測試腳本
使用 `scripts/test_announcement_permissions.sh` 進行權限測試：

```bash
# 測試 campus_admin 權限
test_announcement_permissions 'campus_admin' 'TOKEN' 'SCHOOL_ID' '201' 'campus_admin 可以為自己學校發布公告'
test_announcement_permissions 'campus_admin' 'TOKEN' 'OTHER_SCHOOL_ID' '403' 'campus_admin 不能為其他學校發布公告'

# 測試 cross_admin 權限
test_announcement_permissions 'cross_admin' 'TOKEN' 'null' '201' 'cross_admin 可以發布全平台公告'
test_announcement_permissions 'cross_admin' 'TOKEN' 'SCHOOL_ID' '403' 'cross_admin 不能為特定學校發布公告'

# 測試 dev_admin 權限
test_announcement_permissions 'dev_admin' 'TOKEN' 'null' '201' 'dev_admin 可以發布全平台公告'
test_announcement_permissions 'dev_admin' 'TOKEN' 'SCHOOL_ID' '201' 'dev_admin 可以為特定學校發布公告'
```

### 手動測試步驟

1. **campus_admin 測試**
   - 登入 campus_admin 帳號
   - 訪問 `/admin/announcements`
   - 嘗試發布公告（應該只能為自己學校）
   - 嘗試編輯其他學校的公告（應該被拒絕）

2. **cross_admin 測試**
   - 登入 cross_admin 帳號
   - 訪問 `/admin/announcements`
   - 嘗試發布公告（應該只能為全平台）
   - 嘗試編輯學校特定公告（應該被拒絕）

3. **dev_admin 測試**
   - 登入 dev_admin 帳號
   - 訪問 `/admin/announcements`
   - 測試學校選擇功能
   - 測試全平台和學校特定公告發布

4. **審核員測試**
   - 登入 campus_moderator 或 cross_moderator 帳號
   - 訪問 `/admin` 查看公告卡片是否變灰
   - 嘗試直接訪問 `/admin/announcements`（應該被拒絕）

## 錯誤處理

### 常見錯誤訊息

| 錯誤情況 | 錯誤訊息 | HTTP 狀態碼 |
|----------|----------|-------------|
| 無權限訪問 | "權限不足" | 403 |
| 校內管理員嘗試為其他學校發布 | "權限不足：只能為自己的學校發布公告" | 403 |
| 跨校管理員嘗試為特定學校發布 | "權限不足：跨校管理員只能發布全平台公告" | 403 |
| 校內管理員未綁定學校 | "校內管理員必須綁定學校" | 403 |

### 前端錯誤處理
```typescript
try {
  const response = await fetch('/api/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title, content, school_id })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '發布失敗')
  }
} catch (error) {
  setInfo(error.message || '發布失敗')
}
```

## 安全考量

1. **後端驗證**: 所有權限檢查都在後端進行，前端僅用於 UI 適配
2. **角色驗證**: 使用 JWT token 驗證用戶角色
3. **學校綁定**: 確保 campus_admin 只能操作自己學校的內容
4. **範圍限制**: cross_admin 被限制為全平台操作
5. **審計日誌**: 所有公告操作都會記錄在事件中心

## 未來擴展

1. **公告模板**: 可以為不同角色預設不同的公告模板
2. **批量操作**: 支援批量發布和管理公告
3. **公告排程**: 支援預設時間發布公告
4. **通知整合**: 與現有的通知系統深度整合
5. **權限委託**: 允許管理員臨時委託權限給其他用戶
