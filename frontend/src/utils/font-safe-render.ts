// src/utils/font-safe-render.ts
// 在瀏覽器端用 html2canvas 把 DOM 轉成 JPEG，並保證中英文字體（Noto Sans TC / Huninn 等）正確載入

type FontSpec = {
  family: string;                 // 例如 "Noto Sans TC"、"Huninn"
  weights?: (string | number)[];  // 例如 [300,400,500,700]；預設 [400]
  href?: string;                   // Google Fonts / 其他 @font-face 來源
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/** 動態插入 <link rel="stylesheet"> */
function ensureStylesheet(href: string, idHint?: string) {
  if (!href) return;
  const id = idHint || `dyn-font-${btoa(href).replace(/=/g, "")}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** 載入字體（支援多組 family/weights） */
export async function loadFonts(fonts: FontSpec[]) {
  for (const f of fonts) {
    if (f.href) ensureStylesheet(f.href);
    const weights = f.weights && f.weights.length ? f.weights : ["400"];
    for (const w of weights) {
      try {
        // @ts-ignore
        await (document as any).fonts.load(`${w} 24px "${f.family}"`);
      } catch (err) {
        console.warn("字體載入失敗", f.family, w, err);
      }
    }
  }
  try {
    // @ts-ignore
    await Promise.race([(document as any).fonts.ready, sleep(3000)]);
  } catch {}
}

/** 把指定節點渲染成 1080x1080 JPEG Blob（可覆寫） */
export async function renderNodeToImage(
  src: HTMLElement,
  opts?: { background?: string; width?: number; height?: number }
): Promise<Blob> {
  // 1. 確保 html2canvas 存在
  // @ts-ignore
  const html2canvas = (window as any).html2canvas || (await new Promise<any>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.onload = () => resolve((window as any).html2canvas);
    s.onerror = () => reject(new Error("載入 html2canvas 失敗"));
    document.body.appendChild(s);
  }));

  // 2. 建立離屏舞台（預設 1080x1080，可由 opts 覆寫）
  const W = opts?.width ?? 1080;
  const H = opts?.height ?? 1080;
  const stage = document.createElement("div");
  stage.id = "ig-stage";
  stage.style.position = "fixed";
  stage.style.left = "-99999px";
  stage.style.top = "-99999px";
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  stage.style.background = opts?.background || "#fff";
  // 不再以 !important 強制覆寫字體，避免蓋掉模板設定的 font-family
  // 預設讓模板/內嵌樣式決定字體；上層請先以 loadFonts 載入所需字體
  stage.style.fontFamily = 'inherit';
  stage.innerHTML = src.innerHTML;
  document.body.appendChild(stage);

  // 3. 等待兩幀 reflow
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

  // 4. 呼叫 html2canvas
  const canvas = await html2canvas(stage, {
    backgroundColor: opts?.background || "#fff",
    width: W,
    height: H,
    scale: 1,
    useCORS: true,
    foreignObjectRendering: false
  });

  try { stage.remove(); } catch {}

  // 5. 轉換成 Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error("轉圖失敗"))),
      "image/jpeg",
      0.92
    );
  });
}
