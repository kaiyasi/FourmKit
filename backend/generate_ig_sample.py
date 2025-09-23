#!/usr/bin/env python3
"""
直接生成IG圖片並上傳到CDN - 繞過JWT驗證
"""
import os
import sys
from datetime import datetime
from pathlib import Path

# 添加專案路徑
sys.path.insert(0, str(Path(__file__).parent))

def generate_ig_image():
    """直接生成IG圖片並上傳到CDN"""

    # 導入必要模組
    from services.unified_post_renderer import get_renderer

    # 準備內容
    content = {
        "id": "12345",
        "title": "ForumKit 校園動態分享",
        "text": "今天在校園裡舉辦了精彩的社團活動！\n\n看到同學們積極參與各種社團，從學術研究到才藝表演，每個人都展現出不同的熱情與才華。\n\n特別是程式設計社的成果展示，讓人印象深刻。同學們開發的專案不僅技術含量高，更展現了創新思維。\n\n期待下次活動能有更多同學參與！",
        "author": "王小明",
        "school_name": "範例大學",
        "created_at": datetime.now().isoformat()
    }

    # 完整的模板配置
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

    try:
        print("🎨 開始生成 Instagram 圖片...")
        print(f"📝 內容: {content['title']}")
        print(f"👤 作者: {content['author']}")
        print(f"🏫 學校: {content['school_name']}")
        print(f"📱 尺寸: {config['width']}x{config['height']}")

        # 獲取渲染器並生成圖片到記憶體
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

        # 直接保存到CDN目錄
        import tempfile
        from utils.cdn_uploader import publish_to_cdn

        filename = f"ig_demo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"

        # 創建臨時文件
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            temp_file.write(image_buffer.getvalue())
            temp_path = temp_file.name

        # 上傳到CDN
        cdn_url = publish_to_cdn(temp_path, subdir="social_media")

        # 清理臨時文件
        os.unlink(temp_path)

        result = {
            "success": bool(cdn_url),
            "filename": filename,
            "dimensions": {"width": 1080, "height": 1080},
            "file_size": len(image_buffer.getvalue()),
            "full_url": cdn_url or "上傳失敗",
            "file_path": f"CDN: {cdn_url}" if cdn_url else "上傳失敗"
        }

        if result.get("success"):
            print("\n✅ 圖片生成成功！")
            print("=" * 60)
            print(f"📄 檔案名稱: {result['filename']}")
            print(f"📐 圖片尺寸: {result['dimensions']['width']}x{result['dimensions']['height']}")
            print(f"💾 檔案大小: {result['file_size']:,} bytes")
            print(f"🌐 CDN URL: {result['full_url']}")
            print(f"📁 本地路徑: {result['file_path']}")
            print("=" * 60)
            print(f"\n🔗 可預覽的URL: {result['full_url']}")
            print(f"\n📋 此圖片可直接用於 Instagram API 發布")

            return result['full_url']
        else:
            print(f"❌ 生成失敗: {result.get('error', '未知錯誤')}")
            return None

    except Exception as e:
        print(f"💥 發生錯誤: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    url = generate_ig_image()
    if url:
        print(f"\n🎉 成功！圖片URL: {url}")
    else:
        print("\n😞 失敗了...")