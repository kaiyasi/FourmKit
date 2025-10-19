"""
Module: backend/utils/email_rules.py
Unified comment style: module docstring + minimal inline notes.
"""
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

ALLOWED_SUFFIX_RE = re.compile(r"(?i)@([a-z0-9-]+\.)*(edu(\.tw)?)$")

def normalize_email(email: str) -> str:
    return (email or "").strip().lower()

def is_valid_email_format(email: str) -> bool:
    return bool(EMAIL_RE.match(normalize_email(email)))

def is_allowed_edu_email(email: str) -> bool:
    e = normalize_email(email)
    if not EMAIL_RE.match(e):
        return False
    return bool(ALLOWED_SUFFIX_RE.search(e))

def extract_domain(email: str) -> str:
    return normalize_email(email).split("@", 1)[1] if "@" in normalize_email(email) else ""
