"""merge multiple heads into single linear head

Revision ID: 2025_08_27_merge_heads
Revises: ('2025_01_27_add_multi_reactions', '2025_08_23_add_user_avatar', '2025_08_23_add_school_logo', '2025_08_26_add_school_gmail_domain')
Create Date: 2025-08-27 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op  # noqa: F401  # imported for consistency
import sqlalchemy as sa  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = '2025_08_27_merge_heads'
down_revision: Union[str, Sequence[str], None] = (
    '2025_01_27_add_multi_reactions',
    '2025_08_23_add_user_avatar',
    '2025_08_23_add_school_logo',
    '2025_08_26_add_school_gmail_domain',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # merge revision; no-op
    pass


def downgrade() -> None:
    # merge revision; no-op
    pass

