import mimetypes, os

IMG_EXT = {".jpg",".jpeg",".png",".webp"}
VID_EXT = {".mp4",".webm"}
ALLOWED = IMG_EXT | VID_EXT

def guess_mime(path: str) -> str | None:
    return mimetypes.guess_type(path)[0]

def is_allowed(fname: str) -> bool:
    ext = os.path.splitext(fname.lower())[1]
    return ext in ALLOWED

def sniff_kind(head: bytes) -> str:
    """極簡內容嗅探：檢查常見圖片/影片檔頭，降低偽造風險。
    回傳 'jpeg'|'png'|'webp'|'mp4'|'webm'|'unknown'
    """
    if not head:
        return 'unknown'
    b = head[:64]
    # JPEG
    if len(b) >= 2 and b[0] == 0xFF and b[1] == 0xD8:
        return 'jpeg'
    # PNG
    if b.startswith(b"\x89PNG\r\n\x1a\n"):
        return 'png'
    # RIFF WEBP
    if b.startswith(b'RIFF') and b[8:12] == b'WEBP':
        return 'webp'
    # MP4 (ftyp box hints)
    if b[4:8] == b'ftyp':
        return 'mp4'
    # WebM (EBML)
    if b.startswith(b"\x1A\x45\xDF\xA3"):
        return 'webm'
    return 'unknown'
