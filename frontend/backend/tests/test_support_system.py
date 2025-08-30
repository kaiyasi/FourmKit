"""
支援工單系統測試套件
涵蓋完整的支援工單系統功能測試
"""
import pytest
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

from models.support import (
    SupportTicket, SupportMessage, SupportEvent, 
    TicketStatus, TicketCategory, TicketPriority, AuthorType
)
from models.base import User, UserRole
from services.support_service import SupportService
from utils.support_security import SupportSecurityManager, ContentValidator, HoneyPotDetector
from utils.db import get_session


@pytest.fixture
def test_user(db_session):
    """創建測試用戶"""
    user = User(
        username="testuser",
        password_hash="hashed_password",
        email="test@example.com",
        role=UserRole.user
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_admin(db_session):
    """創建測試管理員"""
    admin = User(
        username="admin",
        password_hash="hashed_password", 
        email="admin@example.com",
        role=UserRole.dev_admin
    )
    db_session.add(admin)
    db_session.commit()
    return admin


@pytest.fixture
def test_ticket(db_session, test_user):
    """創建測試工單"""
    ticket = SupportService.create_ticket(
        session=db_session,
        subject="測試工單",
        body="這是一個測試工單的內容",
        category=TicketCategory.TECHNICAL,
        priority=TicketPriority.MEDIUM,
        user_id=test_user.id
    )
    return ticket


class TestSupportService:
    """測試支援服務類"""
    
    def test_create_user_ticket(self, db_session, test_user):
        """測試創建用戶工單"""
        ticket = SupportService.create_ticket(
            session=db_session,
            subject="測試主題",
            body="測試內容",
            category=TicketCategory.BUG,
            priority=TicketPriority.HIGH,
            user_id=test_user.id
        )
        
        assert ticket.subject == "測試主題"
        assert ticket.category == TicketCategory.BUG
        assert ticket.priority == TicketPriority.HIGH
        assert ticket.user_id == test_user.id
        assert ticket.status == TicketStatus.OPEN
        assert ticket.public_id.startswith("SUP-")
        assert ticket.message_count == 1
    
    def test_create_guest_ticket(self, db_session):
        """測試創建訪客工單"""
        ticket = SupportService.create_ticket(
            session=db_session,
            subject="訪客工單",
            body="訪客內容",
            guest_email="guest@example.com"
        )
        
        assert ticket.guest_email == "guest@example.com"
        assert ticket.user_id is None
        assert ticket.pseudonym_code.startswith("GUEST-")
        assert not ticket.guest_verified
    
    def test_add_message(self, db_session, test_ticket):
        """測試添加訊息"""
        message = SupportService.add_message(
            session=db_session,
            ticket_id=test_ticket.id,
            body="這是一個回覆",
            author_user_id=test_ticket.user_id,
            author_type=AuthorType.USER
        )
        
        assert message.body == "這是一個回覆"
        assert message.author_type == AuthorType.USER
        assert message.ticket_id == test_ticket.id
        
        # 檢查工單統計更新
        db_session.refresh(test_ticket)
        assert test_ticket.message_count == 2
    
    def test_change_status(self, db_session, test_ticket):
        """測試狀態變更"""
        original_status = test_ticket.status
        
        success = SupportService.change_status(
            session=db_session,
            ticket_id=test_ticket.id,
            new_status=TicketStatus.AWAITING_USER,
            reason="測試狀態變更"
        )
        
        assert success
        db_session.refresh(test_ticket)
        assert test_ticket.status == TicketStatus.AWAITING_USER
        
        # 檢查事件記錄
        events = db_session.query(SupportEvent).filter_by(ticket_id=test_ticket.id).all()
        status_events = [e for e in events if e.event_type == 'status_changed']
        assert len(status_events) > 0
    
    def test_invalid_status_transition(self, db_session, test_ticket):
        """測試無效的狀態轉換"""
        # 嘗試從 OPEN 直接轉到 REOPENED（無效轉換）
        with pytest.raises(ValueError, match="無法從"):
            SupportService.change_status(
                session=db_session,
                ticket_id=test_ticket.id,
                new_status=TicketStatus.REOPENED
            )
    
    def test_assign_ticket(self, db_session, test_ticket, test_admin):
        """測試工單指派"""
        success = SupportService.assign_ticket(
            session=db_session,
            ticket_id=test_ticket.id,
            assignee_user_id=test_admin.id
        )
        
        assert success
        db_session.refresh(test_ticket)
        assert test_ticket.assigned_to == test_admin.id
    
    def test_get_tickets_by_user(self, db_session, test_user):
        """測試獲取用戶工單列表"""
        # 創建多個工單
        for i in range(3):
            SupportService.create_ticket(
                session=db_session,
                subject=f"測試工單 {i}",
                body=f"內容 {i}",
                user_id=test_user.id
            )
        
        tickets = SupportService.get_tickets_by_user(
            session=db_session,
            user_id=test_user.id
        )
        
        assert len(tickets) == 3
        assert all(t.user_id == test_user.id for t in tickets)
    
    def test_guest_token_generation_and_verification(self):
        """測試訪客 token 生成和驗證"""
        ticket_id = 123
        guest_email = "test@example.com"
        secret_key = "test-secret"
        
        # 生成 token
        token = SupportService.generate_guest_token(ticket_id, guest_email, secret_key)
        assert isinstance(token, str)
        assert len(token.split(':')) == 4  # ticket_id:email:expires:signature
        
        # 驗證 token
        result = SupportService.verify_guest_token(token, secret_key)
        assert result is not None
        assert result[0] == ticket_id
        assert result[1] == guest_email
    
    def test_expired_guest_token(self):
        """測試過期的訪客 token"""
        # 使用過期時間創建 token（手動構造）
        from datetime import timedelta
        import hmac
        import hashlib
        
        ticket_id = 123
        guest_email = "test@example.com"
        secret_key = "test-secret"
        
        # 創建一個過期的 token（過去的時間）
        expired_time = datetime.now(timezone.utc) - timedelta(days=1)
        payload = f"{ticket_id}:{guest_email}:{int(expired_time.timestamp())}"
        signature = hmac.new(
            secret_key.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        expired_token = f"{payload}:{signature}"
        
        # 驗證應該返回 None
        result = SupportService.verify_guest_token(expired_token, secret_key)
        assert result is None


class TestSupportSecurity:
    """測試安全功能"""
    
    def test_honeypot_detection(self):
        """測試蜂蜜罐檢測"""
        # 正常表單
        clean_form = {
            'subject': '正常主題',
            'body': '正常內容',
            'category': 'technical'
        }
        violation = HoneyPotDetector.check_honeypot(clean_form)
        assert violation is None
        
        # 觸發蜂蜜罐的表單
        bot_form = {
            'subject': '正常主題',
            'body': '正常內容',
            'website': 'http://spam.com',  # 蜂蜜罐欄位
            'category': 'technical'
        }
        violation = HoneyPotDetector.check_honeypot(bot_form)
        assert violation is not None
        assert violation.violation_type == 'honeypot_triggered'
        assert violation.severity == 'high'
    
    def test_spam_content_detection(self):
        """測試垃圾內容檢測"""
        # 正常內容
        clean_text = "我遇到了一個技術問題，需要協助解決"
        violation = ContentValidator.check_spam_content(clean_text)
        assert violation is None
        
        # 垃圾內容
        spam_text = "click here to buy now and get rich quick with free money"
        violation = ContentValidator.check_spam_content(spam_text)
        assert violation is not None
        assert violation.violation_type == 'spam_content'
    
    def test_malicious_url_detection(self):
        """測試惡意 URL 檢測"""
        # 正常內容
        clean_text = "請查看我的網站 https://example.com"
        violation = ContentValidator.check_malicious_urls(clean_text)
        assert violation is None
        
        # 包含可疑短網址
        suspicious_text = "點擊這裡 https://bit.ly/suspicious 獲得獎品"
        violation = ContentValidator.check_malicious_urls(suspicious_text)
        assert violation is not None
        assert violation.violation_type == 'malicious_url'
    
    def test_security_manager_validation(self):
        """測試安全管理器驗證"""
        security_manager = SupportSecurityManager()
        
        # 正常工單數據
        clean_data = {
            'subject': '技術問題',
            'body': '我遇到了登入問題，請協助解決',
            'category': 'technical'
        }
        
        with patch('flask.request') as mock_request:
            mock_request.remote_addr = '192.168.1.1'
            mock_request.headers = {'User-Agent': 'Mozilla/5.0'}
            
            violations = security_manager.validate_ticket_creation(clean_data, '192.168.1.1')
            assert len(violations) == 0
        
        # 問題數據（蜂蜜罐 + 垃圾內容）
        bad_data = {
            'subject': 'click here to win free money',
            'body': 'buy now and get rich quick with our casino',
            'website': 'http://spam.com',  # 蜂蜜罐
            'category': 'technical'
        }
        
        with patch('flask.request') as mock_request:
            mock_request.remote_addr = '192.168.1.1'
            mock_request.headers = {'User-Agent': 'Mozilla/5.0'}
            
            violations = security_manager.validate_ticket_creation(bad_data, '192.168.1.1')
            assert len(violations) > 0
            assert security_manager.should_block_request(violations)


class TestSupportAPI:
    """測試支援 API 端點"""
    
    def test_create_ticket_authenticated(self, client, test_user, auth_headers):
        """測試已認證用戶創建工單"""
        data = {
            'subject': '測試工單',
            'body': '這是測試內容',
            'category': 'technical',
            'priority': 'medium'
        }
        
        response = client.post('/api/support/tickets', 
                             json=data,
                             headers=auth_headers(test_user))
        
        assert response.status_code == 201
        result = response.get_json()
        assert result['ok']
        assert 'ticket' in result
        assert result['ticket']['subject'] == '測試工單'
    
    def test_create_ticket_guest(self, client):
        """測試訪客用戶創建工單"""
        data = {
            'subject': '訪客工單',
            'body': '訪客內容',
            'email': 'guest@example.com',
            'category': 'account',
            'priority': 'low'
        }
        
        response = client.post('/api/support/tickets', json=data)
        
        assert response.status_code == 201
        result = response.get_json()
        assert result['ok']
        assert 'tracking_token' in result
        assert 'tracking_url' in result
    
    def test_get_ticket_with_permission(self, client, test_ticket, auth_headers, test_user):
        """測試有權限用戶獲取工單"""
        response = client.get(f'/api/support/tickets/{test_ticket.public_id}',
                             headers=auth_headers(test_user))
        
        assert response.status_code == 200
        result = response.get_json()
        assert result['ok']
        assert result['ticket']['subject'] == test_ticket.subject
    
    def test_get_ticket_without_permission(self, client, test_ticket):
        """測試無權限用戶獲取工單"""
        response = client.get(f'/api/support/tickets/{test_ticket.public_id}')
        
        assert response.status_code == 403
        result = response.get_json()
        assert not result['ok']
    
    def test_add_message(self, client, test_ticket, auth_headers, test_user):
        """測試添加工單訊息"""
        data = {
            'body': '這是一個回覆訊息'
        }
        
        response = client.post(f'/api/support/tickets/{test_ticket.public_id}/messages',
                              json=data,
                              headers=auth_headers(test_user))
        
        assert response.status_code == 201
        result = response.get_json()
        assert result['ok']
        assert result['message']['body'] == '這是一個回覆訊息'
    
    def test_close_ticket(self, client, test_ticket, auth_headers, test_user):
        """測試關閉工單"""
        data = {
            'reason': '問題已解決'
        }
        
        response = client.post(f'/api/support/tickets/{test_ticket.public_id}/close',
                              json=data,
                              headers=auth_headers(test_user))
        
        assert response.status_code == 200
        result = response.get_json()
        assert result['ok']
        assert result['status'] == TicketStatus.CLOSED
    
    def test_guest_track_ticket(self, client):
        """測試訪客追蹤工單"""
        # 首先創建一個訪客工單
        create_data = {
            'subject': '追蹤測試',
            'body': '測試內容',
            'email': 'track@example.com'
        }
        
        create_response = client.post('/api/support/tickets', json=create_data)
        assert create_response.status_code == 201
        
        create_result = create_response.get_json()
        ticket_id = create_result['ticket']['id']
        
        # 然後追蹤工單
        track_data = {
            'ticket_id': ticket_id,
            'email': 'track@example.com'
        }
        
        track_response = client.post('/api/support/guest/track', json=track_data)
        assert track_response.status_code == 200
        
        track_result = track_response.get_json()
        assert track_result['ok']
        assert 'tracking_token' in track_result


class TestSupportAdmin:
    """測試管理員功能"""
    
    def test_admin_get_tickets(self, client, auth_headers, test_admin, test_ticket):
        """測試管理員獲取工單列表"""
        response = client.get('/api/admin/support/tickets',
                             headers=auth_headers(test_admin))
        
        assert response.status_code == 200
        result = response.get_json()
        assert result['ok']
        assert 'tickets' in result
        assert 'pagination' in result
    
    def test_admin_get_ticket_detail(self, client, auth_headers, test_admin, test_ticket):
        """測試管理員獲取工單詳情"""
        response = client.get(f'/api/admin/support/tickets/{test_ticket.public_id}',
                             headers=auth_headers(test_admin))
        
        assert response.status_code == 200
        result = response.get_json()
        assert result['ok']
        assert 'messages' in result['ticket']
        assert 'events' in result['ticket']
    
    def test_admin_update_ticket(self, client, auth_headers, test_admin, test_ticket):
        """測試管理員更新工單"""
        data = {
            'status': TicketStatus.AWAITING_USER,
            'priority': TicketPriority.HIGH
        }
        
        response = client.patch(f'/api/admin/support/tickets/{test_ticket.public_id}',
                               json=data,
                               headers=auth_headers(test_admin))
        
        assert response.status_code == 200
        result = response.get_json()
        assert result['ok']
        assert len(result['changes']) > 0
    
    def test_admin_reply(self, client, auth_headers, test_admin, test_ticket):
        """測試管理員回覆"""
        data = {
            'body': '這是管理員的回覆'
        }
        
        response = client.post(f'/api/admin/support/tickets/{test_ticket.public_id}/reply',
                              json=data,
                              headers=auth_headers(test_admin))
        
        assert response.status_code == 201
        result = response.get_json()
        assert result['ok']
        assert result['message']['body'] == '這是管理員的回覆'
    
    def test_admin_internal_note(self, client, auth_headers, test_admin, test_ticket):
        """測試管理員內部備註"""
        data = {
            'body': '這是內部備註'
        }
        
        response = client.post(f'/api/admin/support/tickets/{test_ticket.public_id}/internal-note',
                              json=data,
                              headers=auth_headers(test_admin))
        
        assert response.status_code == 201
        result = response.get_json()
        assert result['ok']
        assert result['note']['body'] == '這是內部備註'
    
    def test_non_admin_access_denied(self, client, auth_headers, test_user, test_ticket):
        """測試非管理員無法存取管理功能"""
        response = client.get('/api/admin/support/tickets',
                             headers=auth_headers(test_user))
        
        assert response.status_code == 403


@pytest.fixture
def auth_headers():
    """生成認證標頭的輔助函數"""
    def _auth_headers(user):
        # 這裡應該生成實際的 JWT token
        # 簡化示例
        return {'Authorization': f'Bearer mock-token-{user.id}'}
    return _auth_headers


if __name__ == '__main__':
    pytest.main([__file__, '-v'])