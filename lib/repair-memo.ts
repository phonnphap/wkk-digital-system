import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
const ONEDRIVE_MEMO_ACCOUNT = 'general@khienkhet.ac.th';
const OD_MEMO_FOLDER = 'บันทึกข้อความแจ้งซ่อม';

export interface ChecklistItem {
  label: string;
  checked: boolean;
}

export interface RepairMemoInput {
  buildingId: string;
  buildingName: string;
  subject: string;
  checklist: ChecklistItem[];
  proposerName: string;
  proposerPosition: string;
  approverName: string;
  approverPosition: string;
}

function buildRepairMemoHTML(data: RepairMemoInput): string {
  const now = new Date();
  const thDay = now.getDate();
  const thMonth = now.toLocaleDateString('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' });
  const thYear = now.getFullYear() + 543;

  const checklistRows = data.checklist
    .map(
      (item) => `
      <tr>
        <td style="width:24px;text-align:center;border:1px solid #000;padding:4px">
          <span style="display:inline-flex;width:13px;height:13px;border:1.5px solid #000;align-items:center;justify-content:center;font-size:10pt">${item.checked ? '✓' : ''}</span>
        </td>
        <td style="border:1px solid #000;padding:4px 8px">${item.label}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:210mm;font-family:'Sarabun',Arial,sans-serif;font-size:12pt;color:#000;background:white}
.page{padding:14mm 18mm 10mm}
.dotline{border-bottom:1px dotted #555}
table.checklist{border-collapse:collapse;width:100%;font-size:11pt;margin:10px 0}
@page{size:A4;margin:0}
</style></head><body><div class="page">

<div style="text-align:center;margin-bottom:4px">
  <img src="/school-logo.png" style="width:54px;height:54px;object-fit:contain" onerror="this.style.display='none'"/>
</div>
<div style="font-size:16pt;font-weight:900;text-align:center;margin:6px 0">บันทึกข้อความ</div>
<div style="line-height:1.7;font-size:11pt;margin-bottom:10px">
  ส่วนราชการ โรงเรียนวัดเขียนเขต ตำบลบึงยี่โถ อำเภอธัญบุรี จังหวัดปทุมธานี<br>
  ที่ .................................. วันที่ ${thDay} เดือน ${thMonth} พ.ศ. ${thYear}<br>
  เรื่อง แจ้งซ่อมและขอความอนุเคราะห์ดำเนินการซ่อมแซม ${data.buildingName}
</div>
<div style="margin-bottom:8px;font-size:11pt">เรียน ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>

<div style="line-height:1.8;margin-bottom:10px;font-size:11pt;text-indent:2em">
  ด้วย${data.buildingName} มีรายการชำรุดที่ต้องดำเนินการซ่อมแซม ตามรายการที่ตรวจสอบดังนี้
</div>

<table class="checklist">
  <tr><th style="border:1px solid #000;background:#f0f0f0;padding:4px">✓</th><th style="border:1px solid #000;background:#f0f0f0;padding:4px;text-align:left">รายการ</th></tr>
  ${checklistRows}
</table>

<div style="line-height:1.8;margin:14px 0;font-size:11pt;text-indent:2em">
  จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติดำเนินการซ่อมแซมตามรายการดังกล่าวข้างต้น
</div>

<div style="display:flex;justify-content:space-between;margin-top:30px">
  <div style="text-align:center;width:45%">
    <div style="height:40px"></div>
    <div class="dotline">(${data.proposerName || '..............................'})</div>
    <div style="font-size:10.5pt;margin-top:4px">${data.proposerPosition || 'ผู้เสนอ'}</div>
  </div>
  <div style="text-align:center;width:45%">
    <div style="height:40px"></div>
    <div class="dotline">(${data.approverName || '..............................'})</div>
    <div style="font-size:10.5pt;margin-top:4px">${data.approverPosition || 'ผู้อนุมัติ'}</div>
  </div>
</div>

</div></body></html>`;
}

export async function saveAndUploadRepairMemo(input: RepairMemoInput): Promise<string> {
  const html = buildRepairMemoHTML(input);
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyyBE = now.getFullYear() + 543;
  const fileNameBase = `${dd}${mm}${yyyyBE}_${input.buildingName}_บันทึกข้อความแจ้งซ่อม`;

  let pdfUrl: string | null = null;

  // 1) ลอง generate PDF ก่อน
  try {
    const pdfRes = await fetch('/html-to-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (pdfRes.ok) {
      const pdfBlob = await pdfRes.blob();
      const fd = new FormData();
      fd.append('file', pdfBlob, `${fileNameBase}.pdf`);
      fd.append('path', `${OD_MEMO_FOLDER}/${fileNameBase}.pdf`);
      fd.append('account', ONEDRIVE_MEMO_ACCOUNT);
      const uploadRes = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
      const uploadJson = await uploadRes.json();
      if (uploadJson.ok) pdfUrl = uploadJson.url;
    }
  } catch (e) {
    console.warn('[repair memo] PDF generate failed, fallback to HTML', e);
  }

  // 2) Fallback: อัป HTML แทนถ้า PDF ไม่สำเร็จ
  if (!pdfUrl) {
    const htmlBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const fd = new FormData();
    fd.append('file', htmlBlob, `${fileNameBase}.html`);
    fd.append('path', `${OD_MEMO_FOLDER}/${fileNameBase}.html`);
    fd.append('account', ONEDRIVE_MEMO_ACCOUNT);
    const uploadRes = await fetch('/api/upload-onedrive', { method: 'POST', body: fd });
    const uploadJson = await uploadRes.json();
    pdfUrl = uploadJson.url ?? null;
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('auth_id', authUser?.id).maybeSingle();

  const { error } = await supabase.from('repair_memos').insert({
    building_id: input.buildingId,
    subject: input.subject,
    checklist: input.checklist,
    proposer_name: input.proposerName,
    proposer_position: input.proposerPosition,
    approver_name: input.approverName,
    approver_position: input.approverPosition,
    pdf_url: pdfUrl,
    created_by: me?.id,
  });
  if (error) throw error;

  return pdfUrl ?? '';
}