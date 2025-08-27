#!/usr/bin/env bash
# ===============================================================================
# 🚀 Serelix Studio ForumKit - 開發環境完整重建腳本
# ===============================================================================
# 功能：清理 -> 建置 -> 部署 -> 初始化 -> 驗證
# 適用：開發環境的乾淨重建，清除所有數據重新開始
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
ICON_CLEAN="🧹" ICON_BUILD="🔨" ICON_DEPLOY="📦" ICON_CHECK="🔍"

# 時間戳與步驟計數
timestamp() { date +"%H:%M:%S"; }
step_count=0

# 美化輸出函數
header() {
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    printf "${BOLD}${CYAN}$ICON_ROCKET ForumKit Development Environment Rebuild${RESET}\n"
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
# 🔧 權限管理與文件系統工具
# ===============================================================================
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
UPLOADS_DIR="$PROJECT_ROOT/uploads"
WEB_USER="${WEB_USER:-www-data}"
WEB_GROUP="${WEB_GROUP:-www-data}"

# 檢查檔案系統類型
detect_filesystem() {
    findmnt -no FSTYPE "$UPLOADS_DIR" 2>/dev/null || echo "unknown"
}

# 智能權限修復（避免 sudo 提示）
smart_permissions_fix() {
    info "檢測文件系統權限支援..."
    
    mkdir -p "$UPLOADS_DIR"/{public,pending,pages} 2>/dev/null || true
    
    local fs_type
    fs_type="$(detect_filesystem)"
    info "檔案系統類型: $fs_type"
    
    # 測試是否可以直接 chown（無需 sudo）
    if touch "$UPLOADS_DIR/.perm_test" 2>/dev/null && \
       chown "$WEB_USER:$WEB_GROUP" "$UPLOADS_DIR/.perm_test" 2>/dev/null; then
        rm -f "$UPLOADS_DIR/.perm_test"
        info "使用直接權限設定..."
        chown -R "$WEB_USER:$WEB_GROUP" "$UPLOADS_DIR" 2>/dev/null || true
        find "$UPLOADS_DIR" -type d -exec chmod 755 {} \; 2>/dev/null || true
        find "$UPLOADS_DIR" -type f -exec chmod 644 {} \; 2>/dev/null || true
        success "權限設定完成（chown/chmod）"
    elif command -v setfacl >/dev/null 2>&1; then
        warning "切換到 ACL 權限模式..."
        setfacl -Rm "u:$WEB_USER:rx,d:u:$WEB_USER:rx" "$UPLOADS_DIR" 2>/dev/null || true
        for subdir in public pending pages; do
            setfacl -Rm "u:$WEB_USER:rwx,d:u:$WEB_USER:rwx" "$UPLOADS_DIR/$subdir" 2>/dev/null || true
        done
        success "ACL 權限配置完成"
    else
        warning "無法自動設定權限，可能需要手動配置"
        info "建議: 1) 使用 bind mount 到 ext4  2) 調整 NAS 掛載參數"
    fi
    
    # 創建測試文件（使用 tee 避免權限問題）
    echo "rebuild_check_$(date +%s)" | tee "$UPLOADS_DIR/public/dev_rebuild_check.txt" >/dev/null 2>&1 || true
    chmod 644 "$UPLOADS_DIR/public/dev_rebuild_check.txt" 2>/dev/null || true
}

# 容器內權限驗證
verify_container_permissions() {
    local service="$1"
    local container_path="$2"
    
    if ! docker compose ps "$service" 2>/dev/null | grep -qi "up"; then
        warning "服務 $service 未運行，略過容器內驗證"
        return 0
    fi
    
    if docker compose exec -T "$service" test -r "$container_path/public/dev_rebuild_check.txt" 2>/dev/null; then
        success "容器 $service 可正常讀取 $container_path"
    else
        warning "容器 $service 讀取 $container_path 可能有問題"
        # 嘗試在容器內修復
        docker compose exec -T "$service" sh -c "
            chown -R $WEB_USER:$WEB_GROUP '$container_path' 2>/dev/null || true
            find '$container_path' -type d -exec chmod 755 {} \\; 2>/dev/null || true
            find '$container_path' -type f -exec chmod 644 {} \\; 2>/dev/null || true
        " 2>/dev/null && info "容器內權限已修復" || warning "容器內權限修復失敗"
    fi
}

# ===============================================================================
# 🚀 主要執行流程
# ===============================================================================
start_time=$(date +%s)

# 退出時的清理與報告
cleanup_and_report() {
    local exit_code=$?
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    printf "\n${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
    
    if [ $exit_code -eq 0 ]; then
        printf "${BOLD}${GREEN}$ICON_OK 重建完成！${RESET} ${DIM}(耗時 ${duration}s)${RESET}\n"
        show_status
        
        printf "\n${BOLD}${CYAN}🌐 服務端點:${RESET}\n"
        printf "  • Frontend: ${BOLD}http://localhost:12005/${RESET}\n"
        printf "  • CDN:      ${BOLD}http://localhost:${CDN_PORT:-12002}/${RESET}\n"
        printf "  • API:      ${BOLD}http://localhost:12005/api/healthz${RESET}\n"
        
        if [ "${ENFORCE_SINGLE_ADMIN:-1}" = "0" ]; then
            printf "\n${BOLD}${YELLOW}👤 開發帳號:${RESET}\n"
            printf "  • 帳號: ${BOLD}%s${RESET}\n" "${ADMIN_USER:-Kaiyasi}"
            printf "  • 密碼: ${BOLD}%s${RESET}\n" "${ADMIN_PASS:-change-me}"
        fi
    else
        printf "${BOLD}${RED}$ICON_ERROR 重建失敗！${RESET} ${DIM}(退出碼: $exit_code, 耗時: ${duration}s)${RESET}\n"
        show_status
        warning "請檢查錯誤日誌: docker compose logs --tail=50 backend"
    fi
    
    printf "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════${RESET}\n"
}

trap cleanup_and_report EXIT

# ===============================================================================
# 開始執行
# ===============================================================================
header

# STEP 1: 預檢與權限設定
step "$ICON_CHECK 預檢環境與權限設定"
smart_permissions_fix

# STEP 2: 清理環境
step "$ICON_CLEAN 清理現有環境"
info "停止所有服務並清除數據卷..."
docker compose down -v >/dev/null 2>&1 || true
success "Docker 環境已清理"

if [ -d "$PROJECT_ROOT/frontend/dist" ]; then
    info "清理前端構建產物..."
    rm -rf "$PROJECT_ROOT/frontend/dist" || true
    success "前端產物已清理"
fi

# STEP 3: 前端構建
if [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
    step "$ICON_BUILD 構建前端資源"
    
    # 智能選擇構建方式
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
            (cd "$PROJECT_ROOT/frontend" && npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1)
            success "前端構建完成（本地 Node.js）"
        else
            warning "Node.js $node_version 版本過舊，使用容器構建..."
            docker run --rm -v "$PROJECT_ROOT/frontend:/app" -w /app node:22-bookworm \
                bash -c 'npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1'
            success "前端構建完成（容器模式）"
        fi
    else
        info "未檢測到 Node.js，使用容器構建..."
        docker run --rm -v "$PROJECT_ROOT/frontend:/app" -w /app node:22-bookworm \
            bash -c 'npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1'
        success "前端構建完成（容器模式）"
    fi
fi

# STEP 4: 部署服務
step "$ICON_DEPLOY 部署 Docker 服務"
info "構建並啟動所有服務..."
docker compose up -d --build >/dev/null 2>&1
success "Docker 服務已啟動"

# 等待後端就緒
info "等待後端服務就緒..."
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
    warning "後端服務啟動超時，嘗試重啟..."
    docker compose restart backend >/dev/null 2>&1
    
    for i in $(seq 1 20); do
        if docker compose exec -T backend echo "health_check" >/dev/null 2>&1; then
            backend_ready=true
            break
        fi
        sleep 2
    done
    
    if [ "$backend_ready" = "true" ]; then
        success "後端服務重啟成功"
    else
        error "後端服務仍然無法就緒"
    fi
fi

# STEP 5: 資料庫遷移
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

# STEP 6: 初始化數據
step "$ICON_INFO 初始化種子數據"
if [ "$backend_ready" = "true" ]; then
    # 檢查現有貼文數量
    post_count=$(docker compose exec -T backend python -c "
from utils.db import init_engine_session, get_session
from models import Post
try:
    init_engine_session()
    with get_session() as s:
        print(s.query(Post).filter(Post.status == 'approved').count())
except:
    print(0)
" 2>/dev/null | tail -1 | tr -d '[:space:]')

    if [ "${post_count:-0}" -ge "3" ]; then
        success "已有 $post_count 篇核准貼文，跳過種子數據"
    else
        info "初始化種子數據（當前: ${post_count:-0} 篇）..."
        if docker compose exec -T backend python scripts/seed_data.py >/dev/null 2>&1; then
            success "種子數據初始化完成"
        else
            warning "種子數據初始化失敗"
        fi
    fi
else
    docker compose run --rm backend python scripts/seed_data.py >/dev/null 2>&1 && \
        success "種子數據初始化完成" || warning "種子數據初始化失敗"
fi

# STEP 7: 初始化上傳目錄
step "$ICON_INFO 初始化上傳目錄結構"
if [ "$backend_ready" = "true" ]; then
    docker compose exec -T backend python scripts/init_uploads.py >/dev/null 2>&1 && \
        success "上傳目錄結構初始化完成" || warning "上傳目錄結構初始化失敗"
else
    docker compose run --rm backend python scripts/init_uploads.py >/dev/null 2>&1 && \
        success "上傳目錄結構初始化完成" || warning "上傳目錄結構初始化失敗"
fi

# STEP 8: 容器內權限驗證
step "$ICON_CHECK 驗證容器權限"
verify_container_permissions backend /app/uploads

if docker compose ps cdn 2>/dev/null | grep -qi "up"; then
    verify_container_permissions cdn /usr/share/nginx/html/uploads
fi

# STEP 9: 管理員帳號設定
if [ "${ENFORCE_SINGLE_ADMIN:-1}" = "0" ]; then
    step "$ICON_INFO 設定開發管理員"
    if docker compose exec -T backend python manage.py create-superadmin "${ADMIN_USER:-Kaiyasi}" "${ADMIN_PASS:-change-me}" >/dev/null 2>&1; then
        success "開發管理員帳號已設定"
    else
        warning "開發管理員帳號設定失敗"
    fi
else
    info "單一管理員模式：跳過開發帳號建立"
fi

# STEP 10: 最終驗證
step "$ICON_CHECK 系統健康檢查"

# API 健康檢查
if curl -fsS http://localhost:12005/api/healthz >/dev/null 2>&1; then
    success "API 健康檢查通過"
else
    warning "API 健康檢查失敗"
fi

# CDN 檢查
cdn_port=${CDN_PORT:-12002}
if curl -fsS "http://localhost:${cdn_port}/dev_rebuild_check.txt" >/dev/null 2>&1; then
    success "CDN 服務正常"
else
    warning "CDN 服務可能有問題"
fi

# 上傳服務檢查  
if curl -fsS "http://localhost:12005/uploads/public/dev_rebuild_check.txt" >/dev/null 2>&1; then
    success "上傳服務正常"
else
    warning "上傳服務可能有問題"
fi

success "ForumKit 開發環境重建流程完成！"

# STEP 11: 啟動 Discord Bot（可選）
if [ "${DISCORD_BOT_ENABLED:-1}" = "1" ]; then
    step "${ICON_INFO} 啟動 Discord Bot"
    BOT_DIR="$PROJECT_ROOT/discord-bot"
    RUNNER="$PROJECT_ROOT/scripts/run_discord_bot.sh"
    if [ -d "$BOT_DIR" ] && [ -f "$RUNNER" ]; then
        # 嘗試關閉舊的 Bot（若有 pid 檔）
        if [ -f "$BOT_DIR/logs/bot.pid" ]; then
            old_pid="$(cat "$BOT_DIR/logs/bot.pid" 2>/dev/null || echo '')"
            if [ -n "$old_pid" ] && ps -p "$old_pid" >/dev/null 2>&1; then
                info "停止舊 Bot (PID=$old_pid)"
                kill "$old_pid" >/dev/null 2>&1 || true
                # 給他一點時間優雅結束
                sleep 1
            fi
        fi

        if bash "$RUNNER" >/dev/null 2>&1; then
            success "Discord Bot 已啟動"
        else
            warning "Discord Bot 啟動失敗，請檢查 $BOT_DIR/logs"
        fi
    else
        info "未找到 Discord Bot 專案或啟動腳本，略過 (設置 DISCORD_BOT_ENABLED=0 可關閉此步驟)"
    fi
fi
