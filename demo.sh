#!/bin/bash
# ForumKit 一鍵演示腳本
# 自動建置、啟動、健康檢查、Socket與API測試

set -e

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
DEMO_TIMEOUT=180  # 3分鐘超時
API_BASE_URL="http://localhost:12005"
CDN_BASE_URL="http://localhost:12002"

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] INFO:${NC} $1"
}

# 檢查先決條件
check_prerequisites() {
    log "檢查系統先決條件..."
    
    # 檢查 Docker
    if ! command -v docker &> /dev/null; then
        error "Docker 未安裝。請安裝 Docker。"
        echo "安裝指引: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # 檢查 Docker Compose
    if ! docker compose version &> /dev/null; then
        error "Docker Compose 未安裝。請安裝 Docker Compose。"
        echo "安裝指引: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # 檢查 Python 3.12+ (用於測試腳本)
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        info "Python 版本: $PYTHON_VERSION"
    else
        warn "Python3 未找到，將跳過某些測試"
    fi
    
    # 檢查必要檔案
    if [ ! -f "docker-compose.yml" ]; then
        error "docker-compose.yml 未找到。請確認在 ForumKit 專案根目錄執行。"
        exit 1
    fi
    
    log "✓ 先決條件檢查完成"
}

# 創建環境配置
create_env_config() {
    log "創建環境配置..."
    
    if [ ! -f ".env" ]; then
        info "創建 .env 檔案..."
        cat > .env << EOF
# ForumKit Demo Environment
JWT_SECRET_KEY=demo_jwt_secret_$(date +%s)
PASSWORD_SALT_ROUNDS=12
APP_MODE=development

# Port Configuration
HOST_PORT=12005
CDN_PORT=12002
POSTGRES_PORT=12007
REDIS_PORT=12008

# Database
DATABASE_URL=postgresql+psycopg2://forumkit:forumkit@postgres:80/forumkit
REDIS_URL=redis://redis:80/0

# Upload Configuration
UPLOAD_ROOT=/data/uploads
UPLOAD_MAX_SIZE_MB=10

# Security
ALLOWED_ORIGINS=http://localhost:12005
SOCKETIO_ORIGINS=http://localhost:12005

# Demo Configuration
ENFORCE_SINGLE_ADMIN=0
ADMIN_NOTIFY_WEBHOOK=

# Optional: Instagram & Discord (for demo)
INSTAGRAM_CLIENT_ID=demo_client_id
INSTAGRAM_CLIENT_SECRET=demo_client_secret
EOF
        log "✓ 環境配置檔案已創建"
    else
        info "使用現有的 .env 檔案"
    fi
}

# 清理舊服務
cleanup_services() {
    log "清理舊服務..."
    
    if docker compose ps | grep -q "Up"; then
        info "停止現有服務..."
        docker compose down
    fi
    
    # 清理未使用的資源 (可選)
    if [ "$CLEAN_BUILD" = "1" ]; then
        warn "執行完整清理 (CLEAN_BUILD=1)..."
        docker compose down -v
        docker system prune -f
    fi
    
    log "✓ 清理完成"
}

# 建置和啟動服務
build_and_start() {
    log "建置和啟動 ForumKit 服務..."
    
    # 建置並啟動
    info "執行 docker compose up --build..."
    if ! timeout $DEMO_TIMEOUT docker compose up -d --build; then
        error "服務建置或啟動失敗"
        show_service_logs
        exit 1
    fi
    
    log "✓ 服務已啟動"
}

# 等待服務就緒
wait_for_services() {
    log "等待服務就緒..."
    
    local max_wait=120
    local wait_interval=5
    local elapsed=0
    
    while [ $elapsed -lt $max_wait ]; do
        if check_services_health; then
            log "✓ 所有服務已就緒"
            return 0
        fi
        
        info "等待服務啟動... (${elapsed}s/${max_wait}s)"
        sleep $wait_interval
        elapsed=$((elapsed + wait_interval))
    done
    
    error "服務啟動超時"
    show_service_status
    return 1
}

# 檢查服務健康狀態
check_services_health() {
    local all_healthy=true
    
    # 檢查 API
    if curl -f -s "$API_BASE_URL/api/status" > /dev/null 2>&1; then
        # OK
        :
    else
        all_healthy=false
    fi
    
    # 檢查前端
    if curl -f -s "$API_BASE_URL/" | grep -q "html" 2>/dev/null; then
        # OK
        :
    else
        all_healthy=false
    fi
    
    # 檢查 CDN (可能返回 403，但應該響應)
    if curl -s "$CDN_BASE_URL/" > /dev/null 2>&1; then
        # OK
        :
    else
        all_healthy=false
    fi
    
    $all_healthy
}

# 執行 Socket 演示測試
run_socket_demo() {
    log "執行 Socket 演示測試..."
    
    if ! command -v python3 &> /dev/null; then
        warn "Python3 未安裝，跳過 Socket 測試"
        return 0
    fi
    
    # 測試原生 Socket (心跳檢查)
    info "測試原生 Socket 心跳服務 (port 9101)..."
    if timeout 5 bash -c 'echo "ping" | nc localhost 9101' | grep -q "pong"; then
        log "✓ 原生 Socket 心跳測試通過"
    else
        warn "原生 Socket 心跳測試失敗 (可能服務未啟動)"
    fi
    
    # 測試 Socket 演示程序
    info "執行 Socket 演示程序..."
    if python3 tools/socket_demo/client.py test; then
        log "✓ Socket 演示測試通過"
    else
        warn "Socket 演示測試失敗"
        return 1
    fi
}

# 執行 API 基本測試
run_api_tests() {
    log "執行 API 基本測試..."
    
    # 測試 API 狀態端點
    info "測試 API 狀態端點..."
    if curl -f -s "$API_BASE_URL/api/status" | grep -q "status"; then
        log "✓ API 狀態端點測試通過"
    else
        error "API 狀態端點測試失敗"
        return 1
    fi
    
    # 測試健康檢查端點
    info "測試健康檢查端點..."
    if curl -f -s "$API_BASE_URL/api/healthz" > /dev/null; then
        log "✓ 健康檢查端點測試通過"
    else
        warn "健康檢查端點測試失敗"
    fi
    
    # 測試貼文列表 API
    info "測試貼文列表 API..."
    if curl -f -s "$API_BASE_URL/api/posts/list" > /dev/null; then
        log "✓ 貼文列表 API 測試通過"
    else
        warn "貼文列表 API 測試失敗"
    fi
}

# 執行自動化驗收測試
run_acceptance_tests() {
    log "執行自動化驗收測試..."
    
    if ! command -v python3 &> /dev/null; then
        warn "Python3 未安裝，跳過驗收測試"
        return 0
    fi
    
    # 安裝測試依賴
    if ! pip3 list | grep -q requests; then
        info "安裝測試依賴..."
        pip3 install --user requests > /dev/null 2>&1
    fi
    
    # 執行健康檢查
    info "執行健康檢查腳本..."
    if python3 acceptance/check_health.py; then
        log "✓ 健康檢查通過"
    else
        warn "健康檢查部分失敗"
    fi
    
    # 執行核心流程測試
    info "執行核心流程測試..."
    if python3 acceptance/check_core_flows.py; then
        log "✓ 核心流程測試通過"
    else
        warn "核心流程測試部分失敗"
    fi
}

# 顯示服務狀態
show_service_status() {
    echo ""
    echo "=== 服務狀態 ==="
    docker compose ps
    echo ""
}

# 顯示服務日誌
show_service_logs() {
    echo ""
    echo "=== 服務日誌 (最後20行) ==="
    for service in backend frontend nginx postgres redis cdn; do
        echo "--- $service ---"
        docker compose logs --tail=20 $service 2>/dev/null || echo "日誌不可用"
    done
    echo ""
}

# 顯示演示總結
show_demo_summary() {
    echo ""
    echo "========================================="
    echo "🎉 ForumKit 演示完成!"
    echo "========================================="
    echo ""
    echo "📋 服務狀態:"
    docker compose ps
    echo ""
    echo "🌐 服務連結:"
    echo "  • 主應用:    $API_BASE_URL"
    echo "  • CDN服務:   $CDN_BASE_URL" 
    echo "  • API狀態:   $API_BASE_URL/api/status"
    echo "  • 健康檢查:  $API_BASE_URL/api/healthz"
    echo ""
    echo "🔧 管理指令:"
    echo "  • 查看日誌: docker compose logs -f [服務名]"
    echo "  • 停止服務: docker compose down"
    echo "  • 重啟服務: docker compose restart"
    echo ""
    echo "🧪 測試指令:"
    echo "  • Socket測試: python3 tools/socket_demo/client.py test"
    echo "  • 健康檢查: python3 acceptance/check_health.py"
    echo "  • 核心測試: python3 acceptance/check_core_flows.py"
    echo ""
    echo "📚 更多資訊請參考:"
    echo "  • README.md - 完整文檔"
    echo "  • docs/reviewer_5min_guide.md - 5分鐘評審導覽"
    echo "  • docs/architecture.md - 系統架構"
    echo ""
    
    # 顯示資源使用情況
    echo "💻 資源使用:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "無法獲取資源統計"
    echo ""
    
    echo "✅ 演示腳本執行完畢"
    echo "========================================="
}

# 主函數
main() {
    echo "🚀 ForumKit 一鍵演示開始"
    echo "========================================"
    
    # 處理命令列參數
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clean)
                export CLEAN_BUILD=1
                shift
                ;;
            --no-tests)
                export SKIP_TESTS=1
                shift
                ;;
            --help)
                echo "ForumKit 演示腳本"
                echo "用法: $0 [選項]"
                echo ""
                echo "選項:"
                echo "  --clean     清理現有容器和資源"
                echo "  --no-tests  跳過測試階段"
                echo "  --help      顯示此幫助"
                exit 0
                ;;
            *)
                warn "未知選項: $1"
                shift
                ;;
        esac
    done
    
    # 執行演示步驟
    check_prerequisites
    create_env_config
    cleanup_services
    build_and_start
    
    if ! wait_for_services; then
        error "服務啟動失敗，演示中止"
        show_service_logs
        exit 1
    fi
    
    # 執行測試 (除非跳過)
    if [ "$SKIP_TESTS" != "1" ]; then
        run_socket_demo
        run_api_tests
        run_acceptance_tests
    else
        info "跳過測試階段 (--no-tests)"
    fi
    
    show_demo_summary
}

# 錯誤處理
trap 'error "演示腳本異常終止"; exit 1' ERR

# 執行主函數
main "$@"