"""add_instagram_system

Revision ID: ig_system_v1
Revises: 2025_09_27_add_user_status_notifications
Create Date: 2025-10-01 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'ig_system_v1'
down_revision = '2025_09_27_add_user_status_notifications'
branch_labels = None
depends_on = None


def upgrade():
    # ========== Instagram Accounts Table ==========
    op.create_table(
        'instagram_accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('school_id', sa.Integer(), nullable=True),
        sa.Column('ig_user_id', sa.String(length=100), nullable=False, comment='Instagram User ID'),
        sa.Column('username', sa.String(length=100), nullable=False, comment='Instagram 用戶名'),
        sa.Column('access_token_encrypted', sa.Text(), nullable=False, comment='加密的 Access Token'),
        sa.Column('token_expires_at', sa.DateTime(), nullable=False, comment='Token 過期時間'),
        sa.Column('last_token_refresh', sa.DateTime(), nullable=True, comment='最後刷新時間'),
        sa.Column('publish_mode', sa.Enum('INSTANT', 'BATCH', 'SCHEDULED', name='publishmode'), nullable=False, server_default='BATCH', comment='發布模式'),
        sa.Column('batch_count', sa.Integer(), nullable=True, server_default='10', comment='批次發布數量（batch 模式）'),
        sa.Column('scheduled_times', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment="排程時間列表（scheduled 模式），格式：['09:00', '15:00', '21:00']"),
        sa.Column('announcement_template_id', sa.Integer(), nullable=True, comment='公告模板 ID'),
        sa.Column('general_template_id', sa.Integer(), nullable=True, comment='一般模板 ID'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true', comment='是否啟用'),
        sa.Column('last_publish_at', sa.DateTime(), nullable=True, comment='最後發布時間'),
        sa.Column('last_error', sa.Text(), nullable=True, comment='最後錯誤訊息'),
        sa.Column('last_error_at', sa.DateTime(), nullable=True, comment='最後錯誤時間'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('batch_count >= 1 AND batch_count <= 10', name='valid_batch_count'),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ig_user_id')
    )
    op.create_index('idx_ig_account_school_active', 'instagram_accounts', ['school_id', 'is_active'])
    op.create_index('idx_ig_account_token_expires', 'instagram_accounts', ['token_expires_at'])

    # ========== IG Templates Table ==========
    op.create_table(
        'ig_templates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False, comment='模板名稱'),
        sa.Column('description', sa.Text(), nullable=True, comment='模板描述'),
        sa.Column('school_id', sa.Integer(), nullable=True, comment='學校 ID（NULL 表示全域模板）'),
        sa.Column('template_type', sa.Enum('ANNOUNCEMENT', 'GENERAL', name='templatetype'), nullable=False, comment='模板類型'),
        sa.Column('canvas_config', postgresql.JSON(astext_type=sa.Text()), nullable=False, comment='Canvas 配置'),
        sa.Column('text_with_attachment', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment='有附件時的文字配置'),
        sa.Column('text_without_attachment', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment='無附件時的文字配置'),
        sa.Column('attachment_config', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment='附件圖片配置'),
        sa.Column('logo_config', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment='Logo 配置'),
        sa.Column('watermark_config', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment='浮水印配置'),
        sa.Column('caption_template', postgresql.JSON(astext_type=sa.Text()), nullable=False, comment='Caption 模板配置'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true', comment='是否啟用'),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0', comment='使用次數'),
        sa.Column('last_used_at', sa.DateTime(), nullable=True, comment='最後使用時間'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_ig_template_school_type', 'ig_templates', ['school_id', 'template_type', 'is_active'])

    # Add foreign keys for template references in instagram_accounts
    op.create_foreign_key(
        'fk_ig_account_announcement_template',
        'instagram_accounts', 'ig_templates',
        ['announcement_template_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_ig_account_general_template',
        'instagram_accounts', 'ig_templates',
        ['general_template_id'], ['id'],
        ondelete='SET NULL'
    )

    # ========== Instagram Posts Table ==========
    op.create_table(
        'instagram_posts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('public_id', sa.String(length=50), nullable=False, comment='公開 ID（用於外部查詢）'),
        sa.Column('forum_post_id', sa.Integer(), nullable=False, comment='論壇貼文 ID'),
        sa.Column('ig_account_id', sa.Integer(), nullable=False, comment='IG 帳號 ID'),
        sa.Column('template_id', sa.Integer(), nullable=True, comment='使用的模板 ID'),
        sa.Column('rendered_image_cdn_path', sa.String(length=500), nullable=True, comment='渲染後圖片的 CDN 路徑'),
        sa.Column('rendered_caption', sa.Text(), nullable=True, comment='渲染後的 Caption（最終發布內容）'),
        sa.Column('carousel_group_id', sa.String(length=50), nullable=True, comment='輪播組 ID（10 篇一組）'),
        sa.Column('carousel_position', sa.Integer(), nullable=True, comment='在輪播中的位置（1-10）'),
        sa.Column('carousel_total', sa.Integer(), nullable=True, comment='輪播總數'),
        sa.Column('ig_media_id', sa.String(length=100), nullable=True, comment='Instagram Media ID'),
        sa.Column('ig_container_id', sa.String(length=100), nullable=True, comment='Instagram Container ID'),
        sa.Column('ig_permalink', sa.String(length=500), nullable=True, comment='Instagram 連結'),
        sa.Column('status', sa.Enum('PENDING', 'RENDERING', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', name='poststatus'), nullable=False, server_default='PENDING', comment='發布狀態'),
        sa.Column('publish_mode', sa.Enum('INSTANT', 'BATCH', 'SCHEDULED', name='publishmode'), nullable=False, comment='發布模式'),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True, comment='排程發布時間'),
        sa.Column('published_at', sa.DateTime(), nullable=True, comment='實際發布時間'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='錯誤訊息'),
        sa.Column('error_code', sa.String(length=50), nullable=True, comment='錯誤代碼'),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0', comment='重試次數'),
        sa.Column('last_retry_at', sa.DateTime(), nullable=True, comment='最後重試時間'),
        sa.Column('max_retries', sa.Integer(), nullable=False, server_default='3', comment='最大重試次數'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('retry_count <= max_retries', name='valid_retry_count'),
        sa.CheckConstraint('carousel_position >= 1 AND carousel_position <= 10', name='valid_carousel_position'),
        sa.ForeignKeyConstraint(['forum_post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ig_account_id'], ['instagram_accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['template_id'], ['ig_templates.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('public_id'),
        sa.UniqueConstraint('ig_media_id')
    )
    op.create_index('idx_ig_post_public_id', 'instagram_posts', ['public_id'])
    op.create_index('idx_ig_post_forum_post', 'instagram_posts', ['forum_post_id'])
    op.create_index('idx_ig_post_account', 'instagram_posts', ['ig_account_id'])
    op.create_index('idx_ig_post_status_mode', 'instagram_posts', ['status', 'publish_mode'])
    op.create_index('idx_ig_post_carousel', 'instagram_posts', ['carousel_group_id', 'carousel_position'])
    op.create_index('idx_ig_post_scheduled', 'instagram_posts', ['scheduled_at', 'status'])

    # ========== Font Files Table ==========
    op.create_table(
        'font_files',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('font_family', sa.String(length=100), nullable=False, comment='字體家族名稱（用於 CSS）'),
        sa.Column('display_name', sa.String(length=100), nullable=False, comment='顯示名稱（UI 用）'),
        sa.Column('description', sa.Text(), nullable=True, comment='字體描述'),
        sa.Column('filename', sa.String(length=255), nullable=False, comment='檔案名稱'),
        sa.Column('file_path', sa.String(length=500), nullable=False, comment='檔案存儲路徑'),
        sa.Column('file_size', sa.Integer(), nullable=False, comment='檔案大小（bytes）'),
        sa.Column('file_format', sa.String(length=20), nullable=False, comment='檔案格式（ttf/otf/woff2）'),
        sa.Column('is_chinese_supported', sa.Boolean(), nullable=False, server_default='false', comment='是否支援中文'),
        sa.Column('weight', sa.Enum('100', '200', '300', '400', '500', '600', '700', '800', '900', name='fontweight'), nullable=True, server_default='400', comment='字體粗細'),
        sa.Column('style', sa.Enum('NORMAL', 'ITALIC', 'OBLIQUE', name='fontstyle'), nullable=True, server_default='NORMAL', comment='字體樣式'),
        sa.Column('scope', sa.Enum('GLOBAL', 'SCHOOL', name='fontscope'), nullable=False, server_default='GLOBAL', comment='作用範圍'),
        sa.Column('school_id', sa.Integer(), nullable=True, comment='專屬學校 ID（scope=school 時必填）'),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0', comment='使用次數'),
        sa.Column('last_used_at', sa.DateTime(), nullable=True, comment='最後使用時間'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true', comment='是否啟用'),
        sa.Column('uploaded_by', sa.Integer(), nullable=True, comment='上傳者 ID'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('file_size <= 10485760', name='valid_file_size'),
        sa.CheckConstraint(
            "(scope = 'GLOBAL' AND school_id IS NULL) OR (scope = 'SCHOOL' AND school_id IS NOT NULL)",
            name='valid_scope_school'
        ),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('font_family'),
        sa.UniqueConstraint('file_path')
    )
    op.create_index('idx_font_scope_active', 'font_files', ['scope', 'is_active'])
    op.create_index('idx_font_school_active', 'font_files', ['school_id', 'is_active'])

    # ========== Font Requests Table ==========
    op.create_table(
        'font_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('font_name', sa.String(length=100), nullable=False, comment='申請的字體名稱'),
        sa.Column('font_url', sa.String(length=500), nullable=True, comment='字體來源 URL'),
        sa.Column('description', sa.Text(), nullable=True, comment='字體描述'),
        sa.Column('reason', sa.Text(), nullable=False, comment='申請理由'),
        sa.Column('requester_id', sa.Integer(), nullable=False, comment='申請人 ID'),
        sa.Column('school_id', sa.Integer(), nullable=False, comment='申請學校 ID'),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', name='fontrequeststatus'), nullable=False, server_default='PENDING', comment='申請狀態'),
        sa.Column('reviewer_id', sa.Integer(), nullable=True, comment='審核人 ID'),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True, comment='審核時間'),
        sa.Column('review_reason', sa.Text(), nullable=True, comment='審核意見（拒絕時必填）'),
        sa.Column('font_file_id', sa.Integer(), nullable=True, comment='關聯的字體檔案 ID（核准後）'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['font_file_id'], ['font_files.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_font_request_requester', 'font_requests', ['requester_id'])
    op.create_index('idx_font_request_school', 'font_requests', ['school_id'])
    op.create_index('idx_font_request_status', 'font_requests', ['status'])
    op.create_index('idx_font_request_status_school', 'font_requests', ['status', 'school_id'])
    op.create_index('idx_font_request_requester_status', 'font_requests', ['requester_id', 'status'])


def downgrade():
    # Drop tables in reverse order
    op.drop_table('font_requests')
    op.drop_table('font_files')
    op.drop_table('instagram_posts')

    # Drop foreign keys from instagram_accounts first
    op.drop_constraint('fk_ig_account_general_template', 'instagram_accounts', type_='foreignkey')
    op.drop_constraint('fk_ig_account_announcement_template', 'instagram_accounts', type_='foreignkey')

    op.drop_table('ig_templates')
    op.drop_table('instagram_accounts')

    # Drop enums
    op.execute('DROP TYPE IF EXISTS publishmode')
    op.execute('DROP TYPE IF EXISTS templatetype')
    op.execute('DROP TYPE IF EXISTS poststatus')
    op.execute('DROP TYPE IF EXISTS fontscope')
    op.execute('DROP TYPE IF EXISTS fontrequeststatus')
    op.execute('DROP TYPE IF EXISTS fontweight')
    op.execute('DROP TYPE IF EXISTS fontstyle')
