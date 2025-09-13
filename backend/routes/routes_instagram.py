# backend/routes/routes_instagram.py
"""
Instagram 整合管理 API 路由
"""
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import os
import requests  # used by debug and token exchange helpers
from flask import Blueprint, request, jsonify
from sqlalchemy import func, desc, asc
from sqlalchemy.orm import joinedload

from utils.db import get_session
from utils.authz import require_role
from flask_jwt_extended import get_jwt_identity
from models.social_publishing import (
    SocialAccount, ContentTemplate, SocialPost, CarouselGroup,
    PlatformType, AccountStatus, PublishTrigger, PostStatus, TemplateType
)
from models.base import User, Post
from models.school import School
from services.content_generator import ContentGenerator, preview_social_content
from services.platform_publishers import get_platform_publisher, PlatformPublisherError
from services.auto_publisher import _combine_carousel_captions, _combine_carousel_hashtags

instagram_bp = Blueprint('instagram', __name__, url_prefix='/api/admin/social')

@instagram_bp.route('/health', methods=['GET'])
def health_check():
    """健康檢查端點"""
    print("[健康檢查] Instagram API 健康檢查被呼叫")
    return jsonify({
        'success': True,
        'message': 'Instagram API is healthy',
        'timestamp': datetime.now().isoformat()
    })

@instagram_bp.route('/schools', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_schools():
    """獲取學校清單（根據權限過濾）"""
    try:
        with get_session() as db:
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if not user:
                return jsonify({
                    'success': False,
                    'error': '用戶不存在'
                }), 404
            
            # 根據角色返回不同的學校清單
            if user.role == 'dev_admin':
                # dev_admin 可以看到所有學校
                schools = db.query(School).order_by(School.name).all()
            elif user.role in ['campus_admin', 'cross_admin'] and user.school_id:
                # campus_admin 和 cross_admin 只能看到自己的學校
                schools = db.query(School).filter(School.id == user.school_id).all()
            else:
                schools = []
            
            result = []
            for school in schools:
                result.append({
                    'id': school.id,
                    'name': school.name,
                    'display_name': getattr(school, 'display_name', school.name),
                    'slug': getattr(school, 'slug', '')
                })
            
            return jsonify({
                'success': True,
                'schools': result,
                'user_role': user.role,
                'user_school_id': user.school_id
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch schools: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/test', methods=['GET'])
def test_accounts():
    """測試帳號端點（不需要權限）"""
    try:
        with get_session() as db:
            # 簡單查詢測試
            count = db.query(SocialAccount).count()
            return jsonify({
                'success': True,
                'message': f'Found {count} social accounts',
                'test': True
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Test failed: {str(e)}'
        }), 500

@instagram_bp.route('/accounts', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_social_accounts():
    """獲取社交媒體帳號列表"""
    try:
        with get_session() as db:
            query = db.query(SocialAccount).options(
                joinedload(SocialAccount.school),
                joinedload(SocialAccount.creator)
            ).filter(SocialAccount.platform == PlatformType.INSTAGRAM)
            
            # 權限過濾：非 dev_admin 只能看到自己學校的帳號
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                query = query.filter(
                    (SocialAccount.school_id == user.school_id) | 
                    (SocialAccount.school_id.is_(None))
                )
            
            accounts = query.order_by(desc(SocialAccount.created_at)).all()
            
            result = []
            for account in accounts:
                result.append({
                    'id': account.id,
                    'platform': account.platform,
                    'platform_username': account.platform_username,
                    'display_name': account.display_name,
                    'status': account.status,
                    'publish_trigger': account.publish_trigger,
                    'batch_size': account.batch_size,
                    'schedule_hour': account.schedule_hour,
                    'auto_hashtags': account.auto_hashtags,
                    'total_posts': account.total_posts,
                    'last_post_at': account.last_post_at.isoformat() if account.last_post_at else None,
                    'created_at': account.created_at.isoformat(),
                    'school_id': account.school_id,  # 新增：直接返回 school_id
                    'school': {
                        'id': account.school.id,
                        'name': account.school.name,
                        'display_name': getattr(account.school, 'display_name', account.school.name),
                        'slug': getattr(account.school, 'slug', '')
                    } if account.school else None,
                    'creator': {
                        'id': account.creator.id,
                        'username': account.creator.username
                    }
                })
            
            return jsonify({
                'success': True,
                'accounts': result
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch accounts: {str(e)}'
        }), 500

@instagram_bp.route('/templates', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_templates():
    """獲取內容模板列表"""
    try:
        account_id = request.args.get('account_id', type=int)
        
        with get_session() as db:
            query = db.query(ContentTemplate).options(
                joinedload(ContentTemplate.account),
                joinedload(ContentTemplate.creator)
            )
            
            if account_id:
                query = query.filter(ContentTemplate.account_id == account_id)
            else:
                # 只顯示用戶有權限的帳號的模板
                user_id = get_jwt_identity()
                user = db.query(User).filter(User.id == user_id).first()
                
                if user and user.role != 'dev_admin' and user.school_id:
                    query = query.join(SocialAccount).filter(
                        (SocialAccount.school_id == user.school_id) | 
                        (SocialAccount.school_id.is_(None))
                    )
            
            templates = query.order_by(
                desc(ContentTemplate.is_default),
                desc(ContentTemplate.created_at)
            ).all()
            
            result = []
            for template in templates:
                result.append({
                    'id': template.id,
                    'account_id': template.account_id,
                    'name': template.name,
                    'description': template.description,
                    'template_type': template.template_type,
                    'config': template.config,
                    'is_active': template.is_active,
                    'is_default': template.is_default,
                    'usage_count': template.usage_count,
                    'created_at': template.created_at.isoformat(),
                    'account': {
                        'platform_username': template.account.platform_username,
                        'display_name': template.account.display_name
                    },
                    'creator': {
                        'username': template.creator.username
                    }
                })
            
            return jsonify({
                'success': True,
                'templates': result
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch templates: {str(e)}'
        }), 500

@instagram_bp.route('/monitoring', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_publishing_monitoring():
    """獲取發布監控數據"""
    try:
        with get_session() as db:
            # 基本統計查詢
            base_query = db.query(SocialPost).join(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM
            )
            
            # 權限過濾
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                base_query = base_query.filter(
                    (SocialAccount.school_id == user.school_id) | 
                    (SocialAccount.school_id.is_(None))
                )
            
            # 總發布數
            total_posts = base_query.filter(
                SocialPost.status == PostStatus.PUBLISHED
            ).count()
            
            # 待處理數
            pending_posts = base_query.filter(
                SocialPost.status.in_([PostStatus.PENDING, PostStatus.QUEUED, PostStatus.PROCESSING])
            ).count()
            
            # 失敗數
            failed_posts = base_query.filter(
                SocialPost.status == PostStatus.FAILED
            ).count()
            
            # 今日發布數
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            published_today = base_query.filter(
                SocialPost.status == PostStatus.PUBLISHED,
                SocialPost.published_at >= today_start
            ).count()
            
            # 輪播群組監控數據
            carousel_query = db.query(CarouselGroup).join(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM
            )
            if user and user.role != 'dev_admin' and user.school_id:
                carousel_query = carousel_query.filter(
                    (SocialAccount.school_id == user.school_id) | 
                    (SocialAccount.school_id.is_(None))
                )
            
            carousel_processing = carousel_query.filter(
                CarouselGroup.status == 'processing'
            ).count()
            
            carousel_failed = carousel_query.filter(
                CarouselGroup.status == 'failed'
            ).count()
            
            carousel_completed = carousel_query.filter(
                CarouselGroup.status == 'completed'
            ).count()
            
            # 最近的輪播群組（用於顯示實時進度）
            recent_carousels = carousel_query.order_by(
                desc(CarouselGroup.created_at)
            ).limit(5).all()
            
            carousel_groups = []
            for carousel in recent_carousels:
                total_posts = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel.id
                ).count()
                
                published_posts = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel.id,
                    SocialPost.status == PostStatus.PUBLISHED
                ).count()
                
                processing_posts = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel.id,
                    SocialPost.status.in_([PostStatus.PENDING, PostStatus.QUEUED, PostStatus.PROCESSING])
                ).count()
                
                failed_posts = db.query(SocialPost).filter(
                    SocialPost.carousel_group_id == carousel.id,
                    SocialPost.status == PostStatus.FAILED
                ).count()
                
                progress = (published_posts / total_posts * 100) if total_posts > 0 else 0
                
                carousel_groups.append({
                    'id': carousel.id,
                    'group_id': carousel.group_id,  # 使用 group_id 而不是 batch_id
                    'title': carousel.title,
                    'status': carousel.status,
                    'total_posts': total_posts,
                    'published_posts': published_posts,
                    'processing_posts': processing_posts,
                    'failed_posts': failed_posts,
                    'progress': round(progress, 1),
                    'created_at': carousel.created_at.isoformat() if carousel.created_at else None
                })
            
            # 最近失敗的貼文 - 使用 joinedload 避免 N+1 查詢問題
            recent_failed = base_query.filter(
                SocialPost.status == PostStatus.FAILED
            ).options(
                joinedload(SocialPost.forum_post),
                joinedload(SocialPost.account)
            ).order_by(desc(SocialPost.updated_at)).limit(5).all()
            
            failed_posts_details = []
            for post in recent_failed:
                # Post 模型沒有 title 欄位；以內容前 50 字作為標題預覽，避免 AttributeError 造成 500
                preview = None
                try:
                    if post.forum_post and getattr(post.forum_post, 'content', None):
                        txt = post.forum_post.content
                        preview = (txt[:50] + ('…' if len(txt) > 50 else ''))
                except Exception:
                    preview = None

                failed_posts_details.append({
                    'id': post.id,
                    # 維持原鍵名給前端，但以內容摘要取代不可用的 title
                    'post_title': preview or 'No title',
                    'account_display_name': post.account.display_name if post.account else 'Unknown',
                    'error_message': post.error_message[:100] + '...' if post.error_message and len(post.error_message) > 100 else (post.error_message or 'No error message'),
                    'retry_count': post.retry_count,
                    'updated_at': post.updated_at.isoformat() if post.updated_at else None
                })
            
            return jsonify({
                'success': True,
                'monitoring': {
                    'overview': {
                        'total_posts': total_posts,
                        'pending_posts': pending_posts,
                        'failed_posts': failed_posts,
                        'published_today': published_today
                    },
                    'carousel_status': {
                        'processing': carousel_processing,
                        'failed': carousel_failed,
                        'completed': carousel_completed
                    },
                    'carousel_groups': carousel_groups,
                    'recent_failures': failed_posts_details
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch monitoring data: {str(e)}'
        }), 500

@instagram_bp.route('/debug/pages', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def debug_available_pages():
    """診斷：顯示 Token 可存取的所有 Pages"""
    try:
        data = request.get_json()
        user_token = data.get('instagram_user_token')
        
        if not user_token:
            return jsonify({
                'success': False,
                'error': '請提供 Instagram User Token'
            }), 400
        
        print(f"[除錯診斷] 開始檢查 Token: {user_token[:20]}...")
        
        # 檢查是否為短期 Token 並轉換
        final_user_token = user_token
        if user_token.startswith('EAAJ'):
            print(f"[除錯診斷] 偵測到短期 Token，嘗試轉換為長期 Token")
            try:
                exchange_url = "https://graph.facebook.com/v18.0/oauth/access_token"
                exchange_params = {
                    'grant_type': 'fb_exchange_token',
                    'client_id': os.getenv('FACEBOOK_APP_ID'),
                    'client_secret': os.getenv('FACEBOOK_APP_SECRET'),
                    'fb_exchange_token': user_token
                }
                
                exchange_response = requests.get(exchange_url, params=exchange_params)
                if exchange_response.status_code == 200:
                    exchange_data = exchange_response.json()
                    final_user_token = exchange_data.get('access_token', user_token)
                    print(f"[除錯診斷] Token 轉換成功")
                else:
                    print(f"[除錯診斷] Token 轉換失敗，使用原始 Token")
            except Exception as e:
                print(f"[除錯診斷] Token 轉換出錯: {e}")
        
        # 獲取使用者的所有 Pages
        pages_url = "https://graph.facebook.com/v18.0/me/accounts"
        pages_response = requests.get(pages_url, params={
            'access_token': final_user_token,
            'fields': 'id,name,access_token,instagram_business_account'
        })
        
        if pages_response.status_code != 200:
            error_data = pages_response.json()
            return jsonify({
                'success': False,
                'error': f'無法取得 Pages 清單: {error_data.get("error", {}).get("message", "未知錯誤")}'
            }), 400
        
        pages_data = pages_response.json()
        available_pages = []
        
        for page in pages_data.get('data', []):
            page_info = {
                'id': page['id'],
                'name': page['name'],
                'has_instagram': 'instagram_business_account' in page and page['instagram_business_account'],
                'instagram_account_id': None,
                'instagram_username': None
            }
            
            # 如果有 Instagram Business Account，取得詳細資訊
            if page_info['has_instagram']:
                try:
                    ig_account_id = page['instagram_business_account']['id']
                    page_info['instagram_account_id'] = ig_account_id
                    
                    # 取得 Instagram 帳號詳細資訊
                    ig_url = f"https://graph.facebook.com/v18.0/{ig_account_id}"
                    ig_response = requests.get(ig_url, params={
                        'access_token': page.get('access_token'),
                        'fields': 'id,username,name,account_type'
                    })
                    
                    if ig_response.status_code == 200:
                        ig_data = ig_response.json()
                        page_info['instagram_username'] = ig_data.get('username')
                        page_info['instagram_name'] = ig_data.get('name')
                        page_info['account_type'] = ig_data.get('account_type')
                except Exception as e:
                    print(f"[除錯診斷] 無法取得 Page {page['id']} 的 Instagram 詳細資訊: {e}")
            
            available_pages.append(page_info)
        
        return jsonify({
            'success': True,
            'pages': available_pages,
            'total_pages': len(available_pages),
            'instagram_pages': len([p for p in available_pages if p['has_instagram']])
        })
        
    except Exception as e:
        print(f"[除錯診斷] 錯誤: {e}")
        return jsonify({
            'success': False,
            'error': f'診斷失敗: {str(e)}'
        }), 500

@instagram_bp.route('/posts/sample', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_sample_posts():
    """獲取真實平台貼文數據用於預覽（忽略學校限制）"""
    try:
        with get_session() as db:
            # 獲取參數
            limit = request.args.get('limit', 10, type=int)
            school_id = request.args.get('school_id', type=int)
            
            # 構建查詢，只獲取已通過的貼文
            query = db.query(Post).options(
                joinedload(Post.author),
                joinedload(Post.school)
            ).filter(
                Post.status == 'approved',
                Post.is_deleted == False
            )
            
            # 如果指定了學校，可選擇性過濾（但用戶要求可以忽略學校限制）
            if school_id:
                query = query.filter(Post.school_id == school_id)
            
            # 按創建時間降序排序，獲取最新的貼文
            posts = query.order_by(desc(Post.created_at)).limit(limit).all()
            
            result = []
            for post in posts:
                # 構建與 preview template 相同格式的數據
                post_data = {
                    'id': post.id,
                    'title': '',  # Post 模型沒有 title，使用內容前50字符作為標題
                    'content': post.content,
                    'author': post.author.username if post.author else '匿名',
                    'school_name': post.school.name if post.school else '未指定學校',
                    'created_at': post.created_at.isoformat() if post.created_at else datetime.now().isoformat(),
                    'category': '論壇貼文',
                    'tags': []  # Post 模型目前沒有 tags，使用空列表
                }
                
                # 從內容生成標題（取前50字符）
                if post.content:
                    title_text = post.content.strip()[:50]
                    if len(post.content) > 50:
                        title_text += '...'
                    post_data['title'] = title_text
                
                result.append(post_data)
            
            return jsonify({
                'success': True,
                'posts': result,
                'count': len(result),
                'message': f'Found {len(result)} real posts for preview'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch sample posts: {str(e)}'
        }), 500

@instagram_bp.route('/templates/preview', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def preview_template():
    """預覽模板效果"""
    try:
        data = request.get_json()
        template_id = data.get('template_id')
        content_data = data.get('content_data', {})
        custom_options = data.get('custom_options')
        use_real_data = data.get('use_real_data', False)  # 新增選項：使用真實數據
        post_id = data.get('post_id')  # 指定特定貼文ID
        
        if not template_id:
            return jsonify({
                'success': False,
                'error': 'template_id is required'
            }), 400
        
        # 根據選擇使用真實數據或預設數據
        if use_real_data:
            with get_session() as db:
                if post_id:
                    # 使用指定的貼文
                    post = db.query(Post).options(
                        joinedload(Post.author),
                        joinedload(Post.school)
                    ).filter(
                        Post.id == post_id,
                        Post.status == 'approved',
                        Post.is_deleted == False
                    ).first()
                else:
                    # 隨機選擇一個真實貼文
                    post = db.query(Post).options(
                        joinedload(Post.author),
                        joinedload(Post.school)
                    ).filter(
                        Post.status == 'approved',
                        Post.is_deleted == False
                    ).order_by(func.random()).first()
                
                if post:
                    # 構建真實數據
                    real_content = {
                        'id': post.id,
                        'title': post.content.strip()[:50] + ('...' if len(post.content) > 50 else '') if post.content else '',
                        'content': post.content,
                        'author': post.author.username if post.author else '匿名',
                        'school_name': post.school.name if post.school else '未指定學校',
                        'created_at': post.created_at,
                        'category': '論壇貼文',
                        'tags': []
                    }
                    # 合併用戶提供的內容數據
                    final_content = {**real_content, **content_data}
                else:
                    # 如果沒有找到真實貼文，回退到預設內容
                    use_real_data = False
        
        if not use_real_data:
            # 使用預設內容數據
            default_content = {
                'title': '校園生活分享',
                'content': '今天天氣很好，同學們都在校園裡享受陽光！記得要多喝水，保持健康的生活習慣。',
                'author': '小明',
                'school_name': '範例大學',
                'created_at': datetime.now(),
                'category': '校園生活',
                'tags': ['校園', '生活', '健康']
            }
            # 合併用戶提供的內容數據
            final_content = {**default_content, **content_data}
        
        result = preview_social_content(final_content, template_id, custom_options)
        
        return jsonify({
            'success': True,
            'preview': result,
            'used_real_data': use_real_data,
            'post_id': final_content.get('id') if use_real_data else None
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Preview failed: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/<int:account_id>/validate', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def validate_account(account_id: int):
    """驗證帳號狀態"""
    try:
        with get_session() as db:
            account = db.query(SocialAccount).filter(
                SocialAccount.id == account_id,
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()
            
            if not account:
                return jsonify({
                    'success': False,
                    'error': 'Account not found'
                }), 404
            
            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': 'Access denied'
                    }), 403
            
            # 驗證帳號
            publisher = get_platform_publisher(account.platform)
            validation_result = publisher.validate_account(account)
            
            # 更新帳號狀態
            if validation_result.get('valid'):
                account.status = AccountStatus.ACTIVE
            else:
                account.status = AccountStatus.ERROR
            
            db.commit()
            
            return jsonify({
                'success': True,
                'validation': validation_result,
                'account_status': account.status
            })
            
    except PlatformPublisherError as e:
        return jsonify({
            'success': False,
            'error': f'Publisher error: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Validation failed: {str(e)}'
        }), 500

@instagram_bp.route('/posts', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_social_posts():
    """獲取社交媒體發文列表"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        status = request.args.get('status')
        account_id = request.args.get('account_id', type=int)
        
        with get_session() as db:
            query = db.query(SocialPost).join(SocialAccount).options(
                joinedload(SocialPost.account),
                joinedload(SocialPost.forum_post),
                joinedload(SocialPost.template),
                joinedload(SocialPost.carousel_group)
            ).filter(SocialAccount.platform == PlatformType.INSTAGRAM)
            
            # 權限過濾
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                query = query.filter(
                    (SocialAccount.school_id == user.school_id) | 
                    (SocialAccount.school_id.is_(None))
                )
            
            # 狀態過濾
            if status:
                query = query.filter(SocialPost.status == status)
            
            # 帳號過濾
            if account_id:
                query = query.filter(SocialPost.account_id == account_id)
            
            # 分頁
            offset = (page - 1) * per_page
            posts = query.order_by(desc(SocialPost.created_at)).offset(offset).limit(per_page).all()
            total = query.count()
            
            result = []
            for post in posts:
                result.append({
                    'id': post.id,
                    'status': post.status,
                    'generated_image_url': post.generated_image_url,
                    'generated_caption': post.generated_caption,
                    'custom_caption': post.custom_caption,
                    'hashtags': post.hashtags,
                    'platform_post_id': post.platform_post_id,
                    'platform_post_url': post.platform_post_url,
                    'error_message': post.error_message,
                    'retry_count': post.retry_count,
                    'created_at': post.created_at.isoformat(),
                    'published_at': post.published_at.isoformat() if post.published_at else None,
                    'scheduled_at': post.scheduled_at.isoformat() if post.scheduled_at else None,
                    'account': {
                        'id': post.account.id,
                        'platform_username': post.account.platform_username,
                        'display_name': post.account.display_name
                    },
                    'forum_post': {
                        'id': post.forum_post.id,
                        'title': getattr(post.forum_post, 'title', ''),
                        'content': post.forum_post.content[:100] + '...' if len(post.forum_post.content or '') > 100 else post.forum_post.content
                    },
                    'template': {
                        'id': post.template.id,
                        'name': post.template.name
                    } if post.template else None,
                    'carousel_group': {
                        'id': post.carousel_group.id,
                        'title': post.carousel_group.title,
                        'status': post.carousel_group.status
                    } if post.carousel_group else None
                })
            
            return jsonify({
                'success': True,
                'posts': result,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'pages': (total + per_page - 1) // per_page
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch posts: {str(e)}'
        }), 500

@instagram_bp.route('/carousel-groups', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def get_carousel_groups():
    """獲取輪播群組列表"""
    try:
        status = request.args.get('status')
        account_id = request.args.get('account_id', type=int)
        
        with get_session() as db:
            query = db.query(CarouselGroup).join(SocialAccount).options(
                joinedload(CarouselGroup.account),
                joinedload(CarouselGroup.posts)
            ).filter(SocialAccount.platform == PlatformType.INSTAGRAM)
            
            # 權限過濾
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                query = query.filter(
                    (SocialAccount.school_id == user.school_id) | 
                    (SocialAccount.school_id.is_(None))
                )
            
            if status:
                query = query.filter(CarouselGroup.status == status)
            
            if account_id:
                query = query.filter(CarouselGroup.account_id == account_id)
            
            groups = query.order_by(desc(CarouselGroup.created_at)).all()
            
            result = []
            for group in groups:
                result.append({
                    'id': group.id,
                    'group_id': group.group_id,
                    'title': group.title,
                    'description': group.description,
                    'status': group.status,
                    'target_count': group.target_count,
                    'collected_count': group.collected_count,
                    'platform_post_id': group.platform_post_id,
                    'platform_post_url': group.platform_post_url,
                    'created_at': group.created_at.isoformat(),
                    'scheduled_at': group.scheduled_at.isoformat() if group.scheduled_at else None,
                    'published_at': group.published_at.isoformat() if group.published_at else None,
                    'account': {
                        'id': group.account.id,
                        'platform_username': group.account.platform_username,
                        'display_name': group.account.display_name
                    },
                    'posts_count': len(group.posts)
                })
            
            return jsonify({
                'success': True,
                'groups': result
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch carousel groups: {str(e)}'
        }), 500

@instagram_bp.route('/templates', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def create_template():
    """創建新的內容模板"""
    try:
        data = request.get_json()
        account_id = data.get('account_id')
        name = data.get('name')
        description = data.get('description')
        template_type = data.get('template_type')
        config = data.get('config', {})
        is_default = data.get('is_default', False)
        
        # 驗證必要參數
        if not all([account_id, name, template_type]):
            return jsonify({
                'success': False,
                'error': '缺少必要參數: account_id, name, template_type'
            }), 400
        
        if template_type not in ['image', 'text', 'combined']:
            return jsonify({
                'success': False,
                'error': '無效的模板類型'
            }), 400
        
        with get_session() as db:
            # 檢查帳號是否存在且用戶有權限
            account = db.query(SocialAccount).filter(
                SocialAccount.id == account_id,
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()
            
            if not account:
                return jsonify({
                    'success': False,
                    'error': '找不到指定的 Instagram 帳號'
                }), 404
            
            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此帳號'
                    }), 403
            
            # 如果設為預設模板，先清除該帳號的其他預設模板
            if is_default:
                db.query(ContentTemplate).filter(
                    ContentTemplate.account_id == account_id,
                    ContentTemplate.is_default == True
                ).update({'is_default': False})
            
            # 創建新模板
            new_template = ContentTemplate(
                account_id=account_id,
                name=name,
                description=description,
                template_type=template_type,
                config=config,
                is_default=is_default,
                created_by=user_id
            )
            
            db.add(new_template)
            db.commit()
            db.refresh(new_template)
            
            return jsonify({
                'success': True,
                'template': {
                    'id': new_template.id,
                    'account_id': new_template.account_id,
                    'name': new_template.name,
                    'description': new_template.description,
                    'template_type': new_template.template_type,
                    'config': new_template.config,
                    'is_active': new_template.is_active,
                    'is_default': new_template.is_default,
                    'usage_count': new_template.usage_count,
                    'created_at': new_template.created_at.isoformat()
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to create template: {str(e)}'
        }), 500

@instagram_bp.route('/templates/<int:template_id>', methods=['PUT'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def update_template(template_id: int):
    """更新內容模板"""
    try:
        data = request.get_json()
        
        with get_session() as db:
            template = db.query(ContentTemplate).options(
                joinedload(ContentTemplate.account)
            ).filter(ContentTemplate.id == template_id).first()
            
            if not template:
                return jsonify({
                    'success': False,
                    'error': '找不到指定的模板'
                }), 404
            
            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                if template.account.school_id and template.account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此模板'
                    }), 403
            
            # 更新模板屬性
            if 'name' in data:
                template.name = data['name']
            if 'description' in data:
                template.description = data['description']
            if 'template_type' in data and data['template_type'] in ['image', 'text', 'combined']:
                template.template_type = data['template_type']
            if 'config' in data:
                template.config = data['config']
            if 'is_active' in data:
                template.is_active = data['is_active']
            
            # 處理預設模板設定
            if 'is_default' in data and data['is_default']:
                # 清除該帳號的其他預設模板
                db.query(ContentTemplate).filter(
                    ContentTemplate.account_id == template.account_id,
                    ContentTemplate.id != template_id,
                    ContentTemplate.is_default == True
                ).update({'is_default': False})
                template.is_default = True
            elif 'is_default' in data and not data['is_default']:
                template.is_default = False
            
            template.updated_at = datetime.now(timezone.utc)
            
            db.commit()
            
            return jsonify({
                'success': True,
                'template': {
                    'id': template.id,
                    'account_id': template.account_id,
                    'name': template.name,
                    'description': template.description,
                    'template_type': template.template_type,
                    'config': template.config,
                    'is_active': template.is_active,
                    'is_default': template.is_default,
                    'usage_count': template.usage_count,
                    'updated_at': template.updated_at.isoformat()
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to update template: {str(e)}'
        }), 500

@instagram_bp.route('/templates/<int:template_id>', methods=['DELETE'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def delete_template(template_id: int):
    """刪除內容模板"""
    try:
        with get_session() as db:
            template = db.query(ContentTemplate).options(
                joinedload(ContentTemplate.account)
            ).filter(ContentTemplate.id == template_id).first()
            
            if not template:
                return jsonify({
                    'success': False,
                    'error': '找不到指定的模板'
                }), 404
            
            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                if template.account.school_id and template.account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此模板'
                    }), 403
            
            # 檢查是否有相關的發文使用此模板
            posts_count = db.query(SocialPost).filter(
                SocialPost.template_id == template_id
            ).count()
            
            template_name = template.name
            
            # 刪除模板
            db.delete(template)
            db.commit()
            
            return jsonify({
                'success': True,
                'message': f'模板 "{template_name}" 已刪除',
                'affected_posts': posts_count
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to delete template: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/<int:account_id>/settings', methods=['PUT'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def update_account_settings(account_id: int):
    """更新 Instagram 帳號設定"""
    try:
        data = request.get_json()
        
        with get_session() as db:
            account = db.query(SocialAccount).filter(
                SocialAccount.id == account_id,
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()
            
            if not account:
                return jsonify({
                    'success': False,
                    'error': '找不到指定的 Instagram 帳號'
                }), 404
            
            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此帳號'
                    }), 403
            
            # 更新帳號設定
            if 'display_name' in data:
                account.display_name = data['display_name']
            
            if 'status' in data and data['status'] in ['active', 'disabled']:
                account.status = AccountStatus.ACTIVE if data['status'] == 'active' else AccountStatus.DISABLED
            
            # 學校綁定更新（只有 dev_admin 可以變更）
            if 'school_id' in data and user.role == 'dev_admin':
                new_school_id = data['school_id']
                if new_school_id is None or (isinstance(new_school_id, int) and new_school_id > 0):
                    # 驗證學校是否存在
                    if new_school_id is not None:
                        school_exists = db.query(School).filter(School.id == new_school_id).first()
                        if not school_exists:
                            return jsonify({
                                'success': False,
                                'error': f'找不到ID為{new_school_id}的學校'
                            }), 400
                    account.school_id = new_school_id
            
            if 'publish_trigger' in data and data['publish_trigger'] in ['immediate', 'scheduled', 'batch_count']:
                account.publish_trigger = data['publish_trigger']
            
            if 'batch_size' in data:
                batch_size = max(2, min(10, int(data['batch_size'])))  # 限制在 2-10 之間
                account.batch_size = batch_size
            
            if 'schedule_hour' in data:
                schedule_hour = max(0, min(23, int(data['schedule_hour'])))  # 限制在 0-23 之間
                account.schedule_hour = schedule_hour
            
            if 'auto_hashtags' in data:
                # 驗證和清理標籤
                hashtags = []
                for tag in data['auto_hashtags']:
                    if isinstance(tag, str) and tag.strip():
                        clean_tag = tag.strip()
                        if not clean_tag.startswith('#'):
                            clean_tag = '#' + clean_tag
                        if len(clean_tag) > 1:  # 確保不是只有 #
                            hashtags.append(clean_tag)
                
                account.auto_hashtags = hashtags[:10]  # 最多 10 個標籤
            
            account.updated_at = datetime.now(timezone.utc)
            
            db.commit()
            
            return jsonify({
                'success': True,
                'message': '帳號設定已更新',
                'account': {
                    'id': account.id,
                    'platform_username': account.platform_username,
                    'display_name': account.display_name,
                    'status': account.status,
                    'publish_trigger': account.publish_trigger,
                    'batch_size': account.batch_size,
                    'schedule_hour': account.schedule_hour,
                    'auto_hashtags': account.auto_hashtags,
                    'updated_at': account.updated_at.isoformat()
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to update account settings: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/simple', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def create_simple_account():
    """使用 User Token 和 Facebook ID 創建 Instagram 帳號"""
    try:
        data = request.get_json()
        print(f"[除錯] 收到資料: {data}")
        
        display_name = data.get('display_name')
        user_token = data.get('instagram_user_token')
        facebook_id = data.get('facebook_id')
        platform_username = data.get('platform_username', '')
        requested_school_id = data.get('school_id')  # 前端請求的學校ID
        
        print(f"[除錯] 解析欄位: 顯示名稱='{display_name}', 用戶權杖='{user_token[:20] if user_token else None}...', Facebook ID='{facebook_id}', 平台用戶名='{platform_username}', 請求學校ID='{requested_school_id}'")
        
        # 驗證必要參數
        if not all([display_name, user_token]):
            return jsonify({
                'success': False,
                'error': '缺少必要參數: display_name, instagram_user_token'
            }), 400
        
        with get_session() as db:
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if not user:
                return jsonify({
                    'success': False,
                    'error': '用戶不存在'
                }), 404
            
            # 決定學校綁定
            final_school_id = None
            if user.role == 'dev_admin':
                # dev_admin 可以自由選擇學校或不綁定
                final_school_id = requested_school_id
                if final_school_id is not None and isinstance(final_school_id, int):
                    # 驗證學校是否存在
                    school = db.query(School).filter(School.id == final_school_id).first()
                    if not school:
                        return jsonify({
                            'success': False,
                            'error': f'找不到ID為{final_school_id}的學校'
                        }), 400
            elif user.role == 'campus_admin':
                # campus_admin 只能綁定自己的學校
                final_school_id = user.school_id
                if not final_school_id:
                    return jsonify({
                        'success': False,
                        'error': 'campus_admin 用戶必須有綁定的學校才能新增帳號'
                    }), 400
            elif user.role == 'cross_admin':
                # cross_admin 不能新增帳號
                return jsonify({
                    'success': False,
                    'error': 'cross_admin 沒有權限新增帳號'
                }), 403
            else:
                return jsonify({
                    'success': False,
                    'error': '用戶角色無效'
                }), 403
            
            print(f"[除錯] 用戶角色: {user.role}, 用戶學校ID: {user.school_id}, 最終學校ID: {final_school_id}")
            
            # 新的流程：使用 User Token 直接驗證 Facebook ID
            try:
                import requests
                
                # 步驟 0: 檢查是否為短期 token，如果是則轉換為長期 token
                final_user_token = user_token
                if user_token.startswith('EAAJ') and len(user_token) < 200:
                    # 這看起來像短期 token，嘗試轉換為長期 token
                    try:
                        print(f"[Token轉換] 檢測到短期 token，開始轉換...")
                        
                        # 使用 Facebook Graph API 將短期 token 轉換為長期 token
                        extend_url = "https://graph.facebook.com/v18.0/oauth/access_token"
                        extend_params = {
                            'grant_type': 'fb_exchange_token',
                            'client_id': os.getenv('FACEBOOK_APP_ID'),
                            'client_secret': os.getenv('FACEBOOK_APP_SECRET'),
                            'fb_exchange_token': user_token
                        }
                        
                        extend_response = requests.get(extend_url, params=extend_params)
                        extend_response.raise_for_status()
                        extend_data = extend_response.json()
                        
                        if 'access_token' in extend_data:
                            final_user_token = extend_data['access_token']
                            print(f"[Token轉換] 短期 token 成功轉換為長期 token")
                        else:
                            print(f"[Token轉換] 轉換失敗，使用原始 token: {extend_data}")
                            
                    except Exception as e:
                        print(f"[Token轉換] 轉換過程出錯，使用原始 token: {e}")
                        # 如果轉換失敗，繼續使用原始 token
                        pass

                # 步驟 1: 使用 User Token 直接驗證 Facebook 用戶資訊
                print(f"[除錯] 步驟 1: 驗證 User Token 和取得 Facebook 用戶資訊")
                
                # 取得 Facebook 用戶資訊
                me_url = "https://graph.facebook.com/v18.0/me"
                me_params = {
                    'fields': 'id,name',
                    'access_token': final_user_token
                }
                
                me_response = requests.get(me_url, params=me_params, timeout=10)
                print(f"[除錯] Facebook /me API 回應狀態: {me_response.status_code}")
                print(f"[除錯] Facebook /me API 回應內容: {me_response.text}")
                
                if me_response.status_code != 200:
                    return jsonify({
                        'success': False,
                        'error': f'無法驗證 User Token: {me_response.text}'
                    }), 400
                
                me_data = me_response.json()
                actual_facebook_id = me_data.get('id')
                facebook_name = me_data.get('name', '')
                
                if not actual_facebook_id:
                    return jsonify({
                        'success': False,
                        'error': '無法取得 Facebook 用戶 ID'
                    }), 400
                
                # 如果提供了 Facebook ID，驗證是否相符
                if facebook_id and facebook_id != actual_facebook_id:
                    print(f"[警告] 提供的 Facebook ID ({facebook_id}) 與實際 ID ({actual_facebook_id}) 不符，使用實際 ID")
                
                facebook_id = actual_facebook_id
                print(f"[除錯] 驗證成功，Facebook ID: {facebook_id}, 名稱: {facebook_name}")
                
                # 步驟 2: 直接使用 User Token 驗證 Instagram 功能是否可用
                print(f"[除錯] 步驟 2: 驗證 Instagram API 可用性")
                
                # 嘗試使用 User Token 取得 Instagram 相關資訊（如果有的話）
                # 注意：這只是驗證，不用於獲取特定 Instagram 帳號
                try:
                    instagram_test_url = "https://graph.facebook.com/v18.0/me/accounts"
                    instagram_test_params = {
                        'access_token': final_user_token,
                        'fields': 'instagram_business_account'
                    }
                    
                    test_response = requests.get(instagram_test_url, params=instagram_test_params, timeout=10)
                    print(f"[除錯] Instagram 測試 API 回應狀態: {test_response.status_code}")
                    
                    if test_response.status_code == 200:
                        print(f"[除錯] Instagram API 存取測試成功")
                    else:
                        print(f"[警告] Instagram API 存取可能有問題，但繼續建立帳號")
                        
                except Exception as e:
                    print(f"[警告] Instagram API 測試失敗: {e}，但繼續建立帳號")
                
                # 用 Facebook 名稱作為預設的 Instagram 用戶名稱
                actual_username = platform_username or facebook_name or f'user_{facebook_id}'
                
                # 模擬的帳號資訊，因為我們不再依賴特定的 Instagram 帳號
                account_info = {
                    'id': facebook_id,  # 使用 Facebook ID 作為主要識別
                    'username': actual_username,
                    'name': facebook_name,
                    'account_type': 'USER'  # 將其視為一般用戶
                }
                
            except requests.exceptions.RequestException as e:
                return jsonify({
                    'success': False,
                    'error': f'網路請求失敗，無法驗證帳號: {str(e)}'
                }), 400
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'驗證帳號時發生錯誤: {str(e)}'
                }), 400
            
            # 檢查是否已經存在相同的帳號（使用 Facebook ID）
            existing_account = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM,
                SocialAccount.platform_user_id == str(facebook_id)
            ).first()
            
            if existing_account:
                return jsonify({
                    'success': False,
                    'error': f'Facebook ID {facebook_id} 已經被註冊過了'
                }), 400
            
            # 建立帳號記錄（使用 Facebook ID 作為主要識別）
            account = SocialAccount(
                platform=PlatformType.INSTAGRAM,
                platform_user_id=facebook_id,  # 使用 Facebook ID
                platform_username=actual_username,
                display_name=display_name,
                access_token=final_user_token,  # 使用標準的 access_token 欄位
                status=AccountStatus.ACTIVE,
                school_id=final_school_id,
                publish_trigger=PublishTrigger.BATCH_COUNT,
                batch_size=5,  # 預設批次大小
                created_by=user_id  # 必須設定 created_by
            )
            
            db.add(account)
            db.commit()
            
            print(f"[成功] Instagram 帳號創建成功，ID: {account.id}")
            
            return jsonify({
                'success': True,
                'message': '帳號新增成功！',
                'account': {
                    'id': account.id,
                    'display_name': account.display_name,
                    'platform_username': account.platform_username,
                    'platform_user_id': account.platform_user_id,
                    'created_at': account.created_at.isoformat()
                }
            })
            
    except Exception as e:
        print(f"[錯誤] 創建簡易 Instagram 帳號失敗: {e}")
        print(f"[錯誤] 例外類型: {type(e)}")
        import traceback
        print(f"[錯誤] 詳細追蹤: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'新增帳號失敗: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/<int:account_id>/token', methods=['PUT'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def update_account_token(account_id: int):
    """更新 Instagram 帳號的 Access Token"""
    try:
        data = request.get_json()
        new_user_token = data.get('instagram_user_token')
        new_facebook_id = data.get('facebook_id')
        
        if not new_user_token:
            return jsonify({
                'success': False,
                'error': '請提供新的 Instagram User Token'
            }), 400
        
        with get_session() as db:
            # 獲取現有帳號
            account = db.query(SocialAccount).filter(
                SocialAccount.id == account_id,
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()
            
            if not account:
                return jsonify({
                    'success': False,
                    'error': '找不到指定的 Instagram 帳號'
                }), 404
            
            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if user and user.role != 'dev_admin' and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此帳號'
                    }), 403
            
            # 驗證並處理新的 token
            try:
                import requests
                
                # 步驟0: 檢查是否為短期 token，如果是則轉換為長期 token
                final_user_token = new_user_token
                if new_user_token.startswith('EAAJ') and len(new_user_token) < 200:
                    # 這看起來像短期 token，嘗試轉換為長期 token
                    try:
                        print(f"[Token轉換] 檢測到短期 token，開始轉換...")
                        
                        # 使用 Facebook Graph API 將短期 token 轉換為長期 token
                        extend_url = "https://graph.facebook.com/v18.0/oauth/access_token"
                        extend_params = {
                            'grant_type': 'fb_exchange_token',
                            'client_id': os.getenv('FACEBOOK_APP_ID'),  # 需要設定環境變數
                            'client_secret': os.getenv('FACEBOOK_APP_SECRET'),  # 需要設定環境變數
                            'fb_exchange_token': new_user_token
                        }
                        
                        extend_response = requests.get(extend_url, params=extend_params)
                        extend_response.raise_for_status()
                        extend_data = extend_response.json()
                        
                        if 'access_token' in extend_data:
                            final_user_token = extend_data['access_token']
                            print(f"[Token轉換] 短期 token 成功轉換為長期 token")
                        else:
                            print(f"[Token轉換] 轉換失敗，使用原始 token: {extend_data}")
                            
                    except Exception as e:
                        print(f"[Token轉換] 轉換過程出錯，使用原始 token: {e}")
                        # 如果轉換失敗，繼續使用原始 token
                        pass
                
                # 步驟1: 使用 User Token 驗證 Facebook 用戶資訊
                me_url = "https://graph.facebook.com/v18.0/me"
                me_params = {
                    'fields': 'id,name',
                    'access_token': final_user_token
                }
                
                me_response = requests.get(me_url, params=me_params, timeout=10)
                if me_response.status_code != 200:
                    return jsonify({
                        'success': False,
                        'error': f'無法驗證新的 User Token: {me_response.text}'
                    }), 400
                
                me_data = me_response.json()
                actual_facebook_id = me_data.get('id')
                facebook_name = me_data.get('name', '')
                
                if not actual_facebook_id:
                    return jsonify({
                        'success': False,
                        'error': '無法取得 Facebook 用戶 ID'
                    }), 400
                
                # 如果提供了 Facebook ID，驗證是否相符
                if new_facebook_id and new_facebook_id != actual_facebook_id:
                    print(f"[警告] 提供的 Facebook ID ({new_facebook_id}) 與實際 ID ({actual_facebook_id}) 不符，使用實際 ID")
                
                # 檢查是否與現有帳號 Facebook ID 相符
                # 注意：由於 Facebook 帳號系統問題，同一個用戶可能會有不同的 ID
                # 因此我們放寬這個限制，允許更新不同 Facebook ID 的 token
                if account.platform_user_id != actual_facebook_id:
                    print(f"[警告] Token 更新：新 Facebook ID ({actual_facebook_id}) 與現有帳號 ({account.platform_user_id}) 不符")
                    print(f"[警告] 由於 Facebook 帳號系統問題，允許此更新並更新帳號的 platform_user_id")
                    
                    # 檢查新的 Facebook ID 是否已被其他帳號使用
                    existing_with_new_id = db.query(SocialAccount).filter(
                        SocialAccount.platform == PlatformType.INSTAGRAM,
                        SocialAccount.platform_user_id == actual_facebook_id,
                        SocialAccount.id != account_id
                    ).first()
                    
                    if existing_with_new_id:
                        return jsonify({
                            'success': False,
                            'error': f'Facebook ID {actual_facebook_id} 已被其他帳號 ({existing_with_new_id.display_name}) 使用'
                        }), 400
                    
                    # 更新為新的 Facebook ID
                    account.platform_user_id = actual_facebook_id
                
                # 更新帳號資訊
                account.access_token = final_user_token  # 使用標準的 access_token 欄位
                account.status = AccountStatus.ACTIVE  # 重置為活躍狀態
                account.updated_at = datetime.now(timezone.utc)
                
                # 更新用戶名稱（如果沒有的話）
                if not account.platform_username:
                    account.platform_username = facebook_name or f'user_{actual_facebook_id}'
                
                db.commit()
                
                return jsonify({
                    'success': True,
                    'message': f'帳號 {account.display_name} 的 Token 更新成功！',
                    'account': {
                        'id': account.id,
                        'platform_username': account.platform_username,
                        'display_name': account.display_name,
                        'status': account.status,
                        'updated_at': account.updated_at.isoformat()
                    }
                })
                
            except requests.exceptions.RequestException as e:
                return jsonify({
                    'success': False,
                    'error': f'Token 驗證失敗: {str(e)}'
                }), 400
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Token 處理失敗: {str(e)}'
                }), 500
                
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'更新 Token 失敗: {str(e)}'
        }), 500

@instagram_bp.route('/manual/carousel', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def manual_publish_carousel():
    """手動合併多篇論壇貼文，直接發佈為 IG 輪播。
    Body: { account_id: int, forum_post_ids: [int...] }
    """
    try:
        data = request.get_json(silent=True) or {}
        account_id = int(data.get('account_id') or 0)
        forum_post_ids = data.get('forum_post_ids') or []
        if not account_id or not isinstance(forum_post_ids, list) or len(forum_post_ids) < 2:
            return jsonify({'success': False, 'error': '請提供 account_id 與至少兩個 forum_post_ids'}), 400

        with get_session() as db:
            # 檢查帳號
            account = db.query(SocialAccount).filter(
                SocialAccount.id == account_id,
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()
            if not account:
                return jsonify({'success': False, 'error': '找不到指定的 Instagram 帳號'}), 404

            # 權限檢查
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.role != 'dev_admin' and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({'success': False, 'error': '無權限操作此帳號'}), 403

            # 找到或建立 SocialPost
            posts: list[SocialPost] = []
            for fid in forum_post_ids:
                sp = db.query(SocialPost).filter(
                    SocialPost.account_id == account_id,
                    SocialPost.forum_post_id == int(fid)
                ).first()
                if not sp:
                    # 找模板：default -> combined/image -> any active
                    tpl = None
                    if account.default_template_id:
                        tpl = db.query(ContentTemplate).filter(
                            ContentTemplate.id == account.default_template_id,
                            ContentTemplate.is_active == True
                        ).first()
                    if not tpl:
                        tpl = (
                            db.query(ContentTemplate)
                              .filter(ContentTemplate.account_id == account.id,
                                      ContentTemplate.is_active == True,
                                      ContentTemplate.template_type.in_(['combined', 'image']))
                              .order_by(desc(ContentTemplate.is_default), desc(ContentTemplate.created_at))
                              .first()
                        )
                    if not tpl:
                        tpl = (
                            db.query(ContentTemplate)
                              .filter(ContentTemplate.account_id == account.id,
                                      ContentTemplate.is_active == True)
                              .order_by(desc(ContentTemplate.is_default), desc(ContentTemplate.created_at))
                              .first()
                        )
                    if not tpl:
                        return jsonify({'success': False, 'error': f'帳號 {account_id} 缺少可用模板'}), 400

                    sp = SocialPost(
                        account_id=account.id,
                        forum_post_id=int(fid),
                        template_id=tpl.id,
                        status=PostStatus.QUEUED
                    )
                    db.add(sp); db.flush(); db.refresh(sp)
                posts.append(sp)

            # 生成缺圖項目
            gen = ContentGenerator()
            carousel_items = []
            failed_items = []
            for sp in posts:
                if not sp.generated_image_url:
                    try:
                        content = gen.generate_content(sp.forum_post, sp.template)
                        sp.generated_image_url = content.get('image_url')
                        sp.generated_caption = content.get('caption')
                        sp.hashtags = content.get('hashtags', [])
                        db.commit()
                    except Exception as ge:
                        sp.status = PostStatus.FAILED
                        sp.error_message = f'手動輪播補圖失敗: {str(ge)}'
                        failed_items.append(sp.forum_post_id)
                        db.commit()
                        continue
                if sp.generated_image_url:
                    carousel_items.append({'image_url': sp.generated_image_url, 'caption': sp.generated_caption or ''})

            if len(carousel_items) < 2:
                return jsonify({'success': False, 'error': '可用圖片不足以組成輪播（至少 2 張）', 'failed_forum_posts': failed_items}), 400

            # 合併文案與標籤
            combined_caption = _combine_carousel_captions(posts)
            combined_hashtags = _combine_carousel_hashtags(posts)

            # 發布輪播
            publisher = get_platform_publisher(account.platform)
            pub_res = publisher.publish_carousel(
                account=account,
                items=carousel_items,
                caption=combined_caption,
                hashtags=combined_hashtags
            )
            if not pub_res.get('success'):
                return jsonify({'success': False, 'error': pub_res.get('error', '未知錯誤')}), 400

            # 更新貼文狀態
            now_ts = datetime.now(timezone.utc)
            for sp in posts:
                sp.status = PostStatus.PUBLISHED
                sp.platform_post_id = pub_res.get('post_id')
                sp.platform_post_url = pub_res.get('post_url')
                sp.published_at = now_ts
            account.total_posts += 1
            account.last_post_at = now_ts
            db.commit()

            return jsonify({'success': True, 'post_url': pub_res.get('post_url'), 'post_id': pub_res.get('post_id'), 'item_count': pub_res.get('item_count')})

    except Exception as e:
        return jsonify({'success': False, 'error': f'manual carousel failed: {str(e)}'}), 500
