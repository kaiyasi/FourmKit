from models import Post, Media
from utils.db import SessionLocal
import os, pathlib

def create_post(session, author_id=1, content="pending post"):
    p = Post(author_id=author_id, content=content, status="pending")
    session.add(p); session.commit(); return p.id

def test_non_admin_cannot_moderate(client, user_token):
    r = client.post("/api/moderation/post/1/approve", headers={"Authorization": f"Bearer {user_token}"})
    assert r.status_code == 403

def test_admin_approve_flow(client, admin_token, session):
    pid = create_post(session)
    r = client.post(f"/api/moderation/post/{pid}/approve", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    r2 = client.get("/api/posts/list")
    ids = [i["id"] for i in r2.get_json()["items"]]
    assert pid in ids

def test_media_approve_moves_file(tmp_path, client, admin_token, session, monkeypatch):
    up = tmp_path / "uploads"
    (up/"pending/a/b").mkdir(parents=True, exist_ok=True)
    (up/"pending/a/b/x.jpg").write_bytes(b"abc")
    monkeypatch.setenv("UPLOAD_ROOT", str(up))
    pid = create_post(session)
    m = Media(post_id=pid, path="pending/a/b/x.jpg", status="pending")
    session.add(m); session.commit()
    r = client.post(f"/api/moderation/media/{m.id}/approve", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert (up/"public/a/b/x.jpg").exists()
