"""Add Instagram integration models

Revision ID: ig_models_001
Revises: 
Create Date: 2025-09-03 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func

# revision identifiers, used by Alembic.
revision = 'ig_models_001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Create ig_accounts table
    op.create_table(
        'ig_accounts',
        sa.Column('id', Integer, primary_key=True, autoincrement=True),
        sa.Column('ig_user_id', String(64), unique=True, nullable=False),
        sa.Column('ig_username', String(64), nullable=False),
        sa.Column('page_id', String(64), nullable=False),
        sa.Column('page_name', String(255), nullable=False),
        sa.Column('page_token', Text, nullable=False),
        sa.Column('token_expires_at', DateTime(timezone=True), nullable=True),
        sa.Column('status', String(16), default='pending', nullable=False),
        sa.Column('display_name', String(255), nullable=False),
        sa.Column('description', Text, nullable=True),
        sa.Column('profile_picture', String(500), nullable=True),
        sa.Column('publish_mode', String(16), default='immediate', nullable=False),
        sa.Column('batch_threshold', Integer, default=5, nullable=False),
        sa.Column('auto_hashtags', JSON, default=list, nullable=False),
        sa.Column('school_id', Integer, ForeignKey('schools.id'), nullable=True),
        sa.Column('created_by', Integer, ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
        sa.Column('updated_at', DateTime(timezone=True), nullable=True),
        sa.Column('total_posts', Integer, default=0, nullable=False),
        sa.Column('last_post_at', DateTime(timezone=True), nullable=True),
    )
    
    # Create ig_templates table
    op.create_table(
        'ig_templates',
        sa.Column('id', Integer, primary_key=True, autoincrement=True),
        sa.Column('account_id', Integer, ForeignKey('ig_accounts.id'), nullable=False),
        sa.Column('name', String(255), nullable=False),
        sa.Column('description', Text, nullable=True),
        sa.Column('template_data', JSON, nullable=False),
        sa.Column('is_active', Boolean, default=True, nullable=False),
        sa.Column('is_default', Boolean, default=False, nullable=False),
        sa.Column('created_by', Integer, ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
        sa.Column('updated_at', DateTime(timezone=True), nullable=True),
        sa.Column('usage_count', Integer, default=0, nullable=False),
    )
    
    # Create ig_posts table
    op.create_table(
        'ig_posts',
        sa.Column('id', Integer, primary_key=True, autoincrement=True),
        sa.Column('account_id', Integer, ForeignKey('ig_accounts.id'), nullable=False),
        sa.Column('forum_post_id', Integer, ForeignKey('posts.id'), nullable=False),
        sa.Column('template_id', Integer, ForeignKey('ig_templates.id'), nullable=False),
        sa.Column('custom_caption', Text, nullable=True),
        sa.Column('hashtags', JSON, default=list, nullable=False),
        sa.Column('generated_image', String(500), nullable=True),
        sa.Column('status', String(16), default='pending', nullable=False),
        sa.Column('scheduled_at', DateTime(timezone=True), nullable=True),
        sa.Column('ig_media_id', String(64), nullable=True),
        sa.Column('ig_post_url', String(500), nullable=True),
        sa.Column('error_message', Text, nullable=True),
        sa.Column('retry_count', Integer, default=0, nullable=False),
        sa.Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
        sa.Column('updated_at', DateTime(timezone=True), nullable=True),
        sa.Column('published_at', DateTime(timezone=True), nullable=True),
    )
    
    # Create school_logos table
    op.create_table(
        'school_logos',
        sa.Column('id', Integer, primary_key=True, autoincrement=True),
        sa.Column('school_id', Integer, ForeignKey('schools.id'), nullable=False),
        sa.Column('logo_url', String(500), nullable=False),
        sa.Column('logo_type', String(32), default='primary', nullable=False),
        sa.Column('alt_text', String(255), nullable=True),
        sa.Column('is_active', Boolean, default=True, nullable=False),
        sa.Column('display_order', Integer, default=0, nullable=False),
        sa.Column('uploaded_by', Integer, ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    
    # Create ig_settings table
    op.create_table(
        'ig_settings',
        sa.Column('id', Integer, primary_key=True, autoincrement=True),
        sa.Column('key', String(255), unique=True, nullable=False),
        sa.Column('value', Text, nullable=True),
        sa.Column('data', JSON, nullable=True),
        sa.Column('category', String(64), default='general', nullable=False),
        sa.Column('description', Text, nullable=True),
        sa.Column('created_by', Integer, ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
        sa.Column('updated_at', DateTime(timezone=True), nullable=True),
    )
    
    # Create indexes for better performance
    op.create_index('idx_ig_posts_status', 'ig_posts', ['status'])
    op.create_index('idx_ig_posts_created_at', 'ig_posts', ['created_at'])
    op.create_index('idx_ig_posts_scheduled_at', 'ig_posts', ['scheduled_at'])
    op.create_index('idx_ig_accounts_status', 'ig_accounts', ['status'])

def downgrade():
    # Drop indexes
    op.drop_index('idx_ig_accounts_status')
    op.drop_index('idx_ig_posts_scheduled_at')
    op.drop_index('idx_ig_posts_created_at')
    op.drop_index('idx_ig_posts_status')
    
    # Drop tables in reverse order (due to foreign keys)
    op.drop_table('ig_settings')
    op.drop_table('school_logos')
    op.drop_table('ig_posts')
    op.drop_table('ig_templates')
    op.drop_table('ig_accounts')