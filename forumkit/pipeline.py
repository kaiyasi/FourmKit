import argparse
import os
import time
import uuid
import urllib.parse
import urllib.request
import json

from .client import send_event


class InstagramPoster:
    def __init__(self, access_token: str, ig_user_id: str, dry_run: bool = True):
        self.access_token = access_token
        self.ig_user_id = ig_user_id
        self.dry_run = dry_run

    def _post(self, url: str, data: dict):
        if self.dry_run:
            return {"dry_run": True, "url": url, "data": {k: ("***REDACTED***" if "token" in k else v) for k, v in data.items()}, "id": str(uuid.uuid4())}
        payload = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _get(self, url: str):
        if self.dry_run:
            return {"dry_run": True, "url": url, "status_code": "FINISHED"}
        with urllib.request.urlopen(url, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def create_media(self, image_url: str, caption: str):
        endpoint = f"https://graph.facebook.com/v20.0/{self.ig_user_id}/media"
        data = {
            "image_url": image_url,
            "caption": caption,
            "access_token": self.access_token,
        }
        return self._post(endpoint, data)

    def check_media_status(self, creation_id: str):
        endpoint = f"https://graph.facebook.com/v20.0/{creation_id}?fields=status_code&access_token={urllib.parse.quote(self.access_token)}"
        return self._get(endpoint)

    def publish_media(self, creation_id: str):
        endpoint = f"https://graph.facebook.com/v20.0/{self.ig_user_id}/media_publish"
        data = {"creation_id": creation_id, "access_token": self.access_token}
        return self._post(endpoint, data)


def track(event_host: str, event_port: int, job_id: str, stage: str, status: str, meta: dict = None):
    send_event(event_host, event_port, {
        "job_id": job_id,
        "stage": stage,
        "status": status,
        "meta": meta or {},
    })


def run_pipeline(
    caption: str,
    image_url: str,
    job_id: str,
    event_host: str,
    event_port: int,
    access_token: str,
    ig_user_id: str,
    dry_run: bool = True,
):
    poster = InstagramPoster(access_token, ig_user_id, dry_run=dry_run)

    # 1) 平台建立發文任務
    track(event_host, event_port, job_id, "platform_post", "created", {"caption": caption})
    time.sleep(0.2)

    # 2) 建立 IG 媒體容器（上傳圖片）
    track(event_host, event_port, job_id, "ig_create_media", "requested", {"image_url": image_url})
    creation = poster.create_media(image_url=image_url, caption=caption)
    creation_id = creation.get("id", "unknown")
    track(event_host, event_port, job_id, "ig_create_media", "created", {"creation_id": creation_id})
    time.sleep(0.4)

    # 3) 等待 IG 端轉檔完成
    status = "IN_PROGRESS"
    while status not in ("FINISHED", "ERROR"):
        res = poster.check_media_status(creation_id)
        status = res.get("status_code", "IN_PROGRESS")
        track(event_host, event_port, job_id, "ig_media_status", status, {"creation_id": creation_id})
        if poster.dry_run:
            # 在乾跑下，最多 loop 2 次就完成
            if status == "IN_PROGRESS":
                status = "FINISHED"
            time.sleep(0.3)
            break
        if status != "FINISHED":
            time.sleep(1)

    if status == "ERROR":
        track(event_host, event_port, job_id, "ig_publish", "failed", {"creation_id": creation_id})
        return {"ok": False, "error": "IG media creation failed"}

    # 4) 正式發佈 IG 貼文
    track(event_host, event_port, job_id, "ig_publish", "requested", {"creation_id": creation_id})
    publish_res = poster.publish_media(creation_id)
    media_id = publish_res.get("id", "unknown")
    track(event_host, event_port, job_id, "ig_publish", "completed", {"media_id": media_id})

    # 5) 完成
    track(event_host, event_port, job_id, "pipeline", "done", {"media_id": media_id})
    return {"ok": True, "media_id": media_id}


def main():
    parser = argparse.ArgumentParser(description="ForumKit IG pipeline runner")
    parser.add_argument("--caption", required=True)
    parser.add_argument("--image-url", required=True)
    parser.add_argument("--job-id", default=str(uuid.uuid4()))
    parser.add_argument("--event-host", default=os.environ.get("EVENT_HOST", "127.0.0.1"))
    parser.add_argument("--event-port", type=int, default=int(os.environ.get("EVENT_PORT", 80)))
    parser.add_argument("--access-token", default=os.environ.get("FB_ACCESS_TOKEN", ""))
    parser.add_argument("--ig-user-id", default=os.environ.get("IG_USER_ID", ""))
    parser.add_argument("--dry-run", action="store_true", default=os.environ.get("DRY_RUN", "1") == "1")

    args = parser.parse_args()
    if not args.access_token:
        print("[forumkit] WARNING: 未提供 access_token，將強制使用 --dry-run 模式")
        args.dry_run = True
    if not args.ig_user_id:
        print("[forumkit] WARNING: 未提供 IG_USER_ID，將強制使用 --dry-run 模式")
        args.dry_run = True

    res = run_pipeline(
        caption=args.caption,
        image_url=args.image_url,
        job_id=args.job_id,
        event_host=args.event_host,
        event_port=args.event_port,
        access_token=args.access_token,
        ig_user_id=args.ig_user_id,
        dry_run=args.dry_run,
    )
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()

