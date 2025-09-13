"""更新發布模式為統一輪播

Revision ID: update_publish_modes_2025
Revises: previous_revision
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'update_publish_modes_2025'
down_revision = None  # 根據實際情況更新
branch_labels = None
depends_on = None

def upgrade():
    """將現有的 immediate 模式更新為 batch 模式"""
    
    # 更新所有 immediate 模式的帳號為 batch 模式
    op.execute("""
        UPDATE ig_accounts 
        SET publish_mode = 'batch' 
        WHERE publish_mode = 'immediate'
    """)
    
    # 可選：重設所有帳號的 batch_threshold 為合理值
    op.execute("""
        UPDATE ig_accounts 
        SET batch_threshold = 5 
        WHERE batch_threshold IS NULL OR batch_threshold < 2
    """)
    
    print("✅ 已將所有 immediate 模式更新為 batch 模式（定量觸發輪播）")
    print("✅ 已確保所有帳號的批量閾值至少為 2")

def downgrade():
    """回退：將 batch 模式恢復為 immediate（不建議）"""
    
    # 注意：這會破壞新的輪播邏輯，不建議執行
    op.execute("""
        UPDATE ig_accounts 
        SET publish_mode = 'immediate' 
        WHERE publish_mode = 'batch'
    """)
    
    print("⚠️  已回退為 immediate 模式，但這會破壞輪播功能")
