import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ReportRow, Variant, thaiDate, toThaiDigits } from "./rows";

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
  const dir = path.join(process.cwd(), "public", "fonts");
  const font = await pdf.embedFont(await readFile(path.join(dir, "THSarabunNew.ttf")), { subset: true });
  const bold = await pdf.embedFont(await readFile(path.join(dir, "THSarabunNew-Bold.ttf")), { subset: true });

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

  // ── หัวบันทึกข้อความ ──
  try {
    const imgDir = path.join(process.cwd(), "public", "images");
    const file = process.env.GARUDA_FILE ??
      (await readdir(imgDir)).find((f) => /garuda|krut|ครุฑ/i.test(f) && /\.(jpe?g|png)$/i.test(f));
    if (file) {
      const buf = await readFile(path.join(imgDir, file));
      const g = /\.png$/i.test(file) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
      page.drawImage(g, { x: M, y: y - 44, width: 46, height: 46 * (g.height / g.width) });
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

  // ── ตาราง ──
  const cols = [38, 215, 90, W - 2 * M - 343]; // ที่ | สายชั้น | จำนวน/คน | หมายเหตุ
  const RH = 14.5;
  const drawRow = (cells: string[], f: PDFFont, size = 15) => {
    ensure(RH + 4);
    let x = M;
    cells.forEach((c, i) => {
      page.drawRectangle({ x, y: y - 4, width: cols[i], height: RH, borderColor: ink, borderWidth: 0.7 });
      if (i === 1) page.drawText(c, { x: x + 6, y, size, font: f, color: ink });
      else page.drawText(c, { x: x + cols[i] / 2 - f.widthOfTextAtSize(c, size) / 2, y, size, font: f, color: ink });
      x += cols[i];
    });
    y -= RH;
  };
  drawRow(["ที่", "สายชั้น", "จำนวน/คน", "หมายเหตุ"], bold);
  d.rows.forEach((r, i) =>
    drawRow([toThaiDigits(i + 1), toThaiDigits(r.label), r.count ? toThaiDigits(r.count) : "-", ""], font)
  );
  drawRow(["", "รวม", toThaiDigits(d.total), ""], bold);
  y -= 16;

  // ── ลายเซนครูผู้รายงาน (มีทั้ง 2 แบบ) ──
  ensure(100);
  const cx = 400;
  text("ลงชื่อ", cx - 70); await drawSignature(d.reporter.signature, cx + 5, y - 4); dotted(cx - 40, cx + 70);
  y -= 18; centerAt(`( ${d.reporter.name} )`, cx + 15); y -= 17;
  centerAt("ครูเวรรับสายประจำวัน", cx + 15); y -= 24;

  // ── ความเห็นผู้บังคับบัญชา ──
  for (const s of d.steps) {
    ensure(78);
    const approved = variant === "signed" && s.status === "approved";
    text(s.label, M, 16, bold);
    let ly = y - 17;
    const comment = approved ? s.comment?.trim() : "";
    if (comment) {
      wrap(comment, font, 15, 250).slice(0, 3).forEach((ln) => { page.drawText(ln, { x: M + 8, y: ly, size: 15, font, color: ink }); ly -= 15; });
    } else {
      for (let k = 0; k < 2; k++) { dotted(M + 8, 290, ly - 2); ly -= 17; }
    }
    // ฝั่งขวา: ลงชื่อ / (ชื่อ) / ตำแหน่ง
    const sx = 400;
    text("ลงชื่อ", sx - 70);
    if (approved) await drawSignature(s.signature, sx + 5, y - 6);
    dotted(sx - 40, sx + 70);
    y -= 18; centerAt(`( ${s.name} )`, sx + 15, 15);
    y -= 15; centerAt(`ตำแหน่ง ${s.position}`, sx + 15, 14);
    if (approved && s.actedAt) { y -= 14; centerAt(toThaiDigits(thaiDate(s.actedAt.slice(0, 10))), sx + 15, 13); }
    y = Math.min(y, ly) - 10;
  }

  return pdf.save();
}