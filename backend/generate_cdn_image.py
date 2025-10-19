#!/usr/bin/env python3
"""
CDN 圖片生成器 - 直接生成並上傳到 CDN 的圖片
"""
import sys
import os
from datetime import datetime

# 添加當前目錄到 Python 路徑
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.unified_post_renderer import get_renderer

def generate_cdn_image(content_data, config_override=None):
    """
    生成圖片並上傳到 CDN

    Args:
        content_data: 內容數據字典
        config_override: 可選的配置覆蓋

    Returns:
        dict: 包含 CDN URL 和其他信息的結果
    """
    # 設定 CDN 環境變數
    os.environ.setdefault('PUBLIC_CDN_URL', 'https://cdn.serelix.xyz')

    # 預設配置
    default_config = {
        'width': 1080,
        'height': 1080,
        'background_color': '#ffffff',
        'primary_color': '#333333',
        'font_size_content': 28,
        'padding': 60,

        # 時間戳配置
        'timestamp_enabled': True,
        'timestamp_position': 'bottom-left',
        'timestamp_color': '#666666',
        'timestamp_size': 18,

        # 貼文ID配置
        'post_id_enabled': True,
        'post_id_format': '#{ID}',
        'post_id_position': 'bottom-right',
        'post_id_color': '#666666',
        'post_id_size': 18
    }

    # 合併配置
    if config_override:
        default_config.update(config_override)

    # 生成圖片
    renderer = get_renderer()
    result = renderer.save_image(
        content=content_data,
        size='instagram_square',
        template='modern',
        config=default_config,
        purpose='publish'
    )

    return result

if __name__ == "__main__":
    # 測試用例
    test_content = {
        'id': '67890',
        'title': '測試貼文',
        'text': '這是一個測試貼文，包含完整的時間戳和貼文ID顯示功能。',
        'author': '測試用戶',
        'school_name': '測試學校',
        'created_at': datetime.now()
    }

    print("正在生成 CDN 圖片...")
    try:
        result = generate_cdn_image(test_content)
        print(f"✅ 成功生成圖片!")
        print(f"CDN URL: {result['full_url']}")
        print(f"檔案名稱: {result['filename']}")
        print(f"檔案大小: {result['file_size']} bytes")
        print(f"尺寸: {result['dimensions']['width']}x{result['dimensions']['height']}")

    except Exception as e:
        print(f"❌ 錯誤: {e}")
        import traceback
        traceback.print_exc()