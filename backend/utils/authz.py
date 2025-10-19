"""
Module: backend/utils/authz.py
Unified comment style: module docstring + minimal inline notes.
"""
from flask import abort, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from functools import wraps

def require_role(*roles: str):
    def wrap(fn):
        @wraps(fn)
        def inner(*a, **kw):
            verify_jwt_in_request()
            claims = get_jwt() or {}
            
            if claims.get("role") not in roles:
                try:
                    from utils.admin_events import log_system_event
                    role = claims.get('role') or 'guest'
                    uid = claims.get('sub')
                    desc = f"actor={uid} role={role} path={request.path} method={request.method} allow={roles}"
                    log_system_event(
                        event_type="suspicious_activity",
                        title="未授權權限嘗試",
                        description=desc,
                        severity="high",
                    )
                except Exception:
                    pass
                abort(403)
            return fn(*a, **kw)
        return inner
    return wrap
