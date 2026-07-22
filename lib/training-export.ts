import * as XLSX from 'xlsx';
import type { TrainingRecordWithUser } from './training-records';
import { TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS } from './training-records';

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
}

function thaiDateFull(iso?: string) {
  if (!iso) return '—';
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function buildIndividualReportHTML(
  user: IndividualReportUser,
  records: TrainingRecordWithUser[],
  targetHoursPerYear: number,
  approverName = '',
  hrName = ''
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
      </tr>`).join('');

  const takeawayBlocks = records
    .filter((r) => r.key_takeaways || r.action_plan)
    .map((r) => `
      <div style="margin-bottom:12px;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px">
        <p style="font-weight:700;margin-bottom:4px">${r.course_name}</p>
        ${r.key_takeaways ? `<p style="font-size:12pt;margin:2px 0"><b>องค์ความรู้ที่ได้รับ:</b> ${r.key_takeaways}</p>` : ''}
        ${r.action_plan ? `<p style="font-size:12pt;margin:2px 0"><b>การนำไปประยุกต์ใช้:</b> ${r.action_plan}</p>` : ''}
      </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 20mm; }
  body { font-family:'Sarabun','TH SarabunNew',sans-serif; font-size:13pt; color:#111; line-height:1.6; }
  h1 { text-align:center; font-size:18pt; margin-bottom:4px; }
  h2 { text-align:center; font-size:13pt; margin:0 0 18px; color:#475569; }
  .section-title { font-weight:900; font-size:14pt; color:#1e3a8a; margin:22px 0 10px; border-bottom:2px solid #1e3a8a; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; font-size:12pt; }
  th { background:#1e3a8a; color:#fff; padding:6px 8px; border:1px solid #1e3a8a; }
  .kpi-cards { display:flex; gap:16px; margin:10px 0; }
  .kpi-card { flex:1; border:2px solid #1e3a8a; border-radius:10px; padding:14px; text-align:center; }
  .kpi-value { font-size:26pt; font-weight:900; color:#1e3a8a; }
  .kpi-label { font-size:11pt; color:#475569; }
  .progress-bar { height:14px; background:#e2e8f0; border-radius:7px; overflow:hidden; margin-top:6px; }
  .progress-fill { height:100%; background:#f97316; }
  .sign-section { display:flex; justify-content:space-between; margin-top:40px; gap:20px; }
  .sign-box { text-align:center; flex:1; }
  .sign-name { margin-top:44px; border-top:1px dotted #555; padding-top:4px; }
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
    <tr><td style="border:none"><b>สายชั้น/กลุ่มสาระ</b></td><td style="border:none">${[user.grade_level, user.department_name].filter(Boolean).join(' · ') || '—'}</td></tr>
  </table>

  <div class="section-title">ส่วนที่ 2 — สรุปภาพรวม</div>
  <div class="kpi-cards">
    <div class="kpi-card"><div class="kpi-value">${totalHours}</div><div class="kpi-label">ชั่วโมงรวมสะสม</div></div>
    <div class="kpi-card"><div class="kpi-value">${totalCourses}</div><div class="kpi-label">จำนวนคอร์ส</div></div>
    <div class="kpi-card"><div class="kpi-value">${targetHoursPerYear}</div><div class="kpi-label">เป้าหมายต่อปี (ชม.)</div></div>
  </div>
  <p style="font-size:11pt;color:#475569">ความคืบหน้าเทียบเป้าหมายประจำปี: ${pct.toFixed(0)}%</p>
  <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>

  <table style="margin-top:14px;max-width:60%">
    <tr><th>ประเภทการอบรม</th><th>ชั่วโมง</th></tr>
    ${typeRows}
  </table>

  <div class="section-title">ส่วนที่ 3 — ตารางประวัติการอบรม</div>
  <table>
    <tr><th>ที่</th><th>วันที่</th><th>ชื่อหลักสูตร</th><th>สถาบัน/วิทยากร</th><th>ชั่วโมง</th><th>สถานะ</th></tr>
    ${tableRows}
  </table>

  <div class="section-title">ส่วนที่ 4 — สรุปความรู้และการนำไปใช้</div>
  ${takeawayBlocks || '<p style="color:#94a3b8">ไม่มีข้อมูล</p>'}

  <div class="section-title">ส่วนที่ 5 — ช่องเซ็นชื่ออนุมัติ</div>
  <div class="sign-section">
    <div class="sign-box"><div class="sign-name">(${user.full_name})</div><div style="font-size:11pt;color:#475569">ผู้รายงาน</div></div>
    <div class="sign-box"><div class="sign-name">(${approverName || '..............................'})</div><div style="font-size:11pt;color:#475569">หัวหน้างาน</div></div>
    <div class="sign-box"><div class="sign-name">(${hrName || '..............................'})</div><div style="font-size:11pt;color:#475569">ฝ่ายบุคคล</div></div>
  </div>
  <script>window.onload=()=>window.print()<\/script>
</body></html>`;
}

export function printIndividualReport(user: IndividualReportUser, records: TrainingRecordWithUser[], targetHoursPerYear: number) {
  const html = buildIndividualReportHTML(user, records, targetHoursPerYear);
  const w = window.open('', '_blank', 'width=900,height=780');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}