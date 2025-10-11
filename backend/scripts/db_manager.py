#!/usr/bin/env python3
"""
ForumKit 資料庫管理 CLI 工具
管理多資料庫系統的各種操作
"""

import os
import sys
import argparse
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_multi import db_service, DB_SERVICES, backup_all_databases

class DatabaseCLI:
    """資料庫管理命令行介面"""
    
    def __init__(self):
        self.parser = self._create_parser()
    
    def _create_parser(self):
        """創建命令行解析器"""
        parser = argparse.ArgumentParser(
            description="ForumKit 資料庫管理工具",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
使用範例:
  python db_manager.py status              # 查看資料庫狀態
  python db_manager.py init               # 初始化所有資料庫
  python db_manager.py backup             # 備份所有資料庫
  python db_manager.py backup --service core  # 備份指定服務
  python db_manager.py migrate source.db # 從舊資料庫遷移
  python db_manager.py cleanup           # 清理舊備份
            """
        )
        
        subparsers = parser.add_subparsers(dest='command', help='可用命令')
        
        status_parser = subparsers.add_parser('status', help='查看資料庫狀態')
        status_parser.add_argument('--detailed', '-d', action='store_true', help='顯示詳細資訊')
        
        init_parser = subparsers.add_parser('init', help='初始化資料庫')
        init_parser.add_argument('--force', '-f', action='store_true', help='強制重新初始化')
        
        backup_parser = subparsers.add_parser('backup', help='備份資料庫')
        backup_parser.add_argument('--service', '-s', choices=list(DB_SERVICES.keys()), help='指定服務')
        backup_parser.add_argument('--output', '-o', default='./backups', help='備份輸出目錄')
        
        migrate_parser = subparsers.add_parser('migrate', help='從舊資料庫遷移')
        migrate_parser.add_argument('source', help='原始資料庫檔案路徑')
        migrate_parser.add_argument('--backup-first', action='store_true', help='遷移前先備份')
        
        cleanup_parser = subparsers.add_parser('cleanup', help='清理舊備份')
        cleanup_parser.add_argument('--days', '-d', type=int, default=30, help='保留天數')
        cleanup_parser.add_argument('--backup-dir', default='./backups', help='備份目錄')
        
        info_parser = subparsers.add_parser('info', help='顯示資料庫架構資訊')
        
        return parser
    
    def cmd_status(self, args):
        """查看資料庫狀態"""
        print("📊 ForumKit 資料庫狀態")
        print("=" * 50)
        
        status = db_service.get_database_status()
        total_size = 0
        healthy_count = 0
        
        for service, info in status.items():
            health_icon = "✅" if info['health'] else "❌"
            size_str = f"{info['size_mb']:.2f} MB" if info['size_mb'] > 0 else "0 MB"
            
            print(f"\n{health_icon} {service.upper()}")
            print(f"   描述: {info['description']}")
            print(f"   檔案: {info['file']}")
            print(f"   大小: {size_str}")
            
            if args.detailed:
                print(f"   路徑: {info['path']}")
                print(f"   存在: {'是' if info['exists'] else '否'}")
                print(f"   表格: {', '.join(info['tables'])}")
            
            total_size += info['size_mb']
            if info['health']:
                healthy_count += 1
        
        print(f"\n📈 總計:")
        print(f"   資料庫數量: {len(status)}")
        print(f"   健康狀態: {healthy_count}/{len(status)}")
        print(f"   總大小: {total_size:.2f} MB")
    
    def cmd_init(self, args):
        """初始化資料庫"""
        print("🔧 初始化 ForumKit 資料庫")
        print("=" * 50)
        
        if args.force:
            print("⚠️  強制模式：將覆蓋現有資料庫")
            confirm = input("確定要繼續嗎？(y/N): ")
            if confirm.lower() != 'y':
                print("取消操作")
                return
        
        success = db_service.initialize_all()
        
        if success:
            print("\n🎉 資料庫初始化完成！")
        else:
            print("\n❌ 資料庫初始化失敗")
    
    def cmd_backup(self, args):
        """備份資料庫"""
        print("💾 備份 ForumKit 資料庫")
        print("=" * 50)
        
        os.makedirs(args.output, exist_ok=True)
        
        if args.service:
            try:
                backup_path = db_service.backup_database(args.service, args.output)
                print(f"✅ 成功備份 {args.service}: {backup_path}")
            except Exception as e:
                print(f"❌ 備份 {args.service} 失敗: {str(e)}")
        else:
            backup_paths = backup_all_databases()
            print(f"✅ 成功備份 {len(backup_paths)} 個資料庫")
            
            for path in backup_paths:
                print(f"   📁 {os.path.basename(path)}")
    
    def cmd_migrate(self, args):
        """從舊資料庫遷移"""
        print("🔄 資料庫遷移")
        print("=" * 50)
        
        if not os.path.exists(args.source):
            print(f"❌ 原始資料庫檔案不存在: {args.source}")
            return
        
        if args.backup_first:
            print("📦 遷移前先備份現有資料庫...")
            backup_all_databases()
        
        from migrate_to_multi_db import DatabaseMigrator
        
        migrator = DatabaseMigrator()
        success = migrator.perform_migration(args.source)
        
        if success:
            print("🎉 遷移完成！")
        else:
            print("❌ 遷移失敗")
    
    def cmd_cleanup(self, args):
        """清理舊備份"""
        print("🗑️  清理舊備份檔案")
        print("=" * 50)
        
        db_service.cleanup_old_backups(args.backup_dir, args.days)
    
    def cmd_info(self, args):
        """顯示資料庫架構資訊"""
        print("ℹ️  ForumKit 多資料庫架構")
        print("=" * 50)
        
        print("\n📋 服務分離說明:")
        print("   為了提高系統穩定性和維護性，ForumKit 採用多資料庫架構")
        print("   每個功能模組使用獨立的資料庫檔案，避免服務間相互干擾\n")
        
        for service, config in DB_SERVICES.items():
            print(f"📦 {service.upper()}")
            print(f"   檔案: {config['file']}")
            print(f"   描述: {config['description']}")
            print(f"   表格: {', '.join(config['tables'])}")
            print()
        
        print("💡 優勢:")
        print("   • 服務隔離：故障不會相互影響")
        print("   • 備份靈活：可針對不同服務獨立備份")  
        print("   • 擴展性強：未來可輕鬆分散部署")
        print("   • 維護簡單：問題定位更精確")
    
    def run(self):
        """執行 CLI"""
        args = self.parser.parse_args()
        
        if not args.command:
            self.parser.print_help()
            return
        
        method_name = f"cmd_{args.command}"
        if hasattr(self, method_name):
            try:
                method = getattr(self, method_name)
                method(args)
            except KeyboardInterrupt:
                print("\n⚠️ 操作被中斷")
            except Exception as e:
                print(f"❌ 執行命令時發生錯誤: {str(e)}")
        else:
            print(f"❌ 未知命令: {args.command}")

def main():
    """主入口點"""
    cli = DatabaseCLI()
    cli.run()

if __name__ == "__main__":
    main()