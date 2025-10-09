"""merge_ig_and_images

Revision ID: e9fe8d539ab6
Revises: add_multiple_images_support, ig_system_v1
Create Date: 2025-10-02 02:05:06.875628

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9fe8d539ab6'
down_revision: Union[str, None] = ('add_multiple_images_support', 'ig_system_v1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
