"""
加密工具模組
提供數據加密和解密功能
"""

import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _get_encryption_key() -> bytes:
    """獲取加密金鑰"""
    secret_key = os.getenv('SECRET_KEY', 'default-secret-key-for-development')
    salt = b'forumkit_salt'  # 固定 salt，在生產環境中應該使用隨機 salt
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret_key.encode()))
    return key


def encrypt_data(data: str) -> str:
    """加密數據"""
    try:
        key = _get_encryption_key()
        f = Fernet(key)
        encrypted_data = f.encrypt(data.encode())
        return base64.urlsafe_b64encode(encrypted_data).decode()
    except Exception as e:
        # 如果加密失敗，返回原始數據（不安全的後備方案）
        print(f"加密失敗: {e}")
        return data


def decrypt_data(encrypted_data: str) -> str:
    """解密數據"""
    try:
        key = _get_encryption_key()
        f = Fernet(key)
        decoded_data = base64.urlsafe_b64decode(encrypted_data.encode())
        decrypted_data = f.decrypt(decoded_data)
        return decrypted_data.decode()
    except Exception as e:
        # 如果解密失敗，返回原始數據
        print(f"解密失敗: {e}")
        return encrypted_data
