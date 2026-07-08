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
  status: string; priority?: string; image_urls?: string[];
  reported_by: string; assigned_to?: string;
  created_at: string; updated_at?: string;
  resolved_at?: string; memo_pdf_url?: string;
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

const STATUS_CFG: Record<string,{label:string;color:string;bg:string;border:string}> = {
  pending:     { label:"รอดำเนินการ", color:"#92400e", bg:"#fef3c7", border:"#fcd34d" },
  in_progress: { label:"กำลังซ่อม",  color:"#1e40af", bg:"#dbeafe", border:"#93c5fd" },
  resolved:    { label:"เสร็จแล้ว",  color:"#065f46", bg:"#d1fae5", border:"#6ee7b7" },
  cancelled:   { label:"ยกเลิก",     color:"#6b7280", bg:"#f3f4f6", border:"#d1d5db" },
};
const PRIORITY_CFG: Record<string,{label:string;color:string}> = {
  low:    { label:"ต่ำ",    color:"#6b7280" },
  medium: { label:"ปานกลาง",color:"#d97706" },
  high:   { label:"เร่งด่วน",color:"#dc2626" },
};
const CATEGORIES = ["ระบบไฟฟ้า","ระบบประปา","ประตู/หน้าต่าง","พื้น/ฝ้า/ผนัง","เฟอร์นิเจอร์","คอมพิวเตอร์/อุปกรณ์","ห้องน้ำ","อื่นๆ"];

// ── PDF Generator ─────────────────────────────────────────────────────────────
function generateMemoHTML(
  items: {no:number;title:string;building:string;room:string;detail:string;checked:boolean}[],
  creatorName: string,
  directorName: string,
  directorSignUrl: string,
  creatorSignUrl: string,
  dateStr: string,
  memoNo: string,
) {
  const checkedItems = items.filter(i => i.checked);
  const rows = checkedItems.map((it, i) => `
    <tr>
      <td style="text-align:center;padding:6px 8px;border:1px solid #cbd5e1">${i+1}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${it.title}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${it.building}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${it.room || "—"}</td>
      <td style="padding:6px 8px;border:1px solid #cbd5e1">${it.detail || "—"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 20mm 25mm; }
    body { font-family:'Sarabun','TH SarabunNew',sans-serif; font-size:14pt; color:#111; line-height:1.6; }
    .header { text-align:center; margin-bottom:8px; }
    .header img { height:70px; }
    h2 { text-align:center; font-size:18pt; font-weight:bold; margin:8px 0 2px; letter-spacing:2px; }
    h3 { text-align:center; font-size:14pt; margin:0 0 16px; }
    .meta-table { width:100%; margin-bottom:16px; font-size:13pt; }
    .meta-table td { padding:2px 0; vertical-align:top; }
    table.items { width:100%; border-collapse:collapse; font-size:12pt; margin:12px 0; }
    table.items th { background:#1e3a8a; color:#fff; padding:7px 8px; border:1px solid #1e3a8a; }
    table.items td { padding:6px 8px; border:1px solid #cbd5e1; }
    table.items tr:nth-child(even) td { background:#f8faff; }
    .sign-section { display:flex; justify-content:space-between; margin-top:48px; gap:24px; }
    .sign-box { text-align:center; flex:1; }
    .sign-img { height:64px; display:block; margin:0 auto; object-fit:contain; }
    .sign-name { font-size:13pt; margin-top:4px; }
    .sign-pos { font-size:11pt; color:#475569; }
    .body-text { font-size:13pt; margin:8px 0 16px; text-indent:2em; }
    @media print { button{display:none} }
  </style></head>
  <body>
    <div class="header">
      <h2>บันทึกข้อความ</h2>
      <h3>โรงเรียนวัดเขียนเขต</h3>
    </div>
    <table class="meta-table">
      <tr>
        <td width="15%"><b>ส่วนราชการ</b></td>
        <td>โรงเรียนวัดเขียนเขต สำนักงานเขตพื้นที่การศึกษาประถมศึกษาปทุมธานี เขต 2</td>
      </tr>
      <tr>
        <td><b>ที่</b></td>
        <td>${memoNo || "ศธ …………………………"}&nbsp;&nbsp;&nbsp;&nbsp;<b>วันที่</b> ${dateStr}</td>
      </tr>
      <tr>
        <td><b>เรื่อง</b></td>
        <td>รายการแจ้งซ่อมบำรุงอาคารสถานที่และสิ่งอำนวยความสะดวก</td>
      </tr>
      <tr>
        <td><b>เรียน</b></td>
        <td>ผู้อำนวยการโรงเรียนวัดเขียนเขต</td>
      </tr>
    </table>

    <p class="body-text">
      ด้วยมีรายการแจ้งซ่อมบำรุงอาคารสถานที่และสิ่งอำนวยความสะดวกของโรงเรียนวัดเขียนเขต
      จำนวน <b>${checkedItems.length} รายการ</b> ตามรายละเอียดในตารางแนบท้าย
      จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติดำเนินการต่อไป
    </p>

    <table class="items">
      <thead>
        <tr>
          <th style="width:36px">ที่</th>
          <th>รายการ</th>
          <th>อาคาร</th>
          <th>ห้อง/บริเวณ</th>
          <th>รายละเอียด</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p class="body-text">
      จึงเรียนมาเพื่อโปรดพิจารณา
    </p>

    <div class="sign-section">
      <div class="sign-box">
        ${creatorSignUrl ? `<img class="sign-img" src="${creatorSignUrl}" />` : `<div style="height:64px"></div>`}
        <div class="sign-name">(${creatorName})</div>
        <div class="sign-pos">ผู้เสนอ / ผู้ดูแลโครงการ</div>
      </div>
      <div class="sign-box">
        ${directorSignUrl ? `<img class="sign-img" src="${directorSignUrl}" />` : `<div style="height:64px"></div>`}
        <div class="sign-name">(${directorName || "นายธนณัฐ  ศิระวงษ์"})</div>
        <div class="sign-pos">ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
        <div class="sign-pos">ผู้อนุมัติ</div>
      </div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`;
}

// ── MemoModal ─────────────────────────────────────────────────────────────────
function MemoModal({ requests, buildings, currentUser, director, onClose }: {
  requests: RepairRequest[]; buildings: Building[];
  currentUser: User; director?: User; onClose: () => void;
}) {
  const [memoNo, setMemoNo] = useState("");
  const [memoDate, setMemoDate] = useState(format(new Date(),"yyyy-MM-dd"));
  const [selected, setSelected] = useState<Record<string,boolean>>(
    () => Object.fromEntries(requests.map(r => [r.id, true]))
  );

  const checkedCount = Object.values(selected).filter(Boolean).length;

  const handlePrint = () => {
    const items = requests
      .filter(r => selected[r.id])
      .map((r,i) => ({
        no: i+1,
        title: r.title,
        building: r.building?.name ?? "—",
        room: r.room ?? "",
        detail: r.description ?? "",
        checked: true,
      }));
    if (items.length === 0) { alert("กรุณาเลือกรายการอย่างน้อย 1 รายการ"); return; }
    const html = generateMemoHTML(
      items,
      fullName(currentUser),
      fullName(director),
      director?.signature_url ?? "",
      currentUser.signature_url ?? "",
      thaiDateFull(memoDate),
      memoNo,
    );
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
          {/* เลขที่ / วันที่ */}
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

          {/* เลือกรายการ */}
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
                <label key={r.id} className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all
                  ${selected[r.id] ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
                  <input type="checkbox" checked={!!selected[r.id]}
                    onChange={e=>setSelected(prev=>({...prev,[r.id]:e.target.checked}))}
                    className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 text-sm">{i+1}. {r.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {r.building?.name ?? "—"}{r.room ? ` · ${r.room}` : ""}
                      {r.description && <span className="ml-2 text-slate-300">— {r.description.slice(0,40)}{r.description.length>40?"...":""}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Preview info */}
          <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
            <p className="font-bold mb-1">ข้อมูลในเอกสาร</p>
            <p>ผู้เสนอ: {fullName(currentUser)}</p>
            <p>ผู้อนุมัติ: {fullName(director) || "นายธนณัฐ  ศิระวงษ์"} (ผอ.)</p>
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
  const [imageUrls,   setImageUrls]  = useState<string[]>(existing?.image_urls ?? []);
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

  // ใหม่ — ใช้ OneDrive + preview + จำกัด 4 รูป
const [imagePreviews, setImagePreviews] = useState<string[]>([]); // base64 preview
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

    // แสดง preview ก่อน (base64)
    const reader = new FileReader();
    reader.onload = e => {
      if (e.target?.result) setImagePreviews(prev => [...prev, e.target!.result as string]);
    };
    reader.readAsDataURL(file);

    // Upload ไป OneDrive
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("account", "general@khienkhet.ac.th");
      formData.append("folder", "WKK_Repair_System");
      formData.append("filename", `repair-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`);

      const res = await fetch("/api/onedrive-upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        alert("อัปโหลดไม่สำเร็จ: " + (err.error ?? res.statusText));
        // ลบ preview ที่เพิ่งเพิ่ม
        setImagePreviews(prev => prev.slice(0, -1));
        continue;
      }
      const { url, itemId } = await res.json();
      // เก็บ URL จาก OneDrive
      setImageUrls(prev => [...prev, url ?? itemId]);
    } catch (e: any) {
      alert("อัปโหลดไม่สำเร็จ: " + e.message);
      setImagePreviews(prev => prev.slice(0, -1));
    }
  }
  setUploading(false);
  if (fileRef.current) fileRef.current.value = "";
};

// ฟังก์ชันลบรูป
function removeImage(i: number) {
  setImageUrls(prev => prev.filter((_,j) => j !== i));
  setImagePreviews(prev => prev.filter((_,j) => j !== i));
}

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      title: title.trim(), description: desc.trim(), building_id: buildingId,
      room: room.trim(), category, priority, image_urls: imageUrls,
      reported_by: currentUser.id, status: existing?.status ?? "pending",
    };
    if (existing?.id) {
      await supabase.from("repair_requests").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("repair_requests").insert([payload]);
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
          {/* รูปภาพ */}
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
          {/* ค้นหา */}
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
          {/* รายชื่อ */}
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
function DetailModal({ request, canManage, allUsers, onUpdate, onClose }: {
  request: RepairRequest; canManage: boolean; allUsers: User[];
  onUpdate: () => void; onClose: () => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [assignedTo, setAssignedTo] = useState(request.assigned_to ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleUpdate = async () => {
    setSaving(true);
    await supabase.from("repair_requests").update({
      status, assigned_to: assignedTo || null,
      updated_at: new Date().toISOString(),
      ...(status === "resolved" ? { resolved_at: new Date().toISOString() } : {}),
    }).eq("id", request.id);
    setSaving(false);
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
          {(request.image_urls??[]).length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">รูปภาพ</p>
              <div className="grid grid-cols-3 gap-2">
                {request.image_urls!.map((url,i)=>(
                  <img key={i} src={url} alt="" onClick={()=>window.open(url,"_blank")}
                    className="w-full h-24 object-cover rounded-xl border border-slate-200 cursor-pointer hover:brightness-90 transition-all" />
                ))}
              </div>
            </div>
          )}
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
                <label className="block text-xs font-bold text-slate-400 mb-1">มอบหมายให้</label>
                <select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}
                  className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none">
                  <option value="">— ยังไม่ได้มอบหมาย —</option>
                  {allUsers.map(u=><option key={u.id} value={u.id}>{fullName(u)}</option>)}
                </select>
              </div>
              <button onClick={handleUpdate} disabled={saving}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "💾 บันทึกการเปลี่ยนแปลง"}
              </button>
            </div>
          )}
        </div>
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
  const [showManagers, setShowManagers]= useState(false);
  const [showMemo,     setShowMemo]    = useState(false);
  const [detailReq,    setDetailReq]   = useState<RepairRequest|null>(null);

  // ── Roles ──────────────────────────────────────────────────────────────────
  const isAdmin       = useMemo(()=>ADMIN_ROLES.includes(user?.role??""),[user]);
  const isProjManager = useMemo(()=>managers.some(m=>m.user_id===user?.id),[managers,user]);
  const myBuildingIds = useMemo(()=>{
    if (!user) return new Set<string>();
    return new Set(buildings.filter(b=>(b.repair_user_ids??[]).includes(user.id)).map(b=>b.id));
  },[buildings,user]);
  const isBuildingManager = myBuildingIds.size > 0;
  const canSeeAll = isAdmin || isProjManager;
  const canManage = isAdmin || isProjManager || isBuildingManager;

  // ── Load user ──────────────────────────────────────────────────────────────
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

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData=useCallback(async()=>{
    if (!user) return;
    // Buildings
    const {data:blds}=await supabase.from("buildings").select("*").order("name");
    setBuildings((blds??[]) as Building[]);
    // All users
    const {data:usrs}=await supabase.from("users")
      .select("id,first_name,last_name,title,role,position,signature_url").order("first_name");
    setAllUsers((usrs??[]) as User[]);
    // Director
    const dir=(usrs??[]).find((u:any)=>u.role==="director") as User|undefined;
    setDirector(dir);
    // Project managers
    const {data:mgrs}=await supabase.from("repair_project_managers")
      .select("*,user:users(id,first_name,last_name,title,role)");
    setManagers((mgrs??[]) as ProjectManager[]);
    // Repair requests
    const {data:rqs}=await supabase.from("repair_requests")
      .select(`*,reporter:users!reported_by(id,first_name,last_name,title),
        building:buildings(id,name)`)
      .order("created_at",{ascending:false}).limit(300);
    setRequests((rqs??[]) as unknown as RepairRequest[]);
  },[user]);

  useEffect(()=>{if(!loading&&user) loadData();},[loading,user,loadData]);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const visibleRequests = useMemo(()=>{
    let list = requests;
    if (!canSeeAll && isBuildingManager)
      list = list.filter(r => myBuildingIds.has(r.building_id ?? ""));
    else if (!canSeeAll)
      list = list.filter(r => r.reported_by === user?.id);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    if (filterBldg)   list = list.filter(r => r.building_id === filterBldg);
    return list;
  },[requests,canSeeAll,isBuildingManager,myBuildingIds,user,filterStatus,filterBldg]);

  const myRequests = useMemo(()=>requests.filter(r=>r.reported_by===user?.id),[requests,user]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(()=>{
    const base = canSeeAll ? requests : myRequests;
    return {
      total:       base.length,
      pending:     base.filter(r=>r.status==="pending").length,
      in_progress: base.filter(r=>r.status==="in_progress").length,
      resolved:    base.filter(r=>r.status==="resolved").length,
    };
  },[requests,myRequests,canSeeAll]);

  // ── Render ─────────────────────────────────────────────────────────────────
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
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 px-5 py-4 flex items-center gap-3 shadow-lg shrink-0">
        <button onClick={()=>router.push("/dashboard")}
          className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold text-lg shrink-0">←</button>
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

      {/* Tabs */}
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
        {/* ── Dashboard ── */}
        {tab==="dashboard" && canSeeAll && (
          <div className="max-w-5xl mx-auto p-5 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {label:"ทั้งหมด",     value:stats.total,       color:"#3b82f6", icon:"📋"},
                {label:"รอดำเนินการ", value:stats.pending,     color:"#d97706", icon:"⏳"},
                {label:"กำลังซ่อม",  value:stats.in_progress, color:"#2563eb", icon:"🔧"},
                {label:"เสร็จแล้ว",  value:stats.resolved,    color:"#16a34a", icon:"✅"},
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

            {/* By building */}
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
                          <td className="px-4 py-3 text-emerald-600 font-bold">{bReqs.filter(r=>r.status==="resolved").length}</td>
                          <td className="px-4 py-3 text-slate-600 font-bold">{bReqs.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent pending */}
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

        {/* ── List ── */}
        {tab==="list" && (
          <div className="max-w-4xl mx-auto p-5 space-y-4">
            {/* Filter */}
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
                      {(r.image_urls??[]).length>0&&(
                        <div className="flex gap-1.5 mt-2">
                          {r.image_urls!.slice(0,3).map((url,i)=>(
                            <img key={i} src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-slate-200"/>
                          ))}
                          {r.image_urls!.length>3&&<div className="w-12 h-12 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-xs text-slate-400 font-bold">+{r.image_urls!.length-3}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Mine ── */}
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

      {/* Modals */}
      {showForm && (
        <RepairFormModal buildings={buildings} currentUser={user}
          onSave={async()=>{setShowForm(false);await loadData();}}
          onClose={()=>setShowForm(false)} />
      )}
      {showManagers && (
        <ManagersModal currentUser={user} allUsers={allUsers} managers={managers}
          onClose={()=>setShowManagers(false)} onRefresh={loadData} />
      )}
      {showMemo && (
        <MemoModal requests={visibleRequests.filter(r=>r.status!=="resolved")}
          buildings={buildings} currentUser={user} director={director}
          onClose={()=>setShowMemo(false)} />
      )}
      {detailReq && (
        <DetailModal request={detailReq} canManage={canManage} allUsers={allUsers}
          onUpdate={async()=>{setDetailReq(null);await loadData();}}
          onClose={()=>setDetailReq(null)} />
      )}
    </div>
  );
}