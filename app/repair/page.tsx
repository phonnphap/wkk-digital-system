"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { th } from "date-fns/locale";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface User {
  id: string; first_name: string; last_name: string;
  title?: string; role: string; position?: string; signature_url?: string;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fullName(u?: User | null) {
  if (!u) return "—";
  return `${u.title ?? ""} ${u.first_name} ${u.last_name}`.trim();
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

// ★ แก้: 'resolved' -> 'completed' ให้ตรงกับ enum ค่าจริงใน DB (pending, in_progress, completed, cancelled)
const STATUS_CFG: Record<string,{label:string;color:string;bg:string;border:string}> = {
  pending:     { label:"รอดำเนินการ", color:"#92400e", bg:"#fef3c7", border:"#fcd34d" },
  in_progress: { label:"กำลังซ่อม",  color:"#1e40af", bg:"#dbeafe", border:"#93c5fd" },
  completed:   { label:"เสร็จแล้ว",  color:"#065f46", bg:"#d1fae5", border:"#6ee7b7" },
  cancelled:   { label:"ยกเลิก",     color:"#6b7280", bg:"#f3f4f6", border:"#d1d5db" },
};
const PRIORITY_CFG: Record<string,{label:string;color:string}> = {
  low:    { label:"ต่ำ",    color:"#6b7280" },
  medium: { label:"ปานกลาง",color:"#d97706" },
  high:   { label:"เร่งด่วน",color:"#dc2626" },
};
const CATEGORIES = ["ระบบไฟฟ้า","ระบบประปา","ประตู/หน้าต่าง","พื้น/ฝ้า/ผนัง","เฟอร์นิเจอร์","คอมพิวเตอร์/อุปกรณ์","เครือข่ายอินเตอร์เน็ต","ห้องน้ำ","อื่นๆ"];

// ★ หมวดหมู่ที่ต้องแจ้งเตือนอีเมลเฉพาะทาง (ต้องมีสิทธิ์ Mail.Send ใน Azure App ถึงจะส่งได้จริง)
const CATEGORY_NOTIFY_EMAIL: Record<string,string> = {
  "เครือข่ายอินเตอร์เน็ต": "sirilack@khienkhet.ac.th",
};

// ★ หมวดหมู่ที่ต้องมอบหมายงานให้ครูที่รับผิดชอบทันทีตอนแจ้งซ่อม (ล็อกไม่ให้ครูผู้แจ้งแก้ไข/ลบเองอัตโนมัติ)
const CATEGORY_AUTO_ASSIGN: Record<string,string> = {
  "เครือข่ายอินเตอร์เน็ต": "76c71d91-9064-42a6-a54f-3a5be184301f", // sirilack@khienkhet.ac.th
};

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
    // ตัดเป็นช่วงล้าน
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

// ── PDF Generator ─────────────────────────────────────────────────────────────
// ★ เขียนใหม่ทั้งหมดให้ตรงกับเทมเพลตราชการ "บันทึกข้อความแจ้งซ่อมสายชั้น" ตามตัวอย่างที่แนบ
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
}) {
  const {
    items, subject, reporterName, reporterPosition, gradeLevel, budgetSource,
    totalAmount, attachmentCount, directorName, directorSignUrl,
    creatorSignUrl, dateStr, memoNo, department, logoUrl,
  } = params;

  const itemLines = items.map((it,i) =>
    `<div style="margin:2px 0">${toThaiDigits(i+1)}. ${it.title}${it.detail ? ` (${it.detail})` : ""} จำนวน ${it.amount ? toThaiDigits(it.amount.toLocaleString("th-TH")) : "…………"} บาท</div>`
  ).join("");

  // ★ กล่อง "ตรวจเสนอ" เป็นรายการคงที่ตามแบบฟอร์มราชการจริง (เอาส่วนเลือกได้มากกว่า 1 ตำแหน่งออกแล้ว)
  //   เพิ่มหัวข้อ "ตรวจเสนอ" ที่มุมบนของกล่อง ให้ตรงกับเอกสารต้นฉบับ (เดิมขาดหายไป)
  const routingBoxes = `<div style="font-weight:bold;margin-bottom:4px">ตรวจเสนอ</div>` +
    ROUTING_LABELS.map(label => `
    <div style="margin:3px 0">.................... ${label}</div>`).join("") +
    `<div style="margin:3px 0">....................</div>`;

  // ★ หน้าที่ 2: ภาพแนบตามรายการที่เลือก พร้อมชื่อรายการด้านล่างภาพ
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
    @page { size: A4 portrait; margin: 20mm 25mm; }
    body { font-family:'TH Sarabun New','THSarabunPSK','Sarabun',sans-serif; font-size:16pt; color:#111; line-height:1.5; }
    .header { text-align:center; margin-bottom:6px; }
    .header img { height:65px; display:block; margin:0 auto 4px; }
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
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`;
}

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
  // ★ จำนวนเงินต่อรายการ — ดึงจาก estimated_cost ที่บันทึกไว้แล้ว (ถ้ามี) ให้แก้ต่อได้ตอนสร้างบันทึก
  const [amounts, setAmounts] = useState<Record<string,string>>(
    () => Object.fromEntries(requests.map(r => [r.id, (r as any).estimated_cost != null ? String((r as any).estimated_cost) : ""]))
  );
  const checkedCount = Object.values(selected).filter(Boolean).length;
  const totalAmount = requests
    .filter(r => selected[r.id])
    .reduce((sum, r) => sum + (Number(amounts[r.id]) || 0), 0);
  const attachmentCount = requests
    .filter(r => selected[r.id])
    .reduce((sum, r) => sum + (r.photo_urls?.length ?? 0), 0);

  const handlePrint = () => {
    const items = requests
      .filter(r => selected[r.id])
      .map((r,i) => ({
        no: i+1,
        title: r.title,
        detail: [r.building?.name, r.room].filter(Boolean).join(" · "),
        amount: Number(amounts[r.id]) || 0,
        photos: r.photo_urls ?? [],
      }));
    if (items.length === 0) { alert("กรุณาเลือกรายการอย่างน้อย 1 รายการ"); return; }
    // ★ ใช้ origin ของหน้าปัจจุบันประกอบ URL ตราครุฑ (public/images.jpg) กันปัญหา relative path ในหน้าต่างที่เปิดใหม่
    const logoUrl = typeof window !== "undefined" ? `${window.location.origin}/images.jpg` : "/images.jpg";
    const html = generateMemoHTML({
      items,
      subject,
      reporterName: fullName(currentUser),
      reporterPosition,
      gradeLevel,
      budgetSource,
      totalAmount,
      attachmentCount,
      directorName: fullName(director),
      directorSignUrl: director?.signature_url ?? "",
      creatorSignUrl: currentUser.signature_url ?? "",
      dateStr: thaiDateFull(memoDate),
      memoNo,
      department,
      logoUrl,
    });
    const w = window.open("","_blank","width=900,height=780");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">📄 สร้างบันทึกข้อความแจ้งซ่อม</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">เลขที่หนังสือ</label>
              <input type="text" value={memoNo} onChange={e=>setMemoNo(e.target.value)}
                placeholder="เช่น ศธ 04002/2569-001"
                className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">วันที่</label>
              <input type="date" value={memoDate} onChange={e=>setMemoDate(e.target.value)}
                className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ส่วนราชการ</label>
            <input type="text" value={department} onChange={e=>setDepartment(e.target.value)}
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">เรื่อง</label>
            <input type="text" value={subject} onChange={e=>setSubject(e.target.value)}
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ระดับชั้น/ห้อง</label>
              <input type="text" value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)}
                placeholder="เช่น ม.2/3" className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ตำแหน่งผู้เสนอ</label>
              <input type="text" value={reporterPosition} onChange={e=>setReporterPosition(e.target.value)}
                placeholder="เช่น หัวหน้าสายชั้น ม.2" className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">แหล่งงบประมาณ</label>
            <input type="text" value={budgetSource} onChange={e=>setBudgetSource(e.target.value)}
              placeholder="เช่น งบประมาณรายได้สถานศึกษา / งบดำเนินงาน"
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                เลือกรายการที่ต้องการรวม ({checkedCount}/{requests.length})
              </label>
              <div className="flex gap-2">
                <button onClick={()=>setSelected(Object.fromEntries(requests.map(r=>[r.id,true])))}
                  className="text-xs text-blue-500 font-bold hover:underline">เลือกทั้งหมด</button>
                <button onClick={()=>setSelected(Object.fromEntries(requests.map(r=>[r.id,false])))}
                  className="text-xs text-slate-400 font-bold hover:underline">ล้าง</button>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {requests.map((r,i) => (
                <div key={r.id} className={`p-3 rounded-xl border-2 transition-all
                  ${selected[r.id] ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={!!selected[r.id]}
                      onChange={e=>setSelected(prev=>({...prev,[r.id]:e.target.checked}))}
                      className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 text-sm">{i+1}. {r.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {r.building?.name ?? "—"}{r.room ? ` · ${r.room}` : ""}
                        {r.photo_urls?.length ? ` · 📷 ${r.photo_urls.length} รูป` : ""}
                      </div>
                    </div>
                  </label>
                  {selected[r.id] && (
                    <div className="mt-2 ml-7 flex items-center gap-2">
                      <span className="text-xs text-slate-400 shrink-0">จำนวนเงิน (บาท)</span>
                      <input type="number" value={amounts[r.id] ?? ""} onChange={e=>setAmounts(prev=>({...prev,[r.id]:e.target.value}))}
                        placeholder="0" className="w-32 border-2 border-blue-200 rounded-lg px-2 py-1 text-sm bg-white focus:border-blue-500 focus:outline-none" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center justify-between">
            <span className="font-bold">รวมเป็นเงินทั้งสิ้น</span>
            <span className="font-black text-base">{totalAmount.toLocaleString("th-TH")} บาท</span>
          </div>

          <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
            <p className="font-bold mb-1">ข้อมูลผู้อนุมัติ</p>
            <p>ผู้อำนวยการ: {fullName(director) || "นายธนณัฐ  ศิระวงษ์"}</p>
            <p className="text-xs text-slate-400 mt-1">📎 จำนวนภาพแนบรวม: {attachmentCount} รูป (นับอัตโนมัติจากรายการที่เลือก)</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handlePrint} disabled={checkedCount===0}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
            🖨️ พิมพ์บันทึกข้อความ ({checkedCount} รายการ)
          </button>
        </div>
      </div>
    </div>
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
  const [uploading,   setUploading]  = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [errors,      setErrors]     = useState<Record<string,boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const e: Record<string,boolean> = {};
    if (!title.trim()) e.title = true;
    if (!buildingId) e.buildingId = true;
    if (!category) e.category = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const MAX_IMAGES = 4;

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

      const reader = new FileReader();
      reader.onload = e => {
        if (e.target?.result) setImagePreviews(prev => [...prev, e.target!.result as string]);
      };
      reader.readAsDataURL(file);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("account", "general@khienkhet.ac.th");
        formData.append("folder", "WKK_Repair_System");
        formData.append("fileName", `repair-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`);

        const res = await fetch("/api/upload-onedrive", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(()=>({}));
          console.error("upload-onedrive error:", err);
          alert("อัปโหลดไม่สำเร็จ: " + JSON.stringify(err.error ?? err ?? res.statusText));
          setImagePreviews(prev => prev.slice(0, -1));
          continue;
        }
        const { url, itemId } = await res.json();
        setImageUrls(prev => [...prev, url ?? itemId]);
      } catch (e: any) {
        alert("อัปโหลดไม่สำเร็จ: " + e.message);
        setImagePreviews(prev => prev.slice(0, -1));
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  function removeImage(i: number) {
    setImageUrls(prev => prev.filter((_,j) => j !== i));
    setImagePreviews(prev => prev.filter((_,j) => j !== i));
  }

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    // ★ แก้: payload ตรงกับสคีมาจริงของ repair_requests แล้ว
    //   - photo_urls (jsonb) แทน image_urls (คอลัมน์เดิมถูกลบไปแล้ว)
    //   - ไม่ส่ง ticket_no / location เพราะมี default ให้แล้วที่ฝั่ง DB
    // ★ บางหมวดหมู่ (เช่น เครือข่ายอินเตอร์เน็ต) ต้องมอบหมายงานให้ครูที่รับผิดชอบทันทีตอนแจ้งซ่อม
    //   ถ้ายังไม่เคยมีการมอบหมายไว้ก่อน (assigned_to ว่าง) ให้ใช้ค่าจาก CATEGORY_AUTO_ASSIGN แทน
    const autoAssignId = CATEGORY_AUTO_ASSIGN[category];
    const payload = {
      title: title.trim(), description: desc.trim(), building_id: buildingId,
      room: room.trim(), category, priority, photo_urls: imageUrls,
      reporter_id: currentUser.id, status: existing?.status ?? "pending",
      assigned_to: existing?.assigned_to ?? autoAssignId ?? null,
    };
    const isNewRequest = !existing?.id;
    if (existing?.id) {
      const { error } = await supabase.from("repair_requests").update(payload).eq("id", existing.id);
      if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("repair_requests").insert([payload]);
      if (error) { alert("❌ แจ้งซ่อมไม่สำเร็จ: " + error.message); setSaving(false); return; }
    }

    // ★ แจ้งเตือนอีเมลเฉพาะหมวดหมู่ที่ตั้งไว้ (เช่น เครือข่ายอินเตอร์เน็ต -> sirilack@)
    //   ยิงแบบ fire-and-forget ห่อด้วย try/catch ทั้งหมด กันไม่ให้กระทบการบันทึกหลัก
    //   ถ้า Azure App ยังไม่มีสิทธิ์ Mail.Send จะแค่เงียบๆ ไม่ได้ส่ง ไม่ทำให้ฟอร์มพัง
    const notifyEmail = CATEGORY_NOTIFY_EMAIL[category];
    if (notifyEmail) {
      fetch("/api/notify-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: notifyEmail,
          subject: `แจ้งซ่อม: ${title.trim()}`,
          body: `มีการแจ้งซ่อมหมวดหมู่ "${category}"\n\nหัวข้อ: ${title.trim()}\nรายละเอียด: ${desc.trim() || "-"}\nผู้แจ้ง: ${fullName(currentUser)}\nอาคาร: ${buildings.find(b=>b.id===buildingId)?.name ?? "-"} ${room.trim()}\n\nกรุณาเข้าระบบแจ้งซ่อมเพื่อดำเนินการต่อ`,
        }),
      }).catch((e) => console.warn("[repair] ส่งอีเมลแจ้งเตือนไม่สำเร็จ (ไม่กระทบการบันทึก):", e));
    }

    // ★ เด้งเตือนครูที่รับผิดชอบอาคารนี้ทันที (จาก buildings.repair_user_ids) เฉพาะตอนแจ้งซ่อมใหม่
    //   ดึงอีเมลของครูดูแลอาคารแยกอีกครั้ง (allUsers ที่โหลดไว้ปกติไม่มี email) แล้วยิงอีเมลแจ้งเตือนทีละคน
    //   fire-and-forget ทั้งหมด ไม่กระทบการบันทึกหลักหากส่งไม่สำเร็จ
    if (isNewRequest) {
      const bld = buildings.find(b => b.id === buildingId);
      const repairIds = (bld as any)?.repair_user_ids ?? [];
      if (repairIds.length > 0) {
        supabase.from("users").select("email,first_name,last_name,title")
          .in("id", repairIds)
          .then(({ data: teachers, error: tErr }) => {
            if (tErr) { console.warn("[repair] โหลดรายชื่อครูดูแลอาคารไม่สำเร็จ:", tErr.message); return; }
            (teachers ?? []).forEach((t: any) => {
              if (!t.email) return;
              fetch("/api/notify-repair", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: t.email,
                  subject: `🔧 แจ้งซ่อมใหม่ในอาคารที่ท่านดูแล: ${title.trim()}`,
                  body: `มีการแจ้งซ่อมใหม่ในอาคาร "${bld?.name ?? "-"}" ซึ่งท่านเป็นผู้รับผิดชอบดูแล\n\nหัวข้อ: ${title.trim()}\nหมวดหมู่: ${category}\nห้อง/บริเวณ: ${room.trim() || "-"}\nความเร่งด่วน: ${PRIORITY_CFG[priority]?.label ?? priority}\nรายละเอียด: ${desc.trim() || "-"}\nผู้แจ้ง: ${fullName(currentUser)}\n\nกรุณาเข้าระบบแจ้งซ่อมเพื่อดำเนินการต่อ`,
                }),
              }).catch((e) => console.warn("[repair] ส่งอีเมลเตือนครูดูแลอาคารไม่สำเร็จ (ไม่กระทบการบันทึก):", e));
            });
          });
      }
    }

    setSaving(false);
    onSave();
  };

  const iCls = (err?: boolean) =>
    `w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none bg-white transition-colors
    ${err ? "border-red-400 bg-red-50" : "border-blue-200 focus:border-blue-500 text-slate-800"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">{existing ? "✏️ แก้ไขรายการ" : "🔧 แจ้งซ่อม"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">หัวข้อ <span className="text-red-400">*</span></label>
            <input type="text" value={title} onChange={e=>setTitle(e.target.value)}
              placeholder="เช่น ไฟฟ้าดับห้อง 101" className={iCls(errors.title)} />
            {errors.title && <p className="text-xs text-red-500 mt-1">กรุณากรอกหัวข้อ</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">อาคาร <span className="text-red-400">*</span></label>
              <select value={buildingId} onChange={e=>setBuildingId(e.target.value)} className={iCls(errors.buildingId)}>
                <option value="">— เลือกอาคาร —</option>
                {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {errors.buildingId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกอาคาร</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ห้อง/บริเวณ</label>
              <input type="text" value={room} onChange={e=>setRoom(e.target.value)}
                placeholder="เช่น ห้อง 101" className={iCls()} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">หมวดหมู่ <span className="text-red-400">*</span></label>
              <select value={category} onChange={e=>setCategory(e.target.value)} className={iCls(errors.category)}>
                <option value="">— เลือก —</option>
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              {errors.category && <p className="text-xs text-red-500 mt-1">กรุณาเลือกหมวดหมู่</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">ความเร่งด่วน</label>
              <select value={priority} onChange={e=>setPriority(e.target.value)} className={iCls()}>
                <option value="low">🟢 ต่ำ</option>
                <option value="medium">🟡 ปานกลาง</option>
                <option value="high">🔴 เร่งด่วน</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">รายละเอียด</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3}
              placeholder="อธิบายปัญหาเพิ่มเติม..." className={iCls()+" resize-none"} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">รูปภาพประกอบ</label>
            {imageUrls.length < MAX_IMAGES && (
              <label className={`flex items-center gap-3 cursor-pointer bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl px-4 py-3 transition-colors ${uploading?"opacity-60":""} hover:border-blue-400`}>
                <span className="text-2xl">{uploading?"⏳":"📷"}</span>
                <div>
                  <p className="font-bold text-slate-600 text-sm">{uploading?"กำลังอัปโหลด...":"คลิกเพื่อแนบรูป"}</p>
                  <p className="text-slate-400 text-xs">ไม่เกิน 10MB · สูงสุด {MAX_IMAGES} รูป (เพิ่มได้อีก {MAX_IMAGES-imageUrls.length} รูป)</p>
                </div>
                <input ref={fileRef} type="file" multiple accept="image/*" disabled={uploading||imageUrls.length>=MAX_IMAGES}
                  onChange={handleUpload} className="hidden" />
              </label>
            )}
            {(imagePreviews.length > 0 || imageUrls.length > 0) && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {(imagePreviews.length > 0 ? imagePreviews : imageUrls).map((src,i)=>(
                  <div key={i} className="relative group aspect-square">
                    <img src={src} alt=""
                      className="w-full h-full object-cover rounded-xl border border-slate-200"
                      onClick={()=>window.open(imageUrls[i]??src,"_blank")} style={{cursor:"pointer"}}/>
                    <button onClick={()=>removeImage(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] hidden group-hover:flex items-center justify-center font-bold shadow">×</button>
                    {uploading && i===imagePreviews.length-1 && (
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                        <span className="text-white text-xs font-bold">⏳</span>
                      </div>
                    )}
                  </div>
                ))}
                {imageUrls.length < MAX_IMAGES && (
                  <label className="aspect-square border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors bg-slate-50">
                    <span className="text-2xl">📷</span>
                    <span className="text-xs text-slate-400 mt-1">{MAX_IMAGES - imageUrls.length} เพิ่มได้</span>
                    <input ref={fileRef} type="file" multiple accept="image/*" disabled={uploading}
                      onChange={handleUpload} className="hidden" />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : (existing ? "💾 บันทึก" : "📤 แจ้งซ่อม")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ManagersModal ─────────────────────────────────────────────────────────────
function ManagersModal({ currentUser, allUsers, managers, onClose, onRefresh }: {
  currentUser: User; allUsers: User[]; managers: ProjectManager[];
  onClose: () => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const managerIds = useMemo(() => new Set(managers.map(m => m.user_id)), [managers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allUsers.filter(u =>
      !managerIds.has(u.id) &&
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
    ).slice(0, 8);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[88vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">⚙️ ผู้ดูแลโครงการแจ้งซ่อม</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            ผู้ดูแลโครงการสามารถดูรายงานทั้งหมด สร้างบันทึกข้อความ และพิมพ์รายงานได้
          </div>
          <div className="relative">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">เพิ่มผู้ดูแล</label>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="🔍 พิมพ์ชื่อครู..."
              className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white" />
            {filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-200 rounded-xl shadow-lg z-10 overflow-hidden mt-1">
                {filtered.map(u=>(
                  <button key={u.id} onClick={()=>handleAdd(u)} disabled={adding}
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 border-b border-slate-100 last:border-0 flex items-center justify-between">
                    <span>{fullName(u)} <span className="text-slate-400 text-xs">{u.role}</span></span>
                    <span className="text-blue-500 font-bold text-xs">+ เพิ่ม</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ผู้ดูแลปัจจุบัน ({managers.length} คน)</p>
            {managers.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">ยังไม่มีผู้ดูแลโครงการ</div>
            ) : (
              <div className="space-y-2">
                {managers.map(m=>(
                  <div key={m.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{fullName(m.user)}</p>
                      <p className="text-xs text-slate-400">{m.user?.role}</p>
                    </div>
                    <button onClick={()=>handleRemove(m.id)}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">🗑️ ลบ</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DetailModal ───────────────────────────────────────────────────────────────
function DetailModal({ request, canManage, allUsers, currentUserId, isAdmin, isProjManager, onEdit, onDelete, onUpdate, onClose }: {
  request: RepairRequest; canManage: boolean; allUsers: User[];
  currentUserId: string; isAdmin: boolean; isProjManager: boolean;
  onEdit: (r: RepairRequest) => void; onDelete: (id: string) => void;
  onUpdate: () => void; onClose: () => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [assignedTo, setAssignedTo] = useState(request.assigned_to ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // ★ เพิ่ม: งบประมาณต่อรายการ (ใช้ตอนสร้างบันทึกข้อความ)
  const [estimatedCost, setEstimatedCost] = useState<string>(
    (request as any).estimated_cost != null ? String((request as any).estimated_cost) : ""
  );
  const [budgetSource, setBudgetSource] = useState<string>((request as any).budget_source ?? "");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ★ ครูที่ดูแลอาคารนี้ (repair_user_ids) — ใช้กรอง dropdown "มอบหมายให้"
  const buildingRepairIds = (request.building as any)?.repair_user_ids ?? [];
  const assignableUsers = buildingRepairIds.length > 0
    ? allUsers.filter(u => buildingRepairIds.includes(u.id))
    : allUsers; // ★ ถ้าอาคารนี้ยังไม่ได้ตั้งค่าครูดูแล ให้ fallback เห็นทุกคน (กันเลือกไม่ได้เลย)

  // ★ ครูดูแลตึก (inspector_user_ids) — แสดงไว้อ้างอิงเฉยๆ ไม่ใช่ dropdown
  const inspectorIds = (request.building as any)?.inspector_user_ids ?? [];
  const inspectorNames = allUsers.filter(u => inspectorIds.includes(u.id)).map(fullName);

  // ★ สิทธิ์แก้ไข/ลบรายการ:
  //   - แอดมิน/ผู้ดูแลโครงการ: แก้ไข/ลบได้เสมอ
  //   - ครูผู้แจ้งเอง: แก้ไข/ลบได้ ตราบใดที่ยังไม่ถูกมอบหมายงาน (assigned_to ยังว่าง)
  //     เมื่อถูกมอบหมายแล้ว ครูผู้แจ้งจะไม่สามารถแก้ไข/ลบได้อีก
  const isReporter = request.reporter_id === currentUserId;
  const isLocked = !!request.assigned_to;
  const canEditDelete = isAdmin || isProjManager || (isReporter && !isLocked);

  const handleUpdate = async () => {
    setSaving(true);
    // ★ แก้: ใช้ completed_at (คอลัมน์จริงในตาราง) แทน resolved_at
    //   และเช็คสถานะ 'completed' (ตรงกับ enum) แทน 'resolved'
    const { error } = await supabase.from("repair_requests").update({
      status, assigned_to: assignedTo || null,
      estimated_cost: estimatedCost.trim() ? Number(estimatedCost) : null,
      budget_source: budgetSource.trim() || null,
      updated_at: new Date().toISOString(),
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    }).eq("id", request.id);
    setSaving(false);
    if (error) { alert("❌ บันทึกไม่สำเร็จ: " + error.message); return; }
    onUpdate();
  };

  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">🔍 รายละเอียดการแจ้งซ่อม</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">{request.title}</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              <span style={{background:cfg.bg,color:cfg.color,borderColor:cfg.border}}
                className="text-xs font-bold px-2.5 py-1 rounded-lg border">{cfg.label}</span>
              {request.priority && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200"
                  style={{color:PRIORITY_CFG[request.priority]?.color}}>
                  {PRIORITY_CFG[request.priority]?.label}
                </span>
              )}
              {request.category && <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 font-medium">{request.category}</span>}
            </div>
          </div>
          <div className="text-sm text-slate-500 space-y-1">
            <p>🏢 {request.building?.name ?? "—"}{request.room ? ` · ${request.room}` : ""}</p>
            <p>👤 {fullName(request.reporter)}</p>
            <p>📅 {thaiDate(request.created_at)}</p>
          </div>
          {request.description && <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">{request.description}</p>}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              รูปภาพที่แนบ {(request.photo_urls??[]).length > 0 ? `(${request.photo_urls!.length} รูป)` : ""}
            </p>
            {(request.photo_urls??[]).length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {request.photo_urls!.map((url,i)=>(
                  <img key={i} src={url} alt="" onClick={()=>setLightboxUrl(url)}
                    className="w-full h-24 object-cover rounded-xl border border-slate-200 cursor-pointer hover:brightness-90 transition-all" />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">📷 ไม่มีรูปภาพแนบ</p>
            )}
          </div>
          {inspectorNames.length > 0 && (
            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
              🛠️ ครูดูแลตึกนี้ (อ้างอิง): {inspectorNames.join(", ")}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100">
            {canEditDelete ? (
              <div className="flex gap-2">
                <button onClick={()=>onEdit(request)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-blue-200 text-blue-600 text-sm font-bold hover:bg-blue-50">
                  ✏️ แก้ไขรายการ
                </button>
                <button onClick={()=>onDelete(request.id)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-50">
                  🗑️ ลบรายการ
                </button>
              </div>
            ) : (
              isReporter && isLocked && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  🔒 รายการนี้ถูกมอบหมายงานให้ผู้รับผิดชอบแล้ว จึงไม่สามารถแก้ไขหรือลบได้ หากต้องการเปลี่ยนแปลงกรุณาติดต่อผู้ดูแลระบบ
                </p>
              )
            )}
          </div>

          {canManage && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">จัดการ</p>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">สถานะ</label>
                <select value={status} onChange={e=>setStatus(e.target.value)}
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  {Object.entries(STATUS_CFG).map(([k,v])=>(
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  มอบหมายให้ {buildingRepairIds.length===0 && <span className="text-amber-500 font-normal">(อาคารนี้ยังไม่ได้ตั้งค่าครูดูแล แสดงทุกคน)</span>}
                </label>
                <select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  <option value="">— ยังไม่ได้มอบหมาย —</option>
                  {assignableUsers.map(u=><option key={u.id} value={u.id}>{fullName(u)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">งบประมาณโดยประมาณ (บาท)</label>
                  <input type="number" value={estimatedCost} onChange={e=>setEstimatedCost(e.target.value)}
                    placeholder="เช่น 3500"
                    className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">แหล่งงบประมาณ</label>
                  <input type="text" value={budgetSource} onChange={e=>setBudgetSource(e.target.value)}
                    placeholder="เช่น งบดำเนินงาน"
                    className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <button onClick={handleUpdate} disabled={saving}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "💾 บันทึกการเปลี่ยนแปลง"}
              </button>
            </div>
          )}
        </div>
        {lightboxUrl && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={()=>setLightboxUrl(null)}>
            <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
            <button onClick={()=>setLightboxUrl(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white text-xl flex items-center justify-center">✕</button>
          </div>
        )}
      </div>
    </div>
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
  const [tab,          setTab]         = useState<"dashboard"|"list"|"mine">("list");
  const [filterStatus, setFilterStatus]= useState("");
  const [filterBldg,   setFilterBldg]  = useState("");
  const [showForm,     setShowForm]    = useState(false);
  const [editingReq,   setEditingReq]  = useState<RepairRequest|null>(null);
  const [showManagers, setShowManagers]= useState(false);
  const [showMemo,     setShowMemo]    = useState(false);
  const [detailReq,    setDetailReq]   = useState<RepairRequest|null>(null);

  const isAdmin       = useMemo(()=>ADMIN_ROLES.includes(user?.role??""),[user]);
  const isProjManager = useMemo(()=>managers.some(m=>m.user_id===user?.id),[managers,user]);
  const myBuildingIds = useMemo(()=>{
    if (!user) return new Set<string>();
    return new Set(buildings.filter(b=>(b.repair_user_ids??[]).includes(user.id)).map(b=>b.id));
  },[buildings,user]);
  const isBuildingManager = myBuildingIds.size > 0;
  const canSeeAll = isAdmin || isProjManager;
  const canManage = isAdmin || isProjManager || isBuildingManager;

  useEffect(()=>{
    const init=async()=>{
      const {data:{user:au}}=await supabase.auth.getUser();
      if (!au){setLoading(false);return;}
      let {data}=await supabase.from("users")
        .select("id,first_name,last_name,title,role,position,signature_url")
        .eq("auth_id",au.id).maybeSingle();
      if (!data&&au.email){
        const r=await supabase.from("users")
          .select("id,first_name,last_name,title,role,position,signature_url")
          .eq("email",au.email).maybeSingle();
        data=r.data;
        if (data) await supabase.from("users").update({auth_id:au.id}).eq("id",(data as any).id);
      }
      if (data) setUser(data as User);
      setLoading(false);
    };
    init();
  },[]);

  const loadData=useCallback(async()=>{
    if (!user) return;
    const {data:blds}=await supabase.from("buildings").select("*").order("name");
    setBuildings((blds??[]) as Building[]);
    const {data:usrs}=await supabase.from("users")
      .select("id,first_name,last_name,title,role,position,signature_url").order("first_name");
    setAllUsers((usrs??[]) as User[]);
    const dir=(usrs??[]).find((u:any)=>u.role==="director") as User|undefined;
    setDirector(dir);
    // ★ แก้: repair_project_managers มี FK ไปยัง users 2 เส้นทาง (user_id, added_by)
    //   embed แบบ 'user:users(...)' เดิม ambiguous ทำให้ query error เงียบๆ (data=null)
    //   -> เพิ่มผู้ดูแลสำเร็จแต่รายชื่อไม่ขึ้นเลย แก้โดยดึงแยก 2 รอบแล้ว join เองใน JS
    const {data:mgrRows, error:mgrErr}=await supabase.from("repair_project_managers").select("*");
    if (mgrErr) console.error("[repair] โหลด repair_project_managers ไม่สำเร็จ:", mgrErr.message);
    const mgrUserIds = [...new Set((mgrRows??[]).map((m:any)=>m.user_id).filter(Boolean))];
    let mgrUserMap: Record<string,User> = {};
    if (mgrUserIds.length > 0) {
      const {data:mgrUsers} = await supabase.from("users")
        .select("id,first_name,last_name,title,role").in("id", mgrUserIds);
      (mgrUsers??[]).forEach((u:any)=>{ mgrUserMap[u.id]=u; });
    }
    setManagers(((mgrRows??[]) as any[]).map(m=>({ ...m, user: mgrUserMap[m.user_id] })) as ProjectManager[]);
    // ★ แก้: เพิ่ม repair_user_ids, inspector_user_ids ใน embed ของ building
    //   เดิม select แค่ id,name ทำให้ DetailModal อ่าน request.building.repair_user_ids ไม่ได้เลย
    //   (ดรอปดาวน์ "มอบหมายให้" เลยไม่กรองตามครูที่ดูแลอาคารจริง ๆ)
    const {data:rqs}=await supabase.from("repair_requests")
  .select(`*,reporter:users!reporter_id(id,first_name,last_name,title),
    building:buildings(id,name,repair_user_ids,inspector_user_ids)`)
      .order("created_at",{ascending:false}).limit(300);
    setRequests((rqs??[]) as unknown as RepairRequest[]);
  },[user]);

  useEffect(()=>{if(!loading&&user) loadData();},[loading,user,loadData]);

  const visibleRequests = useMemo(()=>{
    let list = requests;
    if (!canSeeAll && isBuildingManager)
      list = list.filter(r => myBuildingIds.has(r.building_id ?? ""));
    else if (!canSeeAll)
  list = list.filter(r => r.reporter_id === user?.id);
    if (filterBldg)   list = list.filter(r => r.building_id === filterBldg);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    return list;
  },[requests,canSeeAll,isBuildingManager,myBuildingIds,user,filterStatus,filterBldg]);

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

  // ★ ลบรายการแจ้งซ่อม (ใช้จาก DetailModal) — สิทธิ์ถูกเช็คแล้วฝั่ง UI ใน DetailModal
  //   (แอดมิน/ผู้ดูแลโครงการ ลบได้เสมอ, ครูผู้แจ้งลบได้เฉพาะตอนยังไม่ถูกมอบหมายงาน)
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      <div className="bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 px-5 py-4 flex items-center gap-3 shadow-lg shrink-0">
        <button onClick={()=>router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg shrink-0" aria-label="กลับหน้าหลัก">🏠</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight">🔧 ระบบแจ้งซ่อม</h1>
          <p className="text-orange-100 text-sm">{fullName(user)}{isBuildingManager&&!canSeeAll?" · ผู้ดูแลอาคาร":""}{isProjManager?" · ผู้ดูแลโครงการ":""}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {isAdmin && (
            <button onClick={()=>setShowManagers(true)}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl border border-white/30">
              ⚙️ ผู้ดูแล
            </button>
          )}
          {(canSeeAll) && (
            <button onClick={()=>setShowMemo(true)}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl border border-white/30">
              📄 บันทึกข้อความ
            </button>
          )}
          <button onClick={()=>setShowForm(true)}
            className="px-4 py-2 bg-white text-orange-600 text-xs font-bold rounded-xl shadow-sm hover:bg-orange-50">
            + แจ้งซ่อม
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 flex shrink-0">
        {([
          ["list",      "📋 รายการทั้งหมด"],
          ...(canSeeAll ? [["dashboard","📊 แดชบอร์ด"]] as const : []),
          ["mine",      "📌 ของฉัน"],
        ] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k as any)}
            className={`px-5 py-3.5 text-sm font-bold border-b-2 whitespace-nowrap transition-all
              ${tab===k?"border-orange-500 text-orange-600":"border-transparent text-slate-400 hover:text-slate-600"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab==="dashboard" && canSeeAll && (
          <div className="max-w-5xl mx-auto p-5 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {label:"ทั้งหมด",     value:stats.total,       color:"#3b82f6", icon:"📋"},
                {label:"รอดำเนินการ", value:stats.pending,     color:"#d97706", icon:"⏳"},
                {label:"กำลังซ่อม",  value:stats.in_progress, color:"#2563eb", icon:"🔧"},
                {label:"เสร็จแล้ว",  value:stats.completed,   color:"#16a34a", icon:"✅"},
              ].map(s=>(
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                  <span className="text-3xl">{s.icon}</span>
                  <div>
                    <div className="text-2xl font-black" style={{color:s.color}}>{s.value}</div>
                    <div className="text-xs text-slate-400 font-medium">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-700 text-sm">สรุปรายอาคาร</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-orange-500 to-amber-400 text-white text-xs">
                      {["อาคาร","รอดำเนินการ","กำลังซ่อม","เสร็จแล้ว","รวม"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buildings.map((b,i)=>{
                      const bReqs=requests.filter(r=>r.building_id===b.id);
                      return (
                        <tr key={b.id} className={i%2===0?"bg-slate-50":"bg-white"}>
                          <td className="px-4 py-3 font-bold text-slate-700">{b.name}</td>
                          <td className="px-4 py-3 text-amber-600 font-bold">{bReqs.filter(r=>r.status==="pending").length}</td>
                          <td className="px-4 py-3 text-blue-600 font-bold">{bReqs.filter(r=>r.status==="in_progress").length}</td>
                          <td className="px-4 py-3 text-emerald-600 font-bold">{bReqs.filter(r=>r.status==="completed").length}</td>
                          <td className="px-4 py-3 text-slate-600 font-bold">{bReqs.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm">⏳ รอดำเนินการ ({stats.pending})</h3>
                <button onClick={()=>setTab("list")} className="text-xs text-orange-500 font-bold hover:underline">ดูทั้งหมด</button>
              </div>
              <div className="divide-y divide-slate-100">
                {requests.filter(r=>r.status==="pending").slice(0,5).map(r=>(
                  <div key={r.id} onClick={()=>setDetailReq(r)}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{r.title}</p>
                      <p className="text-xs text-slate-400">{r.building?.name} · {thaiDate(r.created_at)}</p>
                    </div>
                    {r.priority && (
                      <span className="text-xs font-bold shrink-0" style={{color:PRIORITY_CFG[r.priority]?.color}}>
                        {PRIORITY_CFG[r.priority]?.label}
                      </span>
                    )}
                  </div>
                ))}
                {stats.pending===0&&<div className="px-5 py-8 text-center text-slate-400 text-sm">ไม่มีรายการรอดำเนินการ 🎉</div>}
              </div>
            </div>
          </div>
        )}

        {tab==="list" && (
          <div className="max-w-4xl mx-auto p-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">สถานะ</label>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                  className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  <option value="">ทั้งหมด</option>
                  {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {canSeeAll && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">อาคาร</label>
                  <select value={filterBldg} onChange={e=>setFilterBldg(e.target.value)}
                    className="border-2 border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                    <option value="">ทั้งหมด</option>
                    {buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {(filterStatus||filterBldg)&&(
                <button onClick={()=>{setFilterStatus("");setFilterBldg("");}}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-600 underline self-end">ล้าง</button>
              )}
              <div className="flex-1"/>
              <span className="text-xs text-slate-400 self-end">{visibleRequests.length} รายการ</span>
            </div>

            {visibleRequests.length===0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-400">
                <p className="text-4xl mb-2">🔧</p>
                <p className="text-sm">ไม่มีรายการแจ้งซ่อม</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRequests.map(r=>{
                  const cfg=STATUS_CFG[r.status]??STATUS_CFG.pending;
                  return (
                    <div key={r.id} onClick={()=>setDetailReq(r)}
                      className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-slate-800 text-sm">{r.title}</span>
                            {r.priority&&<span className="text-xs font-bold" style={{color:PRIORITY_CFG[r.priority]?.color}}>{PRIORITY_CFG[r.priority]?.label}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                            <span>🏢 {r.building?.name ?? "—"}{r.room?` · ${r.room}`:""}</span>
                            {r.category&&<span>🏷️ {r.category}</span>}
                            <span>📅 {thaiDate(r.created_at)}</span>
                            <span>👤 {fullName(r.reporter)}</span>
                          </div>
                        </div>
                        <span style={{background:cfg.bg,color:cfg.color,borderColor:cfg.border}}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0">{cfg.label}</span>
                      </div>
                      {(r.photo_urls??[]).length>0&&(
                        <div className="flex gap-1.5 mt-2">
                          {r.photo_urls!.slice(0,3).map((url,i)=>(
                            <img key={i} src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-slate-200"/>
                          ))}
                          {r.photo_urls!.length>3&&<div className="w-12 h-12 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-xs text-slate-400 font-bold">+{r.photo_urls!.length-3}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab==="mine" && (
          <div className="max-w-3xl mx-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700">รายการแจ้งซ่อมของฉัน ({myRequests.length})</h2>
              <button onClick={()=>setShowForm(true)}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl">+ แจ้งซ่อม</button>
            </div>
            {myRequests.length===0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-400">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-sm">ยังไม่มีรายการแจ้งซ่อม</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myRequests.map(r=>{
                  const cfg=STATUS_CFG[r.status]??STATUS_CFG.pending;
                  return (
                    <div key={r.id} onClick={()=>setDetailReq(r)}
                      className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-orange-300 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm">{r.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">🏢 {r.building?.name ?? "—"} · 📅 {thaiDate(r.created_at)}</p>
                        </div>
                        <span style={{background:cfg.bg,color:cfg.color,borderColor:cfg.border}}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg border shrink-0">{cfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {(showForm || editingReq) && (
        <RepairFormModal buildings={buildings} currentUser={user} existing={editingReq}
          onSave={async()=>{setShowForm(false);setEditingReq(null);await loadData();}}
          onClose={()=>{setShowForm(false);setEditingReq(null);}} />
      )}
      {showManagers && (
        <ManagersModal currentUser={user} allUsers={allUsers} managers={managers}
          onClose={()=>setShowManagers(false)} onRefresh={loadData} />
      )}
      {showMemo && (
        <MemoModal requests={visibleRequests.filter(r=>r.status!=="completed")}
          buildings={buildings} currentUser={user} director={director}
          onClose={()=>setShowMemo(false)} />
      )}
      {detailReq && (
        <DetailModal request={detailReq} canManage={canManage} allUsers={allUsers}
          currentUserId={user.id} isAdmin={isAdmin} isProjManager={isProjManager}
          onEdit={(r)=>{setDetailReq(null); setEditingReq(r);}}
          onDelete={handleDeleteRequest}
          onUpdate={async()=>{setDetailReq(null);await loadData();}}
          onClose={()=>setDetailReq(null)} />
      )}
    </div>
  );
}