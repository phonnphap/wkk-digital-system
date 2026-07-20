"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * PUBLIC CALENDAR PAGE — สำหรับฝัง iframe ใน Wix
 * ═══════════════════════════════════════════════════════════════
 * แนะนำวาง path: app/public-calendar/page.tsx
 *
 * ต่างจาก CalendarPage หลักตรงที่:
 * 1. ไม่ต้อง login — ใช้ supabase client แบบ anon
 * 2. ดึงเฉพาะ events ที่ status='approved' และ is_public=true
 * 3. กรอง target_roles ให้เหลือเฉพาะ 'all' | 'student' | 'parent'
 * 4. ไม่มีปุ่มเพิ่ม/แก้ไข/อนุมัติ — เป็น read-only ล้วน
 * 5. ไม่มี top bar ของแอปหลัก (ไม่มีปุ่ม 🏠 กลับ dashboard) เพราะจะถูกฝังใน iframe
 *
 * ⚠️ ต้องตั้งค่า RLS Policy ใน Supabase ก่อนใช้งานจริง (ดูท้ายไฟล์)
 * ═══════════════════════════════════════════════════════════════
 */

import { useEffect, useState, useMemo, useCallback } from "react";
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
  is_public: boolean;
  target_roles: string[];
  color_override?: string;
  attachment_urls: string[];
  attachment_mimes?: string[];
}

// กลุ่มเป้าหมายที่อนุญาตให้แสดงบนเพจสาธารณะนี้
const PUBLIC_AUDIENCES = ["all", "student", "parent"];

// ══════════════════════════════════════════════════════
// Config (เหมือนระบบหลัก)
// ══════════════════════════════════════════════════════
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

function thaiDate(iso: string) {
  const d = toDate(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()+543}`;
}
function thaiTime(t?: string) {
  if (!t) return "";
  return t.slice(0,5) + " น.";
}
function getCatColor(categories: string[]) {
  return CATEGORIES[categories?.[0]]?.color ?? "#6B7280";
}
function getCatLight(categories: string[]) {
  return CATEGORIES[categories?.[0]]?.light ?? "#F3F4F6";
}
function getCatText(categories: string[]) {
  return CATEGORIES[categories?.[0]]?.text ?? "#374151";
}

// ══════════════════════════════════════════════════════
// EventPill
// ══════════════════════════════════════════════════════
function EventPill({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const color = ev.color_override ?? getCatColor(ev.categories);
  const light = ev.color_override ? ev.color_override+"22" : getCatLight(ev.categories);
  const text  = ev.color_override ?? getCatText(ev.categories);
  return (
    <span onClick={onClick} style={{
      display:"block", fontSize:11, fontWeight:600, padding:"2px 5px", marginBottom:2,
      borderRadius:4, cursor:"pointer", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
      background: light, color: text, borderLeft:`3px solid ${color}`,
    }}>
      {!ev.is_all_day && ev.start_time && <span style={{opacity:0.7}}>{thaiTime(ev.start_time)} </span>}
      {ev.title}
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
// FilePreview (แสดงไฟล์แนบแบบดูอย่างเดียว)
// ══════════════════════════════════════════════════════
function FilePreview({ url, mimeHint }: { url: string; mimeHint?: string }) {
  const name = url.split("?")[0].split("/").pop() ?? "ไฟล์";
  const ext  = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const isImg = mimeHint ? mimeHint.startsWith("image/") : ["jpg","jpeg","png","gif","webp"].includes(ext);
  const isPdf = mimeHint ? mimeHint === "application/pdf" : ext === "pdf";

  return (
    <div style={{border:"1px solid #e0e7ff", borderRadius:10, overflow:"hidden", background:"#f8faff", marginBottom:8}}>
      {isImg && (
        <img src={url} alt={name} style={{width:"100%", maxHeight:200, objectFit:"contain", display:"block", background:"#f1f5f9", cursor:"pointer"}}
          onClick={() => window.open(url, "_blank")} />
      )}
      {isPdf && (
        <div className="bg-slate-50 px-4 py-6 text-center">
          <div className="text-4xl mb-2">📄</div>
          <a href={url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
            📂 เปิดดู PDF
          </a>
        </div>
      )}
      <div style={{padding:"8px 12px", display:"flex", alignItems:"center", gap:8, fontSize:12, borderTop:"1px solid #e0e7ff"}}>
        <span>{isPdf ? "📄" : isImg ? "🖼️" : "📎"}</span>
        <span style={{flex:1, fontWeight:600, color:"#1e3a8a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{name}</span>
        <a href={url} target="_blank" rel="noreferrer" style={{color:"#3b82f6", fontWeight:700, fontSize:11, textDecoration:"none"}}>เปิด ↗</a>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Read-only Event Modal
// ══════════════════════════════════════════════════════
function ReadOnlyModal({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-3 h-3 rounded-full shrink-0" style={{background: getCatColor(event.categories)}} />
            <h3 className="font-bold text-slate-800 text-base">รายละเอียดกิจกรรม</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-lg">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
          <h2 className="text-lg font-bold text-slate-800">{event.title}</h2>
          <CatBadges cats={event.categories} />
          <div className="text-sm text-slate-600 space-y-1">
            <p>📅 {thaiDate(event.start_date)}{event.start_date !== event.end_date && ` – ${thaiDate(event.end_date)}`}</p>
            {!event.is_all_day && event.start_time && (
              <p>🕐 {thaiTime(event.start_time)}{event.end_time ? ` – ${thaiTime(event.end_time)}` : ""}</p>
            )}
            {event.location && <p>📍 {event.location}</p>}
            {event.description && <p className="whitespace-pre-wrap mt-2">{event.description}</p>}
            {event.schedule && <div className="bg-blue-50 rounded-xl p-3 mt-2 text-slate-700 whitespace-pre-wrap text-sm">{event.schedule}</div>}
          </div>
          {(event.attachment_urls??[]).length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 mb-2">เอกสารแนบ</p>
              {event.attachment_urls.map((url,i)=>(
                <FilePreview key={i} url={url} mimeHint={event.attachment_mimes?.[i]} />
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-medium">ปิด</button>
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
                    <p className="font-bold text-slate-800 text-sm truncate">{ev.title}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <CatBadges cats={ev.categories}/>
                      {ev.location&&<span className="text-xs text-slate-400">📍 {ev.location}</span>}
                      {!ev.is_all_day&&ev.start_time&&<span className="text-xs text-slate-400">🕐 {thaiTime(ev.start_time)}</span>}
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
// Main Public Page
// ══════════════════════════════════════════════════════
export default function PublicCalendarPage() {
  const [events,   setEvents]   = useState<CalEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState<CalView>("month");
  const [curDate,  setCurDate]  = useState(()=>new Date());
  const todayDate  = useMemo(()=>new Date(),[]);
  const todayStr   = useMemo(()=>ymd(todayDate),[todayDate]);
  const [selected, setSelected] = useState(todayStr);
  const [modalEv,  setModalEv]  = useState<CalEvent|null>(null);
  const [catFilter,setCatFilter]= useState<Set<string>>(new Set(Object.keys(CATEGORIES)));

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const from = ymd(new Date(curDate.getFullYear(), curDate.getMonth()-1, 1));
    const to   = ymd(new Date(curDate.getFullYear(), curDate.getMonth()+2, 0));

    // ★ ดึงเฉพาะกิจกรรมที่อนุมัติแล้ว + เผยแพร่สาธารณะ + อยู่ในช่วงเดือนที่ดู
    //   หมายเหตุ: ถ้าอยากกรอง target_roles ที่ระดับ query เลย ให้ใช้
    //   .overlaps("target_roles", PUBLIC_AUDIENCES) แทนการกรองฝั่ง client ด้านล่าง
    const { data } = await (supabase.from("calendar_events") as any)
      .select("id,title,description,schedule,categories,location,start_date,end_date,start_time,end_time,is_all_day,status,is_public,target_roles,color_override,attachment_urls,attachment_mimes")
      .eq("status", "approved")
      .eq("is_public", true)
      .gte("end_date", from)
      .lte("start_date", to)
      .order("start_date", { ascending: true });

    // ★ กรองอีกชั้นฝั่ง client: ต้องมี target_roles ที่ตรงกับกลุ่มเป้าหมายสาธารณะ
    const filtered = ((data || []) as CalEvent[]).filter(ev =>
      (ev.target_roles || []).some(r => PUBLIC_AUDIENCES.includes(r))
    );
    setEvents(filtered);
    setLoading(false);
  }, [curDate]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const filteredEvents = useMemo(() =>
    events.filter(ev => {
      const cats = ev.categories || [];
      if (!cats.some(c => catFilter.has(c)) && cats.length > 0) return false;
      return true;
    }), [events, catFilter]);

  function navigate(dir: 1|-1) {
    const d = new Date(curDate);
    if (view==="month") d.setMonth(d.getMonth()+dir);
    else if (view==="week") d.setDate(d.getDate()+dir*7);
    else d.setDate(d.getDate()+dir);
    setCurDate(d);
  }

  function getTitle() {
    if (view==="month") return `${TH_MONTHS[curDate.getMonth()]} ${curDate.getFullYear()+543}`;
    if (view==="week") {
      const ws=startOfWeek(curDate); const we=addDays(ws,6);
      return `${ws.getDate()} – ${we.getDate()} ${TH_MONTHS[we.getMonth()]} ${we.getFullYear()+543}`;
    }
    if (view==="day") return `${curDate.getDate()} ${TH_MONTHS[curDate.getMonth()]} ${curDate.getFullYear()+543}`;
    return "รายการกิจกรรม";
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top bar — ไม่มีปุ่มกลับหน้าแรก / ไม่มีปุ่มเพิ่มกิจกรรม */}
      <div className="shrink-0 bg-white border-b border-slate-200 shadow-sm z-40">
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button onClick={()=>navigate(-1)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold">‹</button>
            <span className="font-bold text-slate-800 text-sm sm:text-base min-w-[150px] sm:min-w-[200px] text-center">{getTitle()}</span>
            <button onClick={()=>navigate(1)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold">›</button>
            <button onClick={()=>{setCurDate(todayDate);setSelected(todayStr);}}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50">วันนี้</button>
          </div>
          <div className="flex-1"/>
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl">
            {(["month","week","day","agenda"] as CalView[]).map(v=>(
              <button key={v} onClick={()=>setView(v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${view===v?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                {v==="month"?"เดือน":v==="week"?"สัปดาห์":v==="day"?"วัน":"รายการ"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4 overflow-y-auto hidden lg:flex flex-col gap-5">
          <MiniCal year={curDate.getFullYear()} month={curDate.getMonth()}
            today={todayStr} selected={selected}
            hasEv={d=>filteredEvents.some(e=>e.start_date<=d&&e.end_date>=d)}
            onSelect={d=>{setSelected(d);setCurDate(toDate(d));if(view!=="month")setView("day");}}/>

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
        </aside>

        {/* Main calendar */}
        <main className="flex-1 overflow-y-auto bg-white flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-400 animate-pulse text-sm">กำลังโหลด...</p>
            </div>
          ) : (
            <div className="flex-1">
              {view==="month" && <MonthView year={curDate.getFullYear()} month={curDate.getMonth()} events={filteredEvents} today={todayStr} onDayClick={d=>{setSelected(d);setCurDate(toDate(d));setView("day");}} onEventClick={ev=>setModalEv(ev)}/>}
              {view==="week"  && <WeekView currentDate={curDate} events={filteredEvents} today={todayStr} onEventClick={ev=>setModalEv(ev)} onDayClick={d=>{setSelected(d);setCurDate(toDate(d));setView("day");}}/>}
              {view==="day"   && <DayView currentDate={curDate} events={filteredEvents} today={todayStr} onEventClick={ev=>setModalEv(ev)}/>}
              {view==="agenda"&& <AgendaView events={filteredEvents} onEventClick={ev=>setModalEv(ev)}/>}
            </div>
          )}
        </main>
      </div>

      {modalEv && <ReadOnlyModal event={modalEv} onClose={()=>setModalEv(null)} />}
    </div>
  );
}

