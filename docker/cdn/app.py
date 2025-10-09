#!/usr/bin/env python3
"""
統一 CDN 服務 - 支援檔案上傳和靜態服務
"""
import os, json, mimetypes
from wsgiref.simple_server import make_server
import cgi

UPLOAD_ROOT = os.getenv("CDN_LOCAL_ROOT", "/data")
DEFAULT_SUBDIR = os.getenv("CDN_DEFAULT_SUBDIR", "social_media")
PUBLIC_BASE = (os.getenv("CDN_PUBLIC_BASE_URL") or os.getenv("PUBLIC_CDN_URL") or "").strip().rstrip('/')

def ensure_dir(path: str):
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass

def app(environ, start_response):
    path = environ.get('PATH_INFO', '/')
    method = environ.get('REQUEST_METHOD', 'GET').upper()

    # 上傳 API
    if path == '/upload' and method == 'POST':
        try:
            fs = cgi.FieldStorage(fp=environ['wsgi.input'], environ=environ, keep_blank_values=True)
            fileitem = fs['file'] if 'file' in fs else None

            # 安全檢查 fileitem 和 filename
            if fileitem is None:
                response = json.dumps({'success': False, 'error': '沒有選擇檔案'})
                start_response('400 Bad Request', [('Content-Type', 'application/json')])
                return [response.encode('utf-8')]

            filename_attr = getattr(fileitem, 'filename', '')
            if not filename_attr:
                response = json.dumps({'success': False, 'error': '沒有選擇檔案'})
                start_response('400 Bad Request', [('Content-Type', 'application/json')])
                return [response.encode('utf-8')]

            filename = os.path.basename(filename_attr)

            # 安全地獲取 subdir 參數
            subdir = DEFAULT_SUBDIR
            if 'subdir' in fs:
                try:
                    subdir_value = fs.getvalue('subdir')
                    if subdir_value and isinstance(subdir_value, (str, bytes)):
                        if isinstance(subdir_value, bytes):
                            subdir_value = subdir_value.decode('utf-8')
                        subdir = subdir_value.strip() or DEFAULT_SUBDIR
                except Exception:
                    subdir = DEFAULT_SUBDIR

            target_dir = os.path.join(UPLOAD_ROOT, subdir)
            ensure_dir(target_dir)
            target_path = os.path.join(target_dir, filename)

            with open(target_path, 'wb') as f:
                f.write(fileitem.file.read())

            # 建立公開 URL
            if PUBLIC_BASE:
                url = f"{PUBLIC_BASE}/{subdir}/{filename}"
            else:
                host = environ.get('HTTP_HOST', '')
                scheme = environ.get('wsgi.url_scheme', 'http')
                url = f"{scheme}://{host}/{subdir}/{filename}" if host else f"/{subdir}/{filename}"

            response = json.dumps({
                'success': True,
                'path': f"/{subdir}/{filename}",
                'url': url,
                'filename': filename
            })
            start_response('200 OK', [('Content-Type', 'application/json')])
            return [response.encode('utf-8')]

        except Exception as e:
            import traceback
            error_detail = f"{str(e)} | {traceback.format_exc()}"
            response = json.dumps({'success': False, 'error': error_detail})
            start_response('500 Internal Server Error', [('Content-Type', 'application/json')])
            return [response.encode('utf-8')]

    # 靜態檔案服務
    if method in ('GET', 'HEAD'):
        try:
            relative_path = path.lstrip('/')
            if not relative_path:
                # 根路徑返回簡單的狀態頁面
                html = '''<!DOCTYPE html>
<html><head><title>ForumKit CDN Service</title></head>
<body><h1>ForumKit CDN Service Running</h1>
<p>Upload: POST /upload</p>
<p>Access files: GET /&lt;path&gt;</p>
</body></html>'''
                start_response('200 OK', [('Content-Type', 'text/html')])
                return [html.encode('utf-8')]

            file_path = os.path.join(UPLOAD_ROOT, relative_path)

            # 安全檢查
            if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_ROOT)):
                start_response('403 Forbidden', [])
                return [b'Access denied']

            if os.path.isfile(file_path):
                mime_type, _ = mimetypes.guess_type(file_path)
                if not mime_type:
                    mime_type = 'application/octet-stream'

                with open(file_path, 'rb') as f:
                    content = f.read()

                headers = [
                    ('Content-Type', mime_type),
                    ('Content-Length', str(len(content))),
                    ('Cache-Control', 'public, max-age=86400'),
                    ('Access-Control-Allow-Origin', '*')
                ]
                start_response('200 OK', headers)
                return [content]
            else:
                start_response('404 Not Found', [])
                return [b'File not found']

        except Exception as e:
            start_response('500 Internal Server Error', [])
            return [f'Error: {str(e)}'.encode('utf-8')]

    # 其他請求返回 404
    start_response('404 Not Found', [])
    return [b'Not found']

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8080'))
    httpd = make_server('0.0.0.0', port, app)
    print(f"[CDN Service] listening on :{port}, upload root={UPLOAD_ROOT}")
    httpd.serve_forever()