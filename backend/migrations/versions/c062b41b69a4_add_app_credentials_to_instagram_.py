"""add_app_credentials_to_instagram_accounts

Revision ID: c062b41b69a4
Revises: e9fe8d539ab6
Create Date: 2025-10-02 02:05:12.201879

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c062b41b69a4'
down_revision: Union[str, None] = 'e9fe8d539ab6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 App ID 欄位
    op.add_column('instagram_accounts', sa.Column('app_id', sa.String(length=100), nullable=True, comment='Facebook App ID'))

    # 添加加密的 App Secret 欄位
    op.add_column('instagram_accounts', sa.Column('app_secret_encrypted', sa.Text(), nullable=True, comment='加密的 App Secret'))


def downgrade() -> None:
    # 移除欄位
    op.drop_column('instagram_accounts', 'app_secret_encrypted')
    op.drop_column('instagram_accounts', 'app_id')
