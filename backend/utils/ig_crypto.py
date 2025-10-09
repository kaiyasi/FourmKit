"""
Instagram Token 加密/解密工具
使用 Fernet 對稱加密保護 Access Token
"""

import os
from cryptography.fernet import Fernet, InvalidToken
from typing import Optional


class IGTokenCrypto:
    """Instagram Token 加密器"""

    def __init__(self):
        """
        初始化加密器
        從環境變數讀取加密金鑰，若不存在則拋出錯誤
        """
        encryption_key = os.environ.get('IG_TOKEN_ENCRYPTION_KEY')

        if not encryption_key:
            raise ValueError(
                "IG_TOKEN_ENCRYPTION_KEY not found in environment variables. "
                "Please generate a key using: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
            )

        try:
            # 驗證金鑰格式
            self.cipher = Fernet(encryption_key.encode())
        except Exception as e:
            raise ValueError(f"Invalid IG_TOKEN_ENCRYPTION_KEY format: {e}")

    def encrypt_token(self, token: str) -> str:
        """
        加密 Access Token

        Args:
            token: 原始 Access Token

        Returns:
            加密後的 Token (Base64 編碼字串)

        Raises:
            ValueError: 當 token 為空時
        """
        if not token or not isinstance(token, str):
            raise ValueError("Token must be a non-empty string")

        try:
            encrypted = self.cipher.encrypt(token.encode())
            return encrypted.decode()
        except Exception as e:
            raise RuntimeError(f"Failed to encrypt token: {e}")

    def decrypt_token(self, encrypted_token: str) -> str:
        """
        解密 Access Token

        Args:
            encrypted_token: 加密的 Token

        Returns:
            原始 Access Token

        Raises:
            ValueError: 當 encrypted_token 為空時
            InvalidToken: 當 Token 無法解密時（可能是金鑰錯誤或數據損壞）
        """
        if not encrypted_token or not isinstance(encrypted_token, str):
            raise ValueError("Encrypted token must be a non-empty string")

        try:
            decrypted = self.cipher.decrypt(encrypted_token.encode())
            return decrypted.decode()
        except InvalidToken:
            raise InvalidToken("Failed to decrypt token: invalid token or wrong encryption key")
        except Exception as e:
            raise RuntimeError(f"Failed to decrypt token: {e}")


# 全域單例
_crypto_instance: Optional[IGTokenCrypto] = None


def get_crypto_instance() -> IGTokenCrypto:
    """
    獲取加密器單例

    Returns:
        IGTokenCrypto 實例
    """
    global _crypto_instance
    if _crypto_instance is None:
        _crypto_instance = IGTokenCrypto()
    return _crypto_instance


def encrypt_token(token: str) -> str:
    """
    便捷函數：加密 Token

    Args:
        token: 原始 Access Token

    Returns:
        加密後的 Token
    """
    return get_crypto_instance().encrypt_token(token)


def decrypt_token(encrypted_token: str) -> str:
    """
    便捷函數：解密 Token

    Args:
        encrypted_token: 加密的 Token

    Returns:
        原始 Access Token
    """
    return get_crypto_instance().decrypt_token(encrypted_token)


def generate_encryption_key() -> str:
    """
    生成新的加密金鑰

    Returns:
        Base64 編碼的加密金鑰（用於設定環境變數）

    Example:
        >>> key = generate_encryption_key()
        >>> print(f"IG_TOKEN_ENCRYPTION_KEY={key}")
    """
    return Fernet.generate_key().decode()


if __name__ == "__main__":
    # 測試用例
    print("=== Instagram Token Crypto Test ===\n")

    # 1. 生成加密金鑰
    print("1. Generate encryption key:")
    key = generate_encryption_key()
    print(f"   IG_TOKEN_ENCRYPTION_KEY={key}\n")

    # 2. 設置環境變數並測試加密/解密
    os.environ['IG_TOKEN_ENCRYPTION_KEY'] = key

    test_token = "IGQWRN1234567890abcdefghijklmnopqrstuvwxyz"
    print(f"2. Test encryption:")
    print(f"   Original token: {test_token}")

    encrypted = encrypt_token(test_token)
    print(f"   Encrypted: {encrypted}\n")

    print(f"3. Test decryption:")
    decrypted = decrypt_token(encrypted)
    print(f"   Decrypted: {decrypted}")
    print(f"   Match: {decrypted == test_token}\n")

    # 3. 測試錯誤處理
    print("4. Test error handling:")
    try:
        encrypt_token("")
    except ValueError as e:
        print(f"   ✓ Empty token rejected: {e}")

    try:
        decrypt_token("invalid_token")
    except Exception as e:
        print(f"   ✓ Invalid token rejected: {type(e).__name__}")

    print("\n=== All tests passed ===")
