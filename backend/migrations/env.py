from alembic import context
from sqlalchemy import engine_from_config, pool
from logging.config import fileConfig
import os, sys

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
    context.configure(url=os.getenv("DATABASE_URL"), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        {"sqlalchemy.url": os.getenv("DATABASE_URL")},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode(): run_migrations_offline()
else: run_migrations_online()
