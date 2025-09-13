import argparse
import json
import os
import time
import uuid
import urllib.parse
import urllib.request

from .client import send_event
from .pipeline import run_pipeline


class FacebookPagePoster:
    def __init__(self, access_token: str, page_id: str, dry_run: bool = True):
        self.access_token = access_token
        self.page_id = page_id
        self.dry_run = dry_run

    def _post(self, url: str, data: dict):
        if self.dry_run:
            return {
                "dry_run": True,
                "url": url,
                "data": {k: ("***REDACTED***" if "token" in k else v) for k, v in data.items()},
                "id": f"{self.page_id}_{uuid.uuid4()}",
            }
        payload = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _get(self, url: str):
        if self.dry_run:
            return {"dry_run": True, "url": url, "permalink_url": f"https://facebook.com/{self.page_id}/posts/dryrun"}
        with urllib.request.urlopen(url, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def create_text_post(self, message: str):
        endpoint = f"https://graph.facebook.com/v20.0/{self.page_id}/feed"
        data = {"message": message, "access_token": self.access_token}
        return self._post(endpoint, data)

    def review_post(self, post_id: str):
        endpoint = (
            f"https://graph.facebook.com/v20.0/{post_id}?fields=permalink_url,message,created_time&access_token="
            f"{urllib.parse.quote(self.access_token)}"
        )
        return self._get(endpoint)


def track(event_host: str, event_port: int, job_id: str, stage: str, status: str, meta: dict = None):
    send_event(event_host, event_port, {
        "job_id": job_id,
        "stage": stage,
        "status": status,
        "meta": meta or {},
    })


def run_page_post(
    message: str,
    job_id: str,
    event_host: str,
    event_port: int,
    access_token: str,
    page_id: str,
    dry_run: bool = True,
    convert_to_ig: bool = False,
    ig_user_id: str = "",
    image_url: str = "",
):
    poster = FacebookPagePoster(access_token, page_id, dry_run=dry_run)

    # 平台建立發文任務（Page）
    track(event_host, event_port, job_id, "page_post", "requested", {"message": message[:60]})
    res = poster.create_text_post(message)
    post_id = res.get("id", "unknown")
    track(event_host, event_port, job_id, "page_post", "completed", {"post_id": post_id})

    # 審視貼文（取連結）
    review = poster.review_post(post_id)
    permalink = review.get("permalink_url", "")
    track(event_host, event_port, job_id, "page_review", "fetched", {"permalink_url": permalink})

    result = {"ok": True, "post_id": post_id, "permalink_url": permalink}

    # 可選：轉 IG（IG 必須有媒體，故需 image_url）
    if convert_to_ig:
        if not image_url:
            track(event_host, event_port, job_id, "ig_convert", "failed", {"reason": "image_url required"})
            result.update({"ig": {"ok": False, "error": "image_url required"}})
            return result
        ig_job_id = f"{job_id}-ig"
        track(event_host, event_port, job_id, "ig_convert", "requested", {"ig_job_id": ig_job_id})
        from .pipeline import run_pipeline

        ig_res = run_pipeline(
            caption=message,
            image_url=image_url,
            job_id=ig_job_id,
            event_host=event_host,
            event_port=event_port,
            access_token=access_token,
            ig_user_id=ig_user_id,
            dry_run=dry_run,
        )
        result.update({"ig": ig_res})
        track(event_host, event_port, job_id, "ig_convert", "completed", {"ok": ig_res.get("ok", False)})

    return result


def main():
    parser = argparse.ArgumentParser(description="ForumKit Facebook Page text post")
    parser.add_argument("--message", required=True)
    parser.add_argument("--job-id", default=str(uuid.uuid4()))
    parser.add_argument("--event-host", default=os.environ.get("EVENT_HOST", "127.0.0.1"))
    parser.add_argument("--event-port", type=int, default=int(os.environ.get("EVENT_PORT", 80)))
    parser.add_argument("--access-token", default=os.environ.get("FB_ACCESS_TOKEN", ""))
    parser.add_argument("--page-id", default=os.environ.get("PAGE_ID", ""))
    parser.add_argument("--dry-run", action="store_true", default=os.environ.get("DRY_RUN", "1") == "1")

    # Optional IG conversion
    parser.add_argument("--convert-to-ig", action="store_true")
    parser.add_argument("--ig-user-id", default=os.environ.get("IG_USER_ID", ""))
    parser.add_argument("--image-url", default="")

    args = parser.parse_args()
    if not args.access_token or not args.page_id:
        print("[forumkit] WARNING: 未提供 PAGE_ID 或 access_token，將強制使用 --dry-run 模式")
        args.dry_run = True

    res = run_page_post(
        message=args.message,
        job_id=args.job_id,
        event_host=args.event_host,
        event_port=args.event_port,
        access_token=args.access_token,
        page_id=args.page_id,
        dry_run=args.dry_run,
        convert_to_ig=args.convert_to_ig,
        ig_user_id=args.ig_user_id,
        image_url=args.image_url,
    )
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()

