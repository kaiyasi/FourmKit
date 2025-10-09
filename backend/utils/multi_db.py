"""
多資料庫管理系統
按功能服務分離資料庫，避免服務間相互干擾
"""
import os
from typing import Dict, Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# 資料庫配置映射
DATABASE_CONFIGS = {
    'forum': {
        'file': 'forum.db',
        'description': '核心論壇功能',
        'models': ['User', 'Post', 'DeleteRequest', 'Comment', 'PostReaction', 'CommentReaction', 'Media', 'UserRole']
    },
    'support': {
        'file': 'support.db', 
        'description': '客服支援系統',
        'models': ['SupportTicket', 'SupportMessage']
    },
    'chat': {
        'file': 'chat.db',
        'description': '聊天室系統',
        'models': ['ChatMessage', 'ChatRoom', 'ChatRoomMember']
    },
    'admin': {
        'file': 'admin.db',
        'description': '管理和事件系統',
        'models': ['ModerationLog', 'SystemEvent', 'NotificationPreference']
    },
    'school': {
        'file': 'school.db',
        'description': '學校管理系統',
        'models': ['School', 'SchoolSetting']
    },
    'announcement': {
        'file': 'announcement.db',
        'description': '公告系統',
        'models': ['Announcement', 'AnnouncementRead']
    }
}

class MultiDatabaseManager:
    """多資料庫管理器"""
    
    def __init__(self, base_path: str = "./data"):
        self.base_path = base_path
        self.engines: Dict[str, any] = {}
        self.sessions: Dict[str, sessionmaker] = {}
        self._ensure_data_directory()
    
    def _ensure_data_directory(self):
        """確保資料目錄存在"""
        os.makedirs(self.base_path, exist_ok=True)
    
    def get_database_path(self, db_name: str) -> str:
        """獲取資料庫檔案路徑"""
        config = DATABASE_CONFIGS.get(db_name)
        if not config:
            raise ValueError(f"Unknown database: {db_name}")
        return os.path.join(self.base_path, config['file'])
    
    def get_engine(self, db_name: str):
        """獲取資料庫引擎"""
        if db_name not in self.engines:
            db_path = self.get_database_path(db_name)
            db_url = f"sqlite:///{db_path}"
            
            engine = create_engine(
                db_url,
                poolclass=StaticPool,
                pool_pre_ping=True,
                pool_recycle=300,
                connect_args={
                    "check_same_thread": False,
                    "timeout": 30
                },
                echo=False
            )
            
            self.engines[db_name] = engine
            self.sessions[db_name] = sessionmaker(bind=engine)
        
        return self.engines[db_name]
    
    def get_session(self, db_name: str) -> Session:
        """獲取資料庫會話"""
        if db_name not in self.sessions:
            self.get_engine(db_name)  # 初始化引擎和會話
        return self.sessions[db_name]()
    
    def create_all_databases(self):
        """創建所有資料庫表格"""
        from models.base import Base
        
        for db_name in DATABASE_CONFIGS.keys():
            engine = self.get_engine(db_name)
            Base.metadata.create_all(engine)
            print(f"✅ Created database: {db_name} ({DATABASE_CONFIGS[db_name]['description']})")
    
    def get_database_info(self) -> Dict[str, dict]:
        """獲取所有資料庫資訊"""
        info = {}
        for db_name, config in DATABASE_CONFIGS.items():
            db_path = self.get_database_path(db_name)
            file_exists = os.path.exists(db_path)
            file_size = os.path.getsize(db_path) if file_exists else 0
            
            info[db_name] = {
                'description': config['description'],
                'file': config['file'],
                'path': db_path,
                'exists': file_exists,
                'size': file_size,
                'models': config['models']
            }
        
        return info
    
    def health_check(self) -> Dict[str, bool]:
        """檢查所有資料庫健康狀態"""
        health = {}
        
        for db_name in DATABASE_CONFIGS.keys():
            try:
                engine = self.get_engine(db_name)
                with engine.connect() as conn:
                    conn.execute("SELECT 1")
                health[db_name] = True
            except Exception:
                health[db_name] = False
        
        return health

# 全局實例
db_manager = MultiDatabaseManager()

# 便利函數
def get_forum_session() -> Session:
    """獲取論壇資料庫會話"""
    return db_manager.get_session('forum')

def get_support_session() -> Session:
    """獲取支援系統資料庫會話"""
    return db_manager.get_session('support')

def get_chat_session() -> Session:
    """獲取聊天室資料庫會話"""
    return db_manager.get_session('chat')

def get_admin_session() -> Session:
    """獲取管理系統資料庫會話"""
    return db_manager.get_session('admin')

def get_school_session() -> Session:
    """獲取學校管理資料庫會話"""
    return db_manager.get_session('school')

def get_announcement_session() -> Session:
    """獲取公告系統資料庫會話"""
    return db_manager.get_session('announcement')

def init_all_databases():
    """初始化所有資料庫"""
    db_manager.create_all_databases()

def get_db_health():
    """獲取資料庫健康狀態"""
    return db_manager.health_check()