from flask import Blueprint, jsonify, abort
from models import Media
from utils.db import get_session
from utils.upload_utils import resolve_or_publish_public_media

bp = Blueprint("media_v2", __name__, url_prefix="/api/v2/media")


@bp.get("/<int:media_id>")
def get_media_v2(media_id: int):
    """Return canonical public media URL and basic metadata for approved media."""
    with get_session() as s:
        m = s.get(Media, media_id)
        if not m:
            abort(404)
        if (m.status or "").lower() != "approved":
            abort(403)
        rel = resolve_or_publish_public_media(m.path or "", int(m.id), getattr(m, "mime_type", None))
        if not rel or not rel.startswith("public/"):
            abort(404)
        url = f"/uploads/{rel}"
        return jsonify({
            "id": m.id,
            "url": url,
            "mime": getattr(m, "mime_type", None),
            "size": getattr(m, "file_size", None),
            "file_type": getattr(m, "file_type", None),
        })
