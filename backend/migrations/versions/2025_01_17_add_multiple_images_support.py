"""add multiple images support

Revision ID: add_multiple_images_support
Revises:
Create Date: 2025-01-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_multiple_images_support'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    """新增多張圖片支援"""
    # 新增 generated_image_urls 欄位到 social_posts 表
    op.add_column('social_posts', sa.Column('generated_image_urls', sa.Text(), nullable=True))

def downgrade():
    """移除多張圖片支援"""
    # 移除 generated_image_urls 欄位
    op.drop_column('social_posts', 'generated_image_urls')