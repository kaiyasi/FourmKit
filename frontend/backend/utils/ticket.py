from __future__ import annotations
from datetime import datetime, timezone
import uuid

def _base36(n: int) -> str:
    if n == 0:
        return "0"
    s = ""
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    while n:
        n, r = divmod(n, 36)
        s = alphabet[r] + s
    return s


def new_ticket_id(prefix: str = "FK") -> str:
    """Generate a short ticket id like FK-YYYYMMDD-AB12CD34."""
    now = datetime.now(timezone.utc)
    ymd = now.strftime("%Y%m%d")
    rnd = uuid.uuid4().int & ((1 << 40) - 1)  # 40 bits
    short = _base36(rnd).rjust(6, "0")[:8]
    return f"{prefix}-{ymd}-{short}"

