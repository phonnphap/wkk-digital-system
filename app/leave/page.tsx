//ลาใหม่สุด-fixed
"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LeaveType, LeaveStatus, LeaveRequest,
  LEAVE_TYPE_CONFIG, LEAVE_STATUS_CONFIG,
  getCurrentFiscalYear, isInFiscalYear,
} from "../../lib/leave-config";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const supabase = createClient();
const HR_EMAIL    = "hr@khienkhet.ac.th";
const ADMIN_EMAIL = "admin@khienkhet.ac.th";
const PRINT_ROLES = ["admin","director","deputy_director"];
const ADMIN_ROLES = ["admin","director","deputy_director"];

// ─── Approver emails (slot ตายตัว) ───────────────────────
const APPROVER_1_EMAIL = "phansa@khienkhet.ac.th";
const APPROVER_2_EMAIL = "titima@khienkhet.ac.th";
const APPROVER_3_EMAIL = "thananut@khienkhet.ac.th";
const APPROVER_EMAILS  = [APPROVER_1_EMAIL, APPROVER_2_EMAIL, APPROVER_3_EMAIL];

// ─── ดูข้อมูลทั้งหมด (admin/hr/approvers) ────────────────
const VIEW_ALL_EMAILS = [ADMIN_EMAIL, HR_EMAIL, ...APPROVER_EMAILS];

// ─── helpers ──────────────────────────────────────────────
function toThaiDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric", timeZone:"Asia/Bangkok" });
}
function toThaiDateLong(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"long", year:"numeric", timeZone:"Asia/Bangkok" });
}
function fiscalYearLabel(fy: number) { return `ปีงบประมาณ ${fy + 543}`; }
function daysBetween(s: string, e: string) { return Math.max(Math.round((new Date(e).getTime()-new Date(s).getTime())/86400000)+1,0); }
function fullName(u: any) {
  if (!u) return "";
  if (u.full_name) return u.full_name;
  return `${u.title??""} ${u.first_name??""} ${u.last_name??""}`.replace(/\s+/g," ").trim();
}
function displayName(u: any) {
  if (!u) return "";
  return `${u.title??""} ${u.first_name??""} ${u.last_name??""}`.replace(/\s+/g," ").trim();
}
function getEvalRound(d: string): "1"|"2" { const m=new Date(d).getMonth()+1; return m>=10||m<=3?"1":"2"; }
function isPersonalTooSoon(startDate: string): boolean {
  if (!startDate) return false;
  return (new Date(startDate).getTime()-Date.now())/86400000 < 3;
}
function isSickTooFarAhead(startDate: string): boolean {
  if (!startDate) return false;
  const diff = (new Date(startDate).getTime() - Date.now()) / 86400000;
  return diff > 1;
}

/** email → slot ที่แน่นอน (1/2/3) หรือ null */
function approverSlotByEmail(email: string): 1|2|3|null {
  const e = email?.toLowerCase().trim();
  if (e === APPROVER_1_EMAIL.toLowerCase()) return 1;
  if (e === APPROVER_2_EMAIL.toLowerCase()) return 2;
  if (e === APPROVER_3_EMAIL.toLowerCase()) return 3;
  return null;
}

// [FIX-4] resolve OneDrive download URL ให้สดก่อนแสดงหรือพิมพ์
async function resolveAttachmentUrl(documentPath?: string | null, fallbackUrl?: string | null): Promise<string | null> {
  if (!documentPath) return fallbackUrl ?? null;
  try {
    const res = await fetch("/api/resolve-onedrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: documentPath }),
    });
    const json = await res.json();
    if (json.ok && json.downloadUrl) return json.downloadUrl as string;
  } catch {
    // เงียบไว้ ใช้ fallback
  }
  return fallbackUrl ?? null;
}

// ─── Types ────────────────────────────────────────────────
type UserProfile = { id:string; title?:string; first_name?:string; last_name?:string; full_name?:string; email:string; role:string; position?:string; signature_url?:string; grade_level?:string; phone?:string; };
type ApproverInfo = { id:string; full_name:string; position?:string; email?:string };
type DutyOfficer  = { id:string; full_name:string; position?:string; email?:string };

type LeaveStats = {
  sick: number;
  personal: number;
  maternity: number;
  lastLeave?: {
    type: "sick"|"personal"|"maternity"|"ordination"|"other";
    startDate: string;
    endDate: string;
    days: number;
  } | null;
};

const COLORS: Record<string, { bg:string; border:string; text:string; activeBg:string; dot:string; ring:string }> = {
  sick:       { bg:"bg-red-50",    border:"border-red-200",    text:"text-red-700",    activeBg:"bg-red-100",    dot:"bg-red-400",    ring:"ring-red-300"    },
  personal:   { bg:"bg-amber-50",  border:"border-amber-200",  text:"text-amber-700",  activeBg:"bg-amber-100",  dot:"bg-amber-400",  ring:"ring-amber-300"  },
  maternity:  { bg:"bg-pink-50",   border:"border-pink-200",   text:"text-pink-700",   activeBg:"bg-pink-100",   dot:"bg-pink-400",   ring:"ring-pink-300"   },
  ordination: { bg:"bg-violet-50", border:"border-violet-200", text:"text-violet-700", activeBg:"bg-violet-100", dot:"bg-violet-400", ring:"ring-violet-300" },
  official:   { bg:"bg-sky-50",    border:"border-sky-200",    text:"text-sky-700",    activeBg:"bg-sky-100",    dot:"bg-sky-400",    ring:"ring-sky-300"    },
  other:      { bg:"bg-slate-50",  border:"border-slate-200",  text:"text-slate-700",  activeBg:"bg-slate-100",  dot:"bg-slate-400",  ring:"ring-slate-300"  },
};

const GRADE_LABEL: Record<string, string> = {
  "k2": "อ.2", "k3": "อ.3",
  "p1": "ป.1", "p2": "ป.2", "p3": "ป.3",
  "p4": "ป.4", "p5": "ป.5", "p6": "ป.6",
  "m1": "ม.1", "m2": "ม.2", "m3": "ม.3", "m4": "ม.4", "m5": "ม.5", "m6": "ม.6",
};

const LEAVE_TYPE_LIST: { key:LeaveType; label:string; icon:string }[] = [
  { key:"sick",       label:"ลาป่วย",                           icon:"🤒" },
  { key:"personal",   label:"ลากิจส่วนตัว",                     icon:"📋" },
  { key:"maternity",  label:"ลาคลอดบุตร / ช่วยเหลือภริยาคลอด",icon:"👶" },
  { key:"ordination", label:"ลาอุปสมบท / ประกอบพิธีฮัจย์",     icon:"🙏" },
  { key:"official",   label:"ไปราชการ",                          icon:"🏛️" },
  { key:"other" as LeaveType, label:"ลาประเภทอื่นๆ",            icon:"📌" },
];

const inp = (err?: boolean) => `w-full bg-white border-2 ${err?"border-red-400":"border-blue-200"} rounded-xl px-4 py-3 text-slate-800 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors`;
const sel = (err?: boolean) => `w-full bg-white border-2 ${err?"border-red-400":"border-blue-200"} rounded-xl px-4 py-3 text-slate-800 text-sm font-medium focus:border-blue-500 focus:outline-none appearance-none transition-colors`;

// ══════════════════════════════════════════════════════════
// ── PDF Builder ────────────────────────────────────────────
// [FIX-1] เว้น 1 บรรทัดหลัง "แบบใบลาป่วย ลากิจส่วนตัว ลาคลอดบุตร"
// ══════════════════════════════════════════════════════════
function buildLeaveHTML(
  data: any,
  signatureUrl: string,
  approverSignatures?: { name: string; position: string; signature_url?: string; approved_at?: string; }[],
  documentUrl?: string,
  leaveStats?: LeaveStats
): string {
  const now = new Date();
  const thDay   = now.getDate();
  const thMonth = now.toLocaleDateString("th-TH",{ month:"long", timeZone:"Asia/Bangkok" });
  const thYear  = now.getFullYear()+543;
  const isSick     = data.leaveType==="sick";
  const last = leaveStats?.lastLeave;
  const lastIsSick     = last?.type === "sick";
  const lastIsPersonal = last && ["personal","other","ordination"].includes(last.type);
  const lastIsMat      = last?.type === "maternity";
  const isPersonal = data.leaveType==="personal"||data.leaveType==="other"||data.leaveType==="ordination";
  const isMat      = data.leaveType==="maternity";
  const isOfficial = data.leaveType==="official";
  const daysDisplay = data.halfDay?"0.5":String(data.days);
  const halfText    = data.halfDay==="morning"?" (ครึ่งวันเช้า)":data.halfDay==="afternoon"?" (ครึ่งวันบ่าย)":"";
  const leaveLabel  = data.leaveType==="other"&&data.otherLeaveName?data.otherLeaveName:data.leaveTypeName;
  const reasonClean = (data.reason||"").replace(/\[.+?\]/g,"").trim();
  const approver1 = approverSignatures?.[0];
  const approver2 = approverSignatures?.[1];
  const approver3 = approverSignatures?.[2];

  const statSick     = leaveStats?.sick     ?? 0;
  const statPersonal = leaveStats?.personal ?? 0;
  const statMat      = leaveStats?.maternity?? 0;

  const thisSick     = isSick     ? Number(daysDisplay) : 0;
  const thisPersonal = isPersonal ? Number(daysDisplay) : 0;
  const thisMat      = isMat      ? Number(daysDisplay) : 0;

  const checkerBlock = `
  <div style="margin-top:10px;font-size:10.5pt;line-height:1.7;text-align:center">
    <div style="display:flex; align-items:flex-end; justify-content:center; gap:12px; height:42px; margin-bottom:2px; width:100%">
      <span style="white-space:nowrap">ลงชื่อ</span>
      <div style="min-width:120px; max-height:42px; display:flex; align-items:flex-end; justify-content:center">
        ${approver1?.signature_url
          ? `<img src="${approver1.signature_url}" style="max-height:42px; max-width:140px; object-fit:contain"/>`
          : `<span style="color:#64748b; letter-spacing:2px">...................</span>`}
      </div>
      <span style="white-space:nowrap">ผู้ตรวจสอบ</span>
    </div>
    <br>
    (${approver1?.name || "นางสาวพรรษา แก้วใหญ่"})<br>
    หัวหน้ากลุ่มบริหารงานบุคคล <br> วันที่ ${approver1?.approved_at || ".............................."}
  </div>`;

  const box2 = `
  <div class="box" style="margin-bottom:7px;font-size:10.5pt;line-height:1.6">
    <div style="font-weight:700;margin-bottom:3px">ความเห็นของรอง ผอ.กลุ่มบริหารงานบุคคล</div>
    <div style="min-height:15px;padding:1px 4px;margin:2px 0;border-bottom:1px dotted #555">
      ${approver2?.approved_at ? "เห็นควรอนุญาต" : ""}
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;margin-top:6px">
      <div style="height:40px;display:flex;align-items:flex-end;justify-content:center">
        ${approver2?.signature_url
          ? `<img src="${approver2.signature_url}" style="max-height:40px;max-width:150px;object-fit:contain"/>`
          : ``}
      </div>
      <div style="margin-top:2px;text-align:center">
        (${approver2?.name || "นางสาวฐิติมา กาบแก้ว"})<br>
        ${approver2?.position || "รองผู้อำนวยการกลุ่มบริหารงานบุคคล"}<br>
        วันที่ ${approver2?.approved_at || ".............................."}
      </div>
    </div>
  </div>`;

  const box3 = `
  <div class="box" style="font-size:10.5pt;line-height:1.6">
    <div style="font-weight:700;margin-bottom:3px">ความเห็นของผู้บังคับบัญชา</div>
    <div style="margin-bottom:4px">
      <span class="chk">${approver3?.signature_url ? "✓" : ""}</span>อนุญาต
      &nbsp;&nbsp;&nbsp;
      <span class="chk"></span>ไม่อนุญาต
    </div>
    <div style="min-height:15px;padding:1px 4px;margin:2px 0;border-bottom:1px dotted #555">
      ${approver3?.signature_url ? "พิจารณาแล้วเห็นสมควรอนุญาต" : ""}
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;margin-top:6px">
      <div style="height:40px;display:flex;align-items:flex-end;justify-content:center">
        ${approver3?.signature_url
          ? `<img src="${approver3.signature_url}" style="max-height:40px;max-width:150px;object-fit:contain"/>`
          : ``}
      </div>
      <div style="margin-top:2px;text-align:center">
        (${approver3?.name || "นายธนณัฐ ศิระวงษ์"})<br>
        ${approver3?.position || "ผู้อำนวยการโรงเรียนวัดเขียนเขต"}<br>
        วันที่ ${approver3?.approved_at || ".............................."}
      </div>
    </div>
  </div>`;

  const statsTableRows = isOfficial ? `
      <tr><td>ลาป่วย</td><td></td><td></td><td></td></tr>
      <tr><td>ลากิจส่วนตัว</td><td></td><td></td><td></td></tr>
      <tr><td>ลาคลอดบุตร</td><td></td><td></td><td></td></tr>
  ` : `
      <tr>
        <td>ลาป่วย</td>
        <td style="text-align:center">${statSick > 0 ? statSick : ""}</td>
        <td style="text-align:center">${thisSick > 0 ? daysDisplay : ""}</td>
        <td style="text-align:center">${(statSick + thisSick) > 0 ? statSick + thisSick : ""}</td>
      </tr>
      <tr>
        <td>ลากิจส่วนตัว</td>
        <td style="text-align:center">${statPersonal > 0 ? statPersonal : ""}</td>
        <td style="text-align:center">${thisPersonal > 0 ? daysDisplay : ""}</td>
        <td style="text-align:center">${(statPersonal + thisPersonal) > 0 ? statPersonal + thisPersonal : ""}</td>
      </tr>
      <tr>
        <td>ลาคลอดบุตร</td>
        <td style="text-align:center">${statMat > 0 ? statMat : ""}</td>
        <td style="text-align:center">${thisMat > 0 ? daysDisplay : ""}</td>
        <td style="text-align:center">${(statMat + thisMat) > 0 ? statMat + thisMat : ""}</td>
      </tr>
  `;

  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:210mm;font-family:'Sarabun',Arial,sans-serif;font-size:12pt;color:#000;background:white}
.page{padding:10mm 16mm 8mm}
.dotline{border-bottom:1px dotted #555}
.box{border:1px solid #888;padding:7px 10px;min-height:76px;border-radius:3px}
.chk{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border:1.5px solid #000;margin-right:4px;font-size:10pt;vertical-align:middle}
table.stat{border-collapse:collapse;font-size:10.5pt;width:100%}
table.stat td,table.stat th{border:1px solid #000;padding:3px 6px;text-align:center}
table.stat th{background:#f0f0f0;font-weight:700}
table.stat td:first-child{text-align:left}
@page{size:A4;margin:0}
@media print{.page{page-break-after:avoid}}
</style></head><body><div class="page">

<div style="text-align:center;margin-bottom:4px">
  <img src="/school-logo.png" style="width:54px;height:54px;object-fit:contain" onerror="this.style.display='none'"/>
</div>
<div style="font-size:14.5pt;font-weight:900;text-align:center;margin:3px 0">แบบใบลาป่วย ลากิจส่วนตัว ลาคลอดบุตร</div>
<div style="height:14pt"></div>
<div style="text-align:right;line-height:1.5;font-size:11pt;margin-bottom:7px">
  โรงเรียนวัดเขียนเขต ตำบลบึงยี่โถ<br>อำเภอธัญบุรี จังหวัดปทุมธานี
</div>

<div style="text-align:right;margin-bottom:8px;font-size:11pt">
  วันที่ <span class="dotline" style="min-width:32px;display:inline-block;text-align:center;font-weight:700">&nbsp;${thDay}&nbsp;</span>
  เดือน <span class="dotline" style="min-width:90px;display:inline-block;text-align:center;font-weight:700">&nbsp;${thMonth}&nbsp;</span>
  พ.ศ. <span class="dotline" style="min-width:50px;display:inline-block;text-align:center;font-weight:700">&nbsp;${thYear}&nbsp;</span>
</div>

<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:5px;font-size:11pt">
  <span style="white-space:nowrap">เรื่อง</span>
  <span class="dotline" style="flex:1;font-weight:700;padding-left:8px">ขออนุญาต${leaveLabel}${halfText}</span>
</div>
<div style="margin-bottom:8px;font-size:11pt">เรียน ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>

<div style="display:flex;gap:6px;align-items:baseline;margin-bottom:6px;padding-left:40px;font-size:11pt">
  <span style="white-space:nowrap">ข้าพเจ้า</span>
  <span class="dotline" style="flex:1;font-weight:700;padding-left:6px">${data.fullName}</span>
  <span style="white-space:nowrap">ตำแหน่ง</span>
  <span class="dotline" style="flex:1;font-weight:700;padding-left:6px">${data.position}</span>
</div>
<div style="margin-bottom:7px;font-size:11pt">สังกัดโรงเรียนวัดเขียนเขต สำนักงานเขตพื้นที่การศึกษาประถมศึกษาปทุมธานี เขต 2</div>

<div style="line-height:1.8;margin-bottom:6px;font-size:11pt">
  ขออนุญาต${leaveLabel} เนื่องจาก${reasonClean}
</div>

<div style="display:flex;gap:4px;align-items:baseline;margin-bottom:6px;font-size:11pt;flex-wrap:wrap">
  <span style="white-space:nowrap">ตั้งแต่วันที่</span>
  <span class="dotline" style="flex:1;min-width:110px;text-align:center;font-weight:700">${toThaiDateLong(data.startDate)}</span>
  <span style="white-space:nowrap">ถึงวันที่</span>
  <span class="dotline" style="flex:1;min-width:110px;text-align:center;font-weight:700">${toThaiDateLong(data.endDate)}</span>
  <span style="white-space:nowrap">มีกำหนด</span>
  <span class="dotline" style="min-width:40px;text-align:center;font-weight:700">${daysDisplay}</span>
  <span style="white-space:nowrap">วัน${halfText}</span>
</div>

<div style="margin-bottom:7px;font-size:11pt;line-height:1.7">
  ข้าพเจ้า ได้
  <span class="chk">${lastIsSick?"✓":""}</span> ลาป่วย
  <span class="chk">${lastIsPersonal?"✓":""}</span> ลากิจส่วนตัว
  <span class="chk">${lastIsMat?"✓":""}</span> ลาคลอดบุตร ครั้งสุดท้าย<br>
  ตั้งแต่วันที่<span class="dotline" style="min-width:110px;display:inline-block">
    ${last ? `&nbsp;${toThaiDateLong(last.startDate)}&nbsp;` : "&nbsp;&nbsp;&nbsp;&nbsp;"}
  </span>
  ถึงวันที่<span class="dotline" style="min-width:110px;display:inline-block">
    ${last ? `&nbsp;${toThaiDateLong(last.endDate)}&nbsp;` : "&nbsp;&nbsp;&nbsp;&nbsp;"}
  </span>
  มีกำหนด<span class="dotline" style="min-width:40px;display:inline-block">
    ${last ? `&nbsp;${last.days}&nbsp;` : "&nbsp;&nbsp;"}
  </span>วัน
</div>

<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px;font-size:11pt">
  <span style="white-space:nowrap">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่</span>
  <span class="dotline" style="flex:1;font-weight:700;padding-left:8px">${data.contactInfo||data.phone||""}</span>
</div>
<div class="dotline" style="height:14px;margin-bottom:10px"></div>

<div style="text-align:right;padding-right:8%;margin-top:6px">
  <div style="display:inline-flex;flex-direction:column;align-items:center;width:240px">
    <div style="font-size:11pt;margin-bottom:4px">ขอแสดงความนับถือ</div>
    <div style="height:46px;display:flex;align-items:flex-end;justify-content:center;width:100%">
      ${signatureUrl?`<img src="${signatureUrl}" style="max-height:46px;max-width:160px;object-fit:contain" alt="ลายเซ็น"/>`:``}
    </div>
    <div style="border-bottom:1px solid #000;width:220px;margin-top:2px"></div>
    <div style="font-size:11pt;margin-top:4px">(${data.fullName})</div>
  </div>
</div>

<div style="display:flex;gap:14px;margin-top:10px">
  <div style="flex:1">
    <div style="font-weight:700;text-decoration:underline;margin-bottom:5px;font-size:10.5pt">สถิติการลาในปีงบประมาณนี้</div>
    <table class="stat">
      <tr><th>ประเภทการลา</th><th>ลามาแล้ว</th><th>ลาครั้งนี้</th><th>รวมเป็น</th></tr>
      ${statsTableRows}
    </table>
    ${checkerBlock}
  </div>
  <div style="flex:1;border-left:1px dashed #ccc;padding-left:12px">
    ${box2}
    ${box3}
  </div>
</div>

</div></body></html>`;
}

function printLeave(data: any, signatureUrl: string, approverSignatures?: any[], documentUrl?: string, leaveStats?: LeaveStats) {
  const html = buildLeaveHTML(data, signatureUrl, approverSignatures, documentUrl, leaveStats);
  const win = window.open("","_blank","width=900,height=700");
  if (!win) return;
  win.document.open(); win.document.write(html); win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

async function printLeaveAsync(
  data: any, signatureUrl: string, approverSignatures?: any[],
  documentUrl?: string, documentPath?: string | null, leaveStats?: LeaveStats
) {
  const freshUrl = await resolveAttachmentUrl(documentPath, documentUrl);
  printLeave(data, signatureUrl, approverSignatures, freshUrl ?? undefined, leaveStats);
}

// ══════════════════════════════════════════════════════════
// ── SignaturePad ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════
function SignaturePad({ initialUrl, onSave, onClose, title = "✍️ ลายเซ็น" }: { initialUrl:string; onSave:(d:string)=>void; onClose:()=>void; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!initialUrl);
  const [mode, setMode]       = useState<"draw"|"upload">("draw");
  const [preview, setPreview] = useState(initialUrl||"");

  useEffect(()=>{
    if(mode!=="draw") return;
    const c=canvasRef.current; if(!c) return;
    const ctx=c.getContext("2d")!;
    c.width=c.offsetWidth*devicePixelRatio; c.height=c.offsetHeight*devicePixelRatio;
    ctx.scale(devicePixelRatio,devicePixelRatio);
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,9999,9999);
    ctx.strokeStyle="#1e3a8a"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round";
  },[mode]);

  function getXY(e:React.MouseEvent|React.TouchEvent,c:HTMLCanvasElement){
    const r=c.getBoundingClientRect();
    if("touches" in e) return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top};
    return{x:(e as React.MouseEvent).clientX-r.left,y:(e as React.MouseEvent).clientY-r.top};
  }
  function onStart(e:React.MouseEvent|React.TouchEvent){e.preventDefault();const c=canvasRef.current!;const ctx=c.getContext("2d")!;const p=getXY(e,c);ctx.beginPath();ctx.moveTo(p.x,p.y);setDrawing(true);setIsEmpty(false);}
  function onMove(e:React.MouseEvent|React.TouchEvent){e.preventDefault();if(!drawing)return;const c=canvasRef.current!;const ctx=c.getContext("2d")!;const p=getXY(e,c);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function onEnd(e:React.MouseEvent|React.TouchEvent){e.preventDefault();setDrawing(false);}
  function clear(){const c=canvasRef.current!;const ctx=c.getContext("2d")!;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.offsetWidth,c.offsetHeight);setIsEmpty(true);setPreview("");}
  function save(){if(mode==="upload"){if(!preview){alert("กรุณาเลือกรูป");return;}onSave(preview);return;}if(isEmpty){alert("กรุณาวาดลายเซ็น");return;}onSave(canvasRef.current!.toDataURL("image/png"));}

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div><h3 className="font-black text-slate-800">{title}</h3><p className="text-xs text-slate-400">วาดเอง หรือแนบไฟล์ PNG พื้นหลังโปร่งใส</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-lg font-bold">✕</button>
        </div>
        <div className="flex border-b border-slate-100">
          {[["draw","✏️ วาดเอง"],["upload","📁 แนบไฟล์ PNG"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m as any)} className={`flex-1 py-3 text-sm font-black border-b-2 ${mode===m?"border-blue-500 text-blue-600":"border-transparent text-slate-400"}`}>{l}</button>
          ))}
        </div>
        <div className="p-4">
          {mode==="draw"?(
            <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white" style={{touchAction:"none"}}>
              <canvas ref={canvasRef} style={{width:"100%",height:200,display:"block",cursor:"crosshair"}}
                onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
                onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}/>
            </div>
          ):(
            <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-6 text-center cursor-pointer hover:bg-blue-50">
              {preview?<img src={preview} alt="sig" className="max-h-28 mx-auto object-contain"/>:<><div className="text-4xl mb-2">📁</div><p className="text-sm font-bold text-slate-500">คลิกเพื่อเลือก PNG</p><p className="text-xs text-slate-400">พื้นหลังโปร่งใสเท่านั้น</p></>}
              <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setPreview(ev.target?.result as string);setIsEmpty(false);};r.readAsDataURL(f);}}/>
            </div>
          )}
          <p className="text-xs text-slate-300 text-center mt-2">— {mode==="draw"?"วาดในกล่องด้านบน":"เลือกไฟล์ PNG พื้นหลังว่าง"} —</p>
        </div>
        <div className="px-4 pb-4 flex gap-3">
          {mode==="draw"&&<button onClick={clear} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm">🗑️ ล้าง</button>}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">ยกเลิก</button>
          <button onClick={save} className="flex-[2] py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm">💾 บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── CompanionSelector ───────────────────────────────────────
// ══════════════════════════════════════════════════════════
function CompanionSelector({ allTeachers, selected, onChange }: {
  allTeachers: UserProfile[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = allTeachers.filter(t => {
    const name = displayName(t).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  }

  const selectedTeachers = allTeachers.filter(t => selected.includes(t.id));

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(v => !v)}
        className="w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-medium focus-within:border-blue-500 cursor-pointer min-h-[46px] flex flex-wrap gap-1.5 items-center"
      >
        {selectedTeachers.length === 0 && (
          <span className="text-slate-400">— คลิกเพื่อเลือกผู้ร่วมเดินทาง —</span>
        )}
        {selectedTeachers.map(t => (
          <span key={t.id} className="inline-flex items-center gap-1 bg-sky-100 border border-sky-300 text-sky-700 rounded-lg px-2 py-0.5 text-xs font-bold">
            {displayName(t)}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggle(t.id); }}
              className="ml-0.5 text-sky-500 hover:text-red-500 font-black leading-none"
            >✕</button>
          </span>
        ))}
        <span className="ml-auto text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 พิมพ์ชื่อเพื่อค้นหา..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-slate-400 text-sm text-center">ไม่พบชื่อที่ค้นหา</div>
            )}
            {filtered.map(t => {
              const isSelected = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-blue-50 transition-colors ${isSelected ? "bg-sky-50" : ""}`}
                >
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-black flex-shrink-0 ${isSelected ? "bg-sky-500 border-sky-500 text-white" : "border-slate-300"}`}>
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="flex-1">
                    <span className="font-bold text-slate-800">{displayName(t)}</span>
                    {t.position && <span className="text-slate-400 text-xs ml-2">{t.position}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">เลือกแล้ว {selected.length} คน</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-red-500 font-bold hover:text-red-700"
              >ล้างทั้งหมด</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── LeavePDFPreview ────────────────────────────────────────
// ══════════════════════════════════════════════════════════
function LeavePDFPreview({ data, signatureUrl, onConfirm, onCancel, onUpdateSignature, leaveStats }: {
  data:any; signatureUrl:string; onConfirm:(s:string)=>void; onCancel:()=>void; onUpdateSignature:()=>void; leaveStats?: LeaveStats;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const html = buildLeaveHTML(data, signatureUrl, undefined, undefined, leaveStats);

  useEffect(()=>{
    const iframe=iframeRef.current; if(!iframe) return;
    const doc=iframe.contentDocument; if(!doc) return;
    doc.open(); doc.write(html); doc.close();
    setTimeout(()=>setReady(true),700);
  },[html]);

  return (
    <div className="fixed inset-0 z-[9998] bg-black/70 flex flex-col overflow-auto">
      <div className="flex-1 flex flex-col items-center p-4 pb-20">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col" style={{minHeight:"90vh"}}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
            <div><h3 className="font-black text-slate-800 text-lg">📄 ตรวจสอบใบลาก่อนส่ง</h3><p className="text-xs text-slate-400">กรุณาตรวจสอบก่อนยืนยัน</p></div>
            <div className="flex gap-2">
              <button onClick={()=>printLeave(data,signatureUrl,undefined,undefined,leaveStats)} className="px-4 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">🖨️ พิมพ์</button>
              <button onClick={onCancel} className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">✕</button>
            </div>
          </div>
          <div className="flex-1 bg-slate-200 p-4" style={{minHeight:0}}>
            {!ready&&<div className="flex items-center justify-center h-full text-slate-500 font-bold animate-pulse">⏳ กำลังสร้างใบลา...</div>}
            <iframe ref={iframeRef} title="ใบลา" style={{width:"100%",height:"100%",minHeight:700,border:"none",borderRadius:8,background:"white",display:ready?"block":"none",boxShadow:"0 2px 20px rgba(0,0,0,.2)"}}/>
          </div>
          <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-bold text-slate-700 text-sm">✍️ ลายเซ็น</p>
                <p className={`text-xs font-semibold ${signatureUrl?"text-slate-400":"text-amber-500 animate-pulse"}`}>{signatureUrl?"พร้อมแล้ว":"⚠️ ยังไม่มีลายเซ็น"}</p>
              </div>
              <div className="flex items-center gap-3">
                {signatureUrl&&<img src={signatureUrl} alt="sig" className="h-10 max-w-[120px] object-contain border border-slate-200 rounded-lg"/>}
                <button onClick={onUpdateSignature} className="px-4 py-2 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-600 text-sm font-bold hover:bg-blue-100">{signatureUrl?"✏️ เซ็นใหม่":"✍️ เพิ่มลายเซ็น"}</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={onCancel} className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-600 font-black text-base hover:bg-slate-50">← แก้ไข</button>
              <button onClick={()=>{if(!signatureUrl){alert("กรุณาเพิ่มลายเซ็นก่อน");return;}onConfirm(signatureUrl);}} disabled={!signatureUrl}
                className={`flex-[2] py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 ${signatureUrl?"bg-blue-600 hover:bg-blue-700 text-white":"bg-slate-200 text-slate-400 cursor-not-allowed"}`}>
                📤 ยืนยันส่งใบลา
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StatusBadge ────────────────────────────────────────────
function StatusBadge({status}:{status:LeaveStatus}){
  const cfg=LEAVE_STATUS_CONFIG[status];
  const cls: Record<LeaveStatus, string> = {
    draft: "bg-gray-100 text-gray-600 border-gray-300",
    pending: "bg-amber-100 text-amber-700 border-amber-300",
    approved: "bg-green-100 text-green-700 border-green-300",
    rejected: "bg-red-100 text-red-700 border-red-300",
    cancelled: "bg-slate-100 text-slate-600 border-slate-300"
  };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border ${cls[status]}`}>{cfg.icon} {cfg.label}</span>;
}

// ── DutyOfficerAlert ───────────────────────────────────────
function DutyOfficerAlert({officer,isOwnDuty}:{officer:DutyOfficer|null;isOwnDuty:boolean}){
  if(!officer) return null;
  return(
    <div className={`rounded-xl border-2 px-4 py-3 flex items-start gap-3 ${isOwnDuty?"bg-red-50 border-red-300":"bg-amber-50 border-amber-300"}`}>
      <span className="text-xl mt-0.5">{isOwnDuty?"⚠️":"ℹ️"}</span>
      <div>
        <p className={`font-black text-sm ${isOwnDuty?"text-red-700":"text-amber-700"}`}>{isOwnDuty?"คุณมีเวรในวันที่ลา!":"หัวหน้าเวรวันนี้:"}</p>
        <p className="text-slate-600 text-sm font-bold">{officer.full_name}</p>
        {isOwnDuty&&<p className="text-red-600 text-xs mt-1">กรุณาหาผู้มาเวรแทนและแจ้งในหมายเหตุ</p>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── LeaveForm ──────────────────────────────────────════════
// ══════════════════════════════════════════════════════════
function LeaveForm({ user, approvers, allTeachers, savedSignature, onSubmit, onCancel, editData }: {
  user:UserProfile; approvers:ApproverInfo[]; allTeachers:UserProfile[];
  savedSignature:string; onSubmit:(d:any)=>Promise<void>; onCancel:()=>void; editData?:any;
}) {
  const [leaveType,    setLeaveType]    = useState<LeaveType>(editData?.leave_type??"sick");
  const [startDate,    setStartDate]    = useState(editData?.start_date??"");
  const [endDate,      setEndDate]      = useState(editData?.end_date??"");
  const [reason,       setReason]       = useState(editData?.reason??"");
  const [contactInfo,  setContactInfo]  = useState(user.phone??"");
  const [docFile,      setDocFile]      = useState<File|null>(null);
  const [tripDest,     setTripDest]     = useState("");
  const [vehicle,      setVehicle]      = useState<"school"|"personal">("school");
  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [missedPeriods,setMissedPeriods]= useState<string[]>([]);
  const [substitute,   setSubstitute]   = useState("");
  const [dutyOfficer,  setDutyOfficer]  = useState<DutyOfficer|null>(null);
  const [isOwnDuty,    setIsOwnDuty]    = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [dutyLoading,  setDutyLoading]  = useState(false);
  const [halfDay,      setHalfDay]      = useState<"morning"|"afternoon"|null>(null);
  const [otherName,    setOtherName]    = useState("");
  const [showSigPad,   setShowSigPad]   = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);
  const [sigUrl,       setSigUrl]       = useState(savedSignature??"");
  const [pendingPayload,setPendingPayload] = useState<any>(null);
  const [touched,      setTouched]      = useState<Record<string,boolean>>({});
  const [docPreview,   setDocPreview]   = useState<string|null>(null);
  const [docMime,      setDocMime]      = useState<string>("");
  const [leaveStats,   setLeaveStats]   = useState<LeaveStats>({ sick:0, personal:0, maternity:0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const rawDays = startDate&&endDate ? daysBetween(startDate,endDate) : 0;
  const days    = rawDays===1&&halfDay ? 0.5 : rawDays;
  const tooSoon = leaveType==="personal" && startDate && isPersonalTooSoon(startDate);
  const sickTooFarAhead = leaveType==="sick" && startDate && isSickTooFarAhead(startDate);
  const typeColor = COLORS[leaveType]??COLORS.other;
  const isEdit = !!editData?.id;

  const sickMaxDate = leaveType==="sick" ? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })() : undefined;

  useEffect(()=>{
    (async()=>{
      const fy = getCurrentFiscalYear();
      const { data } = await supabase
        .from("leave_requests")
        .select("id, leave_type, days_count, start_date, end_date, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!data) return;
      const fyData = data.filter(r => isInFiscalYear(r.start_date, fy));
      const filtered = (editData?.id
  ? fyData.filter((r: any) => r.id !== editData.id)
  : fyData
).filter((r: any) => r.status !== "rejected" && r.status !== "cancelled" && r.status !== "draft");

      const sick     = filtered.filter((r:any) => r.leave_type === "sick").reduce((s:number,r:any) => s + Number(r.days_count), 0);
      const personal = filtered.filter((r:any) => ["personal","other","ordination"].includes(r.leave_type)).reduce((s:number,r:any) => s + Number(r.days_count), 0);
      const maternity = filtered.filter((r:any) => r.leave_type === "maternity").reduce((s:number,r:any) => s + Number(r.days_count), 0);

      const lastLeaveReq = filtered
        .filter((r:any) => r.leave_type !== "official")
        .sort((a:any,b:any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

      const lastLeave = lastLeaveReq ? {
        type: lastLeaveReq.leave_type,
        startDate: lastLeaveReq.start_date,
        endDate: lastLeaveReq.end_date,
        days: Number(lastLeaveReq.days_count),
      } : null;

      setLeaveStats({ sick, personal, maternity, lastLeave });
    })();
  }, [user.id, editData?.id]);

  useEffect(()=>{
    if(!startDate){setDutyOfficer(null);setIsOwnDuty(false);return;}
    (async()=>{
      setDutyLoading(true);
      try{
        const {data}=await supabase.from("duty_assignments").select("morning_teachers,afternoon_teachers").eq("duty_date",startDate).maybeSingle();
        if(data){
          const all=[...((data as any).morning_teachers||[]),...((data as any).afternoon_teachers||[])];
          setIsOwnDuty(all.includes(user.id));
          if(all[0]){const {data:od}=await supabase.from("users").select("id,first_name,last_name,full_name,position,email").eq("id",all[0]).maybeSingle();if(od)setDutyOfficer({...(od as any),full_name:(od as any).full_name||`${(od as any).first_name??""} ${(od as any).last_name??""}`.trim()});else setDutyOfficer(null);}
          else setDutyOfficer(null);
        }else{setDutyOfficer(null);setIsOwnDuty(false);}
      }catch{setDutyOfficer(null);}
      setDutyLoading(false);
    })();
  },[startDate,user.id]);

  useEffect(()=>{
    if(leaveType==="sick" && sickMaxDate){
      if(startDate > sickMaxDate) setStartDate("");
      if(endDate > sickMaxDate) setEndDate("");
    }
  },[leaveType]);

  const togglePeriod=(p:string)=>setMissedPeriods(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p]);
  const touch=(f:string)=>setTouched(t=>({...t,[f]:true}));

  const errors = {
    startDate: touched.startDate&&!startDate,
    endDate:   touched.endDate&&!endDate,
    reason:    touched.reason&&!reason,
    otherName: touched.otherName&&leaveType==="other"&&!otherName,
    tripDest:  touched.tripDest&&leaveType==="official"&&!tripDest,
    contactInfo: touched.contactInfo&&!contactInfo,
  };
  const canSubmit = startDate&&endDate&&reason&&contactInfo&&(!tooSoon)&&(!sickTooFarAhead)&&(leaveType!=="other"||otherName)&&(leaveType!=="official"||tripDest);

  async function handleSubmit(isDraft=false){
    setTouched({startDate:true,endDate:true,reason:true,otherName:true,tripDest:true,contactInfo:true});
    if(!isDraft&&!canSubmit){alert("กรุณากรอกข้อมูลให้ครบ");return;}
    if(!isDraft&&tooSoon){alert("ลากิจต้องยื่นล่วงหน้าอย่างน้อย 3 วัน");return;}
    if(!isDraft&&sickTooFarAhead){alert("ลาป่วยสามารถยื่นล่วงหน้าได้ไม่เกิน 1 วัน");return;}

    let docUrl: string | null = null;
    let docPath: string | null = null;
    if (docFile) {
      const MAX_SIZE = 4 * 1024 * 1024;
      if (docFile.size > MAX_SIZE) {
        alert(`⚠️ ไฟล์ใหญ่เกินไป (${(docFile.size / 1024 / 1024).toFixed(1)} MB)\nกรุณาใช้ไฟล์ขนาดไม่เกิน 4MB`);
        return;
      }
      try {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const yyyyBE = now.getFullYear() + 543;
        const teacherFirstName = (user.first_name || fullName(user).split(" ")[0] || "ไม่ระบุชื่อ").trim();
        const ext = docFile.name.includes(".") ? docFile.name.split(".").pop() : "";
        const baseFileName = `${dd}${mm}${yyyyBE}_${teacherFirstName}`;
        const uniqueSuffix = `_${Date.now()}`;
        const finalFileName = ext ? `${baseFileName}${uniqueSuffix}.${ext}` : `${baseFileName}${uniqueSuffix}`;
        // [FIX-3] อัพไฟล์แนบไปที่โฟลเดอร์ HR บน OneDrive
        const relPath = `ใบลา_เอกสารแนบ/${finalFileName}`; 

        const formData = new FormData();
        formData.append("file", docFile);
        formData.append("path", relPath);
        formData.append("account", HR_EMAIL); // ระบุ account HR (ถ้า API รองรับ)

        const res = await fetch("/api/upload-onedrive", { method: "POST", body: formData });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          const errMsg = json?.error
            ? (typeof json.error === "string" ? json.error : JSON.stringify(json.error))
            : `HTTP ${res.status}`;
          throw new Error(errMsg);
        }
        docUrl  = json.downloadUrl || json.url || json.webUrl || null;
        docPath = relPath;
      } catch (err: any) {
        console.error("Upload error:", err);
        const go = confirm(`⚠️ แนบไฟล์ไม่สำเร็จ\n\nรายละเอียด: ${err.message}\n\nต้องการส่งใบลาโดยไม่มีเอกสารแนบหรือไม่?`);
        if (!go) return;
      }
    }

    const companionNames = allTeachers
      .filter(t => companionIds.includes(t.id))
      .map(t => displayName(t))
      .join(", ");

    const reasonFull = leaveType==="official"
      ?`[ปลายทาง: ${tripDest}] [พาหนะ: ${vehicle==="school"?"รถโรงเรียน":"รถส่วนตัว"}] [ผู้ร่วมเดินทาง: ${companionNames||"-"}] ${reason}`
      :reason;

    const payload={
      leave_type:leaveType, start_date:startDate, end_date:endDate,
      days_count:days, reason:reasonFull,
      contact_info:contactInfo,
      other_leave_name:leaveType==="other"?otherName:null,
      half_day:rawDays===1&&leaveType!=="ordination"?halfDay:null,
      document_url: docUrl,
      document_path: docPath,
      status:isDraft?"draft":"pending",
      missed_periods:missedPeriods.join(","), substitute_id:substitute||null,
      duty_officer_id:dutyOfficer?.id??null,
      approver_1_id:approvers[0]?.id??null,
      approver_2_id:approvers[1]?.id??null,
      approver_3_id:approvers[2]?.id??null,
      approver_1_status:approvers[0]?"pending":null,
      approver_2_status:approvers[1]?"pending":null,
      approver_3_status:approvers[2]?"pending":null,
    };
    if(isDraft){setLoading(true);await onSubmit(payload);setLoading(false);return;}
    setPendingPayload(payload);
    setShowPreview(true);
  }

  async function confirmSubmit(finalSig:string){
    if(!pendingPayload)return;
    setLoading(true);setShowPreview(false);
    await onSubmit({...pendingPayload,signature_url:finalSig});
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {showSigPad&&<SignaturePad initialUrl={sigUrl} onSave={async(d)=>{setSigUrl(d);setShowSigPad(false);await (supabase.from("users") as any).update({signature_url:d}).eq("id",user.id);}} onClose={()=>setShowSigPad(false)}/>}
      {showPreview&&pendingPayload&&(
        <LeavePDFPreview
          data={{fullName:fullName(user),position:user.position??user.role,leaveType:pendingPayload.leave_type,leaveTypeName:LEAVE_TYPE_LIST.find(t=>t.key===pendingPayload.leave_type)?.label??"",otherLeaveName:pendingPayload.other_leave_name,startDate:pendingPayload.start_date,endDate:pendingPayload.end_date,days:pendingPayload.days_count,halfDay:pendingPayload.half_day,reason:pendingPayload.reason,phone:user.phone,contactInfo:pendingPayload.contact_info}}
          signatureUrl={sigUrl}
          leaveStats={leaveStats}
          onConfirm={confirmSubmit}
          onCancel={()=>setShowPreview(false)}
          onUpdateSignature={()=>{setShowPreview(false);setShowSigPad(true);}}
        />
      )}

      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <button onClick={onCancel} className="w-10 h-10 rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 text-xl">←</button>
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-800">{isEdit?"แก้ไขคำขอลา":"ยื่นคำขอลา / ไปราชการ"}</h2>
          <p className="text-slate-500 text-xs">{fullName(user)} · {user.position}</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 max-w-4xl w-full mx-auto space-y-5">

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <label className="block text-sm font-bold text-slate-600 mb-3">ประเภทการลา <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {LEAVE_TYPE_LIST.map(({key,label,icon})=>{
              const c=COLORS[key]??COLORS.other;
              const active=leaveType===key;
              return(
                <button key={key} type="button" onClick={()=>setLeaveType(key)}
                  className={`p-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${active?`${c.activeBg} ${c.border} ${c.text} ring-2 ${c.ring}`:"bg-white border-blue-100 text-slate-600 hover:bg-blue-50"}`}>
                  <span className="text-2xl">{icon}</span><span className="leading-tight text-sm">{label}</span>
                </button>
              );
            })}
          </div>
          {leaveType==="other"&&(
            <div className="mt-4">
              <label className="block text-sm font-bold text-slate-600 mb-1">ระบุประเภท <span className="text-red-500">*</span></label>
              <input type="text" value={otherName} onChange={e=>setOtherName(e.target.value)} onBlur={()=>touch("otherName")}
                placeholder="เช่น ลาพักผ่อน, ลาฉุกเฉิน..." className={inp(errors.otherName)}/>
              {errors.otherName&&<p className="text-red-500 text-xs mt-1">กรุณาระบุประเภทการลา</p>}
            </div>
          )}
          {leaveType==="ordination"&&(
            <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-violet-500">ℹ️</span>
              <p className="text-violet-700 text-xs font-bold">การลาอุปสมบท/ฮัจย์ จะนับรวมในสถิติลากิจส่วนตัว</p>
            </div>
          )}
          {leaveType==="sick"&&(
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-blue-500">ℹ️</span>
              <p className="text-blue-700 text-xs font-bold">ลาป่วยสามารถยื่นได้วันนี้หรือล่วงหน้าได้ไม่เกิน 1 วัน</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">วันที่เริ่มลา <span className="text-red-500">*</span></label>
              <input type="date" value={startDate} onBlur={()=>touch("startDate")}
                max={leaveType==="sick" ? sickMaxDate : undefined}
                onChange={e=>{setStartDate(e.target.value);if(!endDate||e.target.value>endDate)setEndDate(e.target.value);}}
                className={inp(errors.startDate)}/>
              {errors.startDate&&<p className="text-red-500 text-xs mt-1">กรุณาเลือกวันที่</p>}
              {startDate&&<p className="text-xs text-blue-600 mt-1 font-medium">{toThaiDateLong(startDate)}</p>}
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">วันที่สิ้นสุด <span className="text-red-500">*</span></label>
              <input type="date" value={endDate} min={startDate}
                max={leaveType==="sick" ? sickMaxDate : undefined}
                onBlur={()=>touch("endDate")}
                onChange={e=>setEndDate(e.target.value)} className={inp(errors.endDate)}/>
              {errors.endDate&&<p className="text-red-500 text-xs mt-1">กรุณาเลือกวันที่</p>}
              {endDate&&<p className="text-xs text-blue-600 mt-1 font-medium">{toThaiDateLong(endDate)}</p>}
            </div>
          </div>

          {rawDays===1&&leaveType!=="ordination"&&(
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">ครึ่งวัน</label>
              <div className="flex gap-2">
                {[{val:null,label:"🗓️ เต็มวัน"},{val:"morning",label:"🌅 ครึ่งเช้า (0.5)"},{val:"afternoon",label:"🌇 ครึ่งบ่าย (0.5)"}].map(opt=>(
                  <button key={String(opt.val)} type="button" onClick={()=>setHalfDay(opt.val as any)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${halfDay===opt.val?"bg-blue-50 border-blue-400 text-blue-700":"bg-white border-blue-100 text-slate-600 hover:bg-blue-50"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {days>0&&(
            <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border-2 ${typeColor.bg} ${typeColor.border}`}>
              <span className="text-3xl font-black text-slate-800">{days}</span>
              <span className={`font-bold ${typeColor.text}`}>วัน{rawDays===1&&halfDay?" (ครึ่งวัน)":""}</span>
              {tooSoon&&<span className="text-red-600 text-xs font-black bg-red-50 border border-red-300 px-2 py-1 rounded-lg">⚠️ ลากิจต้องยื่นล่วงหน้า 3 วัน</span>}
              {sickTooFarAhead&&<span className="text-red-600 text-xs font-black bg-red-50 border border-red-300 px-2 py-1 rounded-lg">⚠️ ลาป่วยล่วงหน้าได้ไม่เกิน 1 วัน</span>}
            </div>
          )}

          {dutyLoading&&startDate&&<p className="text-xs text-slate-400 animate-pulse">⏳ ตรวจสอบตารางเวร...</p>}
          {!dutyLoading&&<DutyOfficerAlert officer={dutyOfficer} isOwnDuty={isOwnDuty}/>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">
              {leaveType==="official"?"รายละเอียดการไปราชการ":"เหตุผลการลา"} <span className="text-red-500">*</span>
              <span className="text-slate-400 font-normal ml-2">({reason.length}/50)</span>
            </label>
            <textarea value={reason} onChange={e=>e.target.value.length<=50&&setReason(e.target.value)} onBlur={()=>touch("reason")} rows={3}
              placeholder={leaveType==="official"?"ระบุวัตถุประสงค์...":"ระบุเหตุผล (ไม่เกิน 50 ตัวอักษร)"}
              className={inp(errors.reason)+" resize-none"}/>
            {errors.reason&&<p className="text-red-500 text-xs mt-1">กรุณากรอกเหตุผล</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">ที่อยู่/เบอร์โทรที่ติดต่อได้ระหว่างลา <span className="text-red-500">*</span></label>
            <input type="text" value={contactInfo} onChange={e=>setContactInfo(e.target.value)} onBlur={()=>touch("contactInfo")}
              placeholder="เช่น 081-234-5678 หรือ บ้านเลขที่..." className={inp(errors.contactInfo)}/>
            {errors.contactInfo&&<p className="text-red-500 text-xs mt-1">กรุณากรอกข้อมูลติดต่อ</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">แนบใบรับรองแพทย์ / เอกสาร {leaveType==="sick"&&<span className="text-amber-500">(แนะนำ)</span>}</label>
            <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-blue-50 transition-colors">
              <span className="text-2xl">📎</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-600 truncate">{docFile?docFile.name:"คลิกเพื่อแนบไฟล์"}</p>
                <p className="text-xs text-slate-400">รองรับ PDF, JPG, PNG (ไม่เกิน 10MB) · บันทึกใน OneDrive ของ HR</p>
              </div>
              {docFile&&<button type="button" onClick={e=>{e.stopPropagation();setDocFile(null);}} className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs flex items-center justify-center font-black">✕</button>}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                setDocFile(f);
                if (f) {
                  setDocMime(f.type);
                  const reader = new FileReader();
                  reader.onload = ev => setDocPreview(ev.target?.result as string);
                  reader.readAsDataURL(f);
                } else {
                  setDocPreview(null);
                }
              }}
            />
          </div>
        </div>
        {docPreview && (
          <div className="mt-3 border-2 border-blue-100 rounded-xl overflow-hidden">
            {docMime.startsWith("image/") ? (
              <img src={docPreview} alt="preview" className="w-full max-h-64 object-contain bg-slate-50"/>
            ) : (
              <iframe src={docPreview} title="preview" className="w-full h-64"/>
            )}
            <div className="px-3 py-2 bg-blue-50 flex items-center justify-between">
              <span className="text-xs text-blue-600 font-bold">📎 {docFile?.name}</span>
              <button type="button" onClick={() => { setDocFile(null); setDocPreview(null); }}
                className="text-xs text-red-500 font-bold hover:text-red-700">✕ ลบออก</button>
            </div>
          </div>
        )}

        {leaveType==="official"&&(
          <div className="bg-sky-50 rounded-2xl border border-sky-200 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-sky-700">🏛️ ข้อมูลการไปราชการ</h3>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">สถานที่ / หน่วยงาน <span className="text-red-500">*</span></label>
              <input type="text" value={tripDest} onChange={e=>setTripDest(e.target.value)} onBlur={()=>touch("tripDest")}
                placeholder="เช่น กระทรวงศึกษาธิการ กรุงเทพฯ" className={inp(errors.tripDest)}/>
              {errors.tripDest&&<p className="text-red-500 text-xs mt-1">กรุณาระบุสถานที่</p>}
            </div>
            <div className="flex gap-3">
              {[["school","🚌 รถโรงเรียน"],["personal","🚗 รถส่วนตัว"]].map(([v,l])=>(
                <label key={v} className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 cursor-pointer font-bold text-sm flex-1 justify-center ${vehicle===v?"bg-sky-100 border-sky-400 text-sky-700":"bg-white border-blue-100 text-slate-600"}`}>
                  <input type="radio" name="vehicle" value={v} checked={vehicle===v} onChange={()=>setVehicle(v as any)} className="accent-sky-500"/>{l}
                </label>
              ))}
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">ผู้ร่วมเดินทาง</label>
              <CompanionSelector
                allTeachers={allTeachers}
                selected={companionIds}
                onChange={setCompanionIds}
              />
              {companionIds.length > 0 && (
                <p className="text-xs text-sky-600 font-bold mt-1.5">เลือกแล้ว {companionIds.length} คน</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-black text-slate-700">📚 ข้อมูลภาระงาน (ถ้ามี)</h3>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">คาบสอนที่จะขาด</label>
            <div className="flex flex-wrap gap-2">
              {["1","2","3","4","5","6","7","8"].map(p=>(
                <button key={p} type="button" onClick={()=>togglePeriod(p)}
                  className={`w-12 h-12 rounded-xl font-black text-sm border-2 transition-all ${missedPeriods.includes(p)?"bg-blue-500 border-blue-500 text-white":"bg-white border-blue-100 text-slate-600 hover:bg-blue-50"}`}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">ครูสอนแทน</label>
            <select value={substitute} onChange={e=>setSubstitute(e.target.value)} className={sel()}>
              <option value="">— เลือกครูสอนแทน —</option>
              {allTeachers.filter(t=>t.id!==user.id).map(t=>(
                <option key={t.id} value={t.id}>{displayName(t)}{t.position?` · ${t.position}`:""}</option>
              ))}
            </select>
          </div>
        </div>

        {approvers.length>0&&(
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-3">ลำดับการอนุมัติ</p>
            <div className="flex items-center gap-2 flex-wrap">
              {approvers.slice(0,3).map((a,i)=>(
                <div key={a.id} className="flex items-center gap-1.5">
                  <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-xl px-3 py-2">
                    <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-black flex items-center justify-center">{i+1}</span>
                    <span className="text-slate-700 font-bold text-sm">{a.full_name}</span>
                  </div>
                  {i<approvers.slice(0,3).length-1&&<span className="text-blue-300 font-bold">→</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-700">✍️ ลายเซ็น</p>
              <p className="text-xs text-slate-400">{sigUrl?"พร้อมแล้ว":"ต้องเพิ่มก่อนส่งใบลา"}</p>
            </div>
            <div className="flex items-center gap-3">
              {sigUrl&&<img src={sigUrl} alt="sig" className="h-10 max-w-[100px] object-contain border border-slate-200 rounded"/>}
              <button onClick={()=>setShowSigPad(true)} className="px-4 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-600 text-sm font-black hover:bg-blue-100">
                {sigUrl?"✏️ เซ็นใหม่":"✍️ เพิ่มลายเซ็น"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pb-8">
          <button onClick={()=>handleSubmit(true)} disabled={loading}
            className="flex-1 py-4 rounded-2xl border-2 border-slate-300 bg-white text-slate-700 font-black text-base hover:bg-slate-50 disabled:opacity-50">
            💾 บันทึกร่าง
          </button>
          <button onClick={()=>handleSubmit(false)} disabled={loading||!canSubmit}
            className="flex-[2] py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
            {loading?<><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>กำลังส่ง...</>:"📤 ส่งใบลา"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── TeacherDashboard ──────────────────────────────────────
// ══════════════════════════════════════════════════════════
function TeacherDashboard({ user, approvers, allTeachers, savedSignature, canPrint }: {
  user:UserProfile; approvers:ApproverInfo[]; allTeachers:UserProfile[]; savedSignature:string; canPrint:boolean;
}) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editRequest, setEditRequest] = useState<any>(null);
  const [filterFY, setFilterFY] = useState(getCurrentFiscalYear());
  const [filterType, setFilterType] = useState<LeaveType|"all">("all");
  const [filterEval, setFilterEval] = useState<"all"|"1"|"2">("all");
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string|null>(null);

  const loadRequests = useCallback(async()=>{
    setLoading(true);
    const {data}=await supabase.from("leave_requests").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
    setRequests((data as LeaveRequest[])||[]);
    setLoading(false);
  },[user.id]);
  useEffect(()=>{loadRequests();},[loadRequests]);

  async function submitLeave(payload:any){
    if(editRequest?.id){
      const {error}=await (supabase.from("leave_requests") as any).update(payload).eq("id",editRequest.id);
      if(error){alert("❌ "+error.message);return;}
      alert("✅ แก้ไขคำขอลาเรียบร้อย");
    } else {
      const {error}=await (supabase.from("leave_requests") as any).insert([{...payload,user_id:user.id}]);
      if(error){alert("❌ "+error.message);return;}
      alert("✅ ส่งคำขอลาสำเร็จ");
    }
    setShowForm(false); setEditRequest(null);
    await loadRequests();
  }

  async function deleteRequest(id:string){
    if(!confirm("ยืนยันการลบคำขอลานี้?"))return;
    await supabase.from("leave_requests").delete().eq("id",id);
    await loadRequests();
  }

  // [FIX-2] printFullLeave — ดึง end_date + lastLeave ด้วย
  async function printFullLeave(r: LeaveRequest) {
    const fy = getCurrentFiscalYear();
    const { data: statsData } = await supabase
      .from("leave_requests")
      .select("id, leave_type, days_count, start_date, end_date, status")
      .eq("user_id", user.id)
      .not("status", "in", '("rejected","cancelled","draft")');

    const fyData = (statsData || []).filter(x => isInFiscalYear(x.start_date, fy) && x.id !== r.id);
    const lastLeaveReq = fyData
      .filter((x: any) => x.leave_type !== "official")
      .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

    const stats: LeaveStats = {
      sick:      fyData.filter(x => x.leave_type === "sick").reduce((s,x) => s + Number(x.days_count), 0),
      personal:  fyData.filter(x => ["personal","other","ordination"].includes(x.leave_type)).reduce((s,x) => s + Number(x.days_count), 0),
      maternity: fyData.filter(x => x.leave_type === "maternity").reduce((s,x) => s + Number(x.days_count), 0),
      lastLeave: lastLeaveReq ? {
        type: lastLeaveReq.leave_type,
        startDate: lastLeaveReq.start_date,
        endDate: lastLeaveReq.end_date,
        days: Number(lastLeaveReq.days_count),
      } : null,
    };

    await printLeaveAsync(
      {
        fullName: fullName(user), position: user.position ?? user.role,
        leaveType: r.leave_type,
        leaveTypeName: LEAVE_TYPE_LIST.find(t => t.key === r.leave_type)?.label ?? "",
        otherLeaveName: (r as any).other_leave_name,
        startDate: r.start_date, endDate: r.end_date,
        days: r.days_count, halfDay: (r as any).half_day,
        reason: r.reason, phone: user.phone,
        contactInfo: (r as any).contact_info,
      },
      (r as any).signature_url || savedSignature,
      [
        {
          name: "นางสาวพรรษา แก้วใหญ่",
          position: "ครู ตรวจสอบสถิติการลา",
          signature_url: (r as any).approver_1_signature,
          approved_at:   (r as any).approver_1_approved_at,
        },
        {
          name: "นางสาวฐิติมา กาบแก้ว",
          position: "รองผู้อำนวยการกลุ่มบริหารงานบุคคล",
          signature_url: (r as any).approver_2_signature,
          approved_at:   (r as any).approver_2_approved_at,
        },
        {
          name: "นายธนณัฐ ศิระวงษ์",
          position: "ผู้อำนวยการโรงเรียนวัดเขียนเขต",
          signature_url: (r as any).approver_3_signature,
          approved_at:   (r as any).approver_3_approved_at,
        },
      ],
      (r as any).document_url,
      (r as any).document_path,
      stats
    );
  }

  if(showForm||editRequest) return <LeaveForm user={user} approvers={approvers} allTeachers={allTeachers} savedSignature={savedSignature} onSubmit={submitLeave} onCancel={()=>{setShowForm(false);setEditRequest(null);}} editData={editRequest}/>;

  const fyReqs=requests.filter(r=>isInFiscalYear(r.start_date,filterFY)&&r.status!=="rejected"&&r.status!=="cancelled");
  const usedByType=Object.fromEntries((Object.keys(LEAVE_TYPE_CONFIG) as LeaveType[]).map(t=>[t,fyReqs.filter(r=>r.leave_type===t).reduce((s,r)=>s+Number(r.days_count),0)])) as Record<LeaveType,number>;

  const evalReqs = filterEval==="all"?fyReqs:fyReqs.filter(r=>getEvalRound(r.start_date)===filterEval);
  const spReqs = evalReqs.filter(r => r.leave_type !== "official");
  const spTimes = spReqs.length;
  const spDays  = spReqs.reduce((s,r)=>s+Number(r.days_count),0);

  const filtered=requests.filter(r=>{
    return isInFiscalYear(r.start_date,filterFY)
      &&(filterType==="all"||r.leave_type===filterType)
      &&(filterEval==="all"||getEvalRound(r.start_date)===filterEval);
  });

  return (
    <div className="w-full min-h-screen">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-6 py-5 text-white flex items-center justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-blue-100">ยินดีต้อนรับ</span>
            <h2 className="text-2xl font-black">{fullName(user)}</h2>
          </div>
          <p className="text-xl font-bold text-blue-200 mt-0.5">{user.position}</p>
        </div>
        <button onClick={()=>setShowForm(true)}
          className="shrink-0 px-6 py-4 bg-white text-blue-700 rounded-2xl font-black shadow-xl hover:bg-blue-50 active:scale-95 flex items-center gap-3 min-w-[200px]">
          <span className="text-3xl">✍️</span>
          <span className="text-lg leading-tight">ยื่นใบลา<br/><span className="text-sm opacity-70">/ ไปราชการ</span></span>
        </button>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-5xl mx-auto">
        <div className="flex gap-2 flex-wrap">
          {[0,1,2].map(i=>{const fy=getCurrentFiscalYear()-i;return(
            <button key={fy} onClick={()=>setFilterFY(fy)} className={`px-3 py-2 rounded-xl text-sm font-black border-2 ${filterFY===fy?"bg-blue-500 border-blue-500 text-white":"bg-white border-slate-200 text-slate-600"}`}>
              {fiscalYearLabel(fy)}
            </button>
          );})}
          <select value={filterEval} onChange={e=>setFilterEval(e.target.value as any)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
            <option value="all">ทุกรอบประเมิน</option>
            <option value="1">รอบ 1 (ต.ค.–มี.ค.)</option>
            <option value="2">รอบ 2 (เม.ย.–ก.ย.)</option>
          </select>
          <select value={filterType} onChange={e=>setFilterType(e.target.value as any)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
            <option value="all">ทุกประเภท</option>
            {(Object.entries(LEAVE_TYPE_CONFIG) as any[]).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {(Object.entries(LEAVE_TYPE_CONFIG) as [LeaveType,any][]).map(([type,cfg])=>{
            const used=usedByType[type]??0;
            const quota=cfg.quota;
            const pct=quota?Math.min((used/quota)*100,100):0;
            const c=COLORS[type]??COLORS.other;
            return(
              <div key={type} className={`bg-white border-2 ${c.border} rounded-2xl p-4 shadow-sm flex-1 min-w-[145px]`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{cfg.icon}</span>
                  <span className={`text-xs font-black ${c.text} ${c.bg} px-2 py-0.5 rounded-lg border ${c.border}`}>{cfg.label}</span>
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-2xl font-black text-slate-800">{used}</span>
                  {quota&&<span className="text-slate-400 text-xs font-bold">/ {quota} วัน</span>}
                  {!quota&&<span className="text-slate-400 text-xs font-bold">วัน</span>}
                </div>
                {quota&&<div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c.dot}`} style={{width:`${pct}%`}}/></div>}
              </div>
            );
          })}
        </div>

        {spTimes>=6||spDays>=23?(
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-black text-red-700 mb-1">แจ้งเตือน: การลาอาจส่งผลต่อการเลื่อนเงินเดือน</p>
              <p className="text-red-600 text-sm font-bold">ลาป่วย + ลากิจ: <strong>{spTimes} ครั้ง{spTimes>=6?" ⚠️ เกิน 6 ครั้ง":""}</strong> / <strong>{spDays} วัน{spDays>=23?" ⚠️ เกิน 23 วัน":""}</strong></p>
            </div>
          </div>
        ):spTimes>3?(
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-xl">💡</span>
            <p className="text-amber-700 text-sm font-bold">ลาป่วย + ลากิจ {spTimes} ครั้ง ({spDays} วัน) ในรอบนี้</p>
          </div>
        ):null}

        <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
          <p className="text-red-600 text-base font-black">
            ⚠️ หมายเหตุ: ในรอบครึ่งปี (1 รอบการประเมิน) หากลากิจ + ลาป่วย รวมกันเกิน 6 ครั้ง หรือเกิน 23 วัน ส่งผลต่อการพิจารณาเลื่อนเงินเดือน
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <h3 className="font-black text-slate-700">📋 ประวัติการลา</h3>
            <span className="text-xs text-slate-400">{filtered.length} รายการ</span>
          </div>
          {loading?<div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
            :filtered.length===0?<div className="text-center py-10 text-slate-400">ยังไม่มีรายการ</div>
            :<div className="divide-y divide-slate-100">
              {filtered.map(r=>{
                const typeCfg=LEAVE_TYPE_CONFIG[r.leave_type];
                const c=COLORS[r.leave_type]??COLORS.other;
                const canEdit=r.status==="draft"||(r.status==="pending"&&!r.approver_1_status?.includes("approved"));
                const isApproved=r.status==="approved";
                return(
                  <div key={r.id} className="px-5 py-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${c.bg} ${c.border} ${c.text}`}>{typeCfg?.icon} {typeCfg?.label}</span>
                          <span className="text-slate-400 text-xs">{r.days_count} วัน</span>
                          <StatusBadge status={r.status}/>
                        </div>
                        <span className="text-slate-700 font-bold text-sm">{toThaiDate(r.start_date)}{r.start_date!==r.end_date&&` – ${toThaiDate(r.end_date)}`}</span>
                        <span className="text-slate-400 text-xs line-clamp-1">{r.reason}</span>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <button onClick={()=>setViewId(r.id)} className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 border border-blue-200">
                            👁️ ดูใบลา
                          </button>
                          {(isApproved||canPrint)&&(
                            <button onClick={()=>printFullLeave(r)}
                              className="text-xs font-bold text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 border border-slate-200">
                              🖨️ พิมพ์
                            </button>
                          )}
                          {canEdit&&(
                            <>
                              <button onClick={()=>setEditRequest(r)} className="text-xs font-bold text-amber-600 hover:text-amber-800 px-2 py-1 rounded-lg hover:bg-amber-50 border border-amber-200">✏️ แก้ไข</button>
                              <button onClick={()=>deleteRequest(r.id)} className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 border border-red-200">🗑️ ลบ</button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex gap-1">
                          {[r.approver_1_status,r.approver_2_status,r.approver_3_status].filter(Boolean).map((s,i)=>(
                            <span key={i} className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center border ${s==="approved"?"bg-green-100 border-green-300 text-green-700":s==="rejected"?"bg-red-100 border-red-300 text-red-700":"bg-amber-100 border-amber-300 text-amber-700"}`}>{i+1}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>
      </div>

      {viewId&&(()=>{
        const r=requests.find(x=>x.id===viewId);
        if(!r) return null;
        return(
          <div className="fixed inset-0 z-[9997] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-800">รายละเอียดใบลา</h3>
                <button onClick={()=>setViewId(null)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-400">ประเภท:</span> {LEAVE_TYPE_LIST.find(t=>t.key===r.leave_type)?.icon} {LEAVE_TYPE_LIST.find(t=>t.key===r.leave_type)?.label}</p>
                <p><span className="text-slate-400">วันที่:</span> {toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</p>
                <p><span className="text-slate-400">จำนวน:</span> {r.days_count} วัน</p>
                <p><span className="text-slate-400">เหตุผล:</span> {r.reason}</p>
                {(r as any).contact_info&&<p><span className="text-slate-400">ติดต่อ:</span> {(r as any).contact_info}</p>}
                <div className="mt-3"><StatusBadge status={r.status}/></div>
                {(r as any).reject_reason && r.status === "rejected" && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 mt-2">
                    <p className="text-red-500 text-xs font-bold mb-1">❌ เหตุผลที่ไม่อนุมัติ</p>
                    <p className="text-red-700 font-bold text-sm">{(r as any).reject_reason}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={()=>printFullLeave(r)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm hover:bg-slate-50">
                  🖨️ พิมพ์
                </button>
                <button onClick={()=>setViewId(null)} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm">ปิด</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function LeaveViewModal({ r, user, canApprove, approverSigUrl, mySlotFn, onClose, onPrint, onApprove, onReject }: {
  r: any;
  user: UserProfile;
  canApprove: boolean;
  approverSigUrl: string;
  mySlotFn: (r: any) => 1|2|3|null;
  onClose: () => void;
  onPrint: () => void;
  onApprove: (id: string, slot: 1|2|3) => void;
  onReject: (id: string, slot: 1|2|3) => void;
}) {
  const typeCfg = LEAVE_TYPE_CONFIG[r.leave_type as LeaveType];
  const c = COLORS[r.leave_type] ?? COLORS.other;

  const [liveDocUrl, setLiveDocUrl] = useState<string | null>(r.document_url ?? null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await resolveAttachmentUrl(r.document_path, r.document_url);
      if (!cancelled) setLiveDocUrl(fresh);
    })();
    return () => { cancelled = true; };
  }, [r.id, r.document_path, r.document_url]);

  const slot = mySlotFn(r);
  const myStatus = slot === 1 ? r.approver_1_status
               : slot === 2 ? r.approver_2_status
               : slot === 3 ? r.approver_3_status
               : null;

  const canAct = 
    slot !== null &&
    r.status === "pending" &&
    myStatus === "pending" && 
    (
      slot === 1 ||
      (slot === 2 && r.approver_1_status === "approved") ||
      (slot === 3 && r.approver_2_status === "approved")
    );

  return (
    <div className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className={`${c.bg} border-b ${c.border} px-6 py-4 flex items-center justify-between`}>
          <div>
            <p className={`font-black text-lg ${c.text}`}>{typeCfg?.icon} {typeCfg?.label}</p>
            <p className="text-slate-500 text-sm">{fullName(r.user)}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center text-slate-600 font-bold text-lg">✕</button>
        </div>

        <div className="p-6 space-y-3 text-sm max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs font-bold mb-1">ผู้ลา</p>
              <p className="font-black text-slate-800">{fullName(r.user)}</p>
              <p className="text-slate-500 text-xs">{r.user?.position}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs font-bold mb-1">จำนวนวัน</p>
              <p className={`font-black text-2xl ${c.text}`}>{r.days_count}</p>
              <p className="text-slate-400 text-xs">
                วัน{r.half_day ? ` (ครึ่ง${r.half_day === "morning" ? "เช้า" : "บ่าย"})` : ""}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-400 text-xs font-bold mb-1">วันที่ลา</p>
            <p className="font-bold text-slate-800">{toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-400 text-xs font-bold mb-1">เหตุผล</p>
            <p className="text-slate-700">{r.reason}</p>
          </div>

          {r.contact_info && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs font-bold mb-1">ติดต่อระหว่างลา</p>
              <p className="font-bold text-slate-800">📞 {r.contact_info}</p>
            </div>
          )}

          {(liveDocUrl || r.document_url) && (
            <div className="rounded-xl border-2 border-blue-200 overflow-hidden">
              <div className="bg-blue-50 px-4 py-2 flex items-center justify-between">
                <p className="text-blue-700 font-black text-xs">📎 เอกสารแนบ</p>
                {liveDocUrl && (
                  <a href={liveDocUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 bg-white rounded-lg border border-blue-200">
                    เปิดไฟล์เต็ม ↗
                  </a>
                )}
              </div>
              {!liveDocUrl ? (
                <div className="bg-slate-50 px-4 py-6 text-center text-sm text-slate-400 animate-pulse">⏳ กำลังโหลดเอกสาร...</div>
              ) : /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(liveDocUrl) ? (
                <img
                  src={liveDocUrl}
                  alt="เอกสารแนบ"
                  className="w-full max-h-64 object-contain bg-slate-100 cursor-pointer"
                  onClick={() => window.open(liveDocUrl, "_blank")}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : /\.pdf(\?|$)/i.test(liveDocUrl) ? (
                <div className="bg-slate-50 px-4 py-6 text-center">
                  <div className="text-4xl mb-2">📄</div>
                  <p className="text-sm font-bold text-slate-600 mb-3">ไฟล์ PDF</p>
                  <a href={liveDocUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
                    📂 เปิดดู PDF
                  </a>
                </div>
              ) : (
                <div className="bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
                  <a href={liveDocUrl} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 font-bold hover:underline">
                    📎 คลิกเพื่อดูเอกสาร
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {[r.approver_1_status, r.approver_2_status, r.approver_3_status].map((s, i) => {
              if (![r.approver_1_id, r.approver_2_id, r.approver_3_id][i]) return null;
              return (
                <span key={i} className={`flex-1 py-2 rounded-xl text-xs font-black text-center border-2 ${
                  s === "approved" ? "bg-green-100 border-green-300 text-green-700" :
                  s === "rejected" ? "bg-red-100 border-red-300 text-red-700" :
                  "bg-amber-100 border-amber-300 text-amber-700"
                }`}>
                  {i + 1}. {s === "approved" ? "✅ อนุมัติ" : s === "rejected" ? "❌ ไม่อนุมัติ" : "⏳ รอ"}
                </span>
              );
            })}
          </div>

          <div><StatusBadge status={r.status} /></div>

          {r.reject_reason && r.status === "rejected" && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3">
              <p className="text-red-500 text-xs font-bold mb-1">❌ เหตุผลที่ไม่อนุมัติ</p>
              <p className="text-red-700 font-bold text-sm">{r.reject_reason}</p>
            </div>
          )}

          {canApprove && (
            <div className="pt-2">
              {!approverSigUrl ? (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3 text-center">
                  <p className="text-amber-700 font-black text-sm">⚠️ กรุณาเพิ่มลายเซ็นก่อนอนุมัติ</p>
                  <p className="text-amber-600 text-xs mt-1">ปิด modal นี้แล้วกดปุ่มลายเซ็นที่ header</p>
                </div>
              ) : canAct ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => { onApprove(r.id, slot!); onClose(); }}
                    className="flex-1 py-3.5 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-black text-base shadow-lg">
                    ✅ อนุมัติ
                  </button>
                  <button
                    onClick={() => { onReject(r.id, slot!); onClose(); }}
                    className="flex-1 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-base shadow-lg">
                    ❌ ไม่อนุมัติ
                  </button>
                </div>
              ) : myStatus && myStatus !== "pending" ? (
                <div className={`text-center py-3 rounded-2xl font-black text-base ${
                  myStatus === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {myStatus === "approved" ? "✅ คุณอนุมัติรายการนี้แล้ว" : "❌ คุณไม่อนุมัติรายการนี้แล้ว"}
                </div>
              ) : r.status !== "pending" ? (
                <div className="text-center py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm">
                  รายการนี้ {r.status === "approved" ? "อนุมัติแล้ว" : r.status === "rejected" ? "ถูกปฏิเสธแล้ว" : "ไม่อยู่ในสถานะรออนุมัติ"}
                </div>
              ) : (
                <div className="text-center py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm">
                  ไม่ใช่ลำดับการอนุมัติของคุณ
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onPrint}
            className="flex-1 py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-700 font-black text-sm hover:bg-slate-50">
            🖨️ พิมพ์
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-slate-800 text-white font-black text-sm">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ onConfirm, onClose }: {
  onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-black text-slate-800 text-lg mb-2">❌ ระบุเหตุผลที่ไม่อนุมัติ</h3>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder="กรุณาระบุเหตุผล..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-medium resize-none focus:border-red-400 focus:outline-none mb-4" />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">
            ยกเลิก
          </button>
          <button onClick={() => { if (!reason.trim()) { alert("กรุณาระบุเหตุผล"); return; } onConfirm(reason); }}
            className="flex-[2] py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm">
            ❌ ยืนยันไม่อนุมัติ
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── AdminDashboard ─────────────────────────────────────────
// [FIX-2] printFullLeaveAdmin — ดึง end_date + lastLeave ด้วย
// [FIX-3] handleApprove allApproved — ใช้ sig จาก updates ก่อนเสมอ + อัพ PDF ไป HR OneDrive
// ══════════════════════════════════════════════════════════
function AdminDashboard({ user, canApprove }: { user: UserProfile; canApprove: boolean }) {
  const [requests,     setRequests]     = useState<LeaveRequest[]>([]);
  const [filterFY,     setFilterFY]     = useState(getCurrentFiscalYear());
  const [filterEval,   setFilterEval]   = useState<"all"|"1"|"2">("all");
  const [filterType,   setFilterType]   = useState<LeaveType|"all">("all");
  const [filterStatus, setFilterStatus] = useState<LeaveStatus|"all">("pending");
  const [filterGrade,  setFilterGrade]  = useState("all");
  const [tab,          setTab]          = useState<"pending"|"history"|"official"|"graph"|"summary">("pending");
  const [loading,      setLoading]      = useState(true);
  const [showApproverSigPad, setShowApproverSigPad] = useState(false);
  const [approverSigUrl,     setApproverSigUrl]     = useState(user.signature_url || "");
  const [pendingApproveId, setPendingApproveId] = useState<{id:string;slot:1|2|3;action:"approved"|"rejected"}|null>(null);
  const [viewModal, setViewModal] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<{id:string; slot:1|2|3} | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leave_requests")
      .select(`
        *,
        user:users!leave_requests_user_id_fkey(
          title, first_name, last_name, position, email, grade_level, phone, signature_url
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      const { data: requests } = await supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
      if (requests) {
        const userIds = [...new Set(requests.map(r => r.user_id))];
        const { data: users } = await supabase.from("users").select("id, title, first_name, last_name, position, email, grade_level, phone, signature_url").in("id", userIds);
        const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
        setRequests(requests.map(r => ({ ...r, user: userMap[r.user_id] || null })) as LeaveRequest[]);
      }
      setLoading(false);
      return;
    }
    setRequests((data as LeaveRequest[]) || []);
    setLoading(false);
  }, []);

  useEffect(()=>{ loadAll(); },[loadAll]);

  useEffect(() => {
    if (viewModal) {
      const updated = requests.find(r => r.id === viewModal.id);
      if (updated) setViewModal(updated);
    }
  }, [requests]);

  useEffect(()=>{
    if(user.signature_url) setApproverSigUrl(user.signature_url);
  },[user.signature_url]);

  async function saveApproverSignature(dataUrl: string) {
    setApproverSigUrl(dataUrl);
    setShowApproverSigPad(false);
    const { error } = await (supabase.from("users") as any).update({ signature_url: dataUrl }).eq("id", user.id);
    if (error) { alert("⚠️ บันทึกลายเซ็นไม่สำเร็จ: " + error.message); return; }
    if (pendingApproveId) {
      handleApprove(pendingApproveId.id, pendingApproveId.slot, pendingApproveId.action);
    }
  }

  function tryApprove(id: string, slot: 1|2|3, action: "approved"|"rejected") {
    if (action === "rejected") { setRejectModal({ id, slot }); return; }
    if (action === "approved" && !approverSigUrl && slot !== 3) {
      setPendingApproveId({ id, slot, action });
      setShowApproverSigPad(true);
      return;
    }
    handleApprove(id, slot, action);
  }

  async function handleApprove(id: string, slotNum: 1|2|3, action: "approved"|"rejected",
    reason?: string, comment?: string) {
    const req = requests.find(r => r.id === id)!;
    const now = new Date();
    const approvedAtStr = now.toLocaleDateString("th-TH", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok"
    });

    const updates: any = {
      [`approver_${slotNum}_status`]: action,
      [`approver_${slotNum}_id`]: user.id,
    };
    if (comment) updates[`approver_${slotNum}_comment`] = comment;
    if (action === "approved") {
      updates[`approver_${slotNum}_signature`] = approverSigUrl;
      updates[`approver_${slotNum}_approved_at`] = approvedAtStr;
    }
    if (action === "rejected" && reason) {
      updates[`approver_${slotNum}_reject_reason`] = reason;
      updates.reject_reason = reason;
    }

    const s1 = slotNum === 1 ? action : req.approver_1_status;
    const s2 = slotNum === 2 ? action : req.approver_2_status;
    const s3 = slotNum === 3 ? action : req.approver_3_status;

    const teacherName  = fullName((req as any).user);
    const typeCfg      = LEAVE_TYPE_CONFIG[req.leave_type];
    const teacherEmail = (req as any).user?.email;

    if (action === "rejected") {
      updates.status = "rejected";
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [teacherEmail, HR_EMAIL].filter(Boolean),
          subject: `[ไม่อนุมัติ] ใบลา ${teacherName} · ${typeCfg?.label}`,
          html: `
            <div style="font-family:Sarabun,Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:24px;border-radius:12px 12px 0 0;color:white">
                <h2 style="margin:0">❌ ใบลาไม่ได้รับการอนุมัติ</h2>
              </div>
              <div style="padding:24px;background:white;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:8px 0;color:#64748b;width:120px">ผู้ลา</td><td style="font-weight:700">${teacherName}</td></tr>
                  <tr><td style="padding:8px 0;color:#64748b">ประเภท</td><td>${typeCfg?.icon} ${typeCfg?.label}</td></tr>
                  <tr><td style="padding:8px 0;color:#64748b">วันที่</td><td>${toThaiDate(req.start_date)} – ${toThaiDate(req.end_date)}</td></tr>
                  <tr><td style="padding:8px 0;color:#64748b">จำนวน</td><td>${req.days_count} วัน</td></tr>
                  <tr><td style="padding:8px 0;color:#dc2626">เหตุผลที่ไม่อนุมัติ</td><td style="font-weight:700;color:#dc2626">${reason || "-"}</td></tr>
                </table>
                <p style="margin-top:16px;font-size:12px;color:#94a3b8">อีเมลนี้ส่งโดยอัตโนมัติ · ${now.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</p>
              </div>
            </div>`,
        }),
      }).catch(console.warn);
    } else {
      const allApproved = s1 === "approved" && s2 === "approved" && s3 === "approved";
      if (allApproved) {
        updates.status = "approved";

        try {
          const reqUser = (req as any).user;

          // [FIX-3] ใช้ค่าจาก updates ก่อนเสมอ เพื่อให้ลายเซ็น slot ที่เพิ่งกดอนุมัติ (slotNum) ปรากฏในใบลาด้วย
          const sig1 = slotNum === 1 ? (updates.approver_1_signature ?? (req as any).approver_1_signature) : (req as any).approver_1_signature;
          const sig2 = slotNum === 2 ? (updates.approver_2_signature ?? (req as any).approver_2_signature) : (req as any).approver_2_signature;
          const sig3 = slotNum === 3 ? (updates.approver_3_signature ?? (req as any).approver_3_signature) : (req as any).approver_3_signature;
          const at1  = slotNum === 1 ? (updates.approver_1_approved_at ?? (req as any).approver_1_approved_at) : (req as any).approver_1_approved_at;
          const at2  = slotNum === 2 ? (updates.approver_2_approved_at ?? (req as any).approver_2_approved_at) : (req as any).approver_2_approved_at;
          const at3  = slotNum === 3 ? (updates.approver_3_approved_at ?? (req as any).approver_3_approved_at) : (req as any).approver_3_approved_at;

          const leaveData = {
            fullName: fullName(reqUser),
            position: reqUser?.position,
            leaveType: req.leave_type,
            leaveTypeName: LEAVE_TYPE_CONFIG[req.leave_type]?.label ?? "",
            otherLeaveName: (req as any).other_leave_name,
            startDate: req.start_date,
            endDate: req.end_date,
            days: req.days_count,
            halfDay: (req as any).half_day,
            reason: req.reason,
            phone: reqUser?.phone,
            contactInfo: (req as any).contact_info,
          };

          const approverSigs = [
            { name:"นางสาวพรรษา แก้วใหญ่", position:"ครู ตรวจสอบสถิติการลา",
              signature_url: sig1, approved_at: at1 },
            { name:"นางสาวฐิติมา กาบแก้ว", position:"รองผู้อำนวยการกลุ่มบริหารงานบุคคล",
              signature_url: sig2, approved_at: at2 },
            { name:"นายธนณัฐ ศิระวงษ์", position:"ผู้อำนวยการโรงเรียนวัดเขียนเขต",
              signature_url: sig3, approved_at: at3 },
          ];

          // [FIX-2] ดึงสถิติ + lastLeave ก่อนสร้าง HTML
          const fy = getCurrentFiscalYear();
          const { data: statsData } = await supabase
            .from("leave_requests")
            .select("id, leave_type, days_count, start_date, end_date, status")
            .eq("user_id", req.user_id)
            .not("status", "in", '("rejected","cancelled","draft")');

          const fyStats = (statsData || []).filter((x: any) =>
            isInFiscalYear(x.start_date, fy) && x.id !== req.id
          );
          const lastLeaveReq = fyStats
            .filter((x: any) => x.leave_type !== "official")
            .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

          const leaveStats: LeaveStats = {
            sick:      fyStats.filter((x:any) => x.leave_type === "sick").reduce((s:number,x:any) => s + Number(x.days_count), 0),
            personal:  fyStats.filter((x:any) => ["personal","other","ordination"].includes(x.leave_type)).reduce((s:number,x:any) => s + Number(x.days_count), 0),
            maternity: fyStats.filter((x:any) => x.leave_type === "maternity").reduce((s:number,x:any) => s + Number(x.days_count), 0),
            lastLeave: lastLeaveReq ? {
              type: lastLeaveReq.leave_type,
              startDate: lastLeaveReq.start_date,
              endDate: lastLeaveReq.end_date,
              days: Number(lastLeaveReq.days_count),
            } : null,
          };

          // resolve เอกสารแนบให้สดก่อนใส่ใน PDF
          const freshDocUrl = await resolveAttachmentUrl((req as any).document_path, (req as any).document_url);

          const html = buildLeaveHTML(leaveData, reqUser?.signature_url || "", approverSigs, freshDocUrl ?? undefined, leaveStats);

          const dd = String(now.getDate()).padStart(2,"0");
          const mm = String(now.getMonth()+1).padStart(2,"0");
          const yyyyBE = now.getFullYear()+543;
          const firstName = reqUser?.first_name || fullName(reqUser).split(" ")[0] || "ไม่ระบุ";
          const lastName  = reqUser?.last_name  || fullName(reqUser).split(" ").slice(-1)[0] || "";
          const fileName  = `${dd}${mm}${yyyyBE}_${firstName}_${lastName}.pdf`;

          const pdfRes = await fetch("/api/html-to-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html }),
          });

          if (pdfRes.ok) {
            const pdfBlob = await pdfRes.blob();
            const formData = new FormData();
            formData.append("file", pdfBlob, fileName);
            // [FIX-3] อัพ PDF ที่อนุมัติแล้วไปโฟลเดอร์ HR บน OneDrive
            formData.append("path", `ใบลา/${fileName}`); 
            formData.append("account", HR_EMAIL); // ระบุ account HR (ถ้า API รองรับ)

            const uploadRes = await fetch("/api/upload-onedrive", { method: "POST", body: formData });
            if (!uploadRes.ok) {
              console.warn("PDF upload to HR OneDrive failed:", await uploadRes.text());
            }
          }
        } catch (err) {
          console.warn("PDF build/upload failed:", err);
        }
      }
    }

    const { error } = await (supabase.from("leave_requests") as any).update(updates).eq("id", id);
    if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return; }
    await loadAll();
    setPendingApproveId(null);
    if (viewModal?.id === id) setViewModal(null);
  }

  function mySlot(r: LeaveRequest): 1|2|3|null {
    return approverSlotByEmail(user.email);
  }

  // [FIX-2] printFullLeaveAdmin — ดึง end_date + lastLeave ด้วย
  async function printFullLeaveAdmin(r: any) {
    const fy = getCurrentFiscalYear();
    const reqUser = r.user;
    const { data: statsData } = await supabase
      .from("leave_requests")
      .select("id, leave_type, days_count, start_date, end_date, status")
      .eq("user_id", r.user_id)
      .not("status", "in", '("rejected","cancelled","draft")');

    const fyData = (statsData || []).filter((x: any) => isInFiscalYear(x.start_date, fy) && x.id !== r.id);
    const lastLeaveReq = fyData
      .filter((x: any) => x.leave_type !== "official")
      .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

    const stats: LeaveStats = {
      sick:      fyData.filter((x:any) => x.leave_type === "sick").reduce((s:number,x:any) => s + Number(x.days_count), 0),
      personal:  fyData.filter((x:any) => ["personal","other","ordination"].includes(x.leave_type)).reduce((s:number,x:any) => s + Number(x.days_count), 0),
      maternity: fyData.filter((x:any) => x.leave_type === "maternity").reduce((s:number,x:any) => s + Number(x.days_count), 0),
      lastLeave: lastLeaveReq ? {
        type: lastLeaveReq.leave_type,
        startDate: lastLeaveReq.start_date,
        endDate: lastLeaveReq.end_date,
        days: Number(lastLeaveReq.days_count),
      } : null,
    };

    await printLeaveAsync(
      {
        fullName: fullName(reqUser),
        position: reqUser?.position,
        leaveType: r.leave_type,
        leaveTypeName: LEAVE_TYPE_CONFIG[r.leave_type as LeaveType]?.label ?? "",
        otherLeaveName: r.other_leave_name,
        startDate: r.start_date,
        endDate: r.end_date,
        days: r.days_count,
        halfDay: r.half_day,
        reason: r.reason,
        phone: reqUser?.phone,
        contactInfo: r.contact_info,
      },
      reqUser?.signature_url || "",
      [
        { name:"นางสาวพรรษา แก้วใหญ่", position:"ครู ตรวจสอบสถิติการลา",
          signature_url: r.approver_1_signature, approved_at: r.approver_1_approved_at },
        { name:"นางสาวฐิติมา กาบแก้ว", position:"รองผู้อำนวยการกลุ่มบริหารงานบุคคล",
          signature_url: r.approver_2_signature, approved_at: r.approver_2_approved_at },
        { name:"นายธนณัฐ ศิระวงษ์", position:"ผู้อำนวยการโรงเรียนวัดเขียนเขต",
          signature_url: r.approver_3_signature, approved_at: r.approver_3_approved_at },
      ],
      r.document_url,
      r.document_path,
      stats
    );
  }

  const fyAll = requests.filter(r=>isInFiscalYear(r.start_date,filterFY)&&r.status!=="cancelled");
  const summaryByType = Object.fromEntries((Object.keys(LEAVE_TYPE_CONFIG) as LeaveType[]).map(t=>[t,{approved:fyAll.filter(r=>r.leave_type===t&&r.status==="approved").reduce((s,r)=>s+Number(r.days_count),0),pending:fyAll.filter(r=>r.leave_type===t&&r.status==="pending").length}])) as Record<LeaveType,{approved:number;pending:number}>;
  const pendingList = requests.filter(r=>r.status==="pending");
  const allGrades   = ["all",...Array.from(new Set(requests.map(r=>(r as any).user?.grade_level).filter(Boolean)))];

  const totalRequests = fyAll.length;
  const totalApproved = fyAll.filter(r=>r.status==="approved").length;
  const totalPending  = fyAll.filter(r=>r.status==="pending").length;

  const TH_MONTHS = ["ต.ค.","พ.ย.","ธ.ค.","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย."];
  const graphData = TH_MONTHS.map((month,i)=>{
    const calMonth=i<3?i+10:i-2; const calYear=i<3?filterFY-1:filterFY;
    const mr=requests.filter(r=>{const d=new Date(r.start_date);return d.getFullYear()===calYear&&(d.getMonth()+1)===calMonth&&r.status!=="cancelled"&&(filterGrade==="all"||(r as any).user?.grade_level===filterGrade);});
    return{month,"ลาป่วย":mr.filter(r=>r.leave_type==="sick").reduce((s,r)=>s+Number(r.days_count),0),"ลากิจ":mr.filter(r=>r.leave_type==="personal").reduce((s,r)=>s+Number(r.days_count),0),"ไปราชการ":mr.filter(r=>r.leave_type==="official").reduce((s,r)=>s+Number(r.days_count),0),"อื่นๆ":mr.filter(r=>!["sick","personal","official"].includes(r.leave_type)).reduce((s,r)=>s+Number(r.days_count),0)};
  });

  const historyList = requests.filter(r=>isInFiscalYear(r.start_date,filterFY)&&(filterType==="all"||r.leave_type===filterType)&&(filterStatus==="all"||r.status===filterStatus)&&(filterEval==="all"||getEvalRound(r.start_date)===filterEval)&&(filterGrade==="all"||(r as any).user?.grade_level===filterGrade));
  const officialList = requests.filter(r=>r.leave_type==="official"&&isInFiscalYear(r.start_date,filterFY));

  const slot = approverSlotByEmail(user.email);
  const roleDisplay = canApprove
    ? slot===1 ? "👤 ผู้อนุมัติลำดับที่ 1" : slot===2 ? "👤 ผู้อนุมัติลำดับที่ 2" : "👤 ผู้อนุมัติลำดับที่ 3"
    : user.email===HR_EMAIL ? "📋 ฝ่ายบุคคล (HR)" : "🔧 ผู้ดูแลระบบ";

  return (
    <div className="min-h-screen">
      {showApproverSigPad && (
        <SignaturePad
          initialUrl={approverSigUrl}
          title="✍️ ลายเซ็นผู้อนุมัติ"
          onSave={saveApproverSignature}
          onClose={() => { setShowApproverSigPad(false); setPendingApproveId(null); }}
        />
      )}
      {viewModal && (
        <LeaveViewModal
          r={viewModal}
          user={user}
          canApprove={canApprove}
          approverSigUrl={approverSigUrl}
          mySlotFn={mySlot}
          onClose={() => setViewModal(null)}
          onPrint={() => printFullLeaveAdmin(viewModal)}
          onApprove={(id, slot) => tryApprove(id, slot, "approved")}
          onReject={(id, slot) => setRejectModal({ id, slot })}
        />
      )}
      {rejectModal && (
        <RejectModal
          onConfirm={(reason) => {
            handleApprove(rejectModal.id, rejectModal.slot, "rejected", reason);
            setRejectModal(null);
          }}
          onClose={() => setRejectModal(null)}
        />
      )}

      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 px-6 py-8 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-indigo-200 text-sm font-bold">{roleDisplay}</p>
          <h2 className="text-3xl font-black">{fullName(user)}</h2>
          <p className="text-indigo-200">{user.email}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <select value={filterFY} onChange={e=>setFilterFY(Number(e.target.value))} className="bg-white/20 border border-white/30 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:outline-none">
            {[0,1,2].map(i=>{const fy=getCurrentFiscalYear()-i;return<option key={fy} value={fy} className="text-slate-800">{fiscalYearLabel(fy)}</option>;})}
          </select>
          {canApprove && (
            <button onClick={()=>setShowApproverSigPad(true)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black border-2 ${approverSigUrl?"bg-white/20 border-white/40 text-white":"bg-amber-400 border-amber-300 text-amber-900 animate-pulse"}`}>
              {approverSigUrl ? "✅ ลายเซ็นพร้อมแล้ว — คลิกเปลี่ยน" : "⚠️ เพิ่มลายเซ็นก่อนอนุมัติ"}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 text-center shadow-sm">
            <div className="text-3xl font-black text-slate-800">{totalRequests}</div>
            <div className="text-slate-500 text-xs font-bold mt-1">คำขอลาทั้งหมด</div>
            <div className="text-slate-400 text-[10px]">{fiscalYearLabel(filterFY)}</div>
          </div>
          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center shadow-sm">
            <div className="text-3xl font-black text-green-700">{totalApproved}</div>
            <div className="text-green-600 text-xs font-bold mt-1">อนุมัติแล้ว</div>
            <div className="text-green-400 text-[10px]">{totalRequests > 0 ? Math.round(totalApproved/totalRequests*100) : 0}% ของทั้งหมด</div>
          </div>
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center shadow-sm">
            <div className="text-3xl font-black text-amber-700">{totalPending}</div>
            <div className="text-amber-600 text-xs font-bold mt-1">รออนุมัติ</div>
            <div className="text-amber-400 text-[10px]">ต้องดำเนินการ</div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(["all","1","2"] as const).map(v=>(
            <button key={v} onClick={()=>setFilterEval(v)} className={`px-4 py-2 rounded-xl text-sm font-black border-2 ${filterEval===v?"bg-indigo-500 border-indigo-500 text-white":"bg-white border-slate-200 text-slate-600"}`}>
              {v==="all"?"ทุกรอบ":v==="1"?"รอบ 1 (ต.ค.–มี.ค.)":"รอบ 2 (เม.ย.–ก.ย.)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {(Object.entries(LEAVE_TYPE_CONFIG) as [LeaveType,any][]).map(([type,cfg])=>{
            const stats=summaryByType[type]; const c=COLORS[type]??COLORS.other;
            return(
              <div key={type} className={`bg-white border-2 ${c.border} rounded-2xl p-3 text-center shadow-sm`}>
                <div className="text-2xl mb-1">{cfg.icon}</div>
                <div className={`text-2xl font-black ${c.text}`}>{stats.approved}</div>
                <div className="text-slate-500 text-[10px] font-bold mt-0.5 leading-tight">{cfg.label}</div>
                {stats.pending>0&&<div className="mt-1 text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-300 rounded-lg px-1 py-0.5">รอ {stats.pending}</div>}
              </div>
            );
          })}
        </div>

        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          {[["pending","⏳ รออนุมัติ"],["history","📋 ทั้งหมด"],["summary","👥 รายบุคคล"],["official","🏛️ ไปราชการ"],["graph","📊 กราฟ"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k as any)} className={`flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-1 ${tab===k?"bg-white text-slate-800 shadow border border-slate-200":"text-slate-500 hover:text-slate-700"}`}>
              {l}{k==="pending"&&pendingList.length>0&&<span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{pendingList.length}</span>}
            </button>
          ))}
        </div>

        {tab==="pending"&&(
          <div className="space-y-3">
            {canApprove && !approverSigUrl && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">✍️</span>
                <div className="flex-1">
                  <p className="font-black text-amber-700">ต้องเพิ่มลายเซ็นก่อนอนุมัติ</p>
                  <p className="text-amber-600 text-sm">กรุณาเพิ่มลายเซ็นของคุณก่อน จึงจะสามารถกดอนุมัติได้</p>
                </div>
                <button onClick={()=>setShowApproverSigPad(true)} className="px-4 py-2.5 rounded-xl bg-amber-500 text-white font-black text-sm">✍️ เพิ่มลายเซ็น</button>
              </div>
            )}
            {!canApprove && (
              <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">👁️</span>
                <p className="text-slate-600 font-bold text-sm">คุณมีสิทธิ์ดูและพิมพ์ใบลาเท่านั้น ไม่สามารถกดอนุมัติได้</p>
              </div>
            )}
            {loading ? <div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
              : pendingList.length===0 ? <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">✅ ไม่มีรายการรออนุมัติ</div>
              : pendingList.map(r=>{
                const typeCfg = LEAVE_TYPE_CONFIG[r.leave_type];
                const c = COLORS[r.leave_type]??COLORS.other;
                const sl = mySlot(r);
                const myStatus = sl===1?r.approver_1_status:sl===2?r.approver_2_status:sl===3?r.approver_3_status:null;
                const canAct = canApprove
                  && sl !== null
                  && myStatus === "pending"
                  && (sl === 1 || (sl === 2 && r.approver_1_status === "approved"))
                  && (sl === 1 || sl === 2 || (sl === 3 && r.approver_2_status === "approved"));

                return(
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className={`${c.bg} border-b ${c.border} px-5 py-3 flex items-center justify-between`}>
                      <span className={`font-black text-sm ${c.text}`}>{typeCfg?.icon} {typeCfg?.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-sm ${c.text}`}>{r.days_count} วัน</span>
                        <button onClick={()=>printFullLeaveAdmin(r)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white border border-slate-300 font-bold">🖨️ พิมพ์</button>
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="font-black text-slate-800 text-base">{fullName((r as any).user)}</p>
                      <p className="text-slate-500 text-sm">{(r as any).user?.position}</p>
                      <p className="text-slate-600 text-sm font-bold mt-2">{toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</p>
                      <p className="text-slate-400 text-sm mt-1 line-clamp-2">{r.reason}</p>
                      {(r as any).contact_info&&<p className="text-xs text-slate-500 mt-1">📞 {(r as any).contact_info}</p>}
                      {(r as any).document_url&&(
                        <a href={(r as any).document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200">
                          📎 ดูเอกสารแนบ
                        </a>
                      )}
                      <button onClick={() => setViewModal(r)} className="w-full mt-3 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-black text-sm hover:bg-blue-100 flex items-center justify-center gap-2">
                        👁️ ดูใบลาและเอกสารแนบ / อนุมัติ
                      </button>
                      <div className="flex gap-2 mt-3">
                        {[r.approver_1_status,r.approver_2_status,r.approver_3_status].map((s,i)=>{
                          if(![r.approver_1_id,r.approver_2_id,r.approver_3_id][i])return null;
                          return<span key={i} className={`w-7 h-7 rounded-full border-2 text-xs font-black flex items-center justify-center ${s==="approved"?"bg-green-100 border-green-300 text-green-700":s==="rejected"?"bg-red-100 border-red-300 text-red-700":"bg-amber-100 border-amber-300 text-amber-700"}`}>{i+1}</span>;
                        })}
                      </div>
                      {canAct && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => tryApprove(r.id, sl!, "approved")}
                            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-black text-sm">
                            ✅ อนุมัติ
                          </button>
                          <button onClick={() => setRejectModal({ id: r.id, slot: sl! })}
                            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm">
                            ❌ ไม่อนุมัติ
                          </button>
                        </div>
                      )}
                      {canApprove && sl && myStatus && myStatus!=="pending" && (
                        <div className={`mt-3 text-center text-sm font-black py-2 rounded-xl ${myStatus==="approved"?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>
                          {myStatus==="approved"?"✅ คุณอนุมัติแล้ว":"❌ คุณไม่อนุมัติ"}
                        </div>
                      )}
                      {canApprove && !sl && (
                        <p className="mt-3 text-xs text-slate-400 text-center">คุณไม่ใช่ผู้อนุมัติในรายการนี้</p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {tab==="history"&&(
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <select value={filterGrade} onChange={e=>setFilterGrade(e.target.value)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
                {allGrades.map(g => (
                  <option key={g} value={g}>{g === "all" ? "ทุกสายชั้น" : GRADE_LABEL[g] ?? g}</option>
                ))}
              </select>
              <select value={filterType} onChange={e=>setFilterType(e.target.value as any)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
                <option value="all">ทุกประเภท</option>
                {(Object.entries(LEAVE_TYPE_CONFIG) as any[]).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
                <option value="all">ทุกสถานะ</option>
                {(Object.entries(LEAVE_STATUS_CONFIG) as any[]).map(([k,v])=><option key={k} value={k}>{(v as any).icon} {(v as any).label}</option>)}
              </select>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading?<div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
                :historyList.length===0?<div className="text-center py-10 text-slate-400">ไม่พบข้อมูล</div>
                :<div className="divide-y divide-slate-100">
                  {historyList.map(r=>{
                    const typeCfg=LEAVE_TYPE_CONFIG[r.leave_type]; const c=COLORS[r.leave_type]??COLORS.other;
                    return(
                      <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap hover:bg-slate-50">
                        <div>
                          <p className="font-black text-slate-800 text-sm">{fullName((r as any).user)}</p>
                          <p className="text-slate-500 text-xs">{(r as any).user?.position} {(r as any).user?.grade_level ? `· ${GRADE_LABEL[(r as any).user.grade_level] ?? (r as any).user.grade_level}` : ""}</p>
                          <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-lg border ${c.bg} ${c.border} ${c.text}`}>{typeCfg?.icon} {typeCfg?.label} · {r.days_count} วัน</span>
                          <p className="text-slate-400 text-xs mt-1">{toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</p>
                          {(r as any).document_url&&(
                            <a href={(r as any).document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-blue-500 hover:text-blue-700">📎 เอกสารแนบ</a>
                          )}
                          <button onClick={() => setViewModal(r)} className="text-xs font-bold text-blue-600 px-2 py-1 rounded-lg border border-blue-200 hover:bg-blue-50 ml-1">
                            👁️ ดู
                          </button>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <StatusBadge status={r.status}/>
                          <button onClick={()=>printFullLeaveAdmin(r)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white border border-slate-300 font-bold">🖨️ พิมพ์</button>
                        </div>
                      </div>
                    );
                  })}
                </div>}
            </div>
          </div>
        )}

        {tab==="summary" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b px-5 py-3">
              <h3 className="font-black text-slate-700">👥 สรุปการลารายบุคคล {fiscalYearLabel(filterFY)}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="text-left px-4 py-3 font-black text-slate-600">ชื่อ-สกุล</th>
                    <th className="text-left px-4 py-3 font-black text-slate-600">ตำแหน่ง</th>
                    <th className="text-center px-3 py-3 font-black text-red-600">🤒 ลาป่วย</th>
                    <th className="text-center px-3 py-3 font-black text-amber-600">📋 ลากิจ</th>
                    <th className="text-center px-3 py-3 font-black text-pink-600">👶 ลาคลอด</th>
                    <th className="text-center px-3 py-3 font-black text-sky-600">🏛️ ราชการ</th>
                    <th className="text-center px-3 py-3 font-black text-violet-600">🙏 อุปสมบท</th>
                    <th className="text-center px-3 py-3 font-black text-slate-600">📌 อื่นๆ</th>
                    <th className="text-center px-3 py-3 font-black text-slate-800">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const byUser = new Map<string, any>();
                    fyAll.filter(r => r.status !== "rejected" && r.status !== "cancelled").forEach(r => {
                      const uid = r.user_id;
                      if (!byUser.has(uid)) byUser.set(uid, {
                        user: (r as any).user,
                        sick: 0, personal: 0, maternity: 0,
                        official: 0, ordination: 0, other: 0, total: 0
                      });
                      const row = byUser.get(uid);
                      const days = Number(r.days_count);
                      row[r.leave_type] = (row[r.leave_type] ?? 0) + days;
                      row.total += days;
                    });
                    return Array.from(byUser.values())
                      .sort((a, b) => b.total - a.total)
                      .map((row, i) => (
                        <tr key={i} className={`hover:bg-slate-50 ${row.sick + row.personal > 15 ? "bg-red-50" : ""}`}>
                          <td className="px-4 py-3 font-bold text-slate-800">{fullName(row.user)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{row.user?.position}</td>
                          <td className="px-3 py-3 text-center"><span className={`font-black ${row.sick > 0 ? "text-red-600" : "text-slate-300"}`}>{row.sick || "-"}</span></td>
                          <td className="px-3 py-3 text-center"><span className={`font-black ${row.personal > 0 ? "text-amber-600" : "text-slate-300"}`}>{row.personal || "-"}</span></td>
                          <td className="px-3 py-3 text-center"><span className={`font-black ${row.maternity > 0 ? "text-pink-600" : "text-slate-300"}`}>{row.maternity || "-"}</span></td>
                          <td className="px-3 py-3 text-center"><span className={`font-black ${row.official > 0 ? "text-sky-600" : "text-slate-300"}`}>{row.official || "-"}</span></td>
                          <td className="px-3 py-3 text-center"><span className={`font-black ${row.ordination > 0 ? "text-violet-600" : "text-slate-300"}`}>{row.ordination || "-"}</span></td>
                          <td className="px-3 py-3 text-center"><span className={`font-black ${row.other > 0 ? "text-slate-600" : "text-slate-300"}`}>{row.other || "-"}</span></td>
                          <td className="px-3 py-3 text-center"><span className={`font-black text-base ${row.total > 20 ? "text-red-600" : "text-slate-800"}`}>{row.total}</span></td>
                        </tr>
                      ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==="official"&&(
          <div className="space-y-3">
            {officialList.length===0?<div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">ไม่มีข้อมูล</div>
              :officialList.map(r=>{
                const dest=r.reason?.match(/\[ปลายทาง: (.+?)\]/)?.[1]??"-";
                const veh=r.reason?.match(/\[พาหนะ: (.+?)\]/)?.[1]??"-";
                const comp=r.reason?.match(/\[ผู้ร่วมเดินทาง: (.+?)\]/)?.[1]??"-";
                return(
                  <div key={r.id} className="bg-white rounded-2xl border border-sky-200 shadow-sm overflow-hidden">
                    <div className="bg-sky-50 border-b border-sky-200 px-5 py-3 flex items-center justify-between">
                      <div><p className="font-black text-slate-800">{fullName((r as any).user)}</p><p className="text-slate-500 text-xs">{(r as any).user?.position}</p></div>
                      <StatusBadge status={r.status}/>
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-slate-400 font-bold">วันที่:</span> {toThaiDate(r.start_date)} – {toThaiDate(r.end_date)}</div>
                      <div><span className="text-slate-400 font-bold">จำนวน:</span> <span className="text-sky-600 font-black">{r.days_count} วัน</span></div>
                      <div><span className="text-slate-400 font-bold">ปลายทาง:</span> {dest}</div>
                      <div><span className="text-slate-400 font-bold">พาหนะ:</span> {veh}</div>
                      <div className="col-span-2"><span className="text-slate-400 font-bold">ผู้ร่วม:</span> {comp}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {tab==="graph"&&(
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h4 className="font-black text-slate-700">📊 สถิติการลารายเดือน {fiscalYearLabel(filterFY)}</h4>
              <select value={filterGrade} onChange={e=>setFilterGrade(e.target.value)} className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
                {allGrades.map(g=><option key={g} value={g}>{g==="all"?"📊 ภาพรวมทั้งโรงเรียน":"สายชั้น: "+g}</option>)}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={graphData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="month" tick={{fontSize:11}}/>
                <YAxis tick={{fontSize:11}}/>
                <Tooltip contentStyle={{fontFamily:"Sarabun",fontSize:13,borderRadius:12}} formatter={(v:any,n:any)=>[`${v??0} วัน`,n]}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="ลาป่วย"   fill="#ef4444" radius={[4,4,0,0]}/>
                <Bar dataKey="ลากิจ"    fill="#f59e0b" radius={[4,4,0,0]}/>
                <Bar dataKey="ไปราชการ" fill="#3b82f6" radius={[4,4,0,0]}/>
                <Bar dataKey="อื่นๆ"    fill="#8b5cf6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[{label:"ลาป่วย",val:graphData.reduce((s,d)=>s+d["ลาป่วย"],0),color:"text-red-600",bg:"bg-red-50",border:"border-red-200"},{label:"ลากิจ",val:graphData.reduce((s,d)=>s+d["ลากิจ"],0),color:"text-amber-600",bg:"bg-amber-50",border:"border-amber-200"},{label:"ไปราชการ",val:graphData.reduce((s,d)=>s+d["ไปราชการ"],0),color:"text-blue-600",bg:"bg-blue-50",border:"border-blue-200"},{label:"รวมทั้งหมด",val:graphData.reduce((s,d)=>s+d["ลาป่วย"]+d["ลากิจ"]+d["ไปราชการ"]+d["อื่นๆ"],0),color:"text-slate-700",bg:"bg-slate-50",border:"border-slate-200"}].map(st=>(
                <div key={st.label} className={`${st.bg} border-2 ${st.border} rounded-xl p-3 text-center`}>
                  <div className={`text-2xl font-black ${st.color}`}>{st.val}</div>
                  <div className="text-xs text-slate-500 font-bold mt-0.5">{st.label} (วัน)</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── ApproverPage ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════
function ApproverPage({ user, approvers, allTeachers, savedSignature }: {
  user: UserProfile;
  approvers: ApproverInfo[];
  allTeachers: UserProfile[];
  savedSignature: string;
}) {
  const [mode, setMode] = useState<"admin"|"leave">("admin");
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm px-4 py-2 flex items-center gap-2 justify-end">
        <span className="text-xs text-slate-400 font-bold mr-auto">โหมด:</span>
        <button onClick={()=>setMode("admin")} className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${mode==="admin"?"bg-indigo-600 border-indigo-600 text-white":"bg-white border-slate-200 text-slate-600 hover:bg-indigo-50"}`}>
          🏛️ หน้าฝ่ายบริหาร
        </button>
        <button onClick={()=>setMode("leave")} className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-all ${mode==="leave"?"bg-blue-600 border-blue-600 text-white":"bg-white border-slate-200 text-slate-600 hover:bg-blue-50"}`}>
          ✍️ บันทึกการลา
        </button>
      </div>
      {mode==="admin" ? (
        <AdminDashboard user={user} canApprove={true} />
      ) : (
        <TeacherDashboard user={user} approvers={approvers} allTeachers={allTeachers} savedSignature={savedSignature} canPrint={true}/>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── Main Page ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════
export default function LeavePage(){
  const router=useRouter();
  const [user,           setUser]           = useState<UserProfile|null>(null);
  const [approvers,      setApprovers]      = useState<ApproverInfo[]>([]);
  const [allTeachers,    setAllTeachers]    = useState<UserProfile[]>([]);
  const [savedSignature, setSavedSignature] = useState("");
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      let { data } = await supabase.from("users")
        .select("id, title, first_name, last_name, email, role, position, signature_url, grade_level, phone")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (!data) {
        const email = authUser.email || authUser.user_metadata?.email || "";
        if (email) {
          const res = await supabase.from("users")
            .select("id, title, first_name, last_name, email, role, position, signature_url, grade_level, phone")
            .eq("email", email)
            .maybeSingle();
          data = res.data;
          if (data) await supabase.from("users").update({ auth_id: authUser.id }).eq("id", data.id);
        }
      }

      if (data) {
        const profile: UserProfile = {
          ...data,
          full_name: (data as any).full_name || `${data.title ?? ""} ${data.first_name ?? ""} ${data.last_name ?? ""}`.replace(/\s+/g, " ").trim(),
        };
        setUser(profile);
        if (data.signature_url) setSavedSignature(data.signature_url);
      }

      const { data: teachers } = await supabase
        .from("users")
        .select("id, title, first_name, last_name, position, email, role")
        .order("first_name");
      setAllTeachers((teachers as UserProfile[]) || []);

      const approverEmails = [APPROVER_1_EMAIL, APPROVER_2_EMAIL, APPROVER_3_EMAIL];
      const approverList: ApproverInfo[] = [];
      for (const email of approverEmails) {
        const found = (teachers || []).find((t: any) => t.email === email);
        if (found) {
          approverList.push({
            id: (found as any).id,
            full_name: fullName(found),
            position: (found as any).position,
            email: (found as any).email,
          });
        }
      }
      setApprovers(approverList);
      setLoading(false);
    };
    init();
  }, []);

  if(loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดระบบ...</div></div>;
  if(!user)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</div></div>;

  const isApprover  = APPROVER_EMAILS.includes(user.email);
  const isViewAdmin = [ADMIN_EMAIL, HR_EMAIL].includes(user.email);
  const isTeacher   = !isApprover && !isViewAdmin;

  const roleLabel = isApprover
    ? approverSlotByEmail(user.email)===1 ? "👤 ผู้อนุมัติลำดับที่ 1"
      : approverSlotByEmail(user.email)===2 ? "👤 ผู้อนุมัติลำดับที่ 2"
      : "👤 ผู้อนุมัติลำดับที่ 3"
    : user.email===ADMIN_EMAIL ? "🔧 ผู้ดูแลระบบ"
    : user.email===HR_EMAIL    ? "📋 ฝ่ายบุคคล (HR)"
    : user.role==="director"   ? "👔 ผู้อำนวยการ"
    : user.role==="deputy_director" ? "👔 รองผู้อำนวยการ"
    : "👩‍🏫 ครู";

  return (
    <div className="min-h-screen bg-slate-50" style={{fontFamily:"'Sarabun','IBM Plex Sans Thai',sans-serif"}}>
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={()=>router.push("/dashboard")} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">🏠</button>
            <div><h1 className="text-base font-black text-slate-800 leading-none">ระบบลา / ไปราชการ</h1><p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต</p></div>
          </div>
          <span className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 ${
            isApprover  ? "bg-indigo-50 text-indigo-600 border-indigo-200" :
            isViewAdmin ? "bg-slate-50 text-slate-600 border-slate-200" :
                          "bg-blue-50 text-blue-600 border-blue-200"
          }`}>{roleLabel}</span>
        </div>
      </div>

      <div suppressHydrationWarning>
        {isApprover ? (
          <ApproverPage user={user} approvers={approvers} allTeachers={allTeachers} savedSignature={savedSignature}/>
        ) : isViewAdmin ? (
          <AdminDashboard user={user} canApprove={false} />
        ) : (
          <TeacherDashboard user={user} approvers={approvers} allTeachers={allTeachers} savedSignature={savedSignature} canPrint={PRINT_ROLES.includes(user.role)}/>
        )}
      </div>
    </div>
  );
}