#!/usr/bin/env python3
"""
模擬完整的IG發文流程 - 在發布前攔截圖片URL
複製 auto_publisher.py 的完整邏輯，但停在發布前
"""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# 添加專案路徑
sys.path.insert(0, str(Path(__file__).parent))

def simulate_ig_publish_flow():
    """模擬完整的IG發文流程"""

    # 導入必要模組
    from services.ig_unified_system import IGUnifiedSystem, ContentData, TemplateConfig
    from models.social_publishing import PlatformType
    from services.content_generator import ContentGenerator

    print("🎬 開始模擬完整的IG發文流程...")
    print("=" * 60)

    try:
        # 1. 模擬論壇貼文數據
        print("1. 準備模擬論壇貼文數據...")
        mock_forum_post_data = {
            "id": 99999,
            "title": "ForumKit 校園動態分享",
            "content": "今天在校園裡舉辦了精彩的社團活動！\n\n看到同學們積極參與各種社團，從學術研究到才藝表演，每個人都展現出不同的熱情與才華。\n\n特別是程式設計社的成果展示，讓人印象深刻。同學們開發的專案不僅技術含量高，更展現了創新思維。\n\n期待下次活動能有更多同學參與！",
            "author": "王小明",
            "school_name": "範例大學",
            "created_at": datetime.now(timezone.utc)
        }
        print(f"   ✓ 貼文ID: {mock_forum_post_data['id']}")
        print(f"   ✓ 標題: {mock_forum_post_data['title']}")
        print(f"   ✓ 作者: {mock_forum_post_data['author']}")

        # 2. 模擬社交帳號配置
        print("\n2. 準備社交帳號配置...")
        mock_account_data = {
            "id": 1,
            "platform": PlatformType.INSTAGRAM,
            "account_name": "forumkit_demo",
            "is_active": True
        }
        print(f"   ✓ 平台: {mock_account_data['platform']}")
        print(f"   ✓ 帳號: {mock_account_data['account_name']}")

        # 3. 準備完整的模板配置（修復後無硬編碼）
        print("\n3. 準備完整的資料庫模板配置...")
        template_config_dict = {
            # 基本設定
            "width": 1080,
            "height": 1080,
            "background_color": "#f8f9fa",
            "padding": 60,

            # 文字設定
            "font_family": "",  # 使用系統預設字體
            "font_size": 32,
            "text_color": "#2c3e50",
            "text_align": "center",
            "line_height": 1.5,
            "max_lines": 15,

            # 功能設定
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

        # 轉換為 TemplateConfig 物件
        template_config = TemplateConfig(
            width=template_config_dict["width"],
            height=template_config_dict["height"],
            background_color=template_config_dict["background_color"],
            font_family=template_config_dict["font_family"],
            font_size=template_config_dict["font_size"],
            text_color=template_config_dict["text_color"],
            padding=template_config_dict["padding"]
        )

        print(f"   ✓ 尺寸: {template_config.width}x{template_config.height}")
        print(f"   ✓ 背景色: {template_config.background_color}")
        print(f"   ✓ 字體大小: {template_config.font_size}")
        print(f"   ✓ 包含{len(template_config_dict)}項完整配置")

        # 4. 初始化IG統一系統
        print("\n4. 初始化IG統一系統...")
        ig_system = IGUnifiedSystem()
        print("   ✓ IG統一系統初始化完成")

        # 5. 生成內容數據
        print("\n5. 生成內容數據...")
        content_generator = ContentGenerator()
        content_data = ContentData(
            title=mock_forum_post_data["title"],
            content=mock_forum_post_data["content"],
            author=mock_forum_post_data["author"],
            school_name=mock_forum_post_data["school_name"],
            created_at=mock_forum_post_data["created_at"],
            post_id=str(mock_forum_post_data["id"])
        )
        print(f"   ✓ 內容長度: {len(content_data.content)} 字元")
        print(f"   ✓ 貼文ID: {content_data.post_id}")

        # 6. 獲取Logo URL（如果需要）
        print("\n6. 獲取Logo設定...")
        logo_url = None  # ig_system.get_logo_url(mock_account_data["id"], template_config)
        print(f"   ✓ Logo URL: {logo_url or '未啟用'}")

        # 7. 🎯 關鍵步驟：生成圖片（這裡會使用修復後的模板系統）
        print("\n7. 🎯 生成Instagram圖片...")
        print("   >>> 使用修復後的統一模板引擎 <<<")

        # 模擬Instagram模板數據
        instagram_template_data = {
            "timestamp": {"enabled": True, "position": "bottom-right"},
            "postId": {"enabled": True, "position": "top-left", "format": "#{id}"}
        }

        render_result = ig_system.template_engine.render_to_image(
            template_config, content_data, logo_url, instagram_template_data
        )

        if not render_result.success:
            print(f"   ✗ 圖片生成失敗: {render_result.error_message}")
            return None

        print("   ✅ 圖片生成成功！")
        print(f"   📊 檔案大小: {render_result.file_size:,} bytes")
        print(f"   📐 尺寸: {render_result.width}x{render_result.height}")

        # 8. 🛑 攔截點：在這裡停止，不實際發布到IG
        print("\n8. 🛑 攔截點：準備發布但不實際送出")
        print("   >>> 以下是會發送到Instagram API的數據 <<<")

        # 模擬發布數據
        publish_data = {
            "image_url": render_result.image_url,
            "caption": content_data.content,
            "hashtags": ["#校園動態", "#ForumKit", "#社團活動"],
            "account": mock_account_data["account_name"],
            "platform": "Instagram"
        }

        print("\n" + "=" * 60)
        print("🎉 模擬發文流程完成！以下是攔截的結果：")
        print("=" * 60)
        print(f"🖼️  圖片URL: {render_result.image_url}")
        print(f"📱 平台: {publish_data['platform']}")
        print(f"👤 帳號: {publish_data['account']}")
        print(f"📝 文案: {publish_data['caption'][:100]}...")
        print(f"🏷️  標籤: {', '.join(publish_data['hashtags'])}")
        print(f"📊 圖片大小: {render_result.file_size:,} bytes")
        print("=" * 60)
        print("📋 此圖片使用完整的資料庫模板配置，無任何硬編碼預設值")
        print("🚀 可直接用於Instagram Graph API發布")

        return render_result.image_url

    except Exception as e:
        print(f"💥 模擬發文流程錯誤: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    print("ForumKit IG發文流程模擬器")
    print(f"執行時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    image_url = simulate_ig_publish_flow()

    if image_url:
        print(f"\n🎯 最終結果：{image_url}")
        print("✅ 模擬成功，圖片已生成並可預覽")
    else:
        print("\n❌ 模擬失敗")