"""
Module: backend/utils/school_permissions.py
Unified comment style: module docstring + minimal inline notes.
"""
from typing import Optional
from sqlalchemy.orm import Session
from models import User, Post
from flask import abort

def get_user_school_permissions(user: User) -> dict:
    """
    獲取用戶的學校權限配置
    
    Returns:
        dict: {
            'can_post_to_schools': List[int],  # 可以發文的學校ID列表
            'can_comment_on_schools': List[int],  # 可以留言的學校ID列表  
            'can_moderate_schools': List[int],  # 可以審核的學校ID列表
            'can_view_all_schools': bool,  # 是否可以查看所有學校
            'is_cross_school': bool,  # 是否為跨校權限
        }
    """
    if not user:
        return {
            'can_post_to_schools': [],
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': False,
            'is_cross_school': False,
        }
    
    role = user.role
    user_school_id = user.school_id
    
    if role == 'dev_admin':
        return {
            'can_post_to_schools': [],
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': True,
            'is_cross_school': True,
        }
    
    elif role == 'campus_admin':
        if not user_school_id:
            return {
                'can_post_to_schools': [],
                'can_comment_on_schools': [],
                'can_moderate_schools': [],
                'can_view_all_schools': False,
                'is_cross_school': False,
            }
        return {
            'can_post_to_schools': [user_school_id],
            'can_comment_on_schools': [user_school_id],
            'can_moderate_schools': [user_school_id],
            'can_view_all_schools': False,
            'is_cross_school': False,
        }
    
    elif role == 'cross_admin':
        return {
            'can_post_to_schools': [],
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': True,
            'is_cross_school': True,
        }
    
    elif role == 'campus_moderator':
        if not user_school_id:
            return {
                'can_post_to_schools': [],
                'can_comment_on_schools': [],
                'can_moderate_schools': [],
                'can_view_all_schools': False,
                'is_cross_school': False,
            }
        return {
            'can_post_to_schools': [user_school_id],
            'can_comment_on_schools': [user_school_id],
            'can_moderate_schools': [user_school_id],
            'can_view_all_schools': False,
            'is_cross_school': False,
        }
    
    elif role == 'cross_moderator':
        return {
            'can_post_to_schools': [],
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': True,
            'is_cross_school': True,
        }
    
    else:
        if not user_school_id:
            return {
                'can_post_to_schools': [],
                'can_comment_on_schools': [],
                'can_moderate_schools': [],
                'can_view_all_schools': False,
                'is_cross_school': True,
            }
        else:
            return {
                'can_post_to_schools': [user_school_id],
                'can_comment_on_schools': [user_school_id],
                'can_moderate_schools': [],
                'can_view_all_schools': False,
                'is_cross_school': True,
            }

def can_post_to_school(user: User, school_id: Optional[int]) -> bool:
    """
    檢查用戶是否可以在指定學校發文
    
    Args:
        user: 用戶對象
        school_id: 學校ID，None表示跨校貼文
    
    Returns:
        bool: 是否可以發文
    """
    if not user:
        return False
    
    permissions = get_user_school_permissions(user)
    
    if school_id is None:
        return permissions['is_cross_school']
    
    if not permissions['can_post_to_schools'] and user.role == 'dev_admin':
        return True
    
    return school_id in permissions['can_post_to_schools']

def can_comment_on_post(user: User, post: Post) -> bool:
    """
    檢查用戶是否可以在指定貼文留言
    
    Args:
        user: 用戶對象
        post: 貼文對象
    
    Returns:
        bool: 是否可以留言
    """
    if not user or not post:
        return False
    
    permissions = get_user_school_permissions(user)
    
    if post.school_id is None:
        return permissions['is_cross_school']
    
    if not permissions['can_comment_on_schools'] and user.role == 'dev_admin':
        return True
    
    return post.school_id in permissions['can_comment_on_schools']

def can_moderate_content(user: User, content_school_id: Optional[int], post: Optional['Post'] = None) -> bool:
    """
    檢查用戶是否可以審核指定學校的內容
    
    Args:
        user: 用戶對象
        content_school_id: 內容的學校ID，None表示跨校內容
        post: 貼文對象（可選，用於檢查是否為公告）
    
    Returns:
        bool: 是否可以審核
    """
    if not user:
        return False
    
    if post and getattr(post, 'is_announcement', False):
        return user.role == 'dev_admin'
    
    permissions = get_user_school_permissions(user)
    
    if content_school_id is None:
        return permissions['is_cross_school']
    
    if not permissions['can_moderate_schools'] and user.role == 'dev_admin':
        return True
    
    return content_school_id in permissions['can_moderate_schools']

def filter_posts_by_permissions(session: Session, user: User, base_query=None):
    """
    根據用戶權限過濾貼文查詢
    
    Args:
        session: 數據庫會話
        user: 用戶對象
        base_query: 基礎查詢（可選）
    
    Returns:
        過濾後的查詢
    """
    from sqlalchemy import or_
    
    if base_query is None:
        base_query = session.query(Post)
    
    if not user:
        return base_query.filter(Post.id == 0)
    
    permissions = get_user_school_permissions(user)
    
    if permissions['can_view_all_schools']:
        return base_query
    
    conditions = []
    
    if permissions['can_post_to_schools']:
        conditions.append(Post.school_id.in_(permissions['can_post_to_schools']))
    
    if permissions['is_cross_school']:
        conditions.append(Post.school_id.is_(None))
    
    if conditions:
        if len(conditions) == 1:
            return base_query.filter(conditions[0])
        else:
            return base_query.filter(or_(*conditions))
    
    return base_query.filter(Post.id == 0)

def require_school_permission(permission_type: str):
    """
    裝飾器：要求學校權限
    
    Args:
        permission_type: 權限類型 ('post', 'comment', 'moderate')
    """
    def decorator(f):
        from functools import wraps
        from flask_jwt_extended import get_jwt_identity
        from utils.db import get_session
        
        @wraps(f)
        def wrapper(*args, **kwargs):
            user_id = get_jwt_identity()
            if not user_id:
                abort(401)
            
            with get_session() as session:
                user = session.query(User).get(user_id)
                if not user:
                    abort(401)
                
                if permission_type == 'post':
                    permissions = get_user_school_permissions(user)
                    if not permissions['can_post_to_schools'] and not permissions['is_cross_school']:
                        abort(403, description="沒有發文權限")
                
                elif permission_type == 'comment':
                    permissions = get_user_school_permissions(user)
                    if not permissions['can_comment_on_schools'] and not permissions['is_cross_school']:
                        abort(403, description="沒有留言權限")
                
                elif permission_type == 'moderate':
                    permissions = get_user_school_permissions(user)
                    if not permissions['can_moderate_schools'] and not permissions['is_cross_school']:
                        abort(403, description="沒有審核權限")
            
            return f(*args, **kwargs)
        return wrapper
    return decorator
