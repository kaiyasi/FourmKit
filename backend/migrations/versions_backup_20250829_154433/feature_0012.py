"""Add announcement tables for notification system

Revision ID: feature_0012
Revises: feature_0006
Create Date: 2025-08-28 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2025_08_28_add_announcements'
down_revision: Union[str, None] = 'feature_0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if announcements table already exists
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()
    
    if 'announcements' not in existing_tables:
        # Create announcements table
        op.create_table('announcements',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('title', sa.String(length=256), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('type', sa.String(length=32), nullable=False, default='info'),
            sa.Column('priority', sa.String(length=16), nullable=False, default='normal'),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
            sa.Column('is_pinned', sa.Boolean(), nullable=False, default=False),
            sa.Column('start_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('end_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('school_id', sa.Integer(), nullable=True),
            sa.Column('created_by', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
    
    if 'announcement_reads' not in existing_tables:
        # Create announcement_reads table
        op.create_table('announcement_reads',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('announcement_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('read_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['announcement_id'], ['announcements.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
    
    # Create indexes for better performance (only if they don't exist)
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('announcements')] if 'announcements' in existing_tables else []
    
    if 'ix_announcements_created_at' not in existing_indexes:
        op.create_index(op.f('ix_announcements_created_at'), 'announcements', ['created_at'], unique=False)
    if 'ix_announcements_school_id' not in existing_indexes:
        op.create_index(op.f('ix_announcements_school_id'), 'announcements', ['school_id'], unique=False)
    if 'ix_announcements_is_active' not in existing_indexes:
        op.create_index(op.f('ix_announcements_is_active'), 'announcements', ['is_active'], unique=False)
    if 'ix_announcements_is_pinned' not in existing_indexes:
        op.create_index(op.f('ix_announcements_is_pinned'), 'announcements', ['is_pinned'], unique=False)
    
    if 'announcement_reads' in existing_tables:
        reads_indexes = [idx['name'] for idx in inspector.get_indexes('announcement_reads')]
        if 'ix_announcement_reads_announcement_id' not in reads_indexes:
            op.create_index(op.f('ix_announcement_reads_announcement_id'), 'announcement_reads', ['announcement_id'], unique=False)
        if 'ix_announcement_reads_user_id' not in reads_indexes:
            op.create_index(op.f('ix_announcement_reads_user_id'), 'announcement_reads', ['user_id'], unique=False)
    
    # Create unique constraint for announcement reads (only if it doesn't exist)
    if 'announcement_reads' in existing_tables:
        existing_constraints = [constraint['name'] for constraint in inspector.get_unique_constraints('announcement_reads')]
        if 'uq_announcement_read' not in existing_constraints:
            op.create_unique_constraint('uq_announcement_read', 'announcement_reads', ['announcement_id', 'user_id'])


def downgrade() -> None:
    # Check if tables exist before dropping
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()
    
    if 'announcement_reads' in existing_tables:
        op.drop_constraint('uq_announcement_read', 'announcement_reads', type_='unique')
        op.drop_index(op.f('ix_announcement_reads_user_id'), table_name='announcement_reads')
        op.drop_index(op.f('ix_announcement_reads_announcement_id'), table_name='announcement_reads')
        op.drop_table('announcement_reads')
    
    if 'announcements' in existing_tables:
        op.drop_index(op.f('ix_announcements_is_pinned'), table_name='announcements')
        op.drop_index(op.f('ix_announcements_is_active'), table_name='announcements')
        op.drop_index(op.f('ix_announcements_school_id'), table_name='announcements')
        op.drop_index(op.f('ix_announcements_created_at'), table_name='announcements')
        op.drop_table('announcements')
