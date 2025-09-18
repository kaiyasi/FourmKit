import React, { useCallback, useRef, useState } from "react";
import { validateBeforeAdd, guessKindByName } from "../utils/validateFiles";

type Props = { value: File[]; onChange: (files: File[]) => void; maxCount?: number; };

export default function UploadArea({ value, onChange, maxCount = 4 }: Props) {
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
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition bg-transparent border-border
          ${dragOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-sm text-muted">拖曳或點擊上傳（JPG/PNG/WebP）</p>
        <p className="text-xs text-muted mt-1">最多 {maxCount} 張，單檔 ≤ 8MB</p>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={onPick}/>
      </div>

      {errors.length > 0 && (
        <ul className="text-red-400 text-sm list-disc list-inside">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {value.map((f, idx) => {
            const kind = guessKindByName(f.name);
            const url = URL.createObjectURL(f);
            return (
              <div key={idx} className="relative group border border-border rounded-xl p-2 bg-transparent">
                <button type="button" onClick={() => removeAt(idx)}
                        className="absolute top-1 right-1 bg-surface/90 border border-border text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100">
                  刪除
                </button>
                <img src={url} alt={f.name} className="w-full h-32 object-cover rounded-lg" />
                <div className="mt-1 text-xs text-muted truncate">{f.name}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
