import os, uuid
from datetime import datetime, timezone
from typing import Tuple
from flask import Flask, jsonify, g, request, Response
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY","dev")
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    @app.before_request
    def _ctx():  # noqa: D401, ANN201 - Flask hook  # pyright: ignore[reportUnusedFunction]
        g.request_id = str(uuid.uuid4())
        g.request_ts = datetime.now(timezone.utc).isoformat()
        # 維護模式開關（先最小可用）
        if os.getenv("MAINTENANCE_MODE","off") == "on" and request.path.startswith("/api") and request.path != "/api/healthz":
            return error("FK-MAINT-001", 503, "系統維護中", hint="請稍後再試")

    @app.after_request
    def _headers(resp: Response) -> Response:  # noqa: D401, ANN201  # pyright: ignore[reportUnusedFunction]
        resp.headers["X-Request-ID"] = g.request_id  # type: ignore[attr-defined]
        return resp

    @app.route("/api/healthz")
    def healthz() -> Response:  # noqa: D401, ANN201  # pyright: ignore[reportUnusedFunction]
        return jsonify({"ok": True, "ts": g.request_ts, "request_id": g.request_id})

    @app.errorhandler(Exception)
    def _err(e: Exception):  # noqa: ANN001 - generic catch-all  # pyright: ignore[reportUnusedFunction]
        return error("FK-SYS-000", 500, "系統忙碌，請稍後再試")

    return app

def error(code: str, http: int, message: str, hint: str | None = None) -> Tuple[Response, int]:
    return (
        jsonify(
            {
                "success": False,
                "error": {"code": code, "message": message, "hint": hint, "details": None},
                "trace": {
                    "request_id": getattr(g, "request_id", None),
                    "ts": getattr(g, "request_ts", None),
                },
            }
        ),
        http,
    )

app = create_app()
