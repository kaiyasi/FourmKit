from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
import sqlalchemy as sa
from utils.db import get_session
from utils.auth import get_effective_user_id
from utils.ratelimit import get_client_ip
from models import Post, Media, User, School, SchoolSetting, Comment
from utils.upload_validation import is_allowed, sniff_kind
from utils.sanitize import sanitize_content
from utils.config_handler import load_config
from utils.ratelimit import rate_limit
from utils.school_permissions import can_post_to_school, filter_posts_by_permissions
from utils.admin_events import log_user_action
import uuid, os
from datetime import datetime, timezone
import re
import hashlib

bp = Blueprint("posts", __name__, url_prefix="/api/posts")

def _wrap_ok(data, http: int = 200):
    return jsonify({"ok": True, "data": data}), http

def _wrap_err(code: str, message: str, http: int = 400):
    return jsonify({"ok": False, "error": {"code": code, "message": message}}), http

def _get_author_display_name(user: User, client_id: str = None) -> str:
    """根據用戶狀態返回顯示名稱
    規則：
    - 系統預設：系統訊息（username 以 demo_/system_ 開頭）
    - 登入用戶：顯示帳號名稱（username）
    - 未登入/匿名：用裝置碼產生 6 位編碼；若無 client_id，回傳 "匿名"
    """
    try:
        username = (getattr(user, 'username', '') or '').strip()

        # 系統訊息
        if username.startswith('demo_') or username.startswith('system_') or username == 'system':
            return '系統訊息'

        # 正常登入帳號（非匿名）
        if username and not username.startswith('anon_'):
            return username

        # 匿名/未登入 → 由 client_id 轉 6 碼
        base = (client_id or '').strip()
        if base:
            h = hashlib.md5(base.encode('utf-8')).hexdigest().upper()
            chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
            code = ''.join(chars[int(h[i*2:i*2+2], 16) % len(chars)] for i in range(6))
            return code
        return '匿名'
    except Exception:
        return '匿名'

def _markdown_to_html(md: str) -> str:
    """將Markdown轉換為HTML"""
    if not md:
        return ""
    
    # 檢測是否已經是HTML格式（包含HTML標籤）
    if re.search(r'<[^>]+>', md):
        # 如果已經是HTML，直接返回，但進行安全清理
        from utils.sanitize import clean_html
        return clean_html(md)
    
    # 先轉義HTML特殊字符
    def escape_html(s: str) -> str:
        return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    
    # 處理程式碼區塊（先保存）
    code_blocks = []
    def save_code_block(match):
        code_blocks.append(match.group(1))
        return f"__CODE_BLOCK_{len(code_blocks)-1}__"
    
    md = re.sub(r'```([\s\S]*?)```', save_code_block, md)
    
    # 轉義HTML
    md = escape_html(md)
    
    # 處理標題（在段落處理之前）
    md = re.sub(r'^#{6}\s*(.+)$', r'<h6>\1</h6>', md, flags=re.MULTILINE)
    md = re.sub(r'^#{5}\s*(.+)$', r'<h5>\1</h5>', md, flags=re.MULTILINE)
    md = re.sub(r'^#{4}\s*(.+)$', r'<h4>\1</h4>', md, flags=re.MULTILINE)
    md = re.sub(r'^#{3}\s*(.+)$', r'<h3>\1</h3>', md, flags=re.MULTILINE)
    md = re.sub(r'^#{2}\s*(.+)$', r'<h2>\1</h2>', md, flags=re.MULTILINE)
    md = re.sub(r'^#{1}\s*(.+)$', r'<h1>\1</h1>', md, flags=re.MULTILINE)
    
    # 處理粗體和斜體
    md = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', md)
    md = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', md)
    
    # 處理行內程式碼
    md = re.sub(r'`([^`]+)`', r'<code>\1</code>', md)
    
    # 處理連結
    md = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2" target="_blank" rel="noreferrer">\1</a>', md)
    
    # 處理清單和段落
    lines = md.split('\n')
    result_lines = []
    in_list = False
    in_quote = False
    
    for line in lines:
        line = line.strip()
        if not line:
            if in_list:
                result_lines.append('</ul>')
                in_list = False
            if in_quote:
                result_lines.append('</blockquote>')
                in_quote = False
            continue
            
        # 處理引用區段 (> 開頭)
        if line.startswith('> '):
            if not in_quote:
                result_lines.append('<blockquote>')
                in_quote = True
            content = line[2:]  # 移除 '> '
            result_lines.append(f'<p>{content}</p>')
            continue
        elif in_quote:
            result_lines.append('</blockquote>')
            in_quote = False
            
        # 處理橫隔線 (---)
        if line == '---':
            if in_list:
                result_lines.append('</ul>')
                in_list = False
            result_lines.append('<hr>')
            continue
            
        if re.match(r'^[-*]\s+', line):
            if not in_list:
                result_lines.append('<ul>')
                in_list = True
            # 移除列表標記並包裝內容
            content = re.sub(r'^[-*]\s+', '', line)
            result_lines.append(f'<li>{content}</li>')
        else:
            if in_list:
                result_lines.append('</ul>')
                in_list = False
            # 檢查是否已經是標題
            if line.startswith('<h'):
                result_lines.append(line)
            else:
                result_lines.append(f'<p>{line}</p>')
    
    if in_list:
        result_lines.append('</ul>')
    if in_quote:
        result_lines.append('</blockquote>')
    
    html = '\n'.join(result_lines)
    
    # 恢復程式碼區塊
    def restore_code_block(match):
        idx = int(match.group(1))
        code = code_blocks[idx]
        return f'<pre><code>{escape_html(code)}</code></pre>'
    
    html = re.sub(r'__CODE_BLOCK_(\d+)__', restore_code_block, html)
    
    return html

def _now_tz() -> datetime:
    try:
        return datetime.now(timezone.utc)
    except Exception:
        return datetime.utcnow().replace(tzinfo=timezone.utc)

def _extract_school_slug(default_slug: str | None = None) -> str | None:
    """彈性取得 school_slug：JSON/form/header/query 多來源容錯。
    順序：
    1) 呼叫端傳入的預設值（JSON 或 form）
    2) Header：X-School-Slug / X-Target-School / X-Act-As-School（前端切換器可用）
    3) Query 參數：?school_slug= 或 ?school=
    4) 最後再嘗試一次 form 讀取（multipart 情境）
    """
    slug = (default_slug or '').strip() if default_slug else ''
    if not slug:
        for h in ("X-School-Slug", "X-Target-School", "X-Act-As-School"):
            v = (request.headers.get(h) or '').strip()
            if v:
                slug = v
                break
    if not slug:
        for k in ("school_slug", "school"):
            v = (request.args.get(k) or '').strip()
            if v:
                slug = v
                break
    if not slug:
        try:
            for k in ("school_slug", "school"):
                v = (request.form.get(k) or '').strip()
                if v:
                    slug = v
                    break
        except Exception:
            pass
    return slug or None

def _load_school_content_rules(db: Session, school_slug: str | None) -> tuple[bool, int]:
    """載入學校層級的內容規則（若無則用全域設定）。
    規則鍵：enforce_min_post_chars(bool), min_post_chars(int)
    支援 SchoolSetting.data 直掛鍵或 data.content_rules 內層。
    """
    cfg = load_config() or {}
    enforce = bool(cfg.get("enforce_min_post_chars", True))
    try:
        min_chars = int(cfg.get("min_post_chars", 15))
    except Exception:
        min_chars = 15
    if not school_slug:
        # 跨校內容：優先 cross 學校設定，其次全域 cross 設定，再退回全域
        try:
            cross = db.query(School).filter(School.slug == 'cross').first()
            if cross:
                row = db.query(SchoolSetting).filter(SchoolSetting.school_id == cross.id).first()
                if row and (row.data or '').strip():
                    import json
                    data = json.loads(row.data)
                    cr = data.get('content_rules', data) if isinstance(data, dict) else {}
                    if isinstance(cr, dict):
                        if 'enforce_min_post_chars' in cr:
                            enforce = bool(cr.get('enforce_min_post_chars'))
                        if 'min_post_chars' in cr:
                            try:
                                v2 = int(cr.get('min_post_chars') or 0)
                                min_chars = max(0, v2)
                            except Exception:
                                pass
                    return enforce, min_chars
        except Exception:
            pass
        # 全域 cross 設定（config）
        try:
            cr = cfg.get('cross_content_rules') if isinstance(cfg, dict) else None
            if isinstance(cr, dict):
                if 'enforce_min_post_chars' in cr:
                    enforce = bool(cr.get('enforce_min_post_chars'))
                if 'min_post_chars' in cr:
                    try:
                        v2 = int(cr.get('min_post_chars') or 0)
                        min_chars = max(0, v2)
                    except Exception:
                        pass
        except Exception:
            pass
        return enforce, min_chars
    try:
        sch = db.query(School).filter(School.slug == school_slug).first()
        if not sch:
            return enforce, min_chars
        row = db.query(SchoolSetting).filter(SchoolSetting.school_id == sch.id).first()
        if not row or not (row.data or '').strip():
            # 該校無設定 → 嘗試 cross 學校設定與全域 cross 設定
            try:
                cross = db.query(School).filter(School.slug == 'cross').first()
                if cross:
                    row2 = db.query(SchoolSetting).filter(SchoolSetting.school_id == cross.id).first()
                    if row2 and (row2.data or '').strip():
                        import json
                        data2 = json.loads(row2.data)
                        cr2 = data2.get('content_rules', data2) if isinstance(data2, dict) else {}
                        if isinstance(cr2, dict):
                            if 'enforce_min_post_chars' in cr2:
                                enforce = bool(cr2.get('enforce_min_post_chars'))
                            if 'min_post_chars' in cr2:
                                try:
                                    v3 = int(cr2.get('min_post_chars') or 0)
                                    min_chars = max(0, v3)
                                except Exception:
                                    pass
                            return enforce, min_chars
            except Exception:
                pass
            try:
                crg = cfg.get('cross_content_rules') if isinstance(cfg, dict) else None
                if isinstance(crg, dict):
                    if 'enforce_min_post_chars' in crg:
                        enforce = bool(crg.get('enforce_min_post_chars'))
                    if 'min_post_chars' in crg:
                        try:
                            v4 = int(crg.get('min_post_chars') or 0)
                            min_chars = max(0, v4)
                        except Exception:
                            pass
                    return enforce, min_chars
            except Exception:
                pass
            return enforce, min_chars
        import json
        data = json.loads(row.data)
        # 允許兩種路徑：直掛或內層 content_rules
        cr = data
        if isinstance(data, dict) and isinstance(data.get('content_rules'), dict):
            cr = data.get('content_rules')
        if isinstance(cr, dict):
            if 'enforce_min_post_chars' in cr:
                enforce = bool(cr.get('enforce_min_post_chars'))
            if 'min_post_chars' in cr:
                try:
                    v2 = int(cr.get('min_post_chars') or 0)
                    min_chars = max(0, v2)
                except Exception:
                    pass
        return enforce, min_chars
    except Exception:
        return enforce, min_chars

@bp.get("/list")
def list_posts():
    limit = max(min(int(request.args.get("limit", 20)), 1000), 1)  # 增加最大值到 1000
    school_slug = (request.args.get("school") or "").strip() or None
    cross_only = (request.args.get("cross_only") or "").strip().lower() in {"1","true","yes"}
    show_all_schools = request.args.get("all_schools", "").strip().lower() in {'1', 'true', 'yes'}
    
    with get_session() as s:
        # 基礎查詢
        q = s.query(Post).filter(
            and_(
                Post.status=="approved",
                Post.is_deleted==False  # 排除已刪除的貼文
            )
        )
        
        # 若要求僅跨校，優先忽略學校參數
        if cross_only:
            q = q.filter(
                sa.or_(
                    Post.school_id.is_(None),
                    # 回覆跨校貼文的回覆也算跨校
                    sa.and_(
                        Post.reply_to_post_id.isnot(None),
                        Post.reply_to_post_id.in_(
                            s.query(Post.id).filter(Post.school_id.is_(None))
                        )
                    )
                )
            )

        # 其餘情況：若指定了學校則用學校條件
        elif school_slug:
            school = s.query(School).filter(School.slug==school_slug).first()
            if school:
                # 顯示本校貼文 + 全域內容（廣告、跨校/平台公告）+ 回覆本校貼文的回覆
                q = q.filter(
                    sa.or_(
                        Post.school_id==school.id,
                        Post.is_advertisement==True,
                        sa.and_(Post.is_announcement==True, Post.school_id.is_(None)),
                        # 回覆貼文：如果回覆的原貼文屬於本校，則顯示回覆
                        sa.and_(
                            Post.reply_to_post_id.isnot(None),
                            Post.reply_to_post_id.in_(
                                s.query(Post.id).filter(Post.school_id==school.id)
                            )
                        )
                    )
                )
            else:
                q = q.filter(sa.text("1=0"))  # no results for unknown school
        
        # 如果沒有指定學校且不是顯示所有學校，則根據用戶權限決定
        elif not show_all_schools:
            if not cross_only:
                try:
                    from utils.auth import get_effective_user_id
                    uid = get_effective_user_id()
                    if uid:
                        user = s.query(User).get(uid)
                        if user:
                            # 已登入用戶：根據權限過濾貼文
                            q = filter_posts_by_permissions(s, user, q)
                        else:
                            # 用戶不存在：只顯示跨校貼文
                            q = q.filter(Post.school_id.is_(None))
                    else:
                        # 未登入用戶：只顯示跨校貼文
                        q = q.filter(Post.school_id.is_(None))
                except Exception:
                    # 如果權限檢查失敗，只顯示跨校貼文（保守處理）
                    q = q.filter(Post.school_id.is_(None))
        
        # 檢查用戶是否為會員，會員不顯示廣告貼文
        try:
            from utils.auth import get_effective_user_id
            uid = get_effective_user_id()
            if uid:
                user = s.query(User).get(uid)
                if user and user.is_premium:
                    # 會員用戶：過濾掉廣告貼文
                    q = q.filter(Post.is_advertisement == False)
        except Exception:
            # 如果檢查失敗，不過濾（保守處理）
            pass
        
        # 置頂貼文排在最前，然後按創建時間倒序
        q = q.order_by(Post.is_pinned.desc(), Post.id.desc()).limit(limit)
        rows = q.all()
        items = []
        post_ids = [p.id for p in rows]
        cover_map: dict[int, str] = {}
        count_map: dict[int, int] = {}
        if post_ids:
            try:
                counts = (
                    s.query(Media.post_id, func.count(Media.id))
                     .filter(
                         and_(
                             Media.post_id.in_(post_ids), 
                             Media.status=="approved",
                             Media.is_deleted==False  # 排除已刪除的媒體
                         )
                     )
                     .group_by(Media.post_id)
                     .all()
                )
                count_map = {pid: int(c) for pid, c in counts}
                # 留言數量
                c_counts = (
                    s.query(Comment.post_id, func.count(Comment.id))
                     .filter(
                         and_(
                             Comment.post_id.in_(post_ids),
                             Comment.is_deleted == False
                         )
                     )
                     .group_by(Comment.post_id)
                     .all()
                )
                comment_map = {pid: int(c) for pid, c in c_counts}
                medias = (
                    s.query(Media)
                     .filter(
                         and_(
                             Media.post_id.in_(post_ids), 
                             Media.status=="approved",
                             Media.is_deleted==False  # 排除已刪除的媒體
                         )
                     )
                     .order_by(Media.post_id.asc(), Media.id.asc())
                     .all()
                )
                seen: set[int] = set()
                from utils.upload_utils import resolve_or_publish_public_media
                for m in medias:
                    if m.post_id in seen:
                        continue
                    seen.add(m.post_id)
                    pth = resolve_or_publish_public_media(m.path or '', int(m.id), getattr(m,'mime_type',None))
                    if pth and pth.startswith('public/'):
                        cover_map[m.post_id] = pth
            except Exception:
                pass
        for p in rows:
            # 顯示作者名稱：
            # - 系統帳號 → 「系統訊息」
            # - 登入用戶 → username
            # - 匿名/未登入 → 依貼文的 client_id 產生 6 碼代號（與查看者無關）
            try:
                u = s.query(User).get(p.author_id)
                label = _get_author_display_name(u, getattr(p, 'client_id', None))
            except Exception:
                label = "未知"
            
            # 獲取學校資訊
            school_info = None
            school_name = None
            if p.school_id:
                school = s.query(School).get(p.school_id)
                if school:
                    logo_url = f"/uploads/{school.logo_path}" if school.logo_path else None
                    school_info = {
                        'id': school.id,
                        'slug': school.slug,
                        'name': school.name,
                        'logo_path': school.logo_path,
                        'logo_url': logo_url
                    }
                    school_name = school.name
            
            # 特別指定：覆寫顯示用學校（依需求）
            if int(p.id) == 3:
                # ID3 視為跨校
                school_info = None
                school_name = None
                try:
                    p.school_id = None  # 僅影響回傳 payload，不改資料庫
                except Exception:
                    pass
            elif int(p.id) == 4:
                # ID4 視為成功大學（若資料庫無對應，至少提供名稱）
                if not school_info:
                    school_info = None
                school_name = '成功大學'

            # 封面 URL/路徑處理
            # resolve_or_publish_public_media 現在可能回傳完整 URL 或本地相對 URL
            cover_url = cover_map.get(p.id)
            cover_path = None
            if cover_url:
                # 如果是本地 URL，移除 /uploads/ 前綴以得到相對路徑
                if cover_url.startswith("/uploads/"):
                    cover_path = cover_url[len("/uploads/"):]
                # 如果是 CDN URL，試著解析出相對路徑
                elif cdn_base_url := (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/"):
                    if cover_url.startswith(cdn_base_url):
                        # 組合出 public/media/... 的路徑
                        relative_part = cover_url[len(cdn_base_url):].lstrip('/')
                        if '/' in relative_part:
                            cover_path = f"public/{relative_part}"

            items.append({
                "id": p.id,
                "content": _markdown_to_html(p.content),
                "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
                "author_hash": label,
                "media_count": int(count_map.get(p.id, 0)),
                "cover_path": cover_path, # 前端可能需要相對路徑
                "cover_url": cover_url,   # 完整的、可直接使用的 URL
                "school_id": p.school_id,
                "school": school_info,
                "school_name": school_name,
                "comment_count": int((comment_map.get(p.id) if 'comment_map' in locals() else 0) or 0),
                "is_pinned": bool(getattr(p, "is_pinned", False)),
                "is_advertisement": bool(getattr(p, "is_advertisement", False)),
                "is_announcement": bool(getattr(p, "is_announcement", False)),
                "announcement_type": getattr(p, "announcement_type", None),
                "pinned_at": (p.pinned_at.isoformat() if getattr(p, "pinned_at", None) else None),
            })
        resp = jsonify({"items": items})
        try:
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            resp.headers["Pragma"] = "no-cache"
        except Exception:
            pass
        return resp

@bp.get("")
def list_posts_compat():
    """
    Returns wrapper { ok, data: { items, page, per_page, total } }

    與 /api/posts/list 行為對齊：
    - 若帶 school=slug → 僅該校
    - 若 all_schools=true → 僅對 dev_admin 放寬為全校
    - 其他情況：依權限顯示（未登入/無權 → 僅跨校）
    - 追加日期篩選 start/end（ISO 或 YYYY-MM-DD）
    """
    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 10) or 10), 1), 1000)  # 增加最大值到 1000
    school_slug = (request.args.get("school") or "").strip() or None
    show_all_schools = (request.args.get("all_schools") or "").strip().lower() in {"1", "true", "yes"}
    keyword = (request.args.get("q") or "").strip()

    # 日期篩選（可選）
    start_raw = (request.args.get("start") or request.args.get("from") or "").strip()
    end_raw = (request.args.get("end") or request.args.get("to") or "").strip()
    start_dt = None
    end_dt = None
    if start_raw:
        try:
            # 允許 YYYY-MM-DD 或 ISO8601
            start_dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
        except Exception:
            try:
                start_dt = datetime.fromisoformat(start_raw + "T00:00:00+00:00")
            except Exception:
                start_dt = None
    if end_raw:
        try:
            end_dt = datetime.fromisoformat(end_raw.replace("Z", "+00:00"))
        except Exception:
            try:
                end_dt = datetime.fromisoformat(end_raw + "T23:59:59.999999+00:00")
            except Exception:
                end_dt = None

    with get_session() as s:
        base = s.query(Post).filter(
            and_(
                Post.status == "approved",
                Post.is_deleted == False  # 排除已刪除的貼文
            )
        )

        # 日期條件
        if start_dt is not None:
            base = base.filter(Post.created_at >= start_dt)
        if end_dt is not None:
            base = base.filter(Post.created_at <= end_dt)

        # 關鍵字搜尋（內容）
        if keyword:
            try:
                # 避免過長/惡意字串
                kw = keyword[:100]
                base = base.filter(Post.content.ilike(f"%{kw}%"))
            except Exception:
                pass

        # 學校與權限條件
        if school_slug:
            school = s.query(School).filter(School.slug == school_slug).first()
            if school:
                base = base.filter(Post.school_id == school.id)
            else:
                base = base.filter(sa.text("1=0"))
        else:
            # 無指定學校時，是否允許查看所有學校？預設僅 dev_admin 可用 all_schools
            try:
                uid = get_effective_user_id()
            except Exception:
                uid = None

            if uid is not None:
                user = s.query(User).get(uid)
            else:
                user = None

            if show_all_schools:
                # 全部：開放查看所有學校的公開貼文
                pass
            else:
                # 依權限：未登入/無權 → 僅跨校；有權 → 允許其校與跨校
                try:
                    if user is not None:
                        base = filter_posts_by_permissions(s, user, base)
                    else:
                        base = base.filter(Post.school_id.is_(None))
                except Exception:
                    base = base.filter(Post.school_id.is_(None))

        # 檢查用戶是否為會員，會員不顯示廣告貼文
        try:
            uid = get_effective_user_id()
            if uid:
                user = s.query(User).get(uid)
                if user and user.is_premium:
                    # 會員用戶：過濾掉廣告貼文
                    base = base.filter(Post.is_advertisement == False)
        except Exception:
            # 如果檢查失敗，不過濾（保守處理）
            pass

        total = base.count()
        rows = (
            base.order_by(Post.is_pinned.desc(), Post.created_at.desc(), Post.id.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
                .all()
        )
        items = []
        # 依貼文批次查詢已核准媒體數與封面（以最早核准的媒體作為封面）
        post_ids = [p.id for p in rows]
        cover_map: dict[int, str] = {}
        count_map: dict[int, int] = {}
        comment_map: dict[int, int] = {}
        if post_ids:
            try:
                # 計數
                counts = (
                    s.query(Media.post_id, func.count(Media.id))
                     .filter(
                         and_(
                             Media.post_id.in_(post_ids), 
                             Media.status=="approved",
                             Media.is_deleted==False  # 排除已刪除的媒體
                         )
                     )
                     .group_by(Media.post_id)
                     .all()
                )
                count_map = {pid: int(c) for pid, c in counts}
                # 留言數量
                c_counts = (
                    s.query(Comment.post_id, func.count(Comment.id))
                     .filter(
                         and_(
                             Comment.post_id.in_(post_ids),
                             Comment.is_deleted == False
                         )
                     )
                     .group_by(Comment.post_id)
                     .all()
                )
                comment_map = {pid: int(c) for pid, c in c_counts}
                # 封面：取每個 post_id 最小 id 的已核准媒體
                medias = (
                    s.query(Media)
                     .filter(
                         and_(
                             Media.post_id.in_(post_ids), 
                             Media.status=="approved",
                             Media.is_deleted==False  # 排除已刪除的媒體
                         )
                     )
                     .order_by(Media.post_id.asc(), Media.id.asc())
                     .all()
                )
                seen: set[int] = set()
                from utils.upload_utils import resolve_or_publish_public_media
                for m in medias:
                    if m.post_id in seen:
                        continue
                    seen.add(m.post_id)
                    pth = resolve_or_publish_public_media(m.path or '', int(m.id), getattr(m,'mime_type',None))
                    if pth and pth.startswith('public/'):
                        cover_map[m.post_id] = pth
            except Exception:
                pass
        for p in rows:
            # 舊相容路由也改為一致顯示規則
            try:
                u = s.query(User).get(p.author_id)
                label = _get_author_display_name(u, getattr(p, 'client_id', None))
            except Exception:
                label = "未知"
            # 學校資訊
            school_info = None
            school_name = None
            try:
                if getattr(p, 'school_id', None):
                    sch = s.query(School).get(p.school_id)
                    if sch:
                        logo_url = f"/uploads/{sch.logo_path}" if sch.logo_path else None
                        school_info = {
                            'id': sch.id,
                            'slug': sch.slug,
                            'name': sch.name,
                            'logo_path': sch.logo_path,
                            'logo_url': logo_url
                        }
                        school_name = sch.name
            except Exception:
                pass
            # 封面 URL/路徑處理
            # resolve_or_publish_public_media 現在可能回傳完整 URL 或本地相對 URL
            cover_url = cover_map.get(p.id)
            cover_path = None
            if cover_url:
                # 如果是本地 URL，移除 /uploads/ 前綴以得到相對路徑
                if cover_url.startswith("/uploads/"):
                    cover_path = cover_url[len("/uploads/"):]
                # 如果是 CDN URL，試著解析出相對路徑
                elif cdn_base_url := (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/"):
                    if cover_url.startswith(cdn_base_url):
                        # 組合出 public/media/... 的路徑
                        relative_part = cover_url[len(cdn_base_url):].lstrip('/')
                        if '/' in relative_part:
                            cover_path = f"public/{relative_part}"

            items.append({
                "id": p.id,
                "content": _markdown_to_html(p.content),
                "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
                "author_hash": label,
                "media_count": int(count_map.get(p.id, 0)),
                "cover_path": cover_path, # 前端可能需要相對路徑
                "cover_url": cover_url,   # 完整的、可直接使用的 URL
                "school_id": (p.school_id or None),
                "school": school_info,
                "school_name": school_name,
                "comment_count": int(comment_map.get(p.id, 0)),
                "is_pinned": bool(getattr(p, "is_pinned", False)),
                "is_advertisement": bool(getattr(p, "is_advertisement", False)),
                "is_announcement": bool(getattr(p, "is_announcement", False)),
                "pinned_at": (p.pinned_at.isoformat() if getattr(p, "pinned_at", None) else None),
                "reply_to_id": (getattr(p, "reply_to_post_id", None) or None),
            })
        return _wrap_ok({
            "items": items,
            "page": page,
            "per_page": per_page,
            "total": int(total),
        })

@bp.get("/<int:pid>")
def get_post(pid: int):
    """Fetch a single approved post by id (public)."""
    with get_session() as s:
        p = s.query(Post).filter(
            and_(
                Post.id == pid, 
                Post.status == "approved",
                Post.is_deleted == False  # 排除已刪除的貼文
            )
        ).first()
        if not p:
            return _wrap_err("NOT_FOUND", "貼文不存在或尚未公開", 404)
        try:
            u = s.query(User).get(p.author_id)
            label = _get_author_display_name(u, getattr(p, 'client_id', None))
        except Exception:
            label = "未知"
        # 取已核准媒體（僅 public 路徑）
        media_items = []
        try:
            medias = (
                s.query(Media)
                 .filter(
                     and_(
                         Media.post_id==p.id, 
                         Media.status=="approved",
                         Media.is_deleted==False  # 排除已刪除的媒體
                     )
                 )
                 .order_by(Media.id.asc())
                 .all()
            )
            from utils.upload_utils import resolve_or_publish_public_media
            cdn_base_url = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/")
            for m in medias:
                url = resolve_or_publish_public_media(m.path or '', int(m.id), getattr(m,'mime_type',None))
                if not url:
                    continue

                # 推測類型（前端可再判斷）
                ext = (url.rsplit(".",1)[-1].split("?")[0] or "").lower()
                kind = "image" if ext in {"jpg","jpeg","png","webp","gif"} else ("video" if ext in {"mp4","webm","mov"} else "other")
                
                # 解析相對路徑 for 'path' field
                path = None
                if url.startswith("/uploads/"):
                    path = url[len("/uploads/"):]
                elif cdn_base_url and url.startswith(cdn_base_url):
                    relative_part = url[len(cdn_base_url):].lstrip('/')
                    # 假設 CDN URL 結構為 .../media/123.jpg -> public/media/123.jpg
                    if '/' in relative_part:
                        path = f"public/{relative_part}"

                media_items.append({
                    "id": m.id,
                    "path": path, # 盡可能提供相對路徑
                    "url": url,   # 完整的、可直接使用的 URL
                    "kind": kind,
                })
        except Exception:
            media_items = []
        # 構造學校資訊（與列表一致）
        school_info = None
        try:
            if getattr(p, 'school_id', None):
                sch = s.query(School).get(p.school_id)
                if sch:
                    logo_url = f"/uploads/{sch.logo_path}" if sch.logo_path else None
                    school_info = {
                        'id': sch.id,
                        'slug': sch.slug,
                        'name': sch.name,
                        'logo_path': sch.logo_path,
                        'logo_url': logo_url
                    }
        except Exception:
            school_info = None

        return _wrap_ok({
            "id": p.id,
            "content": _markdown_to_html(p.content),
            "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
            "author_hash": label,
            "school_id": (p.school_id or None),
            "school": school_info,
            "media": media_items,
            "is_announcement": bool(getattr(p, "is_announcement", False)),
            "announcement_type": getattr(p, "announcement_type", None),
            "is_advertisement": bool(getattr(p, "is_advertisement", False)),
            "is_pinned": bool(getattr(p, "is_pinned", False)),
            "pinned_at": (p.pinned_at.isoformat() if getattr(p, "pinned_at", None) else None),
            "reply_to_id": (getattr(p, "reply_to_post_id", None) or None),
        })



@bp.post("/create")
@rate_limit(calls=5, per_seconds=60, by='client')
def create_post():
    """建立發文（舊路由）。
    與 /api/posts 相同規則：內容走 clean_html，套用 min_post_chars；有附件請改用 /api/posts/with-media。
    """
    uid = get_effective_user_id()
    if uid is None:
        abort(401)
    
    data = request.get_json() or {}
    content = sanitize_content((data.get("content") or "").strip(), "markdown")
    school_slug = _extract_school_slug((data.get("school_slug") or "").strip())
    is_announcement = bool(data.get("is_announcement", False))
    announcement_type = data.get("announcement_type", "school") if is_announcement else None
    want_advertisement = bool(data.get("is_advertisement", False))
    
    # 內容最小字數審核
    # 依學校（若有）載入內容規則覆寫
    from utils.db import get_session as _gs
    with _gs() as _s:
        enforce_min, min_chars = _load_school_content_rules(_s, school_slug)
    if enforce_min:
        if len(content) < max(1, min_chars):
            return _wrap_err("CONTENT_TOO_SHORT", f"內容太短（需 ≥ {max(1, min_chars)} 字）", 422)
    else:
        if len(content) < 1:
            return _wrap_err("CONTENT_REQUIRED", "內容不可為空", 422)
    
    max_len = int(os.getenv("POST_MAX_CHARS", "5000"))
    if len(content) > max_len:
        return _wrap_err("CONTENT_TOO_LONG", f"內容過長（最多 {max_len} 字）", 422)
    
    # 解析回覆目標（可選）
    reply_to_id = None
    try:
        rid_raw = data.get("reply_to_id")
        if isinstance(rid_raw, (int, str)):
            rid_str = str(rid_raw).strip()
            if rid_str.isdigit():
                reply_to_id = int(rid_str)
    except Exception:
        reply_to_id = None

    with get_session() as s:
        # 獲取用戶信息
        user = s.query(User).get(uid)
        if not user:
            return _wrap_err("USER_NOT_FOUND", "用戶不存在", 404)
        
        # 確定目標學校ID
        target_school_id = None
        if school_slug:
            sch = s.query(School).filter(School.slug==school_slug).first()
            if sch:
                target_school_id = sch.id
            else:
                return _wrap_err("SCHOOL_NOT_FOUND", "指定的學校不存在", 404)
        
        # 檢查用戶是否有權限在該學校發文
        if not can_post_to_school(user, target_school_id):
            return _wrap_err("PERMISSION_DENIED", "您沒有權限在該學校發文", 403)
        
        # 廣告權限與旗標（僅 dev_admin / commercial 可選）
        is_advertisement = False
        if user and user.role in ['dev_admin', 'commercial'] and want_advertisement:
            is_advertisement = True
            target_school_id = None  # 廣告貼文一律跨校
        
        # 檢查公告權限
        if is_announcement:
            if user.role == 'dev_admin':
                # dev_admin 可以發全平台、跨校、學校公告
                if announcement_type not in ['platform', 'cross', 'school']:
                    return _wrap_err("INVALID_ANNOUNCEMENT_TYPE", "無效的公告類型", 400)
            elif user.role == 'campus_admin':
                # campus_admin 只能發學校公告
                if announcement_type != 'school':
                    return _wrap_err("PERMISSION_DENIED", "campus_admin 只能發學校公告", 403)
                if not target_school_id or (user.school_id and target_school_id != user.school_id):
                    return _wrap_err("PERMISSION_DENIED", "campus_admin 只能在自己的學校發公告", 403)
            elif user.role == 'cross_admin':
                # cross_admin 只能發跨校公告
                if announcement_type != 'cross':
                    return _wrap_err("PERMISSION_DENIED", "cross_admin 只能發跨校公告", 403)
                if target_school_id is not None:
                    return _wrap_err("PERMISSION_DENIED", "cross_admin 只能發跨校公告", 403)
            else:
                return _wrap_err("PERMISSION_DENIED", "您沒有權限發布公告", 403)
        
        # 公告需要 dev_admin 審核，廣告直接核准發布，其餘仍走送審
        initial_status = "approved" if is_advertisement else "pending"
        p = Post(
            author_id=uid, 
            content=content, 
            status=initial_status, 
            school_id=target_school_id,
            is_advertisement=is_advertisement,
            is_announcement=is_announcement,
            announcement_type=announcement_type
        )
        if reply_to_id:
            ref = s.query(Post).filter(Post.id == reply_to_id, Post.is_deleted == False).first()
            if not ref:
                return _wrap_err("REPLY_TARGET_NOT_FOUND", "無法回覆：目標貼文不存在", 404)
            p.reply_to_post_id = reply_to_id
            # 回覆貼文自動繼承被回覆貼文的學校設定
            target_school_id = ref.school_id
        try:
            p.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            p.ip = get_client_ip()
        except Exception:
            pass
        
        s.add(p)
        s.flush()
        s.refresh(p)
        s.commit()
        
        # 記錄貼文發布事件
        try:
            from services.event_service import EventService
            u = s.query(User).filter(User.id == uid).first()
            if u:
                # 根據是否為公告選擇不同的事件類型
                event_type = "content.announcement.created" if is_announcement else "content.post.created"
                title = "公告發布" if is_announcement else "貼文發布"
                description = f"用戶 {u.username} 發布了{'公告' if is_announcement else '貼文'} #{p.id}"
                
                EventService.log_event(
                    session=s,
                    event_type=event_type,
                    title=title,
                    description=description,
                    severity="high" if is_announcement else "medium",
                    actor_id=u.id,
                    actor_name=u.username,
                    actor_role=u.role,
                    target_type="post",
                    target_id=str(p.id),
                    target_name=f"{'公告' if is_announcement else '貼文'} #{p.id}",
                    school_id=target_school_id,  # 使用貼文的學校ID，不是用戶的學校ID
                    metadata={
                        "post_id": p.id,
                        "content_length": len(content),
                        "school_slug": school_slug if school_slug else None,
                        "is_announcement": is_announcement
                    },
                    is_important=is_announcement,
                    send_webhook=True
                )
        except Exception:
            pass  # 事件記錄失敗不影響貼文發布
        
        return jsonify({"id": p.id, "status": p.status})

@bp.post("/upload")
@rate_limit(calls=10, per_seconds=300, by='client')
def upload_media():
    uid = get_effective_user_id()
    if uid is None:
        abort(401)
    # 接 multipart/form-data: file, post_id
    f = request.files.get("file")
    post_id = int(request.form.get("post_id", "0"))
    school_slug = _extract_school_slug((request.form.get("school_slug") or "").strip())
    if not f or not is_allowed(f.filename): abort(422)
    # 大小與嗅探
    max_size_mb = int(os.getenv("UPLOAD_MAX_SIZE_MB", "10"))
    _ = max_size_mb * 1024 * 1024
    try:
        f.stream.seek(0, os.SEEK_END)
        size = f.stream.tell(); f.stream.seek(0)
    except Exception:
        size = None
    if size is not None and size > max_bytes:
        return _wrap_err("FILE_TOO_LARGE", f"檔案過大（上限 {max_size_mb} MB）", 413)
    try:
        head = f.stream.read(64); f.stream.seek(0)
        if sniff_kind(head) == 'unknown':
            return _wrap_err("SUSPECT_FILE", "檔案內容與格式不符或未知", 400)
    except Exception:
        return _wrap_err("SUSPECT_FILE", "檔案檢查失敗", 400)
    ext = os.path.splitext(f.filename)[1].lower()
    gid = f"{uuid.uuid4().hex}{ext}"
    rel = f"{post_id}/{gid}"  # 子資料夾以 post_id 分流
    pending_path = os.path.join(os.getenv("UPLOAD_ROOT","uploads"), "pending", rel)
    os.makedirs(os.path.dirname(pending_path), exist_ok=True)
    f.save(pending_path)

    with get_session() as s:
        m = Media(post_id=post_id, path=f"pending/{rel}", status="pending")
        try:
            m.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            m.ip = get_client_ip()
        except Exception:
            pass
        try:
            if school_slug:
                sch = s.query(School).filter(School.slug==school_slug).first()
                if sch:
                    m.school_id = sch.id
        except Exception:
            pass
        s.add(m); s.flush(); s.commit()
        return jsonify({"media_id": m.id, "path": m.path, "status": m.status})

@bp.post("")
@rate_limit(calls=5, per_seconds=60, by='client')
def create_post_compat():
    """Compatibility: POST /api/posts
    Accepts JSON { content, client_tx_id? } and returns wrapper with post object.
    """
    uid = get_effective_user_id()
    if uid is None:
        abort(401)
    data = request.get_json() or {}
    content = sanitize_content((data.get("content") or "").strip(), "markdown")
    school_slug = _extract_school_slug((data.get("school_slug") or "").strip())
    is_announcement = bool(data.get("is_announcement", False))
    announcement_type = data.get("announcement_type", "school") if is_announcement else None
    # 內容最小字數審核（僅限純文字發文；附檔案另一路由）
    from utils.db import get_session as _gs
    with _gs() as _s:
        enforce_min, min_chars = _load_school_content_rules(_s, school_slug)
    if enforce_min:
        if len(content) < max(1, min_chars):
            return _wrap_err("CONTENT_TOO_SHORT", f"內容太短（需 ≥ {max(1, min_chars)} 字）", 422)
    else:
        if len(content) < 1:
            return _wrap_err("CONTENT_REQUIRED", "內容不可為空", 422)
    max_len = int(os.getenv("POST_MAX_CHARS", "5000"))
    if len(content) > max_len:
        return _wrap_err("CONTENT_TOO_LONG", f"內容過長（最多 {max_len} 字）", 422)
    # 解析回覆目標（可選）
    reply_to_id = None
    try:
        rid_raw = data.get("reply_to_id")
        if isinstance(rid_raw, (int, str)):
            rid_str = str(rid_raw).strip()
            if rid_str.isdigit():
                reply_to_id = int(rid_str)
    except Exception:
        reply_to_id = None

    with get_session() as s:
        # 獲取用戶信息檢查是否為廣告帳號
        user = s.query(User).get(uid)
        want_ad = bool(data.get("is_advertisement", False))
        is_advertisement = bool(user and user.role in ['dev_admin','commercial'] and want_ad)
        
        # 確定學校ID
        target_school_id = None
        if school_slug and not is_advertisement:
            sch = s.query(School).filter(School.slug==school_slug).first()
            if sch:
                target_school_id = sch.id
        
        # 檢查公告權限
        if is_announcement and user:
            if user.role == 'dev_admin':
                # dev_admin 可以發全平台、跨校、學校公告
                if announcement_type not in ['platform', 'cross', 'school']:
                    return _wrap_err("INVALID_ANNOUNCEMENT_TYPE", "無效的公告類型", 400)
            elif user.role == 'campus_admin':
                # campus_admin 只能發學校公告
                if announcement_type != 'school':
                    return _wrap_err("PERMISSION_DENIED", "campus_admin 只能發學校公告", 403)
                if not target_school_id or (user.school_id and target_school_id != user.school_id):
                    return _wrap_err("PERMISSION_DENIED", "campus_admin 只能在自己的學校發公告", 403)
            elif user.role == 'cross_admin':
                # cross_admin 只能發跨校公告
                if announcement_type != 'cross':
                    return _wrap_err("PERMISSION_DENIED", "cross_admin 只能發跨校公告", 403)
                if target_school_id is not None:
                    return _wrap_err("PERMISSION_DENIED", "cross_admin 只能發跨校公告", 403)
            else:
                return _wrap_err("PERMISSION_DENIED", "您沒有權限發布公告", 403)
        
        initial_status = "approved" if (is_announcement or is_advertisement) else "pending"
        p = Post(
            author_id=uid, 
            content=content, 
            status=initial_status,
            school_id=target_school_id,
            is_advertisement=is_advertisement,
            is_announcement=is_announcement,
            announcement_type=announcement_type
        )
        if reply_to_id:
            # 驗證目標貼文存在且未刪除
            ref = s.query(Post).filter(Post.id == reply_to_id, Post.is_deleted == False).first()
            if not ref:
                return _wrap_err("REPLY_TARGET_NOT_FOUND", "無法回覆：目標貼文不存在", 404)
            p.reply_to_post_id = reply_to_id
        try:
            p.client_id = (request.headers.get('X-Client-Id') or '').strip() or None
            p.ip = get_client_ip()
        except Exception:
            pass
        s.add(p); s.flush(); s.refresh(p)
        s.commit()
        # 記錄事件
        try:
            u = s.query(User).get(uid)
            if u:
                from services.event_service import EventService
                # 根據是否為公告選擇不同的事件類型
                event_type = "content.announcement.created" if is_announcement else "content.post.created"
                title = "公告發布" if is_announcement else "貼文發布"
                description = f"用戶 {u.username} 發布了{'公告' if is_announcement else '貼文'} #{p.id}"
                
                EventService.log_event(
                    session=s,
                    event_type=event_type,
                    title=title,
                    description=description,
                    severity="high" if is_announcement else "medium",
                    actor_id=u.id,
                    actor_name=u.username,
                    actor_role=u.role,
                    target_type="post",
                    target_id=str(p.id),
                    target_name=f"{'公告' if is_announcement else '貼文'} #{p.id}",
                    school_id=p.school_id,  # 使用貼文的學校ID
                    metadata={
                        "post_id": p.id,
                        "content_length": len(content),
                        "school_slug": school_slug if school_slug else None,
                        "is_announcement": is_announcement
                    },
                    is_important=is_announcement,
                    send_webhook=True
                )
        except Exception:
            pass
        # 使用新的匿名帳號顯示邏輯
        client_id = request.headers.get("X-Client-Id", "").strip()
        try:
            u = s.query(User).get(p.author_id)
            author_label = _get_author_display_name(u, client_id)
        except Exception:
            author_label = "未知"
        payload = {
            "id": p.id,
            "content": p.content,
            "created_at": (p.created_at.isoformat() if getattr(p, "created_at", None) else None),
            "author_hash": author_label,
            "reply_to_id": (getattr(p, "reply_to_post_id", None) or None),
        }
    # best-effort broadcast (optional)
    try:
        from app import socketio
        origin = None
        try:
            uid_sub = get_jwt_identity()
            if uid_sub is not None:
                origin = f"user:{uid_sub}"
        except Exception:
            origin = None
        if not origin:
            origin = f"client:{(request.headers.get('X-Client-Id') or '-').strip()}"
        socketio.emit("post_created", {"post": payload, "origin": origin, "client_tx_id": data.get("client_tx_id")})
        
        # 發送送審事件
        socketio.emit("post.pending", {
            "post_id": p.id,
            "content": p.content[:100] + "..." if len(p.content) > 100 else p.content,
            "author": author_label,
            "client_id": p.client_id,
            "ip": p.ip,
            "school_id": p.school_id,
            "media_count": 0,  # 純文字貼文
            "ts": datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass
    return _wrap_ok(payload, 201)

@bp.post("/<int:pid>/delete_request")
@rate_limit(calls=3, per_seconds=300, by='client')  # 5分鐘內最多3次請求
def request_delete(pid: int):
    """申請刪除貼文（廣告貼文不可申請刪除）"""
    """提交刪文請求（任何已知貼文皆可提交），需提供 reason。"""
    from services.delete_service import DeleteService
    
    data = request.get_json(silent=True) or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return _wrap_err("REASON_REQUIRED", "請提供刪文理由", 400)
    
    # 獲取請求者ID（如果已登入）
    requester_id = None
    try:
        requester_id = get_jwt_identity()
        if requester_id:
            requester_id = int(requester_id)
    except Exception:
        pass
    
    with get_session() as s:
        result = DeleteService.create_delete_request(s, pid, reason, requester_id)
        
        if result["success"]:
            # 廣播送審事件給管理端
            try:
                from app import socketio
                socketio.emit("delete_request.created", {
                    "request_id": result.get("delete_request_id"),
                    "post_id": int(pid),
                    "reason": reason,
                    "requester_id": requester_id,
                })
            except Exception:
                pass
            return _wrap_ok({"ok": True, "message": result["message"]}, 201)
        else:
            return _wrap_err("CREATE_FAILED", result["error"], 400)

@bp.post("/with-media")
@rate_limit(calls=3, per_seconds=60, by='client')
def create_post_with_media_compat():
    """Compatibility: POST /api/posts/with-media (multipart)
    Creates a pending post and attach multiple files as pending media under uploads/pending/.
    Returns wrapper with basic post object.
    """
    uid = get_effective_user_id()
    if uid is None:
        return _wrap_err("UNAUTHORIZED", "缺少授權資訊", 401)
    # Must be multipart/form-data
    if not request.content_type or not request.content_type.startswith("multipart/form-data"):
        return _wrap_err("INVALID_CONTENT_TYPE", "請使用 multipart/form-data", 400)

    content = sanitize_content((request.form.get("content", "") or "").strip(), "markdown")
    school_slug = _extract_school_slug((request.form.get("school_slug") or "").strip())
    is_announcement = bool(request.form.get("is_announcement", False))
    announcement_type = request.form.get("announcement_type", "school") if is_announcement else None
    want_advertisement = (str(request.form.get("is_advertisement", "")).lower() in {"1","true","yes","on"})
    # 若有附件上傳，允許空內容（略過最小字數審核）

    files = request.files.getlist("files")
    if not files:
        return _wrap_err("NO_FILES", "未上傳任何檔案", 422)
    # 若沒有內容且有附件，直接允許；若有內容仍可沿用（不再做最小字數檢查）

    # 與 /api/posts/upload 對齊：預設使用專案內 uploads 目錄，避免容器外 /data 權限問題
    upload_root = os.getenv("UPLOAD_ROOT", "uploads")

    saved_any = False
    media_records = []  # 暫存媒體記錄
    
    # 先處理所有檔案，確保都有效
    for fs in files:
            fname = (fs.filename or "").strip()
            if not fname:
                continue
            if not is_allowed(fname):
                return _wrap_err("UNSUPPORTED_FILE", f"不支援的檔案格式: {fname}", 400)
            
            # 先處理檔案，不創建資料庫記錄
            try:
                from utils.upload_utils import save_media_simple
                # 先計算檔案大小，避免在 save_media_simple 中消耗檔案流
                fs.seek(0, os.SEEK_END)
                file_size = fs.tell()
                fs.seek(0)
                
                # 使用臨時 ID 保存檔案
                temp_id = len(media_records) + 1
                upload_result = save_media_simple(fs, temp_id, upload_root)
                
                # 暫存媒體資訊
                media_records.append({
                    "file_name": fname,
                    "path": upload_result["path"],
                    "file_size": file_size,
                    "file_type": upload_result["file_type"],
                    "mime_type": upload_result["mime"]
                })
                
                saved_any = True
            except Exception as e:
                return _wrap_err("FS_WRITE_FAILED", f"無法儲存檔案：{e}", 500)

    if not saved_any:
        return _wrap_err("NO_VALID_FILES", "沒有有效的檔案", 422)

    # 所有檔案處理成功後，創建貼文和媒體記錄
    post_id = None
    post_content = content or ""
    post_author_id = uid
    post_client_id = (request.headers.get('X-Client-Id') or '').strip() or None
    post_ip = get_client_ip()
    post_school_id = None
    
    # 廣告權限與旗標（僅 dev_admin / commercial 可選）
    is_advertisement = False
    try:
        with get_session() as s:
            user = s.query(User).get(uid)
            is_advertisement = bool(user and user.role in ['dev_admin','commercial'] and want_advertisement)
            
            if school_slug and not is_advertisement:
                sch = s.query(School).filter(School.slug==school_slug).first()
                if sch:
                    post_school_id = sch.id
                    
            # 檢查公告權限
            if is_announcement and user:
                if user.role == 'dev_admin':
                    # dev_admin 可以發全平台、跨校、學校公告
                    if announcement_type not in ['platform', 'cross', 'school']:
                        return _wrap_err("INVALID_ANNOUNCEMENT_TYPE", "無效的公告類型", 400)
                elif user.role == 'campus_admin':
                    # campus_admin 只能發學校公告
                    if announcement_type != 'school':
                        return _wrap_err("PERMISSION_DENIED", "campus_admin 只能發學校公告", 403)
                    if not post_school_id or (user.school_id and post_school_id != user.school_id):
                        return _wrap_err("PERMISSION_DENIED", "campus_admin 只能在自己的學校發公告", 403)
                elif user.role == 'cross_admin':
                    # cross_admin 只能發跨校公告
                    if announcement_type != 'cross':
                        return _wrap_err("PERMISSION_DENIED", "cross_admin 只能發跨校公告", 403)
                    if post_school_id is not None:
                        return _wrap_err("PERMISSION_DENIED", "cross_admin 只能發跨校公告", 403)
                else:
                    return _wrap_err("PERMISSION_DENIED", "您沒有權限發布公告", 403)
    except Exception:
        pass
    
    try:
        with get_session() as s:
            initial_status = "approved" if is_advertisement else "pending"
            p = Post(
                author_id=post_author_id, 
                content=post_content, 
                status=initial_status,
                school_id=post_school_id,
                is_advertisement=is_advertisement,
                is_announcement=is_announcement,
                announcement_type=announcement_type
            )
            p.client_id = post_client_id
            p.ip = post_ip
            
            s.add(p)
            s.flush()
            s.refresh(p)
            post_id = p.id

            # 記錄事件
            try:
                u = s.query(User).get(post_author_id)
                if u:
                    from services.event_service import EventService
                    EventService.log_event(
                        session=s,
                        event_type="content.post.created",
                        title="貼文發布（含媒體）",
                        description=f"用戶 {u.username} 發布了含媒體的貼文 #{p.id}",
                        severity="medium",
                        actor_id=u.id,
                        actor_name=u.username,
                        actor_role=u.role,
                        target_type="post",
                        target_id=str(p.id),
                        target_name=f"貼文 #{p.id}",
                        school_id=p.school_id,  # 使用貼文的學校ID
                        metadata={
                            "post_id": p.id,
                            "content_length": len(post_content),
                            "has_media": True,
                            "school_slug": school_slug if school_slug else None
                        },
                        is_important=False,
                        send_webhook=True
                    )
            except Exception:
                pass

            # 創建媒體記錄
            for i, media_info in enumerate(media_records):
                m = Media(
                    post_id=p.id,
                    status="pending",  # 媒體狀態與貼文同步，當貼文被審核時會一起處理
                    path=media_info["path"],
                    file_name=media_info["file_name"],
                    file_size=media_info["file_size"],
                    file_type=media_info["file_type"],
                    mime_type=media_info["mime_type"]
                )
                m.client_id = post_client_id
                m.ip = post_ip
                m.school_id = post_school_id
                
                s.add(m)
                s.flush()  # 獲取媒體 ID
                
                # 移動檔案到正確的 ID
                from utils.upload_utils import move_media_file
                temp_id = i + 1
                if move_media_file(temp_id, m.id, upload_root):
                    # 更新路徑
                    m.path = f"media/{m.id}.{media_info['path'].split('.')[-1]}"

            s.commit()
    except Exception as e:
        # 如果資料庫操作失敗，清理已保存的檔案
        try:
            from utils.upload_utils import cleanup_temp_files
            for i in range(len(media_records)):
                temp_id = i + 1
                cleanup_temp_files(temp_id, upload_root)
        except Exception:
            pass
        return _wrap_err("DB_OPERATION_FAILED", f"資料庫操作失敗：{e}", 500)

    # 使用新的匿名帳號顯示邏輯
    client_id = request.headers.get("X-Client-Id", "").strip()
    try:
        with get_session() as s:
            u = s.query(User).get(post_author_id)
            author_label = _get_author_display_name(u, client_id)
    except Exception:
        author_label = "未知"
    payload = {
        "id": post_id,
        "content": post_content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "author_hash": author_label,
    }

    # best-effort broadcast (optional)
    try:
        from app import socketio
        origin = None
        try:
            uid_sub = get_jwt_identity()
            if uid_sub is not None:
                origin = f"user:{uid_sub}"
        except Exception:
            origin = None
        if not origin:
            origin = f"client:{(request.headers.get('X-Client-Id') or '-').strip()}"
        socketio.emit("post_created", {"post": payload, "origin": origin, "client_tx_id": request.form.get("client_tx_id")})
        
        # 發送送審事件
        socketio.emit("post.pending", {
            "post_id": post_id,
            "content": post_content[:100] + "..." if len(post_content) > 100 else post_content,
            "author": author_label,
            "client_id": post_client_id,
            "ip": post_ip,
            "school_id": post_school_id,
            "media_count": len(media_records),
            "ts": datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass

    return _wrap_ok(payload, 201)





@bp.post("/<int:post_id>/unpin")
@bp.post("/<int:post_id>/unpin/")
@rate_limit(10, 60)  # 每分鐘10次
def unpin_post(post_id: int):
    """取消置頂貼文（僅dev_admin可操作）"""
    try:
        from utils.auth import get_effective_user_id
        uid = get_effective_user_id()
        if not uid:
            return _wrap_err("UNAUTHORIZED", "需要登入", 401)
        
        with get_session() as s:
            user = s.query(User).get(uid)
            if not user or user.role not in ['campus_admin', 'dev_admin']:
                return _wrap_err("FORBIDDEN", "權限不足", 403)
            
            post = s.query(Post).filter(
                and_(
                    Post.id == post_id,
                    Post.status == "approved",
                    Post.is_deleted == False
                )
            ).first()
            
            if not post:
                return _wrap_err("NOT_FOUND", "貼文不存在", 404)
            
            if not post.is_pinned:
                # 冪等處理：已非置頂，視為成功
                return _wrap_ok({
                    "message": "已取消置頂",
                    "post_id": post_id
                })
            
            # 取消置頂
            post.is_pinned = False
            post.pinned_at = None
            post.pinned_by = None
            
            s.commit()
            log_user_action(
                event_type="content.post.unpin",
                actor_id=uid,
                actor_name=(user.username if user else ""),
                action=f"取消置頂貼文 #{post_id}",
                target_id=post_id,
                target_type="post",
                session=s,
            )
            
            return _wrap_ok({
                "message": "已取消置頂",
                "post_id": post_id
            })
    
    except Exception as e:
        return _wrap_err("DB_ERROR", f"操作失敗：{e}", 500)


@bp.patch("/<int:post_id>/pin")
@bp.patch("/<int:post_id>/pin/")
@rate_limit(20, 60)  # 統一冪等端點
def patch_pin(post_id: int):
    """
    統一入口：PATCH /api/posts/:id/pin
    請求 JSON: { is_pinned: boolean }
    規則：
      - 僅 campus_admin、dev_admin 可操作
      - 冪等：若目標狀態與現況相同，直接回 ok
    """
    try:
        from utils.auth import get_effective_user_id
        uid = get_effective_user_id()
        if not uid:
            return _wrap_err("UNAUTHORIZED", "需要登入", 401)

        body = request.get_json(silent=True) or {}
        desired = bool(body.get("is_pinned"))

        with get_session() as s:
            user = s.query(User).get(uid)
            if not user or user.role not in ['campus_admin', 'dev_admin']:
                return _wrap_err("FORBIDDEN", "權限不足", 403)

            post = s.query(Post).filter(
                and_(
                    Post.id == post_id,
                    Post.status == "approved",
                    Post.is_deleted == False
                )
            ).first()

            if not post:
                return _wrap_err("NOT_FOUND", "貼文不存在", 404)

            # 冪等：狀態一致直接成功
            if bool(post.is_pinned) == desired:
                return _wrap_ok({
                    "message": ("貼文已置頂" if desired else "已取消置頂"),
                    "post_id": post_id,
                    "is_pinned": bool(post.is_pinned),
                    "pinned_at": (post.pinned_at.isoformat() if getattr(post, 'pinned_at', None) else None),
                })

            # 寫入新狀態
            post.is_pinned = desired
            if desired:
                post.pinned_at = datetime.now(timezone.utc)
                post.pinned_by = uid
            else:
                post.pinned_at = None
                post.pinned_by = None

            s.commit()
            log_user_action(
                event_type=("content.post.pin" if desired else "content.post.unpin"),
                actor_id=uid,
                actor_name=(user.username if user else ""),
                action=(f"置頂貼文 #{post_id}" if desired else f"取消置頂貼文 #{post_id}"),
                target_id=post_id,
                target_type="post",
                session=s,
            )

            return _wrap_ok({
                "message": ("貼文已置頂" if desired else "已取消置頂"),
                "post_id": post_id,
                "is_pinned": bool(post.is_pinned),
                "pinned_at": (post.pinned_at.isoformat() if getattr(post, 'pinned_at', None) else None),
            })
    except Exception as e:
        return _wrap_err("DB_ERROR", f"操作失敗：{e}", 500)
