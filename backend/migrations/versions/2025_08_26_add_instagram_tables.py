"""add instagram integration tables

Revision ID: 2025_08_26_add_instagram_tables
Revises: 2025_08_25_add_school_settings
Create Date: 2025-08-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '2025_08_26_add_instagram_tables'
down_revision = '2025_08_25_add_school_settings'
branch_labels = None
depends_on = None


def upgrade():
    # Instagram 帳號表
    op.create_table('instagram_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_name', sa.String(length=100), nullable=False, comment='帳號顯示名稱'),
        sa.Column('username', sa.String(length=50), nullable=False, comment='Instagram 用戶名'),
        sa.Column('access_token', sa.Text(), nullable=True, comment='Instagram API Access Token'),
        sa.Column('account_id', sa.String(length=50), nullable=True, comment='Instagram 商業帳號 ID'),
        sa.Column('is_active', sa.Boolean(), nullable=True, comment='是否啟用'),
        sa.Column('school_id', sa.Integer(), nullable=True, comment='關聯學校ID，null為跨校帳號'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_unique_constraint('uq_instagram_accounts_username', 'instagram_accounts', ['username'])
    
    # Instagram 模板表
    op.create_table('instagram_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False, comment='模板名稱'),
        sa.Column('description', sa.Text(), nullable=True, comment='模板描述'),
        sa.Column('background_color', sa.String(length=7), nullable=True, comment='背景色'),
        sa.Column('background_image', sa.String(length=200), nullable=True, comment='背景圖片路徑'),
        sa.Column('text_color', sa.String(length=7), nullable=True, comment='文字顏色'),
        sa.Column('accent_color', sa.String(length=7), nullable=True, comment='強調色'),
        sa.Column('title_font', sa.String(length=50), nullable=True, comment='標題字體'),
        sa.Column('content_font', sa.String(length=50), nullable=True, comment='內文字體'),
        sa.Column('title_size', sa.Integer(), nullable=True, comment='標題字體大小'),
        sa.Column('content_size', sa.Integer(), nullable=True, comment='內文字體大小'),
        sa.Column('layout_config', sa.JSON(), nullable=True, comment='佈局配置JSON'),
        sa.Column('show_logo', sa.Boolean(), nullable=True, comment='是否顯示Logo'),
        sa.Column('logo_position', sa.String(length=20), nullable=True, comment='Logo位置'),
        sa.Column('watermark_text', sa.String(length=100), nullable=True, comment='浮水印文字'),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True, comment='是否為預設模板'),
        sa.Column('school_id', sa.Integer(), nullable=True, comment='專屬學校，null為通用'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Instagram 貼文記錄表
    op.create_table('instagram_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False, comment='關聯的原始貼文'),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=False),
        sa.Column('instagram_media_id', sa.String(length=50), nullable=True, comment='Instagram 媒體 ID'),
        sa.Column('instagram_permalink', sa.String(length=500), nullable=True, comment='Instagram 貼文連結'),
        sa.Column('generated_image_path', sa.String(length=200), nullable=True, comment='生成的圖片路徑'),
        sa.Column('image_width', sa.Integer(), nullable=True),
        sa.Column('image_height', sa.Integer(), nullable=True),
        sa.Column('caption', sa.Text(), nullable=True, comment='IG 貼文文字'),
        sa.Column('hashtags', sa.Text(), nullable=True, comment='標籤'),
        sa.Column('status', sa.String(length=20), nullable=True, comment='狀態: pending, generated, published, failed'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='錯誤訊息'),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True, comment='排程發送時間'),
        sa.Column('published_at', sa.DateTime(), nullable=True, comment='實際發送時間'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['instagram_accounts.id'], ),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
        sa.ForeignKeyConstraint(['template_id'], ['instagram_templates.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Instagram 排程設定表
    op.create_table('instagram_schedulers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False, comment='排程名稱'),
        sa.Column('school_id', sa.Integer(), nullable=True, comment='關聯學校，null為全局'),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('trigger_type', sa.String(length=20), nullable=False, comment='觸發類型: count, time, manual'),
        sa.Column('trigger_count', sa.Integer(), nullable=True, comment='積累數量觸發(5篇)'),
        sa.Column('trigger_time', sa.String(length=8), nullable=True, comment='定時觸發(00:00:00)'),
        sa.Column('filter_school_only', sa.Boolean(), nullable=True, comment='僅發送本校貼文'),
        sa.Column('filter_min_length', sa.Integer(), nullable=True, comment='最小內容長度'),
        sa.Column('filter_exclude_media', sa.Boolean(), nullable=True, comment='排除包含媒體的貼文'),
        sa.Column('template_id', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['instagram_accounts.id'], ),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ),
        sa.ForeignKeyConstraint(['template_id'], ['instagram_templates.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Instagram 發送佇列表
    op.create_table('instagram_queue',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('scheduler_id', sa.Integer(), nullable=False),
        sa.Column('batch_id', sa.String(length=36), nullable=True, comment='批次ID'),
        sa.Column('priority', sa.Integer(), nullable=True, comment='優先度，數字越小越優先'),
        sa.Column('status', sa.String(length=20), nullable=True, comment='狀態: queued, processing, completed, failed'),
        sa.Column('attempts', sa.Integer(), nullable=True, comment='嘗試次數'),
        sa.Column('max_attempts', sa.Integer(), nullable=True, comment='最大嘗試次數'),
        sa.Column('scheduled_at', sa.DateTime(), nullable=False, comment='預計處理時間'),
        sa.Column('processed_at', sa.DateTime(), nullable=True, comment='實際處理時間'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
        sa.ForeignKeyConstraint(['scheduler_id'], ['instagram_schedulers.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # 設定預設值
    op.execute("ALTER TABLE instagram_accounts ALTER COLUMN is_active SET DEFAULT true")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN background_color SET DEFAULT '#ffffff'")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN text_color SET DEFAULT '#333333'")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN accent_color SET DEFAULT '#3b82f6'")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN title_font SET DEFAULT 'Noto Sans TC'")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN content_font SET DEFAULT 'Noto Sans TC'")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN title_size SET DEFAULT 24")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN content_size SET DEFAULT 16")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN show_logo SET DEFAULT true")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN logo_position SET DEFAULT 'bottom-right'")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN is_active SET DEFAULT true")
    op.execute("ALTER TABLE instagram_templates ALTER COLUMN is_default SET DEFAULT false")
    op.execute("ALTER TABLE instagram_posts ALTER COLUMN image_width SET DEFAULT 1080")
    op.execute("ALTER TABLE instagram_posts ALTER COLUMN image_height SET DEFAULT 1080")
    op.execute("ALTER TABLE instagram_posts ALTER COLUMN status SET DEFAULT 'pending'")
    op.execute("ALTER TABLE instagram_schedulers ALTER COLUMN filter_school_only SET DEFAULT false")
    op.execute("ALTER TABLE instagram_schedulers ALTER COLUMN filter_min_length SET DEFAULT 10")
    op.execute("ALTER TABLE instagram_schedulers ALTER COLUMN filter_exclude_media SET DEFAULT false")
    op.execute("ALTER TABLE instagram_schedulers ALTER COLUMN is_active SET DEFAULT true")
    op.execute("ALTER TABLE instagram_queue ALTER COLUMN priority SET DEFAULT 100")
    op.execute("ALTER TABLE instagram_queue ALTER COLUMN status SET DEFAULT 'queued'")
    op.execute("ALTER TABLE instagram_queue ALTER COLUMN attempts SET DEFAULT 0")
    op.execute("ALTER TABLE instagram_queue ALTER COLUMN max_attempts SET DEFAULT 3")


def downgrade():
    op.drop_table('instagram_queue')
    op.drop_table('instagram_schedulers') 
    op.drop_table('instagram_posts')
    op.drop_table('instagram_templates')
    op.drop_table('instagram_accounts')