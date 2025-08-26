# backend/utils/sanitize.py
from __future__ import annotations
import bleach
import re

# 允許的安全 HTML（如不需要可只保留純文字）
ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "br", "p", "ul", "ol", "li"]
ALLOWED_ATTRS = {}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

def clean_html(text: str) -> str:
    """清理HTML內容，保留安全的標籤"""
    text = (text or "").strip()
    return bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )

def clean_markdown(text: str) -> str:
    """清理Markdown內容，保留Markdown語法但清理危險內容"""
    text = (text or "").strip()
    
    # 先清理明顯的HTML標籤（保留Markdown語法）
    # 移除script、style等危險標籤
    dangerous_tags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button']
    for tag in dangerous_tags:
        text = re.sub(rf'<{tag}[^>]*>.*?</{tag}>', '', text, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(rf'<{tag}[^>]*/?>', '', text, flags=re.IGNORECASE)
    
    # 移除on*事件屬性
    text = re.sub(r'\s+on\w+\s*=\s*["\'][^"\']*["\']', '', text, flags=re.IGNORECASE)
    
    # 移除javascript:協議
    text = re.sub(r'javascript:', '', text, flags=re.IGNORECASE)
    
    # 移除data:協議（除了常見的圖片格式）
    text = re.sub(r'data:(?!image/(png|jpeg|gif|webp|svg\+xml))[^;]*;base64,', '', text, flags=re.IGNORECASE)
    
    return text

def sanitize_content(text: str, content_type: str = "markdown") -> str:
    """根據內容類型進行適當的清理"""
    if content_type == "html":
        return clean_html(text)
    else:  # markdown 或 預設
        return clean_markdown(text)
