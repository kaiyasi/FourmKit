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

def sanitize_html(text: str) -> str:
    """清理HTML內容的別名函數（向後兼容）"""
    return clean_html(text)

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

def html_to_plain_text(text: str) -> str:
    """將 HTML 內容轉換為純文字"""
    if not text:
        return ""
    
    try:
        # 嘗試使用 html2text（如果可用）
        import html2text
        h = html2text.HTML2Text()
        h.ignore_links = True
        h.ignore_images = True
        h.ignore_emphasis = True  # 忽略 * 和 _
        h.body_width = 0  # 不自動換行
        h.single_line_break = True  # 單行換行
        
        plain_text = h.handle(text)
        
        # 清理 Markdown 符號和多餘空白
        import re
        plain_text = re.sub(r'\*+', '', plain_text)  # 移除星號
        plain_text = re.sub(r'_+', '', plain_text)   # 移除底線
        plain_text = re.sub(r'\#+\s*', '', plain_text)  # 移除標題符號
        plain_text = re.sub(r'\s+', ' ', plain_text)  # 合併多個空白
        
        return plain_text.strip()
        
    except ImportError:
        # html2text 不可用時的備用方案
        import re
        
        # 移除所有 HTML 標籤
        plain_text = re.sub(r'<[^>]+>', '', text)
        
        # 處理常見的 HTML 實體
        html_entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&nbsp;': ' ',
            '&mdash;': '—',
            '&ndash;': '–',
            '&hellip;': '…'
        }
        
        for entity, char in html_entities.items():
            plain_text = plain_text.replace(entity, char)
        
        # 清理多餘的空白和換行
        plain_text = re.sub(r'\s+', ' ', plain_text).strip()
        
        return plain_text

def sanitize_content(text: str, content_type: str = "markdown") -> str:
    """根據內容類型進行適當的清理"""
    if content_type == "html":
        return clean_html(text)
    else:  # markdown 或 預設
        return clean_markdown(text)
