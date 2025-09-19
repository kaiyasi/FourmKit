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
from services.monitoring import get_queue_health, get_recent_events

instagram_bp = Blueprint('instagram', __name__, url_prefix='/api/admin/social')

# ---- Template hygiene: enforce minimal, Morandi-like style for IG templates ----
import re
def _strip_emoji(s: str) -> str:
    try:
        # Remove most emoji and pictographs
        return re.sub(r"[\U0001F300-\U0001FAD6\U0001FAE0-\U0001FAFF\U00002700-\U000027BF\U0001F1E6-\U0001F1FF]", "", s)
    except Exception:
        return s

def _sanitize_color(v: str, fallback: str = "#333333") -> str:
    try:
        sv = (v or '').strip()
        if sv.startswith('#') and (3 <= len(sv) <= 7):
            return sv
        # Reject gradients/urls or named colors
        return fallback
    except Exception:
        return fallback

def _sanitize_template_config(cfg: dict) -> dict:
    """Coerce template config to minimalist, no-gradient, no-emoji rules.
    - Backgrounds must be solid color
    - Disable heavy decorations (shadow/background overlays/logo/watermark)
    - Caption text stripped of emoji/icons
    """
    try:
        c = dict(cfg or {})

        # textToImage
        tti = c.get('textToImage') or {}
        bg = (tti.get('background') or {})
        bg['type'] = 'color'
        bg['value'] = _sanitize_color(bg.get('value') or '#ffffff', '#ffffff')
        tti['background'] = bg
        txt = (tti.get('text') or {})
        txt['color'] = _sanitize_color(txt.get('color') or '#333333', '#333333')
        # watermark/logo/shadow/background overlays off
        if isinstance(txt.get('watermark'), dict):
            txt['watermark']['enabled'] = False
        tti['logo'] = {'enabled': False}
        tti['border'] = (tti.get('border') or {})
        # keep border but ensure subtle color
        tti['border']['color'] = _sanitize_color((tti['border'].get('color') if isinstance(tti['border'], dict) else '#e5e7eb') or '#e5e7eb', '#e5e7eb')
        tti['text'] = txt
        c['textToImage'] = tti

        # photos.combined
        photos = c.get('photos') or {}
        comb = (photos.get('combined') or {})
        canvas = (comb.get('canvas') or {})
        cbg = (canvas.get('background') or {})
        cbg['type'] = 'color'
        cbg['value'] = _sanitize_color(cbg.get('value') or '#ffffff', '#ffffff')
        canvas['background'] = cbg
        comb['canvas'] = canvas
        ctext = (comb.get('text') or {})
        ctext['color'] = _sanitize_color(ctext.get('color') or '#333333', '#333333')
        if isinstance(ctext.get('background'), dict):
            ctext['background']['enabled'] = False
        if isinstance(ctext.get('shadow'), dict):
            ctext['shadow']['enabled'] = False
        comb['text'] = ctext
        # disable logos by default to reduce clutter
        comb['logo'] = {'enabled': False}
        photos['combined'] = comb
        c['photos'] = photos

        # caption: strip emoji/icons; limit autoHashtags; remove emojis from hashtags
        cap = c.get('caption') or {}
        cap['header'] = _strip_emoji(str(cap.get('header') or ''))
        cap['content'] = _strip_emoji(str(cap.get('content') or ''))
        cap['footer'] = _strip_emoji(str(cap.get('footer') or ''))
        tags = cap.get('autoHashtags') or []
        clean_tags = []
        for t in tags[:5]:  # keep at most 5 to avoid noise
            tt = _strip_emoji(str(t or '')).strip()
            if tt:
                clean_tags.append(tt)
        cap['autoHashtags'] = clean_tags
        c['caption'] = cap

        return c
    except Exception:
        return cfg

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
                # 確保 Page ID 顯示邏輯正確
                page_id_display = account.page_id or account.platform_user_id
                has_page_binding = bool(page_id_display)

                # 根據狀態和綁定情況顯示合適的狀態信息
                status_info = {
                    'status': account.status,
                    'has_page_binding': has_page_binding,
                    'page_id': page_id_display,
                    'has_token': bool(account.access_token)
                }

                # 新的狀態邏輯：優先顯示真實狀態，避免誤判
                if account.status == AccountStatus.DISABLED:
                    # 帳號被明確停用，直接顯示停用狀態
                    status_info['display_status'] = 'disabled'
                    status_info['status_message'] = '帳號已停用'
                elif account.status == AccountStatus.ACTIVE:
                    if has_page_binding and status_info['has_token']:
                        # 完全正常的狀態
                        status_info['display_status'] = 'active'
                        status_info['status_message'] = '正常運作'
                    elif not has_page_binding:
                        # 啟用但缺少 Page ID
                        status_info['display_status'] = 'pending_page_binding'
                        status_info['status_message'] = '帳號已啟用，但需要綁定 Page ID'
                    elif not status_info['has_token']:
                        # 啟用但缺少 Token
                        status_info['display_status'] = 'pending_token'
                        status_info['status_message'] = '帳號已啟用，但需要更新 Token'
                    else:
                        status_info['display_status'] = 'active'
                        status_info['status_message'] = '正常運作'
                elif account.status == AccountStatus.ERROR:
                    status_info['display_status'] = 'error'
                    status_info['status_message'] = '發生錯誤，需要檢查設定'
                else:
                    # PENDING 或其他狀態
                    status_info['display_status'] = 'pending'
                    if not status_info['has_token'] and not has_page_binding:
                        status_info['status_message'] = '等待設定 Token 和 Page ID'
                    elif not status_info['has_token']:
                        status_info['status_message'] = '等待更新 Token'
                    elif not has_page_binding:
                        status_info['status_message'] = '等待綁定 Page ID'
                    else:
                        status_info['status_message'] = '等待驗證'

                result.append({
                    'id': account.id,
                    'platform': account.platform,
                    'platform_username': account.platform_username,
                    'display_name': account.display_name,
                    'status': account.status,
                    'status_info': status_info,  # 新增：詳細狀態信息
                    'publish_trigger': account.publish_trigger,
                    'batch_size': account.batch_size,
                    'schedule_hour': account.schedule_hour,
                    'auto_hashtags': account.auto_hashtags,
                    'total_posts': account.total_posts,
                    'last_post_at': account.last_post_at.isoformat() if account.last_post_at else None,
                    'created_at': account.created_at.isoformat(),
                    'school_id': account.school_id,  # 新增：直接返回 school_id
                    # Token 相關欄位
                    'app_id': account.app_id,
                    'app_secret': account.app_secret,
                    'access_token': account.access_token,
                    'token_expires_at': account.token_expires_at.isoformat() if account.token_expires_at else None,
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
            
            # 視為處理中：processing + collecting（收集中）
            carousel_processing = carousel_query.filter(
                CarouselGroup.status.in_(['processing', 'collecting'])
            ).count()
            
            carousel_failed = carousel_query.filter(
                CarouselGroup.status == 'failed'
            ).count()
            
            # 視為完成：completed + published（發佈完成）
            carousel_completed = carousel_query.filter(
                CarouselGroup.status.in_(['completed', 'published'])
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
            
            # 生成最近 7 天的每日統計
            daily_trends = []
            for i in range(7):
                date = (datetime.now(timezone.utc) - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
                next_date = date + timedelta(days=1)

                daily_published = base_query.filter(
                    SocialPost.status == PostStatus.PUBLISHED,
                    SocialPost.published_at >= date,
                    SocialPost.published_at < next_date
                ).count()

                daily_trends.append({
                    'date': date.date().isoformat(),
                    'published': daily_published
                })

            # 反轉以獲得正確的時間順序（最早到最晚）
            daily_trends.reverse()

            # 生成帳號統計
            account_stats_query = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM
            )

            # 應用相同的權限過濾
            if user and user.role != 'dev_admin' and user.school_id:
                account_stats_query = account_stats_query.filter(
                    (SocialAccount.school_id == user.school_id) |
                    (SocialAccount.school_id.is_(None))
                )

            accounts_for_stats = account_stats_query.all()
            account_stats = []

            for account in accounts_for_stats:
                account_stats.append({
                    'account_id': account.id,
                    'platform_username': account.platform_username,
                    'display_name': account.display_name,
                    'total_posts': account.total_posts,
                    'status': account.status
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
                    'daily_trends': daily_trends,
                    'account_stats': account_stats,
                    'carousel_status': {
                        'processing': carousel_processing,
                        'failed': carousel_failed,
                        'completed': carousel_completed
                    },
                    'carousel_groups': carousel_groups,
                    'recent_failures': failed_posts_details,
                    'queue': get_queue_health(),
                    'recent_events': get_recent_events(20)
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
        
        final_user_token = user_token
        
        # 獲取使用者的所有 Pages
        pages_url = "https://graph.facebook.com/v23.0/me/accounts"
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
                    ig_url = f"https://graph.facebook.com/v23.0/{ig_account_id}"
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
                joinedload(Post.school),
                joinedload(Post.media)
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
            base_url = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
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
                    'tags': [],  # Post 模型目前沒有 tags，使用空列表
                    'media_urls': []
                }
                
                # 從內容生成標題（取前50字符）
                if post.content:
                    title_text = post.content.strip()[:50]
                    if len(post.content) > 50:
                        title_text += '...'
                    post_data['title'] = title_text
                
                # 生成 media urls（如有）
                try:
                    media_urls = []
                    for m in (post.media or []):
                        rel = f"/uploads/{m.path}"
                        media_urls.append(f"{base_url}{rel}" if base_url else rel)
                    post_data['media_urls'] = media_urls
                except Exception:
                    post_data['media_urls'] = []

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
        config = data.get('config', {})  # 處理前端傳來的 config
        use_real_data = data.get('use_real_data', False)  # 新增選項：使用真實數據
        post_id = data.get('post_id')  # 指定特定貼文ID

        # 如果有 config，將其合併到 custom_options 中
        if config and not custom_options:
            custom_options = config
        elif config and custom_options:
            custom_options.update(config)
        
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
    """驗證帳號狀態 - 分離 Token 和 Page ID 檢查"""
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

            # 分離檢查：Token 可用性檢查
            token_valid = False
            token_error = None
            active_token = None

            # 優先使用長期Token，如果沒有則使用原始Token
            if account.long_lived_access_token:
                active_token = account.long_lived_access_token
                token_source = "長期Token"
            elif account.access_token:
                active_token = account.access_token
                token_source = "原始Token"

            if active_token:
                try:
                    # 僅檢查 Token 可用性，不檢查發文權限
                    import requests
                    me_response = requests.get(
                        "https://graph.facebook.com/v23.0/me",
                        params={'access_token': active_token},
                        timeout=10
                    )
                    if me_response.status_code == 200:
                        token_valid = True
                    else:
                        token_error = f"{token_source}無效: {me_response.status_code}"
                except Exception as e:
                    token_error = f"{token_source}檢查失敗: {str(e)}"
            else:
                token_error = "缺少 Access Token"

            # Page ID 存在性檢查
            has_page_id = bool(account.page_id or account.platform_user_id)
            page_id_display = account.page_id or account.platform_user_id

            # 更新帳號狀態邏輯
            if token_valid and has_page_id:
                account.status = AccountStatus.ACTIVE
                status_message = "Token 有效且已設定 Page ID，帳號可正常發文"
            elif token_valid and not has_page_id:
                account.status = AccountStatus.PENDING
                status_message = "Token 有效但未設定 Page ID，需要綁定 Facebook Page"
            elif not token_valid and has_page_id:
                account.status = AccountStatus.PENDING
                status_message = "已設定 Page ID 但 Token 無效或已過期，請更新 Token"
            else:
                account.status = AccountStatus.PENDING
                status_message = "缺少 Token 或 Page ID，請完整設定帳號資訊"

            db.commit()

            return jsonify({
                'success': token_valid and has_page_id,
                'validation': {
                    'token_valid': token_valid,
                    'token_error': token_error,
                    'has_page_id': has_page_id,
                    'page_id': page_id_display
                },
                'account_status': account.status,
                'status_message': status_message,
                'debug_info': {
                    'has_token': bool(account.access_token),
                    'has_page_id': has_page_id,
                    'token_valid': token_valid,
                    'page_id': page_id_display,
                    'separate_validation': True  # 標示使用新的分離驗證邏輯
                }
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Validation failed: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/<int:account_id>/check-token', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def check_token_only(account_id: int):
    """僅檢查 Token 可用性，不影響 Page ID 設定"""
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

            # 僅檢查 Token 可用性
            token_valid = False
            token_error = None
            token_info = {}

            if account.access_token:
                try:
                    import requests
                    me_response = requests.get(
                        "https://graph.facebook.com/v23.0/me",
                        params={
                            'access_token': account.access_token,
                            'fields': 'id,name'
                        },
                        timeout=10
                    )
                    if me_response.status_code == 200:
                        token_valid = True
                        token_info = me_response.json()
                    else:
                        token_error = f"Token 無效 (HTTP {me_response.status_code}): {me_response.text}"
                except Exception as e:
                    token_error = f"Token 檢查失敗: {str(e)}"
            else:
                token_error = "帳號未設定 Access Token"

            return jsonify({
                'success': token_valid,
                'token_valid': token_valid,
                'token_error': token_error,
                'token_info': token_info,
                'message': 'Token 有效' if token_valid else token_error
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Token check failed: {str(e)}'
        }), 500

@instagram_bp.route('/debug/account-status', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def debug_account_status():
    """調試端點：顯示所有帳號的詳細狀態信息"""
    try:
        with get_session() as db:
            accounts = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).all()

            debug_info = []
            for account in accounts:
                page_id_display = account.page_id or account.platform_user_id
                has_page_binding = bool(page_id_display)

                # 複製與 get_social_accounts 相同的邏輯
                status_info = {
                    'status': account.status,
                    'has_page_binding': has_page_binding,
                    'page_id': page_id_display,
                    'has_token': bool(account.access_token)
                }

                # 如果狀態是 ACTIVE 但沒有 Page ID，應該顯示為待綁定
                if account.status == AccountStatus.ACTIVE and not has_page_binding:
                    status_info['display_status'] = 'pending_page_binding'
                    status_info['status_message'] = '未綁定 Page ID'
                elif account.status == AccountStatus.PENDING and not status_info['has_token']:
                    status_info['display_status'] = 'pending_token'
                    status_info['status_message'] = '待更新 Token'
                elif account.status == AccountStatus.PENDING and not has_page_binding:
                    status_info['display_status'] = 'pending_page_binding'
                    status_info['status_message'] = '待綁定 Page ID'
                else:
                    status_info['display_status'] = account.status
                    status_info['status_message'] = {
                        AccountStatus.ACTIVE: '正常運作',
                        AccountStatus.DISABLED: '已停用',
                        AccountStatus.ERROR: '發生錯誤',
                        AccountStatus.PENDING: '等待驗證'
                    }.get(account.status, '未知狀態')

                debug_info.append({
                    'id': account.id,
                    'display_name': account.display_name,
                    'raw_status': account.status,  # 數據庫中的原始狀態
                    'computed_display_status': status_info['display_status'],  # 計算後的顯示狀態
                    'status_message': status_info['status_message'],
                    'has_token': bool(account.access_token),
                    'has_page_id': has_page_binding,
                    'page_id': page_id_display,
                    'platform_user_id': account.platform_user_id,
                    'page_id_field': account.page_id,
                    'status_enum_values': {
                        'ACTIVE': AccountStatus.ACTIVE,
                        'DISABLED': AccountStatus.DISABLED,
                        'ERROR': AccountStatus.ERROR,
                        'PENDING': AccountStatus.PENDING
                    }
                })

            return jsonify({
                'success': True,
                'debug_info': debug_info,
                'total_accounts': len(debug_info)
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Debug failed: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/<int:account_id>/force-status', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def force_update_account_status(account_id: int):
    """強制更新帳號狀態（調試用）"""
    try:
        data = request.get_json()
        new_status = data.get('status')

        if new_status not in ['active', 'disabled', 'error', 'pending']:
            return jsonify({
                'success': False,
                'error': '無效的狀態值，請使用: active, disabled, error, pending'
            }), 400

        with get_session() as db:
            account = db.query(SocialAccount).filter(
                SocialAccount.id == account_id,
                SocialAccount.platform == PlatformType.INSTAGRAM
            ).first()

            if not account:
                return jsonify({
                    'success': False,
                    'error': '找不到指定的帳號'
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

            old_status = account.status
            account.status = getattr(AccountStatus, new_status.upper())
            account.updated_at = datetime.now(timezone.utc)

            db.commit()

            return jsonify({
                'success': True,
                'message': f'帳號狀態已從 {old_status} 更新為 {account.status}',
                'account_id': account.id,
                'old_status': old_status,
                'new_status': account.status
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Status update failed: {str(e)}'
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
        print(f"[創建模板] 接收到的數據: {data}")

        account_id = data.get('account_id')
        name = data.get('name')
        description = data.get('description')
        template_type = data.get('template_type')
        config = data.get('config', {})
        is_default = data.get('is_default', False)

        print(f"[創建模板] 提取的參數: account_id={account_id}, name={name}, template_type={template_type}")
        
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
            
            # 衛生化模板配置，避免過度漸層/彩色/emoji
            safe_config = _sanitize_template_config(config)

            # 創建新模板
            new_template = ContentTemplate(
                account_id=account_id,
                name=name,
                description=description,
                template_type=template_type,
                config=safe_config,
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
                template.config = _sanitize_template_config(data['config'] or {})
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
                
                # v23 API 不需要 Token 轉換，直接使用提供的 token
                final_user_token = user_token
                print(f"[Token] 使用提供的 User Token（v23 不需要轉換）")

                # 步驟 1: 使用 User Token 直接驗證 Facebook 用戶資訊
                print(f"[除錯] 步驟 1: 驗證 User Token 和取得 Facebook 用戶資訊")
                
                # 取得 Facebook 用戶資訊
                me_url = "https://graph.facebook.com/v23.0/me"
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
                    instagram_test_url = "https://graph.facebook.com/v23.0/me/accounts"
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
            
            # 建立帳號記錄（使用 Page ID 作為主要識別：page_id）
            account = SocialAccount(
                platform=PlatformType.INSTAGRAM,
                platform_user_id=facebook_id,  # 兼容舊欄位（臨時寫入）
                page_id=facebook_id,           # 正確存 Page ID
                platform_username=actual_username,
                display_name=display_name,
                access_token=user_token,  # 儲存原始Token
                long_lived_access_token=final_user_token if final_user_token != user_token else None,  # 儲存長期Token（如果有轉換）
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
    """更新 Instagram 帳號的 Access Token / Page ID

    調整後邏輯：
    - 允許僅更新 Page ID（不強制提供 User Token）。
    - 若提供 User Token，嘗試轉換/驗證；若驗證失敗但有提供 Page ID，仍然更新 Page ID 與 Token（作為備用）。
    - 優先以前端提供的 facebook_id（Page ID）；若未提供且驗證成功，才自動挑可用 Page。
    """
    try:
        data = request.get_json()
        new_user_token = (data.get('instagram_user_token') or '').strip()
        new_facebook_id = (data.get('facebook_id') or '').strip()
        
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
            
            # 如果沒有提供 token，但有提供 Page ID，允許僅更新 Page ID
            if not new_user_token and new_facebook_id:
                try:
                    account.page_id = str(new_facebook_id)
                    try:
                        account.platform_user_id = str(new_facebook_id)
                    except Exception:
                        pass
                    # 無變更 token，維持原本 access_token；若原先沒有 token，狀態標為 pending
                    if not (account.access_token or '').strip():
                        account.status = AccountStatus.PENDING
                    account.updated_at = datetime.now(timezone.utc)
                    db.commit()
                    return jsonify({
                        'success': True,
                        'message': 'Page ID 已更新（未變更 Token）',
                        'account': {
                            'id': account.id,
                            'platform_username': account.platform_username,
                            'display_name': account.display_name,
                            'status': account.status,
                            'updated_at': account.updated_at.isoformat()
                        }
                    })
                except Exception as e:
                    db.rollback()
                    return jsonify({'success': False, 'error': f'更新 Page ID 失敗: {str(e)}'}), 500

            # 其餘情況：有提供 token（可能也有 page id）→ 直接記錄，不做轉換
            try:
                import requests

                # v23 API 不需要短期長期 token 轉換，直接使用提供的 token
                final_user_token = new_user_token

                # 簡化驗證：只檢查 token 是否可用（訪問 /me）
                token_valid = False
                try:
                    me_resp = requests.get(
                        'https://graph.facebook.com/v23.0/me',
                        params={'access_token': final_user_token, 'fields': 'id,name'},
                        timeout=15
                    )
                    if me_resp.status_code == 200:
                        token_valid = True
                        user_info = me_resp.json()
                        print(f"[Token驗證] Token 有效，用戶: {user_info.get('name', 'Unknown')}")
                    else:
                        print(f"[Token驗證] Token 無效: {me_resp.status_code}")
                except Exception as e:
                    print(f"[Token驗證] 發生錯誤: {e}")

                # 更新帳號資料
                account.access_token = final_user_token
                if new_facebook_id:
                    account.page_id = str(new_facebook_id)
                    account.platform_user_id = str(new_facebook_id)

                # 根據 token 驗證結果設定狀態
                if token_valid:
                    account.status = AccountStatus.ACTIVE
                    success_message = "Token 已更新並驗證有效"
                else:
                    account.status = AccountStatus.PENDING
                    success_message = "Token 已更新，但驗證失敗（可能權限不足）"

                if new_facebook_id:
                    success_message += f"，Page ID: {new_facebook_id}"

                account.updated_at = datetime.now(timezone.utc)
                db.commit()

                return jsonify({
                    'success': True,
                    'message': success_message,
                    'account': {
                        'id': account.id,
                        'platform_username': account.platform_username,
                        'display_name': account.display_name,
                        'status': account.status,
                        'updated_at': account.updated_at.isoformat()
                    }
                })
                
            except requests.exceptions.RequestException as e:
                # 網路/Graph 錯誤：若仍有提供 Page ID，仍允許寫入資料庫避免完全卡住
                if new_facebook_id or new_user_token:
                    try:
                        if new_facebook_id:
                            account.page_id = str(new_facebook_id)
                            try:
                                account.platform_user_id = str(new_facebook_id)
                            except Exception:
                                pass
                        if new_user_token:
                            account.access_token = new_user_token
                        account.status = AccountStatus.PENDING
                        account.updated_at = datetime.now(timezone.utc)
                        db.commit()
                        return jsonify({'success': True, 'message': '已更新（Graph 驗證失敗，狀態暫置 pending）'})
                    except Exception as ie:
                        db.rollback()
                        return jsonify({'success': False, 'error': f'部分更新失敗: {str(ie)}'}), 500
                return jsonify({'success': False, 'error': f'Token 驗證失敗: {str(e)}'}), 400
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

@instagram_bp.route('/posts/permalink/fix', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def fix_post_permalink():
    """
    修正已發布 Instagram 貼文的 permalink。

    支援兩種模式：
    1) 直接提供 new_permalink 更新
       body: { social_post_id? | platform_post_id?, new_permalink }

    2) 透過 Graph API 自動查詢
       body: { social_post_id? | platform_post_id?, account_id?, user_token? }
       - account_id 省略時會從 social_post 解析
       - user_token 省略時使用該帳號的 access_token
       - 需該帳號的 platform_user_id 為 Page ID（Page-based 發布流程）
    """
    try:
        data = request.get_json(silent=True) or {}
        social_post_id = data.get('social_post_id')
        platform_post_id = data.get('platform_post_id')  # Instagram 發布後的數字 id
        account_id = data.get('account_id')
        new_permalink = (data.get('new_permalink') or '').strip()
        user_token_override = data.get('user_token')

        if not social_post_id and not platform_post_id:
            return jsonify({'success': False, 'error': '請提供 social_post_id 或 platform_post_id'}), 400

        with get_session() as db:
            # 解析目標 SocialPost
            social_post = None
            if social_post_id:
                social_post = db.query(SocialPost).filter(SocialPost.id == int(social_post_id)).first()
            elif platform_post_id:
                social_post = db.query(SocialPost).filter(SocialPost.platform_post_id == str(platform_post_id)).order_by(desc(SocialPost.id)).first()

            if not social_post and not platform_post_id:
                return jsonify({'success': False, 'error': '找不到指定的 SocialPost'}), 404

            # 直接更新模式
            if new_permalink:
                if not (new_permalink.startswith('http://') or new_permalink.startswith('https://')):
                    return jsonify({'success': False, 'error': 'new_permalink 必須為 http(s) 連結'}), 400
                if social_post is None:
                    # 若僅提供 platform_post_id 且無 SocialPost，也允許跳過 DB 更新
                    return jsonify({'success': True, 'message': '已驗證連結格式，可用於手動修正', 'permalink': new_permalink})
                social_post.platform_post_url = new_permalink
                db.commit()
                return jsonify({'success': True, 'message': 'permalink 已更新', 'social_post_id': social_post.id, 'permalink': new_permalink})

            # 透過 Graph API 取回 permalink
            # 解析帳號
            acct = None
            if account_id:
                acct = db.query(SocialAccount).filter(SocialAccount.id == int(account_id), SocialAccount.platform == PlatformType.INSTAGRAM).first()
            elif social_post:
                acct = db.query(SocialAccount).filter(SocialAccount.id == social_post.account_id, SocialAccount.platform == PlatformType.INSTAGRAM).first()

            if not acct:
                return jsonify({'success': False, 'error': '找不到指定的 Instagram 帳號'}), 404

            # 解析 platform_post_id
            ig_numeric_id = str(platform_post_id or (social_post.platform_post_id if social_post else ''))
            if not ig_numeric_id:
                return jsonify({'success': False, 'error': '缺少 platform_post_id 以查詢 Graph API'}), 400

            # 取得 Page Token（Page-based）
            page_id = str(acct.platform_user_id or '')
            user_token = (user_token_override or acct.access_token or '').strip()
            if not page_id or not user_token:
                return jsonify({'success': False, 'error': '帳號缺少 page_id 或 user_token 以查詢 Graph API'}), 400

            api_base = 'https://graph.facebook.com/v23.0'
            timeout = 30
            try:
                # 1) 轉 Page Token
                resp = requests.get(f"{api_base}/{page_id}", params={'fields': 'access_token', 'access_token': user_token}, timeout=timeout)
                if resp.status_code != 200:
                    return jsonify({'success': False, 'error': f'取得 Page Token 失敗: {resp.text}'}), 400
                page_token = resp.json().get('access_token')
                if not page_token:
                    return jsonify({'success': False, 'error': 'Page Token 為空'}), 400

                # 2) 查 permalink
                resp2 = requests.get(f"{api_base}/{ig_numeric_id}", params={'fields': 'permalink,shortcode', 'access_token': page_token}, timeout=timeout)
                if resp2.status_code != 200:
                    return jsonify({'success': False, 'error': f'查詢 permalink 失敗: {resp2.text}'}), 400
                body = resp2.json()
                permalink = body.get('permalink')
                shortcode = body.get('shortcode')
                if not permalink and shortcode:
                    permalink = f"https://www.instagram.com/p/{shortcode}/"
                if not permalink:
                    return jsonify({'success': False, 'error': 'Graph 回傳無 permalink/shortcode'}), 400

                # 更新 DB（若有 social_post）
                if social_post:
                    social_post.platform_post_url = permalink
                    db.commit()
                    return jsonify({'success': True, 'message': 'permalink 已修正', 'social_post_id': social_post.id, 'permalink': permalink})
                else:
                    return jsonify({'success': True, 'permalink': permalink})

            except requests.RequestException as e:
                return jsonify({'success': False, 'error': f'Graph 請求失敗: {str(e)}'}), 500

    except Exception as e:
        return jsonify({'success': False, 'error': f'修正失敗: {str(e)}'}), 500

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

@instagram_bp.route('/accounts/<int:account_id>/app-config', methods=['PUT'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def update_app_config(account_id: int):
    """更新 Instagram 帳號的 App 配置（App ID 和 App Secret）"""
    try:
        data = request.get_json()
        app_id = (data.get('app_id') or '').strip()
        app_secret = (data.get('app_secret') or '').strip()

        if not app_id or not app_secret:
            return jsonify({
                'success': False,
                'error': '請提供 App ID 和 App Secret'
            }), 400

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

            if not user:
                return jsonify({
                    'success': False,
                    'error': '用戶不存在'
                }), 401

            # 檢查權限
            if user.role != 'dev_admin':
                if user.role == 'campus_admin' and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '沒有權限修改此帳號'
                    }), 403
                elif user.role not in ['campus_admin', 'cross_admin']:
                    return jsonify({
                        'success': False,
                        'error': '權限不足'
                    }), 403

            # 更新 App 配置
            account.app_id = app_id
            account.app_secret = app_secret
            account.updated_at = datetime.now(timezone.utc)

            db.commit()

            return jsonify({
                'success': True,
                'message': 'App 配置更新成功',
                'account_id': account.id,
                'app_id': app_id,
                'app_secret_set': bool(app_secret)
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'更新 App 配置失敗: {str(e)}'
        }), 500

@instagram_bp.route('/accounts/<int:account_id>/extend-token', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def extend_token(account_id: int):
    """將短期 Token 轉換為長期 Token"""
    try:
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

            if not user:
                return jsonify({
                    'success': False,
                    'error': '用戶不存在'
                }), 401

            # 檢查權限
            if user.role != 'dev_admin':
                if user.role == 'campus_admin' and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '沒有權限修改此帳號'
                    }), 403
                elif user.role not in ['campus_admin', 'cross_admin']:
                    return jsonify({
                        'success': False,
                        'error': '權限不足'
                    }), 403

            # 檢查必要資訊
            if not account.access_token:
                return jsonify({
                    'success': False,
                    'error': '帳號沒有 Access Token'
                }), 400

            if not account.app_id or not account.app_secret:
                return jsonify({
                    'success': False,
                    'error': '請先設定 App ID 和 App Secret'
                }), 400

            # 調用 Facebook Token 交換 API
            exchange_url = "https://graph.facebook.com/v19.0/oauth/access_token"
            params = {
                'grant_type': 'fb_exchange_token',
                'client_id': account.app_id,
                'client_secret': account.app_secret,
                'fb_exchange_token': account.access_token
            }

            response = requests.get(exchange_url, params=params, timeout=10)

            if response.status_code == 200:
                token_data = response.json()

                if 'access_token' in token_data:
                    long_lived_token = token_data['access_token']
                    expires_in = token_data.get('expires_in', 5184000)  # 預設 60 天

                    # 計算過期時間
                    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

                    # 更新帳號資訊
                    account.long_lived_access_token = long_lived_token
                    account.access_token = long_lived_token  # 同時更新主 Token
                    account.token_expires_at = expires_at
                    account.updated_at = datetime.now(timezone.utc)

                    db.commit()

                    # 轉換時區用於顯示
                    expires_taipei = expires_at + timedelta(hours=8)

                    return jsonify({
                        'success': True,
                        'message': 'Token 轉換成功',
                        'token_preview': long_lived_token[:50] + '...',
                        'expires_in_seconds': expires_in,
                        'expires_in_days': expires_in / 86400,
                        'expires_at_utc': expires_at.isoformat(),
                        'expires_at_taipei': expires_taipei.strftime('%Y-%m-%d %H:%M:%S'),
                        'account_id': account.id
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Facebook API 沒有回傳 access_token'
                    }), 400
            else:
                error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
                return jsonify({
                    'success': False,
                    'error': f'Token 轉換失敗: {error_data}',
                    'status_code': response.status_code
                }), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Token 轉換失敗: {str(e)}'
        }), 500
