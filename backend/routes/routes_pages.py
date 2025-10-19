"""
Module: backend/routes/routes_pages.py
Unified comment style: module docstring + minimal inline notes.
"""
from __future__ import annotations
from flask import Blueprint, jsonify, request, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.authz import require_role
from utils.fsops import UPLOAD_ROOT
from pathlib import Path
import os
from typing import Tuple
from utils.db import get_session
from models import User, School

bp = Blueprint("pages", __name__, url_prefix="/api/pages")

PAGES_DIR = Path(UPLOAD_ROOT) / 'pages'
try:
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
except (PermissionError, OSError) as e:
    import warnings
    warnings.warn(f"無法創建 {PAGES_DIR}，使用備用路徑: {e}")
    PAGES_DIR = Path("uploads/pages")
    PAGES_DIR.mkdir(parents=True, exist_ok=True)


def _safe_slug(slug: str) -> str:
    s = (slug or '').strip().lower()
    if not s or any(ch in s for ch in '/\\..'):
        abort(400)
    import re
    if not re.match(r'^[a-z0-9_-]{1,64}$', s):
        abort(400)
    return s


def _read_file(f: Path) -> Tuple[str, float] | None:
    if not f.exists():
        return None
    try:
        text = f.read_text('utf-8')
        ts = f.stat().st_mtime
        return text, ts
    except Exception:
        abort(500)


def _write_file(f: Path, md: str) -> None:
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix('.md.tmp')
    tmp.write_text(md, 'utf-8')
    os.replace(tmp, f)


def _render_html(md: str) -> str:
    """Very small Markdown-to-HTML converter for headings/links/lists/code.
    We avoid extra deps; sanitize via bleach.
    """
    import re
    import bleach
    blocks = []
    def _code_repl(m):
        blocks.append(m.group(1))
        return f"\uE000{len(blocks)-1}\uE001"
    md2 = re.sub(r"```([\s\S]*?)```", _code_repl, md)
    def esc(s: str) -> str:
        return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    md2 = esc(md2)
    md2 = re.sub(r"^######\s*(.+)$", r"<h6>\1</h6>", md2, flags=re.M)
    md2 = re.sub(r"^#####\s*(.+)$", r"<h5>\1</h5>", md2, flags=re.M)
    md2 = re.sub(r"^####\s*(.+)$", r"<h4>\1</h4>", md2, flags=re.M)
    md2 = re.sub(r"^###\s*(.+)$", r"<h3>\1</h3>", md2, flags=re.M)
    md2 = re.sub(r"^##\s*(.+)$", r"<h2>\1</h2>", md2, flags=re.M)
    md2 = re.sub(r"^#\s*(.+)$", r"<h1>\1</h1>", md2, flags=re.M)
    md2 = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", md2)
    md2 = re.sub(r"\*(.+?)\*", r"<em>\1</em>", md2)
    md2 = re.sub(r"`([^`]+)`", r"<code>\1</code>", md2)
    link_re = re.compile(
        r"\[([^\]]+)\]"
        r"\(\s*"
        r"[\"'“”‘’]?"
        r"(https?://[^)\s\"'“”‘’]+)"
        r"[\"'“”‘’]?"
        r"\s*\)"
    )
    def _link_sub(m):
        text = m.group(1)
        url = m.group(2)
        url = url.strip().strip('\"\'“”‘’')
        return f'<a href="{url}" target="_blank" rel="nofollow noreferrer noopener">{text}</a>'
    md2 = link_re.sub(_link_sub, md2)
    lines = md2.splitlines()
    out = []
    in_ul = False
    for ln in lines:
        if re.match(r"^\s*[-*]\s+", ln):
            if not in_ul:
                out.append('<ul>'); in_ul = True
            ln2 = re.sub(r"^\s*[-*]\s+", '', ln)
            out.append(f"<li>{ln2}</li>")
        else:
            if in_ul:
                out.append('</ul>'); in_ul = False
            if ln.strip():
                out.append(f"<p>{ln}</p>")
            else:
                out.append('')
    if in_ul:
        out.append('</ul>')
    html = '\n'.join(out)
    def _restore(m):
        idx = int(m.group(1))
        code = blocks[idx]
        return f"<pre><code>{esc(code)}</code></pre>"
    html = re.sub(r"\uE000(\d+)\uE001", _restore, html)
    allowed_tags = ['h1','h2','h3','h4','h5','h6','p','ul','li','strong','em','code','pre','a','br']
    allowed_attrs = {'a': ['href','target','rel']}
    clean = bleach.clean(html, tags=allowed_tags, attributes=allowed_attrs, strip=True)
    return clean


def _extract_school_slug() -> str | None:
    v = (request.headers.get('X-School-Slug') or '').strip()
    if not v:
        v = (request.args.get('school') or request.args.get('school_slug') or '').strip()
    return v or None


@bp.get('/<slug>')
def get_page(slug: str):
    base = _safe_slug(slug)
    school_slug = _extract_school_slug()
    scope = (request.args.get('scope') or '').strip().lower()

    if scope in {'global', 'cross', 'school'}:
        cands = []
        if scope == 'global':
            cands = [PAGES_DIR / f"{base}.md"]
        elif scope == 'cross':
            cands = [PAGES_DIR / f"{base}-cross.md"]
        else:
            if not school_slug:
                return jsonify({ 'msg': '缺少 school_slug' }), 400
            cands = [PAGES_DIR / f"{base}-{school_slug}.md"]
        for f in cands:
            raw = _read_file(f)
            if raw is not None:
                md, ts = raw
                return jsonify({ 'slug': base, 'markdown': md, 'html': _render_html(md), 'updated_at': ts, 'exists': True, 'source': f.name })
        default = f"# {base.title()}\n\n此頁面尚未建立。管理員可於後台編輯。"
        html = _render_html(default)
        return jsonify({ 'slug': base, 'markdown': default, 'html': html, 'exists': False, 'source': None })

    cands = []
    if school_slug:
        cands.append(PAGES_DIR / f"{base}-{school_slug}.md")
    cands.append(PAGES_DIR / f"{base}-cross.md")
    cands.append(PAGES_DIR / f"{base}.md")
    for f in cands:
        raw = _read_file(f)
        if raw is not None:
            md, ts = raw
            return jsonify({ 'slug': base, 'markdown': md, 'html': _render_html(md), 'updated_at': ts, 'exists': True, 'source': f.name })
    default = f"# {base.title()}\n\n此頁面尚未建立。管理員可於後台編輯。"
    html = _render_html(default)
    return jsonify({ 'slug': base, 'markdown': default, 'html': html, 'exists': False, 'source': None })


@bp.post('/render')
@jwt_required(optional=True)
def render_preview():
    data = request.get_json(silent=True) or {}
    md = str(data.get('markdown') or '')
    return jsonify({ 'html': _render_html(md) })


@bp.put('/<slug>')
@jwt_required()
@require_role('dev_admin','campus_admin','cross_admin')
def update_page(slug: str):
    base = _safe_slug(slug)
    data = request.get_json(silent=True) or {}
    md = str(data.get('markdown') or '')
    scope = (data.get('scope') or '').strip().lower()
    with get_session() as s:
        uid = get_jwt_identity()
        u = s.get(User, int(uid)) if uid is not None else None
        if not u:
            abort(401)
        if not scope:
            scope = 'global' if u.role == 'dev_admin' else ('cross' if u.role == 'cross_admin' else 'school')
        target: Path
        if scope == 'school':
            school_slug = (data.get('school_slug') or '').strip() or _extract_school_slug()
            if not school_slug:
                return jsonify({ 'msg': '缺少 school_slug' }), 400
            if u.role == 'campus_admin':
                sch = s.query(School).filter(School.slug == school_slug).first()
                if not sch or int(getattr(u,'school_id',0) or 0) != int(sch.id):
                    return jsonify({ 'msg': '僅能編輯所屬學校頁面' }), 403
            target = PAGES_DIR / f"{base}-{school_slug}.md"
        elif scope == 'cross':
            if u.role not in ('cross_admin','dev_admin'):
                return jsonify({ 'msg': '僅 cross_admin/dev_admin 可編輯跨校頁面' }), 403
            target = PAGES_DIR / f"{base}-cross.md"
        else:
            if u.role != 'dev_admin':
                return jsonify({ 'msg': '僅 dev_admin 可編輯全域頁面' }), 403
            target = PAGES_DIR / f"{base}.md"
        if len(md) > 200_000:
            return jsonify({ 'msg': '內容過長' }), 400
        _write_file(target, md)
        return jsonify({ 'ok': True, 'target': target.name })
