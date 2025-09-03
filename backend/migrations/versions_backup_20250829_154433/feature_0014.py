"""Add announcement tables for notification system

Revision ID: feature_0014
Revises: feature_0006
Create Date: 2025-08-28 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20250828_add_announcement_tables'
down_revision: Union[str, None] = 'feature_0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if tables already exist
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()
    
    # Create announcements table if it doesn't exist
    if 'announcements' not in existing_tables:
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
    else:
        print("Table 'announcements' already exists, skipping creation")
    
    # Create announcement_reads table if it doesn't exist
    if 'announcement_reads' not in existing_tables:
        op.create_table('announcement_reads',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('announcement_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('read_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['announcement_id'], ['announcements.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
    else:
        print("Table 'announcement_reads' already exists, skipping creation")
    
    # Create indexes for better performance (only if tables exist)
    if 'announcements' in existing_tables:
        try:
            op.create_index(op.f('ix_announcements_created_at'), 'announcements', ['created_at'], unique=False)
        except Exception:
            print("Index 'ix_announcements_created_at' already exists")
        
        try:
            op.create_index(op.f('ix_announcements_school_id'), 'announcements', ['school_id'], unique=False)
        except Exception:
            print("Index 'ix_announcements_school_id' already exists")
        
        try:
            op.create_index(op.f('ix_announcements_is_active'), 'announcements', ['is_active'], unique=False)
        except Exception:
            print("Index 'ix_announcements_is_active' already exists")
        
        try:
            op.create_index(op.f('ix_announcements_is_pinned'), 'announcements', ['is_pinned'], unique=False)
        except Exception:
            print("Index 'ix_announcements_is_pinned' already exists")
    
    if 'announcement_reads' in existing_tables:
        try:
            op.create_index(op.f('ix_announcement_reads_announcement_id'), 'announcement_reads', ['announcement_id'], unique=False)
        except Exception:
            print("Index 'ix_announcement_reads_announcement_id' already exists")
        
        try:
            op.create_index(op.f('ix_announcement_reads_user_id'), 'announcement_reads', ['user_id'], unique=False)
        except Exception:
            print("Index 'ix_announcement_reads_user_id' already exists")
        
        # Create unique constraint for announcement reads
        try:
            op.create_unique_constraint('uq_announcement_read', 'announcement_reads', ['announcement_id', 'user_id'])
        except Exception:
            print("Unique constraint 'uq_announcement_read' already exists")


def downgrade() -> None:
    op.drop_constraint('uq_announcement_read', 'announcement_reads', type_='unique')
    op.drop_index(op.f('ix_announcement_reads_user_id'), table_name='announcement_reads')
    op.drop_index(op.f('ix_announcement_reads_announcement_id'), table_name='announcement_reads')
    op.drop_index(op.f('ix_announcements_is_pinned'), table_name='announcements')
    op.drop_index(op.f('ix_announcements_is_active'), table_name='announcements')
    op.drop_index(op.f('ix_announcements_school_id'), table_name='announcements')
    op.drop_index(op.f('ix_announcements_created_at'), table_name='announcements')
    op.drop_table('announcement_reads')
    op.drop_table('announcements')
