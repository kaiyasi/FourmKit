#!/usr/bin/env python3
"""
統一模板系統啟用腳本
"""
import sys
import os
from sqlalchemy import text, inspect

# 添加當前目錄到路徑
sys.path.insert(0, '.')

def enable_unified_templates():
    """啟用統一模板系統"""
    print("🚀 開始啟用統一模板系統...")
    
    try:
        from utils.db import get_session
        
        with get_session() as db:
            inspector = inspect(db.bind)
            
            # 檢查 ig_accounts 表的欄位
            if 'ig_accounts' in inspector.get_table_names():
                columns = [col['name'] for col in inspector.get_columns('ig_accounts')]
                
                # 添加 use_unified_templates 欄位
                if 'use_unified_templates' not in columns:
                    print("📝 添加 use_unified_templates 欄位...")
                    db.execute(text("""
                        ALTER TABLE ig_accounts 
                        ADD COLUMN use_unified_templates BOOLEAN DEFAULT FALSE
                    """))
                    print("✅ use_unified_templates 欄位已添加")
                else:
                    print("✅ use_unified_templates 欄位已存在")
                
                # 添加 default_unified_template_id 欄位
                if 'default_unified_template_id' not in columns:
                    print("📝 添加 default_unified_template_id 欄位...")
                    db.execute(text("""
                        ALTER TABLE ig_accounts 
                        ADD COLUMN default_unified_template_id INTEGER
                    """))
                    print("✅ default_unified_template_id 欄位已添加")
                else:
                    print("✅ default_unified_template_id 欄位已存在")
                
                db.commit()
                print("💾 資料庫變更已提交")
                
                return True
            else:
                print("❌ ig_accounts 表不存在")
                return False
                
    except Exception as e:
        print(f"❌ 資料庫遷移失敗: {e}")
        return False

def update_model_files():
    """更新模型檔案以啟用統一模板"""
    print("\n📁 更新模型檔案...")
    
    try:
        # 讀取 models/instagram.py
        with open('models/instagram.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 啟用統一模板欄位
        content = content.replace(
            '    # 統一模板設定 - 新版整合模板系統（暫時註解，等待資料庫遷移）\n'
            '    # default_unified_template_id: Mapped[int | None] = mapped_column(ForeignKey("ig_unified_templates.id"), nullable=True)  # 預設統一模板\n'
            '    # use_unified_templates: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # 是否使用統一模板系統',
            '    # 統一模板設定 - 新版整合模板系統\n'
            '    default_unified_template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 預設統一模板（暫不設外鍵）\n'
            '    use_unified_templates: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # 是否使用統一模板系統'
        )
        
        # 寫回檔案
        with open('models/instagram.py', 'w', encoding='utf-8') as f:
            f.write(content)
        
        print("✅ models/instagram.py 已更新")
        
        # 讀取 models/__init__.py
        with open('models/__init__.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 啟用統一模板 import
        content = content.replace(
            '# 暫時註解統一模板，等待資料庫遷移\n'
            '# from .ig_unified_template import IGUnifiedTemplate, UnifiedTemplateType, configure_unified_template_relationships',
            '# 統一模板系統\n'
            'from .ig_unified_template import IGUnifiedTemplate, UnifiedTemplateType, configure_unified_template_relationships'
        )
        
        content = content.replace(
            '# 配置統一模板關係（暫時禁用）\n'
            '# configure_unified_template_relationships()',
            '# 配置統一模板關係\n'
            'configure_unified_template_relationships()'
        )
        
        content = content.replace(
            '    # "IGUnifiedTemplate", "UnifiedTemplateType",  # 暫時註解',
            '    "IGUnifiedTemplate", "UnifiedTemplateType",'
        )
        
        # 寫回檔案
        with open('models/__init__.py', 'w', encoding='utf-8') as f:
            f.write(content)
        
        print("✅ models/__init__.py 已更新")
        
        return True
        
    except Exception as e:
        print(f"❌ 更新模型檔案失敗: {e}")
        return False

def update_app_routes():
    """更新 app.py 啟用統一模板路由"""
    print("\n🔗 啟用統一模板路由...")
    
    try:
        # 讀取 app.py
        with open('app.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 找到 Instagram 路由部分並啟用統一模板路由
        if '# IG 統一系統路由（暫時禁用，等待資料庫遷移）' in content:
            content = content.replace(
                '        # IG 統一系統路由（暫時禁用，等待資料庫遷移）\n'
                '        # try:\n'
                '        #     from routes.routes_ig_unified import ig_unified_bp\n'
                '        #     app.register_blueprint(ig_unified_bp)\n'
                '        #     print(\'[ForumKit] IG unified routes mounted successfully\')\n'
                '        # except ImportError as e:\n'
                '        #     print(\'[ForumKit] IG unified routes not available:\', e)',
                '        # IG 統一系統路由\n'
                '        try:\n'
                '            from routes.routes_ig_unified import ig_unified_bp\n'
                '            app.register_blueprint(ig_unified_bp)\n'
                '            print(\'[ForumKit] IG unified routes mounted successfully\')\n'
                '        except ImportError as e:\n'
                '            print(\'[ForumKit] IG unified routes not available:\', e)'
            )
            
            # 寫回檔案
            with open('app.py', 'w', encoding='utf-8') as f:
                f.write(content)
            
            print("✅ app.py 路由已啟用")
            return True
        else:
            print("✅ 統一模板路由已啟用")
            return True
            
    except Exception as e:
        print(f"❌ 更新路由失敗: {e}")
        return False

def test_import():
    """測試統一模板系統是否正常載入"""
    print("\n🧪 測試統一模板系統...")
    
    try:
        from models import IGAccount, IGUnifiedTemplate
        print("✅ 統一模板模型載入成功")
        
        from routes.routes_ig_unified import ig_unified_bp
        print("✅ 統一模板路由載入成功")
        
        from services.ig_unified_template_service import unified_template_service
        print("✅ 統一模板服務載入成功")
        
        return True
        
    except Exception as e:
        print(f"❌ 測試失敗: {e}")
        return False

def main():
    """主函數"""
    print("="*50)
    print("🎯 Instagram 統一模板系統啟用")
    print("="*50)
    
    # 步驟 1：資料庫遷移
    if not enable_unified_templates():
        print("\n❌ 資料庫遷移失敗，停止啟用程序")
        return False
    
    # 步驟 2：更新模型檔案
    if not update_model_files():
        print("\n❌ 模型檔案更新失敗，停止啟用程序")
        return False
    
    # 步驟 3：更新路由
    if not update_app_routes():
        print("\n❌ 路由更新失敗，停止啟用程序")
        return False
    
    # 步驟 4：測試載入
    if not test_import():
        print("\n❌ 系統測試失敗")
        return False
    
    print("\n" + "="*50)
    print("🎉 統一模板系統啟用完成！")
    print("="*50)
    print("\n📋 接下來的步驟：")
    print("1. 重啟伺服器：python app.py")
    print("2. 前往 Instagram 整合管理頁面")
    print("3. 體驗統一模板功能")
    print("\n✨ 統一模板特色：")
    print("• 整合圖片設計與說明文字配置")
    print("• 即時預覽功能")
    print("• 保留完整的 IG 模擬顯示")
    print("• 向後相容雙模板系統")
    
    return True

if __name__ == "__main__":
    success = main()
    if not success:
        print("\n💡 如果遇到問題，可以重新運行此腳本")
        sys.exit(1)
    else:
        print("\n🚀 現在可以啟動伺服器了：python app.py")
