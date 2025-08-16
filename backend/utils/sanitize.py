# backend/utils/sanitize.py
from __future__ import annotations
import bleach

# 允許的安全 HTML（如不需要可只保留純文字）
ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "br", "p", "ul", "ol", "li"]
ALLOWED_ATTRS = {}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

def clean_html(text: str) -> str:
    text = (text or "").strip()
    return bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
