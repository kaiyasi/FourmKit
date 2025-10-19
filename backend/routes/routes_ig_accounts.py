"""
Instagram 帳號管理 API
支援帳號 CRUD、Token 管理、發布模式配置
"""

from flask import Blueprint, request, jsonify, g, current_app
from sqlalchemy import or_
from datetime import datetime, timedelta
from models import InstagramAccount, IGTemplate
from utils.db import get_session
from utils.ig_permissions import require_ig_permission, filter_by_permission
from utils.ig_crypto import encrypt_token, decrypt_token
from services.ig_token_manager import validate_account_token, refresh_account_token, check_account_expiry


bp = Blueprint('ig_accounts', __name__, url_prefix='/api/admin/ig/accounts')


@bp.before_request
def log_ig_request():
    """Log all IG account requests for debugging"""
    print(f"[IG Accounts] {request.method} {request.path} from {request.remote_addr}", flush=True)


@bp.route('', methods=['GET'])
@require_ig_permission("account", action="view")
def list_accounts():
    """
    列出 Instagram 帳號

    Query Parameters:
        - school_id: 學校 ID（Dev Admin 可用）
        - is_active: 是否啟用（true/false）
        - publish_mode: 發布模式（instant/batch/scheduled）
        - page: 頁碼（預設 1）
        - per_page: 每頁數量（預設 20）

    Returns:
        {
            "accounts": [...],
            "total": int,
            "page": int,
            "per_page": int
        }
    """
    with get_session() as db:
        try:
            query = db.query(InstagramAccount)

            query = filter_by_permission(query, "account", "school_id")

            school_id = request.args.get('school_id', type=int)
            if school_id and g.user.role == 'dev_admin':
                query = query.filter(InstagramAccount.school_id == school_id)

            is_active = request.args.get('is_active')
            if is_active is not None:
                query = query.filter(InstagramAccount.is_active == (is_active.lower() == 'true'))

            publish_mode = request.args.get('publish_mode')
            if publish_mode:
                from models import PublishMode
                query = query.filter(InstagramAccount.publish_mode == PublishMode(publish_mode))

            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)

            total = query.count()
            accounts = query.offset((page - 1) * per_page).limit(per_page).all()

            result = []
            for account in accounts:
                try:
                    expiry_info = check_account_expiry(account.id)

                    result.append({
                        'id': account.id,
                        'school_id': account.school_id,
                        'school_name': account.school.name if account.school else '跨校',
                        'ig_user_id': account.ig_user_id,
                        'username': account.username,
                        'app_id': account.app_id,
                        'publish_mode': account.publish_mode.value,
                        'batch_count': account.batch_count,
                        'scheduled_times': account.scheduled_times,
                        'announcement_template_id': account.announcement_template_id,
                        'general_template_id': account.general_template_id,
                        'is_active': account.is_active,
                        'last_publish_at': account.last_publish_at.isoformat() if account.last_publish_at else None,
                        'token_status': {
                            'is_expired': expiry_info.get('is_expired'),
                            'needs_refresh': expiry_info.get('needs_refresh'),
                            'days_remaining': expiry_info.get('days_remaining'),
                            'expires_at': expiry_info.get('expires_at').isoformat() if expiry_info.get('expires_at') else None
                        },
                        'last_error': account.last_error,
                        'last_error_at': account.last_error_at.isoformat() if account.last_error_at else None,
                        'created_at': account.created_at.isoformat()
                    })
                except Exception as e:
                    import traceback
                    print(f"[IG Accounts] Error serializing account {account.id}: {e}", flush=True)
                    traceback.print_exc()
                    raise

            return jsonify({
                'accounts': result,
                'total': total,
                'page': page,
                'per_page': per_page
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['GET'])
@require_ig_permission("account", action="view", get_resource_id_from="path")
def get_account(id):
    """
    查看帳號詳情

    Returns:
        帳號詳細資訊，包含 Token 狀態
    """
    with get_session() as db:
        try:
            account = db.query(InstagramAccount).filter_by(id=id).first()

            if not account:
                return jsonify({'error': 'Not found', 'message': '帳號不存在'}), 404

            expiry_info = check_account_expiry(account.id)

            return jsonify({
                'id': account.id,
                'school_id': account.school_id,
                'school_name': account.school.name if account.school else '跨校',
                'ig_user_id': account.ig_user_id,
                'username': account.username,
                'app_id': account.app_id,  # 回傳 App ID（安全）
                'has_access_token': bool(account.access_token_encrypted),  # 只告知是否有 Token
                'has_app_secret': bool(account.app_secret_encrypted),  # 只告知是否有 Secret
                'publish_mode': account.publish_mode.value,
                'batch_count': account.batch_count,
                'scheduled_times': account.scheduled_times,
                'announcement_template_id': account.announcement_template_id,
                'announcement_template_name': account.announcement_template.name if account.announcement_template else None,
                'general_template_id': account.general_template_id,
                'general_template_name': account.general_template.name if account.general_template else None,
                'is_active': account.is_active,
                'last_publish_at': account.last_publish_at.isoformat() if account.last_publish_at else None,
                'last_token_refresh': account.last_token_refresh.isoformat() if account.last_token_refresh else None,
                'token_status': {
                    'is_expired': expiry_info.get('is_expired'),
                    'needs_refresh': expiry_info.get('needs_refresh'),
                    'days_remaining': expiry_info.get('days_remaining'),
                    'expires_at': expiry_info.get('expires_at').isoformat() if expiry_info.get('expires_at') else None,
                    'last_refresh': expiry_info.get('last_refresh').isoformat() if expiry_info.get('last_refresh') else None
                },
                'last_error': account.last_error,
                'last_error_at': account.last_error_at.isoformat() if account.last_error_at else None,
                'created_at': account.created_at.isoformat(),
                'updated_at': account.updated_at.isoformat()
            }), 200

        except Exception as e:
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('', methods=['POST'])
@require_ig_permission("account", action="create")
def create_account():
    """
    創建 Instagram 帳號

    Request Body:
        {
            "school_id": int (可選，Dev Admin 必填，Campus Admin 自動使用自己的學校),
            "ig_user_id": str,
            "username": str,
            "access_token": str,
            "token_expires_days": int (預設 60),
            "publish_mode": "instant" | "batch" | "scheduled",
            "batch_count": int (batch 模式必填，預設 10),
            "scheduled_times": ["09:00", "15:00", "21:00"] (scheduled 模式必填),
            "announcement_template_id": int (可選),
            "general_template_id": int (可選)
        }

    Returns:
        創建的帳號資訊
    """
    with get_session() as db:
        try:
            import traceback
            data = request.get_json()
            print(f"[IG Account Create] Received data: {data}", flush=True)

            required_fields = ['ig_user_id', 'username', 'access_token', 'publish_mode']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({'error': 'Bad request', 'message': f'缺少必填欄位：{field}'}), 400

            if g.user.role == 'dev_admin':
                school_id = data.get('school_id')  # Dev Admin 可指定或設為 None（跨校）
            else:
                school_id = g.user.school_id  # Campus Admin 只能創建自己學校的帳號

            print(f"[IG Account Create] school_id={school_id}, user_role={g.user.role}", flush=True)

            existing = db.query(InstagramAccount).filter_by(ig_user_id=data['ig_user_id']).first()
            if existing:
                return jsonify({'error': 'Conflict', 'message': 'IG User ID 已存在'}), 409

            from models import PublishMode
            try:
                publish_mode = PublishMode(data['publish_mode'])
            except ValueError:
                return jsonify({'error': 'Bad request', 'message': '無效的發布模式'}), 400

            batch_count = data.get('batch_count', 10)
            if publish_mode == PublishMode.BATCH:
                if not isinstance(batch_count, int) or batch_count < 1 or batch_count > 10:
                    return jsonify({'error': 'Bad request', 'message': '批次數量必須在 1-10 之間'}), 400

            scheduled_times = data.get('scheduled_times')
            if publish_mode == PublishMode.SCHEDULED:
                if not scheduled_times or not isinstance(scheduled_times, list):
                    return jsonify({'error': 'Bad request', 'message': 'scheduled 模式必須提供 scheduled_times'}), 400

            access_token = data['access_token']
            app_id = data.get('app_id', '').strip()
            app_secret = data.get('app_secret', '').strip()

            if app_id and app_secret:
                print(f"[IG Account Create] Converting short-lived token to long-lived token", flush=True)
                from services.ig_token_manager import IGTokenManager
                token_manager = IGTokenManager(db)
                success, error, token_data = token_manager.exchange_short_lived_token(
                    access_token, app_id, app_secret
                )

                if not success or not token_data:
                    return jsonify({
                        'error': 'Token conversion failed',
                        'message': f'無法轉換 Token：{error}'
                    }), 400

                access_token = token_data['access_token']
                token_expires_seconds = token_data['expires_in']
                token_expires_at = datetime.utcnow() + timedelta(seconds=token_expires_seconds)
                print(f"[IG Account Create] Token converted successfully, expires in {token_expires_seconds}s", flush=True)
            else:
                token_expires_days = data.get('token_expires_days', 60)
                token_expires_at = datetime.utcnow() + timedelta(days=token_expires_days)
                print(f"[IG Account Create] Using default token expiry: {token_expires_days} days", flush=True)

            try:
                encrypted_token = encrypt_token(access_token)
                print(f"[IG Account Create] Token encrypted successfully", flush=True)
            except Exception as e:
                print(f"[IG Account Create] Token encryption failed: {str(e)}", flush=True)
                traceback.print_exc()
                return jsonify({'error': 'Internal server error', 'message': f'Token 加密失敗：{str(e)}'}), 500

            encrypted_app_secret = None
            if app_secret:
                try:
                    encrypted_app_secret = encrypt_token(app_secret)
                    print(f"[IG Account Create] App Secret encrypted successfully", flush=True)
                except Exception as e:
                    print(f"[IG Account Create] App Secret encryption failed: {str(e)}", flush=True)
                    return jsonify({'error': 'Internal server error', 'message': f'App Secret 加密失敗：{str(e)}'}), 500

            print(f"[IG Account Create] Creating account object", flush=True)
            account = InstagramAccount(
                school_id=school_id,
                ig_user_id=data['ig_user_id'],
                username=data['username'],
                access_token_encrypted=encrypted_token,
                token_expires_at=token_expires_at,
                app_id=app_id if app_id else None,
                app_secret_encrypted=encrypted_app_secret,
                publish_mode=publish_mode,
                batch_count=batch_count if publish_mode == PublishMode.BATCH else None,
                scheduled_times=scheduled_times if publish_mode == PublishMode.SCHEDULED else None,
                announcement_template_id=data.get('announcement_template_id'),
                general_template_id=data.get('general_template_id'),
                is_active=True
            )

            print(f"[IG Account Create] Adding and committing to DB", flush=True)
            db.add(account)
            db.commit()
            db.refresh(account)
            print(f"[IG Account Create] Account created successfully: id={account.id}", flush=True)

            return jsonify({
                'message': '帳號創建成功',
                'account': {
                    'id': account.id,
                    'school_id': account.school_id,
                    'ig_user_id': account.ig_user_id,
                    'username': account.username,
                    'publish_mode': account.publish_mode.value,
                    'token_expires_at': account.token_expires_at.isoformat(),
                    'created_at': account.created_at.isoformat()
                }
            }), 201

        except Exception as e:
            db.rollback()
            print(f"[IG Account Create] Error: {str(e)}", flush=True)
            traceback.print_exc()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['PUT'])
@require_ig_permission("account", action="update", get_resource_id_from="path")
def update_account(id):
    """
    更新帳號資訊

    Request Body:
        {
            "username": str (可選),
            "publish_mode": str (可選),
            "batch_count": int (可選),
            "scheduled_times": list (可選),
            "announcement_template_id": int (可選),
            "general_template_id": int (可選),
            "is_active": bool (可選),
            "app_id": str (可選),
            "app_secret": str (可選)
        }
    """
    with get_session() as db:
        try:
            account = db.query(InstagramAccount).filter_by(id=id).first()

            if not account:
                return jsonify({'error': 'Not found', 'message': '帳號不存在'}), 404

            data = request.get_json()

            if 'username' in data:
                account.username = data['username']

            if 'publish_mode' in data:
                from models import PublishMode
                try:
                    account.publish_mode = PublishMode(data['publish_mode'])
                except ValueError:
                    return jsonify({'error': 'Bad request', 'message': '無效的發布模式'}), 400

            if 'batch_count' in data:
                account.batch_count = data['batch_count']

            if 'scheduled_times' in data:
                account.scheduled_times = data['scheduled_times']

            if 'announcement_template_id' in data:
                account.announcement_template_id = data['announcement_template_id']

            if 'general_template_id' in data:
                account.general_template_id = data['general_template_id']

            if 'is_active' in data:
                account.is_active = data['is_active']


            if 'app_id' in data:
                account.app_id = data['app_id'].strip() if data['app_id'] else None

            if 'app_secret' in data and data['app_secret'] and data['app_secret'].strip():
                app_secret = data['app_secret'].strip()
                account.app_secret_encrypted = encrypt_token(app_secret)

            if 'access_token' in data and data['access_token'] and data['access_token'].strip():
                new_token = data['access_token'].strip()
                
                app_id_for_exchange = account.app_id
                app_secret_for_exchange = None
                if account.app_secret_encrypted:
                    from utils.ig_crypto import decrypt_token
                    app_secret_for_exchange = decrypt_token(account.app_secret_encrypted)

                if app_id_for_exchange and app_secret_for_exchange:
                    from services.ig_token_manager import IGTokenManager
                    try:
                        token_manager = IGTokenManager(db)
                        success, error, token_data = token_manager.exchange_short_lived_token(
                            new_token, app_id_for_exchange, app_secret_for_exchange
                        )
                        if success and token_data:
                            new_token = token_data['access_token']
                            token_expires_at = datetime.utcnow() + timedelta(seconds=token_data['expires_in'])
                            account.token_expires_at = token_expires_at
                            print(f"[IG Account Update] Token exchanged successfully for account {id}", flush=True)
                        else:
                            print(f"[IG Account Update] Token exchange failed: {error}, using original token", flush=True)
                            account.token_expires_at = datetime.utcnow() + timedelta(days=60)
                    except Exception as e:
                        print(f"[IG Account Update] Token exchange exception: {e}, using original token", flush=True)
                        account.token_expires_at = datetime.utcnow() + timedelta(days=60)
                else:
                    account.token_expires_at = datetime.utcnow() + timedelta(days=60)

                account.access_token_encrypted = encrypt_token(new_token)

            db.commit()

            return jsonify({'message': '帳號更新成功'}), 200

        except Exception as e:
            db.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>', methods=['DELETE'])
@require_ig_permission("account", action="delete", get_resource_id_from="path")
def delete_account(id):
    """刪除帳號（僅 Dev Admin）"""
    if g.user.role != 'dev_admin':
        return jsonify({'error': 'Forbidden', 'message': '只有 Dev Admin 可以刪除帳號'}), 403

    with get_session() as db:
        try:
            account = db.query(InstagramAccount).filter_by(id=id).first()

            if not account:
                return jsonify({'error': 'Not found', 'message': '帳號不存在'}), 404

            db.delete(account)
            db.commit()

            return jsonify({'message': '帳號刪除成功'}), 200

        except Exception as e:
            db.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>/validate', methods=['POST'])
@require_ig_permission("account", action="view", get_resource_id_from="path")
def validate_token(id):
    """驗證帳號 Token"""
    try:
        is_valid, message = validate_account_token(id)

        return jsonify({
            'is_valid': is_valid,
            'message': message or 'Token 有效'
        }), 200

    except Exception as e:
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@bp.route('/<int:id>/refresh', methods=['POST'])
@require_ig_permission("account", action="update", get_resource_id_from="path")
def refresh_token(id):
    """刷新帳號 Token"""
    try:
        current_app.logger.info(f"[IG Token Refresh] Starting token refresh for account {id}")
        success, message = refresh_account_token(id)

        if success:
            current_app.logger.info(f"[IG Token Refresh] Success for account {id}: {message}")
            return jsonify({'message': message}), 200
        else:
            current_app.logger.warning(f"[IG Token Refresh] Failed for account {id}: {message}")
            return jsonify({'error': 'Refresh failed', 'message': message}), 400

    except Exception as e:
        current_app.logger.error(f"[IG Token Refresh] Exception for account {id}: {str(e)}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
