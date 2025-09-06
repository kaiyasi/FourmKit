"""
HTML 渲染服務：使用 Playwright 將含 CSS 字體的 HTML 轉為圖片。
此服務為可選依賴；若 Playwright/Chromium 未安裝會丟出 HtmlRenderError。
"""
from __future__ import annotations
from typing import Optional
from io import BytesIO
import os


class HtmlRenderError(Exception):
    pass


class HtmlRenderer:
    def __init__(
        self,
        *,
        viewport_width: int = 1080,
        viewport_height: int = 1350,
        device_scale: float = 2.0,
        browser_args: Optional[list[str]] = None,
        executable_path: Optional[str] = None,
    ) -> None:
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height
        self.device_scale = device_scale
        self.browser_args = browser_args or ["--no-sandbox", "--disable-gpu"]
        # 允許從環境變數指定系統 Chromium 路徑（避免必須下載瀏覽器）
        self.executable_path = executable_path or os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None

        # 檢查 Playwright 是否可用
        try:
            from playwright.sync_api import sync_playwright  # noqa: F401
        except Exception as e:
            raise HtmlRenderError(
                f"Playwright 未安裝或瀏覽器未就緒：{e}. 請安裝 'playwright' 並執行 'python -m playwright install chromium'"
            )

    def render_html_to_image(
        self,
        html_content: str,
        *,
        width: Optional[int] = None,
        height: Optional[int] = None,
        full_page: bool = False,
        background: Optional[str] = "white",
        wait_until: str = "networkidle",
        timeout_ms: int = 15000,
        image_type: str = "jpeg",
        quality: int = 92,
    ) -> BytesIO:
        """將 HTML 渲染為圖片（jpeg 或 png）並返回 BytesIO。"""
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                launch_kwargs = {"args": self.browser_args}
                if self.executable_path:
                    launch_kwargs["executable_path"] = self.executable_path
                browser = p.chromium.launch(**launch_kwargs)
                context = browser.new_context(
                    viewport={
                        "width": int(width or self.viewport_width),
                        "height": int(height or self.viewport_height),
                        "deviceScaleFactor": float(self.device_scale),
                    },
                    device_scale_factor=float(self.device_scale),
                )
                page = context.new_page()

                # 設定背景（避免透明背景轉 JPG 變黑）
                if background is not None:
                    page.evaluate(
                        "bg => (document.documentElement.style.background = bg)",
                        background,
                    )

                page.set_content(html_content, wait_until=wait_until, timeout=timeout_ms)
                t = "jpeg" if str(image_type).lower() == "jpeg" else "png"
                kwargs = {"full_page": full_page, "type": t}
                if t == "jpeg":
                    kwargs["quality"] = int(quality)
                binary = page.screenshot(**kwargs)

                # 清理
                context.close()
                browser.close()

                buf = BytesIO(binary)
                buf.seek(0)
                return buf
        except Exception as e:
            raise HtmlRenderError(f"HTML 渲染失敗：{e}")
