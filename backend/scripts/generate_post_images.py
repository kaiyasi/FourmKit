#!/usr/bin/env python3
"""
Generate IG preview images for given forum post IDs (DB-agnostic).

This script uses services.ig_preview.IGPreviewService with test_content to avoid
DB dependencies. It outputs preview URLs and local file paths so you can feed
the images to the IG posting pipeline (e.g., as carousel children).

Usage:
  python backend/scripts/generate_post_images.py 104 105

Env overrides:
  IG_PREVIEW_PATH=/tmp/ig_previews
  CDN_PUBLIC_BASE_URL=http://localhost:12001

Note:
  - In non-container dev env, CDN URL may not be reachable; for DRY_RUN flow,
    only the URL string is needed. For real posting, ensure a publicly
    accessible URL (served by your CDN/Nginx).
"""

import os
import sys
import json
import random
from typing import Dict, List


def _default_template_config() -> Dict:
    # A simple, readable template close to test fixtures
    return {
        "canvas_config": {
            "width": 1080,
            "height": 1080,
            "background_type": "color",
            "background_color": "#FFFFFF",
        },
        "text_without_attachment": {
            "font_family": "Arial",
            "font_size": 34,
            "color": "#111111",
            "max_chars_per_line": 28,
            "max_lines": 10,
            "truncate_text": "...",
            "align": "center",
            "start_y": 420,
            "line_spacing": 10,
        },
        "text_with_attachment": {
            "font_family": "Arial",
            "font_size": 30,
            "color": "#222222",
            "max_chars_per_line": 26,
            "max_lines": 8,
            "truncate_text": "...",
            "align": "left",
            "start_y": 700,
            "line_spacing": 8,
        },
        "attachment_config": {
            "enabled": True,
            "base_size": 450,
            "border_radius": 20,
            "spacing": 15,
            "position_x": 70,
            "position_y": 70,
        },
        "logo_config": {"enabled": False},
        "watermark_config": {"enabled": True, "text": "ForumKit", "opacity": 0.25,
                               "position_x": 930, "position_y": 1040, "font_size": 16,
                               "font_family": "Arial", "color": "#000000"},
    }


def _seed_image_urls(pid: int, count: int = 1) -> List[str]:
    # Deterministic placeholder images (no network fetch at generation time).
    # These URLs are for demonstration; for real publish ensure public reachability.
    base = "https://picsum.photos/seed"
    return [f"{base}/forumkit_{pid}_{i}/1080/1080" for i in range(1, count + 1)]


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print("Usage: python backend/scripts/generate_post_images.py <post_id> [<post_id> ...]")
        return 2

    # Prefer local tmp path when not in container
    os.environ.setdefault("IG_PREVIEW_PATH", os.environ.get("IG_PREVIEW_PATH", "/tmp/ig_previews"))
    os.makedirs(os.environ["IG_PREVIEW_PATH"], exist_ok=True)

    try:
        # Ensure backend/ is importable when invoked from repo root
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if here not in sys.path:
            sys.path.insert(0, here)
        from services.ig_preview import IGPreviewService
    except Exception as e:
        print(f"Import error: {e}")
        return 1

    preview = IGPreviewService()
    tpl = _default_template_config()

    outputs = []
    for pid_str in argv[1:]:
        try:
            pid = int(pid_str)
        except ValueError:
            print(f"Skip invalid post id: {pid_str}")
            continue

        # For demo, one attachment image each; content embeds the ID
        # Use text-only preview to avoid network dependency in generation.
        test_content = {
            "title": "",
            "content": f"ForumKit 測試貼文 #{pid} — 用於 IG 模板生成驗證。",
            "media": [],
        }

        ok, url, err, sec = preview.render_preview(
            template_config=tpl,
            post_id=None,  # avoid DB access; render with test content
            test_content=test_content,
            options={"show_guides": False},
        )
        outputs.append({
            "post_id": pid,
            "success": ok,
            "preview_url": url,
            "error": err,
            "render_time_sec": sec,
        })

    print(json.dumps({"results": outputs}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
