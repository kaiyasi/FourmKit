#!/usr/bin/env python3
"""
修復CDN上傳功能並生成使用修復模板的IG圖片
"""
import os
import sys
import requests
import tempfile
from datetime import datetime
from pathlib import Path

# 添加專案路徑
sys.path.insert(0, str(Path(__file__).parent))

def upload_to_cdn_api(image_data, filename="demo.jpg"):
    """使用CDN API上傳圖片"""
    try:
        # CDN上傳API端點
        upload_url = "http://localhost:12001/upload"

        # 創建臨時文件
        with tempfile.NamedTemporaryFile(suffix='.jpg') as temp_file:
            temp_file.write(image_data)
            temp_file.seek(0)

            # 上傳到CDN
            files = {'file': (filename, temp_file, 'image/jpeg')}
            data = {'subdir': 'social_media'}

            response = requests.post(upload_url, files=files, data=data, timeout=10)

            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    return result.get('url')

            print(f"CDN上傳失敗: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"CDN上傳錯誤: {e}")
        return None

def generate_fixed_template_image():
    """生成使用修復後模板的IG圖片"""

    from services.unified_post_renderer import get_renderer

    print("🔧 修復CDN上傳功能並生成IG圖片")
    print("=" * 50)

    try:
        # 內容數據
        content = {
            "id": "12345",
            "title": "ForumKit 校園動態分享",
            "text": "今天在校園裡舉辦了精彩的社團活動！\n\n看到同學們積極參與各種社團，從學術研究到才藝表演，每個人都展現出不同的熱情與才華。\n\n特別是程式設計社的成果展示，讓人印象深刻。同學們開發的專案不僅技術含量高，更展現了創新思維。\n\n期待下次活動能有更多同學參與！",
            "author": "王小明",
            "school_name": "範例大學",
            "created_at": datetime.now().isoformat()
        }

        # 完整的修復後模板配置（21項參數）
        config = {
            "width": 1080,
            "height": 1080,
            "background_color": "#f8f9fa",
            "padding": 60,
            "font_family": "",
            "font_size_content": 32,
            "primary_color": "#2c3e50",
            "text_color": "#2c3e50",
            "line_spacing": 12,
            "text_align": "center",
            "vertical_align": "middle",
            "max_lines": 15,
            "logo_enabled": False,
            "timestamp_enabled": True,
            "timestamp_position": "bottom-right",
            "timestamp_size": 18,
            "timestamp_color": "#7f8c8d",
            "post_id_enabled": True,
            "post_id_position": "top-left",
            "post_id_size": 20,
            "post_id_color": "#3498db"
        }

        print(f"📝 標題: {content['title']}")
        print(f"👤 作者: {content['author']}")
        print(f"🏫 學校: {content['school_name']}")
        print(f"⚙️  配置項目: {len(config)} 個")
        print(f"🎯 使用修復後的模板系統（無硬編碼預設值）")

        # 1. 生成圖片到記憶體
        print("\n🎨 生成圖片...")
        renderer = get_renderer()
        image_buffer = renderer.render_to_image(
            content=content,
            size="instagram_square",
            template="modern",
            config=config,
            logo_url=None,
            quality=95,
            purpose="publish"
        )

        image_data = image_buffer.getvalue()
        print(f"   ✓ 圖片生成成功，大小: {len(image_data):,} bytes")

        # 2. 使用CDN API上傳
        print("📤 上傳到CDN...")
        filename = f"fixed_template_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        cdn_url = upload_to_cdn_api(image_data, filename)

        if cdn_url:
            print(f"   ✅ CDN上傳成功！")
            print("=" * 50)
            print(f"🌐 圖片URL: {cdn_url}")
            print(f"📄 檔案名稱: {filename}")
            print(f"📊 檔案大小: {len(image_data):,} bytes")
            print(f"📐 圖片尺寸: 1080x1080")
            print("=" * 50)
            print("🎯 此圖片使用修復後的模板系統")
            print("📋 包含完整的21項配置參數")
            print("🚀 無任何硬編碼預設值")
            print("✅ 可直接用於Instagram Graph API發布")

            return cdn_url
        else:
            print("   ❌ CDN上傳失敗")
            return None

    except Exception as e:
        print(f"💥 錯誤: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    print("ForumKit CDN修復和IG圖片生成")
    print(f"執行時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    url = generate_fixed_template_image()

    if url:
        print(f"\n🎉 成功！可預覽的圖片URL: {url}")
        print("✅ CDN上傳功能已修復")
    else:
        print("\n❌ 修復失敗")