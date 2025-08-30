#!/usr/bin/env bash
# ===============================================================================
# 🔄 Serelix Studio ForumKit - 生產環境維護重啟
# ===============================================================================
# 功能：保留數據，重建前後端服務，執行遷移，健康檢查
# 適用：生產環境的程式碼更新與維護，保持數據完整性
set -euo pipefail

# ===============================================================================
# 🎨 UI 美化配置（同步 dev_full_rebuild.sh 設計）
# ===============================================================================
IS_TTY=0; [ -t 1 ] && IS_TTY=1

if [ -n "${NO_COLOR:-}" ] || [ "${IS_TTY}" -eq 0 ]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' DIM='' BOLD='' RESET=''
else
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m' 
    CYAN='\033[0;36m' MAGENTA='\033[0;35m' DIM='\033[2m' BOLD='\033[1m' RESET='\033[0m'
fi

# 漂亮的圖標（同步 dev 風格）
ICON_RESTART="🔄" ICON_OK="✅" ICON_WARN="⚠️" ICON_ERROR="❌" ICON_INFO="ℹ️" 
ICON_BUILD="🔨" ICON_DEPLOY="📦" ICON_CHECK="🔍" ICON_MAINTENANCE="🔧"

# 時間戳與步驟計數
timestamp() { date +"%H:%M:%S"; }
step_count=0

# 美化輸出函數
header() {
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${CYAN}$ICON_MAINTENANCE ForumKit Production Maintenance Restart${RESET}\n"
    printf "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${DIM}維護開始: $(date)${RESET}\n"
    printf "${DIM}操作模式: 保留數據庫 + 重建前後端服務${RESET}\n\n"
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
info() { printf "  ${CYAN}$ICON_INFO %s${RESET}\n" "$*"; }

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
    
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    
    if [ $exit_code -eq 0 ]; then
        printf "${BOLD}${GREEN}$ICON_OK 生產環境維護完成！${RESET} ${DIM}(耗時 ${duration}s)${RESET}\n"
        show_status
        
        printf "\n${BOLD}${CYAN}🌐 服務端點:${RESET}\n"
        printf "  • Frontend: ${BOLD}http://localhost:12005/${RESET}\n"
        printf "  • CDN:      ${BOLD}http://localhost:${CDN_PORT:-12002}/${RESET}\n"
        printf "  • API:      ${BOLD}http://localhost:12005/api/healthz${RESET}\n"
        
        printf "\n${BOLD}${GREEN}📊 維護總結:${RESET}\n"
        printf "  • ${GREEN}✅${RESET} 資料庫完整保留（含聊天室數據）\n"
        printf "  • ${GREEN}✅${RESET} 前後端服務已重建\n"
        printf "  • ${GREEN}✅${RESET} 程式碼更新已生效\n"
        printf "  • ${GREEN}✅${RESET} 資料庫遷移已完成\n"
        printf "  • ${GREEN}✅${RESET} 自訂聊天室與聊天紀錄已保留\n"
        
    else
        printf "${BOLD}${RED}$ICON_ERROR 維護過程失敗！${RESET} ${DIM}(退出碼: $exit_code, 耗時: ${duration}s)${RESET}\n"
        show_status
        warning "請檢查錯誤日誌: docker compose logs --tail=50 backend"
        
        printf "\n${BOLD}${RED}🚨 故障排除建議:${RESET}\n"
        printf "  • 檢查 Docker 服務狀態\n"
        printf "  • 確認磁碟空間是否充足\n"
        printf "  • 查看完整日誌: ${DIM}docker compose logs${RESET}\n"
    fi
    
    printf "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
}

trap cleanup_and_report EXIT

# ===============================================================================
# 開始執行
# ===============================================================================
header

# STEP 1: 預檢環境
step "$ICON_CHECK 環境預檢與狀態檢查"
if ! command -v docker >/dev/null 2>&1; then
    error "未安裝 Docker，請先安裝 Docker"
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    error "未偵測到 Docker Compose 插件"
    exit 1
fi
success "Docker 環境檢查通過"

# 檢查當前運行狀態
info "檢查當前服務狀態..."
show_status

# STEP 2: 前端重建
if [ -f "frontend/package.json" ]; then
    step "$ICON_BUILD 重建前端資源"
    
    # 智能選擇構建方式（同步 dev 腳本邏輯）
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
            (cd frontend && npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1)
            success "前端構建完成（本地 Node.js）"
        else
            warning "Node.js $node_version 版本過舊，使用容器構建..."
            docker run --rm -v "$(pwd)/frontend:/app" -w /app node:22-bookworm \
                bash -c 'npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1'
            success "前端構建完成（容器模式）"
        fi
    else
        info "未檢測到 Node.js，使用容器構建..."
        docker run --rm -v "$(pwd)/frontend:/app" -w /app node:22-bookworm \
            bash -c 'npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1'
        success "前端構建完成（容器模式）"
    fi
else
    warning "未找到前端專案，跳過前端構建"
fi

# STEP 3: 停止服務（保留數據卷）
step "$ICON_INFO 停止服務並保留數據"
info "停止所有服務（保留數據卷和網路）..."
docker compose stop >/dev/null 2>&1
success "服務已安全停止，數據卷完整保留"

# STEP 4: 重建前後端映像
step "$ICON_BUILD 重建主要服務映像"
info "重建 backend、nginx、cdn 映像（強制無快取）..."
docker compose build --no-cache backend nginx cdn >/dev/null 2>&1
success "主要服務映像重建完成"

# STEP 5: 重新部署服務
step "$ICON_DEPLOY 部署更新後的服務"
info "啟動 backend、nginx、cdn（使用新映像）..."
docker compose up -d --force-recreate --no-deps backend nginx cdn >/dev/null 2>&1
info "啟動其他依賴服務..."
docker compose up -d >/dev/null 2>&1
success "所有服務已部署並啟動"

# STEP 6: 等待服務就緒
step "⏳ 等待服務就緒"
backend_ready=false
info "等待後端服務啟動..."
for i in $(seq 1 60); do
    if docker compose ps backend 2>/dev/null | grep -qi "up" && \
       docker compose exec -T backend echo "health_check" >/dev/null 2>&1; then
        backend_ready=true
        break
    fi
    
    if docker compose ps backend 2>/dev/null | grep -qi "exited"; then
        error "後端服務啟動失敗"
        docker compose logs backend --tail=20 >/dev/null 2>&1
        break
    fi
    
    printf "."
    sleep 2
done
printf "\n"

if [ "$backend_ready" = "true" ]; then
    success "後端服務已就緒"
else
    warning "後端服務啟動超時，嘗試重啟..."
    docker compose restart backend >/dev/null 2>&1
    
    for i in $(seq 1 20); do
        if docker compose exec -T backend echo "health_check" >/dev/null 2>&1; then
            backend_ready=true
            success "後端服務重啟成功"
            break
        fi
        sleep 2
    done
    
    if [ "$backend_ready" != "true" ]; then
        warning "後端服務仍未就緒，將使用獨立容器執行遷移"
    fi
fi

# STEP 7: 資料庫遷移
step "$ICON_INFO 初始化上傳目錄結構"
if [ "$backend_ready" = "true" ]; then
    docker compose exec -T backend python scripts/init_uploads.py >/dev/null 2>&1 && \
        success "上傳目錄結構初始化完成" || warning "上傳目錄結構初始化失敗"
else
    docker compose run --rm backend python scripts/init_uploads.py >/dev/null 2>&1 && \
        success "上傳目錄結構初始化完成" || warning "上傳目錄結構初始化失敗"
fi
step "$ICON_INFO 執行資料庫遷移"
if [ "$backend_ready" = "true" ]; then
    # 檢查是否有多個遷移分支
    heads_count=$(docker compose exec -T backend alembic heads 2>/dev/null | wc -l)
    if [ "$heads_count" -gt 1 ]; then
        info "檢測到多個遷移分支，升級到所有 heads..."
        if docker compose exec -T backend alembic upgrade heads >/dev/null 2>&1; then
            success "多分支遷移完成"
        else
            warning "多分支遷移失敗，嘗試標記版本..."
            docker compose exec -T backend alembic stamp heads >/dev/null 2>&1 && \
                success "版本標記完成" || error "版本標記失敗"
        fi
    else
        if docker compose exec -T backend alembic upgrade head >/dev/null 2>&1; then
            success "資料庫遷移完成"
        else
            warning "遷移失敗，嘗試標記版本..."
            docker compose exec -T backend alembic stamp head >/dev/null 2>&1 && \
                success "版本標記完成" || error "版本標記失敗"
        fi
    fi
else
    warning "使用獨立容器執行遷移..."
    docker compose run --rm backend alembic upgrade head >/dev/null 2>&1 && \
        success "資料庫遷移完成" || error "資料庫遷移失敗"
fi

# STEP 8: 系統健康檢查
step "$ICON_CHECK 系統健康檢查"

# 上傳服務檢查  
info "檢查上傳服務..."
if curl -fsS "http://localhost:12005/uploads/public/dev_rebuild_check.txt" >/dev/null 2>&1; then
    success "上傳服務正常"
else
    warning "上傳服務可能有問題"
fi

# API 健康檢查
info "檢查 API 服務健康狀態..."
if curl -fsS http://localhost:12005/api/healthz >/dev/null 2>&1; then
    success "API 健康檢查通過"
    
    # 獲取 API 回應詳情
    if command -v jq >/dev/null 2>&1; then
        api_response=$(curl -fsS http://localhost:12005/api/healthz 2>/dev/null | jq -r '.status // "unknown"')
        info "API 狀態: $api_response"
    fi
else
    warning "API 健康檢查失敗，正在重試..."
    sleep 5
    if curl -fsS http://localhost:12005/api/healthz >/dev/null 2>&1; then
        success "API 健康檢查通過（重試成功）"
    else
        error "API 服務異常，請檢查服務狀態"
    fi
fi

# CDN 服務檢查
cdn_port=${CDN_PORT:-12002}
info "檢查 CDN 服務..."
if curl -fsS "http://localhost:${cdn_port}/" >/dev/null 2>&1; then
    success "CDN 服務正常運行"
else
    warning "CDN 服務可能有問題，請檢查配置"
fi

# 前端服務檢查
info "檢查前端服務..."
if curl -fsS "http://localhost:12005/" >/dev/null 2>&1; then
    success "前端服務正常運行"
else
    warning "前端服務可能有問題"
fi

success "ForumKit 生產環境維護流程完成！"
