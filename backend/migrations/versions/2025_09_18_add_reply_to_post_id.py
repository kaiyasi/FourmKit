"""
Add reply_to_post_id to posts table

Revision ID: 2025_09_18_add_reply_to_post_id
Revises: 2025_08_30_rename_advertise_to_commercial
Create Date: 2025-09-18
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2025_09_18_add_reply_to_post_id'
down_revision = '2025_08_30_rename_advertise_to_commercial'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('posts') as batch_op:
        batch_op.add_column(sa.Column('reply_to_post_id', sa.Integer(), nullable=True))
        try:
            batch_op.create_foreign_key(
                'fk_posts_reply_to_post_id_posts',
                'posts',
                ['reply_to_post_id'],
                ['id'],
                ondelete=None,
            )
        except Exception:
            # Some engines may not support creating the FK in batch context; ignore gracefully.
            pass


def downgrade():
    with op.batch_alter_table('posts') as batch_op:
        try:
            batch_op.drop_constraint('fk_posts_reply_to_post_id_posts', type_='foreignkey')
        except Exception:
            pass
        batch_op.drop_column('reply_to_post_id')

