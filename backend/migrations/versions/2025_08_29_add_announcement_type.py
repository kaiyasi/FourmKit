"""Add announcement_type to posts table

Revision ID: 2025_08_29_add_announcement_type
Revises: 2025_08_29_fix_post_pinning_columns
Create Date: 2025-08-29 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2025_08_29_add_announcement_type'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # 檢查欄位是否已存在
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('posts')]
    
    if 'announcement_type' not in columns:
        op.add_column('posts', sa.Column('announcement_type', sa.String(16), nullable=True))

def downgrade():
    # 檢查欄位是否存在
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('posts')]
    
    if 'announcement_type' in columns:
        op.drop_column('posts', 'announcement_type')
