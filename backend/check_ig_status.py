#!/usr/bin/env python3
"""
檢查 Instagram 發布狀態工具
用於驗證資料庫狀態與實際 Instagram 發布狀態是否一致
"""

import sys
sys.path.insert(0, '/mnt/data_pool_b/kaiyasi/ForumKit/backend')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import InstagramPost, InstagramAccount
from utils.ig_crypto import decrypt_token
from services.ig_api_client import IGAPIClient
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

engine = create_engine('postgresql://forumkit:forumkit_password@127.0.0.1:12007/forumkit')
Session = sessionmaker(bind=engine)
db = Session()

def check_post_on_instagram(post: InstagramPost) -> dict:
    """
    檢查貼文在 Instagram 上的實際狀態

    Returns:
        dict: {
            'exists': bool,  # 是否存在於 IG
            'media_id': str,  # IG Media ID
            'permalink': str,  # IG 連結
            'status_match': bool  # 資料庫狀態是否正確
        }
    """
    result = {
        'post_id': post.id,
        'public_id': post.public_id,
        'db_status': post.status.value,
        'db_media_id': post.ig_media_id,
        'exists_on_ig': False,
        'ig_media_id': None,
        'ig_permalink': None,
        'status_match': False,
        'issue': None
    }

    if not post.ig_media_id:
        result['issue'] = '無 media_id，無法驗證'
        result['status_match'] = (post.status.value != 'PUBLISHED')
        return result

    try:
        account = post.account
        if not account:
            result['issue'] = '找不到關聯的 IG 帳號'
            return result

        access_token = decrypt_token(account.access_token_encrypted)

        with IGAPIClient(access_token, account.ig_user_id) as api:
            media_info = api.get_media_info(post.ig_media_id)

            if media_info:
                result['exists_on_ig'] = True
                result['ig_media_id'] = media_info.get('id')
                result['ig_permalink'] = media_info.get('permalink')

                if post.status.value == 'PUBLISHED':
                    result['status_match'] = True
                else:
                    result['status_match'] = False
                    result['issue'] = f'IG 上已發布，但資料庫狀態為 {post.status.value}'
            else:
                result['exists_on_ig'] = False
                result['issue'] = 'IG 上找不到此貼文'
                result['status_match'] = (post.status.value == 'FAILED')

    except Exception as e:
        result['issue'] = f'檢查失敗: {str(e)}'

    return result


def main():
    print("=== Instagram 發布狀態檢查工具 ===\n")

    posts_with_media = db.query(InstagramPost).filter(
        InstagramPost.ig_media_id.isnot(None)
    ).all()

    print(f"找到 {len(posts_with_media)} 筆有 media_id 的記錄\n")

    issues = []

    for post in posts_with_media:
        result = check_post_on_instagram(post)

        if not result['status_match']:
            issues.append(result)
            print(f"❌ ID: {result['post_id']}, Public ID: {result['public_id']}")
            print(f"   資料庫狀態: {result['db_status']}")
            print(f"   IG 上存在: {result['exists_on_ig']}")
            print(f"   問題: {result['issue']}\n")
        else:
            print(f"✓ ID: {result['post_id']}, Public ID: {result['public_id']} - 狀態一致")

    print(f"\n總共發現 {len(issues)} 筆狀態不一致的記錄")

    if issues:
        print("\n是否要自動修復這些記錄？ (y/n): ", end='')
        choice = input().strip().lower()

        if choice == 'y':
            for issue in issues:
                post = db.query(InstagramPost).filter_by(id=issue['post_id']).first()

                if issue['exists_on_ig'] and post.status.value != 'PUBLISHED':
                    post.status = 'PUBLISHED'
                    post.ig_permalink = issue['ig_permalink']
                    print(f"✓ 已將 ID {post.id} 狀態更新為 PUBLISHED")

                elif not issue['exists_on_ig'] and post.status.value == 'PUBLISHED':
                    post.status = 'FAILED'
                    post.error_message = 'IG 上找不到此貼文'
                    print(f"✓ 已將 ID {post.id} 狀態更新為 FAILED")

            db.commit()
            print("\n修復完成！")
        else:
            print("已取消修復")

    db.close()


if __name__ == '__main__':
    main()
