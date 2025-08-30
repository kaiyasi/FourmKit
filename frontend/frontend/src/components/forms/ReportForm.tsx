// src/components/ReportForm.tsx
import { useState } from "react";
import { extractTicket, parseJsonSafe, pushRecentTicket, statusUI } from "../../utils/tickets";
import { TicketNotice } from "../ui/TicketNotice";

export default function ReportForm() {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [category, setCategory] = useState("一般回報");
  const [ticket, setTicket] = useState("");
  const [tone, setTone] = useState<"success"|"warn"|"error">("success");
  const [title, setTitle] = useState("已送出");
  const [desc, setDesc] = useState("已送達通知管道");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTicket("");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, contact, category }),
      });
      const data = await parseJsonSafe(res);
      const id = extractTicket(res, data);
      const ok = Boolean(data?.ok) && res.ok;
      const ui = statusUI(data?.delivery as any, ok);
      setTicket(id);
      setTone(ui.tone);
      setTitle(ui.title);
      setDesc(ui.desc);
      if (id) pushRecentTicket({ id, kind: "report", note: category });
      if (ok) setMessage(""); // contact 不清空避免重填
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
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-2">
        <label className="text-sm opacity-80">分類</label>
        <select value={category} onChange={e=>setCategory(e.target.value)}
                className="form-control">
          <option>一般回報</option>
          <option>UI 問題</option>
          <option>功能錯誤</option>
          <option>建議改善</option>
        </select>
      </div>
      <div className="grid gap-2">
        <label className="text-sm opacity-80">內容</label>
        <textarea value={message} onChange={e=>setMessage(e.target.value)}
                  rows={4} className="form-control"
                  placeholder="請描述問題細節（至少 5 個字）" />
      </div>
      <div className="grid gap-2">
        <label className="text-sm opacity-80">聯絡方式（選填）</label>
        <input value={contact} onChange={e=>setContact(e.target.value)}
               className="form-control"
               placeholder="Email / Discord ID" />
      </div>
      <button disabled={loading}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 disabled:opacity-50">
        {loading ? "送出中…" : "送出回報"}
      </button>
      <TicketNotice ticket={ticket} tone={tone} title={title} desc={desc} />
    </form>
  );
}
