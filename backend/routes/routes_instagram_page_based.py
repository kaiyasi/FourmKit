# backend/routes/routes_instagram_page_based.py
"""
基於 Page ID 的 Instagram 帳號管理
用戶必須提供 Page ID，Token 只作為驗證備用
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.base import User
from models.school import School
from models.social_publishing import SocialAccount, PlatformType, AccountStatus, PublishTrigger
from utils.db import get_session
from utils.auth import require_role
import requests
import os
import logging

logger = logging.getLogger(__name__)

# 創建藍圖
instagram_page_bp = Blueprint('instagram_page', __name__, url_prefix='/api/instagram_page')

@instagram_page_bp.route('/accounts/create_with_page', methods=['POST'])
@require_role('dev_admin', 'campus_admin', 'cross_admin')
def create_account_with_page_id():
    """使用 Page ID 創建 Instagram 帳號（新版本）"""
    try:
        data = request.get_json()
        logger.info(f"收到建立帳號請求: {data}")
        
        # 必要參數
        display_name = data.get('display_name')
        page_id = data.get('page_id')  # 必須提供 Page ID
        access_token = data.get('access_token')  # Token 作為驗證用（可選）
        
        # 可選參數
        platform_username = data.get('platform_username', '')
        requested_school_id = data.get('school_id')
        
        logger.info(f"解析參數: display_name='{display_name}', page_id='{page_id}', platform_username='{platform_username}'")
        
        # 驗證必要參數（Token 改為可選）
        if not all([display_name, page_id]):
            return jsonify({
                'success': False,
                'error': '缺少必要參數: display_name, page_id'
            }), 400
        
        # 驗證 Page ID 格式
        if not page_id.isdigit() or len(page_id) < 10:
            return jsonify({
                'success': False,
                'error': 'Page ID 格式錯誤，應為數字且長度大於 10'
            }), 400
        
        with get_session() as db:
            user_id = get_jwt_identity()
            user = db.query(User).filter(User.id == user_id).first()
            
            if not user:
                return jsonify({
                    'success': False,
                    'error': '用戶不存在'
                }), 404
            
            # 處理學校權限
            final_school_id = _determine_school_id(user, requested_school_id, db)
            if isinstance(final_school_id, tuple):  # 錯誤回應
                return final_school_id
            
            logger.info(f"用戶角色: {user.role}, 最終學校ID: {final_school_id}")
            
            # 檢查 Page ID 是否已存在
            existing_account = db.query(SocialAccount).filter(
                SocialAccount.platform == PlatformType.INSTAGRAM,
                SocialAccount.platform_user_id == page_id
            ).first()
            
            if existing_account:
                return jsonify({
                    'success': False,
                    'error': f'Page ID {page_id} 已經被註冊過了'
                }), 400
            
            validation_result = None
            desired_status = AccountStatus.PENDING
            resolved_username = platform_username or f'page_{page_id}'

            # 如有 token 嘗試驗證；若失敗則仍建立為 PENDING，僅附帶提示
            validation_hint = None
            if access_token:
                vr = _validate_page_and_token(page_id, access_token)
                if vr.get('success'):
                    validation_result = vr
                    desired_status = AccountStatus.ACTIVE
                    resolved_username = platform_username or vr.get('page_name', resolved_username)
                else:
                    validation_hint = vr.get('error') or 'Token 驗證未通過，將以待驗證狀態建立'

            # 創建帳號（無 token 或驗證失敗皆為 PENDING）
            account = SocialAccount(
                platform=PlatformType.INSTAGRAM,
                platform_user_id=page_id,  # 使用 Page ID 作為主鍵
                platform_username=resolved_username,
                display_name=display_name,
                access_token=access_token or '',  # Token 作為備用，可留空
                status=desired_status,
                school_id=final_school_id,
                publish_trigger=PublishTrigger.BATCH_COUNT,
                batch_size=2,
                created_by=user_id
            )
            
            db.add(account)
            db.commit()
            
            logger.info(f"帳號創建成功: {account.id}")
            
            return jsonify({
                'success': True,
                'message': (
                    f"帳號 {display_name} 創建成功！" + (
                        "（狀態：待驗證，請提供 Token）" if desired_status == AccountStatus.PENDING else ''
                    )
                ),
                'account': {
                    'id': account.id,
                    'display_name': account.display_name,
                    'platform_username': account.platform_username,
                    'page_id': account.platform_user_id,
                    'ig_account_id': (validation_result.get('ig_account_id') if validation_result else None),
                    'status': account.status,
                    'created_at': account.created_at.isoformat()
                },
                'hint': validation_hint
            })
            
    except Exception as e:
        logger.error(f"創建帳號失敗: {e}")
        return jsonify({
            'success': False,
            'error': f'伺服器錯誤: {str(e)}'
        }), 500

def _determine_school_id(user, requested_school_id, db):
    """根據用戶角色決定學校 ID"""
    if user.role == 'dev_admin':
        # dev_admin 可以自由選擇學校或不綁定
        if requested_school_id is not None and isinstance(requested_school_id, int):
            school = db.query(School).filter(School.id == requested_school_id).first()
            if not school:
                return jsonify({
                    'success': False,
                    'error': f'找不到ID為{requested_school_id}的學校'
                }), 400
        return requested_school_id
        
    elif user.role == 'campus_admin':
        # campus_admin 只能綁定自己的學校
        if not user.school_id:
            return jsonify({
                'success': False,
                'error': 'campus_admin 用戶必須有綁定的學校才能新增帳號'
            }), 400
        return user.school_id
        
    elif user.role == 'cross_admin':
        return jsonify({
            'success': False,
            'error': 'cross_admin 沒有權限新增帳號'
        }), 403
        
    else:
        return jsonify({
            'success': False,
            'error': '用戶角色無效'
        }), 403

def _validate_page_and_token(page_id: str, access_token: str) -> dict:
    """驗證 Page ID 和 Token 的有效性。
    支援兩種情境：
    - 直接提供 Page Access Token
    - 提供 User Token：會自動透過 /me/accounts 取得對應 Page 的 Page Token
    """
    try:
        def fetch_page(fields: str, token: str):
            return requests.get(
                f"https://graph.facebook.com/v23.0/{page_id}",
                params={'fields': fields, 'access_token': token},
                timeout=15,
            )

        def find_page_token_with_user_token(user_token: str):
            try:
                r = requests.get(
                    "https://graph.facebook.com/v23.0/me/accounts",
                    params={'fields': 'id,name,access_token', 'access_token': user_token},
                    timeout=15,
                )
                if r.status_code != 200:
                    return None, f"無法列出用戶 Pages: {r.text}"
                data = r.json().get('data', [])
                for p in data:
                    if str(p.get('id')) == str(page_id) and p.get('access_token'):
                        return p.get('access_token'), None
                return None, "提供的 Token 中找不到該 Page，請確認擁有管理權限與 pages_show_list 權限"
            except Exception as e:
                return None, str(e)

        # 優先嘗試用傳入的 token 直接讀 page
        page_resp = fetch_page('id,name,category,instagram_business_account', access_token)

        # 若直接讀取失敗，嘗試把 user token 轉為 page token 再試
        page_token = None
        if page_resp.status_code != 200:
            page_token, token_err = find_page_token_with_user_token(access_token)
            if page_token:
                page_resp = fetch_page('id,name,category,instagram_business_account', page_token)

        if page_resp.status_code == 200:
            page_data = page_resp.json()
            logger.info(f"Page 驗證成功: {page_data.get('name')} ({page_id})")

            ig_account = page_data.get('instagram_business_account')
            if not ig_account:
                return {'success': False, 'error': f"Page '{page_data.get('name')}' 尚未連結 Instagram Business Account"}

            ig_account_id = ig_account.get('id')
            logger.info(f"找到 IG Business Account: {ig_account_id}")

            # 驗證 IG 發布能力，若先前已取得 page_token，優先使用它
            effective_token = page_token or access_token
            ig_validation = _validate_ig_publishing_capability(page_id, ig_account_id, effective_token)
            if not ig_validation['success']:
                return ig_validation

            return {
                'success': True,
                'page_id': page_id,
                'page_name': page_data.get('name'),
                'ig_account_id': ig_account_id,
                'ig_username': ig_validation.get('ig_username'),
                'message': 'Page ID 和 Instagram 連結驗證成功',
            }

        # 特例處理 400：避免把 Page ID 誤當 User ID
        if page_resp.status_code == 400:
            try:
                error_data = page_resp.json()
                error_message = error_data.get('error', {}).get('message', 'Unknown error')
            except Exception:
                error_message = page_resp.text

            if 'User' in error_message and 'nonexisting field' in error_message:
                return {'success': False, 'error': f'{page_id} 是 User ID，不是 Page ID。請提供 Facebook Page 的 ID'}
            return {'success': False, 'error': f'Page ID 無效或權限不足: {error_message}'}

        # 其他情況：回傳更具體的說明
        msg = f'無法訪問 Page ID {page_id}，HTTP {page_resp.status_code}: {page_resp.text[:200]}'
        if not page_token:
            msg += '。提示：請確認 Token 具備 pages_show_list 權限，且你是該 Page 管理員'
        return {'success': False, 'error': msg}

    except requests.RequestException as e:
        logger.error(f"Page 驗證請求失敗: {e}")
        return {'success': False, 'error': f'網路請求失敗: {str(e)}'}
    except Exception as e:
        logger.error(f"Page 驗證過程出錯: {e}")
        return {'success': False, 'error': f'驗證過程出錯: {str(e)}'}

def _validate_ig_publishing_capability(page_id: str, ig_account_id: str, access_token: str) -> dict:
    """驗證 Instagram 發布能力。
    若傳入為 User Token，會先嘗試取得 Page Token 再查 IG 資訊。
    """
    try:
        def get_page_token(token: str):
            # 先嘗試 /{page_id}?fields=access_token
            r = requests.get(
                f"https://graph.facebook.com/v23.0/{page_id}",
                params={'fields': 'access_token', 'access_token': token},
                timeout=10,
            )
            if r.status_code == 200 and r.json().get('access_token'):
                return r.json().get('access_token')
            # 退而求其次：用 /me/accounts 找到該 page 的 access_token
            r2 = requests.get(
                "https://graph.facebook.com/v23.0/me/accounts",
                params={'fields': 'id,name,access_token', 'access_token': token},
                timeout=10,
            )
            if r2.status_code == 200:
                for p in r2.json().get('data', []):
                    if str(p.get('id')) == str(page_id) and p.get('access_token'):
                        return p.get('access_token')
            return None

        page_token = get_page_token(access_token)
        if not page_token:
            return {'success': False, 'error': '無法取得 Page Token，請確認 Token 權限與你對該 Page 的管理權限'}

        # 用 Page Token 查 IG 帳號資訊
        ig_response = requests.get(
            f"https://graph.facebook.com/v23.0/{ig_account_id}",
            params={'fields': 'id,username,account_type,media_count', 'access_token': page_token},
            timeout=10,
        )

        if ig_response.status_code == 200:
            ig_data = ig_response.json()
            logger.info(f"IG 帳號驗證成功: @{ig_data.get('username')} ({ig_data.get('account_type')})")
            return {
                'success': True,
                'ig_username': ig_data.get('username'),
                'account_type': ig_data.get('account_type'),
                'media_count': ig_data.get('media_count', 0),
            }

        return {'success': False, 'error': f'無法訪問 Instagram 帳號 {ig_account_id}，可能是權限問題: {ig_response.text[:160]}'}

    except Exception as e:
        logger.error(f"IG 發布能力驗證失敗: {e}")
        return {'success': False, 'error': f'Instagram 驗證失敗: {str(e)}'}

@instagram_page_bp.route('/accounts/validate_page', methods=['POST'])
@jwt_required()
def validate_page_id():
    """驗證 Page ID 是否有效且可用於 IG 發布"""
    try:
        data = request.get_json()
        page_id = data.get('page_id')
        access_token = data.get('access_token')
        
        if not all([page_id, access_token]):
            return jsonify({
                'success': False,
                'error': '缺少必要參數: page_id, access_token'
            }), 400
        
        result = _validate_page_and_token(page_id, access_token)
        
        if result['success']:
            return jsonify({
                'success': True,
                'page_info': {
                    'page_id': result['page_id'],
                    'page_name': result['page_name'],
                    'ig_account_id': result['ig_account_id'],
                    'ig_username': result.get('ig_username'),
                    'can_publish': True
                },
                'message': result['message']
            })
        else:
            return jsonify({
                'success': False,
                'error': result['error']
            }), 400
            
    except Exception as e:
        logger.error(f"Page 驗證失敗: {e}")
        return jsonify({
            'success': False,
            'error': f'驗證過程出錯: {str(e)}'
        }), 500

@instagram_page_bp.route('/help/page_id', methods=['GET'])
def get_page_id_help():
    """提供如何找到 Page ID 的說明"""
    return jsonify({
        'success': True,
        'help': {
            'title': '如何找到 Facebook Page ID？',
            'methods': [
                {
                    'method': '方法1：Facebook Page 設定',
                    'steps': [
                        '1. 登入 Facebook，前往你的 Page',
                        '2. 點擊左側選單的「設定」',
                        '3. 在「Page 資訊」部分找到「Page ID」'
                    ]
                },
                {
                    'method': '方法2：使用 API',
                    'steps': [
                        '1. 使用你的 Token 呼叫 /me/accounts API',
                        '2. 找到你要管理的 Page',
                        '3. 複製對應的 id 欄位'
                    ]
                },
                {
                    'method': '方法3：從 URL 取得',
                    'steps': [
                        '1. 前往你的 Facebook Page',
                        '2. 查看 URL，格式通常是 facebook.com/your-page-name',
                        '3. 或查看頁面原始碼中的 Page ID'
                    ]
                }
            ],
            'notes': [
                '✅ Page ID 是純數字，通常 15-16 位數',
                '✅ 不是 User ID（個人用戶 ID）',
                '✅ 必須是你有管理權限的 Page',
                '✅ Page 必須已連結 Instagram Business Account'
            ]
        }
    })

# 註冊藍圖的函數
def register_instagram_page_routes(app):
    """註冊 Instagram Page 相關路由"""
    app.register_blueprint(instagram_page_bp)
    logger.info("Instagram Page 路由已註冊")
