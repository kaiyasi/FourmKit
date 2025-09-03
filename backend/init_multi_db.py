#!/usr/bin/env python3
"""
初始化 ForumKit 多資料庫系統
"""
import sys
import os

# 添加當前目錄到路徑
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.db_multi import init_all_databases, get_all_database_status

def main():
    print("🚀 初始化 ForumKit 多資料庫系統")
    print("=" * 50)
    
    # 初始化所有資料庫
    print("📦 正在初始化資料庫...")
    success = init_all_databases()
    
    if success:
        print("\n✅ 所有資料庫初始化成功！")
        
        # 顯示資料庫狀態
        print("\n📊 資料庫狀態:")
        status = get_all_database_status()
        
        for service, info in status.items():
            health_icon = "✅" if info['health'] else "❌"
            print(f"  {health_icon} {service.upper()}")
            print(f"     檔案: {info['file']}")
            print(f"     描述: {info['description']}")
            print(f"     大小: {info['size_mb']} MB")
            print(f"     表格: {', '.join(info['tables'])}")
            print()
        
        print("💡 提示:")
        print("  - 資料庫檔案位於 ./data/ 目錄")
        print("  - 各服務使用獨立的資料庫檔案")
        print("  - 可以獨立備份和維護每個服務")
    else:
        print("\n❌ 資料庫初始化失敗，請檢查錯誤訊息")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())