import React, { useState } from "react";
import UploadArea from "./UploadArea";
import { postFormData, HttpError } from "../lib/http";
import { validatePost } from "../schemas/post";

export default function PostComposer({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    
    if (!title.trim()) { 
      setMsg("請輸入標題"); 
      return; 
    }
    
    setSubmitting(true);
    
    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("content", content.trim());
      files.forEach(f => fd.append("files", f));
      
      const result = await postFormData("/api/posts/with-media", fd);
      
      // 驗證返回的資料
      const validatedPost = validatePost(result);
      
      setMsg("已送出，等待審核");
      setTitle(""); 
      setContent(""); 
      setFiles([]);
      console.log("created:", validatedPost);
    } catch (e) {
      if (e instanceof HttpError) {
        setMsg(`送出失敗：${e.message}`);
      } else if (e instanceof Error) {
        setMsg(`送出失敗：${e.message}`);
      } else {
        setMsg("送出失敗：未知錯誤");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl mx-auto">
      <input className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-white"
             placeholder="標題" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}/>
      <textarea className="w-full min-h-[140px] rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-white"
                placeholder="內容（可留空）" value={content} onChange={(e) => setContent(e.target.value)}/>
      <UploadArea value={files} onChange={setFiles} maxCount={6} />
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-400">{files.length} 個附件</div>
        <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-60">
          {submitting ? "送出中…" : "發佈"}
        </button>
      </div>
      {msg && <div className="text-sm text-amber-300">{msg}</div>}
    </form>
  );
}
