#!/usr/bin/env python3
import os, sys, io, re, hashlib, html
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server
from wsgiref.util import request_uri
import cgi

PASSWORD = os.getenv("CDN_ADMIN_PASSWORD", "Serelix")
TOKEN = hashlib.sha256(PASSWORD.encode()).hexdigest()

UPLOAD_ROOT = os.getenv("CDN_LOCAL_ROOT", "/data")
DEFAULT_SUBDIR = os.getenv("CDN_DEFAULT_SUBDIR", "social_media")
PUBLIC_BASE = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip('/')

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _ok(start_response, body:str, *, status='200 OK', headers: list[tuple[str,str]]|None=None, no_body: bool=False):
    data = body.encode('utf-8') if not no_body else b''
    resp = [('Content-Type','text/html; charset=utf-8'), ('Content-Length', str(len(data)))]
    if headers:
        resp = headers + resp
    start_response(status, resp)
    return [data]

def _redirect(start_response, location: str, *, headers: list[tuple[str,str]]|None=None):
    resp = [('Location', location)]
    if headers:
        resp = headers + resp
    start_response('302 Found', resp)
    return [b'']

def _is_authed(environ) -> bool:
    cookie = environ.get('HTTP_COOKIE','')
    for part in cookie.split(';'):
        k, _, v = part.strip().partition('=')
        if k == 'cdn_auth' and v == TOKEN:
            return True
    return False

def _html_page(content: str, *, title="CDN Admin") -> str:
    return f"""
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans TC', Arial, sans-serif; margin: 2rem; }}
    .card {{ max-width: 680px; margin:auto; padding: 1.25rem; border: 1px solid #ddd; border-radius: 12px; }}
    h1 {{ font-size: 1.25rem; margin: 0 0 1rem; }}
    input[type=password], input[type=text], input[type=file] {{ width: 100%; padding: .6rem; border: 1px solid #ccc; border-radius: 8px; }}
    button {{ padding: .6rem 1rem; border: none; background: #111827; color: #fff; border-radius: 8px; cursor: pointer; }}
    .row {{ display: flex; gap: .75rem; align-items: center; }}
    .muted {{ color: #666; font-size: .9rem; }}
    .ok {{ color: #16a34a; }} .err {{ color: #b91c1c; }}
    .mt1 {{ margin-top: 1rem; }} .mt2 {{ margin-top: 2rem; }}
    code {{ background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }}
  </style>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';" />
</head>
<body>
  <div class="card">
    {content}
  </div>
</body>
</html>
"""

def view_login(environ, start_response, *, msg=None):
    content = """
    <h1>CDN 登入</h1>
    <form action="/admin/login" method="post">
      <label>密碼</label>
      <input type="password" name="password" placeholder="請輸入密碼" required />
      <div class="mt1"><button type="submit">登入</button></div>
      <div class="muted mt1">預設密碼：Serelix（勿外流）</div>
    </form>
    """
    if msg:
        content = f"<p class='err'>{html.escape(msg)}</p>" + content
    return _ok(start_response, _html_page(content, title="CDN 登入"))

def view_admin(environ, start_response, *, uploaded_url=None, error=None):
    note = ""
    if uploaded_url:
        note = f"<p class='ok'>上傳成功！公開連結：<br><code>{html.escape(uploaded_url)}</code></p>"
    if error:
        note = f"<p class='err'>上傳失敗：{html.escape(error)}</p>"
    content = f"""
      <h1>CDN 上傳工具</h1>
      {note}
      <form action="/admin/upload" method="post" enctype="multipart/form-data">
        <label>選擇檔案</label>
        <input type="file" name="file" required />
        <div class="mt1">
          <label>子資料夾（選填，預設 {html.escape(DEFAULT_SUBDIR)}）</label>
          <input type="text" name="subdir" placeholder="例如：social_media" />
        </div>
        <div class="mt1 row">
          <button type="submit">上傳並建立公開連結</button>
          <a class="muted" href="/admin/logout">登出</a>
        </div>
        <div class="muted mt1">上傳後會存到 {html.escape(UPLOAD_ROOT)}/&lt;subdir&gt;/ ，Nginx 會用 cdn 根目錄對外服務。</div>
      </form>
    """
    return _ok(start_response, _html_page(content, title="CDN 上傳工具"))

def ensure_dir(path: str):
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass

def app(environ, start_response):
    path = environ.get('PATH_INFO','/')
    method = environ.get('REQUEST_METHOD','GET').upper()
    # Treat HEAD like GET but without body
    head_mode = False
    if method == 'HEAD':
        head_mode = True
        method = 'GET'

    # Normalize
    if path == '/':
        return _redirect(start_response, '/admin/')

    # Login page
    if path == '/admin/' and method == 'GET':
        if _is_authed(environ):
            return view_admin(environ, start_response) if not head_mode else _ok(start_response, '', no_body=True)
        return view_login(environ, start_response) if not head_mode else _ok(start_response, '', no_body=True)

    # Handle login
    if path == '/admin/login' and method == 'POST':
        fs = cgi.FieldStorage(fp=environ['wsgi.input'], environ=environ, keep_blank_values=True)
        pw = fs.getfirst('password','')
        if pw == PASSWORD:
            headers = [('Set-Cookie', f'cdn_auth={TOKEN}; Path=/; HttpOnly; SameSite=Lax')]
            return _redirect(start_response, '/admin/', headers=headers)
        return view_login(environ, start_response, msg='密碼不正確')

    # Logout
    if path == '/admin/logout':
        headers = [('Set-Cookie', 'cdn_auth=deleted; Path=/; Max-Age=0')]
        return _redirect(start_response, '/admin/', headers=headers)

    # Upload file
    if path == '/admin/upload' and method == 'POST':
        if not _is_authed(environ):
            return _redirect(start_response, '/admin/')
        try:
            fs = cgi.FieldStorage(fp=environ['wsgi.input'], environ=environ, keep_blank_values=True)
            fileitem = fs['file'] if 'file' in fs else None
            if not fileitem or not getattr(fileitem, 'filename', ''):
                return view_admin(environ, start_response, error='沒有選擇檔案')
            raw_name = os.path.basename(fileitem.filename)
            safe_name = SAFE_NAME.sub('_', raw_name)
            subdir_in = fs.getfirst('subdir','').strip() or DEFAULT_SUBDIR
            subdir = SAFE_NAME.sub('_', subdir_in)
            target_dir = os.path.join(UPLOAD_ROOT, subdir)
            ensure_dir(target_dir)
            target_path = os.path.join(target_dir, safe_name)
            with open(target_path, 'wb') as f:
                f.write(fileitem.file.read())

            # Build public URL
            if PUBLIC_BASE:
                base = PUBLIC_BASE
            else:
                host = environ.get('HTTP_X_FORWARDED_HOST') or environ.get('HTTP_HOST') or ''
                scheme = environ.get('HTTP_X_FORWARDED_PROTO') or environ.get('wsgi.url_scheme','http')
                base = f"{scheme}://{host}" if host else ''
            url = f"{base}/{subdir}/{safe_name}" if base else f"/{subdir}/{safe_name}"
            return view_admin(environ, start_response, uploaded_url=url)
        except Exception as e:
            return view_admin(environ, start_response, error=str(e))

    # Default: redirect to /admin/
    return _redirect(start_response, '/admin/')


if __name__ == '__main__':
    port = int(os.getenv('PORT','8080'))
    httpd = make_server('0.0.0.0', port, app)
    print(f"[cdn-uploader] listening on :{port}, upload root={UPLOAD_ROOT}")
    httpd.serve_forever()
