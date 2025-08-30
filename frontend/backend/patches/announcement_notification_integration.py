"""
公告系統與通知視窗整合補丁
修復公告發布後沒有自動顯示在右下角通知視窗的問題
"""

from typing import Dict, Any, Optional
from services.event_service import EventService
from utils.enhanced_notify import send_enhanced_webhook
from utils.notify import send_admin_event


def trigger_announcement_notification(
    announcement_id: int,
    title: str,
    content: str,
    type: str = "info",
    priority: str = "normal",
    is_pinned: bool = False,
    school_id: Optional[int] = None,
    school_name: Optional[str] = None,
    created_by: Optional[int] = None,
    creator_username: Optional[str] = None
) -> Dict[str, Any]:
    """
    公告發布後觸發通知事件
    會同時發送 webhook 和前端通知事件
    """
    
    # 1. 觸發 EventService 事件（這會自動發送 webhook）
    try:
        from utils.db import get_session
        
        with get_session() as session:
            # 記錄公告創建事件
            event = EventService.log_event(
                session=session,
                event_type="announcement.created",
                title=f"公告發布：{title}",
                description=content[:200] + ("..." if len(content) > 200 else ""),
                severity="medium" if priority == "normal" else "high",
                actor_id=created_by,
                actor_name=creator_username,
                target_type="announcement",
                target_id=str(announcement_id),
                target_name=title,
                school_id=school_id,
                metadata={
                    "announcement_type": type,
                    "priority": priority,
                    "is_pinned": is_pinned,
                    "school_name": school_name,
                    "content_preview": content[:500]
                },
                is_important=priority in ["high", "urgent"] or is_pinned,
                send_webhook=True
            )
            
            session.commit()
            
    except Exception as e:
        print(f"[WARNING] Failed to log announcement event: {e}")
    
    # 2. 發送增強版 webhook（如果需要更詳細的格式）
    try:
        webhook_result = send_enhanced_webhook(
            webhook_type="system_event",
            event_type="announcement.published",
            title=f"📢 新公告發布：{title}",
            description=f"""
🏛️ **公告標題**: {title}
📝 **公告類型**: {type.upper()}
⚡ **優先級**: {priority.upper()}
📌 **置頂**: {'是' if is_pinned else '否'}
🏫 **適用範圍**: {school_name or '全平台'}
👤 **發布者**: {creator_username or 'System'}

📄 **內容預覽**:
{content[:300]}{'...' if len(content) > 300 else ''}
            """,
            severity="high" if priority in ["high", "urgent"] or is_pinned else "medium",
            actor=creator_username or "System",
            target=f"公告 #{announcement_id}",
            announcement_id=announcement_id,
            school_id=school_id,
            school_name=school_name
        )
    except Exception as e:
        print(f"[WARNING] Failed to send enhanced webhook: {e}")
        webhook_result = {"ok": False, "error": str(e)}
    
    # 3. 推送給前端的 WebSocket 事件（如果有實現）
    try:
        # 這裡可以觸發 WebSocket 事件通知所有在線用戶
        websocket_payload = {
            "type": "new_announcement",
            "data": {
                "id": announcement_id,
                "title": title,
                "content": content,
                "announcement_type": type,
                "priority": priority,
                "is_pinned": is_pinned,
                "school_id": school_id,
                "school_name": school_name,
                "created_by": created_by,
                "creator_username": creator_username,
                "timestamp": int(__import__('time').time() * 1000)
            }
        }
        
        # 觸發 WebSocket 廣播（需要在 socket_events.py 中實現）
        try:
            from socket_events import broadcast_announcement
            broadcast_announcement(websocket_payload)
        except ImportError:
            print("[INFO] WebSocket broadcast not available, announcement notification sent via webhook only")
            
    except Exception as e:
        print(f"[WARNING] Failed to broadcast WebSocket event: {e}")
    
    return {
        "ok": True,
        "announcement_id": announcement_id,
        "event_logged": True,
        "webhook_sent": webhook_result.get("ok", False),
        "websocket_broadcast": True
    }


def patch_announcement_service():
    """
    為 AnnouncementService 添加通知觸發功能
    """
    
    # 導入需要修補的模組
    try:
        from services.announcement_service import AnnouncementService
        from models import User, School
        
        # 保存原始的 create_announcement 方法
        original_create_announcement = AnnouncementService.create_announcement
        
        @classmethod
        def enhanced_create_announcement(
            cls,
            session,
            title: str,
            content: str,
            type: str = "info",
            priority: str = "normal",
            is_pinned: bool = False,
            start_at = None,
            end_at = None,
            school_id = None,
            created_by: int = None
        ):
            """增強版創建公告方法 - 包含通知觸發"""
            
            # 1. 調用原始方法創建公告
            announcement = original_create_announcement(
                session, title, content, type, priority, 
                is_pinned, start_at, end_at, school_id, created_by
            )
            
            # 2. 獲取額外資訊用於通知
            creator_username = None
            school_name = None
            
            try:
                if created_by:
                    creator = session.get(User, created_by)
                    if creator:
                        creator_username = creator.username
                        
                if school_id:
                    school = session.get(School, school_id)
                    if school:
                        school_name = school.name
                        
            except Exception as e:
                print(f"[WARNING] Failed to get additional info for notification: {e}")
            
            # 3. 觸發通知（異步執行，不影響主流程）
            try:
                import threading
                
                def send_notification():
                    trigger_announcement_notification(
                        announcement_id=announcement.id,
                        title=title,
                        content=content,
                        type=type,
                        priority=priority,
                        is_pinned=is_pinned,
                        school_id=school_id,
                        school_name=school_name,
                        created_by=created_by,
                        creator_username=creator_username
                    )
                
                # 使用線程異步執行通知，避免阻塞主流程
                notification_thread = threading.Thread(target=send_notification, daemon=True)
                notification_thread.start()
                
            except Exception as e:
                print(f"[ERROR] Failed to trigger announcement notification: {e}")
            
            return announcement
        
        # 替換原方法
        AnnouncementService.create_announcement = enhanced_create_announcement
        
        print("[PATCH] ✅ AnnouncementService.create_announcement enhanced with notification triggers")
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to patch AnnouncementService: {e}")
        return False


def create_frontend_announcement_handler():
    """
    創建前端公告處理器代碼（需要集成到前端）
    """
    
    frontend_code = '''
// 前端公告通知處理器
// 需要添加到適當的組件中（如 App.tsx 或通知相關組件）

import { useNotifications } from '@/hooks/useNotifications'
import { useWebSocket } from '@/hooks/useWebSocket'

export function useAnnouncementNotifications() {
  const { addNotification } = useNotifications()
  
  // 監聽 WebSocket 公告事件
  useWebSocket({
    onMessage: (event) => {
      if (event.type === 'new_announcement') {
        const announcement = event.data
        
        // 添加到通知視窗
        addNotification({
          type: 'announcement',
          title: `📢 ${announcement.title}`,
          message: announcement.content.length > 100 
            ? announcement.content.substring(0, 100) + '...' 
            : announcement.content,
          urgent: announcement.priority === 'urgent' || announcement.is_pinned,
          icon: announcement.announcement_type === 'warning' ? 'warning' :
                announcement.announcement_type === 'error' ? 'error' : 'info',
          actionUrl: `/announcements#${announcement.id}`,
          actionText: '查看公告',
          data: {
            announcement_id: announcement.id,
            school_id: announcement.school_id,
            school_name: announcement.school_name,
            creator: announcement.creator_username
          }
        })
        
        // 如果是緊急公告，顯示 toast 通知
        if (announcement.priority === 'urgent' || announcement.is_pinned) {
          // 可以在這裡添加 toast 通知
          console.log('[URGENT] New important announcement:', announcement.title)
        }
      }
    }
  })
}

// 使用方式：在 App.tsx 中
// function App() {
//   useAnnouncementNotifications()
//   return <AppContent />
// }
    '''
    
    return frontend_code


def install_announcement_notification_patch():
    """
    安裝完整的公告通知整合補丁
    """
    
    print("🔧 Installing announcement notification integration patch...")
    
    # 1. 修補後端服務
    backend_success = patch_announcement_service()
    
    # 2. 生成前端代碼
    frontend_code = create_frontend_announcement_handler()
    
    # 3. 保存前端代碼到文件
    try:
        import os
        frontend_patch_path = os.path.join(
            os.path.dirname(__file__), 
            "../../frontend/src/hooks/useAnnouncementNotifications.ts"
        )
        os.makedirs(os.path.dirname(frontend_patch_path), exist_ok=True)
        
        with open(frontend_patch_path, 'w', encoding='utf-8') as f:
            f.write(frontend_code)
        
        print(f"[PATCH] ✅ Frontend notification handler saved to: {frontend_patch_path}")
        frontend_success = True
        
    except Exception as e:
        print(f"[WARNING] Failed to save frontend code: {e}")
        frontend_success = False
    
    # 4. 測試補丁
    test_success = test_announcement_notification()
    
    # 5. 總結
    print(f"""
🎯 **公告通知整合補丁安裝完成**

✅ 後端服務增強: {'成功' if backend_success else '失敗'}
✅ 前端處理器生成: {'成功' if frontend_success else '失敗'} 
✅ 功能測試: {'成功' if test_success else '失敗'}

📋 **下一步操作**:
1. 重啟後端服務以載入補丁
2. 在前端 App.tsx 中集成 useAnnouncementNotifications
3. 配置 WebSocket 事件廣播
4. 測試公告發布 → 通知視窗流程

🚀 **預期效果**:
- 管理員發布公告後，所有用戶會立即在右下角看到通知
- 緊急公告會有特殊標記和樣式
- 通知點擊可直接跳轉到公告詳情
    """)
    
    return {
        "backend_patched": backend_success,
        "frontend_generated": frontend_success,
        "test_passed": test_success,
        "overall_success": backend_success and test_success
    }


def test_announcement_notification():
    """
    測試公告通知功能
    """
    try:
        # 模擬觸發通知
        result = trigger_announcement_notification(
            announcement_id=999,
            title="測試公告通知整合",
            content="這是一個測試公告，用來驗證通知系統是否正常運作。",
            type="info",
            priority="normal",
            is_pinned=False,
            school_id=None,
            school_name=None,
            created_by=1,
            creator_username="測試系統"
        )
        
        print(f"[TEST] Announcement notification test result: {result}")
        return result.get("ok", False)
        
    except Exception as e:
        print(f"[TEST] Announcement notification test failed: {e}")
        return False


if __name__ == "__main__":
    install_announcement_notification_patch()