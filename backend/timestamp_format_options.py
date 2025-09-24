#!/usr/bin/env python3
"""
時間戳格式選項說明
"""

print("🕒 ForumKit 時間戳格式選項")
print("=" * 50)

print("📋 可用格式:")
print("1. 'relative' → '5分鐘前', '2小時前', '3天前'")
print("2. 'absolute' → '2025-09-23 22:30'")
print("3. 'MM-DD HH:mm' → '09-23 22:30'")
print("4. 'YYYY-MM-DD' → '2025-09-23'")
print("5. 'DD/MM' → '23/09'")
print("6. 'HH:mm' → '22:30'")
print("7. 自定義strftime格式 (如 '%Y年%m月%d日')")

print("\n🎯 建議:")
print("- 手機預覽: 'relative' (相對時間)")
print("- IG發布: 'relative' 或 'MM-DD HH:mm'")
print("- 正式文檔: 'YYYY-MM-DD HH:mm'")

print("\n🔧 修改方法:")
print("1. 修改手機預覽API預設值")
print("2. 修改資料庫中的IGTemplate配置")
print("3. 修改前端發送的timestamp_format")

print("\n💡 如果你想要:")
print("- 顯示相對時間 → 設定為 'relative'")
print("- 顯示完整日期時間 → 設定為 'YYYY-MM-DD HH:mm'")
print("- 只顯示時間 → 設定為 'HH:mm'")
print("- 顯示月日時間 → 保持 'MM-DD HH:mm'")