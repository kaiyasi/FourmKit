#!/usr/bin/env python3
"""
修復IG發布時間戳格式問題
"""
import sys
from pathlib import Path

# 添加專案路徑
sys.path.insert(0, str(Path(__file__).parent))

def fix_timestamp_format_in_templates():
    """修復IGTemplate中的時間戳格式設定"""

    print("🔧 修復IG模板時間戳格式")
    print("=" * 50)

    # 方案1：創建一個測試配置，強制使用相對時間格式
    test_config = {
        'image': {
            'cards': {
                'timestamp': {
                    'enabled': True,
                    'format': 'relative',  # 改為相對時間
                    'position': 'bottom-right',
                    'style': {
                        'size': 18,
                        'color': '#7f8c8d'
                    }
                }
            }
        }
    }

    print("🎯 建議的時間戳配置:")
    print(f"timestamp.format: 'relative' (顯示'5分鐘前')")
    print(f"timestamp.format: 'absolute' (顯示'2025-09-23 22:30')")
    print(f"timestamp.format: 'HH:mm' (只顯示時間)")
    print(f"timestamp.format: 'YYYY-MM-DD' (只顯示日期)")

    print("\n🔍 問題分析:")
    print("1. IG發布使用資料庫IGTemplate的配置")
    print("2. 手機預覽使用API預設配置")
    print("3. 兩者可能使用不同的timestamp_format")

    print("\n📋 解決方案:")
    print("方案1: 修改資料庫中的IGTemplate配置")
    print("方案2: 在IG發布時覆蓋timestamp格式")
    print("方案3: 統一所有系統使用相同格式")

    return test_config

def create_timestamp_override():
    """創建時間戳格式覆蓋方案"""

    print("\n🛠️ 創建時間戳格式覆蓋")
    print("=" * 30)

    # 方案：在content_generator中添加格式覆蓋
    override_code = '''
    # 在 _generate_image 方法中添加：

    # 強制覆蓋時間戳格式為相對時間
    if 'timestamp' in pillow_config and isinstance(pillow_config['timestamp'], dict):
        pillow_config['timestamp']['format'] = 'relative'
        logger.info("[IG發布] 強制使用相對時間格式")
    '''

    print("💡 覆蓋代碼示例:")
    print(override_code)

    print("\n🎯 這個方案會:")
    print("✅ 強制所有IG發布使用相對時間")
    print("✅ 不影響手機預覽")
    print("✅ 不需要修改資料庫")

if __name__ == "__main__":
    print("ForumKit 時間戳格式修復工具")
    print("=" * 50)

    config = fix_timestamp_format_in_templates()
    create_timestamp_override()

    print("\n🎉 解決步驟:")
    print("1. 查看IG發布日誌，確認timestamp配置")
    print("2. 選擇修復方案（覆蓋或修改資料庫）")
    print("3. 測試IG發布，驗證時間戳格式")
    print("4. 確保手機預覽和IG發布格式一致")