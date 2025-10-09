import re

# 粗驗 email 格式
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# 允許 edu / edu.tw 任意子網域，例如 nhsh.tp.edu.tw、dept.stanford.edu
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
