"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const DAY_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ."];
const DAY_COLORS = [
  { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-700", header: "bg-yellow-400" },
  { bg: "bg-pink-50",   border: "border-pink-300",   text: "text-pink-700",   header: "bg-pink-400"   },
  { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-700",  header: "bg-green-500"  },
  { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", header: "bg-orange-400" },
  { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-700",   header: "bg-blue-500"   },
];
const SUBJECT_COLORS = [
  { bg: "bg-red-100",    border: "border-red-300",    text: "text-red-800"    },
  { bg: "bg-blue-100",   border: "border-blue-300",   text: "text-blue-800"   },
  { bg: "bg-green-100",  border: "border-green-300",  text: "text-green-800"  },
  { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-800" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
  { bg: "bg-pink-100",   border: "border-pink-300",   text: "text-pink-800"   },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
  { bg: "bg-teal-100",   border: "border-teal-300",   text: "text-teal-800"   },
  { bg: "bg-cyan-100",   border: "border-cyan-300",   text: "text-cyan-800"   },
];

const SCHEDULE_TEMPLATES = [
  {
    key: "primary", label: "ประถม (ป.1–ป.6)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:30", end_time: "10:30", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "10:30", end_time: "11:30", slot_label: "คาบ 3", is_break: false },
      { slot_number: 0, start_time: "11:30", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 4, start_time: "12:30", end_time: "13:30", slot_label: "คาบ 4", is_break: false },
      { slot_number: 5, start_time: "13:30", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
      { slot_number: 6, start_time: "14:30", end_time: "15:30", slot_label: "คาบ 6", is_break: false },
    ],
  },
  {
    key: "junior", label: "มัธยมต้น (ม.1–ม.3)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "10:10", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
      { slot_number: 0, start_time: "11:00", end_time: "12:00", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 4, start_time: "12:00", end_time: "12:50", slot_label: "คาบ 4", is_break: false },
      { slot_number: 5, start_time: "12:50", end_time: "13:40", slot_label: "คาบ 5", is_break: false },
      { slot_number: 0, start_time: "13:40", end_time: "13:50", slot_label: "พักย่อย", is_break: true },
      { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
      { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
    ],
  },
  {
    key: "senior", label: "มัธยมปลาย (ม.4–ม.6)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:20", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:20", end_time: "10:10", slot_label: "คาบ 2", is_break: false },
      { slot_number: 0, start_time: "10:10", end_time: "10:20", slot_label: "พักย่อย", is_break: true },
      { slot_number: 3, start_time: "10:20", end_time: "11:10", slot_label: "คาบ 3", is_break: false },
      { slot_number: 4, start_time: "11:10", end_time: "12:00", slot_label: "คาบ 4", is_break: false },
      { slot_number: 0, start_time: "12:00", end_time: "13:00", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 5, start_time: "13:00", end_time: "13:50", slot_label: "คาบ 5", is_break: false },
      { slot_number: 6, start_time: "13:50", end_time: "14:40", slot_label: "คาบ 6", is_break: false },
      { slot_number: 7, start_time: "14:40", end_time: "15:30", slot_label: "คาบ 7", is_break: false },
    ],
  },
];

const ADMIN_ROLES    = ["admin", "director", "deputy_director", "dept_head"];
const APPROVER_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head", "subject_head"];

type UserProfile = {
  id: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string;
  homeroom_classroom_id?: string; grade_level?: string; subject_group?: string;
};
type TimeSlot   = { id: string; slot_number: number; start_time: string; end_time: string; slot_label?: string; is_break: boolean; schedule_type?: string };
type Subject    = { id: string; subject_code: string; name_th: string; subject_group?: string };
type Teacher    = { id: string; first_name?: string; last_name?: string; full_name?: string; position?: string };
type Classroom  = { id: string; room_number: number; room_name?: string; grade_group?: string; academic_year_id?: string; schedule_type?: string };
type TimetableEntry = {
  id: string; classroom_id: string; subject_id: string; teacher_id: string;
  teacher_id_2?: string; day_of_week: number; time_slot_id: string; academic_year_id: string;
  subject?: Subject; teacher?: Teacher; teacher2?: Teacher;
};
type AcademicYearRaw = { id: string; year_name: string; semester?: number; is_current?: boolean };
type ChangeRequest = {
  id: string; requester_id: string; classroom_id: string; time_slot_id: string;
  day_of_week: number; academic_year_id: string;
  old_subject_id?: string; old_teacher_id?: string; old_teacher_id_2?: string;
  new_subject_id: string; new_teacher_id: string; new_teacher_id_2?: string;
  status: "pending" | "approved" | "rejected";
  note?: string; reject_reason?: string; reviewed_by?: string; reviewed_at?: string; created_at: string;
  requester?: any;
};

// ── helpers ───────────────────────────────────────────────────────────────────
function fullName(u: any) {
  if (!u) return "—";
  if (u.full_name) return u.full_name;
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—";
}
function displayName(u: any) {
  if (!u) return "—";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name  ?? "").trim();
  if (fn || ln) return `${fn} ${ln}`.trim();
  return u.full_name ?? "—";
}
function formatTime(t: string) { return t?.slice(0, 5) ?? ""; }
function gradeGroupSortKey(g?: string) {
  if (!g) return 999;
  if (g.includes("อนุบาล")) return 0;
  if (g.includes("ประถม"))  return 1;
  if (g.includes("มัธยมศึกษาตอนต้น")) return 2;
  if (g.includes("มัธยมศึกษาตอนปลาย")) return 3;
  return 4;
}

// ★ FIX: สร้าง time slots จาก template เสมอ ไม่ depend on DB schedule_type
// จับคู่ด้วย start_time เท่านั้น (ไม่ filter schedule_type เพื่อ backward compat)
function buildRoomSlots(scheduleType: string | undefined, allDbSlots: TimeSlot[]): TimeSlot[] {
  const type = scheduleType ?? "primary";
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[0];

  return tmpl.slots.map((tmplSlot, idx) => {
    // ★ match เฉพาะ start_time (ไม่กรอง schedule_type) เพื่อรองรับ DB ที่ไม่มี schedule_type
    const dbSlot = allDbSlots.find(s => s.start_time.slice(0, 5) === tmplSlot.start_time);
    if (dbSlot) {
      // ถ้าเจอใน DB ใช้ id จริง แต่ override label/break จาก template
      return {
        ...dbSlot,
        slot_label: tmplSlot.slot_label,
        is_break: tmplSlot.is_break,
        end_time: tmplSlot.end_time,
      };
    }
    // fallback: สร้าง virtual slot จาก template
    return {
      id: `tmpl-${type}-${idx}-${tmplSlot.start_time.replace(":", "")}`,
      slot_number: tmplSlot.slot_number,
      start_time: tmplSlot.start_time,
      end_time: tmplSlot.end_time,
      slot_label: tmplSlot.slot_label,
      is_break: tmplSlot.is_break,
      schedule_type: type,
    } as TimeSlot;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Entry Modal ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function EntryModal({ entry, slot, day, classroom, subjects, teachers, academicYearId,
  canEditDirect, currentUser, onSave, onRequestChange, onDelete, onClose }: {
  entry?: TimetableEntry; slot: TimeSlot; day: number; classroom: Classroom;
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  canEditDirect: boolean; currentUser: UserProfile;
  onSave: (d: any) => Promise<void>;
  onRequestChange: (d: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [subjectGroup, setSubjectGroup] = useState("");
  const [subjectId,   setSubjectId]    = useState(entry?.subject_id ?? "");
  const [teacherId1,  setTeacherId1]   = useState(entry?.teacher_id ?? "");
  const [teacherId2,  setTeacherId2]   = useState(entry?.teacher_id_2 ?? "");
  const [note,        setNote]         = useState("");
  const [loading,     setLoading]      = useState(false);
  const dc = DAY_COLORS[day - 1];

  function getGradeDigit(code: string) {
    const m = code?.match(/^[ก-ฮA-Za-z]+(\d)(\d)/);
    return m ? m[2] : "";
  }
  function getRoomGradeLevel() {
    const m = (classroom.room_name ?? "").match(/[ปมอ]\.?(\d+)/);
    return m ? m[1] : "";
  }
  function getRoomPrefix() {
    const m = (classroom.room_name ?? "").match(/([ปมอ])\./);
    return m ? m[1] + "." : "";
  }

  const roomGrade  = getRoomGradeLevel();
  const roomPrefix = getRoomPrefix();
  const subjectGroups = [...new Set(subjects.map(s => s.subject_group).filter(Boolean))].sort();

  // ★ FIX: ถ้าไม่มีวิชาตาม grade ให้แสดงทั้งหมด (fallback)
  const filteredByGrade = roomGrade
    ? subjects.filter(s => getGradeDigit(s.subject_code) === roomGrade)
    : subjects;
  const useGradeFilter  = filteredByGrade.length > 0;
  const baseSubjects    = useGradeFilter ? filteredByGrade : subjects;
  const filteredSubjects = subjectGroup
    ? baseSubjects.filter(s => s.subject_group === subjectGroup)
    : baseSubjects;

  async function handleSubmit() {
    if (!subjectId || !teacherId1) { alert("กรุณาเลือกวิชาและครูอย่างน้อย 1 คน"); return; }
    setLoading(true);
    const data = {
      id: entry?.id,
      classroom_id: classroom.id,
      subject_id: subjectId, teacher_id: teacherId1, teacher_id_2: teacherId2 || null,
      day_of_week: day, time_slot_id: slot.id, academic_year_id: academicYearId,
      old_subject_id: entry?.subject_id, old_teacher_id: entry?.teacher_id, old_teacher_id_2: entry?.teacher_id_2,
      note,
    };
    if (canEditDirect) await onSave(data);
    else await onRequestChange(data);
    setLoading(false);
  }

  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-blue-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`${dc.header} px-6 py-4`}>
          <p className="text-sm text-white/80">{DAYS[day-1]} · {slot.slot_label} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}</p>
          <h3 className="text-lg font-black text-white mt-0.5">
            {canEditDirect ? (entry ? "✏️ แก้ไขคาบเรียน" : "➕ เพิ่มคาบเรียน") : "📝 เสนอขอแก้ไขคาบเรียน"}
          </h3>
          <p className="text-sm text-white/70">ห้อง {classroom.grade_group} {classroom.room_name}</p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!canEditDirect && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-4 py-3 flex gap-2">
              <span className="text-amber-500 text-lg shrink-0">⏳</span>
              <div>
                <p className="text-amber-700 font-black text-sm">คำขอต้องรับการอนุมัติก่อน</p>
                <p className="text-amber-600 text-xs">หัวหน้าสาย/หมวด หรือผู้บริหารจะตรวจสอบ</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">กลุ่มสาระ</label>
            <select value={subjectGroup} onChange={e => { setSubjectGroup(e.target.value); setSubjectId(""); }} className={inp}>
              <option value="">— ทุกกลุ่มสาระ —</option>
              {subjectGroups.map(g => <option key={g} value={g!}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              รายวิชา *
              {roomGrade && useGradeFilter && (
                <span className="text-slate-400 font-normal normal-case ml-1">(กรองเฉพาะชั้น {roomPrefix}{roomGrade})</span>
              )}
              {roomGrade && !useGradeFilter && (
                <span className="text-amber-500 font-normal normal-case ml-1">(แสดงทุกวิชา)</span>
              )}
            </label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inp}>
              <option value="">— เลือกรายวิชา —</option>
              {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.subject_code} {s.name_th}</option>)}
            </select>
            {filteredSubjects.length === 0 && (
              <p className="text-xs text-red-500 font-bold mt-1">⚠️ ไม่พบวิชา กรุณาเพิ่มวิชาในระบบ</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ครูผู้สอน คนที่ 1 *</label>
            <select value={teacherId1} onChange={e => setTeacherId1(e.target.value)} className={inp}>
              <option value="">— เลือกครู —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              ครูผู้สอน คนที่ 2 <span className="text-slate-400 font-normal normal-case">(ถ้ามี)</span>
            </label>
            <select value={teacherId2} onChange={e => setTeacherId2(e.target.value)} className={inp}>
              <option value="">— ไม่มีครูคนที่ 2 —</option>
              {teachers.filter(t => t.id !== teacherId1).map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
          </div>

          {!canEditDirect && (
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">หมายเหตุ / เหตุผล</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="เช่น สลับคาบกับเพื่อนครู..."
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm resize-none focus:border-blue-400 focus:outline-none" />
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          {entry && onDelete && canEditDirect && (
            <button onClick={async () => { if (confirm("ลบคาบนี้?")) { setLoading(true); await onDelete(entry.id); setLoading(false); } }}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm">🗑️ ลบ</button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳..." : canEditDirect ? "💾 บันทึก" : "📤 ส่งคำขอ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Change Requests Panel ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ChangeRequestsPanel({ requests, subjects, teachers, classrooms, timeSlots, currentUser,
  canApprove, onApprove, onReject }: {
  requests: ChangeRequest[]; subjects: Subject[]; teachers: Teacher[];
  classrooms: Classroom[]; timeSlots: TimeSlot[]; currentUser: UserProfile;
  canApprove: boolean;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [rejectId,     setRejectId]     = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [tab,          setTab]          = useState<"pending" | "history">("pending");
  const [loading,      setLoading]      = useState<string | null>(null);

  const pending = requests.filter(r => r.status === "pending");
  const history = requests.filter(r => r.status !== "pending");
  const list    = tab === "pending" ? pending : history;

  function subjectName(id?: string) { return subjects.find(s => s.id === id)?.name_th ?? "—"; }
  function teacherName(id?: string) { const t = teachers.find(t => t.id === id); return t ? displayName(t) : "—"; }
  function roomName(id?: string) { const r = classrooms.find(c => c.id === id); return r ? `${r.grade_group ?? ""} ${r.room_name ?? ""}`.trim() : "—"; }
  function slotLabel(id?: string) {
    for (const tmpl of SCHEDULE_TEMPLATES) {
      const s = tmpl.slots.find((_, i) => `tmpl-${tmpl.key}-${i}` === id || timeSlots.find(ts => ts.id === id));
    }
    return timeSlots.find(s => s.id === id)?.slot_label ?? "—";
  }

  const statusBadge = (s: string) => {
    if (s === "pending")  return <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-300">⏳ รออนุมัติ</span>;
    if (s === "approved") return <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-300">✅ อนุมัติแล้ว</span>;
    return <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-300">❌ ปฏิเสธ</span>;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50 border-b px-5 py-3 flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-700">📋 คำขอแก้ไขตารางสอน</h3>
          {pending.length > 0 && <p className="text-xs text-amber-600 font-bold">มี {pending.length} รายการรออนุมัติ</p>}
        </div>
        <div className="flex gap-1">
          {(["pending", "history"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${tab === t ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
              {t === "pending" ? `⏳ รออนุมัติ${pending.length > 0 ? ` (${pending.length})` : ""}` : "📜 ประวัติ"}
            </button>
          ))}
        </div>
      </div>

      {rejectId && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-black text-slate-800 text-lg mb-3">❌ เหตุผลที่ปฏิเสธ</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              placeholder="กรุณาระบุเหตุผล..."
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:border-red-400 focus:outline-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setRejectId(null); setRejectReason(""); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ยกเลิก</button>
              <button onClick={async () => {
                if (!rejectReason.trim()) { alert("กรุณาระบุเหตุผล"); return; }
                setLoading(rejectId);
                await onReject(rejectId, rejectReason);
                setRejectId(null); setRejectReason(""); setLoading(null);
              }} className="flex-[2] py-2.5 rounded-xl bg-red-500 text-white font-black text-sm">❌ ยืนยันปฏิเสธ</button>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {list.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <p className="text-3xl mb-2">{tab === "pending" ? "✅" : "📭"}</p>
            <p className="font-bold text-sm">{tab === "pending" ? "ไม่มีรายการรออนุมัติ" : "ยังไม่มีประวัติ"}</p>
          </div>
        )}
        {list.map(req => (
          <div key={req.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {statusBadge(req.status)}
                  <span className="text-xs text-slate-500 font-bold">
                    {fullName(req.requester)} · ห้อง {roomName(req.classroom_id)} · {DAYS[(req.day_of_week ?? 1) - 1]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <p className="text-xs font-black text-red-500 mb-1">เดิม</p>
                    <p className="font-bold text-slate-700 text-xs">{subjectName(req.old_subject_id)}</p>
                    <p className="text-slate-500 text-xs">{teacherName(req.old_teacher_id)}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <p className="text-xs font-black text-emerald-600 mb-1">ใหม่ที่ขอ</p>
                    <p className="font-bold text-slate-700 text-xs">{subjectName(req.new_subject_id)}</p>
                    <p className="text-slate-500 text-xs">{teacherName(req.new_teacher_id)}</p>
                  </div>
                </div>
                {req.note && <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg px-3 py-1.5">💬 {req.note}</p>}
                {req.reject_reason && <p className="text-xs text-red-600 mt-2 bg-red-50 rounded-lg px-3 py-1.5">❌ {req.reject_reason}</p>}
                <p className="text-xs text-slate-400 mt-1">{new Date(req.created_at).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric" })}</p>
              </div>
              {canApprove && req.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <button disabled={loading === req.id}
                    onClick={async () => { setLoading(req.id); await onApprove(req.id); setLoading(null); }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm disabled:opacity-50">
                    {loading === req.id ? "⏳" : "✅ อนุมัติ"}
                  </button>
                  <button onClick={() => setRejectId(req.id)}
                    className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm">❌ ปฏิเสธ</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Timetable Grid ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function TimetableGrid({ classroom, entries, timeSlots, subjects, teachers, academicYearId,
  canEditDirect, currentUser, onSave, onRequestChange, onDelete }: {
  classroom: Classroom; entries: TimetableEntry[]; timeSlots: TimeSlot[];
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  canEditDirect: boolean; currentUser: UserProfile;
  onSave: (d: any) => Promise<void>;
  onRequestChange: (d: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [modal, setModal] = useState<{ slot: TimeSlot; day: number; entry?: TimetableEntry } | null>(null);

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  function getEntry(day: number, slotId: string) {
    return entries.find(e => e.day_of_week === day && e.time_slot_id === slotId);
  }

  // ★ FIX: ทุก role คลิกได้ แต่ต่างกันที่ผลลัพธ์
  // admin → แก้ตรง | ครู → ส่งคำขอ (เฉพาะคาบตัวเอง หรือช่องว่าง)
  function canInteract(entry?: TimetableEntry): boolean {
    if (canEditDirect) return true; // admin คลิกได้ทั้งหมด
    if (!entry) return true; // ★ ครูก็เพิ่มคาบใหม่ได้ (ส่งเป็น request)
    return entry.teacher_id === currentUser.id || entry.teacher_id_2 === currentUser.id;
  }

  return (
    <>
      {modal && (
        <EntryModal
          entry={modal.entry} slot={modal.slot} day={modal.day} classroom={classroom}
          subjects={subjects} teachers={teachers} academicYearId={academicYearId}
          canEditDirect={canEditDirect} currentUser={currentUser}
          onSave={async (d) => { await onSave(d); setModal(null); }}
          onRequestChange={async (d) => { await onRequestChange(d); setModal(null); }}
          onDelete={async (id) => { await onDelete(id); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      <div className="w-full rounded-2xl border border-slate-200 shadow-sm bg-white overflow-x-auto">
        <table className="border-collapse w-full" style={{ minWidth: "600px" }}>
          <colgroup>
            <col style={{ width: "80px", minWidth: "70px" }} />
            {timeSlots.map(slot => (
              <col key={slot.id} style={{ width: slot.is_break ? "52px" : undefined, minWidth: slot.is_break ? "44px" : "110px" }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="px-2 py-3 bg-slate-50 border-b-2 border-r-2 border-slate-200 text-slate-400 font-black text-xs uppercase text-center sticky left-0 z-10">
                วัน / คาบ
              </th>
              {timeSlots.map(slot => (
                <th key={slot.id} className={`px-1 py-2 border-b-2 border-r border-slate-200 text-center font-black ${slot.is_break ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                  {slot.is_break ? (
                    <div className="text-[9px] leading-tight opacity-60"><div>{slot.slot_label}</div><div>{formatTime(slot.start_time)}</div></div>
                  ) : (
                    <><div className="text-xs text-slate-700">{slot.slot_label}</div><div className="text-[10px] font-normal text-slate-400">{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</div></>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(day => {
              const dc = DAY_COLORS[day - 1];
              return (
                <tr key={day} className="border-b border-slate-100">
                  <td className={`px-2 py-3 border-r-2 border-slate-200 sticky left-0 z-10 ${dc.bg}`}>
                    <div className={`font-black text-sm ${dc.text}`}>{DAYS[day - 1]}</div>
                    <div className={`text-[10px] ${dc.text} opacity-60`}>{DAY_SHORT[day - 1]}</div>
                  </td>
                  {timeSlots.map(slot => {
                    if (slot.is_break) return (
                      <td key={slot.id} className="bg-slate-50 border-r border-slate-100 text-center p-0">
                        <div className="text-[9px] text-slate-300 font-bold" style={{ writingMode: "vertical-rl", whiteSpace: "nowrap", margin: "0 auto" }}>พัก</div>
                      </td>
                    );

                    const entry    = getEntry(day, slot.id);
                    const colors   = entry ? (subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0]) : null;
                    const teacher1 = entry ? (teachers.find(t => t.id === entry.teacher_id) ?? (entry as any).teacher) : null;
                    const teacher2 = entry?.teacher_id_2 ? (teachers.find(t => t.id === entry.teacher_id_2) ?? (entry as any).teacher2) : null;
                    const subject  = entry ? (subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject) : null;
                    const isMyClass = entry?.teacher_id === currentUser.id || entry?.teacher_id_2 === currentUser.id;
                    const clickable = canInteract(entry);

                    return (
                      <td key={slot.id} className="p-1 align-top border-r border-slate-100">
                        {entry && colors ? (
                          <div
                            className={`rounded-xl border-2 px-2 py-2 transition-all
                              ${colors.bg} ${colors.border} ${colors.text}
                              ${clickable ? "cursor-pointer hover:shadow-md hover:scale-[1.01]" : ""}
                              ${isMyClass ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
                            style={{ minHeight: "92px" }}
                            onClick={() => clickable && setModal({ slot, day, entry })}>
                            <p className="font-black text-xs leading-tight line-clamp-2 mb-1">{(subject as any)?.name_th ?? "—"}</p>
                            <p className="text-[11px] font-bold opacity-80 leading-tight">{displayName(teacher1)}</p>
                            {teacher2 && <p className="text-[11px] font-bold opacity-80 leading-tight mt-0.5">{displayName(teacher2)}</p>}
                            {isMyClass && <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded mt-1 inline-block">ฉัน</span>}
                          </div>
                        ) : (
                          clickable ? (
                            <div className="rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center"
                              style={{ minHeight: "92px" }}
                              onClick={() => setModal({ slot, day })}>
                              <span className="text-slate-300 text-2xl">+</span>
                            </div>
                          ) : (
                            <div className="rounded-xl border-2 border-dashed border-slate-100" style={{ minHeight: "92px" }} />
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Schedule Settings Modal ────────────────────────────────────────────────────
function ScheduleSettingsModal({ onClose, onApply }: { onClose: () => void; onApply: (type: string) => Promise<void> }) {
  const [selected, setSelected] = useState("primary");
  const [loading,  setLoading]  = useState(false);
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === selected)!;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 px-6 py-4"><h3 className="text-lg font-black text-white">⚙️ ตั้งค่าตารางเวลา</h3></div>
        <div className="p-6">
          <div className="flex gap-2 mb-5">
            {SCHEDULE_TEMPLATES.map(t => (
              <button key={t.key} onClick={() => setSelected(t.key)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 ${selected === t.key ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
            {tmpl.slots.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2 ${s.is_break ? "bg-amber-50" : ""}`}>
                <span className={`text-xs font-black w-16 ${s.is_break ? "text-amber-600" : "text-blue-600"}`}>{s.is_break ? "พัก" : s.slot_label}</span>
                <span className="text-xs text-slate-500">{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                {s.is_break && <span className="text-xs text-amber-500 font-bold">{s.slot_label}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={async () => { setLoading(true); await onApply(selected); setLoading(false); onClose(); }} disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳..." : "✅ ใช้ตารางเวลานี้"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Personal Timetable Grid ────────────────────────────────────────────────────
function PersonalTimetableGrid({ myEntries, timeSlots, subjects, teachers, classrooms, userId }: {
  myEntries: TimetableEntry[]; timeSlots: TimeSlot[]; subjects: Subject[]; teachers: Teacher[]; classrooms: Classroom[]; userId: string;
}) {
  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
  return (
    <div className="w-full rounded-2xl border border-slate-200 shadow-sm bg-white overflow-x-auto">
      <table className="border-collapse w-full" style={{ minWidth: "600px" }}>
        <colgroup>
          <col style={{ width: "80px", minWidth: "70px" }} />
          {timeSlots.map(slot => (
            <col key={slot.id} style={{ width: slot.is_break ? "52px" : undefined, minWidth: slot.is_break ? "44px" : "110px" }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="px-2 py-3 bg-slate-50 border-b-2 border-r-2 border-slate-200 text-slate-400 font-black text-xs uppercase text-center sticky left-0 z-10">วัน / คาบ</th>
            {timeSlots.map(slot => (
              <th key={slot.id} className={`px-1 py-2 border-b-2 border-r border-slate-200 text-center font-black ${slot.is_break ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                {slot.is_break
                  ? <div className="text-[9px] leading-tight opacity-60"><div>{slot.slot_label}</div><div>{formatTime(slot.start_time)}</div></div>
                  : <><div className="text-xs">{slot.slot_label}</div><div className="text-[10px] font-normal text-slate-400">{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</div></>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map(day => {
            const dc = DAY_COLORS[day - 1];
            return (
              <tr key={day} className="border-b border-slate-100">
                <td className={`px-2 py-3 border-r-2 border-slate-200 sticky left-0 z-10 ${dc.bg}`}>
                  <div className={`font-black text-sm ${dc.text}`}>{DAYS[day - 1]}</div>
                  <div className={`text-[10px] ${dc.text} opacity-60`}>{DAY_SHORT[day - 1]}</div>
                </td>
                {timeSlots.map(slot => {
                  if (slot.is_break) return (
                    <td key={slot.id} className="bg-slate-50 border-r border-slate-100 text-center p-0">
                      <div className="text-[9px] text-slate-300 font-bold" style={{ writingMode: "vertical-rl", whiteSpace: "nowrap", margin: "0 auto" }}>พัก</div>
                    </td>
                  );
                  const entry = myEntries.find(e => e.day_of_week === day && e.time_slot_id === slot.id);
if (!entry) return <td key={slot.id} className="p-1 border-r border-slate-100"><div className="rounded-xl border-2 border-dashed border-slate-100" style={{ minHeight: "92px" }} /></td>;
const colors  = subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0];
const subject = subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject;
const room    = classrooms.find(c => c.id === entry.classroom_id);
// ★ ย้ายมาตรงนี้
const otherTeacherId = entry.teacher_id === userId ? entry.teacher_id_2 : entry.teacher_id;
const otherTeacher = otherTeacherId ? teachers.find(t => t.id === otherTeacherId) : null;
return (
  <td key={slot.id} className="p-1 align-top border-r border-slate-100">
    <div className={`rounded-xl border-2 px-2 py-2 ${colors.bg} ${colors.border} ${colors.text} ring-2 ring-offset-1 ring-blue-400`} style={{ minHeight: "92px" }}>
      <p className="font-black text-xs leading-tight line-clamp-2 mb-1">{(subject as any)?.name_th ?? "—"}</p>
      {room && <p className="text-[10px] font-bold opacity-70">{room.grade_group} {room.room_name}</p>}
      {otherTeacher && <p className="text-[10px] font-bold opacity-70">ร่วมกับ {displayName(otherTeacher)}</p>}
      <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded mt-1 inline-block">
        {entry.teacher_id_2 === userId ? "ครู 2" : "ครู 1"}
      </span>
    </div>
  </td>
);
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Page ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function SchedulePage() {
  const router = useRouter();
  const [user,             setUser]             = useState<UserProfile | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [allClassrooms,    setAllClassrooms]    = useState<Classroom[]>([]);
  const [classrooms,       setClassrooms]       = useState<Classroom[]>([]);
  const [timeSlots,        setTimeSlots]        = useState<TimeSlot[]>([]);
  const [subjects,         setSubjects]         = useState<Subject[]>([]);
  const [teachers,         setTeachers]         = useState<Teacher[]>([]);
  const [entries,          setEntries]          = useState<TimetableEntry[]>([]);
  const [changeRequests,   setChangeRequests]   = useState<ChangeRequest[]>([]);
  const [academicYearsRaw, setAcademicYearsRaw] = useState<AcademicYearRaw[]>([]);
  const [academicYears,    setAcademicYears]    = useState<{ id: string; year_name: string }[]>([]);
  const [selectedYear,     setSelectedYear]     = useState("");
  const [selectedRoom,     setSelectedRoom]     = useState("");
  const [viewMode,         setViewMode]         = useState<"room" | "teacher" | "requests">("room");
  const [showSettings,     setShowSettings]     = useState(false);
  const [roomTimeSlots,    setRoomTimeSlots]    = useState<TimeSlot[]>([]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const meta  = authUser.user_metadata ?? {};
      const email = authUser.email || meta.email || meta.preferred_username || meta.upn || "";

      let profileData: any = null;
      const { data: byAuthId } = await supabase.from("users")
        .select("id,first_name,last_name,full_name,email,role,position,homeroom_classroom_id,grade_level,subject_group")
        .eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;

      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id,first_name,last_name,full_name,email,role,position,homeroom_classroom_id,grade_level,subject_group")
          .eq("email", email).maybeSingle();
        profileData = byEmail;
        if (profileData) await (supabase.from("users") as any).update({ auth_id: authUser.id }).eq("id", profileData.id);
      }
      if (!profileData) profileData = { id: authUser.id, email: authUser.email ?? "", first_name: "", last_name: "", role: "subject_teacher" };

      setUser({ ...profileData, full_name: profileData.full_name || `${profileData.first_name ?? ""} ${profileData.last_name ?? ""}`.trim() });

      
      // ★ FIX: ดึง time_slots แบบง่าย ไม่ filter schedule_type
      const [yearsRes, slotsRes, subjectsRes, teachersRes, classroomsRes] = await Promise.all([
        supabase.from("academic_years")
          .select("id,year_name,semester,is_current")
          .order("year_name", { ascending: false })
          .order("semester", { ascending: false }),
        supabase.from("time_slots").select("*").order("start_time"),
        supabase.from("subjects").select("id,subject_code,name_th,subject_group").order("subject_code"),
        supabase.from("users")
          .select("id,title,first_name,last_name,full_name,position,role")
          .order("first_name"),
        // ★ FIX: ดึงห้องทั้งหมด ไม่ filter
        supabase.from("classrooms")
          .select("id,room_number,room_name,grade_group,academic_year_id,schedule_type")
          .order("grade_group").order("room_number"),
      ]);

      const yearsRaw = (yearsRes.data ?? []) as AcademicYearRaw[];
      const allRooms = (classroomsRes.data ?? []) as Classroom[];
      const allSlots = (slotsRes.data ?? []) as TimeSlot[];

      setAcademicYearsRaw(yearsRaw);
      setTimeSlots(allSlots);
      setSubjects((subjectsRes.data ?? []) as Subject[]);
      setTeachers(((teachersRes.data ?? []) as any[]).map(t => ({
        ...t, full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
      })));
      setAllClassrooms(allRooms);

      const uniqueYearMap = new Map<string, string>();
      yearsRaw.forEach(y => { if (!uniqueYearMap.has(y.year_name)) uniqueYearMap.set(y.year_name, y.id); });
      const uniqueYears = Array.from(uniqueYearMap.entries()).map(([year_name, id]) => ({ id, year_name }));
      setAcademicYears(uniqueYears);

      const currentYearRow = yearsRaw.find(y => y.is_current) ?? yearsRaw[0];

      if (currentYearRow) {
        const initYearId = uniqueYearMap.get(currentYearRow.year_name) ?? currentYearRow.id;
        setSelectedYear(initYearId);

        // ★ FIX: หาห้องที่ตรงปี ถ้าไม่มีเลย → แสดงทั้งหมด
        const sameYearIds = yearsRaw.filter(y => y.year_name === currentYearRow.year_name).map(y => y.id);
        const matched     = allRooms.filter(r => sameYearIds.includes(r.academic_year_id ?? ""));
        const roomList    = matched.length > 0 ? matched : allRooms; // ★ fallback แสดงทั้งหมด

        setClassrooms(roomList);

        const homeroomId = profileData?.homeroom_classroom_id;
        const initRoom   = (homeroomId && roomList.find((r: Classroom) => r.id === homeroomId))
          ? homeroomId : (roomList[0]?.id ?? "");
        setSelectedRoom(initRoom);

      } else {
        // ★ ไม่มี academic_years → แสดงห้องทั้งหมด
        setClassrooms(allRooms);
        if (allRooms.length > 0) setSelectedRoom(allRooms[0].id);
      }

      setLoading(false);
    })();
  }, []);

  // ── Re-filter classrooms ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedYear || academicYearsRaw.length === 0 || allClassrooms.length === 0) return;
    const selRow  = academicYearsRaw.find(y => y.id === selectedYear);
    if (!selRow) return;
    const sameIds = academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id);
    const matched = allClassrooms.filter(r => sameIds.includes(r.academic_year_id ?? ""));
    const list    = matched.length > 0 ? matched : allClassrooms;
    setClassrooms(list);
    if (list.length > 0 && !list.find(r => r.id === selectedRoom)) setSelectedRoom(list[0].id);
  }, [selectedYear, academicYearsRaw, allClassrooms]);

  // ── roomTimeSlots ─────────────────────────────────────────────────────────
  useEffect(() => {
    const room = classrooms.find(c => c.id === selectedRoom);
    setRoomTimeSlots(buildRoomSlots(room?.schedule_type, timeSlots));
  }, [selectedRoom, classrooms, timeSlots]);

  // ── Load entries ──────────────────────────────────────────────────────────
  // ★ FIX: ดึง entries ทั้งหมดของปีนั้น (ไม่ filter classroom) เพื่อไม่ตกหล่น
  const loadEntries = useCallback(async () => {
    if (!selectedYear) return;
    const selRow    = academicYearsRaw.find(y => y.id === selectedYear);
    const yearIds   = selRow
      ? academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id)
      : [selectedYear];
    console.log("user.id:", user?.id);
    console.log("entries teacher_ids:", entries.map(e => e.teacher_id));

    // ★ FIX: ใช้ simple select แล้ว join ใน JS เพื่อหลีกเลี่ยง foreign key alias ผิด
    const { data: entriesData } = await (supabase.from("timetable_entries") as any)
      .select("*")
      .in("academic_year_id", yearIds);

    if (!entriesData) return;

    // ★ FIX: ถ้า academic_year_id ไม่ตรง → ลอง fetch ทั้งหมดด้วย
    let allEntries = entriesData as TimetableEntry[];
    if (allEntries.length === 0) {
      const { data: allData } = await (supabase.from("timetable_entries") as any).select("*");
      allEntries = (allData ?? []) as TimetableEntry[];
    }

    // Join subjects + teachers ใน JS
    const subjectIds = [...new Set(allEntries.map(e => e.subject_id))];
    const teacherIds = [...new Set([
      ...allEntries.map(e => e.teacher_id),
      ...allEntries.map(e => e.teacher_id_2).filter(Boolean),
    ])];

    const { data: subjectData } = await supabase.from("subjects")
      .select("id,subject_code,name_th,subject_group").in("id", subjectIds.length ? subjectIds : ["_none_"]);
    const { data: teacherData } = await supabase.from("users")
      .select("id,first_name,last_name,full_name").in("id", teacherIds.length ? teacherIds : ["_none_"]);

    const subjectMap: Record<string, Subject> = {};
    (subjectData ?? []).forEach((s: any) => { subjectMap[s.id] = s; });
    const teacherMap: Record<string, Teacher> = {};
    (teacherData ?? []).forEach((t: any) => {
      teacherMap[t.id] = { ...t, full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() };
    });

    const enriched = allEntries.map(e => ({
      ...e,
      subject: subjectMap[e.subject_id],
      teacher: teacherMap[e.teacher_id],
      teacher2: e.teacher_id_2 ? teacherMap[e.teacher_id_2] : undefined,
    }));

    setEntries(enriched);
  }, [selectedYear, academicYearsRaw]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // ── Load change requests ──────────────────────────────────────────────────
  const loadChangeRequests = useCallback(async () => {
    if (!user) return;
    const isApprover = APPROVER_ROLES.includes(user.role);
    let query = (supabase.from("timetable_change_requests") as any)
      .select("*, requester:users!timetable_change_requests_requester_id_fkey(id,first_name,last_name,full_name)")
      .order("created_at", { ascending: false });
    if (!isApprover) query = query.eq("requester_id", user.id);
    const { data } = await query;
    setChangeRequests((data ?? []) as ChangeRequest[]);
  }, [user]);

  useEffect(() => { loadChangeRequests(); }, [loadChangeRequests]);

  // ── applyScheduleType ─────────────────────────────────────────────────────
  async function applyScheduleType(type: string) {
    await (supabase.from("classrooms") as any).update({ schedule_type: type }).eq("id", selectedRoom);
    const { data } = await supabase.from("classrooms")
      .select("id,room_number,room_name,grade_group,academic_year_id,schedule_type").order("grade_group").order("room_number");
    const allRooms = (data ?? []) as Classroom[];
    setAllClassrooms(allRooms);
    const selRow  = academicYearsRaw.find(y => y.id === selectedYear);
    if (selRow) {
      const sameIds = academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id);
      const matched = allRooms.filter(r => sameIds.includes(r.academic_year_id ?? ""));
      setClassrooms(matched.length > 0 ? matched : allRooms);
    } else setClassrooms(allRooms);
  }

  // ── Save direct (admin) ───────────────────────────────────────────────────
  async function handleSaveDirect(data: any) {
    if (data.id) {
      await (supabase.from("timetable_entries") as any)
        .update({ subject_id: data.subject_id, teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 ?? null })
        .eq("id", data.id);
    } else {
      await (supabase.from("timetable_entries") as any).insert([{
        classroom_id: data.classroom_id, subject_id: data.subject_id,
        teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 ?? null,
        day_of_week: data.day_of_week, time_slot_id: data.time_slot_id,
        academic_year_id: data.academic_year_id,
      }]);
    }
    await loadEntries();
  }

  // ── Request change (teacher) ──────────────────────────────────────────────
  async function handleRequestChange(data: any) {
    if (!user) return;
    const { error } = await (supabase.from("timetable_change_requests") as any).insert([{
      requester_id: user.id, classroom_id: data.classroom_id,
      time_slot_id: data.time_slot_id, day_of_week: data.day_of_week,
      academic_year_id: data.academic_year_id,
      old_subject_id: data.old_subject_id ?? null, old_teacher_id: data.old_teacher_id ?? null, old_teacher_id_2: data.old_teacher_id_2 ?? null,
      new_subject_id: data.subject_id, new_teacher_id: data.teacher_id, new_teacher_id_2: data.teacher_id_2 ?? null,
      note: data.note ?? null, status: "pending",
    }]);
    if (error) { alert("❌ ส่งคำขอไม่สำเร็จ: " + error.message); return; }
    alert("✅ ส่งคำขอแก้ไขแล้ว รอการอนุมัติ");
    await loadChangeRequests();
  }

  // ── Approve request ───────────────────────────────────────────────────────
  async function handleApproveRequest(requestId: string) {
    if (!user) return;
    const req = changeRequests.find(r => r.id === requestId);
    if (!req) return;
    const existing = entries.find(e =>
      e.classroom_id === req.classroom_id &&
      e.time_slot_id === req.time_slot_id &&
      e.day_of_week  === req.day_of_week
    );
    if (existing) {
      await (supabase.from("timetable_entries") as any)
        .update({ subject_id: req.new_subject_id, teacher_id: req.new_teacher_id, teacher_id_2: req.new_teacher_id_2 ?? null })
        .eq("id", existing.id);
    } else {
      await (supabase.from("timetable_entries") as any).insert([{
        classroom_id: req.classroom_id, time_slot_id: req.time_slot_id, day_of_week: req.day_of_week,
        academic_year_id: req.academic_year_id,
        subject_id: req.new_subject_id, teacher_id: req.new_teacher_id, teacher_id_2: req.new_teacher_id_2 ?? null,
      }]);
    }
    await (supabase.from("timetable_change_requests") as any)
      .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);
    await Promise.all([loadEntries(), loadChangeRequests()]);
    alert("✅ อนุมัติและอัปเดตตารางสอนแล้ว");
  }

  // ── Reject request ────────────────────────────────────────────────────────
  async function handleRejectRequest(requestId: string, reason: string) {
    if (!user) return;
    await (supabase.from("timetable_change_requests") as any)
      .update({ status: "rejected", reject_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);
    await loadChangeRequests();
  }

  // ── Derived values ────────────────────────────────────────────────────────
  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดตารางสอน...</div></div>;
  if (!user)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</p></div>;

  const isAdmin           = ADMIN_ROLES.includes(user.role);
  const isApprover        = APPROVER_ROLES.includes(user.role);
  const canEditDirect     = isAdmin;
  const selectedClassroom = classrooms.find(c => c.id === selectedRoom);
  const roomEntries       = entries.filter(e => e.classroom_id === selectedRoom);
  const myEntries         = entries.filter(e => e.teacher_id === user.id || e.teacher_id_2 === user.id);
  const myClassroomIds    = [...new Set(myEntries.map(e => e.classroom_id))];
  const myClassrooms      = classrooms.filter(c => myClassroomIds.includes(c.id));
  const homeroomClassroom = user.homeroom_classroom_id ? classrooms.find(c => c.id === user.homeroom_classroom_id) : null;
  const pendingCount      = changeRequests.filter(r => r.status === "pending").length;

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  // ★ FIX: gradeGroups จาก classrooms (ทั้งหมดที่โหลดมา)
  const gradeGroups = [...new Set(classrooms.map(c => c.grade_group).filter(Boolean))]
    .sort((a, b) => gradeGroupSortKey(a as string) - gradeGroupSortKey(b as string)) as string[];

  const currentScheduleType = SCHEDULE_TEMPLATES.find(t => t.key === selectedClassroom?.schedule_type)?.label ?? "ประถม";

  const myTimeSlots = [...timeSlots]
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {showSettings && selectedClassroom && (
        <ScheduleSettingsModal onClose={() => setShowSettings(false)} onApply={applyScheduleType} />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/dashboard")}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 text-lg shrink-0">🏠</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-slate-800 leading-none">ตารางสอน</h1>
            <p className="text-slate-400 text-xs">โรงเรียนวัดเขียนเขต · {classrooms.length} ห้อง</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-700 text-sm font-bold focus:outline-none">
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.year_name}</option>)}
            </select>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
              <button onClick={() => setViewMode("room")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "room" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                🏫 ห้อง
              </button>
              {!isAdmin && (
                <button onClick={() => setViewMode("teacher")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "teacher" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                  👤 ของฉัน
                </button>
              )}
              <button onClick={() => setViewMode("requests")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all relative ${viewMode === "requests" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                📋 คำขอ
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{pendingCount}</span>
                )}
              </button>
            </div>
            {isAdmin && selectedClassroom && viewMode === "room" && (
              <button onClick={() => setShowSettings(true)}
                className="px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50 flex items-center gap-1">
                ⚙️ <span className="hidden sm:inline text-xs">{currentScheduleType}</span>
              </button>
            )}
            <button onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-sm">🖨️ พิมพ์</button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-65px)] print:h-auto">
        {/* Sidebar */}
        <aside className="w-52 bg-white border-r border-slate-200 overflow-y-auto shrink-0 print:hidden">
          <div className="p-3">
            {/* ★ ห้องของครูประจำชั้น */}
            {!isAdmin && homeroomClassroom && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-blue-500 uppercase px-2 mb-1">ห้องของฉัน</p>
                <button onClick={() => { setSelectedRoom(homeroomClassroom.id); setViewMode("room"); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5
                    ${selectedRoom === homeroomClassroom.id && viewMode === "room" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"}`}>
                  ⭐ {homeroomClassroom.room_name ?? `ห้อง ${homeroomClassroom.room_number}`}
                </button>
              </div>
            )}

            {/* ★ ห้องที่ครูสอน */}
            {!isAdmin && myClassrooms.filter(c => c.id !== user.homeroom_classroom_id).length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1">ห้องที่ฉันสอน</p>
                {myClassrooms.filter(c => c.id !== user.homeroom_classroom_id).map(room => (
                  <button key={room.id} onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5 flex items-center justify-between
                      ${selectedRoom === room.id && viewMode === "room" ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                    <span className="truncate">{room.room_name ?? `ห้อง ${room.room_number}`}</span>
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded shrink-0 ml-1 ${selectedRoom === room.id && viewMode === "room" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {room.grade_group?.slice(0, 3)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* ★ FIX: ห้องเรียนทั้งหมด — แสดงเสมอถ้ามีข้อมูล (ไม่ check isAdmin อย่างเดียว) */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1">
                {isAdmin ? "ห้องเรียนทั้งหมด" : "ทุกห้อง"}
              </p>
              {classrooms.length === 0 ? (
                <div className="px-2 py-4 text-center">
                  <p className="text-xs text-slate-400">ยังไม่มีข้อมูลห้องเรียน</p>
                  <p className="text-xs text-amber-600 font-bold mt-1">ตรวจสอบตาราง classrooms ใน Supabase</p>
                </div>
              ) : (
                gradeGroups.length > 0 ? gradeGroups.map(grade => {
                  const gradeRooms = classrooms
                    .filter(c => c.grade_group === grade)
                    .sort((a, b) => (a.room_name ?? "").localeCompare(b.room_name ?? "", "th", { numeric: true }));
                  return (
                    <div key={grade} className="mb-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1">{grade}</p>
                      {gradeRooms.map(room => {
                        const tKey   = room.schedule_type ?? "primary";
                        const tLabel = tKey === "primary" ? "ป." : tKey === "junior" ? "ม.ต้น" : "ม.ปลาย";
                        const active = selectedRoom === room.id && viewMode === "room";
                        return (
                          <button key={room.id} onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5 flex items-center justify-between
                              ${active ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                            <span className="truncate">{room.room_name ?? `ห้อง ${room.room_number}`}</span>
                            {isAdmin && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ml-1 ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>{tLabel}</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                }) : (
                  // ★ fallback: ถ้า grade_group ว่างทั้งหมด แสดงเป็น list เดียว
                  classrooms.map(room => {
                    const active = selectedRoom === room.id && viewMode === "room";
                    return (
                      <button key={room.id} onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-all mb-0.5
                          ${active ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}>
                        {room.room_name ?? `ห้อง ${room.room_number}`}
                      </button>
                    );
                  })
                )
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto p-4 print:p-0">

          {/* ── ห้อง ── */}
          {viewMode === "room" && selectedClassroom && (
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2 print:hidden">
                <div>
                  <h2 className="text-xl font-black text-slate-800">{selectedClassroom.grade_group} {selectedClassroom.room_name}</h2>
                  <p className="text-slate-400 text-sm">
                    {roomEntries.length} คาบ · ตาราง{currentScheduleType}
                    {!canEditDirect && <span className="ml-2 text-amber-600 font-bold text-xs">· คลิกคาบที่คุณสอนเพื่อขอแก้ไข</span>}
                  </p>
                </div>
              </div>
              <TimetableGrid
                classroom={selectedClassroom} entries={roomEntries} timeSlots={roomTimeSlots}
                subjects={subjects} teachers={teachers} academicYearId={selectedYear}
                canEditDirect={canEditDirect} currentUser={user}
                onSave={handleSaveDirect}
                onRequestChange={handleRequestChange}
                onDelete={async (id) => { await supabase.from("timetable_entries").delete().eq("id", id); await loadEntries(); }}
              />
            </div>
          )}

          {/* ── ของฉัน ── */}
          {viewMode === "teacher" && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-800">ตารางสอนของฉัน</h2>
                <p className="text-slate-400 text-sm">{fullName(user)} · {myEntries.length} คาบ/สัปดาห์</p>
                {homeroomClassroom && <p className="text-blue-600 text-sm font-bold mt-1">⭐ ครูประจำชั้น: {homeroomClassroom.grade_group} {homeroomClassroom.room_name}</p>}
              </div>
              <div className="grid grid-cols-5 gap-3 mb-5">
                {DAYS.map((day, i) => {
                  const count = myEntries.filter(e => e.day_of_week === i + 1).length;
                  const dc = DAY_COLORS[i];
                  return (
                    <div key={day} className={`${dc.bg} border-2 ${dc.border} rounded-2xl p-3 text-center`}>
                      <p className={`text-xs font-black ${dc.text}`}>{day}</p>
                      <p className={`text-2xl font-black ${dc.text}`}>{count}</p>
                      <p className="text-slate-400 text-[10px] font-bold">คาบ</p>
                    </div>
                  );
                })}
              </div>
              {myEntries.length > 0 ? (
                <div className="mb-5">
                  <h3 className="font-black text-slate-700 text-sm mb-3">📅 ตารางคาบสอนของฉัน</h3>
                  <PersonalTimetableGrid myEntries={myEntries} timeSlots={myTimeSlots} subjects={subjects} teachers={teachers} classrooms={classrooms} userId={user.id} />
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200 mb-5">
                  <p className="text-4xl mb-3">📅</p>
                  <p className="font-bold">ยังไม่มีตารางสอน</p>
                </div>
              )}
              {myClassrooms.length > 0 && (
                <div>
                  <h3 className="font-black text-slate-700 text-sm mb-3">🏫 ห้องเรียนที่ฉันสอน ({myClassrooms.length} ห้อง)</h3>
                  <div className="space-y-3">
                    {myClassrooms.map(room => {
                      const roomMyEntries = myEntries.filter(e => e.classroom_id === room.id);
                      const roomSlots     = buildRoomSlots(room.schedule_type, timeSlots);
                      return (
                        <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="bg-slate-50 border-b px-5 py-3 flex items-center justify-between">
                            <div>
                              <h4 className="font-black text-slate-700">{room.grade_group} {room.room_name}</h4>
                              <p className="text-slate-400 text-xs">{roomMyEntries.length} คาบ</p>
                            </div>
                            <button onClick={() => { setSelectedRoom(room.id); setViewMode("room"); }}
                              className="text-xs font-black text-blue-600 px-3 py-1.5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100">👁️ ดูตาราง</button>
                          </div>
                          <div className="p-4 space-y-2">
                            {[1, 2, 3, 4, 5].map(day => {
                              const dayEntries = roomMyEntries.filter(e => e.day_of_week === day);
                              if (!dayEntries.length) return null;
                              const dc = DAY_COLORS[day - 1];
                              return (
                                <div key={day} className="flex gap-2 items-center flex-wrap">
                                  <span className={`text-xs font-black px-2 py-1 rounded-lg ${dc.bg} ${dc.text} border ${dc.border} w-12 text-center shrink-0`}>{DAY_SHORT[day - 1]}</span>
                                  {dayEntries.map(e => {
  const slot    = roomSlots.find(s => s.id === e.time_slot_id);
  const subject = subjects.find(s => s.id === e.subject_id) ?? (e as any).subject;
  const isMe2   = e.teacher_id_2 === user.id;
  const otherTeacherId = isMe2 ? e.teacher_id : e.teacher_id_2;
  const otherTeacher = otherTeacherId ? teachers.find(t => t.id === otherTeacherId) : null;
  return (
                                      <span key={e.id} className="text-xs font-bold bg-blue-100 border border-blue-300 text-blue-800 px-2 py-1 rounded-lg flex items-center gap-1">
                                        <span className="font-black">{slot?.slot_label}</span>
      <span>{(subject as any)?.name_th ?? "—"}</span>
      {otherTeacher && <span className="opacity-70">+ {displayName(otherTeacher)}</span>}
      {isMe2 && <span className="text-[9px] bg-purple-500 text-white px-1 rounded">ครู 2</span>}
    </span>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── คำขอ ── */}
          {viewMode === "requests" && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-800">📋 คำขอแก้ไขตารางสอน</h2>
                <p className="text-slate-400 text-sm">{isApprover ? "คุณสามารถอนุมัติหรือปฏิเสธคำขอได้" : "คำขอที่คุณส่งไป"}</p>
              </div>
              <div className={`mb-4 rounded-2xl border-2 px-4 py-3 flex items-center gap-3 ${isApprover ? "bg-indigo-50 border-indigo-200" : "bg-blue-50 border-blue-200"}`}>
                <span className="text-xl">{isApprover ? "🔑" : "👤"}</span>
                <p className={`font-black text-sm ${isApprover ? "text-indigo-700" : "text-blue-700"}`}>
                  {isAdmin ? "ผู้บริหาร — อนุมัติได้ทุกคำขอ" :
                   user.role === "grade_head" ? `หัวหน้าสาย — อนุมัติคำขอในสาย` :
                   user.role === "subject_head" ? `หัวหน้าหมวด — อนุมัติคำขอในหมวด` :
                   "ครู — ดูสถานะคำขอของคุณ"}
                </p>
              </div>
              <ChangeRequestsPanel
                requests={changeRequests} subjects={subjects} teachers={teachers}
                classrooms={classrooms} timeSlots={timeSlots} currentUser={user}
                canApprove={isApprover}
                onApprove={handleApproveRequest}
                onReject={handleRejectRequest}
              />
            </div>
          )}

          {viewMode === "room" && !selectedClassroom && (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center"><p className="text-4xl mb-3">🏫</p><p className="font-bold">เลือกห้องเรียนจากเมนูซ้าย</p></div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        @media print {
          aside, .print\\:hidden { display: none !important; }
          body { font-size: 10px; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}