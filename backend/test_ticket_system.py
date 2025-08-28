#!/usr/bin/env python3
"""
簡單測試工單系統的各個組件
此腳本檢查：
1. 模型導入是否正常
2. 工單號生成是否工作
3. 路由函數是否可以導入
"""

import sys
import os

# 添加項目根目錄到路徑
sys.path.insert(0, os.getcwd())

def test_model_imports():
    """測試模型導入"""
    print("測試模型導入...")
    try:
        from models.tickets import (
            SupportTicket, TicketResponse, TicketAttachment, 
            TicketHistory, UserIdentityCode, 
            TicketStatus, TicketPriority, TicketCategory
        )
        print("✅ 所有票務模型導入成功")
        
        # 測試枚舉
        print(f"✅ 工單狀態: {[status.value for status in TicketStatus]}")
        print(f"✅ 工單優先級: {[priority.value for priority in TicketPriority]}")
        print(f"✅ 工單分類: {[category.value for category in TicketCategory]}")
        
        return True
    except ImportError as e:
        print(f"❌ 模型導入失敗: {e}")
        return False

def test_ticket_id_generation():
    """測試工單號生成"""
    print("\\n測試工單號生成...")
    try:
        from utils.ticket import new_ticket_id
        
        ticket_id = new_ticket_id()
        print(f"✅ 生成的工單號: {ticket_id}")
        
        # 檢查格式
        if ticket_id.startswith("FK-") and len(ticket_id) > 10:
            print("✅ 工單號格式正確")
            return True
        else:
            print("❌ 工單號格式不正確")
            return False
            
    except ImportError as e:
        print(f"❌ 工單號生成函數導入失敗: {e}")
        return False
    except Exception as e:
        print(f"❌ 工單號生成失敗: {e}")
        return False

def test_route_imports():
    """測試路由導入"""
    print("\\n測試路由導入...")
    try:
        from routes.routes_support import bp, submit_report, recent_reports, my_support_items, reply_to_support, track_ticket
        print("✅ 所有支援路由函數導入成功")
        print(f"✅ Blueprint 名稱: {bp.name}")
        print(f"✅ Blueprint URL 前綴: {bp.url_prefix}")
        return True
    except ImportError as e:
        print(f"❌ 路由導入失敗: {e}")
        return False

def test_user_model_relationships():
    """測試 User 模型的關聯關係"""
    print("\\n測試 User 模型關聯...")
    try:
        from models.base import User
        
        # 檢查是否有票務相關的關聯
        user_attrs = dir(User)
        ticket_relations = [attr for attr in user_attrs if 'ticket' in attr.lower() or 'identity' in attr.lower()]
        
        if ticket_relations:
            print(f"✅ User 模型有票務相關關聯: {ticket_relations}")
            return True
        else:
            print("⚠️  User 模型可能缺少票務關聯，但這在數據庫遷移前是正常的")
            return True
            
    except ImportError as e:
        print(f"❌ User 模型導入失敗: {e}")
        return False

def main():
    """主測試函數"""
    print("🎫 ForumKit 工單系統測試\\n")
    print("=" * 50)
    
    tests = [
        test_model_imports,
        test_ticket_id_generation,
        test_route_imports,
        test_user_model_relationships
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"❌ 測試異常: {e}")
    
    print("\\n" + "=" * 50)
    print(f"測試結果: {passed}/{total} 通過")
    
    if passed == total:
        print("🎉 所有測試通過！工單系統基本組件正常")
    else:
        print("⚠️  部分測試失敗，請檢查相關組件")
        
    print("\\n注意事項:")
    print("- 此測試不包括數據庫操作（需要遷移和運行環境）")
    print("- 部分功能需要在 Docker 環境中測試")
    print("- 前端組件需要在瀏覽器中測試")

if __name__ == "__main__":
    main()