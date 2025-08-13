#!/bin/bash

# ForumKit 權限修復腳本
echo "🔧 修復 ForumKit 前端權限問題..."

# 檢查是否在 Windows 環境
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    echo "⚠️  檢測到 Windows 環境"
    echo "在 Windows 上，請使用以下命令："
    echo "docker-compose down"
    echo "docker-compose build nginx"
    echo "docker-compose up -d"
    echo ""
    echo "或者手動執行："
    echo "find dist -type d -exec chmod 755 {} \\; && find dist -type f -exec chmod 644 {} \\;"
else
    echo "🐧 檢測到 Linux/macOS 環境"
    
    # 檢查 dist 目錄是否存在
    if [ ! -d "frontend/dist" ]; then
        echo "❌ frontend/dist 目錄不存在，請先執行 npm run build"
        exit 1
    fi
    
    # 修復權限
    echo "📁 修復目錄權限..."
    find frontend/dist -type d -exec chmod 755 {} \;
    
    echo "📄 修復文件權限..."
    find frontend/dist -type f -exec chmod 644 {} \;
    
    echo "✅ 權限修復完成！"
    echo ""
    echo "現在可以重新啟動 Docker Compose："
    echo "docker-compose restart nginx"
fi 