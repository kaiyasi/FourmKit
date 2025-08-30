import React, { useCallback, useRef, useState } from "react";
import { validateBeforeAdd, guessKindByName } from "../utils/validateFiles";

type Props = { value: File[]; onChange: (files: File[]) => void; maxCount?: number; };

export default function UploadArea({ value, onChange, maxCount = 6 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((files: File[]) => {
    const { ok, errors } = validateBeforeAdd(files, value.length, maxCount);
    setErrors(errors);
    if (ok.length) onChange([...value, ...ok]);
  }, [value, onChange, maxCount]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  };

  const removeAt = (idx: number) => {
    const next = value.slice(); next.splice(idx, 1); onChange(next);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition
          ${dragOver ? "border-blue-500 bg-blue-50/10" : "border-neutral-600"}`}
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-sm text-neutral-300">拖放檔案到此，或點擊選擇（JPG/PNG/WebP/MP4/WebM）</p>
        <p className="text-xs text-neutral-400 mt-1">最多 {maxCount} 個，圖片 ≤ 8MB，影片 ≤ 50MB</p>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.webm" multiple className="hidden" onChange={onPick}/>
      </div>

      {errors.length > 0 && (
        <ul className="text-red-400 text-sm list-disc list-inside">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {value.map((f, idx) => {
            const kind = guessKindByName(f.name);
            const url = URL.createObjectURL(f);
            return (
              <div key={idx} className="relative group border border-neutral-700 rounded-xl p-2">
                <button type="button" onClick={() => removeAt(idx)}
                        className="absolute top-1 right-1 bg-neutral-900/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100">
                  刪除
                </button>
                {kind === "image"
                  ? <img src={url} alt={f.name} className="w-full h-32 object-cover rounded-lg" />
                  : <video src={url} className="w-full h-32 rounded-lg" controls preload="metadata" />}
                <div className="mt-1 text-xs text-neutral-400 truncate">{f.name}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
