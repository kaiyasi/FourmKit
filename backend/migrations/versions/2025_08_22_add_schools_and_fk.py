from alembic import op
import sqlalchemy as sa

revision = "2025_08_22_add_schools_and_fk"
down_revision = "2025_08_21_add_client_ip_fields"
branch_labels = None
depends_on = None


def _has_table(table: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    try:
        return insp.has_table(table)  # type: ignore[attr-defined]
    except Exception:
        return False


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    try:
        cols = [c.get("name") for c in insp.get_columns(table)]  # type: ignore[attr-defined]
        return column in cols
    except Exception:
        return False


def upgrade():
    # schools table
    if not _has_table("schools"):
        op.create_table(
            "schools",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("slug", sa.String(length=64), nullable=False, unique=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        )

    # users: email + school_id
    if not _has_column("users", "email"):
        op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
        try:
            op.create_unique_constraint("uq_users_email", "users", ["email"])
        except Exception:
            pass
    if not _has_column("users", "school_id"):
        op.add_column("users", sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id"), nullable=True))

    # posts: school_id
    if not _has_column("posts", "school_id"):
        op.add_column("posts", sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id"), nullable=True))
        try:
            op.create_index("ix_posts_school_created", "posts", ["school_id", "created_at"])  # composite
        except Exception:
            pass

    # media: school_id
    if not _has_column("media", "school_id"):
        op.add_column("media", sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id"), nullable=True))


def downgrade():
    try:
        op.drop_column("media", "school_id")
    except Exception:
        pass
    try:
        op.drop_index("ix_posts_school_created", table_name="posts")
    except Exception:
        pass
    try:
        op.drop_column("posts", "school_id")
    except Exception:
        pass
    try:
        op.drop_constraint("uq_users_email", "users", type_="unique")
    except Exception:
        pass
    try:
        op.drop_column("users", "email")
    except Exception:
        pass
    try:
        op.drop_column("users", "school_id")
    except Exception:
        pass
    try:
        op.drop_table("schools")
    except Exception:
        pass

