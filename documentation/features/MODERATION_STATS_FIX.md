# 審核統計修復：包含刪文請求處理記錄

## 問題描述

管理員頁面中的"今日已處理"統計顯示為 0，而不是實際的處理量。這是因為統計邏輯沒有包含刪文請求的審核記錄。

## 問題分析

### 原始統計邏輯
```python
# 今日核准數量
today_approved = (
    s.query(func.count())
    .select_from(ModerationLog)
    .filter(
        and_(
            ModerationLog.created_at >= today_start,
            ModerationLog.created_at <= today_end,
            ModerationLog.action == "approve",  # 只計算 "approve"
        )
    )
    .scalar()
)

# 今日拒絕數量
today_rejected = (
    s.query(func.count())
    .select_from(ModerationLog)
    .filter(
        and_(
            ModerationLog.created_at >= today_start,
            ModerationLog.created_at <= today_end,
            ModerationLog.action == "reject",  # 只計算 "reject"
        )
    )
    .scalar()
)
```

### 問題所在
刪文請求的審核記錄使用不同的 action 值：
- 刪文請求核准：`"delete_approved"`
- 刪文請求拒絕：`"delete_rejected"`

而原始統計只計算了：
- 貼文/媒體核准：`"approve"`
- 貼文/媒體拒絕：`"reject"`

## 解決方案

### 修改統計邏輯
```python
# 今日核准數量（包含貼文/媒體核准和刪文請求核准）
today_approved = (
    s.query(func.count())
    .select_from(ModerationLog)
    .filter(
        and_(
            ModerationLog.created_at >= today_start,
            ModerationLog.created_at <= today_end,
            ModerationLog.action.in_(["approve", "delete_approved"]),  # 包含兩種核准
        )
    )
    .scalar()
)

# 今日拒絕數量（包含貼文/媒體拒絕和刪文請求拒絕）
today_rejected = (
    s.query(func.count())
    .select_from(ModerationLog)
    .filter(
        and_(
            ModerationLog.created_at >= today_start,
            ModerationLog.created_at <= today_end,
            ModerationLog.action.in_(["reject", "delete_rejected"]),  # 包含兩種拒絕
        )
    )
    .scalar()
)
```

## 修改文件

### 後端修改
- **文件**: `backend/routes/routes_moderation.py`
- **函數**: `get_moderation_stats()`
- **修改**: 更新統計查詢邏輯，使用 `action.in_()` 包含所有相關的審核動作

### 測試文件
- **新增**: `backend/tests/test_moderation_stats.py`
- **內容**: 測試刪文請求審核記錄是否正確包含在統計中

## 影響範圍

### 統計包含的內容
1. **貼文審核**
   - 核准：`action = "approve"`
   - 拒絕：`action = "reject"`

2. **媒體審核**
   - 核准：`action = "approve"`
   - 拒絕：`action = "reject"`

3. **刪文請求審核**
   - 核准：`action = "delete_approved"`
   - 拒絕：`action = "delete_rejected"`

### 前端顯示
- **GeneralAdminPage**: "今日已處理" 統計卡片
- **ModerationPage**: 審核統計區塊
- **所有管理員頁面**: 使用相同統計 API 的頁面

## 驗證方法

### 1. 手動測試
1. 創建一個刪文請求
2. 管理員核准或拒絕該請求
3. 檢查管理員頁面的"今日已處理"統計是否更新

### 2. 自動測試
```bash
# 運行測試
pytest backend/tests/test_moderation_stats.py -v
```

### 3. API 測試
```bash
# 檢查統計 API 返回
curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/moderation/stats
```

## 預期結果

修復後，"今日已處理"統計應該正確顯示：
- 貼文審核數量
- 媒體審核數量
- 刪文請求審核數量

總計 = 所有審核記錄的總和

## 注意事項

1. **向後兼容**: 修改不影響現有功能，只是擴展了統計範圍
2. **數據一致性**: 確保所有審核操作都正確記錄到 `ModerationLog` 表
3. **性能影響**: 查詢條件稍微複雜，但影響微乎其微
4. **權限控制**: 統計仍然遵循用戶的權限範圍（校內管理員只能看到自己學校的統計）
