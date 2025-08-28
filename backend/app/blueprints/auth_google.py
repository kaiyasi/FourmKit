import json
import re
from flask import Blueprint, request, jsonify, session, redirect, url_for
from utils.email_rules import is_valid_email_format, is_allowed_edu_email, extract_domain

bp = Blueprint('auth_google', __name__)

@bp.route('/api/auth/google-register', methods=['POST'])
def google_register():
    data = request.get_json(force=True)
    email = data.get('email', '').strip().lower()
    username = data.get('username', '').strip()
    # 其他欄位可根據需求擴充

    # 驗證 email 格式
    if not is_valid_email_format(email):
        return jsonify({'error': 'EMAIL_FORMAT_INVALID'}), 400
    # 驗證 edu 域名
    if not is_allowed_edu_email(email):
        return jsonify({'error': 'EMAIL_DOMAIN_INVALID'}), 400
    # 驗證 username
    if not username or len(username) < 3:
        return jsonify({'error': 'USERNAME_INVALID'}), 400
    # TODO: 檢查 username/email 是否已存在
    # TODO: 建立新使用者，儲存 Google OAuth 資訊
    # TODO: 產生 JWT 或 session
    return jsonify({'success': True, 'email': email, 'username': username})

# 其他 Google OAuth 相關路由可在此擴充
