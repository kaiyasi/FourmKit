"""
Instagram 圖片渲染引擎
使用 Pillow 渲染貼文圖片，支援多種佈局與圖層
"""

import os
import io
import re
import requests
from typing import Optional, List, Tuple
from collections.abc import Mapping
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class IGRenderer:
    """Instagram 圖片渲染器"""

    def __init__(self, cdn_base_path: str = None):
        import os as _os
        # 允許以環境變數覆寫輸出目錄，以便與 CDN 共享（例如 /data/ig_rendered）
        default_path = "/app/uploads/ig_rendered"
        self.cdn_base_path = _os.getenv("IG_RENDER_BASE_PATH", cdn_base_path or default_path)
        self.font_cache = {}

    def render_post(self, forum_post, template, media_list: List[str] = None, account=None) -> str:
        """
        渲染貼文圖片

        Args:
            forum_post: 論壇貼文對象
            template: IGTemplate 對象
            media_list: 媒體檔案路徑列表

        Returns:
            str: 渲染後圖片的 CDN 路徑
        """
        try:
            # 創建 Canvas
            canvas = self._create_canvas(template.canvas_config)

            # 判斷是否有附件
            has_attachment = media_list and len(media_list) > 0

            # 渲染附件圖片
            if has_attachment and template.attachment_config:
                self._render_attachments(canvas, media_list, template.attachment_config)

            # 渲染文字（先將 Markdown/HTML 轉為純文字，再渲染）
            text_config = template.text_with_attachment if has_attachment else template.text_without_attachment
            logger.info(f"選擇文字配置: {'with' if has_attachment else 'without'}_attachment, font_family={text_config.get('font_family') if text_config else None}")
            if text_config:
                content_plain = self._to_plain_text(getattr(forum_post, 'content', '') or '')
                # 若為「回覆貼文」，先顯示回覆行（支援模板回覆格式），再下一行為貼文正文
                reply_line = self._format_reply_line(forum_post, template)
                if reply_line:
                    content_plain = f"{reply_line}\n{content_plain}".strip()
                self._render_text(canvas, content_plain, text_config)

            # 渲染 Logo（圖層順序控制）
            if template.logo_config and template.logo_config.get('enabled'):
                self._render_logo(canvas, template.logo_config, forum_post.school)

            # 渲染浮水印（支援三子項：自訂文字/時間戳/格式化ID）
            if template.watermark_config:
                logger.info(f"浮水印配置: {template.watermark_config}")
                self._render_watermark(
                    canvas,
                    template.watermark_config,
                    forum_post,
                    getattr(template, 'caption_template', {}) or {},
                    template,
                    account,
                )

            # 若開啟導引線，就先覆蓋 XY 軸/網格（僅預覽使用，不影響正式發布）
            try:
                show_guides_flag = bool(getattr(self, 'show_guides', False)) or (os.getenv('IG_PREVIEW_GUIDES') == '1')
            except Exception:
                show_guides_flag = False
            if show_guides_flag:
                self._overlay_guides(canvas)

            # 保存到 CDN
            cdn_path = self._save_to_cdn(canvas, forum_post.id)

            logger.info(f"成功渲染貼文 {forum_post.id}，CDN 路徑: {cdn_path}")
            return cdn_path

        except Exception as e:
            logger.error(f"渲染貼文失敗: {e}", exc_info=True)
            raise

    @staticmethod
    def _clean_markdown_escapes(text: str) -> str:
        if not text:
            return ''
        cleaned = re.sub(r'\\([*_`~\[\](){}#!\\-])', r'\1', text)
        cleaned = cleaned.replace("\\\\", "\\")
        cleaned = cleaned.replace("\\", "")
        return cleaned

    def _to_plain_text(self, text: str) -> str:
        """將來源內容（可能含 Markdown/HTML）轉純文字以用於圖片渲染。
        優先使用 utils.sanitize.html_to_plain_text；失敗則使用簡易正則作為備援。
        """
        try:
            from utils.sanitize import html_to_plain_text
            plain = html_to_plain_text(text) or ''
            return self._clean_markdown_escapes(plain).strip()
        except Exception:
            # 簡易備援：去 HTML tag 與常見 Markdown 標記
            import re
            t = text or ''
            t = self._clean_markdown_escapes(t)
            t = re.sub(r'<[^>]+>', '', t)               # remove HTML tags
            t = re.sub(r'`+([^`]+)`+', r'\1', t)       # inline code
            t = re.sub(r'\*\*([^*]+)\*\*', r'\1', t)  # **bold**
            t = re.sub(r'\*([^*]+)\*', r'\1', t)        # *italic*
            t = re.sub(r'__([^_]+)__', r'\1', t)         # __bold__
            t = re.sub(r'_([^_]+)_', r'\1', t)           # _italic_
            t = re.sub(r'^\s*#+\s*', '', t, flags=re.MULTILINE)  # leading # headers
            t = re.sub(r'\[(.*?)\]\([^)]*\)', r'\1', t)       # [text](url)
            t = re.sub(r'\s+', ' ', t)
            return t.strip()

    def _format_reply_line(self, forum_post, template) -> str:
        """如果是回覆貼文，回傳『回覆貼文 #<id>』格式的首行，否則空字串。
        回覆格式可由 template.caption_template.reply 自訂；否則使用預設『回覆貼文 #<id>』。
        """
        try:
            rid = getattr(forum_post, 'reply_to_post_id', None)
            if rid:
                # 嘗試讀取模板回覆格式
                reply_cfg = None
                try:
                    reply_root = getattr(template, 'caption_template', None) or {}
                    reply_cfg = reply_root.get('reply') if isinstance(reply_root, dict) else None
                except Exception:
                    reply_cfg = None

                label = '回覆貼文'
                style = 'hashtag'
                tpl = None
                # 支援 reply.image 與 reply（全域）兩層：image 優先
                preferred = None
                if isinstance(reply_cfg, dict):
                    if isinstance(reply_cfg.get('image'), dict):
                        preferred = reply_cfg.get('image')
                    else:
                        preferred = reply_cfg
                if isinstance(preferred, dict):
                    if preferred.get('enabled', True) is False:
                        return ''
                    label = (preferred.get('label') or label).strip()
                    style = (preferred.get('style') or style).strip()
                    tpl = (preferred.get('template') or '').strip() or None

                # 構造臨時 post 只用於格式化 ID
                class _P: pass
                p = _P(); p.id = rid; p.school = getattr(forum_post, 'school', None); p.announcement_type = None

                formatted = None
                if tpl:
                    formatted = self._format_post_id_for_image(p, tpl, style)
                else:
                    # 若 template.caption_template.post_id_format 有啟用則沿用；否則 fallback #<rid>
                    ct = getattr(template, 'caption_template', {}) or {}
                    pid_cfg = ct.get('post_id_format') if isinstance(ct, dict) else None
                    if isinstance(pid_cfg, dict) and pid_cfg.get('enabled'):
                        formatted = self._format_post_id_for_image(
                            p,
                            pid_cfg.get('template', '#{school_short_name}_{post_type}_{post_id}'),
                            pid_cfg.get('style', 'hashtag')
                        )
                    else:
                        formatted = f"#{rid}" if style == 'hashtag' else str(rid)

                return f"{label} {formatted}".strip()
            return ""
        except Exception:
            return ""

    def _format_post_id_for_image(self, post, template_str: str, style: str) -> str:
        school_short = getattr(getattr(post, 'school', None), 'short_name', None) or 'FORUM'
        post_type = 'ANN' if getattr(post, 'announcement_type', None) else 'POST'
        base = template_str.replace('{school_short_name}', school_short).replace('{post_type}', post_type).replace('{post_id}', str(getattr(post, 'id', '0')))
        s = (style or 'plain').lower()
        if s == 'hashtag' and not base.startswith('#'):
            return f'#{base}'
        return base

    def _create_canvas(self, canvas_config: dict) -> Image.Image:
        """創建畫布"""
        width = canvas_config.get('width', 1080)
        height = canvas_config.get('height', 1080)
        bg_type = canvas_config.get('background_type', 'color')

        if bg_type == 'image' and canvas_config.get('background_image'):
            # 使用圖片背景
            bg_path = canvas_config['background_image']
            canvas = self._load_image(bg_path)
            canvas = canvas.resize((width, height), Image.Resampling.LANCZOS)
        else:
            # 使用純色背景
            bg_color = canvas_config.get('background_color', '#FFFFFF')
            canvas = Image.new('RGB', (width, height), self._hex_to_rgb(bg_color))

        return canvas

    def _render_attachments(self, canvas: Image.Image, media_list: List[str], config: dict):
        """渲染附件圖片"""
        if not config.get('enabled'):
            return

        # 過濾出可用的圖片 URL（快速以副檔名判斷，降低未知格式）
        image_exts = {"jpg","jpeg","png","webp","gif"}
        safe_media = [m for m in (media_list or []) if isinstance(m, str) and (m.rsplit('.',1)[-1].split('?')[0].lower() in image_exts)]
        media_count = len(safe_media)
        if media_count == 0:
            logger.warning("附件列表不含圖片或已被過濾，跳過圖片渲染")
            return

        # 支援 width/height，同時向後兼容 base_width/base_height 和 base_size
        if 'width' in config and 'height' in config:
            base_width = config.get('width', 450)
            base_height = config.get('height', 450)
        elif 'base_width' in config and 'base_height' in config:
            base_width = config.get('base_width', 450)
            base_height = config.get('base_height', 450)
        else:
            # 向後兼容：使用 base_size
            base_size = config.get('base_size', 450)
            base_width = base_size
            base_height = base_size

        border_radius = config.get('border_radius', 20)
        spacing = config.get('spacing', 15)
        pos_x = config.get('position_x', 70)
        pos_y = config.get('position_y', 70)

        # 以 position_x/position_y 作為整個附件群組的中心點
        origin_x = int(pos_x - (base_width // 2))
        origin_y = int(pos_y - (base_height // 2))

        if media_count == 1:
            # 單張圖片：使用 base_width x base_height
            try:
                img = self._load_and_resize(safe_media[0], base_width, base_height)
                img = self._add_rounded_corners(img, border_radius)
                canvas.paste(img, (origin_x, origin_y), img if img.mode == 'RGBA' else None)
            except Exception as e:
                logger.warning(f"跳過圖片 {safe_media[0]}: {e}")

        elif media_count == 2:
            # 兩張圖片：左右分割
            img_width = (base_width - spacing) // 2
            for i, media_path in enumerate(safe_media):
                try:
                    img = self._load_and_resize(media_path, img_width, base_height)
                    img = self._add_rounded_corners(img, border_radius)
                    x = origin_x + i * (img_width + spacing)
                    canvas.paste(img, (x, origin_y), img if img.mode == 'RGBA' else None)
                except Exception as e:
                    logger.warning(f"跳過圖片 {media_path}: {e}")

        elif media_count == 3:
            # 三張圖片：左兩右一
            left_height = (base_height - spacing) // 2
            left_width = base_width // 2
            for i in range(min(2, media_count)):
                try:
                    img = self._load_and_resize(safe_media[i], left_width, left_height)
                    img = self._add_rounded_corners(img, border_radius)
                    y = origin_y + i * (left_height + spacing)
                    canvas.paste(img, (origin_x, y), img if img.mode == 'RGBA' else None)
                except Exception as e:
                    logger.warning(f"跳過圖片 {safe_media[i]}: {e}")

            # 右側大圖
            right_width = base_width - left_width - spacing
            try:
                if media_count >= 3:
                    img = self._load_and_resize(safe_media[2], right_width, base_height)
                else:
                    img = self._load_and_resize(safe_media[-1], right_width, base_height)
                img = self._add_rounded_corners(img, border_radius)
                canvas.paste(img, (origin_x + left_width + spacing, origin_y), img if img.mode == 'RGBA' else None)
            except Exception as e:
                logger.warning(f"跳過圖片 {safe_media[2 if media_count>=3 else -1]}: {e}")

        elif media_count >= 4:
            # 四張圖片：2x2 網格
            grid_width = (base_width - spacing) // 2
            grid_height = (base_height - spacing) // 2
            for i in range(min(4, media_count)):
                row = i // 2
                col = i % 2
                try:
                    img = self._load_and_resize(safe_media[i], grid_width, grid_height)
                    img = self._add_rounded_corners(img, border_radius)
                    x = origin_x + col * (grid_width + spacing)
                    y = origin_y + row * (grid_height + spacing)
                    canvas.paste(img, (x, y), img if img.mode == 'RGBA' else None)
                except Exception as e:
                    logger.warning(f"跳過圖片 {safe_media[i]}: {e}")


    @staticmethod
    def _apply_newline_mode(text: str | None, mode: str | None) -> str:
        mode = (mode or 'convert').lower()
        base = text or ''
        if mode == 'convert':
            if not base:
                return ''
            out = base.replace('\\r\\n', '\n')
            out = out.replace('\\n', '\n')
            out = out.replace('\\r', '')
            return out
        return base

    def _render_text(self, canvas: Image.Image, content: str, config: dict):
        """渲染文字內容"""
        font_family = config.get('font_family', 'Arial')
        font_size = config.get('font_size', 32)
        color = self._hex_to_rgb(config.get('color', '#000000'))
        truncate_text = config.get('truncate_text', '...')
        newline_mode = config.get('newline_mode', 'convert')
        line_spacing = config.get('line_spacing', 10)
        align = (config.get('align') or 'left').lower()
        if align == 'fill':
            align = 'justify'

        font = self._load_font(font_family, font_size)

        processed_content = self._apply_newline_mode(content, newline_mode)

        # 支援新版：以正方形區塊控制文字範圍
        box_size = config.get('box_size')
        box_center_x = config.get('box_center_x')
        box_center_y = config.get('box_center_y')

        if box_size and box_center_x is not None and box_center_y is not None:
            try:
                box_size = int(box_size)
                box_center_x = int(box_center_x)
                box_center_y = int(box_center_y)
            except Exception:
                box_size = None

        if box_size and box_size > 0:
            half = box_size // 2
            left = max(0, int(box_center_x - half))
            top = max(0, int(box_center_y - half))
            right = min(canvas.width, left + box_size)
            bottom = min(canvas.height, top + box_size)
            box_width = right - left
            box_height = bottom - top

            if box_width <= 0 or box_height <= 0:
                return

            line_height = self._estimate_line_height(font)
            effective_line_height = line_height + line_spacing
            max_lines_by_height = max(1, (box_height + line_spacing) // max(1, effective_line_height))
            max_lines_config = config.get('max_lines')
            if isinstance(max_lines_config, int) and max_lines_config > 0:
                max_lines_allowed = min(max_lines_by_height, max_lines_config)
            else:
                max_lines_allowed = max_lines_by_height

            lines, truncated = self._wrap_text_pixels(
                processed_content,
                font,
                box_width,
                max_lines_allowed,
                truncate_text,
            )

            draw = ImageDraw.Draw(canvas)

            # 垂直對齊：預設 top；支援 center/middle/center_line（以行數為基準置中）
            v_align = str(config.get('vertical_align', 'top')).lower()
            if lines:
                total_lines = len(lines)
                content_height = (total_lines - 1) * effective_line_height + line_height
                if v_align in {'center', 'middle', 'center_line', 'middle_line'}:
                    # 以行數中心置中：第一行頂端 y 使整段中心對齊 box_center_y
                    desired_y = int(box_center_y - content_height / 2)
                    min_y = top
                    max_y = bottom - content_height
                    y = max(min_y, min(desired_y, max_y))
                elif v_align in {'bottom', 'bottom_line'}:
                    y = max(top, bottom - content_height)
                else:
                    y = top
            else:
                y = top

            for idx, line in enumerate(lines):
                if y + line_height > bottom + 1:
                    break

                if not line:
                    y += effective_line_height
                    continue

                is_last_line = idx == len(lines) - 1
                line_width = self._text_width(font, line)

                if align == 'justify' and not is_last_line and ' ' in line:
                    self._draw_justified_line(draw, line, font, color, left, right, y)
                else:
                    if align == 'right':
                        x = right - line_width
                    elif align == 'center':
                        x = left + (box_width - line_width) / 2
                    else:
                        x = left
                    draw.text((x, y), line, font=font, fill=color)

                y += effective_line_height

            return

        # 舊版相容：使用起始座標與字元換行
        max_chars = config.get('max_chars_per_line', 20)
        max_lines = config.get('max_lines', 8)
        start_x = int(config.get('start_x', 70))
        start_y = int(config.get('start_y', 700))

        lines = self._wrap_text(processed_content, max_chars, max_lines, truncate_text, newline_mode)
        draw = ImageDraw.Draw(canvas)
        y = start_y
        line_height = self._estimate_line_height(font)
        effective_line_height = line_height + line_spacing

        for line in lines:
            parts = line.split('\n')
            for part in parts:
                if not part:
                    y += effective_line_height
                    continue
                part_width = self._text_width(font, part)
                if align == 'right':
                    x = start_x - part_width
                elif align == 'center':
                    x = start_x - (part_width / 2)
                else:
                    x = start_x
                draw.text((x, y), part, font=font, fill=color)
                y += effective_line_height

    def _estimate_line_height(self, font: ImageFont.FreeTypeFont) -> int:
        try:
            bbox = font.getbbox('Ag')
            return max(1, bbox[3] - bbox[1])
        except Exception:
            return max(1, getattr(font, 'size', 16))

    def _text_width(self, font: ImageFont.FreeTypeFont, text: str) -> float:
        if not text:
            return 0.0
        try:
            return float(font.getlength(text))
        except Exception:
            bbox = font.getbbox(text)
            return float(bbox[2] - bbox[0])

    def _split_word_by_width(self, word: str, font: ImageFont.FreeTypeFont, max_width: int) -> Tuple[str, str]:
        if not word:
            return '', ''
        consumed = ''
        for idx, ch in enumerate(word):
            candidate = consumed + ch
            if self._text_width(font, candidate) <= max_width:
                consumed = candidate
            else:
                break
        if not consumed:
            consumed = word[0]
            idx = 1
        else:
            idx = len(consumed)
        return consumed, word[idx:]

    def _wrap_text_pixels(
        self,
        text: str,
        font: ImageFont.FreeTypeFont,
        max_width: int,
        max_lines: int,
        truncate_text: str,
    ) -> Tuple[List[str], bool]:
        lines: List[str] = []
        truncated = False

        paragraphs = text.split('\n') if text else ['']
        for p_idx, paragraph in enumerate(paragraphs):
            if len(lines) >= max_lines:
                truncated = True
                break

            paragraph = paragraph.rstrip()
            if paragraph == '':
                lines.append('')
                continue

            words = paragraph.split(' ')
            current = ''
            i = 0
            while i < len(words):
                word = words[i]
                if not word:
                    i += 1
                    continue

                candidate = word if not current else f"{current} {word}"
                if self._text_width(font, candidate) <= max_width:
                    current = candidate
                    i += 1
                    continue

                if current:
                    lines.append(current)
                    current = ''
                    if len(lines) >= max_lines:
                        truncated = True
                        break
                    continue

                part, remainder = self._split_word_by_width(word, font, max_width)
                lines.append(part)
                if len(lines) >= max_lines:
                    truncated = True
                    break
                if remainder:
                    words.insert(i + 1, remainder)
                i += 1

            if truncated:
                break

            if current:
                lines.append(current)

            if p_idx < len(paragraphs) - 1 and len(lines) < max_lines:
                lines.append('')

        if len(lines) > max_lines:
            lines = lines[:max_lines]
            truncated = True

        if truncated and lines:
            suffix = truncate_text or ''
            available_width = max_width - self._text_width(font, suffix)
            last = lines[-1]
            while last and self._text_width(font, last) > available_width and available_width > 0:
                last = last[:-1]
            if available_width <= 0:
                lines[-1] = suffix[: max(1, len(suffix))]
            else:
                lines[-1] = last.rstrip() + suffix

        return lines, truncated

    def _draw_justified_line(
        self,
        draw: ImageDraw.ImageDraw,
        line: str,
        font: ImageFont.FreeTypeFont,
        color: tuple,
        left: int,
        right: int,
        y: int,
    ) -> None:
        words = [w for w in line.split(' ') if w]
        if len(words) <= 1:
            draw.text((left, y), line, font=font, fill=color)
            return

        box_width = right - left
        total_words_width = sum(self._text_width(font, w) for w in words)
        gaps = len(words) - 1
        if total_words_width >= box_width or gaps == 0:
            draw.text((left, y), line, font=font, fill=color)
            return

        extra_space = (box_width - total_words_width) / gaps
        cursor_x = float(left)
        for idx, word in enumerate(words):
            draw.text((cursor_x, y), word, font=font, fill=color)
            word_width = self._text_width(font, word)
            cursor_x += word_width
            if idx < gaps:
                cursor_x += extra_space

    def _render_logo(self, canvas: Image.Image, config: dict, school=None):
        """渲染 Logo"""
        source = config.get('source', 'platform_logo')
        pos_x = config.get('position_x', 50)
        pos_y = config.get('position_y', 950)
        width = config.get('width', 150)
        height = config.get('height', 80)
        opacity = config.get('opacity', 1.0)

        # 根據來源載入 Logo
        if source == 'school_logo' and school and hasattr(school, 'logo_path'):
            logo_path = school.logo_path
        elif source == 'custom' and config.get('custom_image'):
            logo_path = config['custom_image']
        else:
            logo_path = '/uploads/platform_logo.png'

        try:
            logo = self._load_image(logo_path)
            logo = logo.resize((width, height), Image.Resampling.LANCZOS)

            # 處理透明度
            if opacity < 1.0:
                logo = self._apply_opacity(logo, opacity)

            # 以 position_x/position_y 為 Logo 中心
            paste_x = int(pos_x - width // 2)
            paste_y = int(pos_y - height // 2)
            canvas.paste(logo, (paste_x, paste_y), logo if logo.mode == 'RGBA' else None)
        except Exception as e:
            logger.warning(f"無法載入 Logo: {e}")

    def _render_watermark(self, canvas: Image.Image, config: dict, post=None, caption_config: dict = None, template=None, account=None):
        """渲染浮水印（支援三子項：自訂文字/時間戳/格式化ID）"""
        # 兼容舊版（單一 text）
        if 'items' not in (config or {}):
            raw_text = config.get('text', 'ForumKit')
            font_family = config.get('font_family', 'Arial')
            font_size = config.get('font_size', 14)
            color = self._hex_to_rgb(config.get('color', '#000000'))
            opacity = config.get('opacity', 0.3)
            pos_x = config.get('position_x', 950)
            pos_y = config.get('position_y', 1050)
            text = self._replace_variables(raw_text, post, caption_config or {}, wm_config=config or {})
            self._draw_text(canvas, text, font_family, font_size, color, opacity, pos_x, pos_y)
            return

        items = config.get('items') or {}

        # 自訂文字
        custom = items.get('custom_text') or {}
        if custom.get('enabled'):
            text = self._render_custom_text(custom, post, account=account, template=template)
            self._draw_text(
                canvas, text,
                custom.get('font_family', 'Arial'),
                custom.get('font_size', 14),
                self._hex_to_rgb(custom.get('color', '#000000')),
                float(custom.get('opacity', 0.3)),
                int(custom.get('position_x', 50)),
                int(custom.get('position_y', 1050)),
                str(custom.get('align', 'center')),
            )

        # 時間戳
        ts = items.get('timestamp') or {}
        if ts.get('enabled'):
            text = self._render_timestamp(ts, post, caption_config or {}, config)
            self._draw_text(
                canvas, text,
                ts.get('font_family', 'Arial'),
                ts.get('font_size', 14),
                self._hex_to_rgb(ts.get('color', '#000000')),
                float(ts.get('opacity', 0.3)),
                int(ts.get('position_x', 200)),
                int(ts.get('position_y', 1050)),
                str(ts.get('align', 'center')),
            )

        # 格式化 ID
        fid = items.get('formatted_id') or {}
        if fid.get('enabled'):
            text = self._render_formatted_id(fid, post)
            self._draw_text(
                canvas, text,
                fid.get('font_family', 'Arial'),
                fid.get('font_size', 14),
                self._hex_to_rgb(fid.get('color', '#000000')),
                float(fid.get('opacity', 0.3)),
                int(fid.get('position_x', 350)),
                int(fid.get('position_y', 1050)),
                str(fid.get('align', 'center')),
            )

    def _draw_text(self, canvas: Image.Image, text: str, font_family: str, font_size: int, color: tuple, opacity: float, pos_x: int, pos_y: int, align: str = 'center'):
        """在 (pos_x, pos_y) 位置繪製單行文字。
        水平對齊 align: 'left' | 'center' | 'right'（預設 center）。垂直一律以中心對齊。
        """
        txt_layer = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(txt_layer)
        font = self._load_font(font_family, font_size)
        alpha = int(max(0, min(1, opacity)) * 255)
        color_with_alpha = (*color, alpha)
        # 文字邊界
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        a = (align or 'center').lower()
        if a == 'left':
            top_left_x = int(pos_x)
        elif a == 'right':
            top_left_x = int(pos_x - text_w)
        else:
            top_left_x = int(pos_x - text_w / 2)
        top_left_y = int(pos_y - text_h / 2)
        draw.text((top_left_x, top_left_y), text, font=font, fill=color_with_alpha)
        canvas.paste(Image.alpha_composite(canvas.convert('RGBA'), txt_layer).convert('RGB'))

    def _render_custom_text(self, custom: dict, post, account=None, template=None) -> str:
        text = str(custom.get('text', ''))
        campus = self._resolve_campus_name(post, account=account, template=template)
        text = text.replace('{campus}', campus)
        # 移除作者資訊占位符，匿名貼文不會保留作者
        text = re.sub(r'\s*{auth}\s*', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def _resolve_campus_name(self, post, account=None, template=None) -> str:
        """推斷貼文所屬校區名稱。"""

        def extract_name(obj) -> Optional[str]:
            keys = ('short_name', 'name', 'display_name', 'slug', 'school_name', 'school_slug', 'campus', 'campus_name')
            if not obj:
                return None
            if isinstance(obj, Mapping):
                for key in keys:
                    value = obj.get(key)
                    if isinstance(value, str):
                        cleaned = value.strip()
                        if cleaned:
                            return cleaned
            else:
                for key in keys:
                    value = getattr(obj, key, None)
                    if isinstance(value, str):
                        cleaned = value.strip()
                        if cleaned:
                            return cleaned
            return None

        def get_value(source, key):
            if not source:
                return None
            if isinstance(source, Mapping):
                return source.get(key)
            return getattr(source, key, None)

        def resolve_from(source) -> Optional[str]:
            if not source:
                return None

            candidate = extract_name(source)
            if candidate:
                return candidate

            nested = get_value(source, 'school')
            candidate = extract_name(nested)
            if candidate:
                return candidate

            return None

        candidate = resolve_from(post)
        if candidate:
            return candidate

        metadata = get_value(post, 'metadata')
        if isinstance(metadata, Mapping):
            candidate = resolve_from(metadata)
            if candidate:
                return candidate

            nested_school = metadata.get('school')
            candidate = extract_name(nested_school)
            if candidate:
                return candidate

        for source in (
            get_value(account, 'school'),
            account,
            get_value(template, 'school'),
            template,
        ):
            candidate = resolve_from(source)
            if candidate:
                return candidate

        return 'CAMPUS'

    def _render_timestamp(self, ts: dict, post, caption_config: dict, wm_config: dict) -> str:
        # 取得時間與時區（優先使用 ts 的 timezone）
        base_dt = getattr(post, 'created_at', None) or datetime.utcnow()
        tz_name = (ts.get('timezone')
                   or (ts.get('time_format') or {}).get('timezone')
                   or (caption_config.get('time_format') or {}).get('timezone')
                   or 'UTC')
        fmt = ts.get('format') or '%Y-%m-%d %H:%M'
        # 支援自訂 token：YYYY/MM/DD HH:mm, 以及 hh 與 aa
        py_fmt = self._convert_time_format(fmt)
        try:
            import pytz  # type: ignore
            tz = pytz.timezone(tz_name)
            if base_dt.tzinfo is None:
                base_dt = tz.localize(base_dt)
            else:
                base_dt = base_dt.astimezone(tz)
        except Exception:
            pass
        out = base_dt.strftime(py_fmt)
        # aa: am/pm 小寫
        if 'aa' in fmt:
            out = out.replace('%p', base_dt.strftime('%p').lower())
            out = out.replace('AM', 'am').replace('PM', 'pm')
        return out

    def _overlay_guides(self, canvas: Image.Image) -> None:
        """在圖片上覆蓋導引線（XY 軸/網格與座標刻度）。

        - 每 100px 畫一條較粗主線（不透明度 50%）
        - 每 50px 畫一條次線（不透明度 25%）
        - 中心線以醒目色標示
        - 軸向座標每 100px 標上文字
        """
        try:
            w, h = canvas.size
            draw = ImageDraw.Draw(canvas, 'RGBA')

            def rgba(c, a):
                return (c[0], c[1], c[2], a)

            major = (0, 122, 255)
            minor = (0, 0, 0)
            center = (255, 82, 82)

            # 次線（每 50px）
            for x in range(0, w, 50):
                draw.line([(x, 0), (x, h)], fill=rgba(minor, 64), width=1)
            for y in range(0, h, 50):
                draw.line([(0, y), (w, y)], fill=rgba(minor, 64), width=1)

            # 主線（每 100px）
            for x in range(0, w, 100):
                draw.line([(x, 0), (x, h)], fill=rgba(major, 128), width=1)
            for y in range(0, h, 100):
                draw.line([(0, y), (w, y)], fill=rgba(major, 128), width=1)

            # 中心線
            cx, cy = w // 2, h // 2
            draw.line([(cx, 0), (cx, h)], fill=rgba(center, 180), width=2)
            draw.line([(0, cy), (w, cy)], fill=rgba(center, 180), width=2)

            # 座標刻度（每 100px 輕量標示）
            try:
                font = self._load_font('NotoSansTC-Bold', 16)
            except Exception:
                font = self._load_font('Arial', 14)

            label_color = (0, 0, 0, 200)
            pad = 4
            for x in range(0, w + 1, 100):
                txt = str(x)
                draw.text((x + pad, pad), txt, font=font, fill=label_color)
            for y in range(0, h + 1, 100):
                txt = str(y)
                draw.text((pad, y + pad), txt, font=font, fill=label_color)
        except Exception as e:
            logger.warning(f"繪製導引線失敗: {e}")

    def _convert_time_format(self, fmt: str) -> str:
        # 將自訂格式轉換為 strftime：YYYY->%Y, MM->%m, DD->%d, HH->%H, hh->%I, mm->%M, ss->%S, aa->%p
        mapping = [
            ('YYYY', '%Y'), ('YY', '%y'),
            ('MM', '%m'), ('DD', '%d'),
            ('HH', '%H'), ('hh', '%I'),
            ('mm', '%M'), ('ss', '%S'),
            ('aa', '%p'),
        ]
        out = fmt
        for k, v in mapping:
            out = out.replace(k, v)
        return out

    def _render_formatted_id(self, fid: dict, post) -> str:
        # 先生成 id 值（僅使用 id_template）
        school_short = getattr(getattr(post, 'school', None), 'short_name', None) or 'FORUM'
        post_type = 'ANN' if getattr(post, 'announcement_type', None) else 'POST'
        raw_id = str(getattr(post, 'id', '0'))
        id_template = fid.get('id_template') or '#{school_short_name}_{post_type}_{post_id}'
        id_value = id_template.replace('{school_short_name}', school_short).replace('{post_type}', post_type).replace('{post_id}', raw_id)
        return id_value

    def _load_image(self, path: str) -> Image.Image:
        """載入圖片（支援本地路徑和 URL）"""
        if path.startswith('http://') or path.startswith('https://'):
            response = requests.get(path, timeout=10)
            response.raise_for_status()
            ctype = response.headers.get('Content-Type', '')
            if not ctype.startswith('image/'):
                raise ValueError(f'URL 非圖片內容 (Content-Type={ctype})')
            return Image.open(io.BytesIO(response.content)).convert('RGBA')
        else:
            # 優先使用 CDN URL
            cdn_base_url = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip("/")
            if cdn_base_url and path.startswith('public/'):
                # 轉換為 CDN URL 並下載
                cdn_url = f"{cdn_base_url}/{path}"
                try:
                    response = requests.get(cdn_url, timeout=10)
                    response.raise_for_status()
                    ctype = response.headers.get('Content-Type', '')
                    if not ctype.startswith('image/'):
                        raise ValueError(f'CDN URL 非圖片內容 (Content-Type={ctype})')
                    return Image.open(io.BytesIO(response.content)).convert('RGBA')
                except Exception:
                    # CDN 失敗時回退到本地檔案
                    pass

            # 回退到本地檔案
            if not path.startswith('/'):
                upload_root = os.getenv('UPLOAD_ROOT', 'uploads')
                path = os.path.join(upload_root, path)
            return Image.open(path).convert('RGBA')

    def _load_and_resize(self, path: str, width: int, height: int) -> Image.Image:
        """載入並調整圖片大小"""
        img = self._load_image(path)
        return img.resize((width, height), Image.Resampling.LANCZOS)

    def _add_rounded_corners(self, img: Image.Image, radius: int) -> Image.Image:
        """添加圓角"""
        mask = Image.new('L', img.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle([(0, 0), img.size], radius, fill=255)

        output = Image.new('RGBA', img.size, (0, 0, 0, 0))
        output.paste(img, (0, 0))
        output.putalpha(mask)
        return output

    def _apply_opacity(self, img: Image.Image, opacity: float) -> Image.Image:
        """應用透明度"""
        img = img.convert('RGBA')
        alpha = img.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        img.putalpha(alpha)
        return img

    def _wrap_text(self, text: str, max_chars: int, max_lines: int, truncate: str, newline_mode: str = 'convert') -> List[str]:
        if max_chars <= 0 or max_lines <= 0:
            if max_chars <= 0:
                return [truncate] if truncate else []
            return [(truncate or '')[:max_chars]]

        lines: List[str] = []
        current_line = ""
        truncated = False
        idx = 0
        length = len(text or "")
        raw = text or ""

        while idx < length:
            ch = raw[idx]
            idx += 1
            if ch == '\n':
                lines.append(current_line)
                current_line = ""
                if len(lines) >= max_lines:
                    truncated = idx < length
                    break
                continue

            current_line += ch
            if len(current_line) >= max_chars:
                lines.append(current_line[:max_chars])
                current_line = current_line[max_chars:]
                if len(lines) >= max_lines:
                    truncated = idx < length or bool(current_line)
                    break
                continue

        if not truncated and current_line:
            if len(lines) < max_lines:
                lines.append(current_line[:max_chars])
                if len(lines) > max_lines:
                    lines = lines[:max_lines]
                    truncated = True
            else:
                truncated = True

        lines = [line[:max_chars] for line in lines[:max_lines]]

        suffix = truncate or ''
        if newline_mode.lower() == 'convert':
            suffix = suffix.replace('\\r\\n', '\n').replace('\\n', '\n').replace('\\r', '')

        if truncated and lines:
            available = max_chars - len(suffix)
            if available <= 0:
                lines[-1] = suffix[:max(0, max_chars)]
            else:
                lines[-1] = lines[-1][:available] + suffix

        return lines

    def _load_font(self, font_family: str, size: int) -> ImageFont.FreeTypeFont:
        """載入字體（帶快取）"""
        # 如果 font_family 為空，使用回退字體（找可用的 Noto 字體）
        if not font_family or not font_family.strip():
            logger.warning("font_family 為空，嘗試使用回退字體")
            # 嘗試找系統中的 Noto 字體
            fallback_fonts = ["NotoSansTC-Bold", "NotoSansTC-Medium", "NotoSans-Bold"]
            for fallback in fallback_fonts:
                try:
                    return self._load_font(fallback, size)
                except:
                    continue
            # 都找不到，報錯
            raise ValueError("font_family 為空且找不到回退字體，請在模板中設定字體或上傳字體檔案")

        cache_key = f"{font_family}_{size}"
        if cache_key in self.font_cache:
            return self.font_cache[cache_key]

        # 1. 嘗試精確匹配
        exact_paths = [
            f"/app/fonts/{font_family}.ttf",
            f"/app/fonts/{font_family}.otf",
            f"/app/uploads/fonts/{font_family}.ttf",
            f"/app/uploads/fonts/{font_family}.otf",
            f"/uploads/fonts/{font_family}.ttf",
            f"/uploads/fonts/{font_family}.otf",
        ]

        for font_path in exact_paths:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, size)
                self.font_cache[cache_key] = font
                logger.info(f"成功載入字體（精確匹配）: {font_path}")
                return font

        # 2. 嘗試模糊匹配（支援帶後綴的檔名，如 NotoSansTC-Bold_a8952217.ttf）
        font_dirs = ["/app/fonts", "/app/uploads/fonts", "/uploads/fonts"]
        for font_dir in font_dirs:
            if os.path.exists(font_dir):
                for filename in os.listdir(font_dir):
                    # 檢查檔名是否以 font_family 開頭且是字體檔案
                    if filename.startswith(font_family) and (filename.endswith('.ttf') or filename.endswith('.otf')):
                        font_path = os.path.join(font_dir, filename)
                        font = ImageFont.truetype(font_path, size)
                        self.font_cache[cache_key] = font
                        logger.info(f"成功載入字體（模糊匹配）: {font_path}")
                        return font

        # 3. 嘗試系統字體
        system_paths = [
            f"/usr/share/fonts/truetype/{font_family}.ttf",
            f"/usr/share/fonts/truetype/noto/{font_family}.ttf",
            f"/usr/share/fonts/truetype/noto/{font_family}-Regular.ttf",
        ]

        for font_path in system_paths:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, size)
                self.font_cache[cache_key] = font
                logger.info(f"成功載入字體（系統字體）: {font_path}")
                return font

        # 找不到字體，報錯
        raise FileNotFoundError(f"找不到字體: {font_family}，請上傳字體檔案或檢查字體名稱")

    def _save_to_cdn(self, canvas: Image.Image, post_id: int) -> str:
        """保存圖片到 CDN"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"ig_post_{post_id}_{timestamp}.jpg"

        # 確保目錄存在
        os.makedirs(self.cdn_base_path, exist_ok=True)

        filepath = os.path.join(self.cdn_base_path, filename)
        canvas.convert('RGB').save(filepath, 'JPEG', quality=95, optimize=True)

        # 返回公開路徑
        # 規則：
        # 1) 若環境提供 CDN_PUBLIC_BASE_URL 或 PUBLIC_CDN_URL，使用其為網域前綴，
        #    從 self.cdn_base_path 的 /uploads/ 之後取相對目錄並拼接檔名。
        #    這可覆蓋 ig_rendered 以及其他自定目錄（如 public/ig/previews）。
        # 2) 否則，若 IG_RENDER_PUBLIC_PREFIX 設為相對路徑（不含 http/https），沿用該相對前綴。
        # 3) 再否則：
        #    a) 若 cdn_base_path 含 /uploads/，回傳以 /uploads/ 為根（供主站 Nginx /uploads 轉發）。
        #    b) 其他情況回退為最後一層目錄名。
        import os as _os

        cdn_base_url = (
            _os.getenv('CDN_PUBLIC_BASE_URL')
            or _os.getenv('PUBLIC_CDN_URL')
            or ''
        ).strip().rstrip('/')

        uploads_marker = '/uploads/'
        if cdn_base_url and uploads_marker in self.cdn_base_path:
            idx = self.cdn_base_path.find(uploads_marker) + len(uploads_marker)
            under_uploads = self.cdn_base_path[idx:].strip('/')
            public_url = f"{cdn_base_url}/{under_uploads}/{filename}"
            return public_url

        public_prefix = (_os.getenv('IG_RENDER_PUBLIC_PREFIX') or '').strip('/ ')
        if public_prefix and not public_prefix.startswith(('http://', 'https://')):
            return '/' + f"{public_prefix}/{filename}".lstrip('/')

        if uploads_marker in self.cdn_base_path:
            idx = self.cdn_base_path.find(uploads_marker) + len(uploads_marker)
            suffix = self.cdn_base_path[idx:].strip('/') + '/' + filename
            return '/' + f"uploads/{suffix}".lstrip('/')

        last_dir = _os.path.basename(self.cdn_base_path.rstrip('/')) or 'ig_rendered'
        return '/' + f"{last_dir}/{filename}".lstrip('/')

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
        """HEX 顏色轉 RGB"""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def _replace_variables(self, text: str, post, caption_config: dict, wm_config: dict | None = None) -> str:
        """將文字中的變數替換為實際值。

        支援：
          {post_id}, {school_short_name}, {post_type},
          {timestamp}, {date}, {time}, {datetime}, {year}, {month}, {day}, {hour}, {minute}, {second}
          以及 {formatted_id}（若提供 id_format 設定）

        時間格式：優先 wm_config.time_format，其次 caption_config.time_format，最後預設。
        """
        if not text:
            return text

        base_dt = getattr(post, 'created_at', None) or datetime.utcnow()
        # 取得時間格式：水印 > caption > 預設
        tf = {}
        if isinstance(wm_config, dict) and isinstance(wm_config.get('time_format'), dict):
            tf = wm_config.get('time_format') or {}
        elif isinstance(caption_config, dict) and isinstance(caption_config.get('time_format'), dict):
            tf = caption_config.get('time_format') or {}
        tz_name = tf.get('timezone') or 'UTC'
        date_fmt = tf.get('date_format') or '%Y-%m-%d'
        time_fmt = tf.get('time_format') or '%H:%M:%S'
        dt_fmt = tf.get('datetime_format') or '%Y-%m-%d %H:%M:%S'

        try:
            import pytz  # type: ignore
            tz = pytz.timezone(tz_name)
            if base_dt.tzinfo is None:
                base_dt = tz.localize(base_dt) if tz else base_dt
            else:
                base_dt = base_dt.astimezone(tz)
        except Exception:
            pass

        school_short = getattr(getattr(post, 'school', None), 'short_name', None) or 'FORUM'
        post_type = 'ANN' if getattr(post, 'announcement_type', None) else 'POST'
        post_id = str(getattr(post, 'id', '0'))

        # 產生格式化 ID（若提供 wm_config.id_format）
        formatted_id = None
        try:
            if isinstance(wm_config, dict) and isinstance(wm_config.get('id_format'), dict):
                idf = wm_config.get('id_format') or {}
                tmpl = idf.get('template') or '#{school_short_name}_{post_type}_{post_id}'
                style = (idf.get('style') or 'plain').lower()
                base = tmpl.replace('{school_short_name}', school_short).replace('{post_type}', post_type).replace('{post_id}', post_id)
                if style == 'hashtag' and not base.startswith('#'):
                    base = f'#{base}'
                elif style == 'brackets':
                    base = f'[{base}]'
                formatted_id = base
        except Exception:
            formatted_id = None

        mappings = {
            '{post_id}': post_id,
            '{school_short_name}': school_short,
            '{post_type}': post_type,
            '{timestamp}': str(int(base_dt.timestamp())),
            '{date}': base_dt.strftime(date_fmt),
            '{time}': base_dt.strftime(time_fmt),
            '{datetime}': base_dt.strftime(dt_fmt),
            '{year}': base_dt.strftime('%Y'),
            '{month}': base_dt.strftime('%m'),
            '{day}': base_dt.strftime('%d'),
            '{hour}': base_dt.strftime('%H'),
            '{minute}': base_dt.strftime('%M'),
            '{second}': base_dt.strftime('%S'),
        }
        if formatted_id is not None:
            mappings['{formatted_id}'] = formatted_id

        out = text
        for k, v in mappings.items():
            out = out.replace(k, v)
        return out
