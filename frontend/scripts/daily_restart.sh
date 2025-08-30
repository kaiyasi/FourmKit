#!/usr/bin/env bash
# ===============================================================================
# ⏰ Serelix Studio ForumKit - 定期重啟腳本
# ===============================================================================
# 功能：輕量級服務重啟，適用於定期維護 (cron job)
# 用途：清理記憶體，重新載入配置，保持服務穩定性
set -euo pipefail

# ===============================================================================
# 🎨 簡化版 UI
# ===============================================================================
IS_TTY=0; [ -t 1 ] && IS_TTY=1

if [ -n "${NO_COLOR:-}" ] || [ "${IS_TTY}" -eq 0 ]; then
    GREEN='' YELLOW='' RED='' BLUE='' RESET=''
else
    GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' BLUE='\033[0;34m' RESET='\033[0m'
fi

log() { echo "[$(date +'%H:%M:%S')] $*"; }
success() { printf "${GREEN}✅ %s${RESET}\n" "$*"; }
warning() { printf "${YELLOW}⚠️  %s${RESET}\n" "$*"; }
error() { printf "${RED}❌ %s${RESET}\n" "$*"; }

# ===============================================================================
# 主要執行流程
# ===============================================================================
start_time=$(date +%s)

log "🔄 開始定期重啟程序..."

# 檢查服務狀態
log "檢查服務狀態..."
if ! docker compose ps >/dev/null 2>&1; then
    error "Docker Compose 未運行，退出"
    exit 1
fi

# 輕量級重啟（不重建映像）
log "執行服務重啟..."
if docker compose restart >/dev/null 2>&1; then
    success "服務重啟完成"
else
    error "服務重啟失敗"
    exit 1
fi

# 等待服務就緒
log "等待服務就緒..."
for i in $(seq 1 30); do
    if docker compose ps backend 2>/dev/null | grep -qi "up"; then
        success "後端服務已就緒"
        break
    fi
    sleep 2
    if [ "$i" -eq 30 ]; then
        warning "服務啟動超時"
    fi
done

# 簡單健康檢查
if curl -fsS http://localhost:12005/api/healthz >/dev/null 2>&1; then
    success "健康檢查通過"
else
    warning "健康檢查失敗"
fi

end_time=$(date +%s)
duration=$((end_time - start_time))

success "定期重啟完成 (耗時: ${duration}s)"

# 記錄到日誌（如果需要）
if [ "${LOG_TO_FILE:-}" = "1" ]; then
    echo "$(date): ForumKit 定期重啟完成 (耗時: ${duration}s)" >> /var/log/forumkit-restart.log 2>/dev/null || true
fi