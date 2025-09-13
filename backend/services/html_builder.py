"""
把模板設定 + 貼文內容 組成可由瀏覽器渲染的 HTML。
提供最小可用：背景色、內容文字區塊、時間戳、Logo 定位與字體 CSS。
"""
from __future__ import annotations
from typing import Dict, Optional
from datetime import datetime
import os


def _canvas_size(tmpl: Dict) -> tuple[int, int]:
    # 允許用環境變數強制畫布尺寸（預設 1080x1080，符合 IG 正方形）
    env_sz = os.getenv('IG_CANVAS_SIZE', '1080x1080').lower().strip()
    try:
        if 'x' in env_sz:
            w, h = env_sz.split('x', 1)
            return max(1, int(w)), max(1, int(h))
        val = int(env_sz)
        return val, val
    except Exception:
        pass

    # 後備：讀取模板資訊
    can = (tmpl or {}).get('canvas') or {}
    preset = str((can.get('preset') or '')).strip().lower()
    if preset == 'portrait':
        return 1080, 1350
    if preset == 'landscape':
        return 1080, 608
    if isinstance(can.get('width'), int) and isinstance(can.get('height'), int):
        return int(can['width']), int(can['height'])
    if preset == 'square':
        return 1080, 1080
    # 預設採用 1080x1080，避免從 800 放大造成排版誤差
    return 1080, 1080


def _bg_css(tmpl: Dict) -> str:
    bg = (tmpl or {}).get('background') or {}
    t = bg.get('type', 'color')
    if t == 'color':
        color = bg.get('color', '#FFFFFF')
        return f"background:{color};"
    # 先提供基本色，漸層/圖片可後續擴充
    return "background:#FFFFFF;"


def _font_links(tmpl: Dict) -> str:
    """收集各區塊需要的 Google Fonts CSS 連結（去重），至少提供 Noto Sans TC。
    支援 content_block、timestamp、title_block、post_id。
    亦相容舊欄位 font_url（若為 css2 連結）。
    若未提供 font_css_url，會依 family+weight 自動生成 css2 連結。
    """
    cb = (tmpl or {}).get('content_block') or {}
    ts = (tmpl or {}).get('timestamp') or {}
    tb = (tmpl or {}).get('title_block') or {}
    pid = (tmpl or {}).get('post_id') or {}
    urls = []
    for key in (cb.get('font_css_url'), ts.get('font_css_url'), tb.get('font_css_url'), pid.get('font_css_url')):
        if isinstance(key, str) and key.strip():
            urls.append(key.strip())
    # 兼容：若誤放到 font_url 且是 css2 連結，也納入
    for block in (cb, ts, tb, pid):
        fu = str(block.get('font_url') or '')
        if 'fonts.googleapis.com/css2' in fu:
            urls.append(fu)
    if not urls:
        urls = ["https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap"]
    # 去重
    seen, uniq = set(), []
    for u in urls:
        if u not in seen:
            uniq.append(u); seen.add(u)
    # 若沒有提供任何 URL，嘗試根據 family+weight 自動生成
    def auto_url(block: dict) -> str | None:
        fam = (block.get('font_family_name') or block.get('font_family') or '').strip()
        if not fam:
            return None
        weight = str(block.get('font_weight') or '400').strip()
        fam_p = fam.replace(' ', '+')
        return f"https://fonts.googleapis.com/css2?family={fam_p}:wght@{weight}&display=swap"

    for block in (cb, ts, tb, pid):
        if block:
            u = auto_url(block)
            if u and u not in seen:
                uniq.append(u)
                seen.add(u)

    # 生成 link 標籤
    links = [
        '<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">',
        '<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>'
    ]
    links += [f'<link href=\"{u}\" rel=\"stylesheet\">' for u in uniq]
    return "\n".join(links)


def _logo_html(tmpl: Dict, logo_url: Optional[str], W: int, H: int) -> str:
    lg = (tmpl or {}).get('logo') or {}
    if not (lg.get('enabled') and logo_url):
        return ''
    size = int(lg.get('size', 80) or 80)
    pos = lg.get('position') or {}
    # 支援至多小數三位的比例座標（0-1）
    try:
        x_r = float(pos.get('x', 0.9) or 0.9)
        y_r = float(pos.get('y', 0.1) or 0.1)
    except Exception:
        x_r, y_r = 0.9, 0.1
    x = x_r * W
    y = y_r * H
    shape = str(lg.get('shape', 'square') or 'square').lower()
    br = '50%' if shape == 'circle' else (f"{int(lg.get('border_radius', 10))}px" if shape == 'rounded' else '0')
    # 使用三位小數的像素，提供更精準的位置
    return (
        f"<img src=\"{logo_url}\" style=\"position:absolute;left:{x:.3f}px;top:{y:.3f}px;"
        f"width:{size}px;height:{size}px;object-fit:cover;border-radius:{br};\">"
    )


def _timestamp_html(tmpl: Dict, created_at, default_font_name: str) -> str:
    ts = (tmpl or {}).get('timestamp') or {}
    if not ts.get('enabled'):
        return ''
    try:
        if isinstance(created_at, str):
            created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        else:
            created = created_at or datetime.now()
    except Exception:
        created = datetime.now()
    fmt = ts.get('format', '%Y-%m-%d %H:%M')
    text = created.strftime(fmt)
    size = int(ts.get('font_size', 16) or 16)
    color = ts.get('color', '#666')
    font_name = ts.get('font_family_name') or ts.get('font_family') or default_font_name or 'Noto Sans TC'
    fw = ts.get('font_weight') or 400
    pos = ts.get('position') or {}
    x_r = float(pos.get('x', 0.1) or 0.1)
    y_r = float(pos.get('y', 0.9) or 0.9)
    # 用 transform 依比例定位
    return (
        f"<div style=\"position:absolute;left:{x_r*100:.2f}%;top:{y_r*100:.2f}%;"
        f"transform:translate(-0%,-50%);font-size:{size}px;color:{color};"
        f"font-family:'{font_name}','Noto Sans TC',sans-serif;font-weight:{fw};\">{text}</div>"
    )


def _content_html(tmpl: Dict, content: str, W: int, H: int, default_font_name: str) -> str:
    cb = (tmpl or {}).get('content_block') or {}
    if not cb.get('enabled', True):
        return ''
    size = int(cb.get('font_size', 32) or 32)
    color = cb.get('color', '#000')
    align = cb.get('align', 'left')
    font_name = cb.get('font_family_name') or cb.get('font_family') or default_font_name or 'Noto Sans TC'
    fw = cb.get('font_weight') or 400
    pos = cb.get('position') or {}
    x_r = float(pos.get('x', 0.1) or 0.1)
    y_r = float(pos.get('y', 0.1) or 0.1)
    w_r = float(pos.get('width', 0.8) or 0.8)
    h_r = float(pos.get('height', 0.8) or 0.8)
    left = W * x_r
    # 將內容塊的 Y 軸改為「行數中間」定位：以指定 y 為容器垂直中心
    top_center = H * y_r
    ww = W * w_r
    hh = H * h_r
    # 行數限制（若提供 max_lines，使用 -webkit-line-clamp 作為行數上限）
    max_lines = None
    try:
        ml = cb.get('max_lines')
        if isinstance(ml, int) and ml > 0:
            max_lines = ml
    except Exception:
        max_lines = None

    clamp_css = ""
    if max_lines:
        clamp_css = (
            f"display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:{int(max_lines)};"
        )

    # 基本 CSS：限制區塊寬高；若有行數上限則使用 line-clamp
    white_space = "normal" if max_lines else "pre-wrap"
    return (
        f"<div style=\"position:absolute;left:{left:.3f}px;top:{top_center:.3f}px;transform:translateY(-50%);"
        f"width:{ww:.3f}px;height:{hh:.3f}px;overflow:hidden;word-break:break-word;white-space:{white_space};"
        f"{clamp_css}"
        f"font-size:{size}px;line-height:1.5;color:{color};text-align:{align};"
        f"font-family:'{font_name}','Noto Sans TC',sans-serif;font-weight:{fw};\">{content}</div>"
    )

def _title_html(tmpl: Dict, title: str, W: int, H: int, default_font_name: str) -> str:
    tb = (tmpl or {}).get('title_block') or {}
    if not (tb.get('enabled', False) and title):
        return ''
    size = int(tb.get('font_size', 40) or 40)
    color = tb.get('color', '#000')
    align = tb.get('align', 'left')
    font_name = tb.get('font_family_name') or tb.get('font_family') or default_font_name or 'Noto Sans TC'
    fw = tb.get('font_weight') or 700
    pos = tb.get('position') or {}
    x_r = float(pos.get('x', 0.1) or 0.1)
    y_r = float(pos.get('y', 0.05) or 0.05)
    w_r = float(pos.get('width', 0.8) or 0.8)
    left = W * x_r
    top = H * y_r
    ww = W * w_r
    return (
        f"<div style=\"position:absolute;left:{left:.3f}px;top:{top:.3f}px;width:{ww:.3f}px;"
        f"word-break:break-word;white-space:pre-wrap;"
        f"font-size:{size}px;line-height:1.25;color:{color};text-align:{align};"
        f"font-family:'{font_name}','Noto Sans TC',sans-serif;font-weight:{fw};\">{title}</div>"
    )

def _post_id_html(tmpl: Dict, post_id, W: int, H: int, default_font_name: str) -> str:
    pb = (tmpl or {}).get('post_id') or {}
    if not pb.get('enabled', False):
        return ''
    size = int(pb.get('font_size', 14) or 14)
    color = pb.get('color', '#666')
    font_name = pb.get('font_family_name') or pb.get('font_family') or default_font_name or 'Noto Sans TC'
    fw = pb.get('font_weight') or 400
    prefix = pb.get('prefix', '#')
    pos = pb.get('position') or {}
    x_r = float(pos.get('x', 0.02) or 0.02)
    y_r = float(pos.get('y', 0.98) or 0.98)
    left = W * x_r
    top = H * y_r
    text = f"{prefix}{post_id}" if post_id is not None else f"{prefix}"
    return (
        f"<div style=\"position:absolute;left:{left:.3f}px;top:{top:.3f}px;"
        f"font-size:{size}px;color:{color};font-family:'{font_name}','Noto Sans TC',sans-serif;"
        f"font-weight:{fw};\">{text}</div>"
    )


def build_post_html(template_config: Dict, post_content: Dict, logo_url: Optional[str]) -> str:
    W, H = _canvas_size(template_config)
    bg = _bg_css(template_config)
    fonts = _font_links(template_config)
    # 主字體名：可由 content_block.font_family_name 指定，否則 Noto Sans TC
    cb = (template_config or {}).get('content_block') or {}
    main_font = cb.get('font_family_name') or 'Noto Sans TC'
    content_html = _content_html(template_config, post_content.get('content', '') or '', W, H, main_font)
    ts_html = _timestamp_html(template_config, post_content.get('created_at'), main_font)
    title_html = _title_html(template_config, post_content.get('title') or '', W, H, main_font)
    pid_html = _post_id_html(template_config, post_content.get('id'), W, H, main_font)
    logo_html = _logo_html(template_config, logo_url, W, H)

    # 基本畫布容器（確保固定尺寸）
    html = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset=\"utf-8\">{fonts}
<style>
  html,body{{margin:0;padding:0;}}
  body{{{bg}}}
  .wrap{{position:relative;width:{W}px;height:{H}px;box-sizing:border-box;}}
  body, .wrap{{font-family:'{main_font}', 'Noto Sans TC','PingFang TC','Heiti TC','Microsoft JhengHei',sans-serif;}}
</style>
</head>
<body>
  <div class=\"wrap\">
    {title_html}
    {content_html}
    {ts_html}
    {pid_html}
    {logo_html}
  </div>
</body>
</html>
"""
    return html
