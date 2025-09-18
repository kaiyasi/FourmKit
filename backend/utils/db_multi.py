"""
新的多資料庫系統
基於服務分離，但保持模型相容性
"""
import os
from typing import Dict, List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# 按服務功能分離的資料庫配置
DB_SERVICES = {
    'core': {
        'database': 'forumkit_core',
        'description': '核心論壇功能（用戶、貼文、留言等）',
        'tables': ['users', 'posts', 'delete_requests', 'comments', 'post_reactions', 'comment_reactions', 'media', 'user_roles']
    },
    'support': {
        'database': 'forumkit_support',
        'description': '客服支援系統',
        'tables': ['support_tickets', 'support_messages']
    },
    'chat': {
        'database': 'forumkit_chat',
        'description': '聊天室系統',
        'tables': ['chat_messages', 'chat_rooms', 'chat_room_members']
    },
    'moderation': {
        'database': 'forumkit_moderation',
        'description': '審核和管理系統',
        'tables': ['moderation_logs', 'system_events', 'notification_preferences']
    },
    'organization': {
        'database': 'forumkit_organization',
        'description': '組織管理（學校、公告等）',
        'tables': ['schools', 'school_settings', 'announcements', 'announcement_reads']
    }
}

class DatabaseService:
    """資料庫服務管理器"""

    def __init__(self, host: str = "127.0.0.1", port: int = 12007, user: str = "forumkit", password: str = "forumkit_password"):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.engines = {}
        self.session_makers = {}
        self._base_url = f"postgresql+psycopg://{user}:{password}@{host}:{port}"
    
    def get_database_url(self, service: str) -> str:
        """獲取資料庫連線 URL"""
        if service not in DB_SERVICES:
            raise ValueError(f"Unknown service: {service}")
        database_name = DB_SERVICES[service]['database']
        return f"{self._base_url}/{database_name}"

    def get_engine(self, service: str):
        """獲取資料庫引擎"""
        if service not in self.engines:
            db_url = self.get_database_url(service)

            engine = create_engine(
                db_url,
                pool_pre_ping=True,
                pool_recycle=300,
                pool_size=10,
                max_overflow=20,
                echo=False
            )

            self.engines[service] = engine
            self.session_makers[service] = sessionmaker(bind=engine)

        return self.engines[service]
    
    def get_session(self, service: str) -> Session:
        """獲取資料庫會話"""
        if service not in self.session_makers:
            self.get_engine(service)  # 初始化引擎
        return self.session_makers[service]()
    
    def initialize_all(self):
        """初始化所有資料庫"""
        from models.base import Base
        
        success_count = 0
        for service in DB_SERVICES.keys():
            try:
                engine = self.get_engine(service)
                Base.metadata.create_all(engine)
                print(f"✅ 初始化資料庫: {service} - {DB_SERVICES[service]['description']}")
                success_count += 1
            except Exception as e:
                print(f"❌ 初始化失敗: {service} - {str(e)}")
        
        print(f"\n🎉 成功初始化 {success_count}/{len(DB_SERVICES)} 個資料庫")
        return success_count == len(DB_SERVICES)
    
    def get_database_status(self) -> Dict[str, dict]:
        """獲取所有資料庫狀態"""
        status = {}

        for service, config in DB_SERVICES.items():
            db_url = self.get_database_url(service)

            # 檢查連接狀態
            health = False
            exists = False
            size = 0
            try:
                engine = self.get_engine(service)
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                    # 檢查資料庫是否存在並取得大小
                    result = conn.execute(text("SELECT pg_database_size(current_database())"))
                    size = result.scalar() or 0
                    exists = True
                health = True
            except Exception as e:
                health = False
                exists = False

            status[service] = {
                'description': config['description'],
                'database': config['database'],
                'url': db_url.replace(f":{self.password}@", ":***@"),  # 隱藏密碼
                'exists': exists,
                'size': size,
                'size_mb': round(size / 1024 / 1024, 2) if size > 0 else 0,
                'health': health,
                'tables': config['tables']
            }

        return status
    
    def backup_database(self, service: str, backup_dir: str = "./backups") -> str:
        """備份指定服務的資料庫"""
        if service not in DB_SERVICES:
            raise ValueError(f"Unknown service: {service}")

        os.makedirs(backup_dir, exist_ok=True)

        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        database_name = DB_SERVICES[service]['database']
        backup_filename = f"{service}_{timestamp}.sql"
        backup_path = os.path.join(backup_dir, backup_filename)

        # 使用 pg_dump 備份 PostgreSQL 資料庫
        import subprocess
        try:
            cmd = [
                "pg_dump",
                "-h", self.host,
                "-p", str(self.port),
                "-U", self.user,
                "-d", database_name,
                "-f", backup_path,
                "--verbose"
            ]
            env = os.environ.copy()
            env["PGPASSWORD"] = self.password

            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            if result.returncode == 0:
                return backup_path
            else:
                raise Exception(f"pg_dump failed: {result.stderr}")
        except FileNotFoundError:
            raise Exception("pg_dump command not found. Please install PostgreSQL client tools.")
    
    def cleanup_old_backups(self, backup_dir: str = "./backups", keep_days: int = 30):
        """清理舊備份檔案"""
        if not os.path.exists(backup_dir):
            return

        from datetime import datetime, timedelta
        cutoff_date = datetime.now() - timedelta(days=keep_days)

        removed_count = 0
        for filename in os.listdir(backup_dir):
            if filename.endswith('.sql'):
                file_path = os.path.join(backup_dir, filename)
                file_time = datetime.fromtimestamp(os.path.getctime(file_path))

                if file_time < cutoff_date:
                    os.remove(file_path)
                    removed_count += 1

        print(f"🗑️ 清理了 {removed_count} 個舊備份檔案")

# 全局實例
db_service = DatabaseService()

# 便利函數
def get_core_session() -> Session:
    """獲取核心功能資料庫會話"""
    return db_service.get_session('core')

def get_support_session() -> Session:
    """獲取支援系統資料庫會話"""
    return db_service.get_session('support')

def get_chat_session() -> Session:
    """獲取聊天室資料庫會話"""
    return db_service.get_session('chat')

def get_moderation_session() -> Session:
    """獲取審核管理資料庫會話"""
    return db_service.get_session('moderation')

def get_organization_session() -> Session:
    """獲取組織管理資料庫會話"""
    return db_service.get_session('organization')

def init_all_databases() -> bool:
    """初始化所有資料庫"""
    return db_service.initialize_all()

def get_all_database_status() -> Dict[str, dict]:
    """獲取所有資料庫狀態"""
    return db_service.get_database_status()

def backup_all_databases() -> List[str]:
    """備份所有資料庫"""
    backup_paths = []
    for service in DB_SERVICES.keys():
        try:
            path = db_service.backup_database(service)
            backup_paths.append(path)
        except Exception as e:
            print(f"⚠️ 備份失敗: {service} - {str(e)}")
    return backup_paths