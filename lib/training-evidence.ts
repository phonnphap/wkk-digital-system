'use client';

const ONEDRIVE_ACCOUNT = 'hr@khienkhet.ac.th';

export function isImageFile(name: string) {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}
export function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

// ✅ resolve ลิงก์ OneDrive สดใหม่จาก path (เผื่อ url ที่เก็บไว้ตอนอัปโหลดหมดอายุ)
export async function resolveEvidenceUrl(path?: string | null, fallbackUrl?: string | null): Promise<string | null> {
  if (!path) return fallbackUrl ?? null;
  try {
    const res = await fetch('/api/resolve-onedrive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, account: ONEDRIVE_ACCOUNT }),
    });
    const json = await res.json();
    if (json.ok && json.downloadUrl) return json.downloadUrl as string;
    console.warn('[training-evidence] resolve-onedrive ไม่สำเร็จ:', path, json);
  } catch (err) {
    console.warn('[training-evidence] resolve-onedrive error:', path, err);
  }
  return fallbackUrl ?? null;
}

// ── pdf.js loader — โหลดจาก /public/pdfjs/ (same-origin) กัน CSP บล็อกตอนเปิดในหน้าต่างพิมพ์ ──
let pdfjsLoadPromise: Promise<any> | null = null;
export function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/pdfjs/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = () => reject(new Error('โหลด pdf.js (local) ไม่สำเร็จ'));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
}

export async function renderPdfFirstPageToDataUrl(pdfUrl: string): Promise<string | null> {
  try {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.3 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.warn('[training-evidence] แปลง PDF เป็นรูปไม่สำเร็จ:', pdfUrl, err);
    return null;
  }
}

export interface ResolvedEvidence {
  name: string;
  originalUrl: string; // ลิงก์เปิดไฟล์จริง — ใช้กดดูเต็ม/ดาวน์โหลด
  thumbnailUrl?: string; // มีค่า = แสดงรูปได้ (รูปภาพ หรือ preview หน้าแรกของ PDF)
  isPdf: boolean;
}

// ✅ ใช้ร่วมกันทั้งตอนพิมพ์รายงาน (training-export.ts) และตอนเปิดดูรายละเอียด (TrainingRecordDetailModal)
export async function resolveEvidenceFiles(
  files: { url: string; path?: string; name: string }[]
): Promise<ResolvedEvidence[]> {
  const out: ResolvedEvidence[] = [];
  for (const f of files) {
    const url = await resolveEvidenceUrl(f.path, f.url);
    const effectiveUrl = url ?? f.url;
    if (!url) { out.push({ name: f.name, originalUrl: effectiveUrl, isPdf: isPdfFile(f.name) }); continue; }
    if (isPdfFile(f.name)) {
      const thumb = await renderPdfFirstPageToDataUrl(url);
      out.push({ name: f.name, originalUrl: url, thumbnailUrl: thumb ?? undefined, isPdf: true });
    } else if (isImageFile(f.name)) {
      out.push({ name: f.name, originalUrl: url, thumbnailUrl: url, isPdf: false });
    } else {
      out.push({ name: f.name, originalUrl: url, isPdf: false });
    }
  }
  return out;
}