"""Add support tickets system

Revision ID: 2025_08_28_tickets
Revises: 2025_08_27_merge_heads
Create Date: 2025-08-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '2025_08_28_tickets'
down_revision = '2025_08_27_merge_heads'
branch_labels = None
depends_on = None


def upgrade():
    # Create support_tickets table
    op.create_table(
        'support_tickets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_number', sa.String(32), nullable=False),
        sa.Column('submitter_id', sa.Integer(), nullable=True),
        sa.Column('submitter_email', sa.String(255), nullable=True),
        sa.Column('submitter_name', sa.String(64), nullable=True),
        sa.Column('submitter_ip', sa.String(64), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('subject', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.String(20), nullable=False, server_default='other'),
        sa.Column('priority', sa.String(10), nullable=False, server_default='medium'),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('assigned_to', sa.Integer(), nullable=True),
        sa.Column('school_id', sa.Integer(), nullable=True),
        sa.Column('scope', sa.String(10), nullable=False, server_default='cross'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_urgent', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['submitter_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id'], ),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create ticket_responses table
    op.create_table(
        'ticket_responses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=True),
        sa.Column('author_name', sa.String(64), nullable=True),
        sa.Column('author_email', sa.String(255), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_internal', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_staff_response', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('ip_address', sa.String(64), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create ticket_attachments table
    op.create_table(
        'ticket_attachments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('response_id', sa.Integer(), nullable=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('original_name', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ),
        sa.ForeignKeyConstraint(['response_id'], ['ticket_responses.id'], ),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create ticket_history table
    op.create_table(
        'ticket_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('actor_name', sa.String(64), nullable=True),
        sa.Column('field_name', sa.String(50), nullable=True),
        sa.Column('old_value', sa.Text(), nullable=True),
        sa.Column('new_value', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create user_identity_codes table
    op.create_table(
        'user_identity_codes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('name', sa.String(64), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verification_token', sa.String(64), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ticket_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_used', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for performance
    op.create_index('idx_tickets_number', 'support_tickets', ['ticket_number'], unique=True)
    op.create_index('idx_tickets_status_created', 'support_tickets', ['status', sa.text('created_at DESC')])
    op.create_index('idx_tickets_assigned_status', 'support_tickets', ['assigned_to', 'status'])
    op.create_index('idx_tickets_category_status', 'support_tickets', ['category', 'status'])
    op.create_index('idx_responses_ticket_created', 'ticket_responses', ['ticket_id', sa.text('created_at')])
    op.create_index('idx_identity_codes_code', 'user_identity_codes', ['code'], unique=True)
    
    # Add indexes for foreign keys
    op.create_index('idx_tickets_submitter', 'support_tickets', ['submitter_id'])
    op.create_index('idx_tickets_assigned', 'support_tickets', ['assigned_to'])
    op.create_index('idx_tickets_school', 'support_tickets', ['school_id'])
    op.create_index('idx_responses_ticket', 'ticket_responses', ['ticket_id'])
    op.create_index('idx_responses_author', 'ticket_responses', ['author_id'])
    op.create_index('idx_attachments_ticket', 'ticket_attachments', ['ticket_id'])
    op.create_index('idx_history_ticket', 'ticket_history', ['ticket_id'])


def downgrade():
    # Drop indexes first
    op.drop_index('idx_history_ticket')
    op.drop_index('idx_attachments_ticket')
    op.drop_index('idx_responses_author')
    op.drop_index('idx_responses_ticket')
    op.drop_index('idx_tickets_school')
    op.drop_index('idx_tickets_assigned')
    op.drop_index('idx_tickets_submitter')
    op.drop_index('idx_identity_codes_code')
    op.drop_index('idx_responses_ticket_created')
    op.drop_index('idx_tickets_category_status')
    op.drop_index('idx_tickets_assigned_status')
    op.drop_index('idx_tickets_status_created')
    op.drop_index('idx_tickets_number')
    
    # Drop tables
    op.drop_table('user_identity_codes')
    op.drop_table('ticket_history')
    op.drop_table('ticket_attachments')
    op.drop_table('ticket_responses')
    op.drop_table('support_tickets')