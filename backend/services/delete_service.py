"""
刪文管理服務
統一處理所有刪文相關操作，確保數據一致性和完整性
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from models import Post, DeleteRequest, User, Media, Comment
from utils.ratelimit import get_client_ip
import os
from pathlib import Path
from utils.fsops import UPLOAD_ROOT


class DeleteService:
    """刪文管理服務"""
    
    @staticmethod
    def create_delete_request(s: Session, post_id: int, reason: str, requester_id: Optional[int] = None) -> Dict[str, Any]:
        """
        創建刪文請求
        
        Args:
            s: 數據庫會話
            post_id: 貼文ID
            reason: 刪文理由
            requester_id: 請求者ID（可選）
            
        Returns:
            包含操作結果的字典
        """
        try:
            # 檢查貼文是否存在且未被刪除
            post = s.query(Post).filter(
                and_(
                    Post.id == post_id,
                    Post.is_deleted == False
                )
            ).first()
            
            if not post:
                return {"success": False, "error": "貼文不存在或已被刪除"}
            
            # 檢查是否為廣告貼文，廣告貼文不可申請刪除
            if post.is_advertisement:
                return {"success": False, "error": "廣告貼文不可申請刪除"}
            
            # 檢查是否已有待審核的刪文請求
            existing_request = s.query(DeleteRequest).filter(
                and_(
                    DeleteRequest.post_id == post_id,
                    DeleteRequest.status == "pending"
                )
            ).first()
            
            if existing_request:
                return {"success": False, "error": "該貼文已有待審核的刪文請求"}
            
            # 創建刪文請求
            delete_request = DeleteRequest(
                post_id=post_id,
                reason=reason,
                requester_ip=get_client_ip(),
                requester_user_agent=os.environ.get('HTTP_USER_AGENT', ''),
                status="pending"
            )
            
            s.add(delete_request)
            
            # 更新貼文的刪文請求計數
            post.delete_request_count += 1
            
            s.commit()
            
            return {
                "success": True,
                "delete_request_id": delete_request.id,
                "message": "刪文請求已提交，等待管理員審核"
            }
            
        except Exception as e:
            s.rollback()
            return {"success": False, "error": f"創建刪文請求失敗: {str(e)}"}
    
    @staticmethod
    def approve_delete_request(s: Session, request_id: int, moderator_id: int, note: Optional[str] = None) -> Dict[str, Any]:
        """
        批准刪文請求
        
        Args:
            s: 數據庫會話
            request_id: 刪文請求ID
            moderator_id: 審核者ID
            note: 審核備註
            
        Returns:
            包含操作結果的字典
        """
        try:
            # 查找刪文請求
            delete_request = s.query(DeleteRequest).filter(
                and_(
                    DeleteRequest.id == request_id,
                    DeleteRequest.status == "pending"
                )
            ).first()
            
            if not delete_request:
                return {"success": False, "error": "刪文請求不存在或已被處理"}
            
            # 查找貼文
            post = s.query(Post).filter(
                and_(
                    Post.id == delete_request.post_id,
                    Post.is_deleted == False
                )
            ).first()
            
            if not post:
                return {"success": False, "error": "貼文不存在或已被刪除"}
            
            # 檢查權限：公告只能由 dev_admin 審理
            moderator = s.query(User).filter(User.id == moderator_id).first()
            if post.is_announcement and moderator and moderator.role != 'dev_admin':
                return {"success": False, "error": "公告只能由系統管理員審理"}
            
            # 開始事務處理
            # 1. 更新刪文請求狀態
            delete_request.status = "approved"
            delete_request.reviewed_by = moderator_id
            delete_request.reviewed_at = datetime.now(timezone.utc)
            delete_request.review_note = note
            
            # 2. 標記貼文為已刪除
            post.is_deleted = True
            post.deleted_at = datetime.now(timezone.utc)
            post.deleted_by = moderator_id
            post.delete_reason = delete_request.reason
            
            # 3. 軟刪除相關媒體
            media_list = s.query(Media).filter(Media.post_id == post.id).all()
            for media in media_list:
                media.is_deleted = True
                media.deleted_at = datetime.now(timezone.utc)
                media.deleted_by = moderator_id
                
                # 嘗試刪除實體檔案
                try:
                    if media.path and media.path.startswith('public/'):
                        abs_path = (Path(UPLOAD_ROOT) / media.path).resolve()
                        if str(abs_path).startswith(str(Path(UPLOAD_ROOT).resolve())) and abs_path.exists():
                            os.remove(abs_path)
                except Exception:
                    pass  # 檔案刪除失敗不影響主流程
            
            # 4. 軟刪除相關留言
            comments = s.query(Comment).filter(Comment.post_id == post.id).all()
            for comment in comments:
                comment.is_deleted = True
                comment.deleted_at = datetime.now(timezone.utc)
                comment.deleted_by = moderator_id
            
            # 5. 寫入審核日誌
            try:
                s.execute(
                    "INSERT INTO moderation_logs (target_type, target_id, action, old_status, new_status, reason, moderator_id) VALUES (:tt, :ti, :ac, :os, :ns, :rs, :mi)",
                    {
                        "tt": "post", 
                        "ti": post.id, 
                        "ac": "delete_approved", 
                        "os": "active", 
                        "ns": "deleted", 
                        "rs": delete_request.reason, 
                        "mi": moderator_id
                    }
                )
            except Exception:
                pass  # 日誌寫入失敗不影響主流程
            
            s.commit()
            
            return {
                "success": True,
                "message": "刪文請求已批准，貼文及相關內容已刪除",
                "deleted_post_id": post.id,
                "deleted_media_count": len(media_list),
                "deleted_comments_count": len(comments)
            }
            
        except Exception as e:
            s.rollback()
            return {"success": False, "error": f"批准刪文請求失敗: {str(e)}"}
    
    @staticmethod
    def reject_delete_request(s: Session, request_id: int, moderator_id: int, note: Optional[str] = None) -> Dict[str, Any]:
        """
        拒絕刪文請求
        
        Args:
            s: 數據庫會話
            request_id: 刪文請求ID
            moderator_id: 審核者ID
            note: 拒絕理由
            
        Returns:
            包含操作結果的字典
        """
        try:
            # 查找刪文請求
            delete_request = s.query(DeleteRequest).filter(
                and_(
                    DeleteRequest.id == request_id,
                    DeleteRequest.status == "pending"
                )
            ).first()
            
            if not delete_request:
                return {"success": False, "error": "刪文請求不存在或已被處理"}
            
            # 查找貼文以檢查權限
            post = s.query(Post).filter(Post.id == delete_request.post_id).first()
            if post:
                # 檢查權限：公告只能由 dev_admin 審理
                moderator = s.query(User).filter(User.id == moderator_id).first()
                if post.is_announcement and moderator and moderator.role != 'dev_admin':
                    return {"success": False, "error": "公告只能由系統管理員審理"}
            
            # 更新刪文請求狀態
            delete_request.status = "rejected"
            delete_request.reviewed_by = moderator_id
            delete_request.reviewed_at = datetime.now(timezone.utc)
            delete_request.review_note = note
            
            # 寫入審核日誌
            try:
                s.execute(
                    "INSERT INTO moderation_logs (target_type, target_id, action, old_status, new_status, reason, moderator_id) VALUES (:tt, :ti, :ac, :os, :ns, :rs, :mi)",
                    {
                        "tt": "delete_request", 
                        "ti": delete_request.id, 
                        "ac": "delete_rejected", 
                        "os": "pending", 
                        "ns": "rejected", 
                        "rs": note or "管理員拒絕", 
                        "mi": moderator_id
                    }
                )
            except Exception:
                pass
            
            s.commit()
            
            return {
                "success": True,
                "message": "刪文請求已拒絕",
                "rejected_request_id": delete_request.id
            }
            
        except Exception as e:
            s.rollback()
            return {"success": False, "error": f"拒絕刪文請求失敗: {str(e)}"}
    
    @staticmethod
    def get_delete_requests(s: Session, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """
        獲取刪文請求列表
        
        Args:
            s: 數據庫會話
            status: 過濾狀態（pending, approved, rejected）
            limit: 返回數量限制
            
        Returns:
            刪文請求列表
        """
        query = s.query(DeleteRequest).join(Post)
        
        if status:
            query = query.filter(DeleteRequest.status == status)
        
        requests = query.order_by(DeleteRequest.created_at.desc()).limit(limit).all()
        
        result = []
        for req in requests:
            post = req.post
            # 獲取貼文的媒體檔案
            media_files = []
            if post:
                media_files = s.query(Media).filter(Media.post_id == post.id).all()
            
            result.append({
                'id': req.id,
                'post_id': req.post_id,
                'reason': req.reason,
                'status': req.status,
                'created_at': req.created_at.isoformat() if req.created_at else None,
                'reviewed_at': req.reviewed_at.isoformat() if req.reviewed_at else None,
                'review_note': req.review_note,
                'post_content': post.content if post else '',
                'post_author_id': post.author_id if post else None,
                'post_created_at': post.created_at.isoformat() if post and post.created_at else None,
                'requester_ip': req.requester_ip,
                'requester_user_agent': req.requester_user_agent,
                'media_files': [
                    {
                        'id': media.id,
                        'file_name': media.file_name,
                        'file_type': media.file_type,
                        'path': media.path,
                        # 若已發布(public/)，直接給靜態路徑；否則留空交由前端授權端點抓取
                        'preview_url': (f"/uploads/{media.path}" if (media.path or '').startswith('public/') else None),
                    }
                    for media in media_files
                ]
            })
        
        return result
    
    @staticmethod
    def get_post_delete_status(s: Session, post_id: int) -> Dict[str, Any]:
        """
        獲取貼文的刪文狀態
        
        Args:
            s: 數據庫會話
            post_id: 貼文ID
            
        Returns:
            貼文刪文狀態信息
        """
        post = s.query(Post).filter(Post.id == post_id).first()
        
        if not post:
            return {"exists": False}
        
        # 獲取相關的刪文請求
        delete_requests = s.query(DeleteRequest).filter(
            DeleteRequest.post_id == post_id
        ).order_by(DeleteRequest.created_at.desc()).all()
        
        return {
            "exists": True,
            "is_deleted": post.is_deleted,
            "deleted_at": post.deleted_at.isoformat() if post.deleted_at else None,
            "delete_reason": post.delete_reason,
            "delete_request_count": post.delete_request_count,
            "delete_requests": [
                {
                    'id': req.id,
                    'reason': req.reason,
                    'status': req.status,
                    'created_at': req.created_at.isoformat() if req.created_at else None,
                    'reviewed_at': req.reviewed_at.isoformat() if req.reviewed_at else None,
                    'review_note': req.review_note
                }
                for req in delete_requests
            ]
        }
