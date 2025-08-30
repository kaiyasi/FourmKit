#!/usr/bin/env python3
"""
備份和匯出選擇腳本
提供多種資料匯出選項
"""

import sys
import os
from pathlib import Path

def main():
    print("🔧 ForumKit 資料備份和匯出工具")
    print("=" * 50)
    print("請選擇匯出類型：")
    print("1. 核心資料匯出 (推薦)")
    print("   - 使用者帳戶資訊 (含密碼雜湊)")
    print("   - 學校資料")
    print("   - 完整貼文內容")
    print("   - 留言資料")
    print("   - 統計報告")
    print()
    print("2. 完整資料匯出")
    print("   - 所有資料庫表")
    print("   - 上傳檔案備份")
    print("   - 環境設定備份")
    print("   - 重建指南")
    print("   - 詳細統計")
    print()
    print("3. 使用者資料匯出 (基本)")
    print("   - 使用者帳戶資訊")
    print("   - 學校資料")
    print("   - 貼文基本資訊")
    print("   - 公告資料")
    print("   - 支援工單")
    print("   - 統計報告")
    print()
    print("4. 僅修復數據庫")
    print("   - 修復遷移問題")
    print("   - 添加缺失欄位")
    print()
    
    while True:
        choice = input("請輸入選項 (1-4): ").strip()
        
        if choice == "1":
            print("\n🚀 開始核心資料匯出...")
            os.system("python scripts/export_core_data.py")
            break
        elif choice == "2":
            print("\n🚀 開始完整資料匯出...")
            os.system("python scripts/export_full_data.py")
            break
        elif choice == "3":
            print("\n🚀 開始使用者資料匯出...")
            os.system("python scripts/export_user_data.py")
            break
        elif choice == "4":
            print("\n🚀 開始修復數據庫...")
            os.system("python scripts/fix_db_migration.py")
            break
        else:
            print("❌ 無效選項，請重新輸入")
    
    print("\n✅ 操作完成！")
    print("📁 匯出檔案位於 exports 目錄")
    print("💡 建議將 exports 目錄備份到安全位置")

if __name__ == "__main__":
    main()
