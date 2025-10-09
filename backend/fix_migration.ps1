# PowerShell 腳本來修復 Instagram 遷移問題

Write-Host "🔧 開始修復 Instagram 遷移問題..." -ForegroundColor Green

# 檢查 PostgreSQL 是否可用
Write-Host "檢查 PostgreSQL 連接..." -ForegroundColor Yellow

# 嘗試連接資料庫並執行修復
$sqlCommands = @"
-- 檢查當前版本
SELECT '當前版本：' as info, version_num as current_version FROM alembic_version;

-- 檢查 Instagram 表格
SELECT 'instagram_accounts' as table_name,
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'instagram_accounts') as exists
UNION ALL
SELECT 'instagram_settings' as table_name,
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'instagram_settings') as exists
UNION ALL
SELECT 'instagram_templates' as table_name,
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'instagram_templates') as exists
UNION ALL
SELECT 'instagram_posts' as table_name,
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'instagram_posts') as exists
UNION ALL
SELECT 'instagram_events' as table_name,
       EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'instagram_events') as exists;
"@

# 將 SQL 命令寫入臨時文件
$tempFile = "temp_check.sql"
$sqlCommands | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "執行檢查命令..." -ForegroundColor Yellow

# 嘗試使用 psql 執行檢查
try {
    # 嘗試不同的連接方式
    $connections = @(
        "postgresql://forumkit:forumkit@localhost:12007/forumkit",
        "postgresql://forumkit:forumkit@127.0.0.1:12007/forumkit"
    )
    
    $connected = $false
    foreach ($conn in $connections) {
        Write-Host "嘗試連接: $conn" -ForegroundColor Cyan
        try {
            $result = psql $conn -f $tempFile 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ 連接成功！" -ForegroundColor Green
                Write-Host $result
                $connected = $true
                break
            }
        } catch {
            Write-Host "❌ 連接失敗: $conn" -ForegroundColor Red
        }
    }
    
    if (-not $connected) {
        Write-Host "❌ 無法連接到資料庫" -ForegroundColor Red
        Write-Host "請確保：" -ForegroundColor Yellow
        Write-Host "1. Docker Desktop 正在運行" -ForegroundColor Yellow
        Write-Host "2. 資料庫容器正在運行" -ForegroundColor Yellow
        Write-Host "3. 端口 12007 可以訪問" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "❌ 執行失敗: $_" -ForegroundColor Red
} finally {
    # 清理臨時文件
    if (Test-Path $tempFile) {
        Remove-Item $tempFile
    }
}

Write-Host "`n📋 手動修復步驟：" -ForegroundColor Yellow
Write-Host "1. 啟動 Docker Desktop" -ForegroundColor White
Write-Host "2. 運行: docker-compose up -d" -ForegroundColor White
Write-Host "3. 連接到資料庫並執行: UPDATE alembic_version SET version_num = '2025_08_30_add_instagram_tables';" -ForegroundColor White
Write-Host "4. 重新啟動應用程式" -ForegroundColor White
