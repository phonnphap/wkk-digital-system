"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ══════════════════════════════════════════════════════════════════════════════
// ── Types ─────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
type EventCategory = "academic"|"student"|"meeting"|"holiday"|"training"|"document"|"other";
type EventStatus   = "draft"|"pending"|"approved"|"rejected";
type CalView       = "month"|"week"|"day"|"agenda";

interface CalEvent {
  id: string;
  title: string;
  description?: string;
  category: EventCategory;
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
  position?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Config ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const APPROVER_ROLES = ["admin","director","deputy_director","dept_head","grade_head"];

const CAT_CONFIG: Record<EventCategory, { label: string; color: string; light: string; border: string; text: string }> = {
  academic:  { label:"วิชาการ",          color:"#185FA5", light:"#E6F1FB", border:"#A8C9EB", text:"#0C447C" },
  student:   { label:"กิจกรรมนักเรียน",  color:"#3B6D11", light:"#EBF4D6", border:"#ADCC80", text:"#264708" },
  meeting:   { label:"ประชุม",           color:"#854F0B", light:"#FAF0DC", border:"#F0C97A", text:"#5A3408" },
  holiday:   { label:"วันหยุด / สำคัญ", color:"#A32D2D", light:"#FAEAEA", border:"#EFA8A8", text:"#791F1F" },
  training:  { label:"อบรม / พัฒนา",    color:"#534AB7", light:"#EEECFB", border:"#B9B5E8", text:"#3C3489" },
  document:  { label:"ส่งเอกสาร",       color:"#0F6E56", light:"#D9F4EC", border:"#7FDAC2", text:"#085041" },
  other:     { label:"อื่นๆ",           color:"#6B7280", light:"#F3F4F6", border:"#D1D5DB", text:"#374151" },
};

const STATUS_CONFIG: Record<EventStatus, { label: string; cls: string }> = {
  draft:    { label:"ร่าง",         cls:"bg-slate-100 text-slate-600 border-slate-300" },
  pending:  { label:"รออนุมัติ",    cls:"bg-amber-50 text-amber-700 border-amber-300" },
  approved: { label:"อนุมัติแล้ว", cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  rejected: { label:"ไม่อนุมัติ",  cls:"bg-red-50 text-red-700 border-red-300" },
};

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const TH_DAYS_SHORT = ["อา","จ","อ","พ","พฤ","ศ","ส"];
const TH_DAYS_FULL  = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];

// ── Date helpers ──────────────────────────────────────────────────────────────
const ymd    = (d: Date) => d.toISOString().slice(0,10);
const toDate = (s: string) => new Date(s + "T00:00:00");

function thaiDateShort(iso: string) {
  const d = toDate(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()+543}`;
}
function fullName(u: any) {
  if (!u) return "—";
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—";
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function startOfWeek(d: Date) {
  const r = new Date(d); r.setDate(d.getDate() - d.getDay()); return r;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── EventPill ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function EventPill({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const cfg = CAT_CONFIG[ev.category];
  const style: React.CSSProperties = {
    background: ev.color_override ? ev.color_override + "22" : cfg.light,
    color: ev.color_override ?? cfg.text,
    borderLeft: `3px solid ${ev.color_override ?? cfg.color}`,
    padding: "1px 6px 1px 4px",
    borderRadius: "0 4px 4px 0",
    fontSize: 11,
    fontWeight: 500,
    marginBottom: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
    opacity: ev.status === "pending" ? 0.65 : 1,
    display: "block",
  };
  return (
    <span style={style} onClick={e => { e.stopPropagation(); onClick(); }}
      title={`${ev.title}${ev.status !== "approved" ? ` (${STATUS_CONFIG[ev.status].label})` : ""}`}>
      {ev.is_all_day ? "" : ev.start_time?.slice(0,5) + " "}
      {ev.title}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── EventModal (Add / Edit) ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function EventModal({
  event, user, isApprover, onSave, onDelete, onApprove, onReject, onClose,
}: {
  event: Partial<CalEvent> | null;
  user: UserProfile;
  isApprover: boolean;
  onSave: (data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!event?.id;
  const isOwner = !event?.id || event.created_by === user.id;

  const [title,       setTitle]       = useState(event?.title ?? "");
  const [desc,        setDesc]        = useState(event?.description ?? "");
  const [category,    setCategory]    = useState<EventCategory>(event?.category ?? "academic");
  const [location,    setLocation]    = useState(event?.location ?? "");
  const [startDate,   setStartDate]   = useState(event?.start_date ?? ymd(new Date()));
  const [endDate,     setEndDate]     = useState(event?.end_date ?? ymd(new Date()));
  const [startTime,   setStartTime]   = useState(event?.start_time?.slice(0,5) ?? "08:30");
  const [endTime,     setEndTime]     = useState(event?.end_time?.slice(0,5) ?? "16:30");
  const [isAllDay,    setIsAllDay]    = useState(event?.is_all_day ?? true);
  const [colorOvr,    setColorOvr]    = useState(event?.color_override ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject,  setShowReject]  = useState(false);
  const [loading,     setLoading]     = useState(false);

  const canEdit = isOwner || isApprover;
  const cfg = CAT_CONFIG[category];

  async function handleSave(asDraft: boolean) {
    if (!title || !startDate || !endDate) { alert("กรุณากรอกข้อมูลให้ครบ"); return; }
    if (endDate < startDate) { alert("วันที่สิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น"); return; }
    setLoading(true);
    await onSave({
      title, description: desc, category, location,
      start_date: startDate, end_date: endDate,
      start_time: isAllDay ? null : startTime + ":00",
      end_time:   isAllDay ? null : endTime + ":00",
      is_all_day: isAllDay,
      color_override: colorOvr || null,
      status: asDraft ? "draft" : "pending",
      created_by: user.id,
      is_public: true,
    });
    setLoading(false);
  }

  async function handleApprove() {
    if (!event?.id) return;
    setLoading(true);
    await onApprove(event.id);
    setLoading(false);
  }

  async function handleReject() {
    if (!event?.id || !rejectReason.trim()) { alert("กรุณาระบุเหตุผล"); return; }
    setLoading(true);
    await onReject(event.id, rejectReason.trim());
    setLoading(false);
  }

  const inputCls = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-400 focus:outline-none focus:bg-white transition-colors text-slate-800";
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: cfg.color }} />
            <h3 className="font-bold text-slate-800 text-base">
              {isEdit ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}
            </h3>
            {isEdit && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${STATUS_CONFIG[event?.status ?? "pending"].cls}`}>
                {STATUS_CONFIG[event?.status ?? "pending"].label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-lg">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Read-only view for non-owner */}
          {isEdit && !canEdit ? (
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-sm">
                <p><span className="text-slate-400">ชื่อ: </span><strong>{event?.title}</strong></p>
                <p><span className="text-slate-400">ประเภท: </span>{cfg.label}</p>
                <p><span className="text-slate-400">วันที่: </span>{thaiDateShort(event?.start_date!)}
                  {event?.start_date !== event?.end_date && ` – ${thaiDateShort(event?.end_date!)}`}</p>
                {!event?.is_all_day && <p><span className="text-slate-400">เวลา: </span>{event?.start_time?.slice(0,5)} – {event?.end_time?.slice(0,5)}</p>}
                {event?.location && <p><span className="text-slate-400">สถานที่: </span>{event.location}</p>}
                {event?.description && <p className="whitespace-pre-wrap text-slate-600">{event.description}</p>}
              </div>
            </div>
          ) : (
            <>
              {/* Category */}
              <div>
                <label className={labelCls}>ประเภทกิจกรรม</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {(Object.entries(CAT_CONFIG) as [EventCategory, typeof CAT_CONFIG[EventCategory]][]).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setCategory(k)}
                      style={category === k ? { background: v.light, borderColor: v.color, color: v.text } : {}}
                      className={`p-2 rounded-xl border-2 text-xs font-bold text-left transition-all ${
                        category === k ? "border-2" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      }`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className={labelCls}>ชื่อกิจกรรม <span className="text-red-400">*</span></label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="เช่น ประชุมคณะครูประจำเดือน" className={inputCls} />
              </div>

              {/* Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>วันที่เริ่ม <span className="text-red-400">*</span></label>
                  <input type="date" value={startDate}
                    onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>วันที่สิ้นสุด</label>
                  <input type="date" value={endDate} min={startDate}
                    onChange={e => setEndDate(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* All-day toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div className={`relative w-10 h-6 rounded-full transition-colors ${isAllDay ? "bg-blue-500" : "bg-slate-200"}`}
                  onClick={() => setIsAllDay(!isAllDay)}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isAllDay ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <span className="text-sm font-medium text-slate-600">กิจกรรมทั้งวัน</span>
              </label>

              {/* Time */}
              {!isAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>เวลาเริ่ม</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>เวลาสิ้นสุด</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}

              {/* Location */}
              <div>
                <label className={labelCls}>สถานที่</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="เช่น ห้องประชุมใหญ่ / โรงยิม" className={inputCls} />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>รายละเอียด</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                  placeholder="อธิบายรายละเอียดเพิ่มเติม..." className={inputCls + " resize-none"} />
              </div>

              {/* Color override */}
              <div className="flex items-center gap-3">
                <label className={labelCls + " mb-0"}>สีที่กำหนดเอง</label>
                <input type="color" value={colorOvr || cfg.color}
                  onChange={e => setColorOvr(e.target.value)}
                  className="w-10 h-9 rounded-lg border-2 border-slate-200 cursor-pointer p-0.5" />
                {colorOvr && (
                  <button onClick={() => setColorOvr("")} className="text-xs text-slate-400 hover:text-slate-600 underline">
                    รีเซ็ต
                  </button>
                )}
              </div>

              {/* Reject reason (if rejected) */}
              {event?.status === "rejected" && event?.reject_reason && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-red-500 mb-1">เหตุผลที่ไม่อนุมัติ</p>
                  <p className="text-sm text-red-700">{event.reject_reason}</p>
                </div>
              )}
            </>
          )}

          {/* Approver section */}
          {isEdit && isApprover && event?.status === "pending" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-bold text-amber-700 mb-3">⏳ รออนุมัติจากท่าน</p>
              {!showReject ? (
                <div className="flex gap-2">
                  <button onClick={handleApprove} disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-all">
                    ✅ อนุมัติ
                  </button>
                  <button onClick={() => setShowReject(true)}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-all">
                    ❌ ไม่อนุมัติ
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    rows={2} placeholder="ระบุเหตุผล..."
                    className="w-full bg-white border-2 border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleReject} disabled={loading}
                      className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm">
                      ยืนยันไม่อนุมัติ
                    </button>
                    <button onClick={() => setShowReject(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50 rounded-b-2xl">
          {isEdit && canEdit && (
            <button onClick={() => { if (confirm("ยืนยันการลบ?")) onDelete(event!.id!); }}
              className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100">
              🗑️
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-medium">
            ปิด
          </button>
          {canEdit && (
            <>
              <button onClick={() => handleSave(true)} disabled={loading || !title}
                className="px-4 py-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-700 text-sm font-bold hover:bg-amber-100 disabled:opacity-50">
                📝 บันทึกร่าง
              </button>
              <button onClick={() => handleSave(false)} disabled={loading || !title}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                {loading ? "กำลังส่ง..." : (isEdit ? "💾 บันทึก" : "📤 ส่งอนุมัติ")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Month View ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MonthView({ year, month, events, today, onDayClick, onEventClick }: {
  year: number; month: number; events: CalEvent[];
  today: string; onDayClick: (d: string) => void; onEventClick: (e: CalEvent) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startPad + 1;
    cells.push(dayNum >= 1 && dayNum <= lastDay.getDate() ? new Date(year, month, dayNum) : null);
  }

  function eventsForDay(d: Date) {
    const ds = ymd(d);
    return events.filter(e => e.start_date <= ds && e.end_date >= ds);
  }

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {TH_DAYS_SHORT.map((d, i) => (
          <div key={i} className={`text-center py-2 text-xs font-bold ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-400"}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7" style={{ borderLeft: "0.5px solid #e2e8f0" }}>
        {cells.map((d, i) => {
          const isToday = d && ymd(d) === today;
          const isOther = !d;
          const dayEvents = d ? eventsForDay(d) : [];

          return (
            <div key={i}
              onClick={() => d && onDayClick(ymd(d))}
              style={{ borderRight: "0.5px solid #e2e8f0", borderBottom: "0.5px solid #e2e8f0", minHeight: 80 }}
              className={`p-1 cursor-pointer transition-colors ${isOther ? "bg-slate-50" : isToday ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}>

              {/* Day number */}
              <div className="mb-1">
                {d && (
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    isToday ? "bg-blue-600 text-white" : d.getDay() === 0 ? "text-red-500" : d.getDay() === 6 ? "text-blue-600" : "text-slate-600"
                  }`}>
                    {d.getDate()}
                  </span>
                )}
              </div>

              {/* Events */}
              <div>
                {dayEvents.slice(0, 3).map(ev => (
                  <EventPill key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-slate-400 font-bold px-1">+{dayEvents.length - 3} รายการ</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Week View ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function WeekView({ currentDate, events, today, onEventClick, onDayClick }: {
  currentDate: Date; events: CalEvent[]; today: string;
  onEventClick: (e: CalEvent) => void; onDayClick: (d: string) => void;
}) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {days.map((d, i) => {
          const ds = ymd(d);
          const isToday = ds === today;
          return (
            <div key={i} onClick={() => onDayClick(ds)} className={`text-center py-3 cursor-pointer transition-colors ${isToday ? "bg-blue-50" : "hover:bg-slate-50"}`}>
              <div className={`text-xs font-bold mb-1 ${d.getDay() === 0 ? "text-red-400" : d.getDay() === 6 ? "text-blue-400" : "text-slate-400"}`}>
                {TH_DAYS_SHORT[d.getDay()]}
              </div>
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold mx-auto ${isToday ? "bg-blue-600 text-white" : "text-slate-700"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Events */}
      <div className="grid grid-cols-7" style={{ borderLeft: "0.5px solid #e2e8f0" }}>
        {days.map((d, i) => {
          const ds = ymd(d);
          const dayEvs = events.filter(e => e.start_date <= ds && e.end_date >= ds);
          return (
            <div key={i} style={{ borderRight: "0.5px solid #e2e8f0", minHeight: 200 }}
              className="p-1.5 bg-white">
              {dayEvs.map(ev => (
                <EventPill key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Day View ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function DayView({ currentDate, events, today, onEventClick }: {
  currentDate: Date; events: CalEvent[]; today: string; onEventClick: (e: CalEvent) => void;
}) {
  const ds = ymd(currentDate);
  const dayEvs = events.filter(e => e.start_date <= ds && e.end_date >= ds)
    .sort((a, b) => (a.start_time ?? "00:00") < (b.start_time ?? "00:00") ? -1 : 1);
  const isToday = ds === today;

  return (
    <div className="p-5 max-w-xl mx-auto">
      <div className={`text-center mb-5 p-4 rounded-2xl border ${isToday ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
        <p className="text-sm font-medium text-slate-400">{TH_DAYS_FULL[currentDate.getDay()]}</p>
        <p className={`text-3xl font-bold ${isToday ? "text-blue-600" : "text-slate-800"}`}>{currentDate.getDate()}</p>
        <p className="text-sm text-slate-400">{TH_MONTHS[currentDate.getMonth()]} {currentDate.getFullYear() + 543}</p>
      </div>

      {dayEvs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">ไม่มีกิจกรรมในวันนี้</div>
      ) : (
        <div className="space-y-2">
          {dayEvs.map(ev => {
            const cfg = CAT_CONFIG[ev.category];
            return (
              <div key={ev.id} onClick={() => onEventClick(ev)}
                style={{ borderLeft: `4px solid ${ev.color_override ?? cfg.color}`, background: ev.color_override ? ev.color_override + "11" : cfg.light }}
                className="rounded-r-xl px-4 py-3 cursor-pointer hover:brightness-95 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm" style={{ color: ev.color_override ?? cfg.text }}>{ev.title}</p>
                    {ev.location && <p className="text-xs text-slate-400 mt-0.5">📍 {ev.location}</p>}
                    {!ev.is_all_day && ev.start_time && (
                      <p className="text-xs text-slate-400 mt-0.5">🕐 {ev.start_time.slice(0,5)} – {ev.end_time?.slice(0,5)}</p>
                    )}
                    {ev.is_all_day && <p className="text-xs text-slate-400 mt-0.5">ทั้งวัน</p>}
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: cfg.color + "22", color: cfg.text }}>
                    {cfg.label}
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Agenda View ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function AgendaView({ events, onEventClick }: {
  events: CalEvent[]; onEventClick: (e: CalEvent) => void;
}) {
  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Group by month
  const groups: { monthKey: string; label: string; items: CalEvent[] }[] = [];
  for (const ev of sorted) {
    const d = toDate(ev.start_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last?.monthKey === key) { last.items.push(ev); }
    else groups.push({ monthKey: key, label: `${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`, items: [ev] });
  }

  if (sorted.length === 0) return (
    <div className="text-center py-16 text-slate-400 text-sm">ไม่มีกิจกรรม</div>
  );

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {groups.map(g => (
        <div key={g.monthKey}>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2">
            {g.label}
          </h3>
          <div className="space-y-2">
            {g.items.map(ev => {
              const cfg = CAT_CONFIG[ev.category];
              const startD = toDate(ev.start_date);
              const span = ev.start_date !== ev.end_date
                ? ` – ${toDate(ev.end_date).getDate()} ${TH_MONTHS[toDate(ev.end_date).getMonth()].slice(0,3)}`
                : "";
              return (
                <div key={ev.id} onClick={() => onEventClick(ev)}
                  className="flex gap-3 items-start cursor-pointer group">
                  {/* Date bubble */}
                  <div className="text-center w-10 shrink-0">
                    <div className="text-lg font-bold leading-none text-slate-700">{startD.getDate()}</div>
                    <div className="text-[10px] text-slate-400">{TH_DAYS_SHORT[startD.getDay()]}</div>
                  </div>
                  {/* Bar */}
                  <div className="w-1 self-stretch rounded-full shrink-0 mt-1" style={{ background: ev.color_override ?? cfg.color }} />
                  {/* Content */}
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 group-hover:border-slate-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{ev.title}{span}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: cfg.light, color: cfg.text }}>
                            {cfg.label}
                          </span>
                          {ev.location && <span className="text-xs text-slate-400">📍 {ev.location}</span>}
                          {!ev.is_all_day && ev.start_time && (
                            <span className="text-xs text-slate-400">🕐 {ev.start_time.slice(0,5)}</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${STATUS_CONFIG[ev.status].cls}`}>
                        {STATUS_CONFIG[ev.status].label}
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Mini Calendar (sidebar) ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MiniCalendar({ year, month, today, hasEvent, onSelect, selected }: {
  year: number; month: number; today: string;
  hasEvent: (d: string) => boolean;
  onSelect: (d: string) => void;
  selected: string;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;
  const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const n = i - startPad + 1;
    return n >= 1 && n <= lastDay.getDate() ? n : null;
  });

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {TH_DAYS_SHORT.map((d, i) => (
          <div key={i} className={`text-center text-[10px] font-bold pb-1 ${i===0?"text-red-400":i===6?"text-blue-400":"text-slate-400"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((n, i) => {
          if (!n) return <div key={i} />;
          const ds = ymd(new Date(year, month, n));
          const isTd = ds === today;
          const isSel = ds === selected;
          const hasEv = hasEvent(ds);
          return (
            <button key={i} type="button" onClick={() => onSelect(ds)}
              className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg text-[11px] font-bold transition-colors relative ${
                isSel ? "bg-blue-600 text-white" : isTd ? "bg-blue-100 text-blue-700" : "hover:bg-slate-100 text-slate-600"
              }`}>
              {n}
              {hasEv && !isSel && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Page ─────────────────────────────────════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
export default function CalendarPage() {
  const router = useRouter();
  const todayStr = ymd(new Date());
  const todayDate = new Date();

  // ── State ───────────────────────────────────────────────────────────────────
  const [user,       setUser]       = useState<UserProfile | null>(null);
  const [events,     setEvents]     = useState<CalEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState<CalView>("month");
  const [curDate,    setCurDate]    = useState(todayDate);
  const [selected,   setSelected]   = useState(todayStr);
  const [modalEv,    setModalEv]    = useState<Partial<CalEvent> | null | false>(false);
  const [catFilter,  setCatFilter]  = useState<Set<EventCategory>>(new Set(Object.keys(CAT_CONFIG) as EventCategory[]));
  const [showPending, setShowPending] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isApprover = !!(user && APPROVER_ROLES.includes(user.role));

  // ── Auth + load ─────────────────────────────────────────────────────────────
  useEffect(() => {
  const init = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }

    const meta = authUser.user_metadata ?? {};
    const claims = meta.custom_claims ?? {};
    const email =
      authUser.email || meta.email || meta.preferred_username || meta.upn ||
      claims.email || claims.preferred_username || claims.upn ||
      claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] || "";

    let { data } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, role, position")
      .eq("auth_id", authUser.id)
      .maybeSingle();

    if (!data && email) {
      const res = await supabase
        .from("users")
        .select("id, first_name, last_name, email, role, position")
        .eq("email", email)
        .maybeSingle();
      data = res.data;
      if (data) {
        await (supabase.from("users") as any)
          .update({ auth_id: authUser.id })
          .eq("id", (data as any).id);
      }
    }

    if (data) setUser(data as UserProfile);
    setLoading(false);
  };
  init();
}, []);

  const loadEvents = useCallback(async () => {
    // Load 3 months window around current month
    const from = ymd(new Date(curDate.getFullYear(), curDate.getMonth() - 1, 1));
    const to   = ymd(new Date(curDate.getFullYear(), curDate.getMonth() + 2, 0));
    const { data } = await (supabase.from("calendar_events") as any)
      .select("*, creator:users!created_by(first_name,last_name)")
      .gte("end_date", from)
      .lte("start_date", to)
      .order("start_date", { ascending: true });
    setEvents((data || []) as CalEvent[]);
  }, [curDate]);

  useEffect(() => { if (!loading && user) loadEvents(); }, [loading, user, loadEvents]);

  // ── Filtered events ──────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() =>
    events.filter(ev => {
      if (!catFilter.has(ev.category)) return false;
      if (ev.status === "draft" && ev.created_by !== user?.id) return false;
      if (!isApprover && ev.status === "pending" && ev.created_by !== user?.id) return false;
      return true;
    }),
    [events, catFilter, user, isApprover]
  );

  const pendingCount = useMemo(() =>
    events.filter(e => e.status === "pending").length,
    [events]
  );

  // ── Navigation ──────────────────────────────────────────────────────────────
  function navigate(dir: 1 | -1) {
    const d = new Date(curDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurDate(d);
  }

  function getTitle() {
    if (view === "month") return `${TH_MONTHS[curDate.getMonth()]} ${curDate.getFullYear() + 543}`;
    if (view === "week") {
      const ws = startOfWeek(curDate);
      const we = addDays(ws, 6);
      return `${ws.getDate()} – ${we.getDate()} ${TH_MONTHS[we.getMonth()]} ${we.getFullYear() + 543}`;
    }
    if (view === "day") return `${curDate.getDate()} ${TH_MONTHS[curDate.getMonth()]} ${curDate.getFullYear() + 543}`;
    return "รายการ";
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  async function handleSave(data: any) {
    const isEdit = !!(modalEv as CalEvent)?.id;
    if (isEdit) {
      await (supabase.from("calendar_events") as any).update(data).eq("id", (modalEv as CalEvent).id);
    } else {
      await (supabase.from("calendar_events") as any).insert([data]);
    }
    setModalEv(false);
    await loadEvents();
  }

  async function handleDelete(id: string) {
    await supabase.from("calendar_events").delete().eq("id", id);
    setModalEv(false);
    await loadEvents();
  }

  async function handleApprove(id: string) {
    await (supabase.from("calendar_events") as any).update({
      status: "approved", approved_by: user!.id, approved_at: new Date().toISOString(),
    }).eq("id", id);
    setModalEv(false);
    await loadEvents();
  }

  async function handleReject(id: string, reason: string) {
    await (supabase.from("calendar_events") as any).update({
      status: "rejected", reject_reason: reason,
    }).eq("id", id);
    setModalEv(false);
    await loadEvents();
  }

  function openAdd(startDate?: string) {
    setModalEv({ start_date: startDate ?? todayStr, end_date: startDate ?? todayStr });
  }

  // ── Upcoming (sidebar) ───────────────────────────────────────────────────────
  const upcoming = useMemo(() =>
    filteredEvents
      .filter(e => e.end_date >= todayStr && e.status === "approved")
      .slice(0, 6),
    [filteredEvents, todayStr]
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 animate-pulse">กำลังโหลด...</p>
    </div>
    );
    if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 animate-pulse">กำลังโหลดข้อมูลผู้ใช้...</p>
    </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
          {/* Back */}
          <button onClick={() => router.push("/")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">
            🏠
          </button>

          {/* Nav + Title */}
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
              ‹
            </button>
            <span className="font-bold text-slate-800 text-base min-w-[160px] text-center">{getTitle()}</span>
            <button onClick={() => navigate(1)}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
              ›
            </button>
            <button onClick={() => { setCurDate(todayDate); setSelected(todayStr); }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50">
              วันนี้
            </button>
          </div>

          <div className="flex-1" />

          {/* Views */}
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-xl">
            {(["month","week","day","agenda"] as CalView[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {v === "month" ? "เดือน" : v === "week" ? "สัปดาห์" : v === "day" ? "วัน" : "รายการ"}
              </button>
            ))}
          </div>

          {/* Pending badge (approver) */}
          {isApprover && pendingCount > 0 && (
            <button onClick={() => setShowPending(!showPending)}
              className="relative px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
              ⏳ รออนุมัติ
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            </button>
          )}

          {/* Add */}
          <button onClick={() => openAdd()}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5">
            + เพิ่มกิจกรรม
          </button>
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4 overflow-y-auto hidden lg:flex flex-col gap-5">
          {/* Mini calendar */}
          <div>
            <MiniCalendar
              year={curDate.getFullYear()} month={curDate.getMonth()}
              today={todayStr} selected={selected}
              hasEvent={d => filteredEvents.some(e => e.start_date <= d && e.end_date >= d && e.status === "approved")}
              onSelect={d => { setSelected(d); setCurDate(toDate(d)); if (view !== "month") setView("day"); }}
            />
          </div>

          {/* Category filter */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">หมวดหมู่</p>
            <div className="space-y-1">
              {(Object.entries(CAT_CONFIG) as [EventCategory, typeof CAT_CONFIG[EventCategory]][]).map(([k, v]) => {
                const on = catFilter.has(k);
                return (
                  <label key={k} className="flex items-center gap-2 cursor-pointer select-none group">
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${on ? "border-transparent" : "border-slate-300 bg-white"}`}
                      style={on ? { background: v.color } : {}}
                      onClick={() => {
                        const s = new Set(catFilter);
                        on ? s.delete(k) : s.add(k);
                        setCatFilter(s);
                      }}>
                      {on && <span className="text-white text-[9px] font-black">✓</span>}
                    </div>
                    <span className="text-xs font-medium text-slate-600 group-hover:text-slate-800">{v.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">กิจกรรมที่จะมาถึง</p>
              <div className="space-y-2">
                {upcoming.map(ev => {
                  const cfg = CAT_CONFIG[ev.category];
                  const d   = toDate(ev.start_date);
                  return (
                    <div key={ev.id} onClick={() => setModalEv(ev)}
                      className="flex gap-2 items-start cursor-pointer hover:bg-slate-50 rounded-lg p-1 transition-colors">
                      <div className="text-center w-8 shrink-0">
                        <div className="text-base font-bold leading-none text-slate-700">{d.getDate()}</div>
                        <div className="text-[9px] text-slate-400">{TH_MONTHS[d.getMonth()].slice(0,3)}</div>
                      </div>
                      <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ background: ev.color_override ?? cfg.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 leading-tight truncate">{ev.title}</p>
                        {!ev.is_all_day && ev.start_time && (
                          <p className="text-[10px] text-slate-400">{ev.start_time.slice(0,5)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* ── Calendar area ───────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-white">
          {/* Pending panel (approver) */}
          {isApprover && showPending && (
            <div className="border-b border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-bold text-amber-700 mb-3">⏳ รออนุมัติ ({pendingCount} รายการ)</h3>
              <div className="flex gap-3 flex-wrap">
                {events.filter(e => e.status === "pending").map(ev => {
                  const cfg = CAT_CONFIG[ev.category];
                  return (
                    <div key={ev.id} onClick={() => setModalEv(ev)}
                      style={{ borderLeft: `3px solid ${cfg.color}`, background: cfg.light }}
                      className="rounded-r-xl px-3 py-2 cursor-pointer hover:brightness-95 transition-all max-w-xs">
                      <p className="text-xs font-bold truncate" style={{ color: cfg.text }}>{ev.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{thaiDateShort(ev.start_date)}</p>
                      <p className="text-[10px] text-slate-400">{fullName(ev.creator)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "month"  && <MonthView year={curDate.getFullYear()} month={curDate.getMonth()} events={filteredEvents} today={todayStr} onDayClick={d => { setSelected(d); setView("day"); setCurDate(toDate(d)); }} onEventClick={setModalEv} />}
          {view === "week"   && <WeekView currentDate={curDate} events={filteredEvents} today={todayStr} onEventClick={setModalEv} onDayClick={d => { setSelected(d); setCurDate(toDate(d)); setView("day"); }} />}
          {view === "day"    && <DayView currentDate={curDate} events={filteredEvents} today={todayStr} onEventClick={setModalEv} />}
          {view === "agenda" && <AgendaView events={filteredEvents} onEventClick={setModalEv} />}
        </main>
      </div>

      {/* ── Event Modal ──────────────────────────────────────────────────────── */}
      {modalEv !== false && (
        <EventModal
          event={modalEv}
          user={user}
          isApprover={isApprover}
          onSave={handleSave}
          onDelete={handleDelete}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setModalEv(false)}
        />
      )}
    </div>
  );
}