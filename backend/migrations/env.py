from alembic import context
from sqlalchemy import engine_from_config, pool
from logging.config import fileConfig
import os, sys
from pathlib import Path

# 載入主目錄下的 .env 文件
env_path = Path(__file__).parent.parent.parent / '.env'
if not env_path.exists():
    # 如果在容器內，嘗試從 /app 目錄載入
    env_path = Path('.env')
if env_path.exists():
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

# 讓 alembic 找到 models
sys.path.append(os.getcwd())
from models import Base  # noqa

config = context.config
try:
    if config.config_file_name:
        fileConfig(config.config_file_name, disable_existing_loggers=False)
except Exception:
    pass
target_metadata = Base.metadata

def run_migrations_offline():
    # 使用 Docker Compose 中設置的 DATABASE_URL
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        # 如果沒有 DATABASE_URL，嘗試構建一個
        db_url = "postgresql+psycopg2://forumkit:forumkit@postgres:80/forumkit"
    context.configure(url=db_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    # 使用 Docker Compose 中設置的 DATABASE_URL
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        # 如果沒有 DATABASE_URL，嘗試構建一個
        db_url = "postgresql+psycopg2://forumkit:forumkit@postgres:80/forumkit"
    connectable = engine_from_config(
        {"sqlalchemy.url": db_url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode(): run_migrations_offline()
else: run_migrations_online()
