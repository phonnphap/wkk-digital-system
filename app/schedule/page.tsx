"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { notifyTeams } from "../../lib/notify-teams";


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
    key: "kindergarten", label: "อนุบาล (อ.2–อ.3)",
    slots: [
      { slot_number: 0, start_time: "08:00", end_time: "08:30", slot_label: "คาบ 0", is_break: false },
      { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:30", end_time: "09:50", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "09:50", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
      { slot_number: 4, start_time: "11:00", end_time: "11:40", slot_label: "คาบ 4", is_break: false },
      { slot_number: 0, start_time: "11:40", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 0, start_time: "12:30", end_time: "14:00", slot_label: "นอนกลางวัน", is_break: true },
      { slot_number: 5, start_time: "14:00", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
      { slot_number: 0, start_time: "14:30", end_time: "15:00", slot_label: "คาบ 6", is_break: false },
    ],
  },
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
    key: "junior", label: "มัธยมต้น (ม.1–ม.2)",
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
    key: "senior", label: "ม.3 และ ม.ปลาย (ม.3–ม.6)",
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

const ADMIN_ROLES    = ["admin", "director", "deputy_director"];
const APPROVER_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head", "subject_head"];
const NON_TEACHING_ROLES = ["admin", "director", "deputy_director", "staff", "subject_teacher"];

type UserProfile = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string;
  grade_level?: string;
  extra_roles?: string[]; department_id?: string; // ← เพิ่ม
};
type TimeSlot   = { id: string; slot_number: number; start_time: string; end_time: string; slot_label?: string; is_break: boolean; schedule_type?: string };
type Subject    = { id: string; subject_code: string; name_th: string; subject_group?: string };
type Teacher = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string; position?: string;
  role?: string; grade_level?: string; department_id?: string; // ← เพิ่ม
};
type Classroom  = { id: string; room_number: number; room_name?: string; grade_group?: string; academic_year_id?: string; schedule_type?: string; homeroom_teacher_id?: string; homeroom_teacher_2_id?: string };
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
type ClubPeriod = { id: string; grade_label: string; day_of_week: number; slot_label: string; academic_year_id: string };
type Club = { id: string; name: string; teacher_id: string; grade_label: string; room_note?: string; academic_year_id: string; teacher?: Teacher };
type SubjectAdditionRequest = {
  id: string; requester_id: string; subject_code: string; name_th: string;
  grade_level: string; subject_group?: string; status: "pending" | "approved" | "rejected";
  reject_reason?: string; reviewed_by?: string; reviewed_at?: string; created_at: string;
  requester?: any;
};

const GRADE_LABELS_MS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const ALL_GRADE_LABELS = ["อ.2", "อ.3", "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

function getClassroomGradeLabel(c: { room_name?: string }): string {
  const m = (c.room_name ?? "").match(/([ปมอ])\.?(\d+)/);
  return m ? `${m[1]}.${m[2]}` : "";
}

function scheduleTypeForGradeLabel(label: string): string {
  if (label.startsWith("อ.")) return "kindergarten";
  if (label.startsWith("ป.")) return "primary";
  if (label.startsWith("ม.")) {
    const n = parseInt(label.replace("ม.", ""), 10);
    return n <= 2 ? "junior" : "senior";
  }
  return "primary";
}

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
async function sendTeamsDM(sender: "hr" | "general" | "academic", targetEmail: string, message: string) {
  try {
    const res = await fetch("/api/teams-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender, targetEmail, message }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[sendTeamsDM] API error:", body);
    }
  } catch (err) {
    console.error("[sendTeamsDM] fetch error:", err);
  }
}

function formatTime(t: string) { return t?.slice(0, 5) ?? ""; }
// ★ แปลงรหัสวิชา (เช่น ว11282, ว31101) เป็นระดับชั้นเต็ม
// [ตัวอักษรวิชา][กลุ่มระดับ 1 หลัก][ชั้นในกลุ่ม 1 หลัก][เลขลำดับ...]
//   กลุ่ม 0 = อนุบาล  → เลข 2,3 = อ.2, อ.3
//   กลุ่ม 1 = ประถม   → เลข 1-6 = ป.1–ป.6
//   กลุ่ม 2 = ม.ต้น   → เลข 1-3 = ม.1–ม.3
//   กลุ่ม 3 = ม.ปลาย  → เลข 1-3 = ม.4–ม.6 (ออฟเซ็ต +3)
function parseGradeFromSubjectCode(code?: string): string | undefined {
  if (!code) return undefined;
  const match = code.match(/[0-9]+/);
  if (!match || match[0].length < 2) return undefined;
  const digits = match[0];
  const group = digits[0];
  const level = parseInt(digits[1], 10);
  switch (group) {
    case "0": return (level === 2 || level === 3) ? `อ.${level}` : undefined;
    case "1": return (level >= 1 && level <= 6) ? `ป.${level}` : undefined;
    case "2": return (level >= 1 && level <= 3) ? `ม.${level}` : undefined;
    case "3": return (level >= 1 && level <= 3) ? `ม.${level + 3}` : undefined;
    default:  return undefined;
  }
}
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
// ⚠️ หมายเหตุสำคัญ: ถ้าเวลาของ template นี้ไม่มีอยู่จริงในตาราง time_slots ของ DB
// (เช่น คาบเฉพาะของอนุบาล 09:30–09:50 ที่ตารางประถมไม่มี) ฟังก์ชันนี้จะสร้าง "virtual slot"
// ที่มี id ขึ้นต้นด้วย tmpl- ให้ใช้แสดงผลไปก่อน แต่ id นี้ไม่ใช่ UUID จริงในฐานข้อมูล
// ถ้าจะบันทึกคาบเรียนลงคาบเวลานี้ ต้องสร้างแถวจริงใน time_slots ก่อนเสมอ (ดู ensureRealTimeSlot)
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
    // fallback: สร้าง virtual slot จาก template (ยังไม่มีแถวจริงใน DB)
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
  permission, currentUser, onSave, onRequestChange, onDelete, onClose }: {
  entry?: TimetableEntry; slot: TimeSlot; day: number; classroom: Classroom;
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  permission: "direct" | "request"; // ← เปลี่ยนจาก canEditDirect: boolean
  currentUser: UserProfile;
  onSave: (d: any) => Promise<void>;
  onRequestChange: (d: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const canEditDirect = permission === "direct";
  const extraRoles = currentUser.extra_roles ?? [];
  const isHomeroomOnly = !["admin","director","deputy_director"].includes(currentUser.role)
    && !extraRoles.includes("dept_head") && !extraRoles.includes("grade_head");

  // ★ ครูคนที่ 1 (ผู้สอนหลัก): ครูทั่วไป/ครูประจำชั้น ล็อกเป็นตัวเองเสมอ
  // dept_head/grade_head เลือกได้เฉพาะในหมวด/สายเดียวกัน, admin เลือกได้ทั้งหมด
  const selectableTeachers = (() => {
    if (canEditDirect && extraRoles.includes("dept_head")) {
      return teachers.filter(t => t.department_id === currentUser.department_id);
    }
    if (canEditDirect && extraRoles.includes("grade_head")) {
      return teachers.filter(t => t.grade_level === currentUser.grade_level);
    }
    if (isHomeroomOnly) {
      return teachers.filter(t => t.id === currentUser.id);
    }
    return teachers; // admin เห็นทั้งหมด
  })();

  const [subjectGroup, setSubjectGroup] = useState("");
  const [subjectId,   setSubjectId]    = useState(entry?.subject_id ?? "");
  // ★ homeroom_teacher/ครูทั่วไป: ล็อก teacher1 เป็นตัวเองอัตโนมัติ
  const [teacherId1,  setTeacherId1]   = useState(entry?.teacher_id ?? (isHomeroomOnly ? currentUser.id : ""));
  const [teacherId2,  setTeacherId2]   = useState(entry?.teacher_id_2 ?? "");
  const [note,        setNote]         = useState("");
  const [loading,     setLoading]      = useState(false);

  // ★ ครูคนที่ 2 (ผู้ร่วมสอน): เปิดให้ครูทุกระดับเลือกได้จากรายชื่อครูทั้งหมด (ยกเว้นคนที่เลือกเป็นครู 1 แล้ว)
  const selectableTeacher2Options = teachers.filter(t => t.id !== teacherId1);
  const dc = DAY_COLORS[day - 1];

  function getRoomGradeLevel() {
  const m = (classroom.room_name ?? "").match(/[ปมอ]\.?(\d+)/);
  return m ? m[1] : "";
}
function getRoomPrefix() {
  const m = (classroom.room_name ?? "").match(/([ปมอ])\./);
  return m ? m[1] + "." : "";
}

const roomGrade      = getRoomGradeLevel();
const roomPrefix     = getRoomPrefix();
const roomGradeLabel = roomPrefix && roomGrade ? `${roomPrefix}${roomGrade}` : ""; // เช่น "ม.4"
const subjectGroups  = [...new Set(subjects.map(s => s.subject_group).filter(Boolean))].sort();

// ★ กรองด้วยการ parse รหัสวิชาแทนการเทียบตัวเลขดิบแบบเดิม (แก้บั๊กกลุ่ม ม.ปลายไม่ match)
const filteredByGrade = roomGradeLabel
  ? subjects.filter(s => parseGradeFromSubjectCode(s.subject_code) === roomGradeLabel)
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
      day_of_week: day, time_slot_id: slot.id,
      // ✅ ส่ง object ของคาบเวลาเต็มๆ ไปด้วย — ใช้ตอนต้องสร้างแถว time_slots จริงใน DB
      // กรณีคาบนี้เป็น virtual slot จาก template (id ขึ้นต้นด้วย tmpl-) ที่ยังไม่มีอยู่จริง
      time_slot: slot,
      academic_year_id: academicYearId,
      old_subject_id: entry?.subject_id, old_teacher_id: entry?.teacher_id, old_teacher_id_2: entry?.teacher_id_2,
      note,
    };

    // ★ FIX: ไม่ต้องรออนุมัติสำหรับครูคนที่ 2 อีกต่อไป — ถ้าผู้ใช้แก้คาบของตัวเอง/มีสิทธิ์แก้ตรง (permission="direct")
    // ก็บันทึกได้ทันทีทั้งครู 1 และครู 2 โดยไม่ต้องผ่านการอนุมัติ
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
              <p className="text-xs text-red-500 font-bold mt-1">⚠️ ไม่พบวิชา กรุณาเพิ่มวิชาในระบบ (ดูปุ่ม “➕ ขอเพิ่มรายวิชา” ที่หน้าคำขอ)</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ครูผู้สอน คนที่ 1 *</label>
            <select value={teacherId1} onChange={e => setTeacherId1(e.target.value)} className={inp} disabled={isHomeroomOnly}>
              <option value="">— เลือกครู —</option>
              {selectableTeachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
            {isHomeroomOnly && (
              <p className="text-xs text-amber-600 font-bold mt-1">
                ⚠️ คุณเพิ่มคาบได้เฉพาะชื่อตัวเอง{!canEditDirect ? " (รออนุมัติ)" : " (บันทึกได้ทันที)"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              ครูผู้สอน คนที่ 2 <span className="text-slate-400 font-normal normal-case">(ถ้ามี — ผู้ร่วมสอน)</span>
            </label>
            <select value={teacherId2} onChange={e => setTeacherId2(e.target.value)} className={inp}>
              <option value="">— ไม่มีครูคนที่ 2 —</option>
              {selectableTeacher2Options.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
            <p className="text-xs text-slate-400 font-bold mt-1">
              💡 {canEditDirect ? "เพิ่ม/เปลี่ยนครูคนที่ 2 บันทึกได้ทันที ไม่ต้องรออนุมัติ" : "จะถูกส่งไปพร้อมคำขอแก้ไขคาบนี้เพื่อรออนุมัติ"}
            </p>
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
            {loading ? "⏳..." : (canEditDirect ? "💾 บันทึก" : "📤 ส่งคำขออนุมัติ")}
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
// ── Subject Addition Request Modal + Panel ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function AddSubjectRequestModal({ subjects, onClose, onSubmit }: {
  subjects: Subject[]; onClose: () => void; onSubmit: (d: { subject_code: string; name_th: string; grade_level: string; subject_group: string }) => Promise<void>;
}) {
  const existingGroups = [...new Set(subjects.map(s => s.subject_group).filter(Boolean))].sort() as string[];
  const [subjectCode,  setSubjectCode]  = useState("");
  const [nameTh,       setNameTh]       = useState("");
  const [gradeLevel,   setGradeLevel]   = useState(ALL_GRADE_LABELS[0]);
  const [subjectGroup, setSubjectGroup] = useState("");
  const [loading,      setLoading]      = useState(false);

  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-emerald-400 focus:outline-none";

  async function handleSubmit() {
    if (!subjectCode.trim() || !nameTh.trim() || !gradeLevel) {
      alert("กรุณากรอกรหัสวิชา ชื่อวิชา และเลือกชั้น");
      return;
    }
    setLoading(true);
    await onSubmit({ subject_code: subjectCode.trim(), name_th: nameTh.trim(), grade_level: gradeLevel, subject_group: subjectGroup.trim() });
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-600 px-6 py-4">
          <h3 className="text-lg font-black text-white">➕ ขอเพิ่มรายวิชาใหม่</h3>
          <p className="text-sm text-white/70">ส่งคำขอให้แอดมิน/ผู้บริหารตรวจสอบและอนุมัติ</p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">รหัสวิชา *</label>
            <input value={subjectCode} onChange={e => setSubjectCode(e.target.value)} placeholder="เช่น ว31101" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ชื่อวิชา *</label>
            <input value={nameTh} onChange={e => setNameTh(e.target.value)} placeholder="เช่น วิทยาศาสตร์พื้นฐาน" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ชั้น *</label>
            <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className={inp}>
              {ALL_GRADE_LABELS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              กลุ่มสาระ <span className="text-slate-400 font-normal normal-case">(ถ้ามี)</span>
            </label>
            <input value={subjectGroup} onChange={e => setSubjectGroup(e.target.value)}
              placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี" list="subject-group-suggestions" className={inp} />
            <datalist id="subject-group-suggestions">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳..." : "📤 ส่งคำขอ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubjectRequestsPanel({ requests, canApprove, onApprove, onReject }: {
  requests: SubjectAdditionRequest[];
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

  const statusBadge = (s: string) => {
    if (s === "pending")  return <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-300">⏳ รออนุมัติ</span>;
    if (s === "approved") return <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-300">✅ อนุมัติแล้ว</span>;
    return <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-300">❌ ปฏิเสธ</span>;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50 border-b px-5 py-3 flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-700">📚 คำขอเพิ่มรายวิชาใหม่</h3>
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
                  <span className="text-xs text-slate-500 font-bold">{fullName(req.requester)}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 inline-block">
                  <p className="font-bold text-slate-700 text-sm">{req.subject_code} · {req.name_th}</p>
                  <p className="text-slate-500 text-xs">ชั้น {req.grade_level}{req.subject_group ? ` · ${req.subject_group}` : ""}</p>
                </div>
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
  currentUser, clubPeriod, clubsForGrade, onSave, onRequestChange, onDelete }: {
  classroom: Classroom; entries: TimetableEntry[]; timeSlots: TimeSlot[];
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  currentUser: UserProfile;
  clubPeriod?: ClubPeriod; clubsForGrade: Club[]; // ★ เพิ่ม
  onSave: (d: any) => Promise<void>;
  onRequestChange: (d: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {

  const [modal, setModal] = useState<{ slot: TimeSlot; day: number; entry?: TimetableEntry; permission: "direct"|"request" } | null>(null);

  function getEntry(day: number, slotId: string) {
    return entries.find(e => e.day_of_week === day && e.time_slot_id === slotId);
  }

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  function getPermissionForEntry(user: UserProfile, entry: { teacher_id?: string; teacher_id_2?: string } | undefined, teachers: Teacher[]): "direct" | "request" | "deny" {
  const extraRoles = user.extra_roles ?? [];

  // admin/director/deputy_director: แก้ทุกอย่างตรง ไม่ต้องรอ
  if (["admin", "director", "deputy_director"].includes(user.role)) return "direct";

  // dept_head: แก้/เพิ่มได้เฉพาะครูใน department เดียวกัน ไม่ต้องรอ
  if (extraRoles.includes("dept_head")) {
    if (!entry) return "direct"; // เพิ่มคาบใหม่ — อนุญาต (จะกรองรายชื่อครูตอนเลือกแทน)
    const t1 = teachers.find(t => t.id === entry.teacher_id);
    const t2 = entry.teacher_id_2 ? teachers.find(t => t.id === entry.teacher_id_2) : null;
    const sameDept = (t1?.department_id === user.department_id) || (t2?.department_id === user.department_id);
    return sameDept ? "direct" : "deny";
  }

  // grade_head: แก้/เพิ่มได้เฉพาะครูใน grade_level เดียวกัน ไม่ต้องรอ
  if (extraRoles.includes("grade_head")) {
    if (!entry) return "direct";
    const t1 = teachers.find(t => t.id === entry.teacher_id);
    const t2 = entry.teacher_id_2 ? teachers.find(t => t.id === entry.teacher_id_2) : null;
    const sameGrade = (t1?.grade_level === user.grade_level) || (t2?.grade_level === user.grade_level);
    return sameGrade ? "direct" : "deny";
  }

  // homeroom_teacher: เพิ่ม/แก้คาบของตัวเองได้ทันที ไม่ต้องรออนุมัติ (จำกัดให้เลือกได้เฉพาะชื่อตัวเอง)
  if (user.role === "homeroom_teacher") {
    if (!entry) return "direct"; // เพิ่มคาบใหม่ — ล็อกชื่อครูเป็นตัวเองใน EntryModal
    const isMine = entry.teacher_id === user.id || entry.teacher_id_2 === user.id;
    return isMine ? "direct" : "deny";
  }

  // ครูทั่วไป (subject_teacher ฯลฯ): ขอเพิ่ม/แก้ได้เฉพาะคาบของตัวเอง — ต้องรออนุมัติ
  if (!entry) return "request"; // เพิ่มคาบใหม่ — เป็นคำขอ
  const isMine = entry.teacher_id === user.id || entry.teacher_id_2 === user.id;
  return isMine ? "request" : "deny";
}

  // ★ FIX: ทุก role คลิกได้ แต่ต่างกันที่ผลลัพธ์
  // admin → แก้ตรง | ครู → ส่งคำขอ (เฉพาะคาบตัวเอง หรือช่องว่าง)
  function getCellPermission(entry?: TimetableEntry): "direct" | "request" | "deny" {
    return getPermissionForEntry(currentUser, entry, teachers);
  }

  return (
    <>
      {modal && (
        <EntryModal
          entry={modal.entry} slot={modal.slot} day={modal.day} classroom={classroom}
          subjects={subjects} teachers={teachers} academicYearId={academicYearId}
          permission={modal.permission} currentUser={currentUser}
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
    const isClubSlot = clubPeriod && clubPeriod.day_of_week === day && clubPeriod.slot_label === slot.slot_label;
    if (isClubSlot) {
      return (
        <td key={slot.id} className="p-1 align-top border-r border-slate-100">
          <div className="rounded-xl border-2 border-purple-300 bg-purple-50 flex flex-col items-center justify-center text-center px-1"
            style={{ minHeight: "92px" }}
            title={clubsForGrade.map(c => `${c.name}${c.room_note ? " " + c.room_note : ""} (${displayName(c.teacher)})`).join("\n")}>
            <span className="font-black text-purple-700 text-sm">🎪 ชุมนุม</span>
            {clubsForGrade.length > 0 && (
              <p className="text-[9px] text-purple-500 font-bold mt-1 leading-tight line-clamp-3">
                {clubsForGrade.map(c => displayName(c.teacher)).join(", ")}
              </p>
            )}
          </div>
        </td>
      );
    }
                    if (slot.is_break) return (
                      <td key={slot.id} className="bg-slate-50 border-r border-slate-100 text-center p-0">
                        <div className="text-[9px] text-slate-300 font-bold" style={{ writingMode: "vertical-rl", whiteSpace: "nowrap", margin: "0 auto" }}>พัก</div>
                      </td>
                    );

                    const entry    = getEntry(day, slot.id);
                      const perm     = getCellPermission(entry);
                      const clickable = perm !== "deny";
                      const colors   = entry ? (subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0]) : null;
                      const teacher1 = entry ? (teachers.find(t => t.id === entry.teacher_id) ?? (entry as any).teacher) : null;
                      const teacher2 = entry?.teacher_id_2 ? (teachers.find(t => t.id === entry.teacher_id_2) ?? (entry as any).teacher2) : null;
                      const subject  = entry ? (subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject) : null;
                      const isMyClass = entry?.teacher_id === currentUser.id || entry?.teacher_id_2 === currentUser.id;

                    return (
                      <td key={slot.id} className="p-1 align-top border-r border-slate-100">
                        {entry && colors ? (
                          <div
                            className={`rounded-xl border-2 px-2 py-2 transition-all
                              ${colors.bg} ${colors.border} ${colors.text}
                              ${clickable ? "cursor-pointer hover:shadow-md hover:scale-[1.01]" : ""}
                              ${isMyClass ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
                            style={{ minHeight: "92px" }}
                            onClick={() => clickable && setModal({ slot, day, entry, permission: perm === "direct" ? "direct" : "request" })}>
                            <p className="font-black text-xs leading-tight line-clamp-2 mb-1">{(subject as any)?.name_th ?? "—"}</p>
                            <p className="text-[11px] font-bold opacity-80 leading-tight">{displayName(teacher1)}</p>
                            {teacher2 && <p className="text-[11px] font-bold opacity-80 leading-tight mt-0.5">{displayName(teacher2)}</p>}
                            {isMyClass && <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded mt-1 inline-block">ฉัน</span>}
                          </div>
                        ) : (
                          clickable ? (
                            <div className="rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center"
                              style={{ minHeight: "92px" }}
                              onClick={() => setModal({ slot, day, permission: perm === "direct" ? "direct" : "request" })}>
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

function ClubManagementModal({ clubPeriods, clubs, teachers, academicYearId, onClose, onReload }: {
  clubPeriods: ClubPeriod[]; clubs: Club[]; teachers: Teacher[]; academicYearId: string;
  onClose: () => void; onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"periods" | "clubs">("periods");
  const [savingPeriod, setSavingPeriod] = useState<string | null>(null);
  const [newClub, setNewClub] = useState({ name: "", teacher_id: "", grade_label: "ม.1", room_note: "" });
  const [savingClub, setSavingClub] = useState(false);

  async function savePeriod(grade: string, day: number, slotLabel: string) {
    if (!day || !slotLabel) return;
    setSavingPeriod(grade);
    const existing = clubPeriods.find(p => p.grade_label === grade);
    if (existing) {
      await (supabase.from("club_periods") as any).update({ day_of_week: day, slot_label: slotLabel }).eq("id", existing.id);
    } else {
      await (supabase.from("club_periods") as any).insert([{ grade_label: grade, day_of_week: day, slot_label: slotLabel, academic_year_id: academicYearId }]);
    }
    await onReload();
    setSavingPeriod(null);
  }

  async function addClub() {
    if (!newClub.name.trim() || !newClub.teacher_id) { alert("กรุณากรอกชื่อชุมนุมและเลือกครู"); return; }
    setSavingClub(true);
    await (supabase.from("clubs") as any).insert([{
      name: newClub.name.trim(), teacher_id: newClub.teacher_id, grade_label: newClub.grade_label,
      room_note: newClub.room_note.trim() || null, academic_year_id: academicYearId,
    }]);
    setNewClub(v => ({ ...v, name: "", teacher_id: "", room_note: "" }));
    await onReload();
    setSavingClub(false);
  }

  async function deleteClub(id: string) {
    if (!confirm("ลบชุมนุมนี้?")) return;
    await supabase.from("clubs").delete().eq("id", id);
    await onReload();
  }

  const inp = "bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-bold focus:border-purple-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-purple-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">🎪 จัดการชุมนุม</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white font-black">✕</button>
        </div>
        <div className="flex border-b border-slate-100 px-6">
          {(["periods", "clubs"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-black border-b-2 ${tab === t ? "border-purple-500 text-purple-600" : "border-transparent text-slate-400"}`}>
              {t === "periods" ? "🕐 คาบชุมนุมแต่ละชั้น" : "📋 รายชื่อชุมนุม"}
            </button>
          ))}
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {tab === "periods" && GRADE_LABELS_MS.map(grade => {
            const type = scheduleTypeForGradeLabel(grade);
            const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type)!;
            const periodSlots = tmpl.slots.filter(s => !s.is_break);
            const existing = clubPeriods.find(p => p.grade_label === grade);
            return (
              <div key={grade} className="bg-slate-50 rounded-xl border border-slate-200 p-3 flex items-center gap-3 flex-wrap">
                <span className="font-black text-slate-700 w-14">{grade}</span>
                <select id={`day-${grade}`} defaultValue={existing?.day_of_week ?? ""}
                  onChange={e => savePeriod(grade, Number(e.target.value), (document.getElementById(`slot-${grade}`) as HTMLSelectElement)?.value)}
                  className={inp + " w-32"}>
                  <option value="">— วัน —</option>
                  {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                </select>
                <select id={`slot-${grade}`} defaultValue={existing?.slot_label ?? ""}
                  onChange={e => savePeriod(grade, Number((document.getElementById(`day-${grade}`) as HTMLSelectElement)?.value) || (existing?.day_of_week ?? 0), e.target.value)}
                  className={inp + " w-40"}>
                  <option value="">— คาบ —</option>
                  {periodSlots.map(s => <option key={s.slot_label} value={s.slot_label}>{s.slot_label} ({s.start_time}-{s.end_time})</option>)}
                </select>
                {savingPeriod === grade && <span className="text-xs text-purple-500 font-bold">⏳...</span>}
                {existing && <span className="text-xs text-emerald-600 font-bold">✅ {DAYS[existing.day_of_week - 1]} · {existing.slot_label}</span>}
              </div>
            );
          })}

          {tab === "clubs" && (
            <>
              <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-black text-purple-600 uppercase">+ เพิ่มชุมนุมใหม่</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={newClub.name} onChange={e => setNewClub(v => ({ ...v, name: e.target.value }))} placeholder="ชื่อชุมนุม เช่น ภาษาอังกฤษ" className={inp} />
                  <select value={newClub.grade_label} onChange={e => setNewClub(v => ({ ...v, grade_label: e.target.value }))} className={inp}>
                    {GRADE_LABELS_MS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select value={newClub.teacher_id} onChange={e => setNewClub(v => ({ ...v, teacher_id: e.target.value }))} className={inp}>
                    <option value="">— เลือกครูผู้ดูแล —</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
                  </select>
                  <input value={newClub.room_note} onChange={e => setNewClub(v => ({ ...v, room_note: e.target.value }))} placeholder="ห้องที่ระบุ (ถ้ามี) เช่น 2/1" className={inp} />
                </div>
                <button onClick={addClub} disabled={savingClub} className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm disabled:opacity-50">
                  {savingClub ? "⏳ กำลังบันทึก..." : "+ เพิ่มชุมนุม"}
                </button>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {clubs.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">ยังไม่มีชุมนุม</div>
                ) : clubs.map(c => (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-2 bg-white">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">🎪 {c.name} <span className="text-slate-400 font-normal">· {c.grade_label}{c.room_note ? ` · ${c.room_note}` : ""}</span></p>
                      <p className="text-xs text-slate-500">{displayName(c.teacher)}</p>
                    </div>
                    <button onClick={() => deleteClub(c.id)} className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-black">🗑️ ลบ</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Personal Timetable Grid ────────────────────────────────────────────────────
function PersonalTimetableGrid({ myEntries, myClubBlocks, timeSlots, subjects, teachers, classrooms, userId }: {
  myEntries: TimetableEntry[];
  myClubBlocks: { dayOfWeek: number; slotLabel: string; club: Club }[]; // ★ เพิ่ม
  timeSlots: TimeSlot[]; subjects: Subject[]; teachers: Teacher[]; classrooms: Classroom[]; userId: string;
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

                  // ★ เช็คชุมนุมก่อนคาบปกติ
    const clubBlock = myClubBlocks.find(b => b.dayOfWeek === day && b.slotLabel === slot.slot_label);
    if (clubBlock) {
      const c = clubBlock.club;
      return (
        <td key={slot.id} className="p-1 align-top border-r border-slate-100">
          <div className="rounded-xl border-2 border-purple-300 bg-purple-50 px-2 py-2 ring-2 ring-offset-1 ring-purple-400" style={{ minHeight: "92px" }}>
            <p className="font-black text-xs leading-tight text-purple-700 mb-1">
              🎪 ชุมนุม{c.name}{c.room_note ? ` ${c.room_note}` : ""}
            </p>
            <p className="text-[10px] font-bold text-purple-500">({displayName(teachers.find(t => t.id === userId))})</p>
          </div>
        </td>
      );
    }

                  
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

function DayDetailModal({ day, entries, timeSlots, subjects, teachers, classrooms, userId, onClose }: {
  day: number; entries: TimetableEntry[]; timeSlots: TimeSlot[]; subjects: Subject[];
  teachers: Teacher[]; classrooms: Classroom[]; userId: string; onClose: () => void;
}) {
  const dc = DAY_COLORS[day - 1];
  const dayEntries = entries
    .filter(e => e.day_of_week === day)
    .map(e => ({ ...e, slot: timeSlots.find(s => s.id === e.time_slot_id) }))
    .sort((a, b) => (a.slot?.start_time ?? "").localeCompare(b.slot?.start_time ?? ""));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className={`${dc.header} px-6 py-4 shrink-0`}>
          <h3 className="text-lg font-black text-white">📅 วัน{DAYS[day - 1]} · {dayEntries.length} คาบ</h3>
        </div>
        <div className="p-5 overflow-y-auto space-y-2">
          {dayEntries.length === 0 ? (
            <p className="text-center text-slate-400 py-8 font-bold">ไม่มีคาบสอนในวันนี้</p>
          ) : dayEntries.map(e => {
            const subject = subjects.find(s => s.id === e.subject_id) ?? (e as any).subject;
            const room = classrooms.find(c => c.id === e.classroom_id);
            const isMe2 = e.teacher_id_2 === userId;
            const otherTeacherId = isMe2 ? e.teacher_id : e.teacher_id_2;
            const otherTeacher = otherTeacherId ? teachers.find(t => t.id === otherTeacherId) : null;
            return (
              <div key={e.id} className="rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 flex items-center gap-3">
                <div className="shrink-0 text-center w-16">
                  <p className="text-xs font-black text-slate-500">{e.slot?.slot_label ?? "—"}</p>
                  <p className="text-[10px] text-slate-400">{formatTime(e.slot?.start_time ?? "")}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{(subject as any)?.name_th ?? "—"}</p>
                  <p className="text-slate-500 text-xs">{room?.grade_group} {room?.room_name}</p>
                </div>
                {otherTeacher && <span className="text-[10px] font-bold text-slate-400 shrink-0">+ {displayName(otherTeacher)}</span>}
                {isMe2 && <span className="text-[9px] font-black bg-purple-500 text-white px-1.5 py-0.5 rounded shrink-0">ครู 2</span>}
              </div>
            );
          })}
        </div>
        <div className="px-5 pb-5 pt-2 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ปิด</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Teacher Conflict Panel (ตรวจสอบครูสอนซ้อนคาบ) ─────────────────────────────
// ★ ใช้ร่วมกันทั้งในแท็บ "duplicates" (แอดมิน, ลบได้) และแท็บ "คำขอ" (ทุกโรล, ดูอย่างเดียวถ้าไม่ใช่แอดมิน)
// ══════════════════════════════════════════════════════════════════════════════
function TeacherConflictPanel({ groups, classrooms, allClassrooms, subjects, teachers, timeSlots, canManage, onDeleteEntry, scopeLabel }: {
  groups: { key: string; list: { teacherId: string; entry: TimetableEntry }[] }[];
  classrooms: Classroom[]; allClassrooms: Classroom[]; subjects: Subject[]; teachers: Teacher[]; timeSlots: TimeSlot[];
  canManage: boolean;
  onDeleteEntry: (id: string) => Promise<void>;
  scopeLabel?: string; // ★ ข้อความอธิบายขอบเขตที่แสดง เช่น "เฉพาะคาบของคุณ" สำหรับครูทั่วไป
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-800">👤 ตรวจสอบครูสอนซ้อนคาบ</h2>
        <p className="text-slate-400 text-sm">
          {scopeLabel ?? "ครูคนเดียวกันถูกจัดให้สอนคนละห้องในวัน/เวลาเดียวกัน (สอนพร้อมกัน 2 ที่ไม่ได้)"}
        </p>
      </div>
      {groups.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-bold text-sm">ไม่พบครูสอนซ้อนคาบ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ key, list }) => {
            const teacher = teachers.find(t => t.id === list[0].teacherId);
            const dayOfWeek = list[0].entry.day_of_week;
            const slot = timeSlots.find(s => s.id === list[0].entry.time_slot_id);
            return (
              <div key={key} className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm overflow-hidden">
                <div className="bg-rose-50 border-b border-rose-200 px-5 py-3">
                  <p className="font-black text-rose-700 text-sm">
                    ⚠️ {displayName(teacher)} · {DAYS[(dayOfWeek ?? 1) - 1]} · {slot?.slot_label ?? "—"} ({formatTime(slot?.start_time ?? "")}–{formatTime(slot?.end_time ?? "")})
                  </p>
                  <p className="text-rose-600 text-xs font-bold">ถูกจัดสอนพร้อมกัน {list.length} ห้อง</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {list.map(({ entry: e }) => {
                    const room = classrooms.find(c => c.id === e.classroom_id) ?? allClassrooms.find(c => c.id === e.classroom_id);
                    const subject = subjects.find(s => s.id === e.subject_id) ?? (e as any).subject;
                    return (
                      <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">ห้อง {room?.grade_group} {room?.room_name}</p>
                          <p className="text-slate-500 text-xs">{(subject as any)?.name_th ?? "—"}</p>
                        </div>
                        {canManage && (
                          <button
                            onClick={async () => { if (confirm(`ลบคาบนี้ออกจากห้อง ${room?.room_name}?`)) { await onDeleteEntry(e.id); } }}
                            className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-xs shrink-0">
                            🗑️ ลบคาบนี้
                          </button>
                        )}
                      </div>
                    );
                  })}
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
  const [subjectRequests,  setSubjectRequests]  = useState<SubjectAdditionRequest[]>([]);
  const [showAddSubjectRequest, setShowAddSubjectRequest] = useState(false);
  const [academicYearsRaw, setAcademicYearsRaw] = useState<AcademicYearRaw[]>([]);
  const [academicYears,    setAcademicYears]    = useState<{ id: string; year_name: string }[]>([]);
  const [selectedYear,     setSelectedYear]     = useState("");
  const [selectedRoom,     setSelectedRoom]     = useState("");
  const [viewMode,         setViewMode]         = useState<"room" | "teacher" | "requests" | "duplicates" | "dashboard">("room");
  const [selectedDayDetail, setSelectedDayDetail] = useState<number | null>(null);
  const [showSettings,     setShowSettings]     = useState(false);
  const [allEntriesForCheck, setAllEntriesForCheck] = useState<TimetableEntry[]>([]);
  const [checkingAllYears,   setCheckingAllYears]   = useState(false);
  const [roomTimeSlots,    setRoomTimeSlots]    = useState<TimeSlot[]>([]);
  const [clubPeriods, setClubPeriods] = useState<ClubPeriod[]>([]);
const [clubs, setClubs] = useState<Club[]>([]);
const [showClubAdmin, setShowClubAdmin] = useState(false);

const loadClubs = useCallback(async () => {
  if (!selectedYear) return;
  const selRow = academicYearsRaw.find(y => y.id === selectedYear);
  const yearIds = selRow ? academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id) : [selectedYear];

  const [{ data: periodsData }, { data: clubsData }] = await Promise.all([
    supabase.from("club_periods").select("*").in("academic_year_id", yearIds),
    supabase.from("clubs").select("*").in("academic_year_id", yearIds),
  ]);
  setClubPeriods((periodsData ?? []) as ClubPeriod[]);

  const teacherIds = [...new Set((clubsData ?? []).map((c: any) => c.teacher_id))];
  const { data: teacherRows } = await supabase.from("users")
    .select("id,title,first_name,last_name,full_name")
    .in("id", teacherIds.length ? teacherIds : ["_none_"]);
  const teacherMap: Record<string, Teacher> = {};
  (teacherRows ?? []).forEach((t: any) => { teacherMap[t.id] = { ...t, full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() }; });

  setClubs(((clubsData ?? []) as any[]).map(c => ({ ...c, teacher: teacherMap[c.teacher_id] })));
}, [selectedYear, academicYearsRaw]);

useEffect(() => { loadClubs(); }, [loadClubs]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const meta  = authUser.user_metadata ?? {};
      const email = authUser.email || meta.email || meta.preferred_username || meta.upn || "";

      let profileData: any = null;
      const { data: byAuthId } = await supabase.from("users")
        .select("id,first_name,last_name,full_name,email,role,position,grade_level,extra_roles,department_id")
        .eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;

      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id,first_name,last_name,full_name,email,role,position,grade_level,extra_roles,department_id")
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
          .select("id,title,first_name,last_name,full_name,position,role,grade_level,department_id")
          .order("first_name"),
        // ★ FIX: ดึงห้องทั้งหมด ไม่ filter
        supabase.from("classrooms")
          .select("id,room_number,room_name,grade_group,academic_year_id,schedule_type,homeroom_teacher_id,homeroom_teacher_2_id")
          .order("grade_group").order("room_number"),
      ]);

      const yearsRaw = (yearsRes.data ?? []) as AcademicYearRaw[];
      const allRooms = (classroomsRes.data ?? []) as Classroom[];
      const allSlots = (slotsRes.data ?? []) as TimeSlot[];

      setAcademicYearsRaw(yearsRaw);
      setTimeSlots(allSlots);
      setSubjects((subjectsRes.data ?? []) as Subject[]);
      setTeachers(((teachersRes.data ?? []) as any[])
        .filter(t => !NON_TEACHING_ROLES.includes(t.role ?? ""))  // ← กรองตรงนี้
        .map(t => ({ ...t, full_name: t.full_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() })));
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

        const myHomeroomRoom = profileData?.id
          ? roomList.find((r: Classroom) => r.homeroom_teacher_id === profileData.id || r.homeroom_teacher_2_id === profileData.id)
          : null;
        const initRoom = myHomeroomRoom?.id ?? (roomList[0]?.id ?? "");
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

  // ★ โหลด entries ของ "ทุกปีการศึกษา" แบบไม่กรอง เพื่อใช้ตรวจคาบซ้ำ/ครูซ้อนคาบ
// ป้องกันเคสที่คาบซ้ำถูกสร้างข้าม academic_year_id คนละค่ากัน แล้วมองไม่เห็นตอนดูเฉพาะปีที่เลือก
const loadAllEntriesForCheck = useCallback(async () => {
  setCheckingAllYears(true);
  const { data: allData } = await (supabase.from("timetable_entries") as any).select("*");
  const allEntries = (allData ?? []) as TimetableEntry[];

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

  setAllEntriesForCheck(enriched);
  setCheckingAllYears(false);
}, []);

// โหลดตอนเข้าแท็บ "duplicates" (แอดมิน) หรือ "requests" (ทุกโรล — ใช้แสดงส่วนตรวจสอบครูสอนซ้อนคาบ)
useEffect(() => {
  if (viewMode === "duplicates" || viewMode === "requests") loadAllEntriesForCheck();
}, [viewMode, loadAllEntriesForCheck]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  function isApproverUser(user: UserProfile): boolean {
  if (["admin","director","deputy_director"].includes(user.role)) return true;
  const extraRoles = user.extra_roles ?? [];
  return extraRoles.includes("grade_head") || extraRoles.includes("dept_head");
}

  // ── Load change requests ──────────────────────────────────────────────────
  const loadChangeRequests = useCallback(async () => {
    if (!user) return;
    const isApprover = isApproverUser(user);
    let query = (supabase.from("timetable_change_requests") as any)
      .select("*, requester:users!timetable_change_requests_requester_id_fkey(id,first_name,last_name,full_name,email)")
      .order("created_at", { ascending: false });
    if (!isApprover) query = query.eq("requester_id", user.id);
    const { data } = await query;
    setChangeRequests((data ?? []) as ChangeRequest[]);
  }, [user]);


  useEffect(() => { loadChangeRequests(); }, [loadChangeRequests]);

  // ── Load subject addition requests ────────────────────────────────────────
  const loadSubjectRequests = useCallback(async () => {
    if (!user) return;
    const isAdminUser = ADMIN_ROLES.includes(user.role);
    let query = (supabase.from("subject_addition_requests") as any)
      .select("*, requester:users!subject_addition_requests_requester_id_fkey(id,first_name,last_name,full_name,email)")
      .order("created_at", { ascending: false });
    if (!isAdminUser) query = query.eq("requester_id", user.id);
    const { data } = await query;
    setSubjectRequests((data ?? []) as SubjectAdditionRequest[]);
  }, [user]);

  useEffect(() => { loadSubjectRequests(); }, [loadSubjectRequests]);

  // ── แจ้งเตือนครูผู้ขอ เมื่อคำขอเพิ่มรายวิชาของตัวเองได้รับการอนุมัติแล้ว ───────
  // (เก็บรายการที่แจ้งไปแล้วไว้ใน localStorage ต่อผู้ใช้ เพื่อไม่แจ้งซ้ำทุกครั้งที่โหลดหน้า)
  useEffect(() => {
    if (!user) return;
    const myApproved = subjectRequests.filter(r => r.requester_id === user.id && r.status === "approved");
    if (myApproved.length === 0) return;
    const seenKey = `subject_request_notified_${user.id}`;
    let seenIds: string[] = [];
    try { seenIds = JSON.parse(localStorage.getItem(seenKey) ?? "[]"); } catch { seenIds = []; }
    const newlyApproved = myApproved.filter(r => !seenIds.includes(r.id));
    if (newlyApproved.length > 0) {
      const names = newlyApproved.map(r => `${r.subject_code} ${r.name_th} (ชั้น ${r.grade_level})`).join("\n");
      alert(`✅ วิชาที่คุณขอเพิ่มได้รับการอนุมัติและถูกเพิ่มเข้าระบบแล้ว:\n${names}`);
      localStorage.setItem(seenKey, JSON.stringify([...seenIds, ...newlyApproved.map(r => r.id)]));
    }
  }, [subjectRequests, user]);

  // ── applyScheduleType ─────────────────────────────────────────────────────
  async function applyScheduleType(type: string) {
    await (supabase.from("classrooms") as any).update({ schedule_type: type }).eq("id", selectedRoom);
    const { data } = await supabase.from("classrooms")
      .select("id,room_number,room_name,grade_group,academic_year_id,schedule_type,homeroom_teacher_id,homeroom_teacher_2_id").order("grade_group").order("room_number");
    const allRooms = (data ?? []) as Classroom[];
    setAllClassrooms(allRooms);
    const selRow  = academicYearsRaw.find(y => y.id === selectedYear);
    if (selRow) {
      const sameIds = academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id);
      const matched = allRooms.filter(r => sameIds.includes(r.academic_year_id ?? ""));
      setClassrooms(matched.length > 0 ? matched : allRooms);
    } else setClassrooms(allRooms);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ✅ ใหม่: ensureRealTimeSlot — แก้ปัญหา "กดเพิ่มคาบแล้วไม่มีอะไรเกิดขึ้น"
  // สาเหตุ: บางคาบ (เช่นคาบเฉพาะของอนุบาล 09:30–09:50) เป็นแค่ "virtual slot" ที่สร้างจาก
  // template ในหน้าเว็บ (id ขึ้นต้นด้วย tmpl-) เพราะยังไม่มีแถวจริงในตาราง time_slots ของ DB
  // เวลาพยายามบันทึกคาบเรียนโดยใช้ id ปลอมนี้ Supabase จะปฏิเสธ (400 invalid input syntax for
  // type uuid) แต่โค้ดเดิมไม่ได้เช็ค error เลยดูเหมือน "กดแล้วเงียบ ไม่มีอะไรเกิดขึ้น"
  // ฟังก์ชันนี้จะสร้างแถวจริงใน time_slots ให้อัตโนมัติก่อนบันทึก แล้วคืน id จริงกลับมาใช้แทน
  // ══════════════════════════════════════════════════════════════════════════
  async function ensureRealTimeSlot(slotId: string, slotInfo?: TimeSlot): Promise<string> {
    if (!slotId || !slotId.startsWith("tmpl-")) return slotId; // เป็น id จริงอยู่แล้ว ไม่ต้องทำอะไร
    if (!slotInfo) {
      throw new Error("ไม่พบข้อมูลคาบเวลานี้ในระบบ (time_slots) กรุณาแจ้งผู้ดูแลระบบให้เพิ่มคาบเวลานี้ก่อน");
    }
    const { data, error } = await (supabase.from("time_slots") as any)
      .insert([{
        slot_number: slotInfo.slot_number,
        start_time: slotInfo.start_time,
        end_time: slotInfo.end_time,
        slot_label: slotInfo.slot_label,
        is_break: slotInfo.is_break,
        schedule_type: slotInfo.schedule_type,
      }])
      .select("id")
      .single();
    if (error) throw error;

    // รีเฟรช time_slots ในสถานะ ให้ทุกห้อง/ทุกตารางที่ใช้เวลานี้เห็น id จริงตัวเดียวกันทันที
    const { data: freshSlots } = await supabase.from("time_slots").select("*").order("start_time");
    setTimeSlots((freshSlots ?? []) as TimeSlot[]);

    return data.id as string;
  }

  // ── Save direct (admin) ───────────────────────────────────────────────────
  // ✅ เพิ่ม try/catch + alert ให้เห็น error จริงเสมอ (เดิมไม่เช็ค error เลย ทำให้ "กดแล้วเงียบ")
  async function handleSaveDirect(data: any) {
    try {
      const realSlotId = await ensureRealTimeSlot(data.time_slot_id, data.time_slot);

      if (data.id) {
        const { error } = await (supabase.from("timetable_entries") as any)
          .update({
            subject_id: data.subject_id, teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 ?? null,
            time_slot_id: realSlotId,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("timetable_entries") as any).insert([{
          classroom_id: data.classroom_id, subject_id: data.subject_id,
          teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 ?? null,
          day_of_week: data.day_of_week, time_slot_id: realSlotId,
          academic_year_id: data.academic_year_id,
        }]);
        if (error) throw error;
      }
      await loadEntries();
    } catch (err: any) {
      console.error("[handleSaveDirect] error:", err);
      alert(
        "❌ บันทึกคาบเรียนไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ") +
        "\n\nถ้าปัญหายังเกิดซ้ำ ลองกดปุ่ม ⚙️ มุมขวาบนเพื่อเลือกตารางเวลาของห้องนี้ใหม่อีกครั้ง หรือแจ้งผู้ดูแลระบบ"
      );
    }
  }

  // ── Request change (teacher) ──────────────────────────────────────────────
  // ✅ เพิ่ม ensureRealTimeSlot เหมือนกัน กันคำขอพังด้วยสาเหตุเดียวกัน
  async function handleRequestChange(data: any) {
    if (!user) return;
    try {
      const realSlotId = await ensureRealTimeSlot(data.time_slot_id, data.time_slot);
      const { error } = await (supabase.from("timetable_change_requests") as any).insert([{
        requester_id: user.id, classroom_id: data.classroom_id,
        time_slot_id: realSlotId, day_of_week: data.day_of_week,
        academic_year_id: data.academic_year_id,
        old_subject_id: data.old_subject_id ?? null, old_teacher_id: data.old_teacher_id ?? null, old_teacher_id_2: data.old_teacher_id_2 ?? null,
        new_subject_id: data.subject_id, new_teacher_id: data.teacher_id, new_teacher_id_2: data.teacher_id_2 ?? null,
        note: data.note ?? null, status: "pending",
      }]);
      if (error) throw error;

      // ★ แจ้งเตือนผ่าน Teams
      notifyTeams({
        title: "🗓️ มีคำขอแก้ไขตารางสอนใหม่",
        message: `${fullName(user)} ยื่นคำขอแก้ไขคาบเรียน`,
        facts: {
          ห้อง: classrooms.find(c => c.id === data.classroom_id)?.room_name ?? "-",
          วัน: DAYS[(data.day_of_week ?? 1) - 1],
        },
      });

      alert("✅ ส่งคำขอแก้ไขแล้ว รอการอนุมัติ");
      await loadChangeRequests();
    } catch (err: any) {
      console.error("[handleRequestChange] error:", err);
      alert("❌ ส่งคำขอไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
  }

  // ── Approve request ───────────────────────────────────────────────────────
  async function handleApproveRequest(requestId: string) {
    if (!user) return;
    try {
      const req = changeRequests.find(r => r.id === requestId);
      if (!req) return;
      const existing = entries.find(e =>
        e.classroom_id === req.classroom_id &&
        e.time_slot_id === req.time_slot_id &&
        e.day_of_week  === req.day_of_week
      );
      if (existing) {
        const { error } = await (supabase.from("timetable_entries") as any)
          .update({ subject_id: req.new_subject_id, teacher_id: req.new_teacher_id, teacher_id_2: req.new_teacher_id_2 ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("timetable_entries") as any).insert([{
          classroom_id: req.classroom_id, time_slot_id: req.time_slot_id, day_of_week: req.day_of_week,
          academic_year_id: req.academic_year_id,
          subject_id: req.new_subject_id, teacher_id: req.new_teacher_id, teacher_id_2: req.new_teacher_id_2 ?? null,
        }]);
        if (error) throw error;
      }
      const { error: updErr } = await (supabase.from("timetable_change_requests") as any)
        .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updErr) throw updErr;
      await Promise.all([loadEntries(), loadChangeRequests()]);
      if (req.requester?.email) {
        sendTeamsDM("academic", req.requester.email,
          `✅ คำขอแก้ไขตารางสอนของคุณได้รับการอนุมัติแล้ว (${DAYS[(req.day_of_week ?? 1) - 1]})`);
      } else {
        console.warn("[handleApproveRequest] ไม่ส่ง DM เพราะไม่มี email ของผู้ขอ:", req.requester);
      }
      alert("✅ อนุมัติและอัปเดตตารางสอนแล้ว");
    } catch (err: any) {
      console.error("[handleApproveRequest] error:", err);
      alert("❌ อนุมัติไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
  }

  // ── Reject request ────────────────────────────────────────────────────────
  async function handleRejectRequest(requestId: string, reason: string) {
    if (!user) return;
    try {
      const req = changeRequests.find(r => r.id === requestId); 
      const { error } = await (supabase.from("timetable_change_requests") as any)
        .update({ status: "rejected", reject_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      await loadChangeRequests();
      // ★ แจ้งเตือนครูผู้ขอผ่าน Teams DM
      if (req?.requester?.email) {
        sendTeamsDM("academic", req.requester.email,
          `❌ คำขอแก้ไขตารางสอนของคุณถูกปฏิเสธ เหตุผล: ${reason}`);
      } else {
        console.warn("[handleRejectRequest] ไม่ส่ง DM เพราะไม่มี email ของผู้ขอ:", req?.requester);
      }
    } catch (err: any) {
      console.error("[handleRejectRequest] error:", err);
      alert("❌ ปฏิเสธคำขอไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
  }

  // ── Subject addition request: submit / approve / reject ───────────────────
  async function handleAddSubjectRequest(d: { subject_code: string; name_th: string; grade_level: string; subject_group: string }) {
    if (!user) return;
    try {
      const { error } = await (supabase.from("subject_addition_requests") as any).insert([{
        requester_id: user.id,
        subject_code: d.subject_code,
        name_th: d.name_th,
        grade_level: d.grade_level,
        subject_group: d.subject_group || null,
        status: "pending",
      }]);
      if (error) throw error;

        // ★ แจ้งเตือนผ่าน Teams
      notifyTeams({
        title: "📚 มีคำขอเพิ่มรายวิชาใหม่",
        message: `${fullName(user)} ขอเพิ่มวิชา ${d.subject_code} ${d.name_th} (ชั้น ${d.grade_level})`,
      });

      alert("✅ ส่งคำขอเพิ่มรายวิชาแล้ว รอแอดมินอนุมัติ");
      await loadSubjectRequests();
    } catch (err: any) {
      console.error("[handleAddSubjectRequest] error:", err);
      alert("❌ ส่งคำขอไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
  }

  async function handleApproveSubjectRequest(requestId: string) {
    if (!user) return;
    try {
      const req = subjectRequests.find(r => r.id === requestId);
      if (!req) return;
      const { error: insErr } = await (supabase.from("subjects") as any).insert([{
        subject_code: req.subject_code, name_th: req.name_th, subject_group: req.subject_group ?? null,
      }]);
      if (insErr) throw insErr;
      const { error: updErr } = await (supabase.from("subject_addition_requests") as any)
        .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updErr) throw updErr;

      const { data: subjectsData } = await supabase.from("subjects")
        .select("id,subject_code,name_th,subject_group").order("subject_code");
      setSubjects((subjectsData ?? []) as Subject[]);
      await loadSubjectRequests();
      // ★ เพิ่มใหม่: แจ้งผู้ขอผ่าน Teams DM
      if (req.requester?.email) {
        sendTeamsDM("academic", req.requester.email,
          `✅ คำขอเพิ่มรายวิชา "${req.subject_code} ${req.name_th}" ของคุณได้รับการอนุมัติแล้ว`);
      }
      alert("✅ อนุมัติและเพิ่มรายวิชาใหม่เข้าระบบแล้ว");
    } catch (err: any) {
      console.error("[handleApproveSubjectRequest] error:", err);
      alert("❌ อนุมัติไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
    
  }

  async function handleRejectSubjectRequest(requestId: string, reason: string) {
    if (!user) return;
    try {
      const req = subjectRequests.find(r => r.id === requestId);
      const { error } = await (supabase.from("subject_addition_requests") as any)
        .update({ status: "rejected", reject_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      await loadSubjectRequests();
      // ★ เพิ่มใหม่: แจ้งผู้ขอผ่าน Teams DM
      if (req?.requester?.email) {
        sendTeamsDM("academic", req.requester.email,
          `❌ คำขอเพิ่มรายวิชา "${req.subject_code} ${req.name_th}" ของคุณถูกปฏิเสธ เหตุผล: ${reason}`);
      }
    } catch (err: any) {
      console.error("[handleRejectSubjectRequest] error:", err);
      alert("❌ ปฏิเสธคำขอไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
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
  const myClassrooms      = classrooms
  .filter(c => myClassroomIds.includes(c.id))
  .sort((a, b) => {
    const ga = gradeGroupSortKey(a.grade_group);
    const gb = gradeGroupSortKey(b.grade_group);
    if (ga !== gb) return ga - gb;
    return (a.room_name ?? "").localeCompare(b.room_name ?? "", "th", { numeric: true });
  });
  const homeroomClassroom = classrooms.find(c => c.homeroom_teacher_id === user.id || c.homeroom_teacher_2_id === user.id) ?? null;
  const pendingCount      = changeRequests.filter(r => r.status === "pending").length;
  const pendingSubjectCount = subjectRequests.filter(r => r.status === "pending").length;

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  // ★ FIX: gradeGroups จาก classrooms (ทั้งหมดที่โหลดมา)
  const gradeGroups = [...new Set(classrooms.map(c => c.grade_group).filter(Boolean))]
    .sort((a, b) => gradeGroupSortKey(a as string) - gradeGroupSortKey(b as string)) as string[];

  // ── ตรวจหาคาบซ้ำ (ห้อง+วัน+คาบเวลาเดียวกัน มากกว่า 1 แถว) ──
// ★ FIX: ใช้ allEntriesForCheck (ทุกปีการศึกษา, ไม่ผูกกับ selectedYear) เพื่อไม่ตกหล่นคาบซ้ำ
// ★ ROOT CAUSE: time_slots มีหลาย record ที่เวลาเดียวกันได้ (คนละ id)
// ระบบเดิม group ด้วย time_slot_id ดิบๆ เลยมองไม่เห็นคาบซ้ำที่จริงๆ เป็น "เวลาเดียวกัน"
// แต่ผูกกับ time_slot_id คนละตัว → ต้อง normalize เป็น start_time ก่อน group เสมอ
const timeSlotStartMap: Record<string, string> = {};
timeSlots.forEach(s => { timeSlotStartMap[s.id] = (s.start_time ?? "").slice(0, 5); });
function normalizedSlotKey(e: TimetableEntry): string {
  // ถ้าหา start_time ไม่เจอใน timeSlots (เช่น virtual slot จาก template) ให้ fallback ไปใช้ time_slot_id ดิบ
  return timeSlotStartMap[e.time_slot_id] || e.time_slot_id;
}

const duplicateGroups = (() => {
  const map = new Map<string, TimetableEntry[]>();
  allEntriesForCheck.forEach(e => {
    const key = `${e.classroom_id}|${e.day_of_week}|${normalizedSlotKey(e)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  });
  return Array.from(map.values()).filter(group => group.length > 1);
})();

const teacherConflictGroups = (() => {
  const map = new Map<string, { teacherId: string; entry: TimetableEntry }[]>();
  allEntriesForCheck.forEach(e => {
    const ids = [e.teacher_id, e.teacher_id_2].filter(Boolean) as string[];
    const slotKey = normalizedSlotKey(e);
    ids.forEach(tid => {
      const key = `${tid}|${e.day_of_week}|${slotKey}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ teacherId: tid, entry: e });
    });
  });
  // ★ เปลี่ยนเงื่อนไข: ตอนนี้นับเป็น conflict ทันทีถ้าครูคนเดียวกันมี entry มากกว่า 1
  // ในวัน+เวลาเดียวกัน ไม่ว่าจะห้องเดียวกันหรือคนละห้อง (ถ้าห้องเดียวกันก็ซ้ำอยู่แล้วใน duplicateGroups
  // แต่ยังอยากเห็นในนี้ด้วยเผื่อกรณี classroom_id ต่างกันแต่จริงๆ คือห้องเดียวกันที่ถูกสร้างซ้ำ)
  return Array.from(map.entries())
    .map(([key, list]) => ({ key, list, isConflict: list.length > 1 }))
    .filter(g => g.isConflict);
})();

const duplicateClassroomGroups = (() => {
  const map = new Map<string, Classroom[]>();
  allClassrooms.forEach(c => {
    const key = `${c.grade_group ?? ""}|${(c.room_name ?? "").trim()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  });
  return Array.from(map.values()).filter(group => group.length > 1);
})();

// ── สถิติสำหรับแดชบอร์ด ──
const teacherHoursMap = (() => {
  const map = new Map<string, number>();
  entries.forEach(e => {
    map.set(e.teacher_id, (map.get(e.teacher_id) ?? 0) + 1);
    if (e.teacher_id_2) map.set(e.teacher_id_2, (map.get(e.teacher_id_2) ?? 0) + 1);
  });
  return map;
})();
const teacherHoursList = teachers
  .map(t => ({ teacher: t, hours: teacherHoursMap.get(t.id) ?? 0 }))
  .sort((a, b) => b.hours - a.hours);
const maxTeacherHours = Math.max(1, ...teacherHoursList.map(t => t.hours));

const subjectGroupHoursMap = (() => {
  const map = new Map<string, number>();
  entries.forEach(e => {
    const subj = subjects.find(s => s.id === e.subject_id);
    const group = subj?.subject_group ?? "ไม่ระบุ";
    map.set(group, (map.get(group) ?? 0) + 1);
  });
  return map;
})();
const subjectGroupList = Array.from(subjectGroupHoursMap.entries()).sort((a, b) => b[1] - a[1]);
const maxSubjectGroupHours = Math.max(1, ...subjectGroupList.map(([, v]) => v));

const gradeHoursMap = (() => {
  const map = new Map<string, number>();
  entries.forEach(e => {
    const room = classrooms.find(c => c.id === e.classroom_id) ?? allClassrooms.find(c => c.id === e.classroom_id);
    const grade = room?.grade_group ?? "ไม่ระบุ";
    map.set(grade, (map.get(grade) ?? 0) + 1);
  });
  return map;
})();
const gradeHoursList = Array.from(gradeHoursMap.entries())
  .sort((a, b) => gradeGroupSortKey(a[0]) - gradeGroupSortKey(b[0]));
const maxGradeHours = Math.max(1, ...gradeHoursList.map(([, v]) => v));
const totalScheduledPeriods = entries.length;

  const currentScheduleType = SCHEDULE_TEMPLATES.find(t => t.key === selectedClassroom?.schedule_type)?.label ?? "ประถม";

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {showSettings && selectedClassroom && (
        <ScheduleSettingsModal onClose={() => setShowSettings(false)} onApply={applyScheduleType} />
      )}

      {selectedDayDetail !== null && (
  <DayDetailModal
    day={selectedDayDetail} entries={myEntries} timeSlots={timeSlots}
    subjects={subjects} teachers={teachers} classrooms={classrooms} userId={user.id}
    onClose={() => setSelectedDayDetail(null)}
  />
)}
{showClubAdmin && (
  <ClubManagementModal
    clubPeriods={clubPeriods} clubs={clubs} teachers={teachers} academicYearId={selectedYear}
    onClose={() => setShowClubAdmin(false)} onReload={loadClubs}
  />
)}
{showAddSubjectRequest && (
  <AddSubjectRequestModal
    subjects={subjects}
    onClose={() => setShowAddSubjectRequest(false)}
    onSubmit={async (d) => { await handleAddSubjectRequest(d); setShowAddSubjectRequest(false); }}
  />
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
                {(pendingCount + pendingSubjectCount) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{pendingCount + pendingSubjectCount}</span>
                )}
              </button>
              {isAdmin && (
                <button onClick={() => setViewMode("dashboard")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === "dashboard" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                  📊 แดชบอร์ด
                </button>
              )}
              {isAdmin && (
  <button onClick={() => setViewMode("duplicates")}
    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all relative ${viewMode === "duplicates" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
    🧹 คาบซ้ำ
    {(duplicateGroups.length + teacherConflictGroups.length + duplicateClassroomGroups.length) > 0 && (
      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
        {duplicateGroups.length + teacherConflictGroups.length + duplicateClassroomGroups.length}
      </span>
    )}
  </button>
)}
{isAdmin && (
  <button onClick={() => setShowClubAdmin(true)}
    className="px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 text-purple-700 font-black text-sm hover:bg-purple-100">
    🎪 จัดการชุมนุม
  </button>
)}
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
            {!isAdmin && myClassrooms.filter(c => c.id !== homeroomClassroom?.id).length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-slate-400 uppercase px-2 mb-1">ห้องที่ฉันสอน</p>
                {myClassrooms.filter(c => c.id !== homeroomClassroom?.id).map(room => (
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
                        const tLabel = tKey === "kindergarten" ? "อนุบาล"
  : tKey === "primary" ? "ป."
  : tKey === "junior" ? "ม.ต้น" : "ม.ปลาย";
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
      currentUser={user}
      clubPeriod={clubPeriods.find(cp => cp.grade_label === getClassroomGradeLabel(selectedClassroom))}
      clubsForGrade={clubs.filter(c => c.grade_label === getClassroomGradeLabel(selectedClassroom))}
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
      <button key={day} onClick={() => setSelectedDayDetail(i + 1)}
        className={`${dc.bg} border-2 ${dc.border} rounded-2xl p-3 text-center hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer`}>
        <p className={`text-xs font-black ${dc.text}`}>{day}</p>
        <p className={`text-2xl font-black ${dc.text}`}>{count}</p>
        <p className="text-slate-400 text-[10px] font-bold">คาบ</p>
      </button>
    );
  })}
</div>
              {myEntries.length > 0 || clubs.some(c => c.teacher_id === user.id) ? (
  <div className="mb-5 space-y-6">
    {(["kindergarten", "primary", "junior", "senior"] as const).map(type => {
      const roomsOfType = myClassrooms.filter(c => (c.schedule_type ?? "primary") === type);
      const myClubBlocksAll = clubs
        .filter(c => c.teacher_id === user.id)
        .map(c => {
          const period = clubPeriods.find(cp => cp.grade_label === c.grade_label);
          return period ? { dayOfWeek: period.day_of_week, slotLabel: period.slot_label, club: c } : null;
        })
        .filter((b): b is { dayOfWeek: number; slotLabel: string; club: Club } => !!b);
      const myClubBlocksOfType = myClubBlocksAll.filter(b => scheduleTypeForGradeLabel(b.club.grade_label) === type);

      if (roomsOfType.length === 0 && myClubBlocksOfType.length === 0) return null;

      const roomIds = roomsOfType.map(r => r.id);
      const entriesOfType = myEntries.filter(e => roomIds.includes(e.classroom_id));
      if (entriesOfType.length === 0 && myClubBlocksOfType.length === 0) return null;

      const slots = buildRoomSlots(type, timeSlots);
      const label = SCHEDULE_TEMPLATES.find(t => t.key === type)?.label ?? type;

      return (
        <div key={type}>
          <h3 className="font-black text-slate-700 text-sm mb-3">📅 ตารางคาบสอนของฉัน · {label}</h3>
          <PersonalTimetableGrid
            myEntries={entriesOfType} myClubBlocks={myClubBlocksOfType} timeSlots={slots}
            subjects={subjects} teachers={teachers} classrooms={classrooms} userId={user.id}
          />
        </div>
      );
    })}
  </div>
) : (
                <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200 mb-5">
                  <p className="text-4xl mb-3">📅</p>
                  <p className="font-bold">ยังไม่มีตารางสอน</p>
                </div>
              )}
            </div>
          )}

          {/* ── คำขอ ── */}
          {viewMode === "requests" && (
            <div>
              <div className="mb-4 flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-800">📋 คำขอ</h2>
                  <p className="text-slate-400 text-sm">{isApprover ? "คุณสามารถอนุมัติหรือปฏิเสธคำขอได้" : "คำขอที่คุณส่งไป"}</p>
                </div>
                {/* ★ FIX: แอดมิน/ผู้บริหารเป็นผู้อนุมัติ ไม่ใช่ผู้ขอ จึงไม่แสดงปุ่มนี้ให้แอดมิน */}
                {!isAdmin && (
                  <button onClick={() => setShowAddSubjectRequest(true)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shrink-0">
                    ➕ ขอเพิ่มรายวิชา
                  </button>
                )}
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
              <div className="mt-6">
                <SubjectRequestsPanel
                  requests={subjectRequests}
                  canApprove={isAdmin}
                  onApprove={handleApproveSubjectRequest}
                  onReject={handleRejectSubjectRequest}
                />
              </div>
              {/* ★ FIX: ย้ายส่วนตรวจสอบครูสอนซ้อนคาบจากแท็บ "duplicates" (เดิมแอดมินเท่านั้น) มาแสดงในหน้าคำขอให้ทุกโรลเห็นด้วย */}
              <div className="mt-6">
                {checkingAllYears && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 text-blue-700 text-sm font-bold animate-pulse mb-4">
                    ⏳ กำลังโหลดข้อมูลเพื่อตรวจสอบครูสอนซ้อนคาบ...
                  </div>
                )}
                {/* ★ FIX: ครูทั่วไปเห็นเฉพาะคาบซ้อนของตัวเอง ส่วนแอดมินเห็นทุกคน */}
                <TeacherConflictPanel
                  groups={isAdmin ? teacherConflictGroups : teacherConflictGroups.filter(g => g.list.some(item => item.teacherId === user.id))}
                  classrooms={classrooms} allClassrooms={allClassrooms} subjects={subjects} teachers={teachers} timeSlots={timeSlots}
                  canManage={isAdmin}
                  scopeLabel={isAdmin ? undefined : "แสดงเฉพาะคาบสอนของคุณที่ถูกจัดซ้อนกัน (สอนพร้อมกัน 2 ห้องในเวลาเดียวกันไม่ได้)"}
                  onDeleteEntry={async (id) => { await supabase.from("timetable_entries").delete().eq("id", id); await Promise.all([loadEntries(), loadAllEntriesForCheck()]); }}
                />
              </div>
            </div>
          )}

          {viewMode === "room" && !selectedClassroom && (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center"><p className="text-4xl mb-3">🏫</p><p className="font-bold">เลือกห้องเรียนจากเมนูซ้าย</p></div>
            </div>
          )}

          {viewMode === "duplicates" && isAdmin && (
  <div className="space-y-8">

    {checkingAllYears && (
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 text-blue-700 text-sm font-bold animate-pulse">
        ⏳ กำลังโหลดข้อมูลทุกปีการศึกษาเพื่อตรวจสอบ...
      </div>
    )}

    {/* ★ ใหม่: ห้องเรียนชื่อซ้ำ — สาเหตุหลักที่ทำให้คาบซ้ำ "มองไม่เห็น" */}
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">🏫 ตรวจสอบห้องเรียนชื่อซ้ำ</h2>
        <p className="text-slate-400 text-sm">
          ห้องที่มีสายชั้น+ชื่อห้องเหมือนกัน แต่เป็นคนละ record — ถ้ามี มักทำให้คาบซ้ำที่แท้จริงตรวจไม่เจอ เพราะระบบผูกด้วย ID คนละตัว
        </p>
      </div>
      {duplicateClassroomGroups.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-bold text-sm">ไม่พบห้องเรียนชื่อซ้ำ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {duplicateClassroomGroups.map((group, gi) => (
            <div key={gi} className="bg-white rounded-2xl border-2 border-purple-200 shadow-sm overflow-hidden">
              <div className="bg-purple-50 border-b border-purple-200 px-5 py-3">
                <p className="font-black text-purple-700 text-sm">
                  ⚠️ {group[0].grade_group} {group[0].room_name} — พบ {group.length} record ที่ชื่อซ้ำกัน
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {group.map(room => {
                  const entryCount = allEntriesForCheck.filter(e => e.classroom_id === room.id).length;
                  return (
                    <div key={room.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">ID: <span className="font-mono text-xs text-slate-400">{room.id}</span></p>
                        <p className="text-slate-500 text-xs">มีคาบสอนผูกอยู่ {entryCount} คาบ · ประเภทตาราง: {room.schedule_type ?? "primary"}</p>
                      </div>
                      {entryCount === 0 && (
                        <button
                          onClick={async () => {
                            if (confirm(`ห้องนี้ไม่มีคาบสอนผูกอยู่เลย ลบ record ที่ซ้ำนี้ทิ้ง?`)) {
                              await supabase.from("classrooms").delete().eq("id", room.id);
                              const { data } = await supabase.from("classrooms")
                                .select("id,room_number,room_name,grade_group,academic_year_id,schedule_type,homeroom_teacher_id,homeroom_teacher_2_id")
                                .order("grade_group").order("room_number");
                              setAllClassrooms((data ?? []) as Classroom[]);
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-xs shrink-0">
                          🗑️ ลบ record ว่างนี้
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* ── ส่วนเดิม: คาบซ้ำในห้องเดียวกัน ── */}
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">🧹 ตรวจสอบคาบซ้ำในห้องเดียวกัน</h2>
        <p className="text-slate-400 text-sm">คาบที่ลงห้อง/วัน/เวลาเดียวกันซ้ำกันมากกว่า 1 รายการ (ทุกปีการศึกษา)</p>
      </div>
      {duplicateGroups.length === 0 ? (
        <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-bold text-sm">ไม่พบคาบซ้ำในห้องเดียวกัน</p>
        </div>
      ) : (
        <div className="space-y-4">
          {duplicateGroups.map((group, gi) => {
            const room = classrooms.find(c => c.id === group[0].classroom_id) ?? allClassrooms.find(c => c.id === group[0].classroom_id);
            const slot = timeSlots.find(s => s.id === group[0].time_slot_id);
            return (
              <div key={gi} className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-200 px-5 py-3">
                  <p className="font-black text-amber-700 text-sm">
                    ⚠️ ห้อง {room?.grade_group} {room?.room_name} · {DAYS[(group[0].day_of_week ?? 1) - 1]} · {slot?.slot_label ?? "—"} ({formatTime(slot?.start_time ?? "")}–{formatTime(slot?.end_time ?? "")})
                  </p>
                  <p className="text-amber-600 text-xs font-bold">พบ {group.length} รายการซ้ำในช่องเดียวกัน</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.map(e => {
                    const subject  = subjects.find(s => s.id === e.subject_id) ?? (e as any).subject;
                    const teacher1 = teachers.find(t => t.id === e.teacher_id) ?? (e as any).teacher;
                    const teacher2 = e.teacher_id_2 ? (teachers.find(t => t.id === e.teacher_id_2) ?? (e as any).teacher2) : null;
                    return (
                      <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{(subject as any)?.name_th ?? "—"}</p>
                          <p className="text-slate-500 text-xs">{displayName(teacher1)}{teacher2 ? ` + ${displayName(teacher2)}` : ""}</p>
                        </div>
                        <button
                          onClick={async () => { if (confirm("ลบรายการนี้?")) { await supabase.from("timetable_entries").delete().eq("id", e.id); await Promise.all([loadEntries(), loadAllEntriesForCheck()]); } }}
                          className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-xs shrink-0">
                          🗑️ ลบรายการนี้
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* ── ★ ครูสอนซ้อนคาบ (คนละห้อง) — ใช้ component เดียวกับที่แสดงในหน้าคำขอ ── */}
    <TeacherConflictPanel
      groups={teacherConflictGroups}
      classrooms={classrooms} allClassrooms={allClassrooms} subjects={subjects} teachers={teachers} timeSlots={timeSlots}
      canManage={true}
      onDeleteEntry={async (id) => { await supabase.from("timetable_entries").delete().eq("id", id); await Promise.all([loadEntries(), loadAllEntriesForCheck()]); }}
    />
  </div>
)}

{viewMode === "dashboard" && isAdmin && (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-black text-slate-800">📊 แดชบอร์ดสรุปตารางสอน</h2>
      <p className="text-slate-400 text-sm">ภาพรวมชั่วโมงสอนและการจัดตารางทั้งโรงเรียน</p>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        { label: "คาบที่จัดแล้ว", value: totalScheduledPeriods, unit: "คาบ", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
        { label: "ครูทั้งหมด", value: teachers.length, unit: "คน", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
        { label: "ห้องเรียน", value: classrooms.length, unit: "ห้อง", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
        { label: "คำขอรออนุมัติ", value: pendingCount, unit: "รายการ", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
      ].map(c => (
        <div key={c.label} className={`${c.bg} border-2 ${c.border} rounded-2xl p-4 text-center`}>
          <div className={`text-3xl font-black ${c.color}`}>{c.value}</div>
          <div className="text-slate-500 text-xs font-bold mt-1">{c.unit}</div>
          <div className="text-slate-400 text-[10px] font-bold">{c.label}</div>
        </div>
      ))}
    </div>

    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-black text-slate-700 text-sm mb-4">👩‍🏫 ชั่วโมงสอนรายบุคคล (คาบ/สัปดาห์)</h3>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {teacherHoursList.map(({ teacher, hours }) => (
          <div key={teacher.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs font-bold text-slate-600 truncate">{displayName(teacher)}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2 transition-all"
                style={{ width: `${Math.max(4, (hours / maxTeacherHours) * 100)}%` }}>
                {hours > 0 && <span className="text-white text-[10px] font-black">{hours}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-black text-slate-700 text-sm mb-4">📚 คาบสอนตามกลุ่มสาระ</h3>
        <div className="space-y-2">
          {subjectGroupList.map(([group, hours]) => (
            <div key={group} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-bold text-slate-600 truncate">{group}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(4, (hours / maxSubjectGroupHours) * 100)}%` }}>
                  <span className="text-white text-[10px] font-black">{hours}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-black text-slate-700 text-sm mb-4">🏫 คาบสอนตามระดับชั้น</h3>
        <div className="space-y-2">
          {gradeHoursList.map(([grade, hours]) => (
            <div key={grade} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-bold text-slate-600 truncate">{grade}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(4, (hours / maxGradeHours) * 100)}%` }}>
                  <span className="text-white text-[10px] font-black">{hours}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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