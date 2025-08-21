from alembic import op
import sqlalchemy as sa

# Revision identifiers, used by Alembic.
revision = "2025_08_21_add_client_ip_fields"
down_revision = "2025_08_19_add_moderation"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    try:
        cols = [c.get("name") for c in insp.get_columns(table)]  # type: ignore[attr-defined]
        return column in cols
    except Exception:
        return False


def upgrade():
    # posts: add client_id, ip
    if not _has_column("posts", "client_id"):
        op.add_column("posts", sa.Column("client_id", sa.String(length=64), nullable=True))
    if not _has_column("posts", "ip"):
        op.add_column("posts", sa.Column("ip", sa.String(length=64), nullable=True))

    # media: add client_id, ip
    if not _has_column("media", "client_id"):
        op.add_column("media", sa.Column("client_id", sa.String(length=64), nullable=True))
    if not _has_column("media", "ip"):
        op.add_column("media", sa.Column("ip", sa.String(length=64), nullable=True))


def downgrade():
    # reverse order to be safe
    try:
        op.drop_column("media", "ip")
    except Exception:
        pass
    try:
        op.drop_column("media", "client_id")
    except Exception:
        pass
    try:
        op.drop_column("posts", "ip")
    except Exception:
        pass
    try:
        op.drop_column("posts", "client_id")
    except Exception:
        pass

