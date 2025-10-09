"""
CDN 靜態檔案服務
處理預覽檔案、靜態資源等
"""

from flask import Blueprint, send_file, jsonify, abort, Response
from flask_jwt_extended import jwt_required
from pathlib import Path
import os
import mimetypes

bp = Blueprint("cdn", __name__, url_prefix="/cdn")
# 為了與既有連結（/uploads/...）相容，提供同樣功能的無前綴版本
public_bp = Blueprint("public_uploads", __name__, url_prefix="/uploads")

# CDN 根目錄
CDN_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "cdn-data")




def _serve_upload_file(filepath: str):
    """獲取上傳檔案（包括模板圖片等）"""
    try:
        # 安全檢查：防止路徑遍歷攻擊
        if ".." in filepath or filepath.startswith('/'):
            abort(404)
        
        # 構建檔案路徑
        upload_root = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "uploads")
        file_path = os.path.join(upload_root, filepath)
        
        # 檢查檔案是否存在
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            abort(404)
        
        # 檢查檔案是否在 uploads 目錄內
        try:
            file_path = os.path.abspath(file_path)
            upload_root = os.path.abspath(upload_root)
            if not file_path.startswith(upload_root):
                abort(404)
        except Exception:
            abort(404)
        
        # 獲取 MIME 類型
        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        # 發送檔案（附帶 CORS 與快取）
        resp = send_file(
            file_path,
            mimetype=mime_type,
            as_attachment=False
        )
        try:
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        except Exception:
            pass
        return resp
        
    except Exception as e:
        print(f"Error serving upload file {filepath}: {e}")
        abort(404)


@bp.get("")
@bp.get("/")
def cdn_home() -> Response:
    """簡易 CDN 首頁：避免 404，並提供最小上傳介面（沿用 JWT）。
    建議在 Nginx 將 cdn.serelix.xyz 的 / 反代到此路由。
    """
    html = (
        "<!doctype html><html lang='zh-TW'><head>"
        "<meta charset='utf-8'/>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'/>"
        "<title>Serelix CDN</title>"
        "<style>"
        ":root{--bg:#0b0c0e;--fg:#e9e9ea;--muted:#9aa0a6;--card:#111318;--border:#20242c;--primary:#6ea8fe;}"
        "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans TC','Apple Color Emoji','Segoe UI Emoji'}"
        ".wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}"
        ".card{width:min(960px,92vw);background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px 20px 16px;box-shadow:0 10px 30px rgba(0,0,0,.25)}"
        ".row{display:flex;gap:16px;flex-wrap:wrap} .grow{flex:1 1 320px} .muted{color:var(--muted)} .btn{padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:#151922;color:var(--fg);cursor:pointer}"
        ".btn-primary{background:var(--primary);color:#0a0a0a;border-color:transparent} input,select{width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:#0f1217;color:var(--fg)}"
        ".drop{border:2px dashed var(--border);border-radius:16px;padding:28px;text-align:center} .small{font-size:12px} .mt{margin-top:12px} .mb{margin-bottom:12px} .right{display:flex;justify-content:flex-end}"
        ".link{color:var(--primary);text-decoration:none} code{background:#0b0e13;padding:2px 6px;border-radius:8px}"
        "</style></head><body><div class='wrap'><div class='card'>"
        "<h2 style='margin:4px 0 8px'>Serelix CDN</h2>"
        "<p class='muted' style='margin:0 0 12px'>上傳公共資產，立即取得可公開的 CDN 連結。此頁免登入、匿名可用。</p>"
        "<div class='row'>"
        "<div class='grow'>"
        "  <div class='drop' id='drop'>"
        "    <div>拖曳或點擊選擇檔案（圖片/影片/文件）</div>"
        "    <div class='small muted mt'>圖片 ≤ 10MB、影片 ≤ 100MB、文件 ≤ 5MB</div>"
        "    <input id='file' type='file' style='display:none'/>"
        "  </div>"
        "  <div class='mt'>"
        "    <label class='small muted'>類別</label>"
        "    <select id='category'>"
        "      <option value='logos'>logos（一般 Logo）</option>"
        "      <option value='schools'>schools（學校 Logo）</option>"
        "      <option value='media'>media（一般媒體）</option>"
        "      <option value='social_media'>social_media（社群素材）</option>"
        "    </select>"
        "  </div>"
        "  <div class='row mt'>"
        "    <div class='grow'><label class='small muted'>識別名稱（可選）</label><input id='identifier' placeholder='例如: brand_xx 或 asset_20250920'/></div>"
        "    <div style='align-self:flex-end'><button class='btn' id='pick'>選擇檔案</button></div>"
        "  </div>"
        "  <div class='right mt'><button class='btn btn-primary' id='upload'>上傳</button></div>"
        "  <div id='msg' class='small muted mt'></div>"
        "  <div id='out' class='mt'></div>"
        "</div>"
        "<div class='grow'>"
        "  <div class='mb'><strong>快速說明</strong></div>"
        "  <ol class='small' style='line-height:1.6'>"
        "    <li>按「選擇檔案」挑檔 → 點「上傳」。完成後會顯示 CDN 連結，可直接複製使用。</li>"
        "    <li>若你的 CDN 以反代主站 /uploads，連結形如：<code>/uploads/public/...</code>；若設置了 PUBLIC_CDN_URL，則會是完整 CDN URL。</li>"
        "  </ol>"
        "</div>"
        "</div>"
        "</div></div><script>\n(function(){\n  const $ = (id)=>document.getElementById(id);\n  const drop = $('drop'); const file = $('file'); const pick=$('pick'); const up=$('upload');\n  const msg=$('msg'); const out=$('out'); const cat=$('category'); const idf=$('identifier');\n  let chosen=null; function log(t){ msg.textContent=t }\n  drop.addEventListener('click',()=>file.click());\n  pick.addEventListener('click',()=>file.click());\n  drop.addEventListener('dragover',e=>{e.preventDefault(); drop.style.background='#0d1117'});\n  drop.addEventListener('dragleave',e=>{e.preventDefault(); drop.style.background='transparent'});\n  drop.addEventListener('drop',e=>{e.preventDefault(); drop.style.background='transparent'; const f=e.dataTransfer.files[0]; if(f){ chosen=f; log('已選擇: '+f.name) }});\n  file.addEventListener('change',e=>{ chosen=e.target.files[0]; if(chosen){ log('已選擇: '+chosen.name) }});\n  up.addEventListener('click', async ()=>{\n    try{ if(!chosen){ log('請先選擇檔案'); return }\n      log('上傳中...');\n      // 計算簡單 hash（僅示意）\n      const hash = (Date.now().toString(36)+Math.random().toString(36).slice(2,8));\n      const fd = new FormData(); fd.set('file', chosen); fd.set('name', chosen.name); fd.set('hash', hash); fd.set('chunks','1'); fd.set('chunk','0'); fd.set('category', cat.value); fd.set('identifier', (idf.value||'').trim()||('asset_'+Date.now()));\n      const r = await fetch('/api/media/upload', { method:'POST', body: fd });\n      const j = await r.json().catch(()=>({})); if(!r.ok || !j.ok){ log('上傳失敗: '+(j.error||r.status)); return }\n      log('上傳成功'); const url = j.url || (j.path ? ('/uploads/'+j.path) : '');\n      if(url){ out.innerHTML = `<div class='small'>CDN 連結：</div><div><a class='link' href='${url}' target='_blank'>${url}</a></div>` }\n    }catch(e){ log('上傳失敗: '+e.message) }\n  });\n})();\n</script></body></html>"
    )
    return Response(html, mimetype="text/html; charset=utf-8")


@bp.get("/uploads/<path:filepath>")
def get_upload_file_cdn(filepath: str):
    return _serve_upload_file(filepath)


@public_bp.get("/<path:filepath>")
def get_upload_file_public(filepath: str):
    return _serve_upload_file(filepath)






