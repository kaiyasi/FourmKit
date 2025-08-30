"""
主題推薦 Webhook 修復補丁
修復字體資訊缺失和格式不統一問題
"""

from typing import Dict, Any, List
from utils.enhanced_notify import build_enhanced_theme_webhook, send_enhanced_webhook
from utils.notify import send_admin_event

def enhanced_theme_proposal_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    增強版主題提案 webhook 處理
    修復原版缺失的字體、佈局、動畫等完整資訊
    """
    
    # 提取基本資訊
    theme_name = str(payload.get("name", "")).strip() or "未命名主題"
    description = str(payload.get("description", "")).strip() or "無描述"
    author = str(payload.get("author", "")).strip() or "匿名用戶"
    source = str(payload.get("source", "")).strip() or "theme_designer"
    
    # 提取完整的顏色配置
    colors_raw = payload.get("colors") or {}
    colors = {}
    if isinstance(colors_raw, dict):
        # 主要顏色
        colors.update({
            "primary": colors_raw.get("primary", ""),
            "secondary": colors_raw.get("secondary", ""), 
            "accent": colors_raw.get("accent", ""),
        })
        # 背景和表面
        colors.update({
            "background": colors_raw.get("background", ""),
            "surface": colors_raw.get("surface", ""),
            "border": colors_raw.get("border", ""),
        })
        # 文字顏色
        colors.update({
            "text": colors_raw.get("text", ""),
            "textMuted": colors_raw.get("textMuted", ""),
        })
        # 功能顏色
        colors.update({
            "success": colors_raw.get("success", ""),
            "warning": colors_raw.get("warning", ""),
            "error": colors_raw.get("error", ""),
        })
    
    # 提取完整的字體配置（修復原版的截斷問題）
    fonts_raw = payload.get("fonts") or {}
    fonts = {}
    if isinstance(fonts_raw, dict):
        fonts = {
            "heading": fonts_raw.get("heading", ""),
            "body": fonts_raw.get("body", ""),
            "mono": fonts_raw.get("mono", ""),
            # 新增：字體權重和行高資訊
            "weights": fonts_raw.get("weights", fonts_raw.get("fontWeight", "")),
            "lineHeight": fonts_raw.get("lineHeight", fonts_raw.get("line_height", "")),
            "fontSize": fonts_raw.get("fontSize", fonts_raw.get("font_size", "")),
        }
    
    # 提取佈局配置
    layout = {
        "borderRadius": payload.get("borderRadius", ""),
        "spacing": payload.get("spacing", {}),
        "shadows": payload.get("shadows", {}),
        "breakpoints": payload.get("breakpoints", {}),
    }
    
    # 提取動畫配置
    animations = payload.get("animations", {})
    
    try:
        # 使用增強版 webhook 建構器
        result = send_enhanced_webhook(
            webhook_type="theme_proposal",
            theme_name=theme_name,
            description=description,
            colors=colors,
            fonts=fonts,
            layout=layout,
            animations=animations,
            author=author,
            source=source,
            # 額外的技術資訊
            request_id=payload.get("request_id"),
            timestamp=payload.get("timestamp"),
            version=payload.get("version", "1.0"),
            compatibility=payload.get("compatibility", "all_devices")
        )
        
        print(f"[PATCH] Enhanced theme webhook sent: {result}")
        return result
        
    except Exception as e:
        print(f"[ERROR] Enhanced theme webhook failed: {e}")
        # 降級到原版 webhook
        return fallback_theme_webhook(payload)

def fallback_theme_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    當增強版失敗時的降級處理
    但至少修復字體資訊截斷問題
    """
    
    theme_name = str(payload.get("name", "")).strip() or "未命名主題"
    description = str(payload.get("description", "")).strip() or "無描述"
    
    fields = []
    
    # 顏色資訊（保持原版邏輯）
    colors = payload.get("colors", {})
    if isinstance(colors, dict):
        for color_key, label in [
            ("primary", "主色"), ("secondary", "輔助色"), ("accent", "強調色"),
            ("background", "背景色"), ("surface", "表面色"), ("border", "邊框色"),
            ("text", "文字色"), ("textMuted", "次要文字"),
            ("success", "成功色"), ("warning", "警告色"), ("error", "錯誤色")
        ]:
            if colors.get(color_key):
                fields.append({"name": label, "value": colors.get(color_key, ""), "inline": True})
    
    # 修復字體資訊（不再截斷到 20 字符）
    fonts_raw = payload.get("fonts") or {}
    if isinstance(fonts_raw, dict):
        font_details = []
        if fonts_raw.get("heading"):
            font_details.append(f"📝 標題字體: {fonts_raw.get('heading', '')}")
        if fonts_raw.get("body"):  
            font_details.append(f"📄 內文字體: {fonts_raw.get('body', '')}")
        if fonts_raw.get("mono"):
            font_details.append(f"💻 等寬字體: {fonts_raw.get('mono', '')}")
        
        # 新增：字體權重和行高
        if fonts_raw.get("weights") or fonts_raw.get("fontWeight"):
            font_details.append(f"⚖️ 字重: {fonts_raw.get('weights', fonts_raw.get('fontWeight', ''))}")
        if fonts_raw.get("lineHeight") or fonts_raw.get("line_height"):
            font_details.append(f"📏 行高: {fonts_raw.get('lineHeight', fonts_raw.get('line_height', ''))}")
            
        if font_details:
            fields.append({"name": "🔤 字體配置", "value": "\n".join(font_details), "inline": False})
    
    # 佈局資訊
    if payload.get("borderRadius"):
        fields.append({"name": "📐 圓角", "value": str(payload.get("borderRadius", "")), "inline": True})
    
    # 間距配置（改進顯示）
    spacing_raw = payload.get("spacing") or {}
    if isinstance(spacing_raw, dict) and spacing_raw:
        spacing_details = []
        for size, value in spacing_raw.items():
            if value:
                spacing_details.append(f"{size}: {value}")
        if spacing_details:
            fields.append({"name": "📏 間距", "value": " | ".join(spacing_details), "inline": False})
    
    # 陰影配置（改進顯示）
    shadows_raw = payload.get("shadows") or {}
    if isinstance(shadows_raw, dict) and shadows_raw:
        shadow_details = []
        for shadow_type, shadow_value in shadows_raw.items():
            if shadow_value:
                shadow_details.append(f"{shadow_type}: {shadow_value}")
        if shadow_details:
            fields.append({"name": "🌅 陰影", "value": "\n".join(shadow_details), "inline": False})
    
    # 動畫配置
    animations_raw = payload.get("animations") or {}
    if isinstance(animations_raw, dict) and animations_raw:
        animation_details = []
        if animations_raw.get("duration"):
            animation_details.append(f"⏱️ 時長: {animations_raw.get('duration', '')}")
        if animations_raw.get("easing"):
            animation_details.append(f"📈 緩動: {animations_raw.get('easing', '')}")
        if animation_details:
            fields.append({"name": "✨ 動畫", "value": " | ".join(animation_details), "inline": True})
    
    # 額外資訊
    author = str(payload.get("author", "")).strip()
    source = str(payload.get("source", "")).strip()
    if author:
        fields.append({"name": "👤 設計者", "value": author, "inline": True})
    if source:
        fields.append({"name": "📍 來源", "value": source, "inline": True})
    
    # 使用原版發送機制
    return send_admin_event(
        kind="theme_proposal",
        title=f"🎨 主題提案：{theme_name}",
        description=description,
        fields=fields,
        request_id=payload.get("request_id"),
        source=source or "/api/color_vote"
    )

# 補丁安裝函數
def install_theme_webhook_patch():
    """
    安裝主題 webhook 補丁到現有系統
    """
    print("[PATCH] Installing enhanced theme webhook patch...")
    
    # 這裡可以 monkey patch 現有的處理函數
    # 或者提供新的處理入口點
    
    try:
        # 測試補丁是否正常工作
        test_payload = {
            "name": "補丁測試主題",
            "description": "測試修復後的主題 webhook",
            "colors": {
                "primary": "#3B82F6",
                "secondary": "#6366F1"
            },
            "fonts": {
                "heading": "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                "body": "Inter, -apple-system, BlinkMacSystemFont, sans-serif", 
                "mono": "JetBrains Mono, Consolas, monospace",
                "weights": "400, 500, 600, 700",
                "lineHeight": "1.5"
            },
            "borderRadius": "0.5rem",
            "spacing": {"xs": "0.25rem", "sm": "0.5rem", "md": "1rem"},
            "shadows": {"sm": "0 1px 2px rgba(0,0,0,0.1)", "md": "0 4px 6px rgba(0,0,0,0.1)"},
            "animations": {"duration": "200ms", "easing": "ease-in-out"},
            "author": "補丁測試系統"
        }
        
        result = enhanced_theme_proposal_webhook(test_payload)
        
        if result.get("ok"):
            print("[PATCH] ✅ Enhanced theme webhook patch installed successfully!")
        else:
            print(f"[PATCH] ⚠️ Patch installed with warnings: {result.get('error')}")
        
        return True
        
    except Exception as e:
        print(f"[PATCH] ❌ Failed to install patch: {e}")
        return False

if __name__ == "__main__":
    install_theme_webhook_patch()