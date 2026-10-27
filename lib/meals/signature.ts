// lib/meals/signature.ts — ฝั่ง client: ภาพลายมือชื่อ → PNG พื้นหลังโปร่งใส (ตัดขอบอัตโนมัติ)

export async function toTransparentPng(blob: Blob, maxW = 700): Promise<string> {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("อ่านไฟล์รูปไม่ได้"));
    i.src = url;
  });
  URL.revokeObjectURL(url);

  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const lumOf = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  // หาระดับความสว่างของ "กระดาษ" (เปอร์เซ็นไทล์ที่ 90) เพื่อรองรับรูปถ่ายที่แสงไม่เท่ากัน
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    hist[Math.min(255, Math.round(lumOf(i)))]++; n++;
  }
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) { paper = v; break; } }
  const hi = Math.max(120, paper - 12);
  const lo = Math.max(20, hi - 80);

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0, i = 0; i < d.length; i += 4, p++) {
    let a = Math.min(1, Math.max(0, (hi - lumOf(i)) / (hi - lo))) * (d[i + 3] / 255);
    if (a < 0.04) a = 0;
    d[i] = Math.round(d[i] * a); d[i + 1] = Math.round(d[i + 1] * a); d[i + 2] = Math.round(d[i + 2] * a);
    d[i + 3] = Math.round(a * 255);
    if (a > 0.15) {
      const x = p % w, y = (p / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("ไม่พบลายมือชื่อในภาพ ลองถ่ายให้เส้นเข้มและชัดขึ้น");
  ctx.putImageData(id, 0, 0);

  const pad = 6;
  const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
  const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2), sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);
  const out = document.createElement("canvas");
  out.width = sw; out.height = sh;
  out.getContext("2d")!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL("image/png");
}