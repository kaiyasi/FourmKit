"""Rename user role 'advertise' to 'commercial'

Revision ID: 2025_08_30_rename_advertise_to_commercial
Revises: 2025_08_29_add_chat_room_member
Create Date: 2025-08-30

"""
from typing import Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2025_08_30_rename_advertise_to_commercial'
down_revision: Union[str, None] = '2025_08_29_add_chat_room_member'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # 將舊有使用者角色 'advertise' 改名為 'commercial'
    conn.execute(sa.text("UPDATE users SET role='commercial' WHERE role='advertise'"))


def downgrade() -> None:
    conn = op.get_bind()
    # 還原（若需要）
    conn.execute(sa.text("UPDATE users SET role='advertise' WHERE role='commercial'"))

