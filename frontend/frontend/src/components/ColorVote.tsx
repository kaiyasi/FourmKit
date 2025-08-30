// src/components/ColorVote.tsx
import { useState } from "react";
import { extractTicket, parseJsonSafe, pushRecentTicket, statusUI } from "../utils/tickets";
import { TicketNotice } from "./ui/TicketNotice";

export function ColorVote() {
  const [choice, setChoice] = useState("#3B82F6");
  const [ticket, setTicket] = useState("");
  const [tone, setTone] = useState<"success"|"warn"|"error">("success");
  const [title, setTitle] = useState("已送出");
  const [desc, setDesc] = useState("已送達通知管道");
  const [loading, setLoading] = useState(false);

  async function onVote() {
    setLoading(true);
    setTicket("");
    try {
      const res = await fetch("/api/color_vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      const data = await parseJsonSafe(res);
      const id = extractTicket(res, data);
      const ok = Boolean(data?.ok) && res.ok;
      const ui = statusUI(data?.delivery as any, ok);
      setTicket(id);
      setTone(ui.tone);
      setTitle(ui.title);
      setDesc(ui.desc);
      if (id) pushRecentTicket({ id, kind: "color" });
    } catch {
      setTicket("");
      setTone("error");
      setTitle("送出失敗");
      setDesc("請檢查網路後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input type="color" value={choice} onChange={e=>setChoice(e.target.value)} />
        <button onClick={onVote} disabled={loading}
                className="rounded-xl bg-blue-600 text-white px-4 py-2 disabled:opacity-50">
          {loading ? "送出中…" : "送出顏色"}
        </button>
      </div>
      <TicketNotice ticket={ticket} tone={tone} title={title} desc={desc} />
    </div>
  );
}
