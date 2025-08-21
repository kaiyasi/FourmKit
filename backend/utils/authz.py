from flask import abort
from flask_jwt_extended import get_jwt
from functools import wraps

def require_role(*roles: str):
    def wrap(fn):
        @wraps(fn)
        def inner(*a, **kw):
            claims = get_jwt() or {}
            if claims.get("role") not in roles:
                abort(403)
            return fn(*a, **kw)
        return inner
    return wrap
