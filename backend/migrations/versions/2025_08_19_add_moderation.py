from alembic import op
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError, ProgrammingError, OperationalError

revision = "2025_08_19_add_moderation"
down_revision = None  # 初始遷移

def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    def has_index(table: str, name: str) -> bool:
        try:
            idx = insp.get_indexes(table)  # type: ignore[attr-defined]
            return any(i.get("name") == name for i in idx)
        except Exception:
            return False

    def safe_create(table_name: str, creator):
        """
        Create table inside a SAVEPOINT so that failures won't poison the outer transaction.
        This avoids InFailedSqlTransaction for subsequent reflection calls on PostgreSQL.
        """
        try:
            if insp.has_table(table_name):
                return
            conn = op.get_bind()
            # Nested transaction -> SAVEPOINT on Postgres
            with conn.begin_nested():
                creator()
        except (IntegrityError, ProgrammingError, OperationalError):
            # Likely already exists or type conflicts -> ignore
            pass
        except Exception:
            # Tolerate other unexpected states as no-op
            pass

    # users
    safe_create("users", lambda: op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(64), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    ))

    # posts
    safe_create("posts", lambda: op.create_table(
        "posts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("author_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    ))
    if insp.has_table("posts") and not has_index("posts", "ix_posts_status_id"):
        op.create_index("ix_posts_status_id", "posts", ["status", "id"])

    # media
    safe_create("media", lambda: op.create_table(
        "media",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("post_id", sa.Integer, sa.ForeignKey("posts.id"), nullable=False),
        sa.Column("path", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    ))
    if insp.has_table("media") and not has_index("media", "ix_media_status_id"):
        op.create_index("ix_media_status_id", "media", ["status", "id"])

    # moderation_logs
    safe_create("moderation_logs", lambda: op.create_table(
        "moderation_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("old_status", sa.String(16), nullable=True),
        sa.Column("new_status", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("moderator_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    ))
    if insp.has_table("moderation_logs") and not has_index("moderation_logs", "ix_mlogs_target"):
        op.create_index("ix_mlogs_target", "moderation_logs", ["target_type", "target_id"])

def downgrade():
    op.drop_index("ix_mlogs_target", table_name="moderation_logs")
    op.drop_table("moderation_logs")
    op.drop_index("ix_media_status_id", table_name="media")
    op.drop_table("media")
    op.drop_index("ix_posts_status_id", table_name="posts")
    op.drop_table("posts")
    op.drop_table("users")
