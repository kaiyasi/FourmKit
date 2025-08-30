import io
import os
from PIL import Image

def _fake_img_bytes():
    im = Image.new("RGB", (800, 600), color=(100, 10, 10))
    buf = io.BytesIO(); im.save(buf, format="JPEG")
    return buf.getvalue()

def auth_header(t):
    return {"Authorization": f"Bearer {t}"}

def test_upload_flow_pending_then_queue(client, auth_token):
    # 1) create a post (pending)
    r = client.post("/api/posts/create", json={"content": "hello world"}, headers=auth_header(auth_token))
    assert r.status_code == 200
    post_id = r.get_json()["id"]

    # 2) upload media to that post (goes to pending/)
    img = (io.BytesIO(_fake_img_bytes()), "pic.jpg")
    r2 = client.post(
        "/api/posts/upload",
        data={"post_id": str(post_id), "file": img},
        headers=auth_header(auth_token),
        content_type="multipart/form-data",
    )
    assert r2.status_code == 200
    data = r2.get_json()
    assert data["status"] == "pending"
    assert data["path"].startswith("pending/")

    # 3) file actually exists under UPLOAD_ROOT/pending
    upload_root = os.getenv("UPLOAD_ROOT", "uploads")
    abs_path = os.path.join(upload_root, data["path"])  # pending/<post>/<uuid>
    assert os.path.exists(abs_path)

def test_reject_wrong_ext(client, auth_token):
    # create a post first
    r = client.post("/api/posts/create", json={"content": "bad file"}, headers=auth_header(auth_token))
    assert r.status_code == 200
    post_id = r.get_json()["id"]

    # try to upload unsupported file
    bad = (io.BytesIO(b"not an image"), "fake.exe")
    r2 = client.post(
        "/api/posts/upload",
        data={"post_id": str(post_id), "file": bad},
        headers=auth_header(auth_token),
        content_type="multipart/form-data",
    )
    assert r2.status_code in (400, 422)
