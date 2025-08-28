#!/usr/bin/env python3
"""
資料庫初始化腳本
建立測試學校和管理員帳戶
"""
import sys
import os

# 確保可以導入模組：添加父目錄到 Python 路徑
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import User, UserRole, School, Post
from utils.db import init_engine_session
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta

def seed_data():
    print("=== ForumKit 資料庫初始化 ===")
    
    try:
        # 初始化資料庫
        print("1. 初始化資料庫連接...")
        init_engine_session()
        
        # 重新導入 db_session
        from utils.db import db_session
        print("✅ 資料庫連接成功")
    except Exception as e:
        print(f"❌ 資料庫連接失敗: {e}")
        return False
    
    try:
        # 建立測試學校
        print("2. 檢查/建立測試學校...")
        ncku = db_session.query(School).filter_by(slug="ncku").first()
        if not ncku:
            ncku = School(slug="ncku", name="國立成功大學")
            db_session.add(ncku)
            db_session.commit()
            print(f"   ✓ 建立學校: {ncku.name} (ID: {ncku.id})")
        else:
            print(f"   ✓ 學校已存在: {ncku.name} (ID: {ncku.id})")

        ntu = db_session.query(School).filter_by(slug="ntu").first()
        if not ntu:
            ntu = School(slug="ntu", name="國立台灣大學")
            db_session.add(ntu)
            db_session.commit()
            print(f"   ✓ 建立學校: {ntu.name} (ID: {ntu.id})")
        else:
            print(f"   ✓ 學校已存在: {ntu.name} (ID: {ntu.id})")
        
        # 建立管理員帳戶
        print("3. 檢查/建立管理員帳戶...")
        
        # 開發者管理員
        dev_admin = db_session.query(User).filter_by(username="dev_admin").first()
        if not dev_admin:
            dev_admin = User(
                username="dev_admin",
                email="dev@forumkit.local",
                password_hash=generate_password_hash("admin123"),
                role=UserRole.dev_admin,
                school_id=None
            )
            db_session.add(dev_admin)
            print("   ✓ 建立開發者管理員: dev_admin")
        else:
            print("   ✓ 開發者管理員已存在: dev_admin")
        
        # 校內管理員
        campus_admin = db_session.query(User).filter_by(username="campus_admin").first()
        if not campus_admin:
            campus_admin = User(
                username="campus_admin",
                email="campus@forumkit.local",
                password_hash=generate_password_hash("admin123"),
                role=UserRole.campus_admin,
                school_id=ncku.id
            )
            db_session.add(campus_admin)
            print("   ✓ 建立校內管理員: campus_admin")
        else:
            print("   ✓ 校內管理員已存在: campus_admin")
        
        # 跨校管理員
        cross_admin = db_session.query(User).filter_by(username="cross_admin").first()
        if not cross_admin:
            cross_admin = User(
                username="cross_admin",
                email="cross@forumkit.local",
                password_hash=generate_password_hash("admin123"),
                role=UserRole.cross_admin,
                school_id=None
            )
            db_session.add(cross_admin)
            print("   ✓ 建立跨校管理員: cross_admin")
        else:
            print("   ✓ 跨校管理員已存在: cross_admin")
        
        # 系統用戶（用於預設貼文）
        system_user = db_session.query(User).filter_by(username="system").first()
        if not system_user:
            system_user = User(
                username="system",
                email="system@forumkit.local",
                password_hash=generate_password_hash("system_readonly"),
                role=UserRole.cross_admin,
                school_id=None
            )
            db_session.add(system_user)
            print("   ✓ 建立系統用戶: system")
        else:
            print("   ✓ 系統用戶已存在: system")

        # 測試用戶
        test_user = db_session.query(User).filter_by(username="testuser").first()
        if not test_user:
            test_user = User(
                username="testuser",
                email="test@forumkit.local",
                password_hash=generate_password_hash("123456"),
                role=UserRole.user,
                school_id=ncku.id
            )
            db_session.add(test_user)
            print("   ✓ 建立測試用戶: testuser")
        else:
            print("   ✓ 測試用戶已存在: testuser")
        
        db_session.commit()
        print("   ✓ 所有用戶帳戶處理完成")
        
        # 建立測試貼文
        print("4. 檢查/建立測試貼文...")
        existing_posts = db_session.query(Post).filter(Post.status == "approved").count()
        print(f"   當前已核准貼文數量: {existing_posts}")
        
        if existing_posts < 4:  # 增加到4篇（包含隱藏的主題頁面）
            sample_posts = [
                {
                    "content": "<h1>🎉 歡迎來到 ForumKit - 校園匿名討論平台</h1><p>Hello！歡迎來到由 <strong>Serelix Studio</strong> 開發的 ForumKit 校園匿名討論平台！這裡是屬於學生們的自由交流空間。</p><h2>✨ 平台特色</h2><ul><li><strong>🔐 完全匿名</strong> - 保護您的隱私，安心發言</li><li><strong>🏫 校園專屬</strong> - 僅限學術機構成員使用</li><li><strong>📱 響應式設計</strong> - 手機、平板、電腦都能完美使用</li><li><strong>💬 即時互動</strong> - Socket.IO 實時留言系統</li><li><strong>🖼️ 多媒體支援</strong> - 圖片、影片上傳無障礙</li><li><strong>🛡️ 智慧審核</strong> - AI + 人工雙重把關</li></ul><h2>🚀 快速開始</h2><ol><li>使用學校 Google 帳號登入</li><li>選擇您的學校或跨校討論</li><li>開始匿名發文和留言</li><li>享受安全友善的交流環境</li></ol><p><em>讓我們一起建立更好的校園討論文化！</em> 💪</p>",
                    "school_id": None,  # 跨校歓迎貼文
                    "created_at": datetime.now() - timedelta(hours=3)
                },
                {
                    "content": "<h1>📋 平台使用規範 - 共同維護友善環境</h1><p>為了讓 ForumKit 成為所有人都能安心使用的平台，請大家共同遵守以下規範：</p><h2>🤝 基本原則</h2><ul><li><strong>尊重包容</strong> - 尊重不同觀點，禁止歧視、仇恨言論</li><li><strong>理性討論</strong> - 就事論事，避免人身攻擊</li><li><strong>內容品質</strong> - 發文請言之有物，提供有價值的內容</li><li><strong>隱私保護</strong> - 不洩露個人或他人資訊</li></ul><h2>🚫 禁止內容</h2><ol><li>人身攻擊、網路霸凌</li><li>色情、暴力、仇恨內容</li><li>政治煽動、極端言論</li><li>商業廣告、垃圾訊息</li><li>盜版、侵權內容</li><li>謠言、不實資訊</li></ol><h2>⚖️ 違規處理</h2><ul><li><strong>輕微違規</strong> - 內容移除、警告通知</li><li><strong>重複違規</strong> - 暫時停權、限制功能</li><li><strong>嚴重違規</strong> - 永久停權、移除帳戶</li></ul><p>如有問題或申訴，請聯繫管理團隊。讓我們共同維護友善的討論環境！ 🌟</p>",
                    "school_id": None,  # 跨校規範
                    "created_at": datetime.now() - timedelta(hours=2)
                },
                {
                    "content": "<h1>📝 Markdown 格式示範 - 讓你的貼文更精彩</h1><p>ForumKit 支援豐富的 Markdown 格式，讓你的內容更生動！</p><h2>📋 基本格式</h2><p><strong>粗體文字</strong>、<em>斜體文字</em>、<code>程式碼</code>、<del>刪除線</del></p><h2>📂 列表展示</h2><h3>無序列表：</h3><ul><li>第一項重點</li><li>第二項重點<ul><li>子項目 A</li><li>子項目 B</li></ul></li><li>第三項重點</li></ul><h3>有序列表：</h3><ol><li>步驟一</li><li>步驟二</li><li>步驟三</li></ol><h2>💻 程式碼區塊</h2><pre><code class=\"language-python\"># Python 範例\ndef hello_forumkit():\n    print(\"Hello, ForumKit!\")\n    return \"歡迎使用 Markdown 格式！\"\n</code></pre><h2>📊 表格展示</h2><table><thead><tr><th>功能</th><th>支援程度</th><th>說明</th></tr></thead><tbody><tr><td>文字格式</td><td>✅ 完整支援</td><td>粗體、斜體、標題等</td></tr><tr><td>列表</td><td>✅ 完整支援</td><td>有序、無序、巢狀列表</td></tr><tr><td>程式碼</td><td>✅ 完整支援</td><td>語法高亮顯示</td></tr><tr><td>表格</td><td>✅ 完整支援</td><td>如本表格所示</td></tr></tbody></table><h2>💡 使用小貼士</h2><blockquote><p><strong>小提示：</strong> 在發文時點擊「預覽」按鈕，可以即時查看格式效果哦！</p></blockquote><p>快來試試這些格式，讓你的貼文更加豐富有趣！ 🎨</p>",
                    "school_id": None,
                    "created_at": datetime.now() - timedelta(hours=1)
                },
                {
                    "content": "<h1>🎨 ForumKit 主題定製服務</h1><p>想要為 ForumKit 設計專屬主題嗎？我們提供完整的主題定製服務！</p><h2>🎯 定製內容</h2><ul><li><strong>色彩配置</strong> - 主色調、輔助色、強調色</li><li><strong>字體樣式</strong> - 標題字體、內文字體、特殊效果</li><li><strong>介面元素</strong> - 按鈕、卡片、導航欄設計</li><li><strong>動畫效果</strong> - 過渡動畫、互動回饋</li><li><strong>響應式佈局</strong> - 手機、平板、電腦適配</li></ul><h2>🛠️ 提交方式</h2><ol><li><strong>個人收藏</strong> - 儲存至個人帳戶（需登入）</li><li><strong>平台實裝</strong> - 提交給開發團隊審核</li></ol><p><strong>立即開始設計：</strong></p><p>🎨 <strong><a href=\"/theme-designer\" target=\"_blank\">進入主題設計工具</a></strong></p><p>💡 <strong>功能特色：</strong></p><ul><li>🎯 即時預覽效果</li><li>💾 個人主題收藏</li><li>📤 一鍵提交給開發團隊</li><li>🔄 主題匯入匯出</li><li>🎨 完整的視覺編輯器</li></ul><hr><p><small>💫 由 Serelix Studio 開發維護 | 讓校園討論更精彩</small></p>",
                    "school_id": ncku.id,  # 指定成功大學
                    "created_at": datetime.now() - timedelta(minutes=45)
                }
            ]
            
            for i, post_data in enumerate(sample_posts):
                existing = db_session.query(Post).filter(Post.content.like(f"%{post_data['content'][:20]}%")).first()
                if not existing:
                    new_post = Post(
                        content=post_data["content"],
                        status="approved",
                        school_id=post_data["school_id"],
                        author_id=system_user.id,  # 由系統用戶發布
                        client_id=f"seed_client_{i+1}",
                        ip="127.0.0.1",
                        created_at=post_data["created_at"]
                    )
                    db_session.add(new_post)
                    print(f"   ✓ 建立測試貼文 #{i+1}")
                else:
                    print(f"   ✓ 測試貼文 #{i+1} 已存在")
            
            db_session.commit()
            print("   ✓ 測試貼文建立完成")
        else:
            print("   ✓ 已有足夠的測試貼文，跳過建立")
        
        print("\n=== 預設帳號資訊 ===")
        print("開發者管理員: dev_admin / admin123")
        print("校內管理員: campus_admin / admin123")
        print("跨校管理員: cross_admin / admin123")
        print("測試用戶: testuser / 123456")
        print("\n=== 測試資料 ===")
        print("已建立 3 篇測試貼文供展示和留言測試")
        print("\n=== 初始化完成 ===")
        return True
        
    except Exception as e:
        print(f"❌ 種子數據初始化過程中發生錯誤: {e}")
        import traceback
        traceback.print_exc()
        try:
            db_session.rollback()
            print("🔄 已回滾資料庫變更")
        except:
            pass
        return False

if __name__ == "__main__":
    try:
        success = seed_data()
        if success:
            print("🎉 種子數據初始化成功！")
            exit(0)
        else:
            print("💥 種子數據初始化失敗！")
            exit(1)
    except Exception as e:
        print(f"💥 種子數據初始化發生未預期錯誤: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
