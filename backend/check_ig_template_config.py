#!/usr/bin/env python3
"""
檢查IG模板配置中的時間戳格式設定
"""
import sys
import os
from pathlib import Path
import json

# 添加專案路徑
sys.path.insert(0, str(Path(__file__).parent))

def check_ig_template_timestamp_config():
    """檢查IG模板的時間戳配置"""

    try:
        from models.instagram import IGTemplate
        from utils.db_multi import get_core_session

        print("🔍 檢查IG模板中的時間戳格式配置")
        print("=" * 50)

        db = get_core_session()
        templates = db.query(IGTemplate).all()

        print(f"📊 找到 {len(templates)} 個IG模板")

        for template in templates:
            print(f"\n📋 模板 ID: {template.id}")
            print(f"📝 模板名稱: {template.name}")
            print(f"🎯 模板類型: {template.template_type}")

            if template.config:
                try:
                    config = template.config
                    print(f"⚙️  配置鍵數量: {len(config)} 個")

                    # 檢查圖片配置中的時間戳設定
                    if 'image' in config:
                        image_config = config['image']

                        # 檢查時間戳相關配置
                        timestamp_configs = []

                        # 檢查頂層時間戳配置
                        if 'timestamp' in image_config:
                            ts_config = image_config['timestamp']
                            if isinstance(ts_config, dict):
                                timestamp_configs.append(('image.timestamp', ts_config))

                        # 檢查cards結構中的時間戳配置
                        if 'cards' in image_config and isinstance(image_config['cards'], dict):
                            cards = image_config['cards']
                            if 'timestamp' in cards:
                                ts_config = cards['timestamp']
                                if isinstance(ts_config, dict):
                                    timestamp_configs.append(('image.cards.timestamp', ts_config))

                        # 顯示時間戳配置
                        if timestamp_configs:
                            print("🕒 時間戳配置:")
                            for location, ts_config in timestamp_configs:
                                print(f"  📍 位置: {location}")
                                print(f"    ✅ 啟用: {ts_config.get('enabled', 'N/A')}")
                                print(f"    📋 格式: {ts_config.get('format', 'N/A')}")
                                print(f"    📋 格式2: {ts_config.get('timestampFormat', 'N/A')}")
                                print(f"    📍 位置: {ts_config.get('position', 'N/A')}")
                                if 'style' in ts_config:
                                    style = ts_config['style']
                                    print(f"    🎨 樣式: 大小={style.get('size', 'N/A')}, 顏色={style.get('color', 'N/A')}")
                        else:
                            print("❌ 沒有找到時間戳配置")
                    else:
                        print("❌ 沒有找到image配置")

                except Exception as e:
                    print(f"❌ 解析配置失敗: {e}")
            else:
                print("❌ 模板沒有配置")

            print("-" * 30)

        db.close()

    except Exception as e:
        print(f"💥 檢查失敗: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("ForumKit IG模板時間戳配置檢查")
    print(f"執行時間: {os.popen('date').read().strip()}")

    check_ig_template_timestamp_config()