from alembic import op
import sqlalchemy as sa

revision = "2025_08_23_add_school_logo"
down_revision = "2025_08_22_add_schools_and_fk"
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
    if not _has_column("schools", "logo_path"):
        op.add_column("schools", sa.Column("logo_path", sa.String(length=255), nullable=True))


def downgrade():
    try:
        op.drop_column("schools", "logo_path")
    except Exception:
        pass

