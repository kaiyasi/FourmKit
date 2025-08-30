from __future__ import annotations
import os, smtplib, ssl
from email.message import EmailMessage

from typing import Any

def send_mail(
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
) -> dict[str, Any]:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT") or "587")
    user = os.getenv("SMTP_USER")
    pwd  = os.getenv("SMTP_PASSWORD")
    from_addr = os.getenv("SMTP_FROM") or user or "no-reply@forumkit.local"

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    # 沒有 SMTP 設定就做「dry-run」：只回傳內容供除錯
    if not host or not user or not pwd:
        return {"ok": True, "delivery": "dry-run", "to": to, "subject": subject}

    context = ssl.create_default_context()
    with smtplib.SMTP(host, port) as s:
        s.starttls(context=context)
        s.login(user, pwd)
        s.send_message(msg)
    return {"ok": True, "delivery": "smtp", "to": to}
