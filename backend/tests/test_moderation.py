import io
import os
from PIL import Image


def _fake_img_bytes():
    from PIL import Image
    import io
    im = Image.new("RGB", (320, 240), color=(50, 100, 150))
    buf = io.BytesIO(); im.save(buf, format="JPEG")
    return buf.getvalue()


def auth_header(t):
    return {"Authorization": f"Bearer {t}"}


def test_queue_and_approve_post(client, auth_token, admin_token):
    # create a pending post as normal user
    r = client.post("/api/posts/create", json={"content": "moderation me"}, headers=auth_header(auth_token))
    assert r.status_code == 200
    pid = r.get_json()["id"]

    # queue should list it
    q = client.get("/api/moderation/queue", headers=auth_header(admin_token))
    assert q.status_code == 200
    body = q.get_json()
    assert any(item["id"] == pid for item in body["posts"])  # type: ignore

    # approve
    a = client.post(f"/api/moderation/post/{pid}/approve", headers=auth_header(admin_token))
    assert a.status_code == 200
    assert a.get_json()["ok"] is True


def test_approve_media_moves_to_public(client, auth_token, admin_token):
    # create post and upload image (pending)
    r = client.post("/api/posts/create", json={"content": "with pending media"}, headers=auth_header(auth_token))
    pid = r.get_json()["id"]
    img = (io.BytesIO(_fake_img_bytes()), "x.jpg")
    up = client.post("/api/posts/upload", data={"post_id": str(pid), "file": img},
                     headers=auth_header(auth_token), content_type="multipart/form-data")
    assert up.status_code == 200
    media_path = up.get_json()["path"]  # pending/<rel>

    # find media id via moderation queue
    q = client.get("/api/moderation/queue", headers=auth_header(admin_token))
    mid = q.get_json()["media"][0]["id"]

    # approve media
    a = client.post(f"/api/moderation/media/{mid}/approve", headers=auth_header(admin_token))
    assert a.status_code == 200
    # file should be moved
    upload_root = os.getenv("UPLOAD_ROOT", "uploads")
    rel = media_path.split("pending/", 1)[-1]
    public_abs = os.path.join(upload_root, "public", rel)
    assert os.path.exists(public_abs)


def test_fsops_rejects_traversal():
    # direct unit test for path traversal prevention
    import pytest
    from utils import fsops
    with pytest.raises(ValueError):
        fsops.move_to_public("../../etc/passwd")

