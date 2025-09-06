#!/usr/bin/env bash
# ===============================================================================
# 🚀 Serelix Studio ForumKit - 維護重啟腳本
# ===============================================================================
# 功能：前後端重建 -> 資料庫保留 -> 服務重啟 -> 健康檢查
# 適用場景：維護環境，不動資料庫，僅重建前後端服務
set -euo pipefail

# ===============================================================================
# 🎨 UI 美化與工具函數
# ===============================================================================
IS_TTY=0; [ -t 1 ] && IS_TTY=1

if [ -n "${NO_COLOR:-}" ] || [ "${IS_TTY}" -eq 0 ]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' DIM='' BOLD='' RESET=''
else
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m' 
    CYAN='\033[0;36m' MAGENTA='\033[0;35m' DIM='\033[2m' BOLD='\033[1m' RESET='\033[0m'
fi

# 漂亮的圖標
ICON_ROCKET="🚀" ICON_OK="✅" ICON_WARN="⚠️" ICON_ERROR="❌" ICON_INFO="ℹ️"  
ICON_BUILD="🔨" ICON_DEPLOY="📦" ICON_CHECK="🔍" ICON_DB="🗄️" ICON_SAVE="💾"

# 時間戳與步驟計數
timestamp() { date +"%H:%M:%S"; }
step_count=0

# 美化輸出函數
header() {
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${CYAN}$ICON_ROCKET ForumKit Maintenance Restart${RESET}\n"
    printf "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${DIM}開始時間: $(date)${RESET}\n\n"
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

spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# ===============================================================================
# 🔧 環境檢查與配置
# ===============================================================================
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
DATA_DIR="$PROJECT_ROOT/data"
BACKUP_DIR="$PROJECT_ROOT/backups"

# 檢查必要工具
check_requirements() {
    info "檢查系統環境..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker 未安裝或不在 PATH 中"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose 未安裝或不在 PATH 中"
        exit 1
    fi
    
    if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        error "在 $PROJECT_ROOT 中找不到 docker-compose.yml"
        exit 1
    fi
    
    success "環境檢查完成"
}

# ===============================================================================
# 💾 資料庫保護
# ===============================================================================
protect_database() {
    step "保護資料庫資料"
    
    info "檢查資料庫目錄..."
    if [ ! -d "$DATA_DIR" ]; then
        warning "資料庫目錄不存在，跳過保護步驟"
        return 0
    fi
    
    # 創建備份目錄
    mkdir -p "$BACKUP_DIR"
    
    # 檢查是否有現有資料庫檔案
    local db_files
    db_files=$(find "$DATA_DIR" -name "*.db" -type f 2>/dev/null || true)
    
    if [ -n "$db_files" ]; then
        info "發現資料庫檔案，創建保護備份..."
        
        local timestamp
        timestamp=$(date +"%Y%m%d_%H%M%S")
        local backup_path="$BACKUP_DIR/db_protection_$timestamp"
        
        mkdir -p "$backup_path"
        
        # 複製資料庫檔案
        cp -r "$DATA_DIR"/*.db "$backup_path/" 2>/dev/null || true
        
        success "資料庫保護備份完成: $backup_path"
        info "備份包含: $(ls -la "$backup_path"/*.db 2>/dev/null | wc -l) 個資料庫檔案"
    else
        info "未發現資料庫檔案，無需保護"
    fi
}

# ===============================================================================
# 🚀 前後端重建流程
# ===============================================================================
check_services_status() {
    info "檢查服務當前狀態..."
    
    local running_services
    running_services=$(docker compose ps --services --filter "status=running" 2>/dev/null || true)
    
    if [ -n "$running_services" ]; then
        success "發現運行中的服務，將進行重啟"
        return 0  # 有服務運行，需要重啟
    else
        info "未發現運行中的服務，將執行啟動流程"
        return 1  # 沒有服務運行，需要啟動
    fi
}

rebuild_services() {
    step "重建前後端服務"
    
    local is_restart=false
    if check_services_status; then
        is_restart=true
        info "停止現有服務..."
        docker compose down --timeout 30
        success "服務已停止"
    else
        info "服務未運行，將直接啟動"
    fi
    
    if [ "$is_restart" = true ]; then
        info "清理舊的容器和網路..."
        docker system prune -f --volumes
        success "清理完成"
    else
        info "跳過清理步驟（首次啟動）"
    fi
    
    info "清理前端舊版編譯產物 (frontend/dist)..."
    if [ -d "$PROJECT_ROOT/frontend/dist" ]; then
        rm -rf "$PROJECT_ROOT/frontend/dist"
        success "已刪除 frontend/dist"
    else
        info "未發現 frontend/dist，略過"
    fi

    # 嘗試先行建置前端，避免 Nginx 找不到資產造成 500
    step "前端建置 (生成 frontend/dist)"
    if [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
        if command -v npm >/dev/null 2>&1; then
            info "使用本機 npm 進行建置..."
            (cd "$PROJECT_ROOT/frontend" && npm ci && npm run build)
            # 確保檔案可被 Web 服務讀取
            chmod -R a+r "$PROJECT_ROOT/frontend/dist" 2>/dev/null || true
            success "本機前端建置完成"
        else
            info "本機缺少 npm，改用 Docker 建置（若有 frontend 服務）..."
            docker compose build frontend || info "找不到 frontend 服務，略過映像建置"
        fi
    else
        info "未找到 frontend/package.json，略過前端建置"
    fi
    
    if [ "$is_restart" = true ]; then
        info "重建並啟動服務..."
        docker compose up -d --build
        success "服務重建完成"
    else
        info "啟動服務..."
        docker compose up -d --build
        success "服務啟動完成"
    fi
}

wait_for_services() {
    step "等待服務就緒"
    
    info "等待服務啟動..."
    sleep 15
    
    local max_attempts=45
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker compose ps | grep -q "Up"; then
            success "服務已就緒"
            return 0
        fi
        
        info "等待服務啟動... (嘗試 $attempt/$max_attempts)"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    warning "服務啟動超時，繼續執行..."
}

# ===============================================================================
# 🌐 安裝 HTML 渲染瀏覽器（Playwright Chromium）
# ===============================================================================
install_playwright_browsers() {
    step "安裝 HTML 渲染瀏覽器 (Playwright Chromium)"

    local targets=(backend celery celery-beat)
    for svc in "${targets[@]}"; do
        if docker compose ps "${svc}" 2>/dev/null | grep -q "Up"; then
            info "為 ${svc} 檢查/安裝 Playwright Chromium..."
            # 盡量不因安裝失敗中斷整體流程
            if docker compose exec -T "${svc}" bash -lc "python -m playwright --version" >/dev/null 2>&1; then
                docker compose exec -T "${svc}" bash -lc "python -m playwright install chromium || python -m playwright install --with-deps chromium" >/dev/null 2>&1 \
                    && success "${svc}: Chromium 安裝/檢查完成" \
                    || warning "${svc}: Chromium 安裝可能失敗，後續若渲染失敗請手動執行 'python -m playwright install chromium'"
            else
                warning "${svc}: 未找到 Playwright 指令，可能尚未更新映像或未安裝相依（requirements）。"
            fi
        else
            info "跳過 ${svc}（未在運行）"
        fi
    done

    info "如使用系統自帶瀏覽器，也可設定環境變數 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指向執行檔。"
}

# ===============================================================================
# 🧩 安裝 Chromium 執行期相依套件（容器內）
# ===============================================================================
install_browser_runtime_deps() {
    step "安裝 Chromium 執行期相依 (容器內 apt)"

    local pkgs=(
        libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libatspi2.0-0 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libdrm2 libexpat1 \
        libxcb1 libx11-6 libxext6 ca-certificates
    )

    local targets=(backend celery celery-beat)
    for svc in "${targets[@]}"; do
        if docker compose ps "${svc}" 2>/dev/null | grep -q "Up"; then
            info "為 ${svc} 安裝系統相依..."
            docker compose exec -T "${svc}" bash -lc "apt-get update && apt-get install -y --no-install-recommends ${pkgs[*]} && rm -rf /var/lib/apt/lists/*" \
                && success "${svc}: 執行期相依安裝完成" \
                || warning "${svc}: 相依安裝失敗，請檢查網路或套件來源"
        else
            info "跳過 ${svc}（未在運行）"
        fi
    done
}

# ===============================================================================
# 🔍 健康檢查與驗證
# ===============================================================================
health_check() {
    step "執行健康檢查"
    
    info "檢查後端健康狀態..."
    if command -v curl &> /dev/null; then
        local max_attempts=15
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            if curl -s http://localhost:12005/api/healthz &> /dev/null; then
                success "後端健康檢查通過"
                break
            fi
            
            info "等待後端就緒... (嘗試 $attempt/$max_attempts)"
            sleep 3
            attempt=$((attempt + 1))
        done
        
        if [ $attempt -gt $max_attempts ]; then
            warning "後端健康檢查超時"
        fi
    else
        info "curl 未安裝，跳過 HTTP 健康檢查"
    fi
    
    info "檢查資料庫連接..."
    if docker compose exec -T backend python -c "from app import db; print('Database OK')" 2>/dev/null; then
        success "資料庫連接正常"
    else
        warning "資料庫連接檢查失敗"
    fi
}

verify_services() {
    step "驗證服務狀態"
    
    info "檢查容器狀態..."
    local unhealthy_containers
    unhealthy_containers=$(docker compose ps --format "table {{.Name}}\t{{.Status}}" | grep -v "Up" | grep -v "NAME" || true)
    
    if [ -n "$unhealthy_containers" ]; then
        warning "發現異常容器："
        echo "$unhealthy_containers" | while read -r line; do
            warning "  $line"
        done
    else
        success "所有容器運行正常"
    fi
    
    info "檢查資料庫檔案完整性..."
    local db_files
    db_files=$(find "$DATA_DIR" -name "*.db" -type f 2>/dev/null || true)
    
    if [ -n "$db_files" ]; then
        success "資料庫檔案完整保留"
        info "保留的資料庫: $(echo "$db_files" | wc -l) 個"
    else
        warning "未發現資料庫檔案"
    fi
    
    show_status
}

# ===============================================================================
# 📊 完成報告
# ===============================================================================
show_summary() {
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${GREEN}$ICON_OK 維護重啟完成${RESET}\n"
    printf "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${DIM}完成時間: $(date)${RESET}\n"
    printf "${DIM}總步驟數: $step_count${RESET}\n\n"
    
    printf "${CYAN}📋 執行摘要:${RESET}\n"
    printf "  • 資料庫保護完成\n"
    printf "  • 前後端服務重建\n"
    printf "  • 服務啟動/重啟完成\n"
    printf "  • 健康檢查執行\n"
    printf "  • 資料庫資料保留\n\n"
    
    printf "${CYAN}🔗 有用連結:${RESET}\n"
    printf "  • 管理後台: http://localhost:12005/admin\n"
    printf "  • API 文檔: http://localhost:12005/api/docs\n"
    printf "  • 健康檢查: http://localhost:12005/api/healthz\n\n"
    
    if [ -d "$BACKUP_DIR" ]; then
        local backup_count
        backup_count=$(find "$BACKUP_DIR" -name "db_protection_*" -type d | wc -l)
        if [ "$backup_count" -gt 0 ]; then
            printf "${CYAN}💾 備份資訊:${RESET}\n"
            printf "  • 保護備份數量: $backup_count\n"
            printf "  • 備份目錄: $BACKUP_DIR\n\n"
        fi
    fi
}

# ===============================================================================
# 🚨 錯誤處理
# ===============================================================================
handle_error() {
    local exit_code=$?
    local line_number=$1
    
    printf "\n${RED}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${RED}$ICON_ERROR 腳本執行失敗${RESET}\n"
    printf "${RED}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${RED}錯誤位置: 第 $line_number 行${RESET}\n"
    printf "${RED}退出碼: $exit_code${RESET}\n\n"
    
    printf "${YELLOW}🔧 故障排除建議:${RESET}\n"
    printf "  1. 檢查 Docker 服務狀態: systemctl status docker\n"
    printf "  2. 檢查磁碟空間: df -h\n"
    printf "  3. 檢查日誌: docker compose logs\n"
    printf "  4. 檢查資料庫備份: ls -la $BACKUP_DIR\n"
    printf "  5. 重試執行腳本\n\n"
    
    exit $exit_code
}

# 設置錯誤處理
trap 'handle_error $LINENO' ERR

# ===============================================================================
# 🎯 主程序
# ===============================================================================
main() {
    header
    
    # 檢查當前服務狀態
    local running_services
    running_services=$(docker compose ps --services --filter "status=running" 2>/dev/null | wc -l)
    
    if [ "$running_services" -gt 0 ]; then
        info "開始執行維護重啟流程..."
        info "此腳本將重建前後端服務但保留資料庫資料"
    else
        info "開始執行服務啟動流程..."
        info "檢測到服務未運行，將執行啟動程序"
    fi
    
    check_requirements
    protect_database
    rebuild_services
    wait_for_services
    install_browser_runtime_deps
    install_playwright_browsers
    health_check
    verify_services
    show_summary
    
    if [ "$running_services" -gt 0 ]; then
        printf "${GREEN}🎉 維護重啟成功完成！${RESET}\n\n"
    else
        printf "${GREEN}🎉 服務啟動成功完成！${RESET}\n\n"
    fi
}

# 執行主程序
main "$@"
