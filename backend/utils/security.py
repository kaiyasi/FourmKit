import bcrypt
import os

_ROUNDS = int(os.getenv("PASSWORD_SALT_ROUNDS", "12"))

def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode()

def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
