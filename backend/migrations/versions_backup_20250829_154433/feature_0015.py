"""Add premium fields to users table

Revision ID: feature_0015
Revises: 20250828_add_announcement_tables
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20250101_add_premium_fields'
down_revision: Union[str, None] = '20250828_add_announcement_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if columns already exist
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_columns = [col['name'] for col in inspector.get_columns('users')]
    
    # Add is_premium column if it doesn't exist
    if 'is_premium' not in existing_columns:
        op.add_column('users', sa.Column('is_premium', sa.Boolean(), nullable=False, server_default='false'))
        print("✅ Added is_premium column to users table")
    else:
        print("ℹ️ is_premium column already exists")
    
    # Add premium_until column if it doesn't exist
    if 'premium_until' not in existing_columns:
        op.add_column('users', sa.Column('premium_until', sa.DateTime(timezone=True), nullable=True))
        print("✅ Added premium_until column to users table")
    else:
        print("ℹ️ premium_until column already exists")


def downgrade() -> None:
    # Remove premium columns
    op.drop_column('users', 'premium_until')
    op.drop_column('users', 'is_premium')
