#!/usr/bin/env python3
"""
增強錯誤日誌記錄系統
提供詳細的錯誤跟蹤和上下文信息
"""
import logging
import traceback
import sys
import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from functools import wraps
from utils.db import get_session
from models.social_publishing import SocialPost, PostStatus

# 配置日誌格式
DETAILED_LOG_FORMAT = '%(asctime)s | %(levelname)s | %(name)s:%(lineno)d | %(funcName)s() | %(message)s'

class ErrorLogger:
    """增強的錯誤日誌記錄器"""
    
    def __init__(self, name: str = __name__):
        self.logger = logging.getLogger(name)
        self.setup_logging()
    
    def setup_logging(self):
        """設置日誌配置"""
        # 如果還沒有設置處理器，才添加
        if not self.logger.handlers:
            # 控制台處理器
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.INFO)
            console_formatter = logging.Formatter(DETAILED_LOG_FORMAT)
            console_handler.setFormatter(console_formatter)
            self.logger.addHandler(console_handler)
            
            # 文件處理器（如果可以創建文件）
            try:
                log_dir = os.path.join(os.getcwd(), 'logs')
                os.makedirs(log_dir, exist_ok=True)
                
                file_handler = logging.FileHandler(
                    os.path.join(log_dir, 'social_media_errors.log'),
                    encoding='utf-8'
                )
                file_handler.setLevel(logging.ERROR)
                file_formatter = logging.Formatter(DETAILED_LOG_FORMAT)
                file_handler.setFormatter(file_formatter)
                self.logger.addHandler(file_handler)
                
            except Exception:
                # 如果無法創建文件處理器，忽略
                pass
            
            self.logger.setLevel(logging.INFO)
    
    def log_social_post_error(self, 
                             post_id: int, 
                             error: Exception, 
                             context: Dict[str, Any] = None,
                             operation: str = "unknown"):
        """記錄社交媒體貼文相關錯誤"""
        
        error_info = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'post_id': post_id,
            'operation': operation,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'traceback': traceback.format_exc(),
            'context': context or {}
        }
        
        # 嘗試獲取貼文詳細信息
        try:
            with get_session() as db:
                post = db.query(SocialPost).filter(SocialPost.id == post_id).first()
                if post:
                    error_info['post_details'] = {
                        'forum_post_id': post.forum_post_id,
                        'account_id': post.account_id,
                        'status': post.status,
                        'retry_count': post.retry_count,
                        'created_at': post.created_at.isoformat() if post.created_at else None,
                        'has_image': bool(post.generated_image_url),
                        'has_caption': bool(post.generated_caption)
                    }
        except Exception:
            # 如果無法獲取貼文信息，繼續記錄錯誤
            pass
        
        # 記錄到日誌
        self.logger.error(
            f"社交貼文錯誤 [ID:{post_id}] [{operation}] {type(error).__name__}: {error}",
            extra={'error_details': error_info}
        )
        
        # 更新數據庫中的錯誤信息
        self._update_post_error(post_id, str(error))
        
        return error_info
    
    def log_content_generation_error(self,
                                   forum_post_id: int,
                                   template_id: Optional[int],
                                   error: Exception,
                                   step: str = "unknown"):
        """記錄內容生成錯誤"""
        
        error_info = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'forum_post_id': forum_post_id,
            'template_id': template_id,
            'generation_step': step,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'traceback': traceback.format_exc()
        }
        
        self.logger.error(
            f"內容生成錯誤 [論壇貼文:{forum_post_id}] [{step}] {type(error).__name__}: {error}",
            extra={'error_details': error_info}
        )
        
        return error_info
    
    def log_api_error(self,
                     endpoint: str,
                     method: str,
                     error: Exception,
                     request_data: Dict[str, Any] = None,
                     user_id: Optional[int] = None):
        """記錄 API 錯誤"""
        
        error_info = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'endpoint': endpoint,
            'method': method,
            'user_id': user_id,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'traceback': traceback.format_exc(),
            'request_data': request_data or {}
        }
        
        self.logger.error(
            f"API 錯誤 [{method}] {endpoint} {type(error).__name__}: {error}",
            extra={'error_details': error_info}
        )
        
        return error_info
    
    def log_publishing_error(self,
                           post_id: int,
                           platform: str,
                           error: Exception,
                           publish_data: Dict[str, Any] = None):
        """記錄發布錯誤"""
        
        error_info = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'post_id': post_id,
            'platform': platform,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'traceback': traceback.format_exc(),
            'publish_data': publish_data or {}
        }
        
        self.logger.error(
            f"發布錯誤 [貼文:{post_id}] [{platform}] {type(error).__name__}: {error}",
            extra={'error_details': error_info}
        )
        
        return error_info
    
    def _update_post_error(self, post_id: int, error_message: str):
        """更新貼文的錯誤信息"""
        try:
            with get_session() as db:
                post = db.query(SocialPost).filter(SocialPost.id == post_id).first()
                if post:
                    # 限制錯誤信息長度，避免數據庫字段溢出
                    truncated_message = error_message[:500] + "..." if len(error_message) > 500 else error_message
                    
                    post.error_message = truncated_message
                    post.updated_at = datetime.now(timezone.utc)
                    post.retry_count = post.retry_count + 1
                    
                    # 如果重試次數過多，標記為失敗
                    if post.retry_count >= 3 and post.status != PostStatus.FAILED:
                        post.status = PostStatus.FAILED
                    
                    db.commit()
        except Exception:
            # 如果更新失敗，不影響原始錯誤的記錄
            pass

def log_errors(operation: str = "unknown"):
    """裝飾器：自動記錄函數執行中的錯誤"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            error_logger = ErrorLogger(func.__module__)
            try:
                return func(*args, **kwargs)
            except Exception as e:
                # 嘗試從參數中提取有用信息
                context = {
                    'function': func.__name__,
                    'args_count': len(args),
                    'kwargs_keys': list(kwargs.keys())
                }
                
                # 如果第一個參數看起來像 post_id
                if args and isinstance(args[0], int):
                    error_logger.log_social_post_error(args[0], e, context, operation)
                else:
                    error_logger.logger.error(
                        f"函數錯誤 [{func.__name__}] [{operation}] {type(e).__name__}: {e}",
                        exc_info=True
                    )
                
                raise  # 重新拋出異常
        return wrapper
    return decorator

def create_error_summary() -> Dict[str, Any]:
    """創建錯誤摘要報告"""
    try:
        with get_session() as db:
            # 統計失敗貼文
            failed_posts = db.query(SocialPost).filter(
                SocialPost.status == PostStatus.FAILED
            ).all()
            
            error_patterns = {}
            for post in failed_posts:
                if post.error_message:
                    # 提取錯誤類型
                    error_type = post.error_message.split(':')[0] if ':' in post.error_message else 'Unknown'
                    error_patterns[error_type] = error_patterns.get(error_type, 0) + 1
            
            summary = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'total_failed_posts': len(failed_posts),
                'error_patterns': error_patterns,
                'recent_failures': [
                    {
                        'post_id': post.id,
                        'forum_post_id': post.forum_post_id,
                        'error': post.error_message[:100] + "..." if post.error_message and len(post.error_message) > 100 else post.error_message,
                        'retry_count': post.retry_count,
                        'updated_at': post.updated_at.isoformat() if post.updated_at else None
                    }
                    for post in sorted(failed_posts, key=lambda p: p.updated_at or p.created_at, reverse=True)[:10]
                ]
            }
            
            return summary
            
    except Exception as e:
        return {
            'error': f'無法生成錯誤摘要: {e}',
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

# 全域錯誤記錄器實例
social_media_error_logger = ErrorLogger('social_media')

# 便捷函數
def log_post_error(post_id: int, error: Exception, context: Dict = None, operation: str = "unknown"):
    """便捷函數：記錄貼文錯誤"""
    return social_media_error_logger.log_social_post_error(post_id, error, context, operation)

def log_generation_error(forum_post_id: int, template_id: int, error: Exception, step: str = "unknown"):
    """便捷函數：記錄生成錯誤"""
    return social_media_error_logger.log_content_generation_error(forum_post_id, template_id, error, step)

def log_api_error(endpoint: str, method: str, error: Exception, request_data: Dict = None, user_id: int = None):
    """便捷函數：記錄 API 錯誤"""
    return social_media_error_logger.log_api_error(endpoint, method, error, request_data, user_id)