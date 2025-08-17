from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError
from models import User, UserRole, School
from utils.db import get_db
from utils.security import hash_password, check_password

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@bp.route('/register', methods=['POST'])
def register():
    """用戶註冊"""
    data = request.get_json()
    if not data:
        return jsonify({"msg": "無效的資料格式"}), 400
    
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    school_slug = data.get('school_slug', '').strip()
    
    # 基本驗證
    if not username or not email or not password:
        return jsonify({"msg": "用戶名、Email 和密碼都是必填項"}), 400
    
    if len(password) < 6:
        return jsonify({"msg": "密碼長度至少 6 個字符"}), 400
    
    db = next(get_db())
    try:
        # 檢查學校是否存在
        school_id = None
        if school_slug:
            school = db.query(School).filter_by(slug=school_slug).first()
            if not school:
                return jsonify({"msg": f"學校代碼 '{school_slug}' 不存在"}), 400
            school_id = school.id
        
        # 創建新用戶
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role=UserRole.user,
            school_id=school_id
        )
        
        db.add(user)
        db.commit()
        
        return jsonify({"msg": "註冊成功"}), 201
        
    except IntegrityError:
        db.rollback()
        return jsonify({"msg": "用戶名或 Email 已存在"}), 409
    except Exception as e:
        db.rollback()
        return jsonify({"msg": f"註冊失敗: {str(e)}"}), 500
    finally:
        db.close()

@bp.route('/login', methods=['POST'])
def login():
    """用戶登入"""
    data = request.get_json()
    if not data:
        return jsonify({"msg": "無效的資料格式"}), 400
    
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not password:
        return jsonify({"msg": "密碼是必填項"}), 400
    
    if not username and not email:
        return jsonify({"msg": "用戶名或 Email 是必填項"}), 400
    
    db = next(get_db())
    try:
        # 查找用戶（支援 username 或 email）
        user = None
        if username:
            user = db.query(User).filter_by(username=username).first()
        elif email:
            user = db.query(User).filter_by(email=email).first()
            
        if not user or not check_password(password, user.password_hash):
            return jsonify({"msg": "用戶名/Email 或密碼錯誤"}), 401
        
        # 生成 JWT Token（使用 str(user.id) 作為 identity 以符合 JWT 規範）
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "role": user.role.value,
            "school_id": user.school_id
        }), 200
        
    except Exception as e:
        return jsonify({"msg": f"登入失敗: {str(e)}"}), 500
    finally:
        db.close()

@bp.route('/me', methods=['GET'])
@jwt_required()
def get_user_info():
    """獲取當前用戶資訊"""
    user_id_str = get_jwt_identity()
    
    db = next(get_db())
    try:
        # 將字串形式的 user_id 轉換回整數
        user_id = int(user_id_str)
        user = db.query(User).filter_by(id=user_id).first()
        if not user:
            return jsonify({"msg": "用戶不存在"}), 404
        
        return jsonify({
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "school_id": user.school_id,
            "created_at": user.created_at.isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({"msg": f"獲取用戶資訊失敗: {str(e)}"}), 500
    finally:
        db.close()
