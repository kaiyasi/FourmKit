"""Add ChatRoomMember table for chat room member management

Revision ID: 2025_08_29_add_chat_room_member
Revises: 2025_08_29_add_announcement_type
Create Date: 2025-08-29 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2025_08_29_add_chat_room_member'
down_revision: Union[str, None] = '2025_08_29_add_announcement_type'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if chat_room_members table already exists
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()
    
    if 'chat_room_members' not in existing_tables:
        # Create chat_room_members table
        op.create_table('chat_room_members',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('room_id', sa.String(length=64), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
            sa.ForeignKeyConstraint(['room_id'], ['chat_rooms.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        print("✅ Created chat_room_members table")
    else:
        print("ℹ️ chat_room_members table already exists, skipping creation")
    
    # Check and create indexes if they don't exist
    existing_indexes = inspector.get_indexes('chat_room_members') if 'chat_room_members' in existing_tables else []
    index_names = [idx['name'] for idx in existing_indexes]
    
    if 'ix_chat_room_members_room_id' not in index_names:
        op.create_index(op.f('ix_chat_room_members_room_id'), 'chat_room_members', ['room_id'], unique=False)
        print("✅ Created ix_chat_room_members_room_id index")
    else:
        print("ℹ️ ix_chat_room_members_room_id index already exists")
        
    if 'ix_chat_room_members_user_id' not in index_names:
        op.create_index(op.f('ix_chat_room_members_user_id'), 'chat_room_members', ['user_id'], unique=False)
        print("✅ Created ix_chat_room_members_user_id index")
    else:
        print("ℹ️ ix_chat_room_members_user_id index already exists")


def downgrade() -> None:
    # Check if table exists before trying to drop
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()
    
    if 'chat_room_members' in existing_tables:
        # Check and drop indexes if they exist
        existing_indexes = inspector.get_indexes('chat_room_members')
        index_names = [idx['name'] for idx in existing_indexes]
        
        if 'ix_chat_room_members_user_id' in index_names:
            op.drop_index(op.f('ix_chat_room_members_user_id'), table_name='chat_room_members')
            print("✅ Dropped ix_chat_room_members_user_id index")
            
        if 'ix_chat_room_members_room_id' in index_names:
            op.drop_index(op.f('ix_chat_room_members_room_id'), table_name='chat_room_members')
            print("✅ Dropped ix_chat_room_members_room_id index")
        
        # Drop table
        op.drop_table('chat_room_members')
        print("✅ Dropped chat_room_members table")
    else:
        print("ℹ️ chat_room_members table does not exist, skipping drop")
