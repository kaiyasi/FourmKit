#!/usr/bin/env python3
"""
一次性修正：將預設貼文的學校歸屬調整為
- ID 3 → 跨校（school_id = NULL）
- ID 4 → 成功大學（ncku）

使用方式：
  python backend/scripts/fix_default_posts.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db import init_engine_session, db_session
from models import Post, School

def main():
    init_engine_session()
    ncku = db_session.query(School).filter_by(slug='ncku').first()
    if not ncku:
        print('[fix_default_posts] 找不到 ncku 學校，略過 ID4 指派。')
    p3 = db_session.query(Post).get(3)
    p4 = db_session.query(Post).get(4)
    if p3:
        p3.school_id = None
        print('[fix_default_posts] 已將 ID3 設為跨校')
    if p4:
        if ncku:
            p4.school_id = ncku.id
            print('[fix_default_posts] 已將 ID4 指派為成功大學 (ncku)')
    db_session.commit()
    print('[fix_default_posts] Done')

if __name__ == '__main__':
    main()

