# 管理後台更新

## 問題描述

原管理後台存在以下問題：
1. **聊天室快捷圖卡**：管理員聊天室的快捷圖卡佔用空間，但使用頻率不高
2. **今日已處理數字錯誤**：統計數據沒有正確反映實際的審核紀錄
3. **缺少刪文請求統計**：沒有快速查看刪文請求狀態的方式

## 解決方案

### 1. 移除聊天室快捷圖卡

#### 修改內容
- 從 `AdminDashboard.tsx` 中移除管理員聊天室的快捷圖卡
- 保留聊天室功能，但不再在主後台顯示快捷入口

#### 修改前
```tsx
<Card to="/admin/chat" title="管理員聊天室" desc="即時溝通（支援自訂聊天室）" icon={MessageSquareDot} />
```

#### 修改後
```tsx
{/* 刪文請求快捷卡片 */}
<Card to="/admin/moderation?tab=delete_requests" title="刪文請求" desc={`${deleteRequestStats.pending} 則待審，今日已處理 ${deleteRequestStats.today_processed} 則`} icon={Trash2} />
```

### 2. 新增刪文請求快捷圖卡

#### 功能特點
- **即時統計**：顯示待審刪文請求數量
- **今日處理**：顯示今日已處理的刪文請求數量
- **直接跳轉**：點擊後直接跳轉到審核管理頁面的刪文請求標籤

#### 實現方式
```tsx
// 獲取刪文請求統計
useEffect(() => {
  const fetchDeleteRequestStats = async () => {
    try {
      const response = await fetch('/api/admin/delete-requests/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.ok) {
          setDeleteRequestStats(data.data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch delete request stats:', error)
    }
  }

  fetchDeleteRequestStats()
}, [])
```

### 3. 新增刪文請求統計API

#### API 端點
- **路徑**：`/api/admin/delete-requests/stats`
- **方法**：GET
- **權限**：需要管理員權限

#### 回應格式
```json
{
  "ok": true,
  "data": {
    "pending": 5,
    "today_processed": 12,
    "today_approved": 8,
    "today_rejected": 4
  }
}
```

#### 實現邏輯
```python
# 待審數量
pending_count = base_query.filter(DeleteRequest.status == 'pending').count()

# 今日處理數量
today_processed = base_query.filter(
    and_(
        DeleteRequest.reviewed_at >= today_start,
        DeleteRequest.reviewed_at <= today_end
    )
).count()

# 今日核准數量
today_approved = base_query.filter(
    and_(
        DeleteRequest.status == 'approved',
        DeleteRequest.reviewed_at >= today_start,
        DeleteRequest.reviewed_at <= today_end
    )
).count()
```

### 4. 修正今日已處理數字

#### 問題分析
原統計邏輯可能沒有正確計算基於審核紀錄的處理數量

#### 解決方案
- 使用 `ModerationLog` 表來計算今日處理數量
- 確保統計數據與實際審核紀錄一致

#### 統計邏輯
```python
# 今日處理數量（基於審核紀錄）
today_processed = (
    s.query(func.count())
    .select_from(ModerationLog)
    .filter(and_(ModerationLog.created_at >= today_start, ModerationLog.created_at <= today_end))
    .scalar()
)

# 今日核准數量
today_approved = (
    s.query(func.count())
    .select_from(ModerationLog)
    .filter(
        and_(
            ModerationLog.created_at >= today_start,
            ModerationLog.created_at <= today_end,
            ModerationLog.action == "approve",
        )
    )
    .scalar()
)
```

### 5. 審核管理頁面增強

#### 新增統計區塊
- **審核統計**：原有的貼文和媒體審核統計
- **刪文請求統計**：新增的刪文請求相關統計

#### 統計顯示
```tsx
{/* 刪文請求統計 */}
{deleteRequestStats && (
  <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
    <h3 className="text-lg font-semibold text-fg mb-4">刪文請求</h3>
    <div className="space-y-3">
      <div className="flex justify-between">
        <span className="text-sm text-muted">待審請求</span>
        <span className="text-sm font-medium text-amber-600">{deleteRequestStats.pending}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-muted">今日處理</span>
        <span className="text-sm font-medium">{deleteRequestStats.today_processed}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-muted">今日核准</span>
        <span className="text-sm font-medium text-green-600">{deleteRequestStats.today_approved}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-muted">今日拒絕</span>
        <span className="text-sm font-medium text-red-600">{deleteRequestStats.today_rejected}</span>
      </div>
    </div>
  </div>
)}
```

## 文件修改清單

### 後端文件
- `backend/routes/routes_admin.py` - 新增刪文請求統計API

### 前端文件
- `frontend/src/pages/AdminDashboard.tsx` - 移除聊天室圖卡，新增刪文請求圖卡
- `frontend/src/pages/admin/ModerationPage.tsx` - 新增刪文請求統計顯示

### 測試文件
- `scripts/test_admin_dashboard.sh` - 管理後台功能測試腳本（新增）

### 文檔
- `docs/ADMIN_DASHBOARD_UPDATE.md` - 更新說明文檔（新增）

## 測試驗證

### 測試腳本
使用 `scripts/test_admin_dashboard.sh` 進行功能測試：

```bash
./scripts/test_admin_dashboard.sh
```

### 驗證項目
1. ✅ 管理後台移除了聊天室快捷圖卡
2. ✅ 新增了刪文請求快捷圖卡
3. ✅ 刪文請求圖卡顯示正確的統計數據
4. ✅ 審核管理頁面顯示刪文請求統計
5. ✅ 今日已處理數字正確（基於審核紀錄）

## 總結

管理後台的更新解決了所有原有問題：
- ✅ 移除了使用頻率不高的聊天室快捷圖卡
- ✅ 新增了實用的刪文請求快捷圖卡
- ✅ 修正了今日已處理數字的計算邏輯
- ✅ 提供了更完整的統計信息
- ✅ 改善了管理員的工作效率
