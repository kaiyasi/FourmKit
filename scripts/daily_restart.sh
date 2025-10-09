#!/usr/bin/env bash
# ===============================================================================
# 🚀 Serelix Studio ForumKit - 日常重啟腳本
# ===============================================================================
# 功能：服務重啟 -> 健康檢查 -> 狀態驗證
# 適用：日常維護，不變更任何檔案，僅重啟服務
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
ICON_RESTART="🔄" ICON_CHECK="🔍" ICON_HEALTH="💚" ICON_TIME="⏰"

# 時間戳與步驟計數
timestamp() { date +"%H:%M:%S"; }
step_count=0

# 美化輸出函數
header() {
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${CYAN}$ICON_ROCKET ForumKit Daily Restart${RESET}\n"
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
# 🚀 主要重啟流程
# ===============================================================================
restart_services() {
    step "重啟所有服務"
    
    info "停止現有服務..."
    docker compose down --timeout 30
    
    success "服務已停止"
    
    info "啟動所有服務..."
    docker compose up -d
    
    success "服務啟動完成"
}

wait_for_services() {
    step "等待服務就緒"
    
    info "等待服務啟動..."
    sleep 10
    
    local max_attempts=30
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

health_check() {
    step "執行健康檢查"
    
    info "檢查後端健康狀態..."
    if command -v curl &> /dev/null; then
        local max_attempts=10
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
    
    show_status
}

# ===============================================================================
# 📊 完成報告
# ===============================================================================
show_summary() {
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${GREEN}$ICON_OK 日常重啟完成${RESET}\n"
    printf "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${DIM}完成時間: $(date)${RESET}\n"
    printf "${DIM}總步驟數: $step_count${RESET}\n\n"
    
    printf "${CYAN}📋 執行摘要:${RESET}\n"
    printf "  • 服務重啟完成\n"
    printf "  • 健康檢查執行\n"
    printf "  • 狀態驗證完成\n"
    printf "  • 無檔案變更\n\n"
    
    printf "${CYAN}🔗 有用連結:${RESET}\n"
    printf "  • 管理後台: http://localhost:12005/admin\n"
    printf "  • API 文檔: http://localhost:12005/api/docs\n"
    printf "  • 健康檢查: http://localhost:12005/api/healthz\n\n"
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
    printf "  4. 重試執行腳本\n\n"
    
    exit $exit_code
}

# 設置錯誤處理
trap 'handle_error $LINENO' ERR

# ===============================================================================
# 🎯 主程序
# ===============================================================================
main() {
    header
    
    info "開始執行日常重啟流程..."
    info "此腳本將重啟所有服務但不變更任何檔案"
    
    check_requirements
    restart_services
    wait_for_services
    health_check
    verify_services
    show_summary
    
    printf "${GREEN}🎉 日常重啟成功完成！${RESET}\n\n"
}

# 執行主程序
main "$@"