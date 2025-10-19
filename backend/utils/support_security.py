"""
支援工單系統安全工具
包含速率限制、內容驗證、蜂蜜罐檢測、輸入清洗等安全功能
"""
from __future__ import annotations
import re
import hashlib
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from flask import request, current_app
from utils.sanitize import sanitize_html


@dataclass
class SecurityViolation:
    """安全違規記錄"""
    violation_type: str
    severity: str  # low, medium, high, critical
    message: str
    client_ip: str
    user_agent: str
    timestamp: datetime
    details: Dict[str, Any]


class HoneyPotDetector:
    """蜂蜜罐檢測器 - 檢測機器人提交"""
    
    HONEYPOT_FIELDS = [
        'website',
        'url',
        'phone',
        'company',
        'message_copy',
    ]
    
    @staticmethod
    def check_honeypot(form_data: Dict[str, Any]) -> Optional[SecurityViolation]:
        """檢查蜂蜜罐欄位"""
        for field in HoneyPotDetector.HONEYPOT_FIELDS:
            if field in form_data and form_data[field]:
                return SecurityViolation(
                    violation_type='honeypot_triggered',
                    severity='high',
                    message=f'蜂蜜罐欄位被填入: {field}',
                    client_ip=request.remote_addr or 'unknown',
                    user_agent=request.headers.get('User-Agent', 'unknown'),
                    timestamp=datetime.now(timezone.utc),
                    details={'triggered_field': field, 'value_length': len(str(form_data[field]))}
                )
        return None


class ContentValidator:
    """內容驗證器"""
    
    SPAM_KEYWORDS = [
        'viagra', 'casino', 'poker', 'lottery', 'winner', 'congratulations',
        'click here', 'buy now', 'limited time', 'act now', 'free money',
        'get rich', 'work from home', '100% free', 'no obligation',
        '賺錢', '中獎', '免費', '點擊這裡', '立即購買', '限時優惠'
    ]
    
    MALICIOUS_URL_PATTERNS = [
        r'bit\.ly',
        r'tinyurl\.com',
        r'goo\.gl',
        r't\.co',
    ]
    
    @staticmethod
    def check_spam_content(text: str) -> Optional[SecurityViolation]:
        """檢查垃圾內容"""
        if not text:
            return None
        
        text_lower = text.lower()
        
        spam_count = 0
        found_keywords = []
        
        for keyword in ContentValidator.SPAM_KEYWORDS:
            if keyword in text_lower:
                spam_count += 1
                found_keywords.append(keyword)
        
        if spam_count >= 3:
            return SecurityViolation(
                violation_type='spam_content',
                severity='medium',
                message=f'檢測到 {spam_count} 個垃圾關鍵詞',
                client_ip=request.remote_addr or 'unknown',
                user_agent=request.headers.get('User-Agent', 'unknown'),
                timestamp=datetime.now(timezone.utc),
                details={'spam_count': spam_count, 'keywords': found_keywords}
            )
        
        return None
    
    @staticmethod
    def check_malicious_urls(text: str) -> Optional[SecurityViolation]:
        """檢查惡意 URL"""
        if not text:
            return None
        
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        urls = re.findall(url_pattern, text, re.IGNORECASE)
        
        malicious_urls = []
        for url in urls:
            for pattern in ContentValidator.MALICIOUS_URL_PATTERNS:
                if re.search(pattern, url, re.IGNORECASE):
                    malicious_urls.append(url)
        
        if malicious_urls:
            return SecurityViolation(
                violation_type='malicious_url',
                severity='high',
                message=f'檢測到可疑 URL',
                client_ip=request.remote_addr or 'unknown',
                user_agent=request.headers.get('User-Agent', 'unknown'),
                timestamp=datetime.now(timezone.utc),
                details={'urls': malicious_urls}
            )
        
        return None
    
    @staticmethod
    def check_excessive_length(text: str, max_length: int = 10000) -> Optional[SecurityViolation]:
        """檢查過長內容"""
        if text and len(text) > max_length:
            return SecurityViolation(
                violation_type='excessive_length',
                severity='low',
                message=f'內容長度超過限制 ({len(text)} > {max_length})',
                client_ip=request.remote_addr or 'unknown',
                user_agent=request.headers.get('User-Agent', 'unknown'),
                timestamp=datetime.now(timezone.utc),
                details={'actual_length': len(text), 'max_length': max_length}
            )
        return None


class RateLimiter:
    """改進的速率限制器"""
    
    def __init__(self, redis_client=None):
        self.redis = redis_client or self._get_redis_client()
    
    def _get_redis_client(self):
        """獲取 Redis 客戶端"""
        try:
            import redis
            return redis.Redis(
                host=current_app.config.get('REDIS_HOST', 'localhost'),
                port=current_app.config.get('REDIS_PORT', 6379),
                db=current_app.config.get('REDIS_DB', 0),
                decode_responses=True
            )
        except:
            current_app.logger.warning("Redis not available, using in-memory rate limiting")
            return None
    
    def is_rate_limited(self, key: str, limit: int, window: int) -> bool:
        """檢查是否超過速率限制"""
        if not self.redis:
            return False
        
        try:
            now = time.time()
            pipeline = self.redis.pipeline()
            
            pipeline.zremrangebyscore(key, '-inf', now - window)
            
            pipeline.zcard(key)
            
            pipeline.zadd(key, {str(now): now})
            
            pipeline.expire(key, window)
            
            results = pipeline.execute()
            current_count = results[1]
            
            return current_count >= limit
            
        except Exception as e:
            current_app.logger.error(f"Rate limiting error: {e}")
            return False
    
    def get_rate_limit_key(self, prefix: str, identifier: str) -> str:
        """生成速率限制鍵值"""
        ip_hash = hashlib.sha256(identifier.encode()).hexdigest()[:16]
        return f"rate_limit:{prefix}:{ip_hash}"


class SimilarContentDetector:
    """相似內容檢測器"""
    
    def __init__(self, redis_client=None):
        self.redis = redis_client or self._get_redis_client()
    
    def _get_redis_client(self):
        """獲取 Redis 客戶端"""
        try:
            import redis
            return redis.Redis(
                host=current_app.config.get('REDIS_HOST', 'localhost'),
                port=current_app.config.get('REDIS_PORT', 6379),
                db=current_app.config.get('REDIS_DB', 0),
                decode_responses=True
            )
        except:
            return None
    
    def _get_content_hash(self, text: str) -> str:
        """生成內容雜湊值"""
        normalized = re.sub(r'[^\w\s]', '', text.lower().strip())
        normalized = ' '.join(normalized.split())
        
        return hashlib.sha256(normalized.encode()).hexdigest()
    
    def is_similar_content(self, text: str, window_minutes: int = 30) -> bool:
        """檢查是否為相似內容"""
        if not self.redis or not text.strip():
            return False
        
        try:
            content_hash = self._get_content_hash(text)
            key = f"content_hash:{content_hash}"
            
            if self.redis.exists(key):
                return True
            
            self.redis.setex(key, window_minutes * 60, 1)
            return False
            
        except Exception as e:
            current_app.logger.error(f"Similar content detection error: {e}")
            return False


class SupportSecurityManager:
    """支援系統安全管理器"""
    
    def __init__(self):
        self.rate_limiter = RateLimiter()
        self.content_detector = SimilarContentDetector()
        self.violations: List[SecurityViolation] = []
    
    def validate_ticket_creation(self, form_data: Dict[str, Any], client_ip: str) -> List[SecurityViolation]:
        """驗證工單建立請求"""
        violations = []
        
        honeypot_violation = HoneyPotDetector.check_honeypot(form_data)
        if honeypot_violation:
            violations.append(honeypot_violation)
        
        if self.rate_limiter.is_rate_limited(
            self.rate_limiter.get_rate_limit_key('ticket_create', client_ip),
            limit=5,
            window=300  # 5分鐘
        ):
            violations.append(SecurityViolation(
                violation_type='rate_limit_exceeded',
                severity='medium',
                message='建立工單速率限制超出',
                client_ip=client_ip,
                user_agent=request.headers.get('User-Agent', 'unknown'),
                timestamp=datetime.now(timezone.utc),
                details={'limit': 5, 'window': 300}
            ))
        
        subject = form_data.get('subject', '')
        body = form_data.get('body', '')
        
        spam_violation = ContentValidator.check_spam_content(f"{subject} {body}")
        if spam_violation:
            violations.append(spam_violation)
        
        url_violation = ContentValidator.check_malicious_urls(body)
        if url_violation:
            violations.append(url_violation)
        
        length_violation = ContentValidator.check_excessive_length(body)
        if length_violation:
            violations.append(length_violation)
        
        if self.content_detector.is_similar_content(f"{subject}|{body}"):
            violations.append(SecurityViolation(
                violation_type='duplicate_content',
                severity='low',
                message='檢測到相似內容',
                client_ip=client_ip,
                user_agent=request.headers.get('User-Agent', 'unknown'),
                timestamp=datetime.now(timezone.utc),
                details={}
            ))
        
        self.violations.extend(violations)
        
        return violations
    
    def validate_message_creation(self, form_data: Dict[str, Any], client_ip: str) -> List[SecurityViolation]:
        """驗證訊息建立請求"""
        violations = []
        
        if self.rate_limiter.is_rate_limited(
            self.rate_limiter.get_rate_limit_key('message_create', client_ip),
            limit=10,
            window=60
        ):
            violations.append(SecurityViolation(
                violation_type='rate_limit_exceeded',
                severity='medium',
                message='訊息發送速率限制超出',
                client_ip=client_ip,
                user_agent=request.headers.get('User-Agent', 'unknown'),
                timestamp=datetime.now(timezone.utc),
                details={'limit': 10, 'window': 60}
            ))
        
        body = form_data.get('body', '')
        
        spam_violation = ContentValidator.check_spam_content(body)
        if spam_violation:
            violations.append(spam_violation)
        
        url_violation = ContentValidator.check_malicious_urls(body)
        if url_violation:
            violations.append(url_violation)
        
        self.violations.extend(violations)
        
        return violations
    
    def sanitize_content(self, content: str, allow_html: bool = False) -> str:
        """清理內容"""
        if not content:
            return ""
        
        content = re.sub(r'\s+', ' ', content.strip())
        
        if allow_html:
            content = sanitize_html(content)
        else:
            content = re.sub(r'<[^>]+>', '', content)
        
        content = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', content)
        
        return content
    
    def log_violations(self, violations: List[SecurityViolation]):
        """記錄安全違規"""
        for violation in violations:
            current_app.logger.warning(
                f"Security violation: {violation.violation_type} "
                f"[{violation.severity}] from {violation.client_ip}: {violation.message}"
            )
            
    
    def should_block_request(self, violations: List[SecurityViolation]) -> bool:
        """判斷是否應該阻擋請求"""
        if not violations:
            return False
        
        for violation in violations:
            if violation.severity in ['high', 'critical']:
                return True
        
        medium_count = sum(1 for v in violations if v.severity == 'medium')
        if medium_count >= 2:
            return True
        
        return False


security_manager = SupportSecurityManager()