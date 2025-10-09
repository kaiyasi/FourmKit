// src/utils/tickets.ts
export type Delivery = "discord" | "local_only" | string | undefined;

export async function parseJsonSafe(res: Response) {
  try { return await res.json(); } catch { return {}; }
}

export function extractTicket(res: Response, data: any) {
  return (
    res.headers.get("X-ForumKit-Ticket") ||
    data?.ticket_id ||
    res.headers.get("X-Request-ID") || ""
  );
}

export function statusUI(delivery: Delivery, ok: boolean) {
  if (ok && delivery === "discord") {
    return { tone: "success" as const, title: "已送出", desc: "已送達通知管道" };
  }
  if (ok) {
    return { tone: "warn" as const, title: "已暫存", desc: "尚未確認送達，請保留單號" };
  }
  return { tone: "error" as const, title: "送出失敗", desc: "請稍後重試或回報" };
}

export function pushRecentTicket(entry: { id: string; kind: string; ts?: number; note?: string }) {
  const key = "forumkit_recent_tickets";
  const now = Date.now();
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.unshift({ ...entry, ts: entry.ts ?? now });
  localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
}
