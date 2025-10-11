"""
將 instagram_posts.status 欄位統一為小寫字串，並移除 Enum 依賴

- 將現有資料的狀態全部轉為小寫
- 若資料表使用了 Enum，需先嘗試轉為可兼容型別（以 SQLite/MySQL/PostgreSQL 適配為原則）
- 注意：此腳本為最小侵入式，僅處理資料與型別；索引維持不變
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'ig_status_lower_20251010'
down_revision = 'ig_system_v1'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    has_table = 'instagram_posts' in inspector.get_table_names()
    if not has_table:
        return

    # 嘗試將欄位改為可容納字串（若已是 String 則略過）
    try:
        op.alter_column('instagram_posts', 'status',
                        existing_type=sa.Enum('PENDING','RENDERING','READY','PUBLISHING','PUBLISHED','FAILED','CANCELLED', name='poststatus'),
                        type_=sa.String(length=20),
                        existing_nullable=False,
                        nullable=False)
    except Exception:
        # 若不是上述 Enum 型別或資料庫不支援直接 alter，忽略錯誤，後續僅做資料修正
        pass

    # 將現有資料轉為小寫
    try:
        conn.execute(sa.text("""
            UPDATE instagram_posts
            SET status = LOWER(status)
            WHERE status IS NOT NULL
        """))
    except Exception:
        # 兼容可能是 Enum 導致 LOWER 失敗的情況，分別處理
        for val in ['PENDING','RENDERING','READY','PUBLISHING','PUBLISHED','FAILED','CANCELLED']:
            try:
                conn.execute(sa.text("UPDATE instagram_posts SET status = :lower WHERE status = :upper"),
                             {"lower": val.lower(), "upper": val})
            except Exception:
                pass


def downgrade():
    # 不強制退回 Enum，維持字串狀態；若必要可在此處恢復 Enum 型別
    pass
