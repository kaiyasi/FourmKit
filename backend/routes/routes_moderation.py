from flask import Blueprint, jsonify, request, abort, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_, or_
from models import Post, Media, User, ModerationLog, School, Comment, PostReaction
from utils.db import get_session
from utils.authz import require_role
from utils.fsops import ensure_within, UPLOAD_ROOT
from utils.upload_utils import publish_media_by_id, infer_ext_from_mime
from utils.school_permissions import can_moderate_content
from utils.admin_events import log_content_moderation
import mimetypes
from pathlib import Path
import os
import re
import hmac, hashlib, time, base64
from datetime import datetime, timedelta
from typing import Dict, List, Optional

bp = Blueprint("moderation", __name__, url_prefix="/api/moderation")

# 審核狀態枚舉
MODERATION_STATUS = {
    "PENDING": "pending",
    "APPROVED": "approved",
    "REJECTED": "rejected",
}

# 審核類型枚舉
MODERATION_TYPE = {"POST": "post", "MEDIA": "media", "COMMENT": "comment"}


def _markdown_to_html(md: str) -> str:
    """將Markdown轉換為HTML"""
    if not md:
        return ""

    # 檢測是否已經是HTML格式（包含HTML標籤）
    if re.search(r"<[^>]+>", md):
        # 如果已經是HTML，直接返回，但進行安全清理
        from utils.sanitize import clean_html

        return clean_html(md)

    # 先轉義HTML特殊字符
    def escape_html(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    # 處理程式碼區塊（先保存）
    code_blocks = []

    def save_code_block(match):
        code_blocks.append(match.group(1))
        return f"__CODE_BLOCK_{len(code_blocks)-1}__"

    md = re.sub(r"```([\s\S]*?)```", save_code_block, md)

    # 轉義HTML
    md = escape_html(md)

    # 處理標題（在段落處理之前）
    md = re.sub(r"^#{6}\s*(.+)$", r"<h6>\1</h6>", md, flags=re.MULTILINE)
    md = re.sub(r"^#{5}\s*(.+)$", r"<h5>\1</h5>", md, flags=re.MULTILINE)
    md = re.sub(r"^#{4}\s*(.+)$", r"<h4>\1</h4>", md, flags=re.MULTILINE)
    md = re.sub(r"^#{3}\s*(.+)$", r"<h3>\1</h3>", md, flags=re.MULTILINE)
    md = re.sub(r"^#{2}\s*(.+)$", r"<h2>\1</h2>", md, flags=re.MULTILINE)
    md = re.sub(r"^#{1}\s*(.+)$", r"<h1>\1</h1>", md, flags=re.MULTILINE)

    # 處理粗體和斜體
    md = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", md)
    md = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", md)

    # 處理行內程式碼
    md = re.sub(r"`([^`]+)`", r"<code>\1</code>", md)

    # 處理連結
    md = re.sub(
        r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
        r'<a href="\2" target="_blank" rel="noreferrer">\1</a>',
        md,
    )

    # 處理清單和段落
    lines = md.split("\n")
    result_lines = []
    in_list = False
    in_quote = False

    for line in lines:
        line = line.strip()
        if not line:
            if in_list:
                result_lines.append("</ul>")
                in_list = False
            if in_quote:
                result_lines.append("</blockquote>")
                in_quote = False
            continue

        # 處理引用區段 (> 開頭)
        if line.startswith("> "):
            if not in_quote:
                result_lines.append("<blockquote>")
                in_quote = True
            content = line[2:]  # 移除 '> '
            result_lines.append(f"<p>{content}</p>")
            continue
        elif in_quote:
            result_lines.append("</blockquote>")
            in_quote = False

        # 處理橫隔線 (---)
        if line == "---":
            if in_list:
                result_lines.append("</ul>")
                in_list = False
            result_lines.append("<hr>")
            continue

        if re.match(r"^[-*]\s+", line):
            if not in_list:
                result_lines.append("<ul>")
                in_list = True
            # 移除列表標記並包裝內容
            content = re.sub(r"^[-*]\s+", "", line)
            result_lines.append(f"<li>{content}</li>")
        else:
            if in_list:
                result_lines.append("</ul>")
                in_list = False
            # 檢查是否已經是標題
            if line.startswith("<h"):
                result_lines.append(line)
            else:
                result_lines.append(f"<p>{line}</p>")

    if in_list:
        result_lines.append("</ul>")
    if in_quote:
        result_lines.append("</blockquote>")

    html = "\n".join(result_lines)

    # 恢復程式碼區塊
    def restore_code_block(match):
        idx = int(match.group(1))
        code = code_blocks[idx]
        return f"<pre><code>{escape_html(code)}</code></pre>"

    html = re.sub(r"__CODE_BLOCK_(\d+)__", restore_code_block, html)

    return html


def write_log(
    s: Session,
    ttype: str,
    tid: int,
    act: str,
    old: str | None,
    new: str,
    reason: str | None,
    mid: int,
):
    """Insert a moderation log entry. Use SQLAlchemy text() for 2.x compatibility."""
    try:
        s.execute(
            text(
                """
                INSERT INTO moderation_logs
                    (target_type, target_id, action, old_status, new_status, reason, moderator_id)
                VALUES
                    (:tt, :ti, :ac, :os, :ns, :rs, :mi)
                """
            ),
            {"tt": ttype, "ti": tid, "ac": act, "os": old, "ns": new, "rs": reason, "mi": mid},
        )
    except Exception:
        # 如果寫入日誌失敗，不影響主流程（避免 500）
        # 讓呼叫端照常提交主要交易
        pass


def _get_signed_media_url(mid: int) -> str | None:
    """生成媒體的簽名預覽URL"""
    try:
        ttl = int(os.getenv("MEDIA_PREVIEW_TTL", "120"))
        exp = int(time.time()) + max(30, min(600, ttl))
        secret = os.getenv("MEDIA_PREVIEW_SECRET", os.getenv("SECRET_KEY", "dev-only-key-not-for-production"))
        sig = _sign(mid, exp, secret)
        # 使用絕對路徑，確保前端能正確訪問
        url = f"/api/moderation/media/preview?mid={mid}&exp={exp}&sig={sig}"

        # 檢查URL長度，避免過長導致413錯誤
        if len(url) > 2000:  # 一般瀏覽器URL長度限制約2000字符
            print(f"Warning: Generated URL too long ({len(url)} chars) for media {mid}")
            # 如果URL太長，使用更短的簽名格式
            short_sig = sig[:16]  # 只取前16個字符
            url = f"/api/moderation/media/preview?mid={mid}&exp={exp}&sig={short_sig}"
            print(f"Using shortened URL ({len(url)} chars): {url}")

        return url
    except Exception as e:
        print(f"Error generating signed URL for media {mid}: {e}")
        return None


def _sign(mid: int, exp: int, secret: str) -> str:
    msg = f"{mid}.{exp}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).rstrip(b"=").decode("ascii")


def _verify(mid: int, exp: int, sig: str, secret: str) -> bool:
    if exp < int(time.time()):
        return False
    try:
        expected = _sign(mid, exp, secret)
        # 支援完整簽名和短簽名（前16字符）
        if len(sig) <= 16:
            # 短簽名驗證
            return hmac.compare_digest(expected[:16], sig)
        else:
            # 完整簽名驗證
            return hmac.compare_digest(expected, sig)
    except Exception:
        return False


@bp.get("/queue")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_moderation_queue():
    """獲取審核隊列"""
    try:
        # 獲取查詢參數
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)
        status = request.args.get("status", MODERATION_STATUS["PENDING"])
        content_type = request.args.get("type")  # post, media, comment
        school_slug = request.args.get("school")
        client_id = request.args.get("client_id")
        ip = request.args.get("ip")

        with get_session() as s:
            # 獲取用戶資訊和權限
            user_id = get_jwt_identity()
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 401

            # 構建查詢條件
            posts_query = s.query(Post).filter(Post.status == status)
            
            # 媒體查詢：不單獨顯示媒體，只通過貼文來審核
            media_query = s.query(Media).filter(text("1=0"))  # 不返回任何媒體

            # 根據內容類型篩選
            if content_type == MODERATION_TYPE["POST"]:
                media_query = media_query.filter(text("1=0"))  # 不返回媒體
            elif content_type == MODERATION_TYPE["MEDIA"]:
                posts_query = posts_query.filter(text("1=0"))  # 不返回貼文

            # 根據學校篩選
            if school_slug:
                school = s.query(School).filter(School.slug == school_slug).first()
                if school:
                    posts_query = posts_query.filter(Post.school_id == school.id)
                    media_query = media_query.filter(Media.school_id == school.id)

            # 根據用戶權限篩選
            if user.role in ["campus_admin", "campus_moderator"]:
                if user.school_id:
                    posts_query = posts_query.filter(Post.school_id == user.school_id)
                    media_query = media_query.filter(Media.school_id == user.school_id)
                else:
                    # 無綁定學校時，不顯示任何資料
                    posts_query = posts_query.filter(text("1=0"))
                    media_query = media_query.filter(text("1=0"))
            elif user.role in ["cross_admin", "cross_moderator"]:
                posts_query = posts_query.filter(Post.school_id.is_(None))
                media_query = media_query.filter(Media.school_id.is_(None))

            # 根據client_id和IP篩選
            if client_id:
                posts_query = posts_query.filter(Post.client_id.ilike(f"%{client_id}%"))
                media_query = media_query.filter(Media.client_id.ilike(f"%{client_id}%"))

            if ip:
                posts_query = posts_query.filter(Post.ip.ilike(f"%{ip}%"))
                media_query = media_query.filter(Media.ip.ilike(f"%{ip}%"))

            # 分頁查詢
            posts_offset = (page - 1) * per_page
            media_offset = (page - 1) * per_page

            posts = (
                posts_query.order_by(Post.id.desc()).offset(posts_offset).limit(per_page).all()
            )
            media = (
                media_query.order_by(Media.id.desc()).offset(media_offset).limit(per_page).all()
            )

            # 處理貼文數據
            posts_data = []
            for post in posts:
                # 獲取學校名稱
                school_name = None
                if post.school_id:
                    school = s.query(School).filter(School.id == post.school_id).first()
                    if school:
                        school_name = school.name

                # 獲取作者資訊
                author_info = None
                if post.author_id:
                    author = s.query(User).filter(User.id == post.author_id).first()
                    if author:
                        author_info = {
                            "id": author.id,
                            "username": author.username,
                            "school_name": school_name,
                        }

                # 獲取貼文的媒體附件
                post_media = []
                media_items = s.query(Media).filter(Media.post_id == post.id).all()
                for media_item in media_items:
                    preview_url = _get_signed_media_url(media_item.id)
                    post_media.append(
                        {
                            "id": media_item.id,
                            "file_name": media_item.file_name,
                            "file_size": media_item.file_size,
                            "file_type": media_item.file_type,
                            "mime_type": media_item.mime_type,
                            "path": media_item.path,
                            "preview_url": preview_url,
                            "status": media_item.status,
                        }
                    )

                posts_data.append(
                    {
                        "id": post.id,
                        "type": MODERATION_TYPE["POST"],
                        "content": _markdown_to_html(post.content),
                        "excerpt": _markdown_to_html((post.content or "")[:200]),
                        "status": post.status,
                        "created_at": post.created_at.isoformat() if post.created_at else None,
                        "author": author_info["username"] if author_info else "匿名",
                        "author_id": author_info["id"] if author_info else None,
                        "school_name": school_name,
                        "client_id": post.client_id,
                        "ip": post.ip,
                        "comment_count": s.query(func.count())
                        .select_from(Comment)
                        .filter(Comment.post_id == post.id)
                        .scalar(),
                        "like_count": s.query(func.count())
                        .select_from(PostReaction)
                        .filter(
                            PostReaction.post_id == post.id,
                            PostReaction.reaction_type == "like",
                        )
                        .scalar(),
                        "media": post_media,
                    }
                )

            # 處理媒體數據
            media_data = []
            for media_item in media:
                # 獲取學校名稱
                school_name = None
                if media_item.school_id:
                    school = s.query(School).filter(School.id == media_item.school_id).first()
                    if school:
                        school_name = school.name

                # 獲取作者資訊
                author_info = None
                if media_item.author_id:
                    author = s.query(User).filter(User.id == media_item.author_id).first()
                    if author:
                        author_info = {
                            "id": author.id,
                            "username": author.username,
                            "school_name": school_name,
                        }

                # 生成預覽URL
                preview_url = _get_signed_media_url(media_item.id)

                media_data.append(
                    {
                        "id": media_item.id,
                        "type": MODERATION_TYPE["MEDIA"],
                        "post_id": media_item.post_id,
                        "file_name": media_item.file_name,
                        "file_size": media_item.file_size,
                        "file_type": media_item.file_type,
                        "mime_type": media_item.mime_type,
                        "status": media_item.status,
                        "created_at": media_item.created_at.isoformat()
                        if media_item.created_at
                        else None,
                        "author": author_info["username"] if author_info else "匿名",
                        "author_id": author_info["id"] if author_info else None,
                        "school_name": school_name,
                        "client_id": media_item.client_id,
                        "ip": media_item.ip,
                        "path": media_item.path,
                        "preview_url": preview_url,
                    }
                )

            # 合併並排序結果
            all_items = posts_data + media_data
            all_items.sort(key=lambda x: x["created_at"] or "", reverse=True)

            return jsonify(
                {
                    "ok": True,
                    "data": {
                        "items": all_items,
                        "pagination": {
                            "page": page,
                            "per_page": per_page,
                            "total": len(all_items),
                            "has_next": len(all_items) == per_page,
                        },
                    },
                    # 向後相容性：同時提供 posts 欄位
                    "posts": all_items,
                }
            )

    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取審核隊列失敗: {str(e)}"}), 500


@bp.get("/post/<int:post_id>")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_post_detail(post_id: int):
    """獲取貼文詳情"""
    try:
        with get_session() as s:
            post = s.query(Post).get(post_id)
            if not post:
                return jsonify({"ok": False, "error": "貼文不存在"}), 404

            # 檢查權限
            user_id = get_jwt_identity()
            user = s.query(User).get(user_id)
            if not can_moderate_content(user, post.school_id):
                return jsonify({"ok": False, "error": "沒有權限查看此貼文"}), 403

            # 獲取學校名稱
            school_name = None
            if post.school_id:
                school = s.query(School).filter(School.id == post.school_id).first()
                if school:
                    school_name = school.name

            # 獲取作者資訊
            author_info = None
            if post.author_id:
                author = s.query(User).filter(User.id == post.author_id).first()
                if author:
                    author_info = {
                        "id": author.id,
                        "username": author.username,
                        "school_name": school_name,
                    }

            # 獲取媒體列表
            media_list = []
            media_items = (
                s.query(Media).filter(Media.post_id == post_id).order_by(Media.id.asc()).all()
            )
            for media_item in media_items:
                preview_url = _get_signed_media_url(media_item.id)
                media_list.append(
                    {
                        "id": media_item.id,
                        "file_name": media_item.file_name,
                        "file_size": media_item.file_size,
                        "file_type": media_item.file_type,
                        "mime_type": media_item.mime_type,
                        "status": media_item.status,
                        "path": media_item.path,
                        "preview_url": preview_url,
                    }
                )

            return jsonify(
                {
                    "ok": True,
                    "data": {
                        "id": post.id,
                        "content": _markdown_to_html(post.content),
                        "status": post.status,
                        "created_at": post.created_at.isoformat() if post.created_at else None,
                        "author": author_info["username"] if author_info else "匿名",
                        "author_id": author_info["id"] if author_info else None,
                        "school_name": school_name,
                        "client_id": post.client_id,
                        "ip": post.ip,
                        "media": media_list,
                        "comment_count": s.query(func.count())
                        .select_from(Comment)
                        .filter(Comment.post_id == post_id)
                        .scalar(),
                        "like_count": s.query(func.count())
                        .select_from(PostReaction)
                        .filter(
                            PostReaction.post_id == post_id,
                            PostReaction.reaction_type == "like",
                        )
                        .scalar(),
                    },
                }
            )

    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取貼文詳情失敗: {str(e)}"}), 500


@bp.post("/approve")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def approve_content():
    """核准內容"""
    try:
        data = request.get_json()
        content_type = data.get("type")
        content_id = data.get("id")
        reason = data.get("reason", "").strip()

        if not content_type or not content_id:
            return jsonify({"ok": False, "error": "缺少必要參數"}), 400

        user_id = get_jwt_identity()

        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 401

            if content_type == MODERATION_TYPE["POST"]:
                return _approve_post(s, content_id, user_id, reason)
            elif content_type == MODERATION_TYPE["MEDIA"]:
                return _approve_media(s, content_id, user_id, reason)
            else:
                return jsonify({"ok": False, "error": "不支援的內容類型"}), 400

    except Exception as e:
        return jsonify({"ok": False, "error": f"核准失敗: {str(e)}"}), 500


def _approve_post(s: Session, post_id: int, user_id: int, reason: str):
    """核准貼文"""
    post = s.query(Post).get(post_id)
    if not post:
        return jsonify({"ok": False, "error": "貼文不存在"}), 404

    # 檢查權限
    user = s.query(User).get(user_id)
    if not can_moderate_content(user, post.school_id):
        return jsonify({"ok": False, "error": "沒有權限核准此貼文"}), 403

    old_status = post.status
    post.status = MODERATION_STATUS["APPROVED"]
    post.rejected_reason = None

    # 核准相關的媒體
    media_items = s.query(Media).filter(Media.post_id == post_id).all()
    for media_item in media_items:
        if media_item.status != MODERATION_STATUS["APPROVED"]:
            old_media_status = media_item.status
            try:
                new_rel = publish_media_by_id(media_item.path or '', int(media_item.id), getattr(media_item, 'mime_type', None))
                if new_rel.startswith('public/'):
                    media_item.path = new_rel
            except Exception:
                pass
            media_item.status = MODERATION_STATUS["APPROVED"]
            media_item.rejected_reason = None
            write_log(
                s,
                MODERATION_TYPE["MEDIA"],
                media_item.id,
                "approve",
                old_media_status,
                media_item.status,
                reason,
                user_id,
            )

    write_log(
        s, MODERATION_TYPE["POST"], post_id, "approve", old_status, post.status, reason, user_id
    )
    s.commit()

    # 發送SocketIO事件
    try:
        from app import socketio

        socketio.emit("post.approved", {"id": post_id})
    except ImportError:
        pass

    return jsonify({"ok": True, "message": "貼文核准成功"})


def _approve_media(s: Session, media_id: int, user_id: int, reason: str):
    """核准媒體"""
    media_item = s.query(Media).get(media_id)
    if not media_item:
        return jsonify({"ok": False, "error": "媒體不存在"}), 404

    # 檢查權限
    user = s.query(User).get(user_id)
    if not can_moderate_content(user, media_item.school_id):
        return jsonify({"ok": False, "error": "沒有權限核准此媒體"}), 403

    old_status = media_item.status
    try:
        new_rel = publish_media_by_id(media_item.path or '', int(media_item.id), getattr(media_item, 'mime_type', None))
        if new_rel.startswith('public/'):
            media_item.path = new_rel
    except Exception:
        pass

    media_item.status = MODERATION_STATUS["APPROVED"]
    media_item.rejected_reason = None

    write_log(
        s, MODERATION_TYPE["MEDIA"], media_id, "approve", old_status, media_item.status, reason, user_id
    )
    s.commit()

    # 發送SocketIO事件
    try:
        from app import socketio

        socketio.emit("media.approved", {"id": media_id})
    except ImportError:
        pass

    return jsonify({"ok": True, "message": "媒體核准成功"})


@bp.post("/reject")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def reject_content():
    """拒絕內容"""
    try:
        data = request.get_json()
        content_type = data.get("type")
        content_id = data.get("id")
        reason = data.get("reason", "").strip()

        if not content_type or not content_id:
            return jsonify({"ok": False, "error": "缺少必要參數"}), 400

        if not reason:
            return jsonify({"ok": False, "error": "拒絕原因不能為空"}), 400

        user_id = get_jwt_identity()

        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 401

            if content_type == MODERATION_TYPE["POST"]:
                return _reject_post(s, content_id, user_id, reason)
            elif content_type == MODERATION_TYPE["MEDIA"]:
                return _reject_media(s, content_id, user_id, reason)
            else:
                return jsonify({"ok": False, "error": "不支援的內容類型"}), 400

    except Exception as e:
        return jsonify({"ok": False, "error": f"拒絕失敗: {str(e)}"}), 500


def _reject_post(s: Session, post_id: int, user_id: int, reason: str):
    # 理由必填，避免無上下文的拒絕
    if not (reason or '').strip():
        return jsonify({"ok": False, "error": "需要提供拒絕原因"}), 400
    """拒絕貼文"""
    post = s.query(Post).get(post_id)
    if not post:
        return jsonify({"ok": False, "error": "貼文不存在"}), 404

    # 檢查權限
    user = s.query(User).get(user_id)
    if not can_moderate_content(user, post.school_id):
        return jsonify({"ok": False, "error": "沒有權限拒絕此貼文"}), 403

    old_status = post.status
    post.status = MODERATION_STATUS["REJECTED"]
    post.rejected_reason = reason

    # 拒絕相關的媒體
    media_items = s.query(Media).filter(Media.post_id == post_id).all()
    for media_item in media_items:
        if media_item.status != MODERATION_STATUS["REJECTED"]:
            old_media_status = media_item.status
            media_item.status = MODERATION_STATUS["REJECTED"]
            media_item.rejected_reason = reason
            write_log(
                s,
                MODERATION_TYPE["MEDIA"],
                media_item.id,
                "reject",
                old_media_status,
                media_item.status,
                reason,
                user_id,
            )

    write_log(
        s, MODERATION_TYPE["POST"], post_id, "reject", old_status, post.status, reason, user_id
    )
    try:
        u = s.query(User).get(user_id)
        log_content_moderation(
            event_type="post_rejected",
            moderator_id=int(user_id),
            moderator_name=(u.username if u else 'unknown'),
            content_type="post",
            content_id=int(post_id),
            action="拒絕",
            reason=reason,
            session=s,
        )
    except Exception:
        pass
    s.commit()

    # 發送SocketIO事件
    try:
        from app import socketio

        socketio.emit("post.rejected", {"id": post_id})
    except ImportError:
        pass

    return jsonify({"ok": True, "message": "貼文拒絕成功"})


def _reject_media(s: Session, media_id: int, user_id: int, reason: str):
    """拒絕媒體"""
    if not (reason or '').strip():
        return jsonify({"ok": False, "error": "需要提供拒絕原因"}), 400
    media_item = s.query(Media).get(media_id)
    if not media_item:
        return jsonify({"ok": False, "error": "媒體不存在"}), 404

    # 檢查權限
    user = s.query(User).get(user_id)
    if not can_moderate_content(user, media_item.school_id):
        return jsonify({"ok": False, "error": "沒有權限拒絕此媒體"}), 403

    old_status = media_item.status
    media_item.status = MODERATION_STATUS["REJECTED"]
    media_item.rejected_reason = reason

    write_log(
        s, MODERATION_TYPE["MEDIA"], media_id, "reject", old_status, media_item.status, reason, user_id
    )
    try:
        u = s.query(User).get(user_id)
        log_content_moderation(
            event_type="media_rejected",
            moderator_id=int(user_id),
            moderator_name=(u.username if u else 'unknown'),
            content_type="media",
            content_id=int(media_id),
            action="拒絕",
            reason=reason,
            session=s,
        )
    except Exception:
        pass
    s.commit()

    # 發送SocketIO事件
    try:
        from app import socketio

        socketio.emit("media.rejected", {"id": media_id})
    except ImportError:
        pass

    return jsonify({"ok": True, "message": "媒體拒絕成功"})


@bp.post("/override")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def override_decision():
    """否決決策（高級權限）"""
    try:
        data = request.get_json()
        content_type = data.get("type")
        content_id = data.get("id")
        action = data.get("action")  # "approve" 或 "reject"
        reason = data.get("reason", "").strip()

        if not content_type or not content_id or not action:
            return jsonify({"ok": False, "error": "缺少必要參數"}), 400

        if action not in ["approve", "reject"]:
            return jsonify({"ok": False, "error": "無效的操作"}), 400
        if action == 'reject' and not reason:
            return jsonify({"ok": False, "error": "需要提供拒絕原因"}), 400

        user_id = get_jwt_identity()

        with get_session() as s:
            user = s.query(User).get(user_id)
            if not user:
                return jsonify({"ok": False, "error": "用戶不存在"}), 401

            # 檢查否決權限
            if not _can_override_decision(user):
                return jsonify({"ok": False, "error": "沒有否決權限"}), 403

            if content_type == MODERATION_TYPE["POST"]:
                return _override_post_decision(s, content_id, user_id, action, reason)
            elif content_type == MODERATION_TYPE["MEDIA"]:
                return _override_media_decision(s, content_id, user_id, action, reason)
            else:
                return jsonify({"ok": False, "error": "不支援的內容類型"}), 400

    except Exception as e:
        return jsonify({"ok": False, "error": f"否決失敗: {str(e)}"}), 500


def _can_override_decision(user: User) -> bool:
    """檢查用戶是否有否決權限"""
    # 總管理（開發者）有最高否決權
    if user.role == "dev_admin":
        return True
    
    # 校內/跨校管理員可以否決審核員的決策
    if user.role in ["campus_admin", "cross_admin"]:
        return True
    
    return False


def _override_post_decision(s: Session, post_id: int, user_id: int, action: str, reason: str):
    """否決貼文決策"""
    post = s.query(Post).get(post_id)
    if not post:
        return jsonify({"ok": False, "error": "貼文不存在"}), 404

    # 檢查權限
    user = s.query(User).get(user_id)
    if not can_moderate_content(user, post.school_id):
        return jsonify({"ok": False, "error": "沒有權限操作此貼文"}), 403

    # 不允許非 dev_admin 否決 dev_admin 的決策
    try:
        last_log = (
            s.query(ModerationLog)
             .filter(
                ModerationLog.target_type == "post",
                ModerationLog.target_id == post_id,
                ModerationLog.action.in_(["approve", "reject", "override_approve", "override_reject"])
             )
             .order_by(ModerationLog.id.desc())
             .first()
        )
        if last_log and last_log.moderator_id:
            last_actor = s.query(User).get(last_log.moderator_id)
            me = s.query(User).get(user_id)
            if last_actor and last_actor.role == "dev_admin" and me and me.role != "dev_admin":
                return jsonify({"ok": False, "error": "不可否決總管理決策"}), 403
    except Exception:
        pass

    old_status = post.status
    
    if action == "approve":
        post.status = MODERATION_STATUS["APPROVED"]
        post.rejected_reason = None
        
        # 核准相關的媒體
        media_items = s.query(Media).filter(Media.post_id == post_id).all()
        for media_item in media_items:
            if media_item.status != MODERATION_STATUS["APPROVED"]:
                old_media_status = media_item.status
                try:
                    new_rel = publish_media_by_id(media_item.path or '', int(media_item.id), getattr(media_item, 'mime_type', None))
                    if new_rel.startswith('public/'):
                        media_item.path = new_rel
                except Exception:
                    pass
                media_item.status = MODERATION_STATUS["APPROVED"]
                media_item.rejected_reason = None
                write_log(
                    s,
                    MODERATION_TYPE["MEDIA"],
                    media_item.id,
                    "override_approve",
                    old_media_status,
                    media_item.status,
                    f"否決核准: {reason}",
                    user_id,
                )
        try:
            u2 = s.query(User).get(user_id)
            log_content_moderation(
                event_type="post_approved",
                moderator_id=int(user_id),
                moderator_name=(u2.username if u2 else 'unknown'),
                content_type="post",
                content_id=int(post_id),
                action="核准",
                session=s,
            )
        except Exception:
            pass
    else:  # reject
        post.status = MODERATION_STATUS["REJECTED"]
        post.rejected_reason = reason
        
        # 拒絕相關的媒體
        media_items = s.query(Media).filter(Media.post_id == post_id).all()
        for media_item in media_items:
            if media_item.status != MODERATION_STATUS["REJECTED"]:
                old_media_status = media_item.status
                media_item.status = MODERATION_STATUS["REJECTED"]
                media_item.rejected_reason = reason
                write_log(
                    s,
                    MODERATION_TYPE["MEDIA"],
                    media_item.id,
                    "override_reject",
                    old_media_status,
                    media_item.status,
                    f"否決拒絕: {reason}",
                    user_id,
                )

    write_log(
        s, 
        MODERATION_TYPE["POST"], 
        post_id, 
        f"override_{action}", 
        old_status, 
        post.status, 
        f"否決{'核准' if action == 'approve' else '拒絕'}: {reason}", 
        user_id
    )
    s.commit()

    # 發送SocketIO事件
    try:
        from app import socketio
        if action == "approve":
            socketio.emit("post.approved", {"id": post_id})
        else:
            socketio.emit("post.rejected", {"id": post_id})
    except ImportError:
        pass

    return jsonify({"ok": True, "message": f"貼文否決{'核准' if action == 'approve' else '拒絕'}成功"})


def _override_media_decision(s: Session, media_id: int, user_id: int, action: str, reason: str):
    """否決媒體決策"""
    media_item = s.query(Media).get(media_id)
    if not media_item:
        return jsonify({"ok": False, "error": "媒體不存在"}), 404

    # 檢查權限
    user = s.query(User).get(user_id)
    if not can_moderate_content(user, media_item.school_id):
        return jsonify({"ok": False, "error": "沒有權限操作此媒體"}), 403

    # 不允許非 dev_admin 否決 dev_admin 的決策
    try:
        last_log = (
            s.query(ModerationLog)
             .filter(
                ModerationLog.target_type == "media",
                ModerationLog.target_id == media_id,
                ModerationLog.action.in_(["approve", "reject", "override_approve", "override_reject"])
             )
             .order_by(ModerationLog.id.desc())
             .first()
        )
        if last_log and last_log.moderator_id:
            last_actor = s.query(User).get(last_log.moderator_id)
            me = s.query(User).get(user_id)
            if last_actor and last_actor.role == "dev_admin" and me and me.role != "dev_admin":
                return jsonify({"ok": False, "error": "不可否決總管理決策"}), 403
    except Exception:
        pass

    old_status = media_item.status
    
    if action == "approve":
        try:
            new_rel = publish_media_by_id(media_item.path or '', int(media_item.id), getattr(media_item, 'mime_type', None))
            if new_rel.startswith('public/'):
                media_item.path = new_rel
        except Exception:
            pass
        media_item.status = MODERATION_STATUS["APPROVED"]
        media_item.rejected_reason = None
        try:
            u4 = s.query(User).get(user_id)
            log_content_moderation(
                event_type="media_approved",
                moderator_id=int(user_id),
                moderator_name=(u4.username if u4 else 'unknown'),
                content_type="media",
                content_id=int(media_id),
                action="核准",
                session=s,
            )
        except Exception:
            pass
    else:  # reject
        media_item.status = MODERATION_STATUS["REJECTED"]
        media_item.rejected_reason = reason

    write_log(
        s, 
        MODERATION_TYPE["MEDIA"], 
        media_id, 
        f"override_{action}", 
        old_status, 
        media_item.status, 
        f"否決{'核准' if action == 'approve' else '拒絕'}: {reason}", 
        user_id
    )
    s.commit()

    # 發送SocketIO事件
    try:
        from app import socketio
        if action == "approve":
            socketio.emit("media.approved", {"id": media_id})
        else:
            socketio.emit("media.rejected", {"id": media_id})
    except ImportError:
        pass

    return jsonify({"ok": True, "message": f"媒體否決{'核准' if action == 'approve' else '拒絕'}成功"})


@bp.get("/logs")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin")
def get_moderation_logs():
    """獲取審核日誌"""
    try:
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 50, type=int), 200)
        content_type = request.args.get("type")
        action = request.args.get("action")
        moderator_id = request.args.get("moderator_id", type=int)

        with get_session() as s:
            query = s.query(ModerationLog)

            # 篩選條件
            if content_type:
                query = query.filter(ModerationLog.target_type == content_type)
            else:
                # 預設僅顯示貼文類型，以避免媒體紀錄干擾審核視圖
                query = query.filter(ModerationLog.target_type == MODERATION_TYPE["POST"])
            if action:
                query = query.filter(ModerationLog.action == action)
            if moderator_id:
                query = query.filter(ModerationLog.moderator_id == moderator_id)

            # 分頁查詢
            total = query.count()
            logs = (
                query.order_by(ModerationLog.id.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
                .all()
            )

            # 處理日誌數據
            logs_data = []
            for log in logs:
                # 獲取審核者資訊
                moderator = s.query(User).filter(User.id == log.moderator_id).first()
                moderator_info = None
                if moderator:
                    moderator_info = {"id": moderator.id, "username": moderator.username}

                logs_data.append(
                    {
                        "id": log.id,
                        "target_type": log.target_type,
                        "target_id": log.target_id,
                        "action": log.action,
                        "old_status": log.old_status,
                        "new_status": log.new_status,
                        "reason": log.reason,
                        "moderator": moderator_info["username"]
                        if moderator_info
                        else f"ID: {log.moderator_id}",
                        "moderator_id": log.moderator_id,
                        "created_at": log.created_at.isoformat() if log.created_at else None,
                    }
                )

            return jsonify(
                {
                    "ok": True,
                    "data": {
                        "logs": logs_data,
                        "pagination": {
                            "page": page,
                            "per_page": per_page,
                            "total": total,
                            "has_next": page * per_page < total,
                        },
                    },
                    # 向後相容性：同時提供 items 欄位
                    "items": logs_data,
                }
            )

    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取審核日誌失敗: {str(e)}"}), 500


@bp.get("/stats")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_moderation_stats():
    """獲取審核統計"""
    try:
        with get_session() as s:
            # 今日統計
            today = datetime.now().date()
            today_start = datetime.combine(today, datetime.min.time())
            today_end = datetime.combine(today, datetime.max.time())

            # 待審數量
            pending_posts = (
                s.query(func.count()).select_from(Post).filter(Post.status == MODERATION_STATUS["PENDING"]).scalar()
            )
            pending_media = (
                s.query(func.count()).select_from(Media).filter(Media.status == MODERATION_STATUS["PENDING"]).scalar()
            )

            # 今日處理數量
            today_processed = (
                s.query(func.count())
                .select_from(ModerationLog)
                .filter(and_(ModerationLog.created_at >= today_start, ModerationLog.created_at <= today_end))
                .scalar()
            )

            # 今日核准數量
            today_approved = (
                s.query(func.count())
                .select_from(ModerationLog)
                .filter(
                    and_(
                        ModerationLog.created_at >= today_start,
                        ModerationLog.created_at <= today_end,
                        ModerationLog.action == "approve",
                    )
                )
                .scalar()
            )

            # 今日拒絕數量
            today_rejected = (
                s.query(func.count())
                .select_from(ModerationLog)
                .filter(
                    and_(
                        ModerationLog.created_at >= today_start,
                        ModerationLog.created_at <= today_end,
                        ModerationLog.action == "reject",
                    )
                )
                .scalar()
            )

            return jsonify(
                {
                    "ok": True,
                    "data": {
                        "pending": {
                            "posts": pending_posts or 0,
                            "media": pending_media or 0,
                            "total": (pending_posts or 0) + (pending_media or 0),
                        },
                        "today": {
                            "processed": today_processed or 0,
                            "approved": today_approved or 0,
                            "rejected": today_rejected or 0,
                        },
                    }
                }
            )

    except Exception as e:
        return jsonify({"ok": False, "error": f"獲取統計失敗: {str(e)}"}), 500


# 保留原有的媒體預覽端點
@bp.get("/media/<int:mid_>/preview")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def issue_media_preview(mid_: int):
    # 產生短效簽名 URL（預設 2 分鐘）
    ttl = int(os.getenv("MEDIA_PREVIEW_TTL", "120"))
    exp = int(time.time()) + max(30, min(600, ttl))
    secret = os.getenv("MEDIA_PREVIEW_SECRET", os.getenv("SECRET_KEY", "dev-only-key-not-for-production"))
    sig = _sign(mid_, exp, secret)
    url = f"/api/moderation/media/preview?mid={mid_}&exp={exp}&sig={sig}"
    return jsonify({"ok": True, "preview_url": url, "expires_at": exp})


@bp.get("/media/preview")
def serve_media_preview():
    try:
        mid = int(request.args.get("mid") or "0")
        exp = int(request.args.get("exp") or "0")
        sig = (request.args.get("sig") or "").strip()

        # 調試信息
        print(f"Media preview request: mid={mid}, exp={exp}, sig={sig[:10]}...")

        if mid <= 0 or exp <= 0 or not sig:
            print(f"Invalid parameters: mid={mid}, exp={exp}, sig_empty={not sig}")
            abort(400)

    except (ValueError, TypeError) as e:
        print(f"Parameter parsing error: {e}")
        abort(400)

    secret = os.getenv("MEDIA_PREVIEW_SECRET", os.getenv("SECRET_KEY", "dev-only-key-not-for-production"))
    if not _verify(mid, exp, sig, secret):
        print(f"Signature verification failed for media {mid}")
        abort(403)

    print(f"Signature verified for media {mid}, serving file...")

    # 與 preview_media_file 相同的檔案尋找與 CDN 代理邏輯
    with get_session() as s:
        m = s.get(Media, mid)
        if not m or not m.path:
            print(f"Media {mid} not found or no path")
            abort(404)

        print(f"Found media {mid} with path: {m.path}")
        rel = m.path.lstrip("/")
        if rel.startswith("media/"):
            base = Path(UPLOAD_ROOT) / "media"
            rel2 = rel.split("media/", 1)[-1]
        elif rel.startswith("pending/"):
            base = Path(UPLOAD_ROOT) / "pending"
            rel2 = rel.split("pending/", 1)[-1]
        elif rel.startswith("public/"):
            base = Path(UPLOAD_ROOT) / "public"
            rel2 = rel.split("public/", 1)[-1]
        else:
            print(f"Invalid media path format: {m.path}")
            abort(404)

        fpath = (base / rel2).resolve()
        print(f"Resolved file path: {fpath}")

        try:
            ensure_within(base, fpath)
        except Exception as e:
            print(f"Path security check failed: {e}")
            abort(404)

        if fpath.exists():
            mime, _ = mimetypes.guess_type(str(fpath))
            print(f"Serving local file: {fpath} (mime: {mime})")
            return send_file(str(fpath), mimetype=mime or "application/octet-stream")

        # HTTP 代理
        print("Local file not found, trying CDN proxy...")
        try:
            import requests  # type: ignore

            host = os.getenv("CDN_HOST", "127.0.0.1")
            port = int(os.getenv("CDN_PORT", "12002"))
            url = f"http://{host}:{port}/{rel}"
            print(f"Proxying to CDN: {url}")
            r = requests.get(url, stream=True, timeout=5)
            if r.status_code != 200:
                print(f"CDN proxy failed with status {r.status_code}")
                abort(404)
            from flask import Response

            def generate():
                try:
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            yield chunk
                finally:
                    try:
                        r.close()
                    except Exception:
                        pass

            ct = r.headers.get("Content-Type") or "application/octet-stream"
            print(f"CDN proxy successful, content-type: {ct}")
            return Response(generate(), headers={"Content-Type": ct})
        except Exception as e:
            print(f"CDN proxy error: {e}")
            abort(404)


@bp.get("/media/<int:mid_>/file")
def serve_media_file_compat(mid_: int):
    """相容舊前端：/api/moderation/media/<id>/file
    - 已核准(approved)：公開提供，不需登入
    - 待審(pending)：需具備審核角色
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
    from utils.school_permissions import can_moderate_content
    with get_session() as s:
        m = s.get(Media, mid_)
        if not m:
            abort(404)
        # 若為非核准狀態，要求審核權限
        if (m.status or "").lower() != "approved":
            try:
                verify_jwt_in_request(optional=False)
                uid = get_jwt_identity()
                user = s.get(User, uid)
                if not user or not can_moderate_content(user, getattr(m, "school_id", None)):
                    abort(403)
            except Exception:
                abort(401)

        rel = (m.path or '').lstrip('/')
        base = Path(UPLOAD_ROOT)
        candidates = []
        # 直接相對路徑（包含 public/, pending/, media/ 等）
        candidates.append(base / rel)
        # 新結構：public/<id>.<ext>
        try:
            ext = (rel.rsplit('.',1)[-1] if '.' in rel else (m.file_type or 'jpg')).strip('.')
        except Exception:
            ext = 'jpg'
        candidates.append(base / 'public' / f"{m.id}.{ext}")
        # 舊結構：public/media/<id>.<ext>
        candidates.append(base / 'public' / 'media' / f"{m.id}.{ext}")

        fpath = None
        for c in candidates:
            try:
                if c.exists():
                    fpath = c
                    break
            except Exception:
                continue
        if not fpath:
            # 廣義搜尋：在 public/media 與 public 根目錄找任意符合 id.* 的檔
            try:
                pat1 = (base / 'public' / 'media').glob(f"{m.id}.*")
                pat2 = (base / 'public').glob(f"{m.id}.*")
                for p in list(pat1) + list(pat2):
                    if p.is_file():
                        fpath = p
                        break
            except Exception:
                fpath = None
        if not fpath:
            abort(404)

        mime, _ = mimetypes.guess_type(str(fpath))
        return send_file(str(fpath), mimetype=mime or 'application/octet-stream')

@bp.get("/media/<int:mid_>")
@jwt_required()
@require_role("dev_admin", "campus_admin", "cross_admin", "campus_moderator", "cross_moderator")
def get_media_detail(mid_: int):
    with get_session() as s:
        m = s.get(Media, mid_)
        if not m:
            abort(404)
        school_name = None
        try:
            sch_id = getattr(m, "school_id", None)
            if not sch_id and getattr(m, "post_id", None):
                p = s.get(Post, m.post_id)
                sch_id = getattr(p, "school_id", None) if p else None
            if sch_id:
                sch = s.query(School).filter(School.id == sch_id).first()
                if sch:
                    school_name = sch.name
        except Exception:
            pass
        return jsonify(
            {
                "id": m.id,
                "post_id": m.post_id,
                "path": m.path,
                "status": m.status,
                "created_at": (m.created_at.isoformat() if getattr(m, "created_at", None) else None),
                "client_id": getattr(m, "client_id", None),
                "ip": getattr(m, "ip", None),
                "school_name": school_name,
            }
        )
