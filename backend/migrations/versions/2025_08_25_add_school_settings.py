"""add school_settings table

Revision ID: 2025_08_25_add_school_settings
Revises: 
Create Date: 2025-08-25
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2025_08_25_add_school_settings'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'school_settings',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('school_id', sa.Integer(), sa.ForeignKey('schools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('data', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )
    op.create_unique_constraint('uq_school_settings_school', 'school_settings', ['school_id'])


def downgrade() -> None:
    op.drop_constraint('uq_school_settings_school', 'school_settings', type_='unique')
    op.drop_table('school_settings')


