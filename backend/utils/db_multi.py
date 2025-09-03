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
        'file': 'forumkit_core.db',
        'description': '核心論壇功能（用戶、貼文、留言等）',
        'tables': ['users', 'posts', 'delete_requests', 'comments', 'post_reactions', 'comment_reactions', 'media', 'user_roles']
    },
    'support': {
        'file': 'forumkit_support.db', 
        'description': '客服支援系統',
        'tables': ['support_tickets', 'support_messages']
    },
    'chat': {
        'file': 'forumkit_chat.db',
        'description': '聊天室系統',
        'tables': ['chat_messages', 'chat_rooms', 'chat_room_members']
    },
    'moderation': {
        'file': 'forumkit_moderation.db',
        'description': '審核和管理系統',
        'tables': ['moderation_logs', 'system_events', 'notification_preferences']
    },
    'organization': {
        'file': 'forumkit_organization.db',
        'description': '組織管理（學校、公告等）',
        'tables': ['schools', 'school_settings', 'announcements', 'announcement_reads']
    }
}

class DatabaseService:
    """資料庫服務管理器"""
    
    def __init__(self, data_path: str = "./data"):
        self.data_path = data_path
        self.engines = {}
        self.session_makers = {}
        self._ensure_directory()
    
    def _ensure_directory(self):
        """確保資料目錄存在"""
        os.makedirs(self.data_path, exist_ok=True)
        
        # 創建資料庫資訊檔案
        info_path = os.path.join(self.data_path, "database_info.md")
        if not os.path.exists(info_path):
            self._create_database_info_file(info_path)
    
    def _create_database_info_file(self, info_path: str):
        """創建資料庫資訊檔案"""
        content = "# ForumKit 多資料庫架構\n\n"
        content += "## 資料庫分離說明\n\n"
        content += "為了提高系統穩定性和維護性，ForumKit 採用多資料庫架構：\n\n"
        
        for service, config in DB_SERVICES.items():
            content += f"### {service.upper()}\n"
            content += f"- **檔案**: `{config['file']}`\n"
            content += f"- **描述**: {config['description']}\n"
            content += f"- **表格**: {', '.join(config['tables'])}\n\n"
        
        content += "## 優勢\n\n"
        content += "1. **服務隔離**: 不同功能使用獨立資料庫，避免相互干擾\n"
        content += "2. **備份靈活**: 可以針對不同服務進行獨立備份\n"
        content += "3. **擴展性強**: 未來可以輕鬆將不同服務部署到不同伺服器\n"
        content += "4. **故障隔離**: 單個服務的資料庫問題不會影響其他服務\n\n"
        content += "## 使用方法\n\n"
        content += "```python\n"
        content += "from utils.db_multi import get_core_session, get_support_session\n\n"
        content += "# 獲取核心功能資料庫會話\n"
        content += "core_db = get_core_session()\n\n"
        content += "# 獲取支援系統資料庫會話\n"
        content += "support_db = get_support_session()\n"
        content += "```\n"
        
        with open(info_path, 'w', encoding='utf-8') as f:
            f.write(content)
    
    def get_database_path(self, service: str) -> str:
        """獲取資料庫檔案路徑"""
        if service not in DB_SERVICES:
            raise ValueError(f"Unknown service: {service}")
        return os.path.join(self.data_path, DB_SERVICES[service]['file'])
    
    def get_engine(self, service: str):
        """獲取資料庫引擎"""
        if service not in self.engines:
            db_path = self.get_database_path(service)
            db_url = f"sqlite:///{db_path}"
            
            engine = create_engine(
                db_url,
                poolclass=StaticPool,
                pool_pre_ping=True,
                pool_recycle=300,
                connect_args={
                    "check_same_thread": False,
                    "timeout": 30,
                    "isolation_level": None
                },
                echo=False
            )
            
            # 啟用 SQLite 優化
            with engine.connect() as conn:
                conn.execute(text("PRAGMA journal_mode=WAL"))
                conn.execute(text("PRAGMA synchronous=NORMAL"))
                conn.execute(text("PRAGMA cache_size=10000"))
                conn.execute(text("PRAGMA temp_store=MEMORY"))
                conn.commit()
            
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
            db_path = self.get_database_path(service)
            exists = os.path.exists(db_path)
            size = os.path.getsize(db_path) if exists else 0
            
            # 檢查連接狀態
            health = False
            if exists:
                try:
                    engine = self.get_engine(service)
                    with engine.connect() as conn:
                        conn.execute(text("SELECT 1"))
                    health = True
                except Exception:
                    health = False
            
            status[service] = {
                'description': config['description'],
                'file': config['file'],
                'path': db_path,
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
        source_path = self.get_database_path(service)
        backup_filename = f"{service}_{timestamp}.db"
        backup_path = os.path.join(backup_dir, backup_filename)
        
        if os.path.exists(source_path):
            import shutil
            shutil.copy2(source_path, backup_path)
            return backup_path
        else:
            raise FileNotFoundError(f"Database file not found: {source_path}")
    
    def cleanup_old_backups(self, backup_dir: str = "./backups", keep_days: int = 30):
        """清理舊備份檔案"""
        if not os.path.exists(backup_dir):
            return
        
        from datetime import datetime, timedelta
        cutoff_date = datetime.now() - timedelta(days=keep_days)
        
        removed_count = 0
        for filename in os.listdir(backup_dir):
            if filename.endswith('.db'):
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