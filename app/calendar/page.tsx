"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ══════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════
type EventStatus = "draft" | "pending" | "approved" | "rejected";
type CalView = "month" | "week" | "day" | "agenda";

interface CalEvent {
  id: string;
  title: string;
  description?: string;
  schedule?: string;
  categories: string[];
  location?: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  is_all_day: boolean;
  status: EventStatus;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  reject_reason?: string;
  edit_requested?: boolean;
  edit_request_note?: string;
  is_public: boolean;
  target_roles: string[];
  color_override?: string;
  attachment_urls: string[];
  created_at: string;
  creator?: { first_name: string; last_name: string };
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

// ══════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════
const APPROVER_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head"];

const CATEGORIES: Record<string, { label: string; color: string; light: string; text: string }> = {
  academic:  { label: "วิชาการ",         color: "#185FA5", light: "#E6F1FB", text: "#0C447C" },
  budget:    { label: "งบประมาณ",        color: "#0F6E56", light: "#D9F4EC", text: "#085041" },
  general:   { label: "ทั่วไป",          color: "#6B7280", light: "#F3F4F6", text: "#374151" },
  personnel: { label: "บุคคล",           color: "#854F0B", light: "#FAF0DC", text: "#5A3408" },
  parent:    { label: "ผู้ปกครอง",       color: "#534AB7", light: "#EEECFB", text: "#3C3489" },
  student:   { label: "กิจการนักเรียน",  color: "#3B6D11", light: "#EBF4D6", text: "#264708" },
  holiday:   { label: "วันหยุด",         color: "#A32D2D", light: "#FAEAEA", text: "#791F1F" },
  meeting:   { label: "ประชุม",          color: "#1e40af", light: "#dbeafe", text: "#1e3a8a" },
  training:  { label: "อบรม",            color: "#7c3aed", light: "#ede9fe", text: "#5b21b6" },
  important: { label: "วันสำคัญ",        color: "#b45309", light: "#fef3c7", text: "#92400e" },
};

const AUDIENCES = [
  { value: "all",      label: "👥 ทุกคน" },
  { value: "teacher",  label: "👩‍🏫 ครู" },
  { value: "student",  label: "🎒 นักเรียน" },
  { value: "parent",   label: "👨‍👩‍👧 ผู้ปกครอง" },
  { value: "staff",    label: "🏢 บุคลากร" },
  { value: "admin",    label: "🔐 ผู้บริหาร" },
];

const STATUS_CFG: Record<EventStatus, { label: string; cls: string }> = {
  draft:    { label: "ร่าง",        cls: "bg-slate-100 text-slate-600 border-slate-300" },
  pending:  { label: "รออนุมัติ",   cls: "bg-amber-50 text-amber-700 border-amber-300" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  rejected: { label: "ไม่อนุมัติ",  cls: "bg-red-50 text-red-700 border-red-300" },
};

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const TH_DAYS_SHORT = ["อา","จ","อ","พ","พฤ","ศ","ส"];
const TH_DAYS_FULL  = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];

// ══════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════
const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const toDate = (s: string) => new Date(s+"T00:00:00");
const addDays = (d: Date, n: number) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const startOfWeek = (d: Date) => { const r=new Date(d); r.setDate(d.getDate()-d.getDay()); return r; };

function fullName(u: any) {
  if (!u) return "—";
  return `${u.first_name??""} ${u.last_name??""}`.trim()||"—";
}
function thaiDate(iso: string) {
  const d = toDate(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()+543}`;
}
function thaiTime(t?: string) {
  if (!t) return "";
  return t.slice(0,5) + " น.";
}
function getCatColor(categories: string[]) {
  const first = categories?.[0];
  return CATEGORIES[first]?.color ?? "#6B7280";
}
function getCatLight(categories: string[]) {
  const first = categories?.[0];
  return CATEGORIES[first]?.light ?? "#F3F4F6";
}
function getCatText(categories: string[]) {
  const first = categories?.[0];
  return CATEGORIES[first]?.text ?? "#374151";
}
function getCatLabels(categories: string[]) {
  return (categories||[]).map(c => CATEGORIES[c]?.label ?? c).join(", ");
}

// ══════════════════════════════════════════════════════
// EventPill
// ══════════════════════════════════════════════════════
function EventPill({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const color = ev.color_override ?? getCatColor(ev.categories);
  const light = ev.color_override ? ev.color_override+"22" : getCatLight(ev.categories);
  const text  = ev.color_override ?? getCatText(ev.categories);
  const badge = ev.status==="pending"?" ⏳" : ev.status==="rejected"?" ❌" : ev.status==="draft"?" 📝" : "";
  return (
    <span onClick={onClick} style={{
      display:"block", fontSize:11, fontWeight:600, padding:"2px 5px", marginBottom:2,
      borderRadius:4, cursor:"pointer", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
      background: light, color: text, borderLeft:`3px solid ${color}`,
    }}>
      {!ev.is_all_day && ev.start_time && <span style={{opacity:0.7}}>{thaiTime(ev.start_time)} </span>}
      {ev.title}{badge}
    </span>
  );
}

// ══════════════════════════════════════════════════════
// CategoryBadges
// ══════════════════════════════════════════════════════
function CatBadges({ cats }: { cats: string[] }) {
  return (
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      {(cats||[]).map(c => {
        const cfg = CATEGORIES[c];
        if (!cfg) return null;
        return (
          <span key={c} style={{
            background:cfg.light, color:cfg.text, fontSize:10, fontWeight:700,
            padding:"2px 8px", borderRadius:12, border:`1px solid ${cfg.color}40`
          }}>{cfg.label}</span>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// FilePreview
// ══════════════════════════════════════════════════════
function FilePreview({ url, previewUrl, mimeHint }: { 
  url: string; 
  previewUrl?: string;  // ← เพิ่ม prop
  mimeHint?: string 
}) {
  const pathPart = url.split("?")[0].split("#")[0];
  const name = pathPart.split("/").pop() ?? "ไฟล์";
  const ext  = name.split(".").pop()?.toLowerCase() ?? "";

  const isImg = ["jpg","jpeg","png","gif","webp"].includes(ext)
    || (mimeHint?.startsWith("image/") ?? false);
  const isPdf = ext === "pdf" || mimeHint === "application/pdf";

  // ✅ ใช้ proxy route เพื่อหลีกเลี่ยง CORS
  const displaySrc = previewUrl || url;
  const proxySrc = `/api/file-proxy?url=${encodeURIComponent(displaySrc)}`;

  return (
    <div style={{border:"1px solid #e0e7ff", borderRadius:10, overflow:"hidden", background:"#f8faff", marginBottom:8}}>
      
      {isImg && (
        <img
          src={proxySrc}  // ✅ ผ่าน proxy
          alt={name}
          style={{width:"100%", maxHeight:200, objectFit:"contain", display:"block", background:"#f1f5f9"}}
          onClick={() => window.open(url, "_blank")}
          className="cursor-pointer"
          onError={e => {
            // fallback: ซ่อนรูป แสดงไอคอนแทน
            const img = e.target as HTMLImageElement;
            img.style.display = "none";
            img.nextElementSibling?.removeAttribute("style");
          }}
        />
      )}
      
      {/* fallback icon ซ่อนไว้ก่อน */}
      {isImg && (
        <div style={{display:"none", padding:"24px", textAlign:"center"}}>
          <div style={{fontSize:40}}>🖼️</div>
          <p style={{fontSize:12, color:"#64748b", marginTop:8}}>ไม่สามารถแสดงรูปได้</p>
        </div>
      )}
      
      {isPdf && (
        <div className="bg-slate-50 px-4 py-6 text-center">
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm font-bold text-slate-600 mb-3">ไฟล์ PDF</p>
          <a href={url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
            📂 เปิดดู PDF
          </a>
        </div>
      )}
      
      {!isImg && !isPdf && (
        <div className="px-4 py-6 text-center">
          <div className="text-4xl mb-2">📎</div>
          <p className="text-sm font-bold text-slate-600">{name}</p>
        </div>
      )}
      
      <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, fontSize:12, borderTop:"1px solid #e0e7ff"}}>
        <span>{isPdf ? "📄" : isImg ? "🖼️" : "📎"}</span>
        <span style={{flex:1, fontWeight:600, color:"#1e3a8a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
          {name}
        </span>
        <a href={url} target="_blank" rel="noreferrer"
          style={{color:"#3b82f6", fontWeight:700, fontSize:11, textDecoration:"none"}}>
          เปิด ↗
        </a>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// EventModal
// ══════════════════════════════════════════════════════
function EventModal({ event, user, isApprover, onSave, onDelete, onClose }: {
  event: Partial<CalEvent>|null;
  user: UserProfile;
  isApprover: boolean;
  onSave: (data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit  = !!event?.id;
  const isOwner = !event?.id || event.created_by === user.id;
  const canEdit = isOwner || isApprover;

  const [title,        setTitle]       = useState(event?.title ?? "");
  const [desc,         setDesc]        = useState(event?.description ?? "");
  const [schedule,     setSchedule]    = useState(event?.schedule ?? "");
  const [cats,         setCats]        = useState<string[]>(event?.categories ?? []);
  const [location,     setLocation]    = useState(event?.location ?? "");
  const [startDate,    setStartDate]   = useState(event?.start_date ?? ymd(new Date()));
  const [endDate,      setEndDate]     = useState(event?.end_date ?? ymd(new Date()));
  const [startTime,    setStartTime]   = useState(event?.start_time?.slice(0,5) ?? "08:30");
  const [endTime,      setEndTime]     = useState(event?.end_time?.slice(0,5) ?? "");
  const [hasEndTime,   setHasEndTime]  = useState(!!event?.end_time);
  const [isAllDay,     setIsAllDay]    = useState(event?.is_all_day ?? true);
  const [audiences,    setAudiences]   = useState<string[]>(event?.target_roles ?? ["all"]);

  // ★ FIX 1: attachments เป็น array ของ {url, mime} ตั้งแต่ initial state — ไม่ยัด JSX เข้า useState
  const [attachments, setAttachments] = useState<{
  url: string; 
  previewUrl?: string;  // ← เพิ่ม
  mime: string; 
  path?: string
}[]>(
  (event?.attachment_urls ?? []).map(url => ({ url, previewUrl: url, mime: "" }))
);

  const [colorOvr,     setColorOvr]    = useState(event?.color_override ?? "");
  const [rejectReason, setRejectReason]= useState("");
  const [showReject,   setShowReject]  = useState(false);
  const [editNote,     setEditNote]    = useState("");
  const [showEditReq,  setShowEditReq] = useState(false);
  const [loading,      setLoading]     = useState(false);
  const [uploading,    setUploading]   = useState(false);
  const [tab,          setTab]         = useState<"basic"|"detail"|"attach">("basic");
  const fileRef = useRef<HTMLInputElement>(null);

  function toggleCat(k: string) {
    setCats(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k]);
  }
  function toggleAudience(v: string) {
    if (v === "all") { setAudiences(["all"]); return; }
    setAudiences(prev => {
      const without = prev.filter(x=>x!=="all");
      return without.includes(v) ? without.filter(x=>x!==v) : [...without, v];
    });
  }

  // ★ FIX 2 & 3: ลบ useState ที่อยู่กลางฟังก์ชัน (ผิดกฎ Hooks) และเก็บ url แค่ครั้งเดียวเป็น object
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} ขนาดเกิน 10MB`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", `Events/${Date.now()}_${file.name}`); // ★ เปลี่ยน path ให้ตรงกับโฟลเดอร์ "Events" ที่เห็นใน URL ของ SharePoint
        formData.append("account", "academic@khienkhet.ac.th"); // ★ เพิ่มบรรทัดนี้

        const res  = await fetch("/api/upload-onedrive", { method: "POST", body: formData });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          const msg = json?.error
            ? (typeof json.error === "string" ? json.error : JSON.stringify(json.error))
            : `HTTP ${res.status}`;
          alert(`อัปโหลดไม่สำเร็จ: ${msg}`);
          continue;
        }
        const relPath = `WKK_Event_System/${Date.now()}_${file.name}`;
        formData.append("path", relPath);
        // ใช้ downloadUrl เพื่อเปิดดูไฟล์ได้โดยตรง — เก็บเป็น object เดียว ไม่ซ้ำ
        const url = json.downloadUrl || json.webUrl || json.url;
const previewUrl = json.webUrl || json.downloadUrl || json.url; // ← ใช้ webUrl สำหรับ preview

if (url) {
  setAttachments(prev => [...prev, { 
    url,           // ← เก็บไว้ใน DB (downloadUrl)
    previewUrl,    // ← ใช้แสดงรูปใน browser
    mime: file.type, 
    path: `WKK_Event_System/${Date.now()}_${file.name}` 
  }]);
}
      } catch (err: any) {
        alert("อัปโหลดไม่สำเร็จ: " + err.message);
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave(asDraft: boolean) {
    if (!title || !startDate) { alert("กรุณากรอกชื่อกิจกรรมและวันที่"); return; }
    if (cats.length === 0) { alert("กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด"); return; }
    setLoading(true);
    await onSave({
      title, description: desc, schedule, categories: cats, location,
      start_date: startDate, end_date: endDate || startDate,
      start_time: isAllDay ? null : startTime+":00",
      end_time:   isAllDay||!hasEndTime ? null : endTime+":00",
      is_all_day: isAllDay,
      color_override: colorOvr || null,
      status: asDraft ? "draft" : "pending",
      created_by: user.id,
      is_public: true,
      target_roles: audiences,
      attachment_urls: attachments.map(a => a.url),
      attachment_paths: attachments.map(a => a.path ?? null), // ★ใหม่
    });
    setLoading(false);
  }

  async function handleApprove() {
    if (!event?.id) return;
    setLoading(true);
    await (supabase.from("calendar_events") as any).update({
      status: "approved", approved_by: user.id, approved_at: new Date().toISOString(),
      edit_requested: false,
    }).eq("id", event.id);
    onClose();
    setLoading(false);
  }

  async function handleReject() {
    if (!event?.id || !rejectReason.trim()) { alert("กรุณาระบุเหตุผล"); return; }
    setLoading(true);
    await (supabase.from("calendar_events") as any).update({
      status: "rejected", reject_reason: rejectReason.trim(),
    }).eq("id", event.id);
    onClose();
    setLoading(false);
  }

  async function handleRequestEdit() {
    if (!event?.id || !editNote.trim()) { alert("กรุณาระบุสิ่งที่ต้องการแก้ไข"); return; }
    setLoading(true);
    await (supabase.from("calendar_events") as any).update({
      edit_requested: true, edit_request_note: editNote.trim(), status: "pending",
    }).eq("id", event.id);
    onClose();
    setLoading(false);
  }

  const iCls = "w-full bg-white border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors text-slate-800";
  const lCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {cats.length > 0 && (
              <div className="w-3 h-3 rounded-full shrink-0" style={{background: getCatColor(cats)}} />
            )}
            <h3 className="font-bold text-slate-800 text-base">
              {isEdit ? "รายละเอียดกิจกรรม" : "เพิ่มกิจกรรม"}
            </h3>
            {isEdit && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${STATUS_CFG[event?.status??"pending"].cls}`}>
                {STATUS_CFG[event?.status??"pending"].label}
              </span>
            )}
            {isEdit && event?.edit_requested && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg border bg-purple-50 text-purple-700 border-purple-300">
                ✏️ ขอแก้ไข
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-lg">✕</button>
        </div>

        {/* Tabs */}
        {canEdit && (
          <div className="flex border-b border-slate-100 shrink-0 px-6">
            {([["basic","📋 ข้อมูล"],["detail","📝 รายละเอียด"],["attach","📎 เอกสาร"]] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-all ${tab===k?"border-blue-500 text-blue-600":"border-transparent text-slate-400 hover:text-slate-600"}`}>
                {l}
                {k==="attach" && attachments.length > 0 && (
                  <span className="ml-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {attachments.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* View-only for non-owners */}
          {isEdit && !canEdit && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-800">{event?.title}</h2>
              <CatBadges cats={event?.categories??[]} />
              <div className="text-sm text-slate-600 space-y-1">
                <p>📅 {thaiDate(event?.start_date!)}
                  {event?.start_date !== event?.end_date && ` – ${thaiDate(event?.end_date!)}`}
                </p>
                {!event?.is_all_day && event?.start_time && (
                  <p>🕐 {thaiTime(event.start_time)}{event.end_time ? ` – ${thaiTime(event.end_time)}` : ""}</p>
                )}
                {event?.location && <p>📍 {event.location}</p>}
                {event?.description && <p className="whitespace-pre-wrap mt-2">{event.description}</p>}
                {event?.schedule && <div className="bg-blue-50 rounded-xl p-3 mt-2 text-slate-700 whitespace-pre-wrap text-sm">{event.schedule}</div>}
              </div>
              {(event?.attachment_urls??[]).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">เอกสารแนบ</p>
                  {event!.attachment_urls!.map((url,i)=>(
                    <FilePreview key={i} url={url} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editable tabs */}
          {canEdit && tab === "basic" && (
            <>
              {/* Categories — multi select */}
              <div>
                <label className={lCls}>หมวดหมู่ <span className="text-red-400">*</span> <span className="text-slate-300 font-normal normal-case">(เลือกได้หลายหมวด)</span></label>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(CATEGORIES).map(([k,v])=>{
                    const on = cats.includes(k);
                    return (
                      <button key={k} type="button" onClick={()=>toggleCat(k)}
                        style={on ? {background:v.light, borderColor:v.color, color:v.text} : {}}
                        className={`p-2 rounded-xl border-2 text-xs font-bold text-left transition-all ${on?"border-2":"bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                        {v.label}
                        {on && <span className="float-right">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className={lCls}>ชื่อกิจกรรม <span className="text-red-400">*</span></label>
                <input type="text" value={title} onChange={e=>setTitle(e.target.value)}
                  placeholder="เช่น ประชุมคณะครูประจำเดือน" className={iCls} />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lCls}>วันที่เริ่ม <span className="text-red-400">*</span></label>
                  <input type="date" value={startDate}
                    onChange={e=>{setStartDate(e.target.value); if(endDate<e.target.value) setEndDate(e.target.value);}}
                    className={iCls} />
                </div>
                <div>
                  <label className={lCls}>วันที่สิ้นสุด</label>
                  <input type="date" value={endDate} min={startDate}
                    onChange={e=>setEndDate(e.target.value)} className={iCls} />
                </div>
              </div>

              {/* All day toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div className={`relative w-10 h-6 rounded-full transition-colors ${isAllDay?"bg-blue-500":"bg-slate-200"}`}
                  onClick={()=>setIsAllDay(!isAllDay)}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isAllDay?"translate-x-5":"translate-x-1"}`}/>
                </div>
                <span className="text-sm font-medium text-slate-600">กิจกรรมทั้งวัน</span>
              </label>

              {/* Time */}
              {!isAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lCls}>เวลาเริ่ม (เวลาไทย)</label>
                    <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className={iCls} />
                    {startTime && <p className="text-xs text-slate-400 mt-1">{thaiTime(startTime)}</p>}
                  </div>
                  <div>
                    <label className={lCls}>เวลาสิ้นสุด</label>
                    <button type="button" onClick={()=>setHasEndTime(!hasEndTime)}
                      className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold ${hasEndTime?"bg-blue-100 text-blue-600":"bg-slate-100 text-slate-400"}`}>
                      {hasEndTime?"มี":"ไม่มี"}
                    </button>
                    {hasEndTime ? (
                      <>
                        <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className={iCls} />
                        {endTime && <p className="text-xs text-slate-400 mt-1">{thaiTime(endTime)}</p>}
                      </>
                    ) : (
                      <div className={`${iCls} text-slate-400`}>ไม่ระบุ</div>
                    )}
                  </div>
                </div>
              )}

              {/* Location */}
              <div>
                <label className={lCls}>สถานที่</label>
                <input type="text" value={location} onChange={e=>setLocation(e.target.value)}
                  placeholder="เช่น ห้องประชุมใหญ่" className={iCls} />
              </div>

              {/* Audience — multi select */}
              <div>
                <label className={lCls}>ผู้เข้าร่วม <span className="text-slate-300 font-normal normal-case">(เลือกได้หลายกลุ่ม)</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {AUDIENCES.map(({value,label})=>{
                    const on = audiences.includes(value);
                    return (
                      <button key={value} type="button" onClick={()=>toggleAudience(value)}
                        className={`p-2.5 rounded-xl border-2 text-xs font-bold transition-all ${on?"bg-blue-50 border-blue-500 text-blue-700":"bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                        {label}{on&&" ✓"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color */}
              <div className="flex items-center gap-3">
                <label className={lCls+" mb-0"}>สีที่กำหนดเอง</label>
                <input type="color" value={colorOvr||getCatColor(cats)||"#3b82f6"}
                  onChange={e=>setColorOvr(e.target.value)}
                  className="w-10 h-9 rounded-lg border-2 border-slate-200 cursor-pointer p-0.5" />
                {colorOvr && <button onClick={()=>setColorOvr("")} className="text-xs text-slate-400 hover:text-slate-600 underline">รีเซ็ต</button>}
              </div>
            </>
          )}

          {canEdit && tab === "detail" && (
            <>
              <div>
                <label className={lCls}>รายละเอียด</label>
                <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4}
                  placeholder="อธิบายรายละเอียดเพิ่มเติม..." className={iCls+" resize-none"} />
              </div>
              <div>
                <label className={lCls}>หมายกำหนดการ / กำหนดการ</label>
                <textarea value={schedule} onChange={e=>setSchedule(e.target.value)} rows={6}
                  placeholder={"08:30 น. — ลงทะเบียน\n09:00 น. — พิธีเปิด\n12:00 น. — รับประทานอาหารกลางวัน\n13:00 น. — อบรม..."}
                  className={iCls+" resize-none font-mono text-xs"} />
                <p className="text-xs text-slate-400 mt-1">กรอกกำหนดการตามลำดับเวลา หนึ่งบรรทัดต่อรายการ</p>
              </div>
            </>
          )}

          {/* ★ FIX 4: ปิด tag ครบ — เขียนเป็น if/else ที่ชัดเจนแทน ternary ที่เปิดไม่ปิด */}
          {canEdit && tab === "attach" && (
            <>
              <div>
                <label className={lCls}>แนบเอกสาร / ไฟล์ประกาศ / คำสั่ง</label>
                <label className={`flex items-center gap-3 cursor-pointer bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl px-4 py-4 transition-colors ${uploading?"opacity-60":""} hover:border-blue-500`}>
                  <span className="text-2xl">{uploading?"⏳":"📁"}</span>
                  <div>
                    <p className="font-bold text-blue-700 text-sm">{uploading?"กำลังอัปโหลด...":"คลิกเพื่อเลือกไฟล์"}</p>
                    <p className="text-blue-400 text-xs">PDF, Word, รูปภาพ — ไม่เกิน 10MB ต่อไฟล์</p>
                  </div>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
                    disabled={uploading} onChange={handleUpload} className="hidden" />
                </label>
              </div>

              {attachments.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">ไฟล์ที่แนบ ({attachments.length} ไฟล์)</p>
                  {attachments.map((a, i) => (
  <div key={i} className="relative group">
    <FilePreview 
      url={a.url} 
      previewUrl={a.previewUrl}  // ← เพิ่ม
      mimeHint={a.mime} 
    />
    <button onClick={() => setAttachments(prev => prev.filter((_,j) => j !== i))}
      className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center font-bold shadow">
      ×
    </button>
  </div>
))}

                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-3xl mb-2">📎</p>
                  <p className="text-sm">ยังไม่มีเอกสารแนบ</p>
                </div>
              )}
            </>
          )}

          {/* Reject reason display */}
          {isEdit && event?.status === "rejected" && event?.reject_reason && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-red-500 mb-1">เหตุผลที่ไม่อนุมัติ</p>
              <p className="text-sm text-red-700">{event.reject_reason}</p>
            </div>
          )}

          {/* Edit request note display */}
          {isEdit && event?.edit_requested && event?.edit_request_note && isApprover && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-purple-600 mb-1">✏️ ขอแก้ไข</p>
              <p className="text-sm text-purple-700">{event.edit_request_note}</p>
            </div>
          )}

          {/* Approver section */}
          {isEdit && isApprover && (event?.status === "pending") && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-bold text-amber-700 mb-3">⏳ รออนุมัติ</p>
              {!showReject ? (
                <div className="flex gap-2">
                  <button onClick={handleApprove} disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm disabled:opacity-50">
                    ✅ อนุมัติ
                  </button>
                  <button onClick={()=>setShowReject(true)}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm">
                    ❌ ไม่อนุมัติ
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                    rows={2} placeholder="ระบุเหตุผล..."
                    className="w-full bg-white border-2 border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleReject} disabled={loading}
                      className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-50">
                      ยืนยันไม่อนุมัติ
                    </button>
                    <button onClick={()=>setShowReject(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Owner: request edit (for approved events) */}
          {isEdit && isOwner && !isApprover && event?.status === "approved" && (
            <div>
              {!showEditReq ? (
                <button onClick={()=>setShowEditReq(true)}
                  className="w-full py-2.5 rounded-xl border-2 border-purple-200 bg-purple-50 text-purple-700 font-bold text-sm hover:bg-purple-100">
                  ✏️ ขอแก้ไขกิจกรรม (ต้องรออนุมัติ)
                </button>
              ) : (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-purple-700">ระบุสิ่งที่ต้องการแก้ไข</p>
                  <textarea value={editNote} onChange={e=>setEditNote(e.target.value)} rows={3}
                    placeholder="เช่น ต้องการเปลี่ยนวันที่จาก 25 เป็น 27 มิถุนายน..."
                    className="w-full bg-white border-2 border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleRequestEdit} disabled={loading}
                      className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm disabled:opacity-50">
                      ส่งคำขอแก้ไข
                    </button>
                    <button onClick={()=>setShowEditReq(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm">ยกเลิก</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50 rounded-b-2xl">
          {isEdit && canEdit && (
            <button onClick={()=>{if(confirm("ยืนยันการลบ?")) onDelete(event!.id!);}}
              className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100">
              🗑️
            </button>
          )}
          <div className="flex-1"/>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-medium">
            ปิด
          </button>
          {canEdit && (
            <>
              <button onClick={()=>handleSave(true)} disabled={loading||!title}
                className="px-4 py-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-700 text-sm font-bold hover:bg-amber-100 disabled:opacity-50">
                📝 ร่าง
              </button>
              <button onClick={()=>handleSave(false)} disabled={loading||!title||cats.length===0}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                {loading?"กำลังส่ง...":(isEdit?"💾 บันทึก":"📤 ส่งอนุมัติ")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Month View
// ══════════════════════════════════════════════════════
function MonthView({ year, month, events, today, onDayClick, onEventClick }: {
  year: number; month: number; events: CalEvent[];
  today: string; onDayClick: (d:string)=>void; onEventClick: (e:CalEvent)=>void;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0);
  const startPad = firstDay.getDay();
  const total    = Math.ceil((startPad+lastDay.getDate())/7)*7;
  const cells: (Date|null)[] = Array.from({length:total},(_,i)=>{
    const n=i-startPad+1;
    return n>=1&&n<=lastDay.getDate() ? new Date(year,month,n) : null;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b border-slate-200 shrink-0">
        {TH_DAYS_SHORT.map((d,i)=>(
          <div key={i} className={`text-center py-2 text-xs font-bold ${i===0?"text-red-500":i===6?"text-blue-500":"text-slate-400"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{borderLeft:"0.5px solid #e2e8f0"}}>
        {cells.map((d,i)=>{
          const isToday = d&&ymd(d)===today;
          const ds = d?ymd(d):"";
          const dayEvs = d ? events.filter(e=>e.start_date<=ds&&e.end_date>=ds) : [];
          return (
            <div key={i} onClick={()=>d&&onDayClick(ymd(d))}
              style={{borderRight:"0.5px solid #e2e8f0",borderBottom:"0.5px solid #e2e8f0",minHeight:90}}
              className={`p-1 cursor-pointer transition-colors ${!d?"bg-slate-50":isToday?"bg-blue-50":"bg-white hover:bg-slate-50"}`}>
              {d && (
                <div className="mb-1">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    isToday?"bg-blue-600 text-white":d.getDay()===0?"text-red-500":d.getDay()===6?"text-blue-600":"text-slate-600"}`}>
                    {d.getDate()}
                  </span>
                </div>
              )}
              {dayEvs.slice(0,3).map(ev=>(
                <EventPill key={ev.id} ev={ev} onClick={()=>onEventClick(ev)}/>
              ))}
              {dayEvs.length>3 && <span className="text-[10px] text-slate-400 font-bold px-1">+{dayEvs.length-3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Week View
// ══════════════════════════════════════════════════════
function WeekView({ currentDate, events, today, onEventClick, onDayClick }: {
  currentDate: Date; events: CalEvent[]; today: string;
  onEventClick:(e:CalEvent)=>void; onDayClick:(d:string)=>void;
}) {
  const ws = startOfWeek(currentDate);
  const days = Array.from({length:7},(_,i)=>addDays(ws,i));
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-200">
        {days.map((d,i)=>{
          const ds=ymd(d); const isT=ds===today;
          return (
            <div key={i} onClick={()=>onDayClick(ds)}
              className={`text-center py-3 cursor-pointer transition-colors ${isT?"bg-blue-50":"hover:bg-slate-50"}`}>
              <div className={`text-xs font-bold mb-1 ${d.getDay()===0?"text-red-400":d.getDay()===6?"text-blue-400":"text-slate-400"}`}>{TH_DAYS_SHORT[d.getDay()]}</div>
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${isT?"bg-blue-600 text-white":"text-slate-700"}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7" style={{borderLeft:"0.5px solid #e2e8f0"}}>
        {days.map((d,i)=>{
          const ds=ymd(d);
          const dayEvs=events.filter(e=>e.start_date<=ds&&e.end_date>=ds);
          return (
            <div key={i} style={{borderRight:"0.5px solid #e2e8f0",minHeight:220}} className="p-1.5 bg-white">
              {dayEvs.map(ev=><EventPill key={ev.id} ev={ev} onClick={()=>onEventClick(ev)}/>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Day View
// ══════════════════════════════════════════════════════
function DayView({ currentDate, events, today, onEventClick }: {
  currentDate: Date; events: CalEvent[]; today: string; onEventClick:(e:CalEvent)=>void;
}) {
  const ds = ymd(currentDate);
  const dayEvs = events.filter(e=>e.start_date<=ds&&e.end_date>=ds)
    .sort((a,b)=>(a.start_time??"00:00")<(b.start_time??"00:00")?-1:1);
  const isToday = ds===today;

  return (
    <div className="p-5 max-w-2xl mx-auto">
      <div className={`text-center mb-5 p-4 rounded-2xl border ${isToday?"bg-blue-50 border-blue-200":"bg-slate-50 border-slate-200"}`}>
        <p className="text-sm font-medium text-slate-400">{TH_DAYS_FULL[currentDate.getDay()]}</p>
        <p className={`text-4xl font-bold ${isToday?"text-blue-600":"text-slate-800"}`}>{currentDate.getDate()}</p>
        <p className="text-sm text-slate-400">{TH_MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()+543}</p>
      </div>
      {dayEvs.length===0 ? (
        <div className="text-center py-12 text-slate-400 text-sm bg-slate-50 rounded-2xl">ไม่มีกิจกรรมในวันนี้</div>
      ) : (
        <div className="space-y-3">
          {dayEvs.map(ev=>{
            const color = ev.color_override ?? getCatColor(ev.categories);
            const light = ev.color_override ? ev.color_override+"11" : getCatLight(ev.categories);
            const text  = ev.color_override ?? getCatText(ev.categories);
            return (
              <div key={ev.id} onClick={()=>onEventClick(ev)}
                style={{borderLeft:`5px solid ${color}`, background:light}}
                className="rounded-r-2xl px-5 py-4 cursor-pointer hover:brightness-95 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base" style={{color:text}}>{ev.title}</p>
                    <CatBadges cats={ev.categories} />
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                      {ev.is_all_day ? <span>📅 ทั้งวัน</span> : ev.start_time && (
                        <span>🕐 {thaiTime(ev.start_time)}{ev.end_time?` – ${thaiTime(ev.end_time)}`:""}</span>
                      )}
                      {ev.location && <span>📍 {ev.location}</span>}
                    </div>
                    {ev.schedule && (
                      <div className="mt-2 bg-white/60 rounded-lg px-3 py-2 text-xs text-slate-600 font-mono whitespace-pre-wrap">
                        {ev.schedule}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg border shrink-0 ${STATUS_CFG[ev.status].cls}`}>
                    {STATUS_CFG[ev.status].label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Agenda View
// ══════════════════════════════════════════════════════
function AgendaView({ events, onEventClick }: { events: CalEvent[]; onEventClick:(e:CalEvent)=>void; }) {
  const sorted = [...events].sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const groups: {key:string;label:string;items:CalEvent[]}[] = [];
  for (const ev of sorted) {
    const d = toDate(ev.start_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = groups[groups.length-1];
    if (last?.key===key) last.items.push(ev);
    else groups.push({key, label:`${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543}`, items:[ev]});
  }
  if (!sorted.length) return <div className="text-center py-16 text-slate-400 text-sm">ไม่มีกิจกรรม</div>;
  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      {groups.map(g=>(
        <div key={g.key}>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2">{g.label}</h3>
          <div className="space-y-2">
            {g.items.map(ev=>{
              const d=toDate(ev.start_date);
              const color=ev.color_override??getCatColor(ev.categories);
              return (
                <div key={ev.id} onClick={()=>onEventClick(ev)} className="flex gap-3 items-start cursor-pointer group">
                  <div className="text-center w-10 shrink-0">
                    <div className="text-lg font-bold leading-none text-slate-700">{d.getDate()}</div>
                    <div className="text-[10px] text-slate-400">{TH_DAYS_SHORT[d.getDay()]}</div>
                  </div>
                  <div className="w-1 self-stretch rounded-full shrink-0 mt-1" style={{background:color}}/>
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 group-hover:border-slate-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{ev.title}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <CatBadges cats={ev.categories}/>
                          {ev.location&&<span className="text-xs text-slate-400">📍 {ev.location}</span>}
                          {!ev.is_all_day&&ev.start_time&&<span className="text-xs text-slate-400">🕐 {thaiTime(ev.start_time)}</span>}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${STATUS_CFG[ev.status].cls}`}>
                        {STATUS_CFG[ev.status].label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Mini Calendar
// ══════════════════════════════════════════════════════
function MiniCal({ year, month, today, hasEv, onSelect, selected }: {
  year:number; month:number; today:string; hasEv:(d:string)=>boolean;
  onSelect:(d:string)=>void; selected:string;
}) {
  const first=new Date(year,month,1); const last=new Date(year,month+1,0);
  const pad=first.getDay(); const total=Math.ceil((pad+last.getDate())/7)*7;
  const cells:(number|null)[]=Array.from({length:total},(_,i)=>{const n=i-pad+1;return n>=1&&n<=last.getDate()?n:null;});
  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {TH_DAYS_SHORT.map((d,i)=>(
          <div key={i} className={`text-center text-[10px] font-bold pb-1 ${i===0?"text-red-400":i===6?"text-blue-400":"text-slate-400"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((n,i)=>{
          if (!n) return <div key={i}/>;
          const ds=ymd(new Date(year,month,n));
          const isTd=ds===today; const isSel=ds===selected; const has=hasEv(ds);
          return (
            <button key={i} type="button" onClick={()=>onSelect(ds)}
              className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg text-[11px] font-bold transition-colors relative ${
                isSel?"bg-blue-600 text-white":isTd?"bg-blue-100 text-blue-700":"hover:bg-slate-100 text-slate-600"}`}>
              {n}
              {has&&!isSel&&<span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400"/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════
export default function CalendarPage() {
  const router = useRouter();
  const [user,        setUser]       = useState<UserProfile|null>(null);
  const [events,      setEvents]     = useState<CalEvent[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [view,        setView]       = useState<CalView>("month");
  const [curDate,     setCurDate]    = useState(()=>new Date());
  const todayDate  = useMemo(()=>new Date(),[]);
  const todayStr   = useMemo(()=>ymd(todayDate),[todayDate]);
  const [selected,    setSelected]   = useState(todayStr);
  const [modalEv,     setModalEv]    = useState<Partial<CalEvent>|null|false>(false);
  const [catFilter,   setCatFilter]  = useState<Set<string>>(new Set(Object.keys(CATEGORIES)));
  const [showPending, setShowPending]= useState(false);

  const isApprover = !!(user&&APPROVER_ROLES.includes(user.role));

  // Auth
  useEffect(()=>{
    const init=async()=>{
      const {data:{user:au}}=await supabase.auth.getUser();
      if (!au){setLoading(false);return;}
      const meta=au.user_metadata??{};
      const email=au.email||meta.email||meta.preferred_username||"";
      let {data}=await supabase.from("users").select("id,first_name,last_name,email,role").eq("auth_id",au.id).maybeSingle();
      if (!data&&email){
        const res=await supabase.from("users").select("id,first_name,last_name,email,role").eq("email",email).maybeSingle();
        data=res.data;
        if (data) await (supabase.from("users") as any).update({auth_id:au.id}).eq("id",(data as any).id);
      }
      if (data) setUser(data as UserProfile);
      setLoading(false);
    };
    init();
  },[]);

  const loadEvents=useCallback(async()=>{
    const from=ymd(new Date(curDate.getFullYear(),curDate.getMonth()-1,1));
    const to  =ymd(new Date(curDate.getFullYear(),curDate.getMonth()+2,0));
    if (isApprover){
      const {data}=await (supabase.from("calendar_events") as any)
        .select("*, creator:users!created_by(first_name,last_name)")
        .or(`status.eq.pending,and(end_date.gte.${from},start_date.lte.${to})`)
        .order("start_date",{ascending:true});
      setEvents((data||[]) as CalEvent[]);
    } else {
      const {data}=await (supabase.from("calendar_events") as any)
        .select("*, creator:users!created_by(first_name,last_name)")
        .gte("end_date",from).lte("start_date",to)
        .order("start_date",{ascending:true});
      setEvents((data||[]) as CalEvent[]);
    }
  },[curDate,isApprover]);

  useEffect(()=>{if (!loading&&user) loadEvents();},[loading,user,loadEvents]);

  const filteredEvents=useMemo(()=>
    events.filter(ev=>{
      const cats=ev.categories||[];
      if (!cats.some(c=>catFilter.has(c))&&cats.length>0) return false;
      if (ev.status==="draft"&&ev.created_by!==user?.id) return false;
      if (!isApprover&&ev.status==="pending"&&ev.created_by!==user?.id) return false;
      return true;
    }),[events,catFilter,user,isApprover]);

  const pendingCount=useMemo(()=>events.filter(e=>e.status==="pending").length,[events]);

  function navigate(dir:1|-1){
    const d=new Date(curDate);
    if (view==="month") d.setMonth(d.getMonth()+dir);
    else if (view==="week") d.setDate(d.getDate()+dir*7);
    else d.setDate(d.getDate()+dir);
    setCurDate(d);
  }

  function getTitle(){
    if (view==="month") return `${TH_MONTHS[curDate.getMonth()]} ${curDate.getFullYear()+543}`;
    if (view==="week"){
      const ws=startOfWeek(curDate); const we=addDays(ws,6);
      return `${ws.getDate()} – ${we.getDate()} ${TH_MONTHS[we.getMonth()]} ${we.getFullYear()+543}`;
    }
    if (view==="day") return `${curDate.getDate()} ${TH_MONTHS[curDate.getMonth()]} ${curDate.getFullYear()+543}`;
    return "รายการกิจกรรม";
  }

  async function handleSave(data:any){
    const id=(modalEv as CalEvent)?.id;
    if (id) await (supabase.from("calendar_events") as any).update(data).eq("id",id);
    else    await (supabase.from("calendar_events") as any).insert([data]);
    setModalEv(false); await loadEvents();
  }

  async function handleDelete(id:string){
    await supabase.from("calendar_events").delete().eq("id",id);
    setModalEv(false); await loadEvents();
  }

  const upcoming=useMemo(()=>
    filteredEvents.filter(e=>e.end_date>=todayStr&&e.status==="approved").slice(0,8)
  ,[filteredEvents,todayStr]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-slate-400 animate-pulse text-lg">กำลังโหลด...</p></div>;
  if (!user)   return <div className="min-h-screen flex items-center justify-center"><p className="text-slate-400 text-lg">กรุณาเข้าสู่ระบบ</p></div>;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-slate-200 shadow-sm z-40">
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
          <button onClick={()=>router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>

          <div className="flex items-center gap-1.5">
            <button onClick={()=>navigate(-1)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold">‹</button>
            <span className="font-bold text-slate-800 text-sm sm:text-base min-w-[150px] sm:min-w-[200px] text-center">{getTitle()}</span>
            <button onClick={()=>navigate(1)}  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold">›</button>
            <button onClick={()=>{setCurDate(todayDate);setSelected(todayStr);}}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50">วันนี้</button>
          </div>

          <div className="flex-1"/>

          {/* Views */}
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl">
            {(["month","week","day","agenda"] as CalView[]).map(v=>(
              <button key={v} onClick={()=>setView(v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${view===v?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                {v==="month"?"เดือน":v==="week"?"สัปดาห์":v==="day"?"วัน":"รายการ"}
              </button>
            ))}
          </div>

          {isApprover&&pendingCount>0&&(
            <button onClick={()=>setShowPending(!showPending)}
              className="relative px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
              ⏳ รออนุมัติ <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            </button>
          )}

          <button onClick={()=>setModalEv({})}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5">
            + เพิ่มกิจกรรม
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4 overflow-y-auto hidden lg:flex flex-col gap-5">
          {/* Mini cal */}
          <MiniCal year={curDate.getFullYear()} month={curDate.getMonth()}
            today={todayStr} selected={selected}
            hasEv={d=>filteredEvents.some(e=>e.start_date<=d&&e.end_date>=d&&e.status==="approved")}
            onSelect={d=>{setSelected(d);setCurDate(toDate(d));if(view!=="month")setView("day");}}/>

          {/* Category filter */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">หมวดหมู่</p>
            <div className="flex justify-between mb-1">
              <button onClick={()=>setCatFilter(new Set(Object.keys(CATEGORIES)))} className="text-[10px] text-blue-500 font-bold hover:underline">เลือกทั้งหมด</button>
              <button onClick={()=>setCatFilter(new Set())} className="text-[10px] text-slate-400 font-bold hover:underline">ล้าง</button>
            </div>
            <div className="space-y-1">
              {Object.entries(CATEGORIES).map(([k,v])=>{
                const on=catFilter.has(k);
                return (
                  <label key={k} className="flex items-center gap-2 cursor-pointer select-none group">
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${on?"border-transparent":"border-slate-300 bg-white"}`}
                      style={on?{background:v.color}:{}}
                      onClick={()=>{const s=new Set(catFilter);on?s.delete(k):s.add(k);setCatFilter(s);}}>
                      {on&&<span className="text-white text-[9px] font-black">✓</span>}
                    </div>
                    <span className="text-xs font-medium text-slate-600 group-hover:text-slate-800 truncate">{v.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Upcoming */}
          {upcoming.length>0&&(
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">กิจกรรมที่จะมาถึง</p>
              <div className="space-y-2">
                {upcoming.map(ev=>{
                  const d=toDate(ev.start_date);
                  const color=ev.color_override??getCatColor(ev.categories);
                  return (
                    <div key={ev.id} onClick={()=>setModalEv(ev)}
                      className="flex gap-2 items-start cursor-pointer hover:bg-slate-50 rounded-lg p-1.5 transition-colors">
                      <div className="text-center w-8 shrink-0">
                        <div className="text-base font-bold leading-none text-slate-700">{d.getDate()}</div>
                        <div className="text-[9px] text-slate-400">{TH_MONTHS[d.getMonth()].slice(0,3)}</div>
                      </div>
                      <div className="w-1 self-stretch rounded-full shrink-0" style={{background:color}}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 leading-tight truncate">{ev.title}</p>
                        {!ev.is_all_day&&ev.start_time&&<p className="text-[10px] text-slate-400">{thaiTime(ev.start_time)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Main calendar */}
        <main className="flex-1 overflow-y-auto bg-white flex flex-col">
          {/* Pending panel */}
          {isApprover&&showPending&&(
            <div className="border-b border-amber-200 bg-amber-50 p-4 shrink-0">
              <h3 className="text-sm font-bold text-amber-700 mb-3">⏳ รออนุมัติ ({pendingCount})</h3>
              <div className="flex gap-3 flex-wrap">
                {events.filter(e=>e.status==="pending").map(ev=>{
                  const color=getCatColor(ev.categories);
                  const light=getCatLight(ev.categories);
                  const text=getCatText(ev.categories);
                  return (
                    <div key={ev.id} onClick={()=>setModalEv(ev)}
                      style={{borderLeft:`3px solid ${color}`,background:light}}
                      className="rounded-r-xl px-3 py-2 cursor-pointer hover:brightness-95 transition-all max-w-xs">
                      <p className="text-xs font-bold truncate" style={{color:text}}>{ev.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{thaiDate(ev.start_date)}</p>
                      <p className="text-[10px] text-slate-400">{fullName(ev.creator)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1">
            {view==="month"&&<MonthView year={curDate.getFullYear()} month={curDate.getMonth()} events={filteredEvents} today={todayStr} onDayClick={d=>{setSelected(d);setCurDate(toDate(d));setView("day");}} onEventClick={ev=>setModalEv(ev)}/>}
            {view==="week" &&<WeekView currentDate={curDate} events={filteredEvents} today={todayStr} onEventClick={ev=>setModalEv(ev)} onDayClick={d=>{setSelected(d);setCurDate(toDate(d));setView("day");}}/>}
            {view==="day"  &&<DayView currentDate={curDate} events={filteredEvents} today={todayStr} onEventClick={ev=>setModalEv(ev)}/>}
            {view==="agenda"&&<AgendaView events={filteredEvents} onEventClick={ev=>setModalEv(ev)}/>}
          </div>
        </main>
      </div>

      {/* Modal */}
      {modalEv!==false&&(
        <EventModal event={modalEv} user={user} isApprover={isApprover}
          onSave={handleSave} onDelete={handleDelete} onClose={()=>setModalEv(false)}/>
      )}
    </div>
  );
}