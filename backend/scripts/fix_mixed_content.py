#!/usr/bin/env python3
"""
Quick fixer to upgrade hardcoded http URLs to https for forum.serelix.xyz.
Usage:
  DATABASE_URL=postgresql+psycopg2://... python backend/scripts/fix_mixed_content.py
"""
import os
from sqlalchemy import create_engine, text

DB_URL = os.getenv('DATABASE_URL')
if not DB_URL:
    raise SystemExit('DATABASE_URL not set')

engine = create_engine(DB_URL)

TARGET_HTTP = 'http://forum.serelix.xyz'
TARGET_HTTPS = 'https://forum.serelix.xyz'

stmts = [
    ("ig_posts", "generated_image"),
    ("ig_accounts", "profile_picture"),
    ("school_logos", "logo_url"),
]

with engine.begin() as conn:
    for table, col in stmts:
        print(f"Updating {table}.{col} ...")
        conn.execute(text(f"""
            UPDATE {table}
            SET {col} = REPLACE({col}, :http, :https)
            WHERE {col} ILIKE :prefix
        """), {"http": TARGET_HTTP, "https": TARGET_HTTPS, "prefix": TARGET_HTTP + '%'})
    print("Done.")

