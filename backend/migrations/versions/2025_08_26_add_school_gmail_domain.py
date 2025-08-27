"""add school gmail domain field

Revision ID: 2025_08_26_add_school_gmail_domain
Revises: 2025_08_26_add_instagram_tables
Create Date: 2025-08-26 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '2025_08_26_add_school_gmail_domain'
down_revision = '2025_08_26_add_instagram_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Add gmail_domain field to schools table
    op.add_column('schools', sa.Column('gmail_domain', sa.String(length=100), nullable=True, comment='學校專用 Gmail 網域'))


def downgrade():
    op.drop_column('schools', 'gmail_domain')