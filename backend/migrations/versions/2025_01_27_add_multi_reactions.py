"""Add multi-reaction support

Revision ID: 2025_01_27_add_multi_reactions
Revises: add_comments
Create Date: 2025-01-27 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2025_01_27_add_multi_reactions'
down_revision = 'add_comments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 刪除舊的唯一約束
    op.drop_constraint('unique_user_post_reaction', 'post_reactions', type_='unique')
    
    # 添加新的唯一約束，支援多種反應
    op.create_unique_constraint('unique_user_post_reaction_type', 'post_reactions', ['post_id', 'user_id', 'reaction_type'])


def downgrade() -> None:
    # 刪除新的唯一約束
    op.drop_constraint('unique_user_post_reaction_type', 'post_reactions', type_='unique')
    
    # 恢復舊的唯一約束
    op.create_unique_constraint('unique_user_post_reaction', 'post_reactions', ['post_id', 'user_id'])
