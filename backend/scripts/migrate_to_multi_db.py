#!/usr/bin/env python3
"""
ForumKit 資料庫遷移工具
將單一資料庫遷移到多檔格式
"""

import os
import sys
import sqlite3
from datetime import datetime
from typing import Dict, List

# 添加父目錄到路徑以便導入模組
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_multi import DB_SERVICES, db_service

class DatabaseMigrator:
    """資料庫遷移器"""
    
    def __init__(self):
        self.source_db = None
        self.migration_log = []
    
    def log(self, message: str):
        """記錄遷移日誌"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_msg = f"[{timestamp}] {message}"
        self.migration_log.append(log_msg)
        print(log_msg)
    
    def find_source_database(self) -> str:
        """尋找原始資料庫檔案"""
        possible_paths = [
            "./forumkit.db",
            "./data/forumkit.db", 
            "./forumkit_old.db",
            "./backend.db",
            "../forumkit.db"
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                self.log(f"找到原始資料庫: {path}")
                return path
        
        return None
    
    def get_table_list(self, db_path: str) -> List[str]:
        """獲取資料庫中的表格列表"""
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return tables
    
    def get_table_data(self, source_db: str, table_name: str) -> List[tuple]:
        """從原始資料庫獲取表格資料"""
        conn = sqlite3.connect(source_db)
        cursor = conn.cursor()
        
        try:
            cursor.execute(f"SELECT * FROM {table_name}")
            data = cursor.fetchall()
            
            # 獲取欄位名稱
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [column[1] for column in cursor.fetchall()]
            
            conn.close()
            return data, columns
        except sqlite3.Error as e:
            self.log(f"讀取表格 {table_name} 時出錯: {str(e)}")
            conn.close()
            return [], []
    
    def determine_target_service(self, table_name: str) -> str:
        """根據表格名稱決定目標服務"""
        table_mapping = {
            'users': 'core',
            'posts': 'core', 
            'delete_requests': 'core',
            'comments': 'core',
            'post_reactions': 'core',
            'comment_reactions': 'core',
            'media': 'core',
            'user_roles': 'core',
            
            'support_tickets': 'support',
            'support_messages': 'support',
            
            'chat_messages': 'chat',
            'chat_rooms': 'chat',
            'chat_room_members': 'chat',
            
            'moderation_logs': 'moderation',
            'system_events': 'moderation', 
            'notification_preferences': 'moderation',
            
            'schools': 'organization',
            'school_settings': 'organization',
            'announcements': 'organization',
            'announcement_reads': 'organization'
        }
        
        return table_mapping.get(table_name, 'core')  # 預設放到 core
    
    def migrate_table(self, source_db: str, table_name: str, target_service: str) -> bool:
        """遷移單個表格到目標服務資料庫"""
        try:
            # 獲取原始資料
            data, columns = self.get_table_data(source_db, table_name)
            if not data:
                self.log(f"表格 {table_name} 沒有資料，跳過遷移")
                return True
            
            # 獲取目標資料庫
            target_engine = db_service.get_engine(target_service)
            target_path = db_service.get_database_path(target_service)
            
            # 連接目標資料庫
            target_conn = sqlite3.connect(target_path)
            target_cursor = target_conn.cursor()
            
            # 檢查目標表格是否存在
            target_cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
            if not target_cursor.fetchone():
                self.log(f"目標資料庫中不存在表格 {table_name}，請先初始化資料庫")
                target_conn.close()
                return False
            
            # 清空目標表格（如果已有資料）
            target_cursor.execute(f"DELETE FROM {table_name}")
            
            # 插入資料
            placeholders = ','.join(['?' for _ in columns])
            insert_sql = f"INSERT INTO {table_name} ({','.join(columns)}) VALUES ({placeholders})"
            
            target_cursor.executemany(insert_sql, data)
            target_conn.commit()
            target_conn.close()
            
            self.log(f"✅ 成功遷移表格 {table_name} 到 {target_service} ({len(data)} 筆資料)")
            return True
            
        except Exception as e:
            self.log(f"❌ 遷移表格 {table_name} 失敗: {str(e)}")
            return False
    
    def perform_migration(self, source_db_path: str = None) -> bool:
        """執行完整遷移"""
        if not source_db_path:
            source_db_path = self.find_source_database()
        
        if not source_db_path:
            self.log("❌ 找不到原始資料庫檔案")
            return False
        
        if not os.path.exists(source_db_path):
            self.log(f"❌ 原始資料庫檔案不存在: {source_db_path}")
            return False
        
        self.log("🚀 開始資料庫遷移...")
        self.log(f"原始資料庫: {source_db_path}")
        
        # 獲取原始資料庫的表格列表
        tables = self.get_table_list(source_db_path)
        self.log(f"找到 {len(tables)} 個表格: {', '.join(tables)}")
        
        # 初始化目標資料庫
        self.log("初始化目標資料庫...")
        if not db_service.initialize_all():
            self.log("❌ 目標資料庫初始化失敗")
            return False
        
        # 遷移每個表格
        success_count = 0
        total_count = len(tables)
        
        for table_name in tables:
            # 跳過系統表格和遷移相關表格
            if table_name.startswith(('alembic_', 'sqlite_')):
                self.log(f"跳過系統表格: {table_name}")
                continue
            
            target_service = self.determine_target_service(table_name)
            self.log(f"遷移表格 {table_name} 到服務 {target_service}")
            
            if self.migrate_table(source_db_path, table_name, target_service):
                success_count += 1
        
        # 產生遷移報告
        self.generate_migration_report()
        
        self.log(f"🎉 遷移完成！成功遷移 {success_count}/{total_count} 個表格")
        return success_count == total_count
    
    def generate_migration_report(self):
        """產生遷移報告"""
        report_path = "./data/migration_report.md"
        
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write("# ForumKit 資料庫遷移報告\n\n")
            f.write(f"**遷移時間**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("## 遷移日誌\n\n")
            for log_entry in self.migration_log:
                f.write(f"- {log_entry}\n")
            
            f.write("\n## 新資料庫結構\n\n")
            status = db_service.get_database_status()
            for service, info in status.items():
                f.write(f"### {service.upper()}\n")
                f.write(f"- **檔案**: {info['file']}\n")
                f.write(f"- **描述**: {info['description']}\n")
                f.write(f"- **大小**: {info['size_mb']} MB\n")
                f.write(f"- **狀態**: {'✅ 正常' if info['health'] else '❌ 異常'}\n")
                f.write(f"- **表格**: {', '.join(info['tables'])}\n\n")
            
            f.write("## 備份建議\n\n")
            f.write("1. 請定期備份各個資料庫檔案\n")
            f.write("2. 建議使用自動化備份腳本\n")
            f.write("3. 重要資料建議異地備份\n\n")
        
        self.log(f"📝 遷移報告已生成: {report_path}")

def main():
    """主函數"""
    print("🔄 ForumKit 資料庫遷移工具")
    print("=" * 50)
    
    migrator = DatabaseMigrator()
    
    # 檢查是否有指定原始資料庫
    source_db = None
    if len(sys.argv) > 1:
        source_db = sys.argv[1]
        if not os.path.exists(source_db):
            print(f"❌ 指定的資料庫檔案不存在: {source_db}")
            return
    
    # 執行遷移
    success = migrator.perform_migration(source_db)
    
    if success:
        print("\n🎉 遷移成功完成！")
        print("📋 新的資料庫架構:")
        
        status = db_service.get_database_status()
        for service, info in status.items():
            print(f"  - {service}: {info['file']} ({info['size_mb']} MB)")
        
        print("\n💡 提示:")
        print("  1. 請檢查 ./data/migration_report.md 了解詳細資訊")
        print("  2. 建議備份原始資料庫檔案")
        print("  3. 測試新系統功能是否正常")
    else:
        print("\n❌ 遷移過程中發生錯誤，請檢查日誌")

if __name__ == "__main__":
    main()