#!/usr/bin/env python3
"""
Publish an Instagram carousel via ForumKit platform APIs and print only permalinks.

- Logs in with username/password to obtain JWT
- Calls POST /api/admin/ig/posts/publish/carousel with the given forum_post_ids
  (auto-picks the only active IG account when account_id is omitted)
- Polls GET /api/admin/ig/posts/<ig_post_id> until status=PUBLISHED and ig_permalink present
- Prints only the permalink URLs to stdout (one per line), no extra output

Usage:
  python backend/scripts/publish_carousel_via_platform.py \
    --base http://localhost:12005 \
    --user dev_admin --password admin123 \
    --posts 104 105

Env fallbacks:
  FK_BASE, FK_USER, FK_PASS can provide defaults for --base/--user/--password
"""

import argparse
import json
import os
import sys
import time
from urllib import request as req
from urllib.error import HTTPError, URLError


def _http_json(method: str, url: str, body: dict | None = None, headers: dict | None = None, timeout: int = 20) -> dict:
    data = None
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = req.Request(url, data=data, headers=hdrs, method=method)
    with req.urlopen(r, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw.decode("utf-8"))


def login(base: str, user: str, password: str) -> str:
    data = _http_json(
        "POST",
        f"{base.rstrip('/')}/api/auth/login",
        {"username": user, "password": password},
    )
    token = data.get("access_token")
    if not token:
        raise RuntimeError("login failed: no access_token")
    return token


def publish_carousel(base: str, jwt: str, forum_post_ids: list[int]) -> list[int]:
    data = _http_json(
        "POST",
        f"{base.rstrip('/')}/api/admin/ig/posts/publish/carousel",
        {"forum_post_ids": forum_post_ids},
        headers={"Authorization": f"Bearer {jwt}"},
        timeout=60,
    )
    if not data.get("ok"):
        raise RuntimeError(f"publish failed: {json.dumps(data, ensure_ascii=False)}")
    ids = data.get("ig_post_ids") or []
    if not isinstance(ids, list) or not ids:
        raise RuntimeError(f"bad publish response: {json.dumps(data, ensure_ascii=False)}")
    return [int(x) for x in ids]


def poll_permalinks(base: str, jwt: str, ig_post_ids: list[int], timeout_sec: int = 420) -> list[str]:
    deadline = time.time() + timeout_sec
    got: dict[int, str] = {}
    while time.time() < deadline and len(got) < len(ig_post_ids):
        for pid in ig_post_ids:
            if pid in got:
                continue
            try:
                data = _http_json(
                    "GET",
                    f"{base.rstrip('/')}/api/admin/ig/posts/{pid}",
                    headers={"Authorization": f"Bearer {jwt}"},
                    timeout=20,
                )
            except Exception:
                continue
            st = str(data.get("status") or "").lower()
            if (st == "published") and data.get("ig_permalink"):
                got[pid] = data.get("ig_permalink")
        time.sleep(3)
    if len(got) < len(ig_post_ids):
        missing = [pid for pid in ig_post_ids if pid not in got]
        raise TimeoutError(f"timeout waiting permalinks for: {missing}")
    return [got[pid] for pid in ig_post_ids]


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Publish IG carousel via platform APIs; print only permalinks")
    p.add_argument("--base", default=os.getenv("FK_BASE", "http://localhost:12005"))
    p.add_argument("--user", default=os.getenv("FK_USER", ""))
    p.add_argument("--password", default=os.getenv("FK_PASS", ""))
    p.add_argument("--posts", nargs="+", type=int, default=[104, 105], help="forum post IDs (2-10)")
    args = p.parse_args(argv)

    if len(args.posts) < 2 or len(args.posts) > 10:
        print("need 2-10 forum post IDs", file=sys.stderr)
        return 2
    if not args.user or not args.password:
        print("missing --user/--password (or FK_USER/FK_PASS)", file=sys.stderr)
        return 2

    try:
        jwt = login(args.base, args.user, args.password)
        ig_ids = publish_carousel(args.base, jwt, args.posts)
        links = poll_permalinks(args.base, jwt, ig_ids)
        for link in links:
            print(link)
        return 0
    except HTTPError as e:
        try:
            detail = e.read().decode("utf-8")
        except Exception:
            detail = str(e)
        print(detail, file=sys.stderr)
        return 1
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

