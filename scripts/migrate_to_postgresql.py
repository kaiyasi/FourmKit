#!/usr/bin/env python3
"""
ForumKit SQLite 到 PostgreSQL 遷移腳本
將現有的 SQLite 資料遷移到新的 PostgreSQL 多資料庫架構
"""

import os
import sys
import sqlite3
from typing import Dict, List, Any
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

# 添加 backend 路徑到 Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

try:
    from utils.db_multi import DB_SERVICES, DatabaseService
    from models.base import Base
except ImportError as e:
    print(f"❌ 無法導入必要模組: {e}")
    print("請確保在 backend 目錄下執行此腳本")
    sys.exit(1)


class SQLiteToPostgreSQLMigrator:
    """SQLite 到 PostgreSQL 遷移器"""

    def __init__(self, sqlite_data_dir: str = "./data"):
        self.sqlite_data_dir = sqlite_data_dir
        self.db_service = DatabaseService()
        self.migration_log = []

    def log(self, message: str):
        """記錄遷移日誌"""
        print(message)
        self.migration_log.append(message)

    def find_sqlite_files(self) -> Dict[str, str]:
        """尋找 SQLite 檔案"""
        sqlite_files = {}

        # 檢查舊的單一檔案
        old_file = os.path.join(self.sqlite_data_dir, "forumkit.db")
        if os.path.exists(old_file):
            sqlite_files['legacy'] = old_file

        # 檢查多檔案架構
        for service, config in DB_SERVICES.items():
            file_path = os.path.join(self.sqlite_data_dir, f"forumkit_{service}.db")
            if os.path.exists(file_path):
                sqlite_files[service] = file_path

        return sqlite_files

    def get_sqlite_tables(self, sqlite_path: str) -> List[str]:
        """獲取 SQLite 檔案中的表格"""
        try:
            conn = sqlite3.connect(sqlite_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall() if not row[0].startswith('sqlite_')]
            conn.close()
            return tables
        except Exception as e:
            self.log(f"⚠️ 無法讀取 SQLite 檔案 {sqlite_path}: {e}")
            return []

    def migrate_table_data(self, sqlite_path: str, service: str, table: str) -> bool:
        """遷移單個表格的資料"""
        try:
            # 連接 SQLite
            sqlite_conn = sqlite3.connect(sqlite_path)
            sqlite_conn.row_factory = sqlite3.Row
            cursor = sqlite_conn.cursor()

            # 獲取 PostgreSQL session
            pg_session = self.db_service.get_session(service)
            pg_engine = self.db_service.get_engine(service)

            # 檢查表格是否存在
            cursor.execute(f"SELECT count(*) FROM sqlite_master WHERE type='table' AND name='{table}'")
            if cursor.fetchone()[0] == 0:
                self.log(f"   ⚠️ 表格 {table} 不存在於 SQLite 中")
                return False

            # 獲取資料
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()

            if not rows:
                self.log(f"   📭 表格 {table} 沒有資料")
                return True

            # 獲取欄位名稱
            columns = [description[0] for description in cursor.description]

            # 構建插入語句
            placeholders = ', '.join([f':{col}' for col in columns])
            insert_sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"

            # 執行批量插入
            with pg_engine.begin() as conn:
                # 先清空目標表格（如果有資料的話）
                conn.execute(text(f"DELETE FROM {table}"))

                # 插入資料
                for row in rows:
                    row_dict = dict(row)
                    conn.execute(text(insert_sql), row_dict)

            self.log(f"   ✅ 遷移 {len(rows)} 筆資料到表格 {table}")

            sqlite_conn.close()
            pg_session.close()
            return True

        except Exception as e:
            self.log(f"   ❌ 遷移表格 {table} 失敗: {e}")
            return False

    def create_postgresql_schemas(self):
        """創建 PostgreSQL 資料表結構"""
        self.log("📋 創建 PostgreSQL 資料表結構...")

        success_count = 0
        for service in DB_SERVICES.keys():
            try:
                engine = self.db_service.get_engine(service)
                Base.metadata.create_all(engine)
                self.log(f"   ✅ 創建 {service} 資料庫結構")
                success_count += 1
            except Exception as e:
                self.log(f"   ❌ 創建 {service} 失敗: {e}")

        return success_count == len(DB_SERVICES)

    def distribute_legacy_data(self, sqlite_path: str) -> bool:
        """分配舊版單一資料庫的資料到各服務"""
        self.log("🔄 分配舊版資料到各服務資料庫...")

        tables = self.get_sqlite_tables(sqlite_path)
        if not tables:
            return False

        success_count = 0
        total_count = 0

        for service, config in DB_SERVICES.items():
            self.log(f"   處理服務: {service}")

            for table in config['tables']:
                total_count += 1
                if table in tables:
                    if self.migrate_table_data(sqlite_path, service, table):
                        success_count += 1
                else:
                    self.log(f"   ⚠️ 表格 {table} 不存在於舊資料庫中")

        self.log(f"   完成 {success_count}/{total_count} 個表格遷移")
        return success_count == total_count

    def migrate_service_data(self, sqlite_files: Dict[str, str]) -> bool:
        """遷移各服務的 SQLite 資料"""
        self.log("🔄 遷移各服務 SQLite 資料...")

        success_count = 0
        for service, sqlite_path in sqlite_files.items():
            if service == 'legacy':
                continue

            self.log(f"   處理服務: {service}")

            if service not in DB_SERVICES:
                self.log(f"   ⚠️ 未知服務: {service}")
                continue

            config = DB_SERVICES[service]
            tables = self.get_sqlite_tables(sqlite_path)

            service_success = 0
            for table in config['tables']:
                if table in tables:
                    if self.migrate_table_data(sqlite_path, service, table):
                        service_success += 1
                else:
                    self.log(f"   ⚠️ 表格 {table} 不存在")

            if service_success > 0:
                success_count += 1

        return success_count > 0

    def run_migration(self) -> bool:
        """執行完整遷移"""
        self.log("🚀 開始 SQLite 到 PostgreSQL 遷移...")

        # 1. 尋找 SQLite 檔案
        sqlite_files = self.find_sqlite_files()
        if not sqlite_files:
            self.log("❌ 找不到任何 SQLite 檔案")
            return False

        self.log(f"📁 找到 SQLite 檔案: {list(sqlite_files.keys())}")

        # 2. 創建 PostgreSQL 結構
        if not self.create_postgresql_schemas():
            self.log("❌ 創建 PostgreSQL 結構失敗")
            return False

        # 3. 遷移資料
        migration_success = False

        # 優先處理舊版單一檔案
        if 'legacy' in sqlite_files:
            self.log("🔄 處理舊版單一資料庫...")
            migration_success = self.distribute_legacy_data(sqlite_files['legacy'])

        # 處理各服務檔案
        service_files = {k: v for k, v in sqlite_files.items() if k != 'legacy'}
        if service_files:
            service_success = self.migrate_service_data(service_files)
            migration_success = migration_success or service_success

        if migration_success:
            self.log("🎉 資料遷移完成！")
            self.log("\n📊 遷移摘要:")
            for line in self.migration_log[-10:]:  # 顯示最後 10 行日誌
                if "✅" in line or "❌" in line:
                    self.log(line)
        else:
            self.log("❌ 資料遷移失敗")

        return migration_success

    def verify_migration(self) -> bool:
        """驗證遷移結果"""
        self.log("\n🔍 驗證遷移結果...")

        verification_success = True
        for service, config in DB_SERVICES.items():
            try:
                session = self.db_service.get_session(service)
                engine = self.db_service.get_engine(service)

                total_records = 0
                with engine.connect() as conn:
                    for table in config['tables']:
                        try:
                            result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                            count = result.scalar()
                            total_records += count
                            self.log(f"   📊 {service}.{table}: {count} 筆記錄")
                        except Exception as e:
                            self.log(f"   ⚠️ 無法檢查 {service}.{table}: {e}")

                self.log(f"   ✅ 服務 {service} 總計: {total_records} 筆記錄")
                session.close()

            except Exception as e:
                self.log(f"   ❌ 檢查服務 {service} 失敗: {e}")
                verification_success = False

        return verification_success


def main():
    """主程式"""
    print("ForumKit SQLite → PostgreSQL 遷移工具")
    print("=" * 50)

    # 檢查是否在正確目錄
    if not os.path.exists("backend"):
        print("❌ 請在 ForumKit 根目錄執行此腳本")
        sys.exit(1)

    # 執行遷移
    migrator = SQLiteToPostgreSQLMigrator()

    try:
        success = migrator.run_migration()

        if success:
            migrator.verify_migration()
            print("\n🎉 遷移完成！你現在可以：")
            print("1. 啟動 Docker 服務: docker-compose up -d postgres")
            print("2. 驗證資料庫連線")
            print("3. 啟動整個應用程式")
        else:
            print("\n❌ 遷移失敗，請檢查錯誤訊息")
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n⚠️ 遷移被中斷")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 遷移過程發生錯誤: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()