#!/usr/bin/env bash
# ===============================================================================
# 🩺 Serelix Studio ForumKit - 系統健康檢查
# ===============================================================================
# 功能：全面的系統健康狀態檢查
# 用途：監控腳本、故障排查、運維檢查
set -euo pipefail

# ===============================================================================
# 🎨 UI 美化
# ===============================================================================
IS_TTY=0; [ -t 1 ] && IS_TTY=1

if [ -n "${NO_COLOR:-}" ] || [ "${IS_TTY}" -eq 0 ]; then
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' DIM='' BOLD='' RESET=''
else
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m' 
    CYAN='\033[0;36m' DIM='\033[2m' BOLD='\033[1m' RESET='\033[0m'
fi

# 配置
API_ENDPOINT="${API_ENDPOINT:-http://localhost:12005/api}"
CDN_PORT="${CDN_PORT:-12002}"

# 工具函數
timestamp() { date +"%H:%M:%S"; }
header() {
    printf "\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${BLUE}🩺 ForumKit 系統健康檢查${RESET}\n"
    printf "${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${DIM}檢查時間: $(date)${RESET}\n\n"
}

section() {
    printf "\n${BLUE}┌─ %s ${DIM}[%s]${RESET}\n" "$*" "$(timestamp)"
    printf "${BLUE}├─${RESET}\n"
}

success() { printf "${BLUE}│${RESET} ${GREEN}✅ %s${RESET}\n" "$*"; }
warning() { printf "${BLUE}│${RESET} ${YELLOW}⚠️  %s${RESET}\n" "$*"; }
error() { printf "${BLUE}│${RESET} ${RED}❌ %s${RESET}\n" "$*"; }
info() { printf "${BLUE}│${RESET} ${CYAN}ℹ️  %s${RESET}\n" "$*"; }

end_section() {
    printf "${BLUE}└─${RESET}\n"
}

# ===============================================================================
# 健康檢查項目
# ===============================================================================
check_docker_services() {
    section "Docker 服務狀態"
    
    if command -v docker >/dev/null 2>&1; then
        success "Docker 已安裝"
    else
        error "Docker 未安裝"
        end_section
        return 1
    fi
    
    if docker compose ps >/dev/null 2>&1; then
        success "Docker Compose 正常運行"
        
        # 檢查各個服務狀態
        while IFS= read -r line; do
            if echo "$line" | grep -qi "up"; then
                service_name=$(echo "$line" | awk '{print $1}')
                success "服務 $service_name 運行正常"
            elif echo "$line" | grep -qi "exited\|dead"; then
                service_name=$(echo "$line" | awk '{print $1}')
                error "服務 $service_name 已停止"
            fi
        done < <(docker compose ps 2>/dev/null | tail -n +2)
    else
        error "Docker Compose 未運行或有問題"
        end_section
        return 1
    fi
    
    end_section
    return 0
}

check_api_health() {
    section "API 健康狀態"
    
    if curl -fsS "$API_ENDPOINT/healthz" >/dev/null 2>&1; then
        success "API 端點可達"
        
        # 獲取詳細健康資訊
        health_data=$(curl -fsS "$API_ENDPOINT/healthz" 2>/dev/null || echo '{}')
        
        if command -v jq >/dev/null 2>&1; then
            # 如果有 jq，嘗試解析 JSON
            db_status=$(echo "$health_data" | jq -r '.database // "unknown"' 2>/dev/null)
            redis_status=$(echo "$health_data" | jq -r '.redis // "unknown"' 2>/dev/null)
            
            if [ "$db_status" = "ok" ]; then
                success "資料庫連接正常"
            elif [ "$db_status" != "unknown" ]; then
                warning "資料庫狀態: $db_status"
            fi
            
            if [ "$redis_status" = "ok" ]; then
                success "Redis 連接正常"
            elif [ "$redis_status" != "unknown" ]; then
                warning "Redis 狀態: $redis_status"
            fi
        else
            info "API 回應: $health_data"
        fi
    else
        error "API 端點無法訪問 ($API_ENDPOINT/healthz)"
    fi
    
    end_section
}

check_frontend_access() {
    section "前端服務"
    
    if curl -fsS "http://localhost:12005/" >/dev/null 2>&1; then
        success "前端頁面可訪問"
    else
        error "前端頁面無法訪問"
    fi
    
    end_section
}

check_cdn_service() {
    section "CDN 服務"
    
    # 檢查CDN服務是否響應
    if curl -fsS "http://localhost:$CDN_PORT/dev_rebuild_check.txt" >/dev/null 2>&1; then
        success "CDN 服務正常 (端口 $CDN_PORT)"
    else
        warning "CDN 服務可能有問題，請檢查配置"
    fi
    
    end_section
}

check_file_permissions() {
    section "文件權限檢查"
    
    if [ -d "./uploads" ]; then
        if [ -r "./uploads/public" ]; then
            success "uploads/public 目錄可讀"
        else
            warning "uploads/public 目錄不可讀"
        fi
        
        if [ -w "./uploads/pending" ]; then
            success "uploads/pending 目錄可寫"
        else
            warning "uploads/pending 目錄不可寫"
        fi
    else
        warning "uploads 目錄不存在"
    fi
    
    end_section
}

check_disk_space() {
    section "磁碟空間"
    
    # 檢查根目錄空間
    root_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$root_usage" -lt 80 ]; then
        success "根目錄磁碟使用率: ${root_usage}%"
    elif [ "$root_usage" -lt 90 ]; then
        warning "根目錄磁碟使用率偏高: ${root_usage}%"
    else
        error "根目錄磁碟空間不足: ${root_usage}%"
    fi
    
    # 檢查 Docker 磁碟使用
    if command -v docker >/dev/null 2>&1; then
        docker_usage=$(docker system df --format "table {{.Size}}" 2>/dev/null | tail -n +2 | head -1 || echo "unknown")
        info "Docker 磁碟使用: $docker_usage"
    fi
    
    end_section
}

check_logs() {
    section "日誌檢查"
    
    if docker compose logs backend --tail=5 2>/dev/null | grep -qi "error\|exception\|failed"; then
        warning "後端日誌中發現錯誤訊息"
        info "最近的後端日誌:"
        docker compose logs backend --tail=3 2>/dev/null | while IFS= read -r line; do
            printf "${BLUE}│${RESET}   ${DIM}%s${RESET}\n" "$line"
        done
    else
        success "後端日誌正常"
    fi
    
    end_section
}

# ===============================================================================
# 主要執行流程
# ===============================================================================
main() {
    header
    
    local exit_code=0
    
    # 執行所有檢查
    check_docker_services || exit_code=1
    check_api_health || exit_code=1
    check_frontend_access || exit_code=1
    check_cdn_service || true  # CDN 失敗不影響整體狀態
    check_file_permissions || true
    check_disk_space || true
    check_logs || true
    
    # 總結報告
    printf "\n${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    
    if [ $exit_code -eq 0 ]; then
        printf "${BOLD}${GREEN}✅ 系統健康狀態良好${RESET}\n"
    else
        printf "${BOLD}${YELLOW}⚠️  發現系統問題，請檢查上述錯誤${RESET}\n"
    fi
    
    printf "\n${BOLD}${CYAN}🔗 服務端點:${RESET}\n"
    printf "  • Frontend: ${BOLD}http://localhost:12005/${RESET}\n"
    printf "  • API:      ${BOLD}%s/healthz${RESET}\n" "$API_ENDPOINT"
    printf "  • CDN:      ${BOLD}http://localhost:%s/${RESET}\n" "$CDN_PORT"
    
    printf "${CYAN}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    
    return $exit_code
}

# 執行主函數
main "$@"