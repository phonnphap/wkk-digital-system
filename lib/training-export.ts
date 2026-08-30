import * as XLSX from 'xlsx';
import type { TrainingRecordWithUser, EvidenceFile } from './training-records';
import { TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS } from './training-records';
import { getTrainingApprovers } from './training-permissions';

const ONEDRIVE_ACCOUNT = 'hr@khienkhet.ac.th';

function fullName(r: TrainingRecordWithUser) {
  return r.full_name || `${r.title ?? ''} ${r.first_name ?? ''} ${r.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
}

export function exportTrainingToXlsx(records: TrainingRecordWithUser[], filename = 'training-report.xlsx') {
  const detailRows = records.map((r) => ({
    'ชื่อ-สกุล': fullName(r),
    'ตำแหน่ง': r.position ?? '',
    'สายชั้น': r.grade_level ?? '',
    'กลุ่มสาระ': r.department_name ?? '',
    'ชื่อหลักสูตร': r.course_name,
    'ประเภท': TRAINING_TYPE_LABELS[r.training_type] ?? r.training_type,
    'สถาบัน/วิทยากร': r.organizer ?? '',
    'วันที่เริ่ม': r.start_date,
    'วันที่สิ้นสุด': r.end_date,
    'ชั่วโมง': r.hours,
    'สถานะ': TRAINING_STATUS_LABELS[r.status] ?? r.status,
    'องค์ความรู้ที่ได้รับ': r.key_takeaways ?? '',
    'การนำไปใช้': r.action_plan ?? '',
  }));

  const byUser = new Map<string, { name: string; position: string; courses: number; hours: number }>();
  for (const r of records) {
    const entry = byUser.get(r.user_id) ?? { name: fullName(r), position: r.position ?? '', courses: 0, hours: 0 };
    entry.courses += 1;
    entry.hours += Number(r.hours);
    byUser.set(r.user_id, entry);
  }
  const summaryRows = Array.from(byUser.values())
    .sort((a, b) => b.hours - a.hours)
    .map((u) => ({
      'ชื่อ-สกุล': u.name,
      'ตำแหน่ง': u.position,
      'จำนวนคอร์ส': u.courses,
      'ชั่วโมงรวม': u.hours,
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'สรุปภาพรวม');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'ตารางประวัติการอบรม');
  XLSX.writeFile(wb, filename);
}

export interface IndividualReportUser {
  full_name: string;
  position?: string;
  grade_level?: string;
  department_name?: string;
  signature_url?: string;
}

function thaiDateFull(iso?: string) {
  if (!iso) return '—';
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function isImageFile(name: string) {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}
function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

// ✅ resolve ลิงก์ OneDrive สดใหม่จาก path (เผื่อ url ที่เก็บไว้ตอนอัปโหลดหมดอายุ)
async function resolveEvidenceUrl(path?: string | null, fallbackUrl?: string | null): Promise<string | null> {
  if (!path) return fallbackUrl ?? null;
  try {
    const res = await fetch('/api/resolve-onedrive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, account: ONEDRIVE_ACCOUNT }),
    });
    const json = await res.json();
    if (json.ok && json.downloadUrl) return json.downloadUrl as string;
    console.warn('[training-export] resolve-onedrive ไม่สำเร็จ:', path, json);
  } catch (err) {
    console.warn('[training-export] resolve-onedrive error:', path, err);
  }
  return fallbackUrl ?? null;
}

// ── PDF.js loader (โหลดจาก CDN ฝั่ง browser เท่านั้น ไม่ต้องแก้ backend) ──
let pdfjsLoadPromise: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = () => reject(new Error('โหลด pdf.js ไม่สำเร็จ'));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
}

// ✅ render หน้าแรกของ PDF เป็นรูปภาพจริง (data URL) เพื่อใช้แสดง/พิมพ์เหมือนรูปถ่ายทั่วไป
async function renderPdfFirstPageToDataUrl(pdfUrl: string): Promise<string | null> {
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
    console.warn('[training-export] แปลง PDF เป็นรูปไม่สำเร็จ:', pdfUrl, err);
    return null;
  }
}

interface ResolvedEvidence {
  name: string;
  thumbnailUrl?: string; // มีค่า = แสดงเป็นรูป, ไม่มีค่า = แสดงเป็นการ์ดไอคอนไฟล์
  isPdf: boolean;
}

async function resolveEvidenceFiles(files: EvidenceFile[]): Promise<ResolvedEvidence[]> {
  const out: ResolvedEvidence[] = [];
  for (const f of files) {
    const url = await resolveEvidenceUrl(f.path, f.url);
    if (!url) { out.push({ name: f.name, isPdf: isPdfFile(f.name) }); continue; } // resolve ไม่สำเร็จเลย -> แสดงการ์ดไอคอนพร้อมชื่อไฟล์
    if (isPdfFile(f.name)) {
      const thumb = await renderPdfFirstPageToDataUrl(url);
      out.push({ name: f.name, thumbnailUrl: thumb ?? undefined, isPdf: true });
    } else if (isImageFile(f.name)) {
      out.push({ name: f.name, thumbnailUrl: url, isPdf: false });
    } else {
      out.push({ name: f.name, isPdf: false }); // ไฟล์ประเภทอื่น (docx ฯลฯ) ยังคงเป็นการ์ดไอคอน
    }
  }
  return out;
}

type RecordWithResolvedEvidence = TrainingRecordWithUser & { resolvedEvidence: ResolvedEvidence[] };

function buildIndividualReportHTML(
  user: IndividualReportUser,
  records: RecordWithResolvedEvidence[],
  targetHoursPerYear: number,
  deputy: { name: string; signature_url?: string } | null,
  director: { name: string; signature_url?: string } | null
): string {
  const totalHours = records.reduce((s, r) => s + Number(r.hours), 0);
  const totalCourses = records.length;
  const pct = targetHoursPerYear > 0 ? Math.min((totalHours / targetHoursPerYear) * 100, 100) : 0;

  const byType: Record<string, number> = {};
  for (const r of records) byType[r.training_type] = (byType[r.training_type] ?? 0) + Number(r.hours);
  const typeRows = Object.entries(byType)
    .map(([type, hours]) => `<tr><td style="padding:5px 8px;border:1px solid #cbd5e1">${TRAINING_TYPE_LABELS[type as keyof typeof TRAINING_TYPE_LABELS] ?? type}</td><td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center">${hours}</td></tr>`)
    .join('');

  const tableRows = records.map((r, i) => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center">${i + 1}</td>
        <td style="padding:5px 8px;border:1px solid #cbd5e1">${thaiDateFull(r.start_date)} – ${thaiDateFull(r.end_date)}</td>
        <td style="padding:5px 8px;border:1px solid #cbd5e1">${r.course_name}</td>
        <td style="padding:5px 8px;border:1px solid #cbd5e1">${r.organizer ?? '—'}</td>
        <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center">${r.hours}</td>
        <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center">${TRAINING_STATUS_LABELS[r.status]}</td>
        <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:center">${(r.evidence_files ?? []).length || '—'}</td>
      </tr>`).join('');

  const takeawayBlocks = records
    .filter((r) => r.key_takeaways || r.action_plan)
    .map((r) => `
      <div style="margin-bottom:10px;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px">
        <p style="font-weight:700;margin-bottom:4px">${r.course_name}</p>
        ${r.key_takeaways ? `<p style="margin:2px 0"><b>องค์ความรู้ที่ได้รับ:</b> ${r.key_takeaways}</p>` : ''}
        ${r.action_plan ? `<p style="margin:2px 0"><b>การนำไปประยุกต์ใช้:</b> ${r.action_plan}</p>` : ''}
      </div>`).join('');

  const evidenceBlocks = records
  .filter((r) => r.resolvedEvidence.length > 0)
  .map((r) => `
    <div style="margin-bottom:16px;page-break-inside:avoid">
      <p style="font-weight:700;margin-bottom:6px">${r.course_name}</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${r.resolvedEvidence.map((f) => (
          f.thumbnailUrl
            ? `<div style="text-align:center">
                 <img src="${f.thumbnailUrl}" style="width:150px;height:150px;object-fit:${f.isPdf ? 'contain' : 'cover'};background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px"
                   onerror="this.outerHTML='<div style=\\'width:150px;height:150px;display:flex;align-items:center;justify-content:center;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;font-size:9pt;color:#b91c1c;text-align:center;padding:8px\\'>⚠️ โหลดรูปไม่สำเร็จ</div>'"/>
                 <div style="font-size:9pt;color:#64748b;max-width:150px;word-break:break-all;margin-top:2px">${f.isPdf ? '📄 ' : ''}${f.name}</div>
               </div>`
            : `<div style="border:1px solid #cbd5e1;border-radius:6px;padding:16px 14px;font-size:10pt;text-align:center;width:150px">
                 📄<br/>${f.name}
               </div>`
        )).join('')}
      </div>
    </div>`).join('');

  const sigBox = (name: string, role: string, signatureUrl?: string) => `
    <div style="text-align:center;flex:1">
      ${signatureUrl ? `<img src="${signatureUrl}" style="max-height:55px;max-width:150px;object-fit:contain;margin:0 auto;display:block"/>` : `<div style="height:55px"></div>`}
      <div style="border-bottom:1px solid #000;width:170px;margin:0 auto"></div>
      <div style="font-size:13pt;margin-top:4px">(${name})</div>
      <div style="font-size:11pt;color:#475569">${role}</div>
    </div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 20mm; }
  body { font-family:'TH Sarabun New','TH SarabunPSK',sans-serif; font-size:16pt; color:#111; line-height:1.5; }
  h1 { text-align:center; font-size:22pt; margin-bottom:4px; }
  h2 { text-align:center; font-size:16pt; margin:0 0 18px; color:#475569; }
  .section-title { font-weight:900; font-size:17pt; color:#1e3a8a; margin:22px 0 10px; border-bottom:2px solid #1e3a8a; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; font-size:15pt; }
  th { background:#1e3a8a; color:#fff; padding:6px 8px; border:1px solid #1e3a8a; }
  .kpi-cards { display:flex; gap:16px; margin:10px 0; }
  .kpi-card { flex:1; border:2px solid #1e3a8a; border-radius:10px; padding:14px; text-align:center; }
  .kpi-value { font-size:28pt; font-weight:900; color:#1e3a8a; }
  .kpi-label { font-size:13pt; color:#475569; }
  .progress-bar { height:14px; background:#e2e8f0; border-radius:7px; overflow:hidden; margin-top:6px; }
  .progress-fill { height:100%; background:#f97316; }
  .sign-section { display:flex; justify-content:space-between; margin-top:40px; gap:20px; }
  @media print { button{display:none} }
</style></head>
<body>
  <div style="text-align:center;margin-bottom:6px">
    <img src="/school-logo.png" style="height:60px" onerror="this.style.display='none'" />
  </div>
  <h1>รายงานสรุปประวัติการฝึกอบรมรายบุคคล</h1>
  <h2>โรงเรียนวัดเขียนเขต</h2>

  <div class="section-title">ส่วนที่ 1 — ข้อมูลบุคลากร</div>
  <table style="border:none">
    <tr><td style="border:none;width:15%"><b>ชื่อ-สกุล</b></td><td style="border:none">${user.full_name}</td></tr>
    <tr><td style="border:none"><b>ตำแหน่ง</b></td><td style="border:none">${user.position ?? '—'}</td></tr>
    <tr><td style="border:none"><b>สายชั้น</b></td><td style="border:none">${user.grade_level ?? '—'}</td></tr>
    <tr><td style="border:none"><b>กลุ่มสาระ</b></td><td style="border:none">${user.department_name ?? '—'}</td></tr>
  </table>

  <div class="section-title">ส่วนที่ 2 — สรุปภาพรวม</div>
  <div class="kpi-cards">
    <div class="kpi-card"><div class="kpi-value">${totalHours}</div><div class="kpi-label">ชั่วโมงรวมสะสม</div></div>
    <div class="kpi-card"><div class="kpi-value">${totalCourses}</div><div class="kpi-label">จำนวนคอร์ส</div></div>
    <div class="kpi-card"><div class="kpi-value">${targetHoursPerYear}</div><div class="kpi-label">เป้าหมายต่อปี (ชม.)</div></div>
  </div>
  <p style="font-size:13pt;color:#475569">ความคืบหน้าเทียบเป้าหมายประจำปี: ${pct.toFixed(0)}%</p>
  <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>

  <table style="margin-top:14px;max-width:60%">
    <tr><th>ประเภทการอบรม</th><th>ชั่วโมง</th></tr>
    ${typeRows}
  </table>

  <div class="section-title">ส่วนที่ 3 — ตารางประวัติการอบรม</div>
  <table>
    <tr><th>ที่</th><th>วันที่</th><th>ชื่อหลักสูตร</th><th>สถาบัน/วิทยากร</th><th>ชั่วโมง</th><th>สถานะ</th><th>ไฟล์แนบ</th></tr>
    ${tableRows}
  </table>

  <div class="section-title">ส่วนที่ 4 — สรุปความรู้และการนำไปใช้</div>
  ${takeawayBlocks || '<p style="color:#94a3b8">ไม่มีข้อมูล</p>'}

  <div class="section-title">ส่วนที่ 5 — เอกสาร/หลักฐานแนบ</div>
  ${evidenceBlocks || '<p style="color:#94a3b8">ไม่มีเอกสารแนบ</p>'}

  <div class="section-title">ส่วนที่ 6 — ช่องเซ็นชื่ออนุมัติ</div>
  <div class="sign-section">
    ${sigBox(user.full_name, 'ผู้อบรม', user.signature_url)}
    ${sigBox(deputy?.name || '..............................', 'รองฝ่ายบุคคล', deputy?.signature_url)}
    ${sigBox(director?.name || '..............................', 'ผู้อำนวยการโรงเรียน', director?.signature_url)}
  </div>
  <script>window.onload=()=>window.print()<\/script>
</body></html>`;
}

// ✅ พิมพ์รายงาน — ดึงชื่อ+ลายเซ็นผู้อนุมัติอัตโนมัติ + resolve ไฟล์แนบ (รูป/PDF) เป็นรูปจริงก่อนพิมพ์
export async function printIndividualReport(
  user: IndividualReportUser,
  records: TrainingRecordWithUser[],
  targetHoursPerYear: number
) {
  const [{ deputy, director }, resolvedRecords] = await Promise.all([
    getTrainingApprovers(),
    Promise.all(records.map(async (r) => ({
      ...r,
      resolvedEvidence: await resolveEvidenceFiles(r.evidence_files ?? []),
    }))),
  ]);

  const html = buildIndividualReportHTML(user, resolvedRecords, targetHoursPerYear, deputy, director);
  const w = window.open('', '_blank', 'width=900,height=780');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}