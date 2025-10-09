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
    
    # 開發人員：全部權限
    if role == 'dev_admin':
        return {
            'can_post_to_schools': [],  # 空列表表示所有學校
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': True,
            'is_cross_school': True,
        }
    
    # 校內管理員：只能管理自己學校
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
    
    # 跨校管理員：只能管理跨校內容（school_id為null）
    elif role == 'cross_admin':
        return {
            'can_post_to_schools': [],  # 空列表表示只能發跨校貼文
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': True,  # 可以查看所有內容
            'is_cross_school': True,
        }
    
    # 校內審核：只能審核自己學校的內容
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
    
    # 跨校審核：只能審核跨校內容（school_id為null）
    elif role == 'cross_moderator':
        return {
            'can_post_to_schools': [],
            'can_comment_on_schools': [],
            'can_moderate_schools': [],
            'can_view_all_schools': True,  # 可以查看所有內容
            'is_cross_school': True,
        }
    
    # 一般用戶：可以選擇跨校或自己學校
    else:
        if not user_school_id:
            # 沒有學校綁定的用戶只能跨校
            return {
                'can_post_to_schools': [],
                'can_comment_on_schools': [],
                'can_moderate_schools': [],
                'can_view_all_schools': False,
                'is_cross_school': True,
            }
        else:
            # 有學校綁定的用戶可以選擇跨校或自己學校
            return {
                'can_post_to_schools': [user_school_id],
                'can_comment_on_schools': [user_school_id],
                'can_moderate_schools': [],
                'can_view_all_schools': False,
                'is_cross_school': True,  # 可以選擇跨校
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
    
    # 跨校貼文（school_id為None）
    if school_id is None:
        return permissions['is_cross_school']
    
    # 校內貼文：檢查是否在允許的學校列表中
    # 如果can_post_to_schools為空列表且是dev_admin，表示可以發文到所有學校
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
    
    # 跨校貼文（post.school_id為None）
    if post.school_id is None:
        return permissions['is_cross_school']
    
    # 校內貼文：檢查是否在允許的學校列表中
    # 如果can_comment_on_schools為空列表且是dev_admin，表示可以在所有學校留言
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
    
    # 如果是公告，只有 dev_admin 可以審核
    if post and getattr(post, 'is_announcement', False):
        return user.role == 'dev_admin'
    
    permissions = get_user_school_permissions(user)
    
    # 跨校內容（content_school_id為None）
    if content_school_id is None:
        return permissions['is_cross_school']
    
    # 校內內容：檢查是否在允許的學校列表中
    # 如果can_moderate_schools為空列表且是dev_admin，表示可以審核所有學校
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
        return base_query.filter(Post.id == 0)  # 返回空結果
    
    permissions = get_user_school_permissions(user)
    
    # 如果可以查看所有學校，直接返回原查詢
    if permissions['can_view_all_schools']:
        return base_query
    
    # 構建查詢條件
    conditions = []
    
    # 如果用戶可以查看特定學校的貼文
    if permissions['can_post_to_schools']:
        conditions.append(Post.school_id.in_(permissions['can_post_to_schools']))
    
    # 如果用戶有跨校權限，可以查看跨校貼文
    if permissions['is_cross_school']:
        conditions.append(Post.school_id.is_(None))
    
    # 如果有任何條件，使用OR組合；否則返回空結果
    if conditions:
        if len(conditions) == 1:
            return base_query.filter(conditions[0])
        else:
            return base_query.filter(or_(*conditions))
    
    # 如果沒有任何權限，返回空結果
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
                
                # 根據權限類型檢查
                if permission_type == 'post':
                    # 對於發文，檢查用戶是否有權限發文到任何學校
                    permissions = get_user_school_permissions(user)
                    if not permissions['can_post_to_schools'] and not permissions['is_cross_school']:
                        abort(403, description="沒有發文權限")
                
                elif permission_type == 'comment':
                    # 對於留言，檢查用戶是否有權限留言到任何學校
                    permissions = get_user_school_permissions(user)
                    if not permissions['can_comment_on_schools'] and not permissions['is_cross_school']:
                        abort(403, description="沒有留言權限")
                
                elif permission_type == 'moderate':
                    # 對於審核，檢查用戶是否有審核權限
                    permissions = get_user_school_permissions(user)
                    if not permissions['can_moderate_schools'] and not permissions['is_cross_school']:
                        abort(403, description="沒有審核權限")
            
            return f(*args, **kwargs)
        return wrapper
    return decorator
