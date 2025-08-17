import io
from PIL import Image

def _fake_img_bytes():
    im = Image.new("RGB", (1600, 1200), color=(100, 10, 10))
    buf = io.BytesIO(); im.save(buf, format="JPEG")
    return buf.getvalue()

def test_create_post_with_image(client, auth_token):
    img = (io.BytesIO(_fake_img_bytes()), "pic.jpg")
    r = client.post("/api/posts/with-media",
        data={"title": "day8 test", "content": "with image", "files": [img]},
        headers={"Authorization": f"Bearer {auth_token}"},
        content_type="multipart/form-data")
    assert r.status_code == 201
    j = r.get_json()
    assert j["media"][0]["thumb_url"].endswith(".thumb.webp")

def test_reject_wrong_ext(client, auth_token):
    bad = (io.BytesIO(b"not an image"), "fake.jpg")
    r = client.post("/api/posts/with-media",
        data={"title":"x","content":"y","files":[bad]},
        headers={"Authorization": f"Bearer {auth_token}"},
        content_type="multipart/form-data")
    assert r.status_code == 400 or r.status_code == 415
