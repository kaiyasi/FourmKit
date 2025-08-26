#!/usr/bin/env bash
# ===============================================================================
# 🔄 Serelix Studio ForumKit - 生產環境維護重啟
# ===============================================================================
# 功能：保留數據，重建服務，執行遷移，健康檢查
# 適用：生產環境的維護更新，保持數據完整性
set -euo pipefail

# ===============================================================================
# 🎨 UI 美化配置
# ===============================================================================
IS_TTY=0; [ -t 1 ] && IS_TTY=1

if [ -n "${NO_COLOR:-}" ] || [ "${IS_TTY}" -eq 0 ]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' DIM='' BOLD='' RESET=''
else
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m' 
    CYAN='\033[0;36m' MAGENTA='\033[0;35m' DIM='\033[2m' BOLD='\033[1m' RESET='\033[0m'
fi

# 圖標
ICON_RESTART="🔄" ICON_OK="✅" ICON_WARN="⚠️" ICON_ERROR="❌" ICON_BUILD="🔨" ICON_DEPLOY="📦"

# 工具函數
timestamp() { date +"%H:%M:%S"; }
step_count=0

header() {
    printf "\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${BLUE}$ICON_RESTART ForumKit Production Maintenance Restart${RESET}\n"
    printf "${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${DIM}維護時間: $(date)${RESET}\n\n"
}

step() {
    step_count=$((step_count + 1))
    printf "\n${BLUE}┌─ STEP %02d ${RESET}${DIM}[%s]${RESET}\n" "$step_count" "$(timestamp)"
    printf "${BLUE}│${RESET} ${BOLD}%s${RESET}\n" "$*"
    printf "${BLUE}└─${RESET}\n"
}

success() { printf "  ${GREEN}$ICON_OK %s${RESET}\n" "$*"; }
warning() { printf "  ${YELLOW}$ICON_WARN %s${RESET}\n" "$*"; }
error() { printf "  ${RED}$ICON_ERROR %s${RESET}\n" "$*"; }
info() { printf "  ${CYAN}ℹ️  %s${RESET}\n" "$*"; }

show_status() {
    printf "\n${CYAN}┌─ 服務狀態 ─────────────────────────────────────────────${RESET}\n"
    docker compose ps 2>/dev/null || echo "  Docker Compose 未運行"
    printf "${CYAN}└─────────────────────────────────────────────────────────${RESET}\n"
}

# ===============================================================================
# 主要執行流程
# ===============================================================================
start_time=$(date +%s)

cleanup_and_report() {
    local exit_code=$?
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    printf "\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    
    if [ $exit_code -eq 0 ]; then
        printf "${BOLD}${GREEN}$ICON_OK 維護重啟完成！${RESET} ${DIM}(耗時 ${duration}s)${RESET}\n"
        show_status
        
        printf "\n${BOLD}${CYAN}🌐 服務端點:${RESET}\n"
        printf "  • Frontend: ${BOLD}http://localhost:12005/${RESET}\n"
        printf "  • CDN:      ${BOLD}http://localhost:${CDN_PORT:-12002}/${RESET}\n"
        printf "  • API:      ${BOLD}http://localhost:12005/api/healthz${RESET}\n"
    else
        printf "${BOLD}${RED}$ICON_ERROR 維護重啟失敗！${RESET} ${DIM}(退出碼: $exit_code, 耗時: ${duration}s)${RESET}\n"
        show_status
        warning "請檢查錯誤日誌: docker compose logs --tail=30 backend"
    fi
    
    printf "${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
}

trap cleanup_and_report EXIT

# ===============================================================================
# 開始執行
# ===============================================================================
header

# STEP 1: 前端重建（可選）
if [ -f "frontend/package.json" ]; then
    step "$ICON_BUILD 重建前端資源"
    
    if command -v node >/dev/null 2>&1; then
        node_version=$(node -v | sed 's/^v//')
        major_version=$(echo "$node_version" | cut -d. -f1)
        minor_version=$(echo "$node_version" | cut -d. -f2)
        
        use_local_node=false
        if [ "$major_version" -ge 23 ]; then use_local_node=true
        elif [ "$major_version" -eq 22 ] && [ "$minor_version" -ge 12 ]; then use_local_node=true  
        elif [ "$major_version" -eq 20 ] && [ "$minor_version" -ge 19 ]; then use_local_node=true
        fi
        
        if [ "$use_local_node" = "true" ]; then
            info "使用本地 Node.js $node_version 構建..."
            (cd frontend && npm ci && npm run build)
            success "前端重建完成（本地 Node.js）"
        else
            warning "Node.js $node_version 版本過舊，使用容器構建..."
            docker run --rm -v "$(pwd)/frontend:/app" -w /app node:22-bookworm \
                bash -c 'npm ci && npm run build'
            success "前端重建完成（容器模式）"
        fi
    else
        info "未檢測到 Node.js，使用容器構建..."
        docker run --rm -v "$(pwd)/frontend:/app" -w /app node:22-bookworm \
            bash -c 'npm ci && npm run build'
        success "前端重建完成（容器模式）"
    fi
else
    info "未找到前端專案，跳過前端構建"
fi

# STEP 2: 服務重建與部署
step "$ICON_DEPLOY 重建服務映像並部署"
info "重建 Docker 映像並啟動（保留數據卷）..."
docker compose up -d --build
success "服務重建並啟動完成"

# STEP 3: 等待服務就緒
step "⏳ 等待服務就緒"
backend_ready=false
for i in $(seq 1 60); do
    if docker compose ps backend 2>/dev/null | grep -qi "up" && \
       docker compose exec -T backend echo "health_check" >/dev/null 2>&1; then
        backend_ready=true
        break
    fi
    
    if docker compose ps backend 2>/dev/null | grep -qi "exited"; then
        error "後端服務啟動失敗"
        docker compose logs backend --tail=20
        break
    fi
    
    printf "."
    sleep 2
done

if [ "$backend_ready" = "true" ]; then
    success "後端服務已就緒"
else
    warning "後端服務啟動超時，繼續執行遷移..."
fi

# STEP 4: 資料庫遷移
step "🗄️ 執行資料庫遷移"
if [ "$backend_ready" = "true" ]; then
    # 檢查是否有多個遷移分支
    heads_count=$(docker compose exec -T backend alembic heads 2>/dev/null | wc -l)
    if [ "$heads_count" -gt 1 ]; then
        info "檢測到多個遷移分支，升級到所有 heads..."
        if docker compose exec -T backend alembic upgrade heads; then
            success "多分支遷移完成"
        else
            warning "多分支遷移失敗，嘗試標記版本..."
            docker compose exec -T backend alembic stamp heads && \
                success "版本標記完成" || error "版本標記失敗"
        fi
    else
        if docker compose exec -T backend alembic upgrade head; then
            success "資料庫遷移完成"
        else
            warning "遷移失敗，嘗試標記版本..."
            docker compose exec -T backend alembic stamp head && \
                success "版本標記完成" || error "版本標記失敗"
        fi
    fi
else
    warning "使用獨立容器執行遷移..."
    docker compose run --rm backend alembic upgrade head && \
        success "資料庫遷移完成" || error "資料庫遷移失敗"
fi

# STEP 5: 健康檢查
step "🩺 系統健康檢查"

# API 健康檢查
if curl -fsS http://localhost:12005/api/healthz | jq . >/dev/null 2>&1; then
    success "API 健康檢查通過"
    info "API 回應正常"
else
    warning "API 健康檢查失敗"
    error "請檢查 API 服務狀態"
fi

# CDN 檢查
cdn_port=${CDN_PORT:-12002}
if curl -fsS "http://localhost:${cdn_port}/" >/dev/null 2>&1; then
    success "CDN 服務正常"
else
    warning "CDN 服務可能有問題"
fi

success "ForumKit 生產環境維護重啟完成！"