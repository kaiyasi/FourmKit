#!/usr/bin/env bash
set -euo pipefail

# ForumKit 校園匿名論壇系統 - 完整功能展示腳本
# 符合成大資工乙組特殊選材展示需求
# 展示核心功能：Socket.IO即時通訊、匿名發文、Instagram整合

echo "🎯 ForumKit 校園匿名論壇系統展示"
echo "===================================="
echo "專案特色："
echo "• 🔒 校園匿名討論平台"  
echo "• ⚡ Socket.IO 即時通訊"
echo "• 🐳 完整 Docker 容器化"
echo "• 📱 響應式 React 前端"
echo "• 📸 Instagram 自動發佈"
echo "• 🛡️ 內容智慧審核"
echo ""

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

# 檢查參數
if [ $# -lt 1 ]; then
  echo "📋 使用方式:"
  echo "  $0 <功能選項> [參數...]"
  echo ""
  echo "🚀 可用功能："
  echo "  start       - 啟動完整系統"
  echo "  test        - 執行驗收測試" 
  echo "  ig <id>     - Instagram 圖片生成展示"
  echo "  socket      - Socket.IO 即時通訊測試"
  echo "  admin       - 建立管理員帳號"
  echo "  status      - 檢查系統狀態"
  echo "  stop        - 停止所有服務"
  echo ""
  echo "💡 範例："
  echo "  $0 start              # 完整啟動"
  echo "  $0 ig 88 89          # 生成貼文 88, 89 的 IG 圖片"
  echo "  $0 test              # 執行驗收測試"
  exit 1
fi

DEMO_FUNCTION="$1"
shift

case "$DEMO_FUNCTION" in

  "start")
    echo "🚀 [1/4] 啟動 ForumKit 完整系統..."
    docker compose up -d --build
    
    echo "⏳ [2/4] 等待容器穩定啟動..."
    sleep 10
    
    echo "🔧 [3/4] 初始化資料庫..."
    docker compose exec -T backend alembic upgrade head || echo "資料庫已是最新狀態"
    
    echo "✅ [4/4] 系統啟動完成！"
    echo ""
    echo "🌐 訪問地址："
    echo "  主網站：http://localhost:12005"
    echo "  管理後台：http://localhost:12005/admin"  
    echo "  CDN服務：http://localhost:12001"
    echo ""
    echo "📊 服務狀態："
    docker compose ps
    ;;

  "test")
    echo "🧪 執行 ForumKit 完整驗收測試..."
    
    # 確保服務運行
    echo "📋 檢查服務狀態..."
    docker compose up -d --quiet-pull
    sleep 5
    
    # 執行驗收測試
    echo "🔍 開始驗收測試..."
    bash acceptance/run_acceptance.sh
    
    # 執行 pytest 測試
    echo "🐍 執行 Socket.IO 和核心功能測試..."
    docker compose exec -T backend python -m pytest tests/test_socket_core.py -v
    ;;

  "ig")
    echo "📸 Instagram 圖片生成展示功能"
    
    if [ $# -lt 1 ]; then
      echo "❌ 請提供論壇貼文 ID"
      echo "   例如: $0 ig 88 89"
      exit 1
    fi
    
    echo "🔧 [1/3] 啟動必要服務 (backend, cdn)..."
    docker compose up -d backend cdn
    
    echo "⏳ [2/3] 等待容器穩定..."
    sleep 5
    
    echo "🎨 [3/3] 生成 Instagram 圖片..."
    echo "處理貼文 ID: $*"
    
    docker compose exec -T backend python /app/scripts/generate_post_images.py "$@"
    
    echo "✨ IG 圖片生成完成！"
    ;;

  "socket")
    echo "🔌 Socket.IO 即時通訊功能測試"
    
    # 啟動必要服務
    docker compose up -d backend redis
    sleep 5
    
    echo "💬 測試即時通訊功能..."
    docker compose exec -T backend python -c "
import socketio
import time
import json

print('🔗 建立 Socket.IO 連接...')
sio = socketio.SimpleClient()

try:
    sio.connect('http://localhost', wait_timeout=10)
    print('✅ Socket.IO 連接成功')
    
    # 測試聊天室功能
    print('🏠 測試聊天室加入...')
    sio.emit('join_room', {'room': 'demo-room'})
    time.sleep(1)
    
    # 測試訊息發送
    print('💬 測試訊息發送...')
    sio.emit('chat_message', {
        'room': 'demo-room',
        'message': 'ForumKit Socket.IO 測試訊息',
        'timestamp': time.time()
    })
    
    time.sleep(2)
    sio.disconnect()
    print('✨ Socket.IO 測試完成')
    
except Exception as e:
    print(f'❌ Socket.IO 測試失敗: {e}')
"
    ;;

  "admin")
    echo "👑 建立管理員帳號"
    
    docker compose up -d backend postgres
    sleep 5
    
    echo "🔧 執行管理員建立腳本..."
    docker compose exec -T backend python manage.py
    ;;

  "status")
    echo "📊 ForumKit 系統狀態檢查"
    echo "========================"
    
    echo "🐳 Docker 容器狀態："
    docker compose ps
    echo ""
    
    echo "🌐 服務健康檢查："
    
    # 檢查主網站
    if curl -s -f "http://localhost:12005/api/health" > /dev/null; then
      echo "✅ 主網站服務正常"
    else
      echo "❌ 主網站服務異常"
    fi
    
    # 檢查 CDN
    if curl -s -f "http://localhost:12001/health" > /dev/null; then
      echo "✅ CDN 服務正常"  
    else
      echo "❌ CDN 服務異常"
    fi
    
    # 檢查資料庫
    DB_STATUS=$(docker compose exec -T postgres pg_isready -U forumkit 2>/dev/null && echo "OK" || echo "ERROR")
    if [ "$DB_STATUS" = "OK" ]; then
      echo "✅ PostgreSQL 資料庫正常"
    else
      echo "❌ PostgreSQL 資料庫異常"
    fi
    
    # 檢查 Redis
    REDIS_STATUS=$(docker compose exec -T redis redis-cli ping 2>/dev/null || echo "ERROR")
    if [ "$REDIS_STATUS" = "PONG" ]; then
      echo "✅ Redis 快取服務正常"
    else
      echo "❌ Redis 快取服務異常"
    fi
    ;;

  "stop")
    echo "🛑 停止 ForumKit 所有服務..."
    docker compose down
    echo "✅ 所有服務已停止"
    ;;

  *)
    echo "❌ 未知功能: $DEMO_FUNCTION"
    echo "請使用 $0 不帶參數查看可用功能"
    exit 1
    ;;

esac

echo ""
echo "🎉 ForumKit 展示功能執行完成"
echo "📖 更多資訊請查看 README.md"

