"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import AssetPicker from "../assets/_components/AssetPicker";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface User {
  id: string; first_name: string; last_name: string;
  title?: string; role: string; position?: string; signature_url?: string; email?: string;
}
interface Building {
  id: string; name: string; description?: string;
  repair_user_ids?: string[]; inspector_user_ids?: string[];
}
interface RepairRequest {
  id: string; title: string; description?: string;
  building_id?: string; room?: string; category?: string;
  status: string; priority?: string; photo_urls?: string[];
  reporter_id: string; assigned_to?: string;
  estimated_cost?: number; budget_source?: string;
  created_at: string; updated_at?: string;
  completed_at?: string; memo_pdf_url?: string;
  memo_items?: any[]; memo_created_by?: string; memo_created_at?: string;
  reporter?: User; assignee?: User; building?: Building;
}
interface ProjectManager { id: string; user_id: string; user?: User; added_by?: string; created_at: string; }
interface RepairRoute { id: string; category: string; user_id: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fullName(u?: User | null) {
  if (!u) return "—";
  return `${u.title ?? ""} ${u.first_name} ${u.last_name}`.trim();
}
function initials(u?: User | null) {
  if (!u) return "?";
  return (u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "");
}
function thaiDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.getDate()} ${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()]} ${d.getFullYear()+543}`;
}
function thaiDateFull(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  const months = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543}`;
}
// ★ เวลาแบบ "เมื่อ X ชม.ที่แล้ว" ให้อ่านง่ายในรายการ
function ago(s?: string) {
  if (!s) return "";
  const mins = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} วันที่แล้ว`;
  return thaiDate(s);
}
function assignedIdsOf(r: RepairRequest): string[] {
  return ((r as any).assigned_user_ids as string[] | undefined) ?? (r.assigned_to ? [r.assigned_to] : []);
}

// 'completed' ตรงกับ enum จริงใน DB (pending, in_progress, completed, cancelled)
const STATUS_CFG: Record<string,{label:string;color:string;bg:string;border:string;dot:string;icon:string}> = {
  pending:     { label:"รอดำเนินการ", color:"#92400e", bg:"#fef3c7", border:"#fcd34d", dot:"#f59e0b", icon:"⏳" },
  in_progress: { label:"กำลังซ่อม",  color:"#1e40af", bg:"#dbeafe", border:"#93c5fd", dot:"#3b82f6", icon:"🔧" },
  completed:   { label:"เสร็จแล้ว",  color:"#065f46", bg:"#d1fae5", border:"#6ee7b7", dot:"#10b981", icon:"✅" },
  cancelled:   { label:"ยกเลิก",     color:"#6b7280", bg:"#f3f4f6", border:"#d1d5db", dot:"#9ca3af", icon:"🚫" },
};
const PRIORITY_CFG: Record<string,{label:string;color:string;bg:string}> = {
  low:    { label:"ต่ำ",      color:"#475569", bg:"#f1f5f9" },
  medium: { label:"ปานกลาง",  color:"#b45309", bg:"#fef3c7" },
  high:   { label:"เร่งด่วน",  color:"#b91c1c", bg:"#fee2e2" },
};
const BULB_CATEGORY = "เปลี่ยนหลอดไฟ";
const INTERNET_CATEGORY = "เครือข่ายอินเตอร์เน็ต";
const ASSET_CATEGORY = "ซ่อมครุภัณฑ์";
const CATEGORIES = ["ระบบไฟฟ้า", BULB_CATEGORY, "ระบบประปา","ประตู/หน้าต่าง","พื้น/ฝ้า/ผนัง","เฟอร์นิเจอร์","คอมพิวเตอร์/อุปกรณ์", INTERNET_CATEGORY, ASSET_CATEGORY, "ห้องน้ำ","อื่นๆ"];

// ★ บัญชีที่แก้ไข/สร้างบันทึกข้อความได้
const MEMO_EDITOR_EMAILS = ["general@khienkhet.ac.th"];

// ★ หาผู้รับเรื่องตามสาย: หมวดที่ตั้งสายไว้ -> คนที่กำหนด / หลอดไฟ -> ครูประจำตึก / อื่นๆ -> หน.โครงการ
function resolveRecipients(category: string|undefined, building: Building|undefined|null,
  managers: ProjectManager[], allUsers: User[], routes: RepairRoute[]): User[] {
  const byIds = (ids: string[]) => allUsers.filter(u => ids.includes(u.id));
  const routed = routes.filter(r => r.category === category).map(r => r.user_id);
  if (routed.length) return byIds(routed);
  if (category === BULB_CATEGORY) {
    const t = byIds(building?.repair_user_ids ?? []);
    if (t.length) return t;
  }
  return byIds(managers.map(m => m.user_id));
}

// ★ แจ้งเตือน Teams — ใช้รูปแบบเดียวกับ pushLeaveTeams ในระบบใบลา
//   (ส่ง Bearer token + id ของรายการ ให้ฝั่งเซิร์ฟเวอร์ดึงข้อมูลและยิงเข้า Teams เอง)
type RepairEvent = "submitted" | "edited" | "acknowledged" | "assigned" | "status_changed" | "completed";
async function pushRepairTeams(requestId: string, event: RepairEvent, extra?: { note?: string; status?: string }) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/repair-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ requestId, event, ...extra }),
    });
  } catch (e) { console.warn("[pushRepairTeams]", e); }
}

// ★ แปลงเลขอารบิกในสตริงให้เป็นเลขไทยล้วน (ใช้เฉพาะข้อความเนื้อหาในบันทึกข้อความ ห้ามใช้กับ CSS/สี)
function toThaiDigits(input: string | number): string {
  const th = ["๐","๑","๒","๓","๔","๕","๖","๗","๘","๙"];
  return String(input).replace(/[0-9]/g, d => th[Number(d)]);
}

// ★ แปลงตัวเลขเป็นคำอ่านภาษาไทย (สำหรับ "จำนวนเงิน...บาทถ้วน" ในบันทึกข้อความ)
function bahttext(num: number): string {
  if (!num || isNaN(num)) return "";
  const numText = ["", "หนึ่ง","สอง","สาม","สี่","ห้า","หก","เจ็ด","แปด","เก้า"];
  const digitText = ["", "สิบ","ร้อย","พัน","หมื่น","แสน","ล้าน"];
  function convert(numStr: string): string {
    let result = "";
    const len = numStr.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(numStr[i]);
      const pos = len - i - 1;
      if (digit === 0) continue;
      if (pos === 0 && digit === 1 && len > 1) { result += "เอ็ด"; continue; }
      if (pos === 1 && digit === 2) { result += "ยี่"; continue; }
      if (pos === 1 && digit === 1) { result += "สิบ"; continue; }
      result += numText[digit] + digitText[pos % 7];
    }
    return result;
  }
  const parts = num.toFixed(2).split(".");
  const intPart = parts[0].replace(/^0+/, "") || "0";
  const decPart = parts[1];
  let text = "";
  if (intPart === "0") text = "ศูนย์บาท";
  else {
    let millions: string[] = [];
    let remain = intPart;
    while (remain.length > 6) {
      millions.unshift(remain.slice(-6));
      remain = remain.slice(0, -6);
    }
    millions.unshift(remain);
    text = millions.map((seg, idx) => convert(seg) + (idx < millions.length - 1 ? "ล้าน" : "")).join("");
    text += "บาท";
  }
  if (decPart === "00") text += "ถ้วน";
  else text += convert(decPart) + "สตางค์";
  return text;
}

// ── PDF Generator (บันทึกข้อความ) — คงเดิมทั้งหมด ──────────────────────────────
function generateMemoHTML(params: {
  items: { no:number; title:string; detail:string; amount:number; photos:string[] }[];
  subject: string;
  reporterName: string;
  reporterPosition: string;
  gradeLevel: string;
  budgetSource: string;
  totalAmount: number;
  attachmentCount: number;
  directorName: string;
  directorSignUrl: string;
  creatorSignUrl: string;
  dateStr: string;
  memoNo: string;
  department: string;
  logoUrl: string;
  fontUrl: string;
}) {
  const {
    items, subject, reporterName, reporterPosition, gradeLevel, budgetSource,
    totalAmount, attachmentCount, directorName, directorSignUrl,
    creatorSignUrl, dateStr, memoNo, department, logoUrl, fontUrl,
  } = params;

  const itemLines = items.map((it,i) =>
    `<div style="margin:2px 0">${toThaiDigits(i+1)}. ${it.title}${it.detail ? ` (${it.detail})` : ""} จำนวน ${it.amount ? toThaiDigits(it.amount.toLocaleString("th-TH")) : "…………"} บาท</div>`
  ).join("");

  const routingBoxes = `<div style="font-weight:bold;margin-bottom:4px">ตรวจเสนอ</div>` +
    ROUTING_LABELS.map(label => `
    <div style="margin:3px 0">.................... ${label}</div>`).join("") +
    `<div style="margin:3px 0">....................</div>`;

  const photoEntries = items.flatMap(it => (it.photos ?? []).map(url => ({ url, title: it.title })));
  const photosPageHTML = photoEntries.length > 0
    ? `<div style="page-break-before:always;">
        <h2 style="text-align:center;font-size:16pt;margin:0 0 14px">ภาพถ่ายประกอบการแจ้งซ่อม</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          ${photoEntries.map(p => `
            <div style="text-align:center">
              <img src="${p.url}" style="width:100%;height:220px;object-fit:cover;border:1px solid #ccc;border-radius:4px;" />
              <div style="margin-top:4px;font-size:14pt">${p.title}</div>
            </div>`).join("")}
        </div>
      </div>`
    : `<div style="page-break-before:always;">
        <h2 style="text-align:center;font-size:16pt;margin:0 0 14px">ภาพถ่ายประกอบการแจ้งซ่อม</h2>
        <p style="text-align:center;color:#666">ไม่มีภาพถ่ายแนบ</p>
      </div>`;

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <style>
    @font-face {
      font-family: 'TH Sarabun New';
      src: url('${fontUrl}') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: block;
    }
    @page { size: A4 portrait; margin: 20mm 25mm; }
    body { font-family:'TH Sarabun New','Sarabun','THSarabunPSK',sans-serif; font-size:16pt; color:#111; line-height:1.5; }
    .header { position:relative; text-align:center; min-height:60px; margin-bottom:6px; }
    .header img { position:absolute; left:0; top:0; height:58px; }
    h2 { text-align:center; font-size:18pt; font-weight:bold; margin:0 0 8px; }
    .meta-table { width:100%; margin-bottom:8px; font-size:16pt; }
    .meta-table td { padding:1px 0; vertical-align:bottom; }
    .meta-table td:first-child { white-space:nowrap; padding-right:10px; }
    .fill { display:inline-block; border-bottom:1px dotted #111; min-height:1.3em; }
    .indent { text-indent:2em; margin:6px 0; }
    .section-title { font-weight:bold; text-align:center; margin:10px 0 3px; }
    .routing-box { border:1px solid #111; padding:8px 14px; width:60%; margin-top:6px; }
    .sign-section { display:flex; justify-content:flex-end; margin-top:20px; }
    .sign-box { text-align:center; width:260px; }
    .sign-img { height:50px; display:block; margin:0 auto; object-fit:contain; }
    .sign-line { border-bottom:1px dotted #111; width:200px; margin:0 auto 4px; height:20px; }
    .director-block { margin-top:12px; }
    .director-sign { display:flex; justify-content:flex-end; margin-top:12px; }
    @media print { button{display:none} }
  </style></head>
  <body>
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" />` : ""}
      <h2>บันทึกข้อความ</h2>
    </div>
    <table class="meta-table">
      <tr><td><b>ส่วนราชการ</b></td><td><span class="fill" style="width:100%">${department || "&nbsp;"}</span></td></tr>
      <tr>
        <td><b>ที่</b></td>
        <td>
          <span class="fill" style="width:45%">${memoNo ? toThaiDigits(memoNo) : "&nbsp;"}</span>
          &nbsp;&nbsp;&nbsp;<b>วันที่</b>&nbsp;
          <span class="fill" style="width:33%">${toThaiDigits(dateStr) || "&nbsp;"}</span>
        </td>
      </tr>
      <tr><td><b>เรื่อง</b></td><td><span class="fill" style="width:100%">${subject}</span></td></tr>
      <tr><td><b>เรียน</b></td><td>ผู้อำนวยการโรงเรียนวัดเขียนเขต</td></tr>
    </table>

    <div class="section-title">ต้นเรื่อง</div>
    <p class="indent">
      ด้วยห้องเรียน/บริเวณระดับชั้น ${gradeLevel || "……………………"} ซึ่งอยู่ในความดูแลของข้าพเจ้า
      ${reporterName} ตำแหน่ง ${reporterPosition || "……………………"}
      ได้เปิดใช้งานมาเป็นระยะเวลาหนึ่ง ส่งผลให้อุปกรณ์และโครงสร้างอาคารบางส่วนเกิดการชำรุดทรุดโทรม
      ซึ่งอาจก่อให้เกิดอันตรายต่อนักเรียนและไม่เอื้อต่อการจัดการเรียนการสอน
    </p>

    <div class="section-title">ข้อเท็จจริง</div>
    <p class="indent">
      ในการนี้ ข้าพเจ้าจึงใคร่ขออนุมัติใช้งบประมาณ ${budgetSource || "……………………"}
      จำนวน ${totalAmount ? toThaiDigits(totalAmount.toLocaleString("th-TH")) : "……………………"} บาท
      (${totalAmount ? bahttext(totalAmount) : "……………………"}) เพื่อดำเนินการปรับปรุงและซ่อมแซมรายการดังต่อไปนี้
    </p>
    <div style="padding-left:1.5em">${itemLines}</div>
    <p style="text-align:right;font-weight:bold;margin:6px 0">
      รวมเป็นเงินทั้งสิ้น ${totalAmount ? toThaiDigits(totalAmount.toLocaleString("th-TH")) : "……………"} บาท
    </p>

    <div class="section-title">ข้อพิจารณา</div>
    <p class="indent">
      พร้อมนี้ ข้าพเจ้าได้แนบภาพถ่ายจุดที่ชำรุดมาพร้อมกับบันทึกข้อความฉบับนี้ จำนวน ${toThaiDigits(attachmentCount || 0)} แผ่น
      เพื่อประกอบการพิจารณาอนุมัติ
    </p>

    <div class="section-title">ข้อเสนอแนะ</div>
    <p style="text-align:center;margin:2px 0 6px">เพื่อโปรดทราบและพิจารณา</p>
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="routing-box">${routingBoxes}</div>
      <div class="sign-box">
        ${creatorSignUrl ? `<img class="sign-img" src="${creatorSignUrl}" />` : `<div class="sign-line"></div>`}
        <div>ลงชื่อ</div>
        <div>(${reporterName})</div>
        <div>ตำแหน่ง ${reporterPosition || "……………………"}</div>
      </div>
    </div>

    <div class="director-block">
      <p><b>ความเห็นผู้อำนวยการโรงเรียนวัดเขียนเขต</b>&nbsp;&nbsp;☐ อนุมัติ&nbsp;&nbsp;&nbsp;&nbsp;☐ ไม่อนุมัติ</p>
      <div style="border-bottom:1px dotted #111;height:24px;margin:8px 0"></div>
      <div style="border-bottom:1px dotted #111;height:24px;margin:8px 0"></div>
      <div class="director-sign">
        <div class="sign-box">
          ${directorSignUrl ? `<img class="sign-img" src="${directorSignUrl}" />` : `<div class="sign-line"></div>`}
          <div>ลงชื่อ</div>
          <div>(${directorName || "นายธนณัฐ  ศิระวงษ์"})</div>
          <div>ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
        </div>
      </div>
    </div>

    ${photosPageHTML}
    <script>
      window.onload = () => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => window.print());
        } else {
          window.print();
        }
      };
    <\/script>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── UI primitives (ใช้ร่วมกันทุก modal เพื่อให้หน้าตาเป็นแบบเดียวกัน) ───────────
// ══════════════════════════════════════════════════════════════════════════════
const inputCls = (err?: boolean) =>
  `w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-800 bg-white placeholder:text-slate-400 outline-none transition
   focus:ring-4 ${err ? "border-red-300 bg-red-50/60 focus:ring-red-100" : "border-slate-200 focus:border-orange-400 focus:ring-orange-100"}`;

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[13px] font-semibold text-slate-600 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function Avatar({ user, size = 28 }: { user?: User | null; size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(user)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.pending;
  return (
    <span style={{ background: c.bg, color: c.color, borderColor: c.border }}
      className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />{c.label}
    </span>
  );
}

function PriorityTag({ priority }: { priority?: string }) {
  if (!priority || !PRIORITY_CFG[priority]) return null;
  const p = PRIORITY_CFG[priority];
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ color: p.color, background: p.bg }}>{p.label}</span>;
}

function ModalShell({ title, onClose, children, footer, wide }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]`}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 sm:px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-[17px]">{title}</h3>
          <button onClick={onClose} aria-label="ปิด"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5 space-y-4">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50/80 sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>
  );
}

const btnGhost = "px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 transition";
const btnPrimary = "px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 transition shadow-sm";
const btnBlue = "px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 transition shadow-sm";

// ── MemoModal ─────────────────────────────────────────────────────────────────
const ROUTING_LABELS = [
  "หัวหน้ากลุ่มบริหารทั่วไป",
  "รองผู้อำนวยการกลุ่มบริหารทั่วไป",
  "รองผู้อำนวยการกลุ่มบริหารงบประมาณ",
  "เจ้าหน้าที่การเงิน",
];

function MemoModal({ requests, buildings, currentUser, director, onClose }: {
  requests: RepairRequest[]; buildings: Building[];
  currentUser: User; director?: User; onClose: () => void;
}) {
  const [memoNo, setMemoNo] = useState("");
  const [memoDate, setMemoDate] = useState(format(new Date(),"yyyy-MM-dd"));
  const [subject, setSubject] = useState("ขออนุมัติงบประมาณและซ่อมแซมอาคารสถานที่");
  const [department, setDepartment] = useState("กลุ่มบริหารทั่วไป");
  const [gradeLevel, setGradeLevel] = useState("");
  const [reporterPosition, setReporterPosition] = useState(currentUser.position ?? "");
  const [budgetSource, setBudgetSource] = useState("");
  const [selected, setSelected] = useState<Record<string,boolean>>(
    () => Object.fromEntries(requests.map(r => [r.id, true]))
  );
  const [amounts, setAmounts] = useState<Record<string,string>>(
    () => Object.fromEntries(requests.map(r => [r.id, (r as any).estimated_cost != null ? String((r as any).estimated_cost) : ""]))
  );
  const checkedCount = Object.values(selected).filter(Boolean).length;
  const totalAmount = requests.filter(r => selected[r.id]).reduce((sum, r) => sum + (Number(amounts[r.id]) || 0), 0);
  const attachmentCount = requests.filter(r => selected[r.id]).reduce((sum, r) => sum + (r.photo_urls?.length ?? 0), 0);

  const handlePrint = () => {
    const items = requests.filter(r => selected[r.id]).map((r,i) => ({
      no: i+1, title: r.title,
      detail: [r.building?.name, r.room].filter(Boolean).join(" · "),
      amount: Number(amounts[r.id]) || 0, photos: r.photo_urls ?? [],
    }));
    if (items.length === 0) { alert("กรุณาเลือกรายการอย่างน้อย 1 รายการ"); return; }
    const logoUrl = typeof window !== "undefined" ? `${window.location.origin}/images.jpg` : "/images.jpg";
    const fontUrl = typeof window !== "undefined" ? `${window.location.origin}/fonts/THSarabunNew.ttf` : "/fonts/THSarabunNew.ttf";
    const html = generateMemoHTML({
      items, subject, reporterName: fullName(currentUser), reporterPosition, gradeLevel, budgetSource,
      totalAmount, attachmentCount, directorName: fullName(director),
      directorSignUrl: director?.signature_url ?? "", creatorSignUrl: currentUser.signature_url ?? "",
      dateStr: thaiDateFull(memoDate), memoNo, department, logoUrl, fontUrl,
    });
    const w = window.open("","_blank","width=900,height=780");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <ModalShell wide title="📄 สร้างบันทึกข้อความแจ้งซ่อม" onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btnGhost}>ยกเลิก</button>
        <button onClick={handlePrint} disabled={checkedCount===0} className={btnBlue}>🖨️ พิมพ์บันทึกข้อความ ({checkedCount} รายการ)</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>เลขที่หนังสือ</Label>
          <input type="text" value={memoNo} onChange={e=>setMemoNo(e.target.value)} placeholder="เช่น ศธ 04002/2569-001" className={inputCls()} /></div>
        <div><Label>วันที่</Label>
          <input type="date" value={memoDate} onChange={e=>setMemoDate(e.target.value)} className={inputCls()} /></div>
      </div>
      <div><Label>ส่วนราชการ</Label><input type="text" value={department} onChange={e=>setDepartment(e.target.value)} className={inputCls()} /></div>
      <div><Label>เรื่อง</Label><input type="text" value={subject} onChange={e=>setSubject(e.target.value)} className={inputCls()} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>ระดับชั้น/ห้อง</Label>
          <input type="text" value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)} placeholder="เช่น ม.2/3" className={inputCls()} /></div>
        <div><Label>ตำแหน่งผู้เสนอ</Label>
          <input type="text" value={reporterPosition} onChange={e=>setReporterPosition(e.target.value)} placeholder="เช่น หัวหน้าสายชั้น ม.2" className={inputCls()} /></div>
      </div>
      <div><Label>แหล่งงบประมาณ</Label>
        <input type="text" value={budgetSource} onChange={e=>setBudgetSource(e.target.value)} placeholder="เช่น งบประมาณรายได้สถานศึกษา / งบดำเนินงาน" className={inputCls()} /></div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>เลือกรายการที่ต้องการรวม ({checkedCount}/{requests.length})</Label>
          <div className="flex gap-3 -mt-1.5">
            <button onClick={()=>setSelected(Object.fromEntries(requests.map(r=>[r.id,true])))} className="text-xs text-orange-600 font-bold hover:underline">เลือกทั้งหมด</button>
            <button onClick={()=>setSelected(Object.fromEntries(requests.map(r=>[r.id,false])))} className="text-xs text-slate-400 font-bold hover:underline">ล้าง</button>
          </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {requests.length === 0 && <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-xl">ไม่มีรายการที่ยังไม่เสร็จ</p>}
          {requests.map((r,i) => (
            <div key={r.id} className={`p-3 rounded-xl border transition ${selected[r.id] ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-slate-50"}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={!!selected[r.id]} onChange={e=>setSelected(prev=>({...prev,[r.id]:e.target.checked}))}
                  className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 text-sm">{i+1}. {r.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {r.building?.name ?? "—"}{r.room ? ` · ${r.room}` : ""}{r.photo_urls?.length ? ` · 📷 ${r.photo_urls.length} รูป` : ""}
                  </div>
                </div>
              </label>
              {selected[r.id] && (
                <div className="mt-2 ml-7 flex items-center gap-2">
                  <span className="text-xs text-slate-500 shrink-0">จำนวนเงิน (บาท)</span>
                  <input type="number" value={amounts[r.id] ?? ""} onChange={e=>setAmounts(prev=>({...prev,[r.id]:e.target.value}))}
                    placeholder="0" className={inputCls() + " !w-32 !py-1.5"} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-orange-800 text-sm">รวมเป็นเงินทั้งสิ้น</span>
        <span className="font-black text-lg text-orange-700">{totalAmount.toLocaleString("th-TH")} บาท</span>
      </div>
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="font-semibold mb-0.5">ผู้อนุมัติ</p>
        <p>ผู้อำนวยการ: {director ? fullName(director) : "นายธนณัฐ  ศิระวงษ์"}</p>
        <p className="text-xs text-slate-400 mt-1">📎 ภาพแนบรวม {attachmentCount} รูป (นับอัตโนมัติจากรายการที่เลือก)</p>
      </div>
    </ModalShell>
  );
}

// ── RepairFormModal ───────────────────────────────────────────────────────────
function RepairFormModal({ existing, buildings, currentUser, onSave, onClose }: {
  existing?: RepairRequest|null; buildings: Building[];
  currentUser: User; onSave: () => void; onClose: () => void;
}) {
  const [title,       setTitle]      = useState(existing?.title ?? "");
  const [desc,        setDesc]       = useState(existing?.description ?? "");
  const [buildingId,  setBuildingId] = useState(existing?.building_id ?? "");
  const [room,        setRoom]       = useState(existing?.room ?? "");
  const [category,    setCategory]   = useState(existing?.category ?? "");
  const [priority,    setPriority]   = useState(existing?.priority ?? "medium");
  const [imageUrls,   setImageUrls]  = useState<string[]>(existing?.photo_urls ?? []);
  const [pending,     setPending]    = useState<string[]>([]);   // ★ รูปที่กำลังอัปโหลด (พรีวิวชั่วคราว)
  const [uploading,   setUploading]  = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [errors,      setErrors]     = useState<Record<string,boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetId, setAssetId] = useState<string>((existing as any)?.asset_id ?? "");
  const MAX_IMAGES = 4;

  useEffect(() => {
    if (existing) return;
    const id = new URLSearchParams(window.location.search).get("asset");
    if (!id) return;
    supabase.from("assets").select("id,name,asset_locations(name)").eq("id", id).maybeSingle().then(({ data }: any) => {
      if (!data) return;
      setAssetId(data.id); setCategory(ASSET_CATEGORY);
      setTitle(t => t || `ซ่อม ${data.name}`); setRoom(r => r || data.asset_locations?.name || "");
    });
  }, []);

  const validate = () => {
    const e: Record<string,boolean> = {};
    if (!title.trim()) e.title = true;
    if (!buildingId) e.buildingId = true;
    if (!category) e.category = true;
    if (category === ASSET_CATEGORY && !assetId) e.assetId = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(ev.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) { alert(`อัปโหลดได้สูงสุด ${MAX_IMAGES} รูป`); return; }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) alert(`เลือกได้อีก ${remaining} รูป (ใช้แค่ ${remaining} รูปแรก)`);

    setUploading(true);
    for (const file of toUpload) {
      if (file.size > 10*1024*1024) { alert(`${file.name} ขนาดเกิน 10MB`); continue; }

      const preview = await new Promise<string>(res => {
        const reader = new FileReader();
        reader.onload = e => res((e.target?.result as string) ?? "");
        reader.readAsDataURL(file);
      });
      setPending(prev => [...prev, preview]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("account", "general@khienkhet.ac.th");
        formData.append("folder", "WKK_Repair_System");
        formData.append("fileName", `repair-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`);
        const res = await fetch("/api/upload-onedrive", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(()=>({}));
          console.error("upload-onedrive error:", err);
          alert("อัปโหลดไม่สำเร็จ: " + JSON.stringify(err.error ?? err ?? res.statusText));
        } else {
          const { url, itemId } = await res.json();
          setImageUrls(prev => [...prev, url ?? itemId]);
        }
      } catch (e: any) {
        alert("อัปโหลดไม่สำเร็จ: " + e.message);
      }
      setPending(prev => prev.filter(p => p !== preview));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      title: title.trim(), description: desc.trim(), building_id: buildingId,
      room: room.trim(), category, priority, photo_urls: imageUrls,
      asset_id: category === ASSET_CATEGORY ? (assetId || null) : null,
      reporter_id: existing?.reporter_id ?? currentUser.id,
      status: existing?.status ?? "pending",
      assigned_user_ids: existing?.id ? ((existing as any).assigned_user_ids ?? []) : [],
      assigned_to: existing?.assigned_to ?? null,
    };
    if (existing?.id) {
      const { error } = await supabase.from("repair_requests").update(payload).eq("id", existing.id);
      if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); setSaving(false); return; }
      pushRepairTeams(existing.id, "edited");
    } else {
      const { data: created, error } = await supabase.from("repair_requests").insert([payload]).select("id").single();
      if (error) { alert("❌ แจ้งซ่อมไม่สำเร็จ: " + error.message); setSaving(false); return; }
      if (category === ASSET_CATEGORY && assetId)
        await supabase.rpc("update_asset_status", { p_asset: assetId, p_status: "broken", p_condition: null, p_note: `แจ้งซ่อม: ${title.trim()}` });
      // ★ แจ้งเข้า Teams (รูปแบบเดียวกับใบลา) — ผู้รับเรื่องตามสายจะได้รับข้อความ
      pushRepairTeams(created.id, "submitted");
    }
    setSaving(false);
    onSave();
  };

  const canAddMore = imageUrls.length + pending.length < MAX_IMAGES;

  return (
    <ModalShell title={existing ? "✏️ แก้ไขรายการ" : "🔧 แจ้งซ่อม"} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btnGhost}>ยกเลิก</button>
        <button onClick={handleSave} disabled={saving || uploading} className={btnPrimary}>
          {saving ? "กำลังบันทึก..." : (existing ? "บันทึกการแก้ไข" : "ส่งแจ้งซ่อม")}
        </button>
      </>}>
      <div>
        <Label required>หัวข้อ</Label>
        <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="เช่น ไฟฟ้าดับห้อง 101" className={inputCls(errors.title)} />
        {errors.title && <p className="text-xs text-red-500 mt-1">กรุณากรอกหัวข้อ</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>อาคาร</Label>
          <select value={buildingId} onChange={e=>setBuildingId(e.target.value)} className={inputCls(errors.buildingId)}>
            <option value="">เลือกอาคาร</option>
            {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {errors.buildingId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกอาคาร</p>}
        </div>
        <div>
          <Label>ห้อง/บริเวณ</Label>
          <input type="text" value={room} onChange={e=>setRoom(e.target.value)} placeholder="เช่น ห้อง 101" className={inputCls()} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>หมวดหมู่</Label>
          <select value={category} onChange={e=>setCategory(e.target.value)} className={inputCls(errors.category)}>
            <option value="">เลือกหมวดหมู่</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          {errors.category && <p className="text-xs text-red-500 mt-1">กรุณาเลือกหมวดหมู่</p>}
        </div>
        <div>
          <Label>ความเร่งด่วน</Label>
          <select value={priority} onChange={e=>setPriority(e.target.value)} className={inputCls()}>
            <option value="low">🟢 ต่ำ</option>
            <option value="medium">🟡 ปานกลาง</option>
            <option value="high">🔴 เร่งด่วน</option>
          </select>
        </div>
      </div>
      {category === ASSET_CATEGORY && (
        <div>
          <Label required>ครุภัณฑ์ที่ชำรุด</Label>
          <AssetPicker value={assetId} onChange={setAssetId} error={errors.assetId} />
        </div>
      )}
      <div>
        <Label>รายละเอียด</Label>
        <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="อธิบายอาการหรือปัญหาเพิ่มเติม" className={inputCls()+" resize-none"} />
      </div>
      <div>
        <Label>รูปภาพประกอบ <span className="text-slate-400 font-normal">({imageUrls.length}/{MAX_IMAGES})</span></Label>
        <div className="grid grid-cols-4 gap-2">
          {imageUrls.map((src,i)=>(
            <div key={src+i} className="relative group aspect-square">
              <img src={src} alt="" className="w-full h-full object-cover rounded-xl border border-slate-200 cursor-pointer" onClick={()=>window.open(src,"_blank")} />
              <button onClick={()=>setImageUrls(prev=>prev.filter((_,j)=>j!==i))} aria-label="ลบรูป"
                className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center font-bold shadow">×</button>
            </div>
          ))}
          {pending.map((src,i)=>(
            <div key={"p"+i} className="relative aspect-square">
              <img src={src} alt="" className="w-full h-full object-cover rounded-xl border border-slate-200 opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center text-lg animate-pulse">⏳</div>
            </div>
          ))}
          {canAddMore && (
            <label className={`aspect-square border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition bg-slate-50 ${uploading?"opacity-60 pointer-events-none":""}`}>
              <span className="text-2xl">📷</span>
              <span className="text-[11px] text-slate-500 mt-1">เพิ่มรูป</span>
              <input ref={fileRef} type="file" multiple accept="image/*" disabled={uploading} onChange={handleUpload} className="hidden" />
            </label>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1.5">ไฟล์ละไม่เกิน 10MB · แนบได้สูงสุด {MAX_IMAGES} รูป</p>
      </div>
    </ModalShell>
  );
}

// ── ManagersModal (แอดมินตั้งค่าผู้ดูแลโครงการ + ผู้รับเรื่องตามหมวด) ───────────
function ManagersModal({ currentUser, allUsers, managers, routes, onClose, onRefresh }: {
  currentUser: User; allUsers: User[]; managers: ProjectManager[]; routes: RepairRoute[];
  onClose: () => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const managerIds = useMemo(() => new Set(managers.map(m => m.user_id)), [managers]);
  const [routeCat, setRouteCat] = useState(INTERNET_CATEGORY);
  const [routeSearch, setRouteSearch] = useState("");
  const catRoutes = routes.filter(r => r.category === routeCat);
  const routeFiltered = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();
    if (!q) return [];
    return allUsers.filter(u => !catRoutes.some(r => r.user_id === u.id) &&
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)).slice(0, 8);
  }, [allUsers, routeSearch, catRoutes]);
  const addRoute = async (u: User) => {
    const { error } = await supabase.from("repair_category_routes")
      .insert([{ category: routeCat, user_id: u.id, added_by: currentUser.id }]);
    if (error) { alert("❌ " + error.message); return; }
    setRouteSearch(""); onRefresh();
  };
  const removeRoute = async (id: string) => {
    await supabase.from("repair_category_routes").delete().eq("id", id); onRefresh();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allUsers.filter(u => !managerIds.has(u.id) && `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)).slice(0, 8);
  }, [allUsers, search, managerIds]);

  const handleAdd = async (u: User) => {
    setAdding(true);
    await supabase.from("repair_project_managers").insert([{ user_id: u.id, added_by: currentUser.id }]);
    setSearch(""); onRefresh(); setAdding(false);
  };
  const handleRemove = async (id: string) => {
    if (!confirm("ยืนยันการลบผู้ดูแลโครงการ?")) return;
    await supabase.from("repair_project_managers").delete().eq("id", id);
    onRefresh();
  };

  const dropdown = "absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden mt-1";
  const dropItem = "w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-orange-50 border-b border-slate-100 last:border-0 flex items-center justify-between";

  return (
    <ModalShell title="⚙️ ตั้งค่าผู้ดูแลระบบแจ้งซ่อม" onClose={onClose}>
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        ผู้ดูแลโครงการดูรายงานทั้งหมด สร้างบันทึกข้อความ เปลี่ยนสถานะ และมอบหมายงานได้ · เป็นผู้รับเรื่องสำรองของทุกหมวดที่ไม่ได้ตั้งสายไว้
      </div>

      <section className="space-y-2">
        <h4 className="font-bold text-slate-700 text-sm">ผู้ดูแลโครงการ ({managers.length} คน)</h4>
        <div className="relative">
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 พิมพ์ชื่อครูเพื่อเพิ่ม" className={inputCls()} />
          {filtered.length > 0 && (
            <div className={dropdown}>
              {filtered.map(u=>(
                <button key={u.id} onClick={()=>handleAdd(u)} disabled={adding} className={dropItem}>
                  <span>{fullName(u)} <span className="text-slate-400 text-xs">{u.role}</span></span>
                  <span className="text-orange-600 font-bold text-xs">+ เพิ่ม</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {managers.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">ยังไม่มีผู้ดูแลโครงการ</div>
        ) : managers.map(m=>(
          <div key={m.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
            <Avatar user={m.user} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate">{fullName(m.user)}</p>
              <p className="text-xs text-slate-400">{m.user?.role}</p>
            </div>
            <button onClick={()=>handleRemove(m.id)} className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">ลบ</button>
          </div>
        ))}
      </section>

      <section className="space-y-2 pt-4 border-t border-slate-100">
        <h4 className="font-bold text-slate-700 text-sm">ผู้รับเรื่องตามหมวดหมู่</h4>
        <select value={routeCat} onChange={e => setRouteCat(e.target.value)} className={inputCls()}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="relative">
          <input value={routeSearch} onChange={e => setRouteSearch(e.target.value)} placeholder="🔍 ค้นหาชื่อเพื่อเพิ่ม" className={inputCls()} />
          {routeFiltered.length > 0 && (
            <div className={dropdown}>
              {routeFiltered.map(u => (
                <button key={u.id} onClick={() => addRoute(u)} className={dropItem}>
                  <span>{fullName(u)}</span><span className="text-orange-600 font-bold text-xs">+ เพิ่ม</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {catRoutes.length === 0
          ? <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">ยังไม่ได้ตั้งค่า — หมวดนี้จะส่งให้หัวหน้าโครงการ{routeCat === BULB_CATEGORY ? " (หรือครูประจำตึก)" : ""}</p>
          : catRoutes.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
              <span className="text-sm font-semibold text-slate-700">{fullName(allUsers.find(u => u.id === r.user_id))}</span>
              <button onClick={() => removeRoute(r.id)} className="text-xs font-bold text-red-600">ลบ</button>
            </div>
          ))}
      </section>
    </ModalShell>
  );
}

// ── ResponsibilityPanel (แท็บ "ใครดูแลอะไร" — ทุกคนเปิดดูได้) ─────────────────
function ResponsibilityPanel({ buildings, managers, routes, allUsers }: {
  buildings: Building[]; managers: ProjectManager[]; routes: RepairRoute[]; allUsers: User[];
}) {
  const names = (ids: string[]) => allUsers.filter(u => ids.includes(u.id));
  const Chips = ({ list, empty }: { list: User[]; empty: string }) =>
    list.length === 0
      ? <span className="text-xs text-slate-400">{empty}</span>
      : <div className="flex flex-wrap gap-1.5">{list.map(u => (
          <span key={u.id} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full pl-1 pr-2.5 py-0.5 text-xs font-medium text-slate-700">
            <Avatar user={u} size={20} />{fullName(u)}
          </span>))}
        </div>;

  return (
    <div className="w-full p-2 sm:p-3 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3">สิทธิ์ตามบทบาท</h3>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          {[
            ["ผู้แจ้ง (ครูทั่วไป)", "แจ้งซ่อม ดูรายการทั้งโรงเรียน แก้ไข/ลบได้เฉพาะรายการของตัวเองที่ยังไม่มีผู้รับเรื่อง"],
            ["ผู้รับเรื่องตามสาย", "กด “รับเรื่อง” เปลี่ยนสถานะ และบันทึกงบประมาณของรายการที่ได้รับมอบหมาย"],
            ["ผู้ดูแลโครงการ / แอดมิน", "ดูแดชบอร์ด มอบหมายงาน เปลี่ยนสถานะ แก้ไข/ลบทุกรายการ และสร้างบันทึกข้อความ (แอดมินตั้งค่าผู้ดูแลได้)"],
            ["ผู้จัดทำบันทึกข้อความ", "general@khienkhet.ac.th สร้างบันทึกข้อความและแก้ไขงบประมาณได้ แต่เปลี่ยนสถานะไม่ได้"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="font-semibold text-slate-800">{t}</p><p className="text-slate-500 text-[13px] mt-0.5">{d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">ผู้รับเรื่องตามหมวดหมู่</h3>
          <span className="text-xs text-slate-400">ลำดับ: ตั้งสายไว้ → ครูประจำตึก (เฉพาะหลอดไฟ) → ผู้ดูแลโครงการ</span>
        </div>
        <div className="divide-y divide-slate-100">
          {CATEGORIES.map(cat => {
            const routed = names(routes.filter(r => r.category === cat).map(r => r.user_id));
            const mgrs = names(managers.map(m => m.user_id));
            return (
              <div key={cat} className="px-5 py-3 grid sm:grid-cols-[180px_1fr] gap-2 items-start">
                <p className="font-semibold text-slate-700 text-sm">{cat}</p>
                {routed.length > 0 ? <Chips list={routed} empty="" />
                  : cat === BULB_CATEGORY
                    ? <span className="text-xs text-slate-500">ครูประจำตึก (ดูด้านล่าง) · สำรอง: ผู้ดูแลโครงการ</span>
                    : <div><Chips list={mgrs} empty="ยังไม่มีผู้ดูแลโครงการ" /><p className="text-[11px] text-slate-400 mt-1">ยังไม่ได้ตั้งสายเฉพาะ → ส่งให้ผู้ดูแลโครงการ</p></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-bold text-slate-800">ผู้ดูแลรายอาคาร</h3></div>
        <div className="divide-y divide-slate-100">
          {buildings.map(b => (
            <div key={b.id} className="px-5 py-3 grid sm:grid-cols-[180px_1fr] gap-2">
              <p className="font-semibold text-slate-700 text-sm">{b.name}</p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2"><span className="text-[11px] text-slate-400 w-16 shrink-0 pt-1">ครูซ่อม</span><Chips list={names(b.repair_user_ids ?? [])} empty="ยังไม่ได้ตั้งค่า" /></div>
                <div className="flex items-start gap-2"><span className="text-[11px] text-slate-400 w-16 shrink-0 pt-1">ครูดูแลตึก</span><Chips list={names(b.inspector_user_ids ?? [])} empty="ยังไม่ได้ตั้งค่า" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DetailModal ───────────────────────────────────────────────────────────────
function DetailModal({ request, allUsers, currentUserId, isAdmin, isProjManager, recipients, isMemoEditor, onEdit, onDelete, onUpdate, onClose }: {
  request: RepairRequest; allUsers: User[];
  currentUserId: string; isAdmin: boolean; isProjManager: boolean;
  recipients: User[]; isMemoEditor: boolean;
  onEdit: (r: RepairRequest) => void; onDelete: (id: string) => void;
  onUpdate: () => void; onClose: () => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [assignedIds, setAssignedIds] = useState<string[]>(assignedIdsOf(request));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<string>(
    (request as any).estimated_cost != null ? String((request as any).estimated_cost) : ""
  );
  const [budgetSource, setBudgetSource] = useState<string>((request as any).budget_source ?? "");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const buildingRepairIds: string[] = (request.building as any)?.repair_user_ids ?? [];
  const notAdmin = (u: User) => !(u.role ?? "").toLowerCase().includes("admin") || assignedIds.includes(u.id);
  const assignableUsers = (buildingRepairIds.length > 0 ? allUsers.filter(u => buildingRepairIds.includes(u.id)) : allUsers).filter(notAdmin);
  const inspectorIds: string[] = (request.building as any)?.inspector_user_ids ?? [];
  const inspectorUsers = allUsers.filter(u => inspectorIds.includes(u.id));
  const assignees = allUsers.filter(u => assignedIds.includes(u.id));

  function toggleAssignee(id: string) {
    setAssignedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  }

  const isReporter = request.reporter_id === currentUserId;
  const originalAssigned = assignedIdsOf(request);
  const isLocked = originalAssigned.length > 0;
  const canEditDelete = isAdmin || isProjManager || (isReporter && !isLocked);
  const acknowledged = isLocked;
  const isAssignee = originalAssigned.includes(currentUserId);
  const canAcknowledge = recipients.some(u => u.id === currentUserId) && !acknowledged && request.status === "pending";
  const canChangeStatus = isAdmin || isProjManager || isAssignee;
  const canReassign = isAdmin || isProjManager;
  const canManage = canChangeStatus || isMemoEditor;

  // ★ ขั้นตอนความคืบหน้า
  const step = request.status === "completed" ? 3 : request.status === "in_progress" ? 2 : acknowledged ? 1 : 0;
  const steps = ["แจ้งซ่อม", "รับเรื่อง", "กำลังซ่อม", "เสร็จแล้ว"];

  const handleAcknowledge = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/repair-ack", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ requestId: request.id }),
    });
    const j = await res.json();
    setSaving(false);
    if (!j.ok) { alert(j.error); return; }
    onUpdate();
  };

  const handleUpdate = async () => {
    setSaving(true);
    const { error } = await supabase.from("repair_requests").update({
      status,
      assigned_user_ids: assignedIds,
      assigned_to: assignedIds[0] ?? null,
      estimated_cost: estimatedCost.trim() ? Number(estimatedCost) : null,
      budget_source: budgetSource.trim() || null,
      updated_at: new Date().toISOString(),
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    }).eq("id", request.id);
    setSaving(false);
    if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return; }

    const aid = (request as any).asset_id as string | undefined;
    if (aid && status !== request.status && (status === "in_progress" || status === "completed")) {
      await supabase.rpc("update_asset_status", {
        p_asset: aid, p_status: status === "completed" ? "active" : "repairing", p_condition: null,
        p_note: status === "completed" ? "ซ่อมเสร็จแล้ว" : "อยู่ระหว่างซ่อม",
      });
    }

    // ★ แจ้ง Teams: สถานะเปลี่ยน → แจ้งผู้แจ้ง / มอบหมายคนใหม่ → แจ้งผู้ถูกมอบหมาย
    const newlyAssigned = assignedIds.some(id => !originalAssigned.includes(id));
    if (status !== request.status) {
      pushRepairTeams(request.id, status === "completed" ? "completed" : "status_changed", { status, note: note.trim() || undefined });
    } else if (newlyAssigned) {
      pushRepairTeams(request.id, "assigned", { note: note.trim() || undefined });
    }
    onUpdate();
  };

  return (
    <ModalShell title="รายละเอียดการแจ้งซ่อม" onClose={onClose}>
      <div>
        <h2 className="font-bold text-slate-900 text-xl leading-snug">{request.title}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusPill status={request.status} />
          <PriorityTag priority={request.priority} />
          {request.category && <span className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{request.category}</span>}
        </div>
      </div>

      {request.status !== "cancelled" && (
        <div className="flex items-center">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${i <= step ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-400"}`}>{i < step ? "✓" : i + 1}</span>
                <span className={`text-[11px] whitespace-nowrap ${i <= step ? "text-slate-700 font-semibold" : "text-slate-400"}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-1.5 mb-4 rounded ${i < step ? "bg-orange-400" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-slate-50 p-4 space-y-2 text-sm text-slate-600">
        <p>🏢 {request.building?.name ?? "—"}{request.room ? ` · ${request.room}` : ""}</p>
        <p className="flex items-center gap-2"><Avatar user={request.reporter} size={22} /> แจ้งโดย {fullName(request.reporter)}</p>
        <p>📅 {thaiDate(request.created_at)} <span className="text-slate-400">({ago(request.created_at)})</span></p>
        {request.description && <p className="pt-2 border-t border-slate-200 text-slate-700">{request.description}</p>}
      </div>

      {(request as any).asset_id && (
        <a href={`/assets/${(request as any).asset_id}`} className="block text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 hover:bg-blue-100 transition">
          🏷️ ดูข้อมูลครุภัณฑ์ที่แจ้งซ่อม (รหัส / ประวัติ)
        </a>
      )}

      <div>
        <Label>รูปภาพที่แนบ {(request.photo_urls??[]).length > 0 && <span className="text-slate-400 font-normal">({request.photo_urls!.length})</span>}</Label>
        {(request.photo_urls??[]).length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {request.photo_urls!.map((url,i)=>(
              <img key={i} src={url} alt="" onClick={()=>setLightboxUrl(url)}
                className="w-full h-24 object-cover rounded-xl border border-slate-200 cursor-pointer hover:brightness-90 transition" loading="lazy" decoding="async" />
            ))}
          </div>
        ) : <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">📷 ไม่มีรูปภาพแนบ</p>}
      </div>

      {/* ★ ใครดูแลเรื่องนี้ */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="font-semibold text-slate-700 text-sm">ผู้รับผิดชอบเรื่องนี้</p>
        {assignees.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {assignees.map(u => (
              <span key={u.id} className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full pl-1 pr-3 py-0.5 text-xs font-semibold">
                <Avatar user={u} size={22} />{fullName(u)}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⏳ รอผู้รับเรื่องกดรับทราบ{recipients.length > 0 && <> · ส่งถึง: {recipients.map(fullName).join(", ")}</>}
          </div>
        )}
        {inspectorUsers.length > 0 && <p className="text-xs text-slate-500">🛠️ ครูดูแลตึกนี้ (อ้างอิง): {inspectorUsers.map(fullName).join(", ")}</p>}
      </div>

      {canAcknowledge && (
        <button onClick={handleAcknowledge} disabled={saving}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 shadow-sm transition">
          ✋ รับเรื่องนี้
        </button>
      )}

      {canEditDelete ? (
        <div className="flex gap-2 pt-1">
          <button onClick={()=>onEdit(request)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">✏️ แก้ไข</button>
          <button onClick={()=>onDelete(request.id)} className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">🗑️ ลบ</button>
        </div>
      ) : (isReporter && isLocked && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          🔒 รายการนี้มีผู้รับผิดชอบแล้ว จึงแก้ไขหรือลบไม่ได้ หากต้องการเปลี่ยนแปลงกรุณาติดต่อผู้ดูแลระบบ
        </p>
      ))}

      {canManage && (
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <p className="font-bold text-slate-700 text-sm">จัดการงานซ่อม</p>
          {canChangeStatus && (
            <div>
              <Label>สถานะ</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(STATUS_CFG).map(([k,v]) => (
                  <button key={k} type="button" onClick={()=>setStatus(k)}
                    className={`py-2 rounded-lg text-[12px] font-bold border transition ${status===k ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                    style={{ background: v.bg, color: v.color, borderColor: v.border, ...(status===k ? { ["--tw-ring-color" as any]: v.dot } : {}) }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {canReassign && (
            <div>
              <Label>มอบหมายให้ (เลือกได้หลายคน) {buildingRepairIds.length===0 && <span className="text-amber-600 font-normal text-xs">อาคารนี้ยังไม่ได้ตั้งครูดูแล · แสดงทุกคน</span>}</Label>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-1.5 bg-white">
                {assignableUsers.length === 0 && <p className="text-xs text-slate-400 px-2 py-1">ไม่มีรายชื่อให้เลือก</p>}
                {assignableUsers.map(u=>(
                  <label key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-orange-50 cursor-pointer">
                    <input type="checkbox" checked={assignedIds.includes(u.id)} onChange={()=>toggleAssignee(u.id)} className="w-4 h-4 accent-orange-500 shrink-0" />
                    <span className="text-sm text-slate-700">{fullName(u)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>งบโดยประมาณ (บาท)</Label>
              <input type="number" value={estimatedCost} onChange={e=>setEstimatedCost(e.target.value)} placeholder="เช่น 3500" className={inputCls()} /></div>
            <div><Label>แหล่งงบประมาณ</Label>
              <input type="text" value={budgetSource} onChange={e=>setBudgetSource(e.target.value)} placeholder="เช่น งบดำเนินงาน" className={inputCls()} /></div>
          </div>
          {canChangeStatus && (
            <div><Label>ข้อความถึงผู้แจ้ง <span className="text-slate-400 font-normal">(แนบไปกับแจ้งเตือน Teams)</span></Label>
              <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="เช่น สั่งอะไหล่แล้ว คาดว่าเสร็จวันศุกร์" className={inputCls()} /></div>
          )}
          <button onClick={handleUpdate} disabled={saving} className={btnBlue + " w-full"}>{saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</button>
        </div>
      )}

      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={()=>setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
          <button onClick={()=>setLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white text-xl flex items-center justify-center">✕</button>
        </div>
      )}
    </ModalShell>
  );
}

// ── RequestCard ───────────────────────────────────────────────────────────────
function RequestCard({ r, allUsers, onOpen }: { r: RepairRequest; allUsers: User[]; onOpen: () => void }) {
  const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
  const ids = assignedIdsOf(r);
  const assignees = allUsers.filter(u => ids.includes(u.id));
  return (
    <button onClick={onOpen} className="w-full text-left bg-white rounded-2xl border border-slate-200 hover:border-orange-300 hover:shadow-md transition overflow-hidden flex">
      <span className="w-1.5 shrink-0" style={{ background: cfg.dot }} />
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-[15px]">{r.title}</span>
              <PriorityTag priority={r.priority} />
            </div>
            <p className="text-[13px] text-slate-500 mt-1">
              🏢 {r.building?.name ?? "—"}{r.room ? ` · ${r.room}` : ""}
              {r.category && <span className="ml-2 text-slate-400">· {r.category}</span>}
            </p>
          </div>
          <StatusPill status={r.status} />
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 min-w-0 text-xs text-slate-500">
            <Avatar user={r.reporter} size={22} />
            <span className="truncate">{fullName(r.reporter)} · {ago(r.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(r.photo_urls ?? []).length > 0 && (
              <div className="flex -space-x-2">
                {r.photo_urls!.slice(0,3).map((url,i)=><img key={i} src={url} alt="" className="w-8 h-8 object-cover rounded-lg border-2 border-white" loading="lazy" decoding="async" />)}
                {r.photo_urls!.length > 3 && <span className="w-8 h-8 rounded-lg border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-center">+{r.photo_urls!.length-3}</span>}
              </div>
            )}
          </div>
        </div>
        {r.status !== "completed" && r.status !== "cancelled" && (
          <p className={`mt-2.5 text-xs font-medium rounded-lg px-2.5 py-1.5 ${assignees.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {assignees.length ? `✋ ดูแลโดย ${assignees.map(u => u.first_name).join(", ")}` : "⏳ รอผู้รับผิดชอบรับเรื่อง"}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const router = useRouter();
  const [user,         setUser]        = useState<User|null>(null);
  const [loading,      setLoading]     = useState(true);
  const [buildings,    setBuildings]   = useState<Building[]>([]);
  const [requests,     setRequests]    = useState<RepairRequest[]>([]);
  const [managers,     setManagers]    = useState<ProjectManager[]>([]);
  const [allUsers,     setAllUsers]    = useState<User[]>([]);
  const [director,     setDirector]    = useState<User|undefined>();
  const [tab,          setTab]         = useState<"dashboard"|"list"|"mine"|"team">("list");
  const [filterStatus, setFilterStatus]= useState("");
  const [filterBldg,   setFilterBldg]  = useState("");
  const [query,        setQuery]       = useState("");
  const [onlyMyBuildings, setOnlyMyBuildings] = useState(false);
  const [showForm,     setShowForm]    = useState(false);
  const [editingReq,   setEditingReq]  = useState<RepairRequest|null>(null);
  const [showManagers, setShowManagers]= useState(false);
  const [showMemo,     setShowMemo]    = useState(false);
  const [detailReq,    setDetailReq]   = useState<RepairRequest|null>(null);
  const [routes, setRoutes] = useState<RepairRoute[]>([]);
  const [shown, setShown] = useState(30);   // ★ แสดงทีละ 30 รายการ
  useEffect(()=>{ setShown(30); },[query,filterStatus,filterBldg,onlyMyBuildings]);

  const isAdmin       = useMemo(()=>ADMIN_ROLES.includes(user?.role??""),[user]);
  const isProjManager = useMemo(()=>managers.some(m=>m.user_id===user?.id),[managers,user]);
  const myBuildingIds = useMemo(()=>{
    if (!user) return new Set<string>();
    return new Set(buildings.filter(b=>(b.repair_user_ids??[]).includes(user.id)).map(b=>b.id));
  },[buildings,user]);
  const isBuildingManager = myBuildingIds.size > 0;
  const canSeeAll = isAdmin || isProjManager;
  const isMemoEditor = useMemo(() => MEMO_EDITOR_EMAILS.includes((user?.email ?? "").toLowerCase()), [user]);
  const canMemo = canSeeAll || isMemoEditor;

  useEffect(()=>{
    const init=async()=>{
      const {data:{user:au}}=await supabase.auth.getUser();
      if (!au){setLoading(false);return;}
      let {data}=await supabase.from("users")
        .select("id,first_name,last_name,title,role,position,signature_url,email")
        .eq("auth_id",au.id).maybeSingle();
      if (!data&&au.email){
        const r=await supabase.from("users")
          .select("id,first_name,last_name,title,role,position,signature_url,email")
          .eq("email",au.email).maybeSingle();
        data=r.data;
        if (data) await supabase.from("users").update({auth_id:au.id}).eq("id",(data as any).id);
      }
      if (data) setUser(data as User);
      setLoading(false);
    };
    init();
  },[]);

  const REQ_COLS = "id,title,description,building_id,room,category,status,priority,photo_urls,reporter_id,assigned_to,assigned_user_ids,estimated_cost,budget_source,asset_id,created_at,updated_at,completed_at";

  // ★ ยิงทุก query พร้อมกัน และอัปเดตหน้าจอทันทีที่แต่ละส่วนมาถึง (รายการแจ้งซ่อมขึ้นก่อน ไม่ต้องรอส่วนอื่น)
  //   ไม่ดึง signature_url ของผู้ใช้ทุกคน (เป็น base64 ก้อนใหญ่ ทำให้ช้า) — ดึงเฉพาะของ ผอ. ตอนเปิดบันทึกข้อความ
  const loadData=useCallback(async()=>{
    if (!user) return;
    const pReq = supabase.from("repair_requests")
      .select(`${REQ_COLS},reporter:users!reporter_id(id,first_name,last_name,title),building:buildings(id,name,repair_user_ids,inspector_user_ids)`)
      .order("created_at",{ascending:false}).limit(300)
      .then(({data})=>setRequests((data??[]) as unknown as RepairRequest[]));
    const pBld = supabase.from("buildings").select("id,name,description,repair_user_ids,inspector_user_ids").order("name")
      .then(({data})=>setBuildings((data??[]) as Building[]));
    const pRoutes = supabase.from("repair_category_routes").select("id,category,user_id")
      .then(({data})=>setRoutes((data??[]) as RepairRoute[]));
    const pPeople = Promise.all([
      supabase.from("users").select("id,first_name,last_name,title,role,position").order("first_name"),
      supabase.from("repair_project_managers").select("*"),
    ]).then(([u,m])=>{
      const users=(u.data??[]) as User[];
      setAllUsers(users);
      if (m.error) console.error("[repair] โหลด repair_project_managers ไม่สำเร็จ:", m.error.message);
      const uMap: Record<string,User> = Object.fromEntries(users.map(x=>[x.id,x]));
      setManagers(((m.data??[]) as any[]).map(x=>({ ...x, user: uMap[x.user_id] })) as ProjectManager[]);
    });
    await Promise.all([pReq,pBld,pRoutes,pPeople]);
  },[user]);

  // ★ ดึงข้อมูล ผอ. (รวมลายเซ็น) เฉพาะตอนเปิดหน้าบันทึกข้อความ
  useEffect(()=>{
    if (!showMemo || director) return;
    supabase.from("users").select("id,first_name,last_name,title,role,position,signature_url")
      .eq("role","director").limit(1).maybeSingle()
      .then(({data})=>{ if (data) setDirector(data as User); });
  },[showMemo,director]);

  useEffect(()=>{if(!loading&&user) loadData();},[loading,user,loadData]);

  // ★ ทุกคนเห็นรายการทั้งโรงเรียน (กันแจ้งซ้ำ) — กรองด้วยค้นหา/อาคาร/ตึกที่ฉันดูแล ก่อน แล้วค่อยแยกตามสถานะ
  const baseList = useMemo(()=>{
    let list = requests;
    if (onlyMyBuildings && isBuildingManager) list = list.filter(r => myBuildingIds.has(r.building_id ?? ""));
    if (filterBldg) list = list.filter(r => r.building_id === filterBldg);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(r =>
      [r.title, r.room, r.category, r.building?.name, fullName(r.reporter)].some(v => (v ?? "").toLowerCase().includes(q)));
    return list;
  },[requests,onlyMyBuildings,isBuildingManager,myBuildingIds,filterBldg,query]);

  const visibleRequests = useMemo(()=> filterStatus ? baseList.filter(r=>r.status===filterStatus) : baseList, [baseList,filterStatus]);
  const statusCount = (s: string) => baseList.filter(r=>r.status===s).length;

  const myRequests = useMemo(()=>requests.filter(r=>r.reporter_id===user?.id),[requests,user]);

  const stats = useMemo(()=>{
    const base = canSeeAll ? requests : myRequests;
    return {
      total:       base.length,
      pending:     base.filter(r=>r.status==="pending").length,
      in_progress: base.filter(r=>r.status==="in_progress").length,
      completed:   base.filter(r=>r.status==="completed").length,
    };
  },[requests,myRequests,canSeeAll]);

  const handleDeleteRequest = useCallback(async (id: string) => {
    if (!confirm("ยืนยันการลบรายการแจ้งซ่อมนี้? เมื่อลบแล้วจะไม่สามารถกู้คืนได้")) return;
    const { error } = await supabase.from("repair_requests").delete().eq("id", id);
    if (error) { alert("❌ ลบไม่สำเร็จ: " + error.message); return; }
    setDetailReq(null);
    await loadData();
  },[loadData]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 animate-pulse text-lg">กำลังโหลด...</p>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-lg">กรุณาเข้าสู่ระบบ</p>
    </div>
  );

  const tabs: [typeof tab, string][] = [
    ["list", "📋 รายการทั้งหมด"],
    ["mine", "📌 ของฉัน"],
    ...(canSeeAll ? [["dashboard","📊 แดชบอร์ด"] as [typeof tab,string]] : []),
    ["team", "👥 ใครดูแลอะไร"],
  ];

  const statCards = [
    { label: canSeeAll ? "ทั้งหมด" : "ของฉัน", value: stats.total, icon: "📋" },
    { label: "รอดำเนินการ", value: stats.pending, icon: "⏳" },
    { label: "กำลังซ่อม", value: stats.in_progress, icon: "🔧" },
    { label: "เสร็จแล้ว", value: stats.completed, icon: "✅" },
  ];

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {/* ── Header ── */}
      <header className="bg-gradient-to-br from-orange-500 to-amber-500 text-white shrink-0">
        <div className="w-full px-3 sm:px-4 pt-4 pb-5">
          <div className="flex items-center gap-3">
            <button onClick={()=>router.push("/dashboard")} aria-label="กลับหน้าหลัก"
              className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-lg shrink-0 transition">🏠</button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-xl leading-tight">ระบบแจ้งซ่อม</h1>
              <p className="text-orange-50 text-sm truncate">
                {fullName(user)}{isProjManager ? " · ผู้ดูแลโครงการ" : isBuildingManager && !canSeeAll ? " · ผู้ดูแลอาคาร" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {isAdmin && <button onClick={()=>setShowManagers(true)} className="px-3 py-2 bg-white/20 hover:bg-white/30 text-xs font-bold rounded-xl transition">⚙️ <span className="hidden sm:inline">ตั้งค่า</span></button>}
              {canMemo && <button onClick={()=>setShowMemo(true)} className="px-3 py-2 bg-white/20 hover:bg-white/30 text-xs font-bold rounded-xl transition">📄 <span className="hidden sm:inline">บันทึกข้อความ</span></button>}
              <button onClick={()=>setShowForm(true)} className="px-4 py-2 bg-white text-orange-600 text-sm font-bold rounded-xl shadow hover:bg-orange-50 transition">+ แจ้งซ่อม</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mt-4">
            {statCards.map(s => (
              <div key={s.label} className="bg-white/15 backdrop-blur rounded-2xl px-3 py-2.5">
                <div className="text-2xl font-black leading-none">{s.value}</div>
                <div className="text-[11px] sm:text-xs text-orange-50 mt-1">{s.icon} {s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-20">
        <div className="w-full flex overflow-x-auto px-1">
          {tabs.map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              className={`px-4 sm:px-5 py-3.5 text-sm font-bold border-b-[3px] whitespace-nowrap transition
                ${tab===k?"border-orange-500 text-orange-600":"border-transparent text-slate-400 hover:text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1">
        {/* ── Dashboard ── */}
        {tab==="dashboard" && canSeeAll && (
          <div className="w-full p-2 sm:p-3 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-bold text-slate-800">สรุปรายอาคาร</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-500 text-xs bg-slate-50">
                    {["อาคาร","รอดำเนินการ","กำลังซ่อม","เสร็จแล้ว","ความคืบหน้า"].map(h=><th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {buildings.map(b=>{
                      const bReqs=requests.filter(r=>r.building_id===b.id);
                      const done=bReqs.filter(r=>r.status==="completed").length;
                      const pct=bReqs.length?Math.round(done/bReqs.length*100):0;
                      return (
                        <tr key={b.id}>
                          <td className="px-4 py-3 font-semibold text-slate-800">{b.name}</td>
                          <td className="px-4 py-3 text-amber-600 font-bold">{bReqs.filter(r=>r.status==="pending").length}</td>
                          <td className="px-4 py-3 text-blue-600 font-bold">{bReqs.filter(r=>r.status==="in_progress").length}</td>
                          <td className="px-4 py-3 text-emerald-600 font-bold">{done}</td>
                          <td className="px-4 py-3 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{width:`${pct}%`}} /></div>
                              <span className="text-xs text-slate-500 w-12 text-right">{done}/{bReqs.length}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">รอดำเนินการ ({stats.pending})</h3>
                <button onClick={()=>{setFilterStatus("pending");setTab("list");}} className="text-xs text-orange-600 font-bold hover:underline">ดูทั้งหมด</button>
              </div>
              <div className="divide-y divide-slate-100">
                {requests.filter(r=>r.status==="pending").slice(0,5).map(r=>(
                  <button key={r.id} onClick={()=>setDetailReq(r)} className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{r.title}</p>
                      <p className="text-xs text-slate-400">{r.building?.name} · {ago(r.created_at)}</p>
                    </div>
                    <PriorityTag priority={r.priority} />
                  </button>
                ))}
                {stats.pending===0&&<div className="px-5 py-8 text-center text-slate-400 text-sm">ไม่มีรายการรอดำเนินการ 🎉</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── List ── */}
        {tab==="list" && (
          <div className="w-full p-2 sm:p-3 space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="🔍 ค้นหาหัวข้อ ห้อง ผู้แจ้ง..." className={inputCls()} />
                <select value={filterBldg} onChange={e=>setFilterBldg(e.target.value)} className={inputCls() + " sm:max-w-[200px]"}>
                  <option value="">ทุกอาคาร</option>
                  {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button onClick={()=>setFilterStatus("")}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${!filterStatus?"bg-slate-800 text-white border-slate-800":"bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  ทั้งหมด {baseList.length}
                </button>
                {Object.entries(STATUS_CFG).map(([k,v])=>(
                  <button key={k} onClick={()=>setFilterStatus(filterStatus===k?"":k)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition"
                    style={filterStatus===k ? {background:v.dot,color:"#fff",borderColor:v.dot} : {background:v.bg,color:v.color,borderColor:v.border}}>
                    {v.label} {statusCount(k)}
                  </button>
                ))}
                {isBuildingManager && (
                  <button onClick={()=>setOnlyMyBuildings(v=>!v)}
                    className={`ml-auto px-3 py-1.5 text-xs font-bold rounded-full border whitespace-nowrap transition ${onlyMyBuildings ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-orange-300"}`}>
                    🏢 ตึกที่ฉันดูแล
                  </button>
                )}
              </div>
            </div>

            {visibleRequests.length===0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
                <p className="text-4xl mb-2">🔧</p>
                <p className="text-sm">ไม่พบรายการแจ้งซ่อมที่ตรงกับตัวกรอง</p>
                {(query||filterStatus||filterBldg||onlyMyBuildings) && (
                  <button onClick={()=>{setQuery("");setFilterStatus("");setFilterBldg("");setOnlyMyBuildings(false);}} className="mt-3 text-xs text-orange-600 font-bold underline">ล้างตัวกรอง</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {visibleRequests.slice(0, shown).map(r=><RequestCard key={r.id} r={r} allUsers={allUsers} onOpen={()=>setDetailReq(r)} />)}
              </div>
            )}
            {visibleRequests.length > shown && (
              <button onClick={()=>setShown(n=>n+30)} className="w-full py-3 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
                แสดงเพิ่ม (เหลืออีก {visibleRequests.length - shown} รายการ)
              </button>
            )}
          </div>
        )}

        {/* ── Mine ── */}
        {tab==="mine" && (
          <div className="w-full p-2 sm:p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">รายการแจ้งซ่อมของฉัน ({myRequests.length})</h2>
              <button onClick={()=>setShowForm(true)} className={btnPrimary}>+ แจ้งซ่อม</button>
            </div>
            {myRequests.length===0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-sm">คุณยังไม่เคยแจ้งซ่อม — กด “+ แจ้งซ่อม” เพื่อเริ่มต้น</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {myRequests.map(r=><RequestCard key={r.id} r={r} allUsers={allUsers} onOpen={()=>setDetailReq(r)} />)}
              </div>
            )}
          </div>
        )}

        {tab==="team" && <ResponsibilityPanel buildings={buildings} managers={managers} routes={routes} allUsers={allUsers} />}
      </main>

      {(showForm || editingReq) && (
        <RepairFormModal buildings={buildings} currentUser={user} existing={editingReq}
          onSave={async()=>{setShowForm(false);setEditingReq(null);await loadData();}}
          onClose={()=>{setShowForm(false);setEditingReq(null);}} />
      )}
      {showManagers && (
        <ManagersModal currentUser={user} allUsers={allUsers} managers={managers} routes={routes}
          onClose={()=>setShowManagers(false)} onRefresh={loadData} />
      )}
      {showMemo && (
        <MemoModal requests={visibleRequests.filter(r=>r.status!=="completed")}
          buildings={buildings} currentUser={user} director={director}
          onClose={()=>setShowMemo(false)} />
      )}
      {detailReq && (
        <DetailModal request={detailReq} allUsers={allUsers}
          currentUserId={user.id} isAdmin={isAdmin} isProjManager={isProjManager}
          recipients={resolveRecipients(detailReq.category, detailReq.building, managers, allUsers, routes)}
          isMemoEditor={isMemoEditor}
          onEdit={(r)=>{setDetailReq(null); setEditingReq(r);}}
          onDelete={handleDeleteRequest}
          onUpdate={async()=>{setDetailReq(null);await loadData();}}
          onClose={()=>setDetailReq(null)} />
      )}
    </div>
  );
}