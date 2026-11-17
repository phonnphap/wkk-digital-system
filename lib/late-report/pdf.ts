import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ReportRow, Variant, thaiDate, toThaiDigits } from "./rows";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://system.khienkhet.ac.th").replace(/\/$/, "");

/** โหลดไฟล์จาก public/<rel> — ลองอ่านจากดิสก์ก่อน ถ้าไม่มี (เช่นบน Vercel) ดึงจาก URL ของเว็บเอง */
async function loadPublicFile(rel: string): Promise<Buffer> {
  try { return await readFile(path.join(process.cwd(), "public", rel)); } catch { /* ลองวิธีถัดไป */ }
  try {
    const res = await fetch(`${SITE_URL}/${rel}`);
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && !ct.includes("text/html")) return Buffer.from(await res.arrayBuffer());
  } catch { /* ตกไปข้อความ error ด้านล่าง */ }
  throw new Error(`ไม่พบไฟล์ public/${rel} — ตรวจว่าวางไฟล์ไว้ที่ public/${rel} และ push ขึ้นแล้ว (ชื่อไฟล์ต้องตรงทุกตัวอักษร ไม่มีเว้นวรรค)`);
}

export const SCHOOL = "โรงเรียนวัดเขียนเขต";
export const DEPT = "กลุ่มบริหารทั่วไป";

export type StepData = {
  label: string; name: string; position: string; status: string;
  comment: string | null; actedAt: string | null; signature: Uint8Array | null;
};
export type MemoData = {
  reportDate: string; rows: ReportRow[]; total: number;
  reporter: { name: string; signature: Uint8Array | null };
  steps: StepData[];
};

const W = 595.28, H = 841.89, M = 56, BOTTOM = 44;
const seg = new Intl.Segmenter("th", { granularity: "word" });

function wrap(t: string, f: PDFFont, size: number, maxW: number) {
  const lines: string[] = [];
  let cur = "";
  for (const { segment } of seg.segment(t)) {
    if (cur && f.widthOfTextAtSize((cur + segment).trimEnd(), size) > maxW) {
      lines.push(cur.trimEnd());
      cur = segment.trimStart();
    } else cur += segment;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

export async function renderMemo(d: MemoData, variant: Variant): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // ใช้คู่ THSarabun.ttf + THSarabun-Bold.ttf ก่อน (ชุดที่มีอยู่ใน public/fonts) ถ้าไม่มีค่อยลองชื่อ THSarabunNew
  const loadFirst = async (rels: string[]) => {
    let last: any;
    for (const r of rels) { try { return await loadPublicFile(r); } catch (e) { last = e; } }
    throw last;
  };
  const font = await pdf.embedFont(await loadFirst(["fonts/THSarabun.ttf", "fonts/THSarabunNew.ttf"]), { subset: true });
  const bold = await pdf.embedFont(await loadFirst(["fonts/THSarabun-Bold.ttf", "fonts/THSarabunNew-Bold.ttf"]), { subset: true });

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - 44;
  const ink = rgb(0, 0, 0);
  const text = (t: string, x: number, size = 16, f = font) => page.drawText(t, { x, y, size, font: f, color: ink });
  const centerAt = (t: string, cx: number, size = 16, f = font) =>
    text(t, cx - f.widthOfTextAtSize(t, size) / 2, size, f);
  const ensure = (h: number) => { if (y - h < BOTTOM) { page = pdf.addPage([W, H]); y = H - 48; } };
  const dotted = (x1: number, x2: number, yy = y - 2) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: ink, dashArray: [1, 2] });

  async function img(bytes: Uint8Array | null) {
    if (!bytes) return null;
    try { return await pdf.embedPng(bytes); } catch { try { return await pdf.embedJpg(bytes); } catch { return null; } }
  }
  async function drawSignature(bytes: Uint8Array | null, cx: number, baseY: number) {
    const im = await img(bytes);
    if (!im) return;
    const s = Math.min(110 / im.width, 34 / im.height);
    page.drawImage(im, { x: cx - (im.width * s) / 2, y: baseY, width: im.width * s, height: im.height * s });
  }

  // ── หัวบันทึกข้อความ ── ตราครุฑมุมซ้ายบน (ไฟล์ public/images.jpg — เปลี่ยนได้ด้วย env GARUDA_FILE เช่น images/krut.png)
  try {
    const candidates = [process.env.GARUDA_FILE, "images.jpg", "images/images.jpg"].filter(Boolean) as string[];
    let buf: Buffer | null = null; let file = "";
    for (const f of candidates) { try { buf = await loadPublicFile(f); file = f; break; } catch { /* ลองไฟล์ถัดไป */ } }
    if (buf) {
      const g = /\.png$/i.test(file) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
      const gw = 56;
      page.drawImage(g, { x: M, y: y - 52, width: gw, height: gw * (g.height / g.width) });
    }
  } catch { /* ไม่พบตราครุฑก็ข้าม */ }
  y -= 30;
  centerAt("บันทึกข้อความ", W / 2, 28, bold);
  y -= 34;

  const dateStr = toThaiDigits(thaiDate(d.reportDate));
  text("ส่วนราชการ", M, 16, bold); text(`${DEPT} ${SCHOOL}`, M + 66); dotted(M + 66, W - M); y -= 20;
  text("ที่", M, 16, bold); dotted(M + 16, 280);
  text("วันที่", 300, 16, bold); text(dateStr, 330); dotted(330, W - M); y -= 20;
  text("เรื่อง", M, 16, bold); text("รายงานการติดตามนักเรียนมาสาย", M + 32); dotted(M + 32, W - M); y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: ink });
  y -= 18;
  text("เรียน", M, 16, bold); text(`ผู้อำนวยการ${SCHOOL}`, M + 32); y -= 22;

  const body =
    `ตามที่${SCHOOL}ได้กำหนดให้มีการติดตามการมาเรียนของนักเรียนให้ตรงตามเวลา เพื่อสร้างความมีระเบียบ วินัย ` +
    `ให้เกิดในตัวนักเรียน บัดนี้ ข้าพเจ้าได้ดำเนินการบันทึกนักเรียนที่มาสายประจำวันที่ ${dateStr} ` +
    `เรียบร้อยแล้ว รายละเอียดดังนี้`;
  wrap(body, font, 16, W - 2 * M - 40).forEach((ln, i) => { text(ln, M + (i === 0 ? 40 : 0)); y -= 17; });
  y -= 6;

  // ── ตาราง ── ฟอนต์ 16 / เส้นบางสีเทาอ่อน / ช่องสูงพอดีตัวอักษร
  const cols = [40, 213, 95, W - 2 * M - 348]; // ที่ | สายชั้น | จำนวน/คน | หมายเหตุ
  const RH = 21, TS = 16;
  const lineCol = rgb(0.62, 0.62, 0.62);
  const drawRow = (cells: string[], f: PDFFont) => {
    ensure(RH + 4);
    let x = M;
    cells.forEach((c, i) => {
      page.drawRectangle({ x, y: y - 6, width: cols[i], height: RH, borderColor: lineCol, borderWidth: 0.5 });
      if (i === 1) page.drawText(c, { x: x + 7, y, size: TS, font: f, color: ink });
      else page.drawText(c, { x: x + cols[i] / 2 - f.widthOfTextAtSize(c, TS) / 2, y, size: TS, font: f, color: ink });
      x += cols[i];
    });
    y -= RH;
  };
  drawRow(["ที่", "สายชั้น", "จำนวน/คน", "หมายเหตุ"], bold);
  d.rows.forEach((r, i) =>
    drawRow([toThaiDigits(i + 1), toThaiDigits(r.label), r.count ? toThaiDigits(r.count) : "-", ""], font)
  );
  drawRow(["", "รวม", toThaiDigits(d.total), ""], bold);

  // ── ลงชื่อ: เว้นที่ด้านบนให้ลายเซนไม่ทับตัวอักษร (ลายเซนวางบนเส้นประ สูงไม่เกิน 34) ──
  const SIG_GAP = 44;                 // ระยะจากบรรทัดบนถึงบรรทัด "ลงชื่อ"
  const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
  const weekday = WEEKDAYS[new Date(`${d.reportDate}T00:00:00Z`).getUTCDay()];
  const cx = 400;

  y -= 14;
  ensure(SIG_GAP + 70);
  y -= SIG_GAP;
  text("ลงชื่อ", cx - 70); await drawSignature(d.reporter.signature, cx + 5, y - 1); dotted(cx - 40, cx + 70);
  y -= 19; centerAt(`( ${d.reporter.name} )`, cx + 15); y -= 18;
  centerAt(`ครูเวรจับสายประจำวัน${weekday}`, cx + 15); y -= 30;

  // ── ความเห็นผู้บังคับบัญชา — ทุกตำแหน่งมีความเห็น "ทราบ" ──
  for (const s2 of d.steps) {
    ensure(SIG_GAP + 100);
    const approved = variant === "signed" && s2.status === "approved";
    text(s2.label, M, 16, bold);
    const top = y;
    // ความเห็น (ซ้าย)
    const comment = (approved && s2.comment?.trim()) || "ทราบ";
    let ly = top - 20;
    wrap(comment, font, 16, 250).slice(0, 3).forEach((ln) => { page.drawText(ln, { x: M + 10, y: ly, size: 16, font, color: ink }); ly -= 18; });
    dotted(M + 10, 290, ly + 14);
    // ลงชื่อ (ขวา) เว้นที่ด้านบนให้ลายเซน
    const sx = 400;
    y = top - SIG_GAP;
    text("ลงชื่อ", sx - 70);
    if (approved) await drawSignature(s2.signature, sx + 5, y - 1);
    dotted(sx - 40, sx + 70);
    y -= 19; centerAt(`( ${s2.name} )`, sx + 15, 16);
    y -= 17; centerAt(`ตำแหน่ง ${s2.position}`, sx + 15, 15);
    if (approved && s2.actedAt) { y -= 16; centerAt(toThaiDigits(thaiDate(s2.actedAt.slice(0, 10))), sx + 15, 14); }
    y = Math.min(y, ly) - 22;
  }

  return pdf.save();
}