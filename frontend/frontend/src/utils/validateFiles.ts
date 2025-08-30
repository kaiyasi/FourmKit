export type FileKind = "image" | "video";
const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"];
const VIDEO_EXT = [".mp4", ".webm"];

export function guessKindByName(name: string): FileKind | null {
  const n = name.toLowerCase();
  if (IMAGE_EXT.some(e => n.endsWith(e))) return "image";
  if (VIDEO_EXT.some(e => n.endsWith(e))) return "video";
  return null;
}

export function validateBeforeAdd(
  files: File[],
  existingCount: number,
  maxCount = 6,
  maxImageMB = 8,
  maxVideoMB = 50
): { ok: File[]; errors: string[] } {
  const errs: string[] = [];
  const oks: File[] = [];

  if (existingCount + files.length > maxCount) {
    errs.push(`最多只能上傳 ${maxCount} 個附件`);
    return { ok: [], errors: errs };
  }

  for (const f of files) {
    const kind = guessKindByName(f.name);
    if (!kind) { errs.push(`不支援的副檔名：${f.name}`); continue; }
    const sizeMB = f.size / (1024 * 1024);
    if (kind === "image" && sizeMB > maxImageMB) { errs.push(`圖片過大（>${maxImageMB}MB）：${f.name}`); continue; }
    if (kind === "video" && sizeMB > maxVideoMB) { errs.push(`影片過大（>${maxVideoMB}MB）：${f.name}`); continue; }
    oks.push(f);
  }
  return { ok: oks, errors: errs };
}
