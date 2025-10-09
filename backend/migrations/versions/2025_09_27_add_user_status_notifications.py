"""Add user status and notification tables for always-on chat system

Revision ID: 2025_09_27_add_user_status_notifications
Revises: 2025_09_18_add_reply_to_post_id
Create Date: 2025-09-27 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2025_09_27_add_user_status_notifications'
down_revision: Union[str, None] = '2025_09_18_add_reply_to_post_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    # Create user_status table
    if 'user_status' not in existing_tables:
        # First create the enum type
        user_status_enum = postgresql.ENUM('online', 'offline', 'away', 'dnd', name='userstatusenum')
        user_status_enum.create(op.get_bind())

        op.create_table('user_status',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('status', user_status_enum, nullable=False, default='offline'),
            sa.Column('last_seen', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('last_activity', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('chat_notifications', sa.Boolean(), nullable=False, default=True),
            sa.Column('mention_notifications', sa.Boolean(), nullable=False, default=True),
            sa.Column('system_notifications', sa.Boolean(), nullable=False, default=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id')
        )

        # Create indexes
        op.create_index('ix_user_status_user_id', 'user_status', ['user_id'], unique=True)
        print("✅ Created user_status table with indexes")
    else:
        print("ℹ️ user_status table already exists, skipping creation")

    # Create user_notifications table
    if 'user_notifications' not in existing_tables:
        op.create_table('user_notifications',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('notification_type', sa.String(length=32), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('content', sa.String(length=1000), nullable=True),
            sa.Column('room_id', sa.String(length=64), nullable=True),
            sa.Column('message_id', sa.Integer(), nullable=True),
            sa.Column('from_user_id', sa.Integer(), nullable=True),
            sa.Column('is_read', sa.Boolean(), nullable=False, default=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, default=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['from_user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

        # Create indexes for user_notifications
        op.create_index('ix_user_notifications_user_id', 'user_notifications', ['user_id'], unique=False)
        op.create_index('ix_user_notifications_is_read', 'user_notifications', ['is_read'], unique=False)
        op.create_index('ix_user_notifications_created_at', 'user_notifications', ['created_at'], unique=False)
        print("✅ Created user_notifications table with indexes")
    else:
        print("ℹ️ user_notifications table already exists, skipping creation")


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    # Drop user_notifications table
    if 'user_notifications' in existing_tables:
        # Check and drop indexes if they exist
        existing_indexes = inspector.get_indexes('user_notifications')
        index_names = [idx['name'] for idx in existing_indexes]

        if 'ix_user_notifications_created_at' in index_names:
            op.drop_index('ix_user_notifications_created_at', table_name='user_notifications')
        if 'ix_user_notifications_is_read' in index_names:
            op.drop_index('ix_user_notifications_is_read', table_name='user_notifications')
        if 'ix_user_notifications_user_id' in index_names:
            op.drop_index('ix_user_notifications_user_id', table_name='user_notifications')

        op.drop_table('user_notifications')
        print("✅ Dropped user_notifications table")
    else:
        print("ℹ️ user_notifications table does not exist, skipping drop")

    # Drop user_status table
    if 'user_status' in existing_tables:
        # Check and drop indexes if they exist
        existing_indexes = inspector.get_indexes('user_status')
        index_names = [idx['name'] for idx in existing_indexes]

        if 'ix_user_status_user_id' in index_names:
            op.drop_index('ix_user_status_user_id', table_name='user_status')

        op.drop_table('user_status')
        print("✅ Dropped user_status table")

        # Drop the enum type
        try:
            user_status_enum = postgresql.ENUM(name='userstatusenum')
            user_status_enum.drop(op.get_bind())
            print("✅ Dropped userstatusenum enum type")
        except Exception as e:
            print(f"⚠️ Could not drop userstatusenum enum type: {e}")
    else:
        print("ℹ️ user_status table does not exist, skipping drop")