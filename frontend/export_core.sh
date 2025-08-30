#!/bin/bash
# 核心資料匯出腳本

echo "🔧 ForumKit 核心資料匯出"
echo "=========================="
echo "匯出內容："
echo "- 使用者資料 (含密碼雜湊)"
echo "- 學校資料"
echo "- 完整貼文內容"
echo "- 留言資料"
echo "- 統計報告"
echo ""

# 檢查 Python 是否可用
if ! command -v python &> /dev/null; then
    echo "❌ Python 未安裝或不在 PATH 中"
    exit 1
fi

# 執行匯出
echo "🚀 開始匯出核心資料..."
python scripts/export_core_data.py

echo ""
echo "✅ 匯出完成！"
echo "📁 檔案位於 exports 目錄"
echo "💡 建議將 exports 目錄備份到安全位置"
