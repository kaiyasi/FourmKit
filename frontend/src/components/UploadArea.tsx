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
    <div className="space-y-4">
      {/* 改進的上傳區域 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/30 dark:to-gray-900/30
          ${dragOver ? "ring-2 ring-blue-500/40 bg-blue-50 dark:bg-blue-950/20 border-blue-400" : "border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"}`}
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-3">
          {/* 上傳圖標 */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            dragOver ? 'bg-blue-500/20' : 'bg-slate-500/10'
          }`}>
            <svg className={`w-6 h-6 transition-colors ${
              dragOver ? 'text-blue-600' : 'text-slate-500'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div className="space-y-1">
            <p className={`text-sm font-medium transition-colors ${
              dragOver ? 'text-blue-700 dark:text-blue-300' : 'text-fg'
            }`}>
              {dragOver ? '放開來上傳' : '點擊或拖放上傳圖片'}
            </p>
            <p className="text-xs text-muted">支援 JPG、PNG、WebP 格式</p>
            <p className="text-xs text-muted">最多 {maxCount} 張，單檔不超過 8MB</p>
          </div>
        </div>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={onPick}/>
      </div>

      {/* 錯誤提示 */}
      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">上傳失敗</p>
              <ul className="text-sm text-red-700 dark:text-red-300 mt-1 space-y-1">
                {errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 已上傳的文件預覽 */}
      {value.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-fg">已選擇的檔案 ({value.length}/{maxCount})</h4>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-muted hover:text-red-600 transition-colors"
              >
                全部清除
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {value.map((f, idx) => {
              const kind = guessKindByName(f.name);
              const url = URL.createObjectURL(f);
              const sizeKB = Math.round(f.size / 1024);
              const sizeText = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB`;

              return (
                <div key={idx} className="relative group border border-border rounded-xl overflow-hidden bg-surface shadow-sm hover:shadow-md transition-shadow">
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="absolute top-2 right-2 w-6 h-6 bg-red-500/90 hover:bg-red-600 text-white text-xs rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    ×
                  </button>

                  <div className="aspect-square">
                    <img src={url} alt={f.name} className="w-full h-full object-cover" />
                  </div>

                  <div className="p-2 bg-surface/95">
                    <div className="text-xs font-medium text-fg truncate" title={f.name}>
                      {f.name}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {sizeText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
