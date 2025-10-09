export type FileKind = "image";
const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"];

export function guessKindByName(name: string): FileKind | null {
  const n = name.toLowerCase();
  if (IMAGE_EXT.some(e => n.endsWith(e))) return "image";
  return null;
}

export function validateBeforeAdd(
  files: File[],
  existingCount: number,
  maxCount = 4,
  maxImageMB = 8
): { ok: File[]; errors: string[] } {
  const errs: string[] = [];
  const oks: File[] = [];

  if (existingCount + files.length > maxCount) {
    errs.push(`最多只能上傳 ${maxCount} 張圖片`);
    return { ok: [], errors: errs };
  }

  for (const f of files) {
    const kind = guessKindByName(f.name);
    if (!kind) { errs.push(`只支援圖片格式（JPG/PNG/WebP）：${f.name}`); continue; }
    const sizeMB = f.size / (1024 * 1024);
    if (kind === "image" && sizeMB > maxImageMB) { errs.push(`圖片過大（>${maxImageMB}MB）：${f.name}`); continue; }
    oks.push(f);
  }
  return { ok: oks, errors: errs };
}
