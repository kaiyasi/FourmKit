"""
Instagram Caption 生成器
支援單篇貼文和輪播貼文的 Caption 生成，並智能控制長度
"""

import logging
from typing import List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


class IGCaptionGenerator:
    """Instagram Caption 生成器"""

    MAX_CAPTION_LENGTH = 2200

    def __init__(self):
        pass

    def generate_single_caption(self, forum_post, template, account) -> str:
        """
        生成單篇貼文的 Caption

        Args:
            forum_post: 論壇貼文對象
            template: IGTemplate 對象
            account: InstagramAccount 對象

        Returns:
            str: 生成的 Caption
        """
        try:
            caption_config = template.caption_template
            structure = caption_config.get('structure', [])

            parts = []

            for block_type in structure:
                if block_type == 'header':
                    header_config = caption_config.get('header', {})
                    if header_config.get('enabled'):
                        parts.append(self._replace_variables(header_config.get('text', ''), caption_config, forum_post))

                elif block_type == 'divider':
                    divider_config = caption_config.get('divider', {})
                    if divider_config.get('enabled'):
                        parts.append(self._replace_variables(divider_config.get('text', '━━━━━━━━━━'), caption_config, forum_post))

                elif block_type == 'content':
                    reply_line = self._format_reply_prefix(forum_post, caption_config)
                    clean_content = self._strip_markdown_and_html(forum_post.content)
                    content_block = '\n'.join(filter(None, [reply_line, clean_content]))
                    parts.append(content_block)

                elif block_type == 'post_id':
                    post_id_config = caption_config.get('post_id_format', {})
                    if post_id_config.get('enabled'):
                        post_id_str = self._format_post_id(
                            forum_post,
                            post_id_config.get('template', '#{school_short_name}_{post_type}_{post_id}'),
                            post_id_config.get('style', 'hashtag')
                        )
                        post_id_str = self._replace_variables(post_id_str, caption_config, forum_post)
                        parts.append(post_id_str)

                elif block_type == 'footer':
                    footer_config = caption_config.get('footer', {})
                    if footer_config.get('enabled'):
                        parts.append(self._replace_variables(footer_config.get('text', ''), caption_config, forum_post))

                elif block_type == 'hashtags':
                    hashtags_config = caption_config.get('hashtags', {})
                    if hashtags_config.get('enabled'):
                        tags = hashtags_config.get('tags', [])
                        hashtag_str = ' '.join([f'#{tag}' for tag in tags])
                        parts.append(hashtag_str)

            caption = '\n\n'.join(filter(None, parts))

            caption = self._truncate_caption(caption, self.MAX_CAPTION_LENGTH)

            logger.info(f"成功生成單篇 Caption，長度: {len(caption)}")
            return caption

        except Exception as e:
            logger.error(f"生成 Caption 失敗: {e}", exc_info=True)
            raise

    def generate_carousel_caption(self, forum_posts: List, template, account) -> str:
        """
        生成輪播貼文的 Caption（10 篇合併）

        Args:
            forum_posts: 論壇貼文列表（最多 10 篇）
            template: IGTemplate 對象
            account: InstagramAccount 對象

        Returns:
            str: 生成的 Caption
        """
        try:
            caption_config = template.caption_template
            structure = caption_config.get('structure', [])

            fixed_parts = []
            for block_type in structure:
                if block_type in ['header', 'divider', 'footer', 'hashtags']:
                    config = caption_config.get(block_type, {})
                    if config.get('enabled'):
                        if block_type == 'hashtags':
                            tags = config.get('tags', [])
                            fixed_parts.append(' '.join([f'#{tag}' for tag in tags]))
                        else:
                            fixed_parts.append(config.get('text', ''))

            fixed_length = sum(len(part) for part in fixed_parts) + len(fixed_parts) * 2  # 加上換行符

            post_count = len(forum_posts)
            reserved_per_post = 50  # 預留給 Post ID 和格式化
            available_for_content = self.MAX_CAPTION_LENGTH - fixed_length - (post_count * reserved_per_post)
            chars_per_post = max(50, available_for_content // post_count)  # 至少 50 字元

            parts = []

            for block_type in structure:
                if block_type == 'header':
                    header_config = caption_config.get('header', {})
                    if header_config.get('enabled'):
                        parts.append(self._replace_variables(header_config.get('text', ''), caption_config, forum_posts[0]))

                elif block_type == 'divider':
                    divider_config = caption_config.get('divider', {})
                    if divider_config.get('enabled'):
                        parts.append(self._replace_variables(divider_config.get('text', '━━━━━━━━━━'), caption_config, forum_posts[0]))

                elif block_type == 'content':
                    content_parts = []
                    for i, post in enumerate(forum_posts, 1):
                        reply_line = self._format_reply_prefix(post, caption_config)
                        clean_content = self._strip_markdown_and_html(post.content)
                        truncated_content = self._truncate_text(clean_content, chars_per_post, '...')

                        post_id_config = caption_config.get('post_id_format', {})
                        if post_id_config.get('enabled'):
                            post_id_str = self._format_post_id(
                                post,
                                post_id_config.get('template', '#{school_short_name}_{post_type}_{post_id}'),
                                post_id_config.get('style', 'hashtag')
                            )
                            post_id_str = self._replace_variables(post_id_str, caption_config, post)
                            lines = [reply_line, f"{i}. {truncated_content} {post_id_str}" if truncated_content else f"{i}. {post_id_str}" ]
                            content_parts.append('\n'.join([l for l in lines if l]))
                        else:
                            lines = [reply_line, f"{i}. {truncated_content}" if truncated_content else f"{i}."]
                            content_parts.append('\n'.join([l for l in lines if l]))

                    parts.append('\n\n'.join(content_parts))

                elif block_type == 'footer':
                    footer_config = caption_config.get('footer', {})
                    if footer_config.get('enabled'):
                        parts.append(self._replace_variables(footer_config.get('text', ''), caption_config, forum_posts[0]))

                elif block_type == 'hashtags':
                    hashtags_config = caption_config.get('hashtags', {})
                    if hashtags_config.get('enabled'):
                        tags = hashtags_config.get('tags', [])
                        hashtag_str = ' '.join([f'#{tag}' for tag in tags])
                        parts.append(hashtag_str)

            caption = '\n\n'.join(filter(None, parts))

            caption = self._truncate_caption(caption, self.MAX_CAPTION_LENGTH)

            logger.info(f"成功生成輪播 Caption，包含 {post_count} 篇貼文，總長度: {len(caption)}")
            return caption

        except Exception as e:
            logger.error(f"生成輪播 Caption 失敗: {e}", exc_info=True)
            raise

    def _format_reply_prefix(self, post, caption_config: Dict) -> str:
        """根據 caption_template.reply 設定決定回覆行的顯示。

        支援的設定（caption_template.reply，可選）：
          {
             "enabled": true,
             "label": "回覆貼文",
             "use_post_id_format": true,
             "template": "#{school_short_name}_{post_type}_{post_id}",
             "style": "hashtag"
          }
        若未提供，預設：啟用；label=回覆貼文；使用 post_id_format（若有啟用），否則顯示
        """
        try:
            reply_id = getattr(post, 'reply_to_post_id', None)
            if not reply_id:
                return ''

            cfg_root = (caption_config or {}).get('reply', {}) or {}
            cfg = cfg_root.get('caption') if isinstance(cfg_root, dict) and isinstance(cfg_root.get('caption'), dict) else cfg_root
            if isinstance(cfg, dict) and cfg.get('enabled', True) is False:
                return ''

            label = (cfg.get('label') if isinstance(cfg, dict) else '回覆貼文') or '回覆貼文'
            label = label.strip()

            class _P:
                pass
            p = _P()
            p.id = reply_id
            p.school = getattr(post, 'school', None)
            p.announcement_type = None

            formatted = None
            tpl = (cfg.get('template') if isinstance(cfg, dict) else None)
            style = (cfg.get('style') if isinstance(cfg, dict) else 'hashtag') or 'hashtag'

            if tpl:
                formatted = self._format_post_id(p, tpl, style)
            else:
                pid_cfg = (caption_config or {}).get('post_id_format', {}) or {}
                if pid_cfg.get('enabled'):
                    formatted = self._format_post_id(
                        p,
                        pid_cfg.get('template', '#{school_short_name}_{post_type}_{post_id}'),
                        pid_cfg.get('style', 'hashtag')
                    )
                else:
                    formatted = f"#{reply_id}" if style == 'hashtag' else str(reply_id)

            return f"{label} {formatted}".strip()
        except Exception:
            return ''

    def _format_post_id(self, post, template_str: str, style: str) -> str:
        """
        格式化 Post ID

        Args:
            post: 論壇貼文對象
            template_str: 模板字串，如 "#{school_short_name}_{post_type}_{post_id}"
            style: 格式樣式，'hashtag' 或 'plain'

        Returns:
            str: 格式化後的 Post ID
        """
        if hasattr(post, 'school') and post.school:
            school_short_name = getattr(post.school, 'slug', None) or getattr(post.school, 'name', 'FORUM')
            if len(school_short_name) > 10:
                school_short_name = school_short_name[:10]
        else:
            school_short_name = 'FORUM'

        if hasattr(post, 'announcement_type') and post.announcement_type:
            post_type = 'ANN'  # Announcement
        else:
            post_type = 'POST'

        formatted = template_str.replace('{school_short_name}', school_short_name)
        formatted = formatted.replace('{post_type}', post_type)
        formatted = formatted.replace('{post_id}', str(post.id))

        if style == 'hashtag' and not formatted.startswith('#'):
            formatted = f'#{formatted}'

        return formatted

    def _truncate_text(self, text: str, max_length: int, suffix: str = '...') -> str:
        """截斷文字"""
        if len(text) <= max_length:
            return text

        truncate_at = max_length - len(suffix)
        if truncate_at < 0:
            return suffix[:max_length]

        truncated = text[:truncate_at]
        last_space = truncated.rfind(' ')
        if last_space > 0:
            truncated = truncated[:last_space]

        return truncated + suffix

    def _truncate_caption(self, caption: str, max_length: int) -> str:
        """截斷 Caption 以符合長度限制"""
        if len(caption) <= max_length:
            return caption

        logger.warning(f"Caption 超過長度限制 ({len(caption)} > {max_length})，進行截斷")

        lines = caption.split('\n')

        hashtag_lines = []
        content_lines = []

        for line in reversed(lines):
            if line.strip().startswith('#'):
                hashtag_lines.insert(0, line)
            else:
                content_lines.insert(0, line)

        hashtags_text = '\n'.join(hashtag_lines)
        hashtags_length = len(hashtags_text)

        available_for_content = max_length - hashtags_length - 10  # 預留 10 字元給換行和 "..."

        if available_for_content < 100:
            available_for_content = max_length - 50
            hashtags_text = hashtags_text[:40] + '...'

        content_text = '\n'.join(content_lines)
        if len(content_text) > available_for_content:
            content_text = content_text[:available_for_content] + '...'

        final_caption = content_text + '\n\n' + hashtags_text
        return final_caption[:max_length]

    def estimate_caption_length(self, template, post_count: int = 1) -> Dict[str, int]:
        """
        估算 Caption 長度

        Args:
            template: IGTemplate 對象
            post_count: 貼文數量（輪播用）

        Returns:
            dict: 包含各部分長度的字典
        """
        caption_config = template.caption_template
        structure = caption_config.get('structure', [])

        lengths = {
            'header': 0,
            'divider': 0,
            'content': 0,
            'post_id': 0,
            'footer': 0,
            'hashtags': 0,
            'total': 0
        }

        for block_type in structure:
            if block_type == 'header':
                config = caption_config.get('header', {})
                if config.get('enabled'):
                    lengths['header'] = len(config.get('text', ''))

            elif block_type == 'divider':
                config = caption_config.get('divider', {})
                if config.get('enabled'):
                    lengths['divider'] = len(config.get('text', '')) * 2

            elif block_type == 'post_id':
                config = caption_config.get('post_id_format', {})
                if config.get('enabled'):
                    lengths['post_id'] = 30 * post_count

            elif block_type == 'footer':
                config = caption_config.get('footer', {})
                if config.get('enabled'):
                    lengths['footer'] = len(config.get('text', ''))

            elif block_type == 'hashtags':
                config = caption_config.get('hashtags', {})
                if config.get('enabled'):
                    tags = config.get('tags', [])
                    lengths['hashtags'] = sum(len(tag) + 2 for tag in tags)  # +2 for "# "

        fixed_total = sum(lengths[k] for k in ['header', 'divider', 'post_id', 'footer', 'hashtags'])

        lengths['content'] = self.MAX_CAPTION_LENGTH - fixed_total - 50  # 預留 50 字元
        lengths['total'] = self.MAX_CAPTION_LENGTH

        return lengths

    def _strip_markdown_and_html(self, text: str) -> str:
        """移除 Markdown 和 HTML 語法，保留純文字內容"""
        import re
        from html import unescape

        if not text:
            return text

        ESCAPED_ASTERISK_TOKEN = '[[ESCAPED_ASTERISK]]'
        text = re.sub(r'\\\*', ESCAPED_ASTERISK_TOKEN, text)

        text = re.sub(r'<[^>]+>', '', text)
        text = unescape(text)

        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        text = re.sub(r'__(.+?)__', r'\1', text)

        text = re.sub(r'\*(.+?)\*', r'\1', text)
        text = re.sub(r'_(.+?)_', r'\1', text)

        text = re.sub(r'~~(.+?)~~', r'\1', text)

        text = re.sub(r'`([^`]+)`', r'\1', text)

        text = re.sub(r'```[\s\S]*?```', '', text)

        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

        text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)

        text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)

        text = re.sub(r'^[-*]{3,}\s*$', '', text, flags=re.MULTILINE)

        text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)

        text = re.sub(r'\n{3,}', '\n\n', text)

        text = text.replace(ESCAPED_ASTERISK_TOKEN, '*')
        return text.strip()

    def _replace_variables(self, text: str, caption_config: Dict, post) -> str:
        """將文字中的時間變數替換為指定格式。

        支援的變數：
          {timestamp}, {date}, {time}, {datetime}, {year}, {month}, {day}, {hour}, {minute}, {second}
        來源時間：優先 post.created_at，其次使用現在時間。

        caption_config 可選結構：
          time_format: {
            "timezone": "Asia/Taipei" | "UTC" | ...,
            "date_format": "%Y-%m-%d",
            "time_format": "%H:%M:%S",
            "datetime_format": "%Y-%m-%d %H:%M:%S"
          }
        """
        if not text:
            return text

        fmt_cfg = caption_config.get('time_format', {}) or {}
        tz_name = fmt_cfg.get('timezone') or 'UTC'
        date_fmt = fmt_cfg.get('date_format') or '%Y-%m-%d'
        time_fmt = fmt_cfg.get('time_format') or '%H:%M:%S'
        dt_fmt = fmt_cfg.get('datetime_format') or '%Y-%m-%d %H:%M:%S'

        now = datetime.utcnow()
        base_dt = getattr(post, 'created_at', None) or now

        try:
            import pytz
            tz = pytz.timezone(tz_name)
            if base_dt.tzinfo is None:
                base_dt = tz.localize(base_dt) if tz else base_dt
            else:
                base_dt = base_dt.astimezone(tz)
        except Exception:
            pass

        mappings = {
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

        out = text
        for k, v in mappings.items():
            out = out.replace(k, v)
        return out
