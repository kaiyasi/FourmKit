// src/components/TicketNotice.tsx
import { useState } from "react";

export function TicketNotice({ ticket, tone, title, desc }:{
  ticket: string;
  tone: "success"|"warn"|"error";
  title: string;
  desc: string;
}) {
  if (!ticket) return null;
  const [copied, setCopied] = useState(false);
  const base =
    tone === "success" ? "bg-success-bg text-success-text border-success-border"
    : tone === "warn" ? "bg-warning-bg text-warning-text border-warning-border"
    : "bg-danger-bg text-danger-text border-danger-border";
  return (
    <div className={`mt-3 rounded-xl border px-4 py-3 ${base}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm opacity-90">{desc}</div>
          <div className="mt-1 text-sm">
            <span className="opacity-70">處理單號：</span>
            <code className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">{ticket}</code>
          </div>
          <div className="mt-1 text-xs opacity-70">
            請保留此單號以便後續查詢或接收通知。
          </div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(ticket); setCopied(true); setTimeout(()=>setCopied(false), 1200); }}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="複製單號"
        >
          {copied ? "已複製" : "複製"}
        </button>
      </div>
    </div>
  );
}
