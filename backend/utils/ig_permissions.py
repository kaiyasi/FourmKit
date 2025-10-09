"""
Instagram 系統權限控制
支援資源級別權限檢查與裝飾器
"""

from functools import wraps
from flask import g, jsonify
from typing import Optional, Literal
from sqlalchemy.orm import Session
from models import InstagramAccount, IGTemplate, InstagramPost, FontFile, FontRequest


ResourceType = Literal["account", "template", "post", "font", "font_request"]


class IGPermissionError(Exception):
    """權限錯誤"""
    pass


def check_ig_permission(
    resource_type: ResourceType,
    resource_id: Optional[int] = None,
    action: str = "view",
    db: Optional[Session] = None
) -> bool:
    """
    檢查用戶對 IG 資源的權限

    Args:
        resource_type: 資源類型 (account, template, post, font, font_request)
        resource_id: 資源 ID（可選，None 表示檢查列表權限）
        action: 操作類型 (view, create, update, delete)
        db: 資料庫 Session（可選）

    Returns:
        是否有權限

    Permission Rules:
        - Dev Admin: 所有權限
        - Campus Admin: 只能操作自己學校的資源
        - Other roles: 無權限
    """
    from utils.db import get_session

    # 檢查用戶是否登入
    if not hasattr(g, 'user') or not g.user:
        return False

    user = g.user
    user_role = user.role

    # Dev Admin 擁有所有權限
    if user_role == 'dev_admin':
        return True

    # 其他角色無權限
    if user_role not in ['campus_admin']:
        return False

    # Campus Admin 權限檢查
    if user_role == 'campus_admin':
        # 如果沒有指定 resource_id，表示檢查列表權限（允許查看自己學校的資源）
        if resource_id is None:
            return True

        # 檢查資源歸屬
        db = db or get_session()

        try:
            if resource_type == "account":
                resource = db.query(InstagramAccount).filter_by(id=resource_id).first()
                if resource:
                    return resource.school_id == user.school_id

            elif resource_type == "template":
                resource = db.query(IGTemplate).filter_by(id=resource_id).first()
                if resource:
                    # 全域模板所有人可用，學校模板只能自己學校使用
                    return resource.school_id is None or resource.school_id == user.school_id

            elif resource_type == "post":
                resource = db.query(InstagramPost).filter_by(id=resource_id).first()
                if resource:
                    # 檢查貼文所屬帳號的學校
                    return resource.account.school_id == user.school_id

            elif resource_type == "font":
                resource = db.query(FontFile).filter_by(id=resource_id).first()
                if resource:
                    # 全域字體所有人可用，學校字體只能自己學校使用
                    from models import FontScope
                    return resource.scope == FontScope.GLOBAL or resource.school_id == user.school_id

            elif resource_type == "font_request":
                resource = db.query(FontRequest).filter_by(id=resource_id).first()
                if resource:
                    # 只能查看自己學校的申請
                    return resource.school_id == user.school_id

        except Exception as e:
            print(f"[IGPermission] Error checking permission: {e}")
            return False

    return False


def require_ig_permission(
    resource_type: ResourceType,
    action: str = "view",
    get_resource_id_from: Optional[str] = None
):
    """
    權限檢查裝飾器

    Args:
        resource_type: 資源類型
        action: 操作類型
        get_resource_id_from: 從哪個參數獲取 resource_id
            - None: 不檢查具體資源，只檢查基本權限
            - "path": 從 URL 路徑參數獲取（如 /api/ig/accounts/<id>）
            - "json": 從 JSON body 獲取
            - "args": 從 query string 獲取

    Example:
        @require_ig_permission("account", action="update", get_resource_id_from="path")
        def update_account(id):
            # 只有有權限的用戶才能執行到這裡
            pass

        @require_ig_permission("template", action="create")
        def create_template():
            # 檢查是否有創建權限（Dev Admin 或 Campus Admin）
            pass
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from flask import request
            from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
            from utils.db import get_session
            from models import User

            # 先驗證 JWT
            try:
                verify_jwt_in_request()
            except Exception:
                return jsonify({'error': 'Unauthorized', 'message': '請先登入'}), 401

            # 獲取用戶並設置到 g
            user_id = get_jwt_identity()
            if not user_id:
                return jsonify({'error': 'Unauthorized', 'message': '請先登入'}), 401

            with get_session() as db:
                user = db.query(User).filter_by(id=int(user_id)).first()
                if not user:
                    return jsonify({'error': 'Unauthorized', 'message': '用戶不存在'}), 401

                # 預先載入所有需要的屬性，然後從 session 中分離
                # 這樣即使 session 關閉，user 物件仍然可用
                _ = user.id, user.role, user.school_id, user.username  # 觸發載入
                db.expunge(user)
                g.user = user

            # 檢查基本角色權限
            if not hasattr(g, 'user') or not g.user:
                return jsonify({'error': 'Unauthorized', 'message': '請先登入'}), 401

            user_role = g.user.role
            if user_role not in ['dev_admin', 'campus_admin']:
                return jsonify({
                    'error': 'Forbidden',
                    'message': '您沒有權限訪問 Instagram 管理功能'
                }), 403

            # 獲取 resource_id
            resource_id = None
            if get_resource_id_from == "path":
                # 從路徑參數獲取（如 /api/ig/accounts/<id> 中的 id）
                resource_id = kwargs.get('id') or kwargs.get('account_id') or kwargs.get('template_id') or kwargs.get('post_id')
            elif get_resource_id_from == "json":
                # 從 JSON body 獲取
                data = request.get_json(silent=True) or {}
                resource_id = data.get('id') or data.get('account_id') or data.get('template_id') or data.get('post_id')
            elif get_resource_id_from == "args":
                # 從 query string 獲取
                resource_id = request.args.get('id') or request.args.get('account_id') or request.args.get('template_id') or request.args.get('post_id')

            # 檢查權限
            if not check_ig_permission(resource_type, resource_id, action):
                return jsonify({
                    'error': 'Forbidden',
                    'message': f'您沒有權限對此{resource_type}進行{action}操作'
                }), 403

            # 權限檢查通過，執行原函數
            return f(*args, **kwargs)

        return decorated_function
    return decorator


def filter_by_permission(
    query,
    resource_type: ResourceType,
    school_id_column: str = "school_id"
):
    """
    根據權限過濾查詢結果

    Args:
        query: SQLAlchemy Query 對象
        resource_type: 資源類型
        school_id_column: 學校 ID 欄位名稱

    Returns:
        過濾後的 Query

    Example:
        query = db.query(InstagramAccount)
        query = filter_by_permission(query, "account", "school_id")
        accounts = query.all()
    """
    if not hasattr(g, 'user') or not g.user:
        # 未登入用戶無法查看任何資源
        return query.filter(False)

    user_role = g.user.role

    # Dev Admin 可以看到所有資源
    if user_role == 'dev_admin':
        return query

    # Campus Admin 只能看到自己學校的資源（或全域資源）
    if user_role == 'campus_admin':
        school_id = g.user.school_id

        # 對於模板和字體，需要包含全域資源
        if resource_type in ["template", "font"]:
            return query.filter(
                (getattr(query.column_descriptions[0]['type'], school_id_column) == school_id) |
                (getattr(query.column_descriptions[0]['type'], school_id_column).is_(None))
            )
        else:
            return query.filter(
                getattr(query.column_descriptions[0]['type'], school_id_column) == school_id
            )

    # 其他角色無法查看任何資源
    return query.filter(False)


def can_access_ig_system() -> bool:
    """
    檢查用戶是否可以訪問 IG 系統

    Returns:
        是否有訪問權限
    """
    if not hasattr(g, 'user') or not g.user:
        return False

    return g.user.role in ['dev_admin', 'campus_admin']


def get_accessible_schools() -> list[int]:
    """
    獲取用戶可訪問的學校 ID 列表

    Returns:
        學校 ID 列表
        - Dev Admin: 返回空列表（表示所有學校）
        - Campus Admin: 返回自己的學校 ID
        - Others: 返回空列表
    """
    if not hasattr(g, 'user') or not g.user:
        return []

    user_role = g.user.role

    if user_role == 'dev_admin':
        return []  # 空列表表示所有學校

    if user_role == 'campus_admin':
        return [g.user.school_id]

    return []
