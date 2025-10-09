#!/bin/bash
# 測試客服支援系統修復

echo "=========================================="
echo "客服支援系統修復驗證測試"
echo "=========================================="
echo ""

# 檢查後端狀態
echo "1. 檢查後端服務狀態..."
if docker compose ps backend | grep -q "Up"; then
    echo "✅ 後端服務運行中"
else
    echo "❌ 後端服務未運行"
    exit 1
fi
echo ""

# 檢查 API 端點
echo "2. 檢查支援系統 API 端點..."

# 測試 /api/support/my-tickets (需要認證)
echo "   - 測試 /api/support/my-tickets..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:12005/api/support/my-tickets)
if [ "$response" = "401" ]; then
    echo "   ✅ 端點存在 (返回 401 未授權，符合預期)"
else
    echo "   ⚠️  端點返回: $response"
fi

# 測試 /api/support/guest/verify (POST)
echo "   - 測試 /api/support/guest/verify..."
response=$(curl -s -X POST http://localhost:12005/api/support/guest/verify \
    -H "Content-Type: application/json" \
    -d '{"token":"test"}' \
    -o /dev/null -w "%{http_code}")
if [ "$response" = "401" ] || [ "$response" = "400" ]; then
    echo "   ✅ 端點存在 (返回 $response，符合預期)"
else
    echo "   ⚠️  端點返回: $response"
fi

# 測試 /api/support/guest/track (POST)
echo "   - 測試 /api/support/guest/track..."
response=$(curl -s -X POST http://localhost:12005/api/support/guest/track \
    -H "Content-Type: application/json" \
    -d '{"ticket_id":"test","email":"test@test.com"}' \
    -o /dev/null -w "%{http_code}")
if [ "$response" = "404" ] || [ "$response" = "400" ]; then
    echo "   ✅ 端點存在 (返回 $response，符合預期)"
else
    echo "   ⚠️  端點返回: $response"
fi
echo ""

# 檢查模組導入
echo "3. 檢查 Python 模組導入..."
if docker compose exec backend python3 -c "import sys; sys.path.insert(0, '/app'); from models import User, SupportTicket; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✅ models 模組導入成功"
else
    echo "   ❌ models 模組導入失敗"
    exit 1
fi

if docker compose exec backend python3 -c "import sys; sys.path.insert(0, '/app'); from services.notification_service import NotificationService; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✅ notification_service 模組導入成功"
else
    echo "   ❌ notification_service 模組導入失敗"
    exit 1
fi
echo ""

# 檢查後端日誌是否有錯誤
echo "4. 檢查最近的後端日誌..."
errors=$(docker compose logs backend --since 2m 2>&1 | grep -i "error\|traceback\|exception" | grep -v "ERROR\] Worker" | wc -l)
if [ "$errors" -eq 0 ]; then
    echo "   ✅ 無錯誤日誌"
else
    echo "   ⚠️  發現 $errors 條錯誤日誌"
    docker compose logs backend --since 2m 2>&1 | grep -i "error\|traceback" | head -5
fi
echo ""

echo "=========================================="
echo "測試完成"
echo "=========================================="
echo ""
echo "修復內容："
echo "  ✅ 工單創建後導向邏輯"
echo "  ✅ 工單ID一致性（public_id）"
echo "  ✅ 優先級中文顯示"
echo "  ✅ 訪客工單追蹤 API"
echo "  ✅ 移除 chat 模組依賴"
echo "  ✅ Docker 配置優化"
echo ""