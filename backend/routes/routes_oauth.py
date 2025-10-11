"""
Module: backend/routes/routes_oauth.py
Unified comment style: module docstring + minimal inline notes.
"""
"""
OAuth 認證路由
處理第三方平台的 OAuth 認證流程
"""
from flask import Blueprint, request, jsonify, redirect, session, g
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import joinedload
from datetime import datetime, timezone
import logging

from utils.db import get_session
from utils.authz import require_role
from services.instagram_oauth import instagram_oauth_service, InstagramOAuthError
from models.social_publishing import SocialAccount, AccountStatus, PublishTrigger, PlatformType
from models.base import User

logger = logging.getLogger(__name__)

oauth_bp = Blueprint('oauth', __name__, url_prefix='/api/auth')

@oauth_bp.route('/instagram/authorize', methods=['GET'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def instagram_authorize():
    """
    開始 Instagram OAuth 授權流程
    """
    try:
        auth_data = instagram_oauth_service.get_authorization_url()
        
        session['instagram_oauth_state'] = auth_data['state']
        session['oauth_user_id'] = get_jwt_identity()
        
        return jsonify({
            'success': True,
            'authorization_url': auth_data['authorization_url'],
            'state': auth_data['state'],
            'redirect_uri': auth_data['redirect_uri']
        })
        
    except Exception as e:
        logger.error(f"Instagram 授權初始化失敗: {e}")
        return jsonify({
            'success': False,
            'error': f'授權初始化失敗: {str(e)}'
        }), 500

@oauth_bp.route('/instagram/callback', methods=['GET'])
def instagram_callback():
    """
    處理 Instagram OAuth 回調
    """
    try:
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        error_description = request.args.get('error_description')
        
        if error:
            logger.warning(f"Instagram OAuth 授權被拒絕: {error} - {error_description}")
            return redirect(f"/admin/instagram?error={error}&message={error_description}")
        
        if not code or not state:
            logger.warning("Instagram OAuth 回調缺少必要參數")
            return redirect("/admin/instagram?error=missing_params&message=缺少必要參數")
        
        stored_state = session.get('instagram_oauth_state')
        if not stored_state or stored_state != state:
            logger.warning("Instagram OAuth state 參數驗證失敗")
            return redirect("/admin/instagram?error=invalid_state&message=狀態參數驗證失敗")
        
        oauth_user_id = session.get('oauth_user_id')
        if not oauth_user_id:
            logger.warning("找不到 OAuth 觸發用戶")
            return redirect("/admin/instagram?error=no_user&message=找不到授權用戶")
        
        token_data = instagram_oauth_service.exchange_code_for_token(code)
        
        if not token_data.get('success'):
            return redirect("/admin/instagram?error=token_exchange&message=授權碼交換失敗")
        
        with get_session() as db:
            user = db.query(User).filter(User.id == oauth_user_id).first()
            if not user:
                return redirect("/admin/instagram?error=user_not_found&message=用戶不存在")
            
            user_info = token_data['user_info']
            
            existing_account = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM,
                SocialAccount.platform_user_id == str(user_info['id'])
            ).first()
            
            if existing_account:
                existing_account.access_token = token_data['access_token']
                if hasattr(existing_account, 'long_lived_access_token'):
                    existing_account.long_lived_access_token = token_data['access_token']
                existing_account.token_expires_at = token_data['expires_at']
                existing_account.status = AccountStatus.ACTIVE
                existing_account.updated_at = datetime.now(timezone.utc)
                
                existing_account.platform_username = user_info.get('username', existing_account.platform_username)
                existing_account.display_name = user_info.get('name', existing_account.display_name)
                
                db.commit()
                
                logger.info(f"Instagram 帳號已更新: @{existing_account.platform_username}")
                return redirect("/admin/instagram?success=account_updated&username=" + existing_account.platform_username)
            
            else:
                new_account = SocialAccount(
                    platform=PlatformType.INSTAGRAM,
                    platform_user_id=str(user_info['id']),
                    platform_username=user_info.get('username', f"user_{user_info['id']}"),
                    display_name=user_info.get('name', user_info.get('username', 'Instagram 用戶')),
                    access_token=token_data['access_token'],
                    token_expires_at=token_data['expires_at'],
                    status=AccountStatus.ACTIVE,
                    publish_trigger=PublishTrigger.BATCH_COUNT,
                    batch_size=5,
                    school_id=user.school_id,
                    created_by=oauth_user_id,
                    description=user_info.get('biography', ''),
                    avatar_url=user_info.get('profile_picture_url', '')
                )
                
                db.add(new_account)
                db.commit()
                
                logger.info(f"新 Instagram 帳號已添加: @{new_account.platform_username}")
                return redirect("/admin/instagram?success=account_added&username=" + new_account.platform_username)
        
        session.pop('instagram_oauth_state', None)
        session.pop('oauth_user_id', None)
        
    except InstagramOAuthError as e:
        logger.error(f"Instagram OAuth 處理失敗: {e}")
        return redirect(f"/admin/instagram?error=oauth_failed&message={str(e)}")
    except Exception as e:
        logger.error(f"Instagram 回調處理異常: {e}")
        return redirect(f"/admin/instagram?error=callback_error&message=回調處理失敗")

@oauth_bp.route('/instagram/refresh', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def refresh_instagram_token():
    """
    手動刷新 Instagram Access Token
    """
    try:
        data = request.get_json()
        account_id = data.get('account_id')
        
        if not account_id:
            return jsonify({
                'success': False,
                'error': '缺少帳號 ID'
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
            
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if g.role != 'dev_admin' and user and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此帳號'
                    }), 403
            
            refresh_result = instagram_oauth_service.refresh_access_token(account.access_token)
            
            if refresh_result.get('success'):
                account.access_token = refresh_result['access_token']
                if hasattr(account, 'long_lived_access_token'):
                    account.long_lived_access_token = refresh_result['access_token']
                account.token_expires_at = refresh_result['expires_at']
                account.status = AccountStatus.ACTIVE
                account.updated_at = datetime.now(timezone.utc)
                
                db.commit()
                
                return jsonify({
                    'success': True,
                    'message': 'Token 刷新成功',
                    'expires_at': refresh_result['expires_at'].isoformat()
                })
            else:
                account.status = AccountStatus.ERROR
                account.updated_at = datetime.now(timezone.utc)
                db.commit()
                
                return jsonify({
                    'success': False,
                    'error': 'Token 刷新失敗，請重新授權'
                }), 400
                
    except Exception as e:
        logger.error(f"Instagram token 刷新失敗: {e}")
        return jsonify({
            'success': False,
            'error': f'Token 刷新失敗: {str(e)}'
        }), 500

@oauth_bp.route('/instagram/revoke', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def revoke_instagram_token():
    """
    撤銷 Instagram Access Token 並刪除帳號
    """
    try:
        data = request.get_json()
        account_id = data.get('account_id')
        
        if not account_id:
            return jsonify({
                'success': False,
                'error': '缺少帳號 ID'
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
            
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if g.role != 'dev_admin' and user and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此帳號'
                    }), 403
            
            try:
                instagram_oauth_service.revoke_token(account.access_token)
            except:
                pass
            
            username = account.platform_username
            
            db.delete(account)
            db.commit()
            
            return jsonify({
                'success': True,
                'message': f'Instagram 帳號 @{username} 已成功移除'
            })
            
    except Exception as e:
        logger.error(f"Instagram 帳號撤銷失敗: {e}")
        return jsonify({
            'success': False,
            'error': f'帳號撤銷失敗: {str(e)}'
        }), 500

@oauth_bp.route('/instagram/validate', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def validate_instagram_account():
    """
    驗證指定的 Instagram 帳號狀態
    """
    try:
        data = request.get_json()
        account_id = data.get('account_id')
        
        if not account_id:
            return jsonify({
                'success': False,
                'error': '缺少帳號 ID'
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
            
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if g.role != 'dev_admin' and user and user.school_id:
                if account.school_id and account.school_id != user.school_id:
                    return jsonify({
                        'success': False,
                        'error': '無權限操作此帳號'
                    }), 403
            
            validation_result = instagram_oauth_service.validate_token(
                account.access_token, 
                account.platform_user_id
            )
            
            if validation_result.get('valid'):
                account.status = AccountStatus.ACTIVE
                account.updated_at = datetime.now(timezone.utc)
                
                user_info = validation_result.get('user_info', {})
                if user_info.get('username'):
                    account.platform_username = user_info['username']
                
            else:
                account.status = AccountStatus.ERROR
                account.updated_at = datetime.now(timezone.utc)
            
            db.commit()
            
            return jsonify({
                'success': True,
                'validation_result': validation_result,
                'account_status': account.status
            })
            
    except Exception as e:
        logger.error(f"Instagram 帳號驗證失敗: {e}")
        return jsonify({
            'success': False,
            'error': f'帳號驗證失敗: {str(e)}'
        }), 500
