"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addDays } from "date-fns";

const supabase = createClient();

const ADMIN_ROLES = ["admin", "director", "deputy_director", "grade_head"];

// ══════════════════════════════════════════════════════════
// ── Types ─────────────────────────────────────────────────
// ★ ปรับให้ตรงกับ schema ที่หน้าใบลา (app/leave/page.tsx) ใช้จริง
// ══════════════════════════════════════════════════════════
interface User {
  id: string; first_name: string; last_name: string;
  title?: string; role: string; position?: string; academic_level?: string;
  grade_level?: string; email?: string; extra_roles?: string[];
}
interface TimeSlot {
  id: string; slot_number: number; start_time: string; end_time: string;
  slot_label: string; is_break: boolean; schedule_type?: string;
}
interface Classroom {
  id: string; room_name: string; grade_group?: string; schedule_type?: string; homeroom_teacher_id?: string | null;
}
interface Subject {
  id: string; subject_code?: string; name_th: string;
}
interface TimetableEntry {
  id: string; classroom_id: string; subject_id: string; teacher_id: string; teacher_id_2?: string | null;
  day_of_week: number; time_slot_id: string; academic_year_id: string;
  // เติมโดย enrichEntries() — ต้องเหมือนหน้าใบลาเป๊ะ
  slot_number?: number | null; slot_label?: string | null; start_time?: string | null; end_time?: string | null;
  is_break?: boolean; room_name?: string | null; grade_group?: string | null;
  subject_name?: string | null; subject_code?: string | null; schedule_type?: string | null;
}
interface SwapRequest {
  id: string; requester_id: string; target_teacher_id: string;
  requester_entry_id: string; target_entry_id: string | null;
  swap_date: string; reason?: string; status: string;
  responded_at?: string; created_at: string;
  requester?: User; target_teacher?: User;
  requester_entry?: TimetableEntry; target_entry?: TimetableEntry;
}
interface SubRecord {
  id: string; leave_request_id?: string | null; original_teacher_id?: string | null; absent_teacher_id: string;
  substitute_teacher_id?: string; timetable_entry_id?: string;
  substitute_date: string; time_slot_id?: string; classroom_id?: string;
  subject_id?: string; hours_count: number; assigned_by?: string;
  status: string; note?: string | null; academic_year_id?: string; created_at: string;
  absent_teacher?: User; substitute_teacher?: User;
  subject_name?: string | null; room_name?: string | null; slot_label?: string | null; grade_group?: string | null;
  slot_number?: number | null; // ★ ใช้เรียงคาบ 1-6 ให้ถูกต้อง (slot_label เรียงตัวอักษรไม่แม่น)
}
interface LeaveRequest {
  id: string; user_id: string; leave_type: string; start_date: string;
  end_date: string; days_count: number; reason?: string; status: string;
  half_day?: "morning" | "afternoon" | null;   // ★ เพิ่ม
  user?: User;
}
interface AcademicYear { id: string; year_name: string; is_current: boolean; }

// ── Helpers ───────────────────────────────────────────────
const TH_DAYS = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const GRADE_LABEL: Record<string, string> = {
  "k2":"อ.2","k3":"อ.3","p1":"ป.1","p2":"ป.2","p3":"ป.3","p4":"ป.4","p5":"ป.5","p6":"ป.6",
  "m1":"ม.1","m2":"ม.2","m3":"ม.3","m4":"ม.4","m5":"ม.5","m6":"ม.6",
};
function roomGradeCode(gradeGroup?: string | null): string | null {
  const thaiGrade = extractGradeOnly(gradeGroup);
  if (!thaiGrade) return null;
  const found = Object.entries(GRADE_LABEL).find(([, label]) => label === thaiGrade);
  return found ? found[0] : null;
}

function fullName(u?: User|null) {
  if (!u) return "—";
  return `${u.title??""}${u.first_name} ${u.last_name}`.trim();
}
function thaiDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s+"T00:00:00");
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
}
function thaiTime(t?: string) { return t ? t.slice(0,5)+" น." : "—"; }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// ★ หาวันจันทร์-ศุกร์ทั้งหมดในช่วงใบลา ใช้เทียบว่าจัดสอนแทนครบทุกวันหรือยัง
function getLeaveWeekdayDates(lr: { start_date: string; end_date: string }): string[] {
  const dates: string[] = [];
  let d = new Date(lr.start_date + "T00:00:00");
  const last = new Date(lr.end_date + "T00:00:00");
  while (d <= last) {
    if (d.getDay() >= 1 && d.getDay() <= 5) dates.push(ymd(d));
    d = addDays(d, 1);
  }
  return dates;
}
function dowOf(dateStr: string): number { return new Date(dateStr + "T00:00:00").getDay(); }
function toMinutes(t?: string | null): number {
  if (!t) return NaN;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
// ★ เทียบว่าสองช่วงเวลาทับกันจริงหรือไม่ (ไม่ใช่แค่ start_time ตรงกัน)
function timeRangesOverlap(aStart?: string|null, aEnd?: string|null, bStart?: string|null, bEnd?: string|null): boolean {
  const as = toMinutes(aStart), ae = toMinutes(aEnd), bs = toMinutes(bStart), be = toMinutes(bEnd);
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}
function compactIds(ids: (string | null | undefined)[]): string[] {
  return ids.filter((id): id is string => !!id);
}
// ★ หาครูอีกคนที่ยังสอนคู่อยู่ในคาบนี้ (ถ้ามี teacher_id_2) — ใช้เช็คว่าไม่ต้องจัดสอนแทน
function coTeacherId(entry: { teacher_id: string; teacher_id_2?: string | null }, excludeId: string): string | null {
  if (entry.teacher_id && entry.teacher_id !== excludeId) return entry.teacher_id;
  if (entry.teacher_id_2 && entry.teacher_id_2 !== excludeId) return entry.teacher_id_2;
  return null;
}

// ★ กันโรล staff/admin หลุดเข้ามาในรายชื่อครู (กันไว้อีกชั้น เผื่อ query หลักไม่ครอบคลุม)
const EXCLUDED_TEACHER_ROLES = ["staff", "admin", "admin_hr", "director", "deputy_director", "admin_academic", "admin_general"];
function isSelectableTeacher(t: User): boolean {
  return !EXCLUDED_TEACHER_ROLES.includes(t.role);
}

// ★ หาครูที่ "ว่าง" ในวัน+คาบเวลาเดียวกับ entry นี้จริงๆ (เทียบ start_time ไม่เทียบ time_slot_id ดิบ)
function computeFreeTeachersForEntry(
  entry: TimetableEntry, date: string, allEntries: TimetableEntry[],
  allTeachers: User[], excludeId: string
): User[] {
  const dow = dowOf(date);
  const busyIds = new Set(
    allEntries
      .filter(e => e.day_of_week === dow && timeRangesOverlap(entry.start_time, entry.end_time, e.start_time, e.end_time))
      .flatMap(e => compactIds([e.teacher_id, e.teacher_id_2]))
  );
  return allTeachers.filter(t => t.id !== excludeId && !busyIds.has(t.id) && isSelectableTeacher(t));
}

const STATUS_SWAP: Record<string,{label:string;cls:string}> = {
  pending:  { label:"รออนุมัติ",  cls:"bg-amber-50 text-amber-700 border-amber-300" },
  accepted: { label:"ตกลงแล้ว",  cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  rejected: { label:"ปฏิเสธ",    cls:"bg-red-50 text-red-700 border-red-300" },
  cancelled:{ label:"ยกเลิก",    cls:"bg-[#FCE7F3] text-slate-500 border-slate-300" },
};
const STATUS_SUB: Record<string,{label:string;cls:string}> = {
  assigned:  { label:"จัดแล้ว",  cls:"bg-[#FCE7F3] text-[#DB2777] border-[#FBCFE8]" },
  confirmed: { label:"ยืนยัน",   cls:"bg-emerald-50 text-emerald-700 border-emerald-300" },
  done:      { label:"สอนแทนเรียบร้อย",cls:"bg-slate-100 text-slate-600 border-slate-300" },
  cancelled: { label:"ยกเลิก",   cls:"bg-red-50 text-red-700 border-red-300" },
};
const SOURCE_LABEL: Record<string,{label:string;cls:string}> = {
  auto:      { label:"🤖 อัตโนมัติจากใบลา", cls:"bg-indigo-50 text-indigo-600 border-indigo-200" },
  specific:  { label:"🎯 เจาะจงจากใบลา",   cls:"bg-emerald-50 text-emerald-600 border-emerald-200" },
  admin:     { label:"🏫 แอดมินจัดเอง",     cls:"bg-[#FDF2F8] text-slate-600 border-[#FBCFE8]" },
};
function sourceOf(note?: string | null): keyof typeof SOURCE_LABEL {
  if (note?.includes("อัตโนมัติ")) return "auto";
  if (note?.includes("เจาะจง")) return "specific";
  return "admin";
}
// ══════════════════════════════════════════════════════════
// ── Teams DM helper — ยิงแจ้งเตือนผ่าน Teams จากบัญชี HR
// ══════════════════════════════════════════════════════════
async function notifyTeams(targetEmail: string | null | undefined, message: string) {
  if (!targetEmail) {
    console.warn("[notifyTeams] ไม่มี email ของผู้รับ — ข้ามการส่ง:", message);
    return;
  }
  try {
    const res = await fetch("/api/teams-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: "hr", targetEmail, message }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("[notifyTeams] ส่งแจ้งเตือน Teams ไม่สำเร็จ:", data.error);
    }
  } catch (e) {
    console.warn("[notifyTeams] เรียก API แจ้งเตือน Teams ล้มเหลว:", e);
  }
}

// ── สายชั้น / ครูประจำชั้น helpers ────────────────────────
function extractGradeOnly(gradeGroup?: string | null): string {
  if (!gradeGroup) return "";
  return gradeGroup.split("/")[0].trim();
}
function isHomeroomPriorityGrade(gradeGroup?: string | null): boolean {
  const g = extractGradeOnly(gradeGroup);
  return g === "ป.1" || g === "ป.2";
}

// ★ หา id ครูที่มีสายชั้นเดียวกับ "ครูที่ลา" — อ้างอิงตรงจากคอลัมน์ users.grade_level
function sameGradeTeacherIds(absentTeacher: User | null | undefined, allTeachers: User[]): Set<string> {
  if (!absentTeacher?.grade_level) return new Set();
  return new Set(
    allTeachers
      .filter(t => t.grade_level && t.grade_level === absentTeacher.grade_level)
      .map(t => t.id)
  );
}

// ★ ลำดับความสำคัญของครูที่จะเลือกมาสอนแทน:
// 0 = สายชั้นเดียวกับห้อง/คาบที่จะไปสอนแทน  1 = สายชั้นเดียวกับครูที่ลา  2 = สอนวิชาเดียวกันอยู่แล้ว  3 = ที่เหลือ
function substitutePriority(
  candidate: User,
  entry: { classroom_id?: string; grade_group?: string | null; subject_id?: string } | null | undefined,
  absentTeacher: User | null | undefined,
  allEntries: TimetableEntry[],
  homeroomMap: Record<string, string>
): number {
  // 0 = ครูประจำชั้นของห้องที่จะไปสอนแทน
  if (entry?.classroom_id && homeroomMap[entry.classroom_id] === candidate.id) return 0;
  // 1 = สายชั้นเดียวกับคาบที่กำลังจะไปสอนแทน
  const roomGrade = entry ? roomGradeCode(entry.grade_group) : null;
  if (roomGrade && candidate.grade_level === roomGrade) return 1;
  // 2 = สายชั้นเดียวกับครูที่ลา
  if (absentTeacher?.grade_level && candidate.grade_level === absentTeacher.grade_level) return 2;
  // 3 = หมวดวิชาเดียวกัน (สอนวิชาเดียวกันอยู่แล้ว)
  const teachesSameSubject = entry?.subject_id
    ? allEntries.some(e => (e.teacher_id === candidate.id || e.teacher_id_2 === candidate.id) && e.subject_id === entry.subject_id)
    : false;
  if (teachesSameSubject) return 3;
  // 4 = อื่นๆ
  return 4;
}
function sortTeachersByGrade(
  candidates: User[],
  entry: { classroom_id?: string; grade_group?: string | null; subject_id?: string } | null | undefined,
  absentTeacher: User | null | undefined,
  allEntries: TimetableEntry[],
  homeroomMap: Record<string, string>
): User[] {
  return [...candidates].sort((a, b) => {
    const pa = substitutePriority(a, entry, absentTeacher, allEntries, homeroomMap);
    const pb = substitutePriority(b, entry, absentTeacher, allEntries, homeroomMap);
    if (pa !== pb) return pa - pb;
    return fullName(a).localeCompare(fullName(b), "th");
  });
}

// ══════════════════════════════════════════════════════════
// ── Schedule templates — ★ ต้องเหมือนกับหน้าใบลา (leave/page.tsx) เป๊ะ
// ══════════════════════════════════════════════════════════
const SCHEDULE_TEMPLATES = [
  {
    key: "kindergarten", label: "อนุบาล (อ.2–อ.3)",
    slots: [
      { slot_number: 1, start_time: "08:30", end_time: "09:30", slot_label: "คาบ 1", is_break: false },
      { slot_number: 2, start_time: "09:30", end_time: "09:50", slot_label: "คาบ 2", is_break: false },
      { slot_number: 3, start_time: "09:50", end_time: "11:00", slot_label: "คาบ 3", is_break: false },
      { slot_number: 4, start_time: "11:00", end_time: "11:40", slot_label: "คาบ 4", is_break: false },
      { slot_number: 0, start_time: "11:40", end_time: "12:30", slot_label: "พักกลางวัน", is_break: true },
      { slot_number: 0, start_time: "12:30", end_time: "14:00", slot_label: "นอนกลางวัน", is_break: true },
      { slot_number: 5, start_time: "14:00", end_time: "14:30", slot_label: "คาบ 5", is_break: false },
      { slot_number: 0, start_time: "14:30", end_time: "15:00", slot_label: "คาบ 6", is_break: true },
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

function buildRoomSlots(scheduleType: string | undefined, allDbSlots: any[]): any[] {
  const type = scheduleType ?? "primary";
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type) ?? SCHEDULE_TEMPLATES[1];
  return tmpl.slots.map((tmplSlot, idx) => {
    const dbSlot = allDbSlots.find(s => (s.start_time ?? "").slice(0, 5) === tmplSlot.start_time);
    if (dbSlot) {
      return { ...dbSlot, slot_label: tmplSlot.slot_label, is_break: tmplSlot.is_break, end_time: tmplSlot.end_time, slot_number: tmplSlot.slot_number };
    }
    return {
      id: `tmpl-${type}-${idx}-${tmplSlot.start_time.replace(":", "")}`,
      slot_number: tmplSlot.slot_number, start_time: tmplSlot.start_time, end_time: tmplSlot.end_time,
      slot_label: tmplSlot.slot_label, is_break: tmplSlot.is_break, schedule_type: type,
    };
  });
}

// ★ หาเวลาเริ่ม/สิ้นสุดพักกลางวันของตารางแต่ละแบบ (kindergarten/primary/junior/senior) — ใช้เป็นเส้นแบ่งครึ่งวัน
function getLunchBoundary(scheduleType: string | undefined, allTimeSlots: any[]): { start: string; end: string } | null {
  const roomSlots = buildRoomSlots(scheduleType, allTimeSlots);
  const lunch = roomSlots.find((s: any) => s.is_break && s.slot_label?.includes("พักกลางวัน"));
  return lunch ? { start: lunch.start_time, end: lunch.end_time } : null;
}

// ★ เช็คว่า entry นี้อยู่ครึ่งเช้าหรือครึ่งบ่าย เทียบกับเวลาพักกลางวันของห้องนั้นๆ (ห้องต่างชั้นพักไม่พร้อมกัน)
function periodHalfOf(entry: { start_time?: string | null; schedule_type?: string | null }, allTimeSlots: any[]): "morning" | "afternoon" | null {
  if (!entry.start_time) return null;
  const lunch = getLunchBoundary(entry.schedule_type ?? undefined, allTimeSlots);
  if (!lunch) return null;
  const entryMin = toMinutes(entry.start_time);
  const lunchStartMin = toMinutes(lunch.start);
  if (Number.isNaN(entryMin) || Number.isNaN(lunchStartMin)) return null;
  return entryMin < lunchStartMin ? "morning" : "afternoon";
}

function enrichEntries(rawEntries: any[], classroomsMap: Record<string, any>, subjectsMap: Record<string, any>, allTimeSlots: any[]) {
  const slotsCache: Record<string, any[]> = {};
  function getRoomSlots(scheduleType?: string) {
    const key = scheduleType ?? "primary";
    if (!slotsCache[key]) slotsCache[key] = buildRoomSlots(key, allTimeSlots);
    return slotsCache[key];
  }
  return rawEntries.map(e => {
    const room = classroomsMap[e.classroom_id];
    const roomSlots = getRoomSlots(room?.schedule_type);
    const slot = roomSlots.find((s: any) => s.id === e.time_slot_id)
      ?? allTimeSlots.find((s: any) => s.id === e.time_slot_id) ?? null;
    const subject = subjectsMap[e.subject_id];
    return {
      ...e,
      slot_number: slot?.slot_number ?? null,
      slot_label: slot?.slot_label ?? null,
      start_time: slot?.start_time ?? null,
      end_time: slot?.end_time ?? null,
      is_break: slot?.is_break ?? false,
      room_name: room?.room_name ?? null,
      grade_group: room?.grade_group ?? null,
      subject_name: subject?.name_th ?? null,
      subject_code: subject?.subject_code ?? null,
      schedule_type: room?.schedule_type ?? null,
    };
  });
}

function computeSlotHours(slot: any): number {
  if (!slot?.start_time || !slot?.end_time) return 1;
  const [sh, sm] = slot.start_time.split(":").map(Number);
  const [eh, em] = slot.end_time.split(":").map(Number);
  const diffMin = (eh * 60 + em) - (sh * 60 + sm);
  return diffMin > 0 ? Math.round((diffMin / 60) * 100) / 100 : 1;
}

// ★ แปลงชั่วโมง (ทศนิยม) → ข้อความอ่านง่าย: คาบ 50 นาทีแสดง "50 นาที" แทน "0.83 ชม."
// เก็บ hours_count เป็นทศนิยมในฐานข้อมูลเหมือนเดิม (ใช้รวมยอด/คิดเงินได้ถูกต้อง) เปลี่ยนแค่การแสดงผล
function formatHoursDisplay(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "-";
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60} ชม.`;
  if (totalMinutes < 60) return `${totalMinutes} นาที`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} ชม. ${m} นาที`;
}

function computeFreePeriodsForDay(teacherId: string, dow: number, scheduleType: string | undefined, allEntries: TimetableEntry[], allTimeSlots: any[]): number {
  const templateSlots = buildRoomSlots(scheduleType, allTimeSlots).filter((s: any) => !s.is_break);
  const busyStartTimes = new Set(
    allEntries.filter(e => e.day_of_week === dow && (e.teacher_id === teacherId || e.teacher_id_2 === teacherId))
      .map(e => (e.start_time ?? "").slice(0, 5))
  );
  return templateSlots.filter((s: any) => !busyStartTimes.has(s.start_time)).length;
}

// ★ จำนวนคาบที่ครูคนนี้สอนอยู่แล้วในวันนั้น (ไม่นับคาบพัก) — ใช้เตือนถ้าครูสอนแทนจะแน่นเกินไป
const SUB_LOAD_WARN_AT = 5;
function computeTaughtPeriodsForDay(teacherId: string, dow: number, allEntries: TimetableEntry[]): number {
  return allEntries.filter(e =>
    e.day_of_week === dow && !e.is_break && (e.teacher_id === teacherId || e.teacher_id_2 === teacherId)
  ).length;
}
// ★ จำนวนคาบที่ครูคนนี้ "ถูกจัดให้สอนแทน" ไปแล้วในวันนั้น (นับจาก substitution_records จริง ไม่รวมรายการที่ยกเลิก)
function computeSubstituteCountForDay(teacherId: string, date: string, subRecords: SubRecord[]): number {
  return subRecords.filter(r => r.status !== "cancelled" && r.substitute_teacher_id === teacherId && r.substitute_date === date).length;
}

// ★ ภาระรวมของครูในวันนั้น = คาบที่สอนประจำ (ตามตารางสอน) + คาบที่ถูกจัดให้สอนแทนไปแล้ว
function computeTotalLoadForDay(teacherId: string, dow: number, date: string, allEntries: TimetableEntry[], subRecords: SubRecord[]): number {
  return computeTaughtPeriodsForDay(teacherId, dow, allEntries) + computeSubstituteCountForDay(teacherId, date, subRecords);
}

// ★ หาว่าครูคนไหนบ้าง "กำลังสอนแทนคนอื่นอยู่แล้ว" ในวัน+เวลาที่ทับกับคาบนี้
// คืนค่า map: teacherId -> ข้อความเตือน (สอนแทนใครอยู่)
// excludeAbsentId: ไม่นับ record ของครูที่ลาคนเดียวกับที่กำลังจัดอยู่ตอนนี้ (กันเตือนซ้ำตัวเอง)
function computeSubstituteConflictMap(
  entry: TimetableEntry, date: string, subRecords: SubRecord[], allEntries: TimetableEntry[], excludeAbsentId?: string
): Record<string, string> {
  const namesByTeacher: Record<string, string[]> = {};
  subRecords.forEach(r => {
    if (r.status === "cancelled") return;
    if (r.substitute_date !== date) return;
    if (!r.substitute_teacher_id) return;
    if (excludeAbsentId && r.absent_teacher_id === excludeAbsentId) return;
    const linkedEntry = r.timetable_entry_id ? allEntries.find(e => e.id === r.timetable_entry_id) : null;
    if (!linkedEntry) return;
    if (!timeRangesOverlap(entry.start_time, entry.end_time, linkedEntry.start_time, linkedEntry.end_time)) return;
    const absentName = fullName(r.absent_teacher);
    if (!namesByTeacher[r.substitute_teacher_id]) namesByTeacher[r.substitute_teacher_id] = [];
    if (!namesByTeacher[r.substitute_teacher_id].includes(absentName)) namesByTeacher[r.substitute_teacher_id].push(absentName);
  });
  const map: Record<string, string> = {};
  Object.entries(namesByTeacher).forEach(([id, names]) => {
    map[id] = `สอนแทน ${names.join(", ")} อยู่แล้ว (คาบทับกัน)`;
  });
  return map;
}

// ── Print helpers ─────────────────────────────────────────
function printSubOrder(records: SubRecord[], periodLabel: string) {
  const rows = records.map((r,i) => `
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${thaiDate(r.substitute_date)}</td>
      <td>${r.slot_label ?? "—"}</td>
      <td>${r.room_name ?? "—"}</td>
      <td>${r.subject_name ?? "—"}</td>
      <td>${fullName(r.absent_teacher)}</td>
      <td>${fullName(r.substitute_teacher)}</td>
      <td style="text-align:center">${formatHoursDisplay(Number(r.hours_count))}</td>
      <td>${r.note ?? ""}</td>
    </tr>`).join("");

  const w = window.open("","_blank","width=1050,height=780");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { font-family: 'Sarabun','TH SarabunNew',sans-serif; font-size: 14pt; color: #111; }
    h2 { text-align:center; font-size:16pt; margin-bottom:2px; }
    h3 { text-align:center; font-size:14pt; margin-top:2px; margin-bottom:14px; }
    table { width:100%; border-collapse:collapse; font-size:12pt; }
    th { background:#DB2777; color:#fff; padding:6px 8px; font-size:11pt; text-align:left; }
    td { padding:5px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    tr:nth-child(even) td { background:#f8faff; }
    .sign-row { display:flex; justify-content:space-between; margin-top:40px; }
    .sign-box { text-align:center; flex:1; }
    .sign-line { margin:48px auto 6px; width:180px; }
    @media print { button { display:none; } }
  </style></head>
  <body>
    <h2>โรงเรียนวัดเขียนเขต</h2>
    <h3>ใบคำสั่งสอนแทน — ${periodLabel}</h3>
    <table>
      <thead><tr>
        <th style="width:32px">ที่</th>
        <th>วันที่</th><th>คาบ</th><th>ห้อง</th><th>วิชา</th>
        <th>ครูเจ้าของคาบ</th><th>ครูสอนแทน</th>
        <th style="width:50px;text-align:center">ชม.</th><th>หมายเหตุ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign-row">
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>ผู้รับคำสั่ง</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>(นางสาวฐิติมา กาบแก้ว)</div>
        <div>รองผู้อำนวยการกลุ่มบริหารวิชาการ</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div>(นายธนณัฐ ศิระวงษ์)</div>
        <div>ผู้อำนวยการโรงเรียนวัดเขียนเขต</div>
      </div>
    </div>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}
// ★ ตอนพิมพ์ ต้องเรียงจากวันแรก→วันหลัง และคาบ 1-6 เสมอ ไม่ขึ้นกับที่ตารางตั้งไว้
function sortSubsForPrint(records: SubRecord[]): SubRecord[] {
  return [...records].sort((a, b) => {
    if (a.substitute_date !== b.substitute_date) return a.substitute_date < b.substitute_date ? -1 : 1;
    return (a.slot_number ?? 0) - (b.slot_number ?? 0);
  });
}
// ★ ถ้าวันที่สอนแทนผ่านไปแล้ว และยังเป็น "จัดแล้ว" ให้เปลี่ยนเป็น "สอนแทนเรียบร้อย" อัตโนมัติ
// คืนค่ารายการที่อัปเดตแล้ว (สำหรับใช้ใน state ทันที) และยิง update ไป Supabase แบบไม่บล็อก UI
function markPastAssignedAsDone(records: SubRecord[]): SubRecord[] {
  const today = ymd(new Date());
  const idsToMark = records.filter(r => r.status === "assigned" && r.substitute_date < today).map(r => r.id);
  if (idsToMark.length > 0) {
    supabase.from("substitution_records").update({ status: "done" }).in("id", idsToMark)
      .then(({ error }) => { if (error) console.error("[markPastAssignedAsDone] error:", error.message); });
  }
  return records.map(r => (r.status === "assigned" && r.substitute_date < today) ? { ...r, status: "done" } : r);
}

function printTeacherSubStat(records: SubRecord[], users: User[]) {
  const map: Record<string,{name:string;hours:number;count:number}> = {};
  for (const r of records) {
    if (r.status === "cancelled") continue;
    if (!r.substitute_teacher_id) continue;
    if (!map[r.substitute_teacher_id]) {
      map[r.substitute_teacher_id] = { name: fullName(r.substitute_teacher), hours:0, count:0 };
    }
    map[r.substitute_teacher_id].hours += Number(r.hours_count);
    map[r.substitute_teacher_id].count += 1;
  }
  const rows = Object.values(map).sort((a,b)=>b.hours-a.hours).map((t,i)=>`
    <tr>
      <td style="text-align:center">${i+1}</td>
      <td>${t.name}</td>
      <td style="text-align:center">${t.count}</td>
      <td style="text-align:center">${formatHoursDisplay(t.hours)}</td>
    </tr>`).join("");

  const w = window.open("","_blank","width=800,height=640");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    body { font-family:'Sarabun','TH SarabunNew',sans-serif; font-size:14pt; }
    h2,h3 { text-align:center; }
    table { width:100%; border-collapse:collapse; font-size:12pt; margin-top:16px; }
    th { background:#DB2777; color:#fff; padding:6px 8px; }
    td { padding:5px 8px; border-bottom:1px solid #e2e8f0; }
    tr:nth-child(even)td { background:#f8faff; }
    @media print { button{display:none} }
  </style></head>
  <body>
    <h2>โรงเรียนวัดเขียนเขต</h2>
    <h3>สถิติการสอนแทน (เพื่อคิดขั้นเงินเดือน)</h3>
    <table><thead><tr>
      <th style="width:40px">ที่</th><th>ชื่อ-นามสกุล</th>
      <th>จำนวนครั้ง</th><th>รวมชั่วโมง</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════
// ── TeacherSearchSelect — เลือกครูแบบพิมพ์ค้นหาได้
// ══════════════════════════════════════════════════════════
function TeacherSearchSelect({ teachers, value, onChange, placeholder = "— เลือกครู —", loadMap, warnAt = SUB_LOAD_WARN_AT, conflictMap }: {
  teachers: User[]; value: string; onChange: (id: string) => void; placeholder?: string;
  loadMap?: Record<string, number>; warnAt?: number;
  // ★ conflictMap: teacherId -> ข้อความเตือนว่ากำลังสอนแทนคนอื่นอยู่แล้วในคาบที่ทับกัน
  conflictMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = teachers.find(t => t.id === value);
  const filtered = teachers.filter(t => fullName(t).toLowerCase().includes(search.toLowerCase()));

  function LoadBadge({ teacherId }: { teacherId: string }) {
    if (!loadMap) return null;
    const n = loadMap[teacherId] ?? 0;
    const overloaded = n >= warnAt;
    return (
      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
        overloaded ? "bg-red-50 text-red-600 border-red-200" : "bg-[#FCE7F3] text-[#64748B] border-transparent"
      }`}>
        {overloaded ? `⚠️ รวม ${n} คาบ` : `รวม ${n} คาบ`}
      </span>
    );
  }

  function handlePick(t: User) {
    const conflict = conflictMap?.[t.id];
    if (conflict) {
      const ok = confirm(`⚠️ ${fullName(t)} ${conflict}\n\nต้องการเลือกครูคนนี้ต่อไปหรือไม่?`);
      if (!ok) return;
    }
    onChange(t.id);
    setOpen(false);
    setSearch("");
  }

  const selectedConflict = selected ? conflictMap?.[selected.id] : undefined;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`w-full text-left border-2 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none flex items-center justify-between gap-2 ${
          selectedConflict ? "border-red-300 focus:border-red-500" : "border-[#F9A8D4] focus:border-[#DB2777]"
        }`}>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${selected ? "font-bold text-slate-800" : "text-slate-400"}`}>
            {selected ? fullName(selected) : placeholder}
          </span>
          {selected && <LoadBadge teacherId={selected.id} />}
        </span>
        <span className="text-slate-400 text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {selectedConflict && (
        <p className="text-[11px] text-red-600 font-bold mt-1">⚠️ {selectedConflict}</p>
      )}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-[#F9A8D4] rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-[#FCE7F3]">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 พิมพ์ชื่อ..." autoFocus onClick={e => e.stopPropagation()}
              className="w-full bg-[#FDF2F8] border border-[#FBCFE8] rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                className="w-full px-4 py-2 text-left text-xs text-red-500 font-bold hover:bg-red-50">✕ ล้างค่าที่เลือก</button>
            )}
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-slate-400 text-sm text-center">ไม่พบชื่อ</div>
            ) : filtered.map(t => {
              const conflict = conflictMap?.[t.id];
              return (
                <button key={t.id} type="button" onClick={() => handlePick(t)}
                  className={`w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-[#FDF2F8] flex items-center justify-between gap-2 ${t.id === value ? "bg-[#FDF2F8]" : ""}`}>
                  <span className="min-w-0 truncate">
                    <span className="font-bold text-slate-800">{fullName(t)}</span>
                    {t.position && <span className="text-slate-400 text-xs ml-2">{t.position}</span>}
                    {conflict && <span className="block text-[10px] text-red-500 font-bold mt-0.5">⚠️ {conflict}</span>}
                  </span>
                  <LoadBadge teacherId={t.id} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── SwapRequestModal — เขียนใหม่ทั้งหมด ─────────────────────
// 1) วันที่อยู่ช่องแรกและใช้กรองคาบจริง (เดิมไม่กรอง)
// 2) คาบของฉันวันนั้นแสดงเป็นตารางกดเลือก (เทา -> น้ำเงินเมื่อเลือก)
// 3) รายชื่อครูที่ว่าง เรียงตามกฎ: ครูประจำชั้น(ป.1/ป.2) -> สายชั้นเดียวกัน
//    (คาบว่างเยอะสุดก่อน, เท่ากันดูสถิติสอนแทนน้อยสุดก่อน) -> วิชาเดียวกัน -> ที่เหลือ
// ══════════════════════════════════════════════════════════
function SwapRequestModal({
  user, allEntries, allTeachers, allTimeSlots, academicYearId, homeroomMap,
  initialReason: initialReasonProp, mode: modeProp = "normal",
  fixedTargetTeacherId: fixedTargetTeacherIdProp,
  editingRequest, onSave, onClose,
}: {
  user: User; allEntries: TimetableEntry[]; allTeachers: User[]; allTimeSlots: any[]; academicYearId: string;
  homeroomMap: Record<string, string>;
  initialReason?: string; mode?: "normal" | "repay"; fixedTargetTeacherId?: string;
  editingRequest?: SwapRequest | null;
  onSave: () => void; onClose: () => void;
}) {
  const isEditing = !!editingRequest;
  // ★ ถ้าเป็นแก้ไข ให้เดา mode/target จาก record เดิม (เจาะจงกลับให้/ปกติ เก็บอยู่ในตารางเดียวกัน)
  const mode: "normal" | "repay" = isEditing
    ? (editingRequest!.reason?.includes("ขอแลกคาบคืนให้") ? "repay" : "normal")
    : modeProp;
  const fixedTargetTeacherId = isEditing ? editingRequest!.target_teacher_id : fixedTargetTeacherIdProp;
  const initialReason = isEditing ? (editingRequest!.reason ?? "") : initialReasonProp;

  const [swapDate, setSwapDate] = useState(() => editingRequest?.swap_date ?? ymd(new Date()));
  const [selectedEntry, setSelectedEntry] = useState<TimetableEntry | null>(() =>
    editingRequest ? allEntries.find(e => e.id === editingRequest.requester_entry_id) ?? null : null
  );
  const [pickedTeacherId, setPickedTeacherId] = useState(() =>
    editingRequest && mode === "normal" ? editingRequest.target_teacher_id : ""
  );
  const [reason, setReason] = useState(initialReason ?? "");
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [onLeaveIds, setOnLeaveIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const dow = swapDate ? dowOf(swapDate) : null;
  const didInitRef = useRef(false); // ★ กันไม่ให้ useEffect ล้างค่าที่โหลดมาแก้ไขตอน mount ครั้งแรก

  // ★ โหมด repay: หา user ของครูที่เราจะแลกคาบคืนให้ (ครูที่เคยสอนแทนเรา)
  const targetTeacher = useMemo(
    () => (mode === "repay" ? allTeachers.find(t => t.id === fixedTargetTeacherId) ?? null : null),
    [mode, allTeachers, fixedTargetTeacherId]
  );

  // ★ ตารางสอนของครูคนนั้นในวันที่เลือก (โหมด repay)
  const targetDayEntries = useMemo(() =>
    (mode !== "repay" || dow === null || !fixedTargetTeacherId) ? [] : allEntries.filter(e =>
      (e.teacher_id === fixedTargetTeacherId || e.teacher_id_2 === fixedTargetTeacherId) && e.day_of_week === dow && !e.is_break
    ).sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0))
  , [mode, allEntries, dow, fixedTargetTeacherId]);

  // ★ คาบของเราเองในวันเดียวกัน (ใช้เช็คว่าง/ไม่ว่างจริง แบบเทียบเวลาทับกัน)
  const myBusyEntriesThatDay = useMemo(() =>
    (dow === null) ? [] : allEntries.filter(e =>
      (e.teacher_id === user.id || e.teacher_id_2 === user.id) && e.day_of_week === dow && !e.is_break
    )
  , [allEntries, dow, user.id]);

  function amIFreeAt(entry: TimetableEntry) {
    return !myBusyEntriesThatDay.some(e => timeRangesOverlap(entry.start_time, entry.end_time, e.start_time, e.end_time));
  }

  const myDayEntries = useMemo(() =>
    (dow === null ? [] : allEntries.filter(e =>
      (e.teacher_id === user.id || e.teacher_id_2 === user.id) && e.day_of_week === dow && !e.is_break
    )).sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0))
  , [allEntries, dow, user.id]);

  // ★ โหลดครูที่ลาวันนั้น ทุกครั้งที่เปลี่ยนวันที่
  useEffect(() => {
  const isFirstRun = !didInitRef.current;
  didInitRef.current = true;
  if (!(isEditing && isFirstRun)) {
    setSelectedEntry(null); setPickedTeacherId("");
  }
  if (!swapDate) return;
  setLoadingMeta(true);
  (async () => {
    const { data: leaves } = await supabase.from("leave_requests")
  .select(`*,user:users!user_id(id,first_name,last_name,title,role)`)
      .in("status", ["pending", "approved"]);
    const ids = new Set<string>();
    (leaves || []).forEach((l: any) => { if (l.start_date <= swapDate && l.end_date >= swapDate) ids.add(l.user_id); });
    setOnLeaveIds(ids);
    setLoadingMeta(false);
  })();
}, [swapDate]);

// ★ หาเวลาเริ่มพักกลางวันของตารางแต่ละแบบ (kindergarten/primary/junior/senior) — ใช้เป็นเส้นแบ่งครึ่งวัน
function getLunchBoundary(scheduleType: string | undefined, allTimeSlots: any[]): { start: string; end: string } | null {
  const roomSlots = buildRoomSlots(scheduleType, allTimeSlots);
  const lunch = roomSlots.find((s: any) => s.is_break && s.slot_label?.includes("พักกลางวัน"));
  if (!lunch) {
    console.warn(`[getLunchBoundary] ไม่พบคาบพักกลางวันสำหรับ schedule_type="${scheduleType}" — จะไม่กรองคาบครึ่งวันสำหรับคาบนี้ (โชว์ไว้ทั้งหมด)`);
    return null;
  }
  return { start: lunch.start_time, end: lunch.end_time };
}

// ★ เช็คว่า entry นี้อยู่ครึ่งเช้าหรือครึ่งบ่าย เทียบกับเวลาพักกลางวันของห้องนั้นๆ (ห้องต่างชั้นพักไม่พร้อมกัน)
function periodHalfOf(entry: { start_time?: string | null; schedule_type?: string | null }, allTimeSlots: any[]): "morning" | "afternoon" | null {
  if (!entry.start_time) return null;
  const lunch = getLunchBoundary(entry.schedule_type ?? undefined, allTimeSlots);
  if (!lunch) return null;
  return entry.start_time < lunch.start ? "morning" : "afternoon";
}

  // ★ ครูที่ว่าง — เรียงลำดับแบบเดียวกับตอนแอดมินจัดสอนแทน (สายชั้นเดียวกันก่อน) + โชว์จำนวนคาบ
  const candidateTeachers = useMemo(() => {
    if (!selectedEntry || dow === null) return [] as User[];
    const free = computeFreeTeachersForEntry(selectedEntry, swapDate, allEntries, allTeachers, user.id)
      .filter(t => !onLeaveIds.has(t.id));
    return sortTeachersByGrade(free, selectedEntry, user, allEntries, homeroomMap);
  }, [selectedEntry, dow, swapDate, allEntries, allTeachers, user, onLeaveIds, homeroomMap]);

  const candidateLoadMap = useMemo(() => {
    if (dow === null) return {} as Record<string, number>;
    return Object.fromEntries(candidateTeachers.map(t => [t.id, computeTaughtPeriodsForDay(t.id, dow, allEntries)]));
  }, [candidateTeachers, dow, allEntries]);

  const validate = () => {
    const e: Record<string,boolean> = {};
    if (!swapDate) e.swapDate = true;
    if (!selectedEntry) e.selectedEntry = true;
    if (mode !== "repay" && !pickedTeacherId) e.pickedTeacherId = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
  if (!validate()) return;
  setSaving(true);
  const targetId = mode === "repay" ? fixedTargetTeacherId! : pickedTeacherId;

  if (isEditing) {
    // ★ แก้ไขคำขอเดิม — เปลี่ยนกลับเป็น pending ให้อีกฝ่ายคอนเฟิร์มใหม่เสมอ เพราะเนื้อหาเปลี่ยน
    const { error } = await supabase.from("class_swap_requests").update({
      target_teacher_id: targetId,
      requester_entry_id: selectedEntry!.id,
      swap_date: swapDate,
      reason,
      status: "pending",
      responded_at: null,
    }).eq("id", editingRequest!.id);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    const targetT = allTeachers.find(t => t.id === targetId);
    notifyTeams(targetT?.email, `✏️ ${fullName(user)} แก้ไขคำขอแลกคาบ วันที่ ${thaiDate(swapDate)} คาบ ${selectedEntry?.slot_label ?? "-"} — กรุณาตรวจสอบและตอบรับอีกครั้ง`);
    onSave();
    return;
  }

  const { error } = await supabase.from("class_swap_requests").insert([{
    requester_id: user.id, target_teacher_id: targetId,
    requester_entry_id: selectedEntry!.id, target_entry_id: null,
    swap_date: swapDate, reason, status: "pending", academic_year_id: academicYearId,
  }]);
  setSaving(false);
  if (error) { alert("❌ "+error.message); return; }
  const targetT = allTeachers.find(t => t.id === targetId);
  notifyTeams(targetT?.email, `🔄 ${fullName(user)} ขอแลกคาบกับคุณ วันที่ ${thaiDate(swapDate)} คาบ ${selectedEntry?.slot_label ?? "-"} — กรุณาเข้าไปตอบรับในระบบ`);
  onSave();
};

  const iCls = (err?: boolean) =>
    `w-full border-2 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors bg-white
    ${err ? "border-red-400 bg-red-50" : "border-[#F9A8D4] focus:border-[#DB2777] text-slate-800"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">
  {isEditing
    ? "✏️ แก้ไขคำขอแลกคาบ"
    : mode === "repay" ? `🔄 ขอแลกคาบคืนให้ ${fullName(targetTeacher)}` : "🔄 ขอแลกคาบสอน"}
</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* ★ 1) วันที่ต้องการแลก — ช่องแรก */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              วันที่ต้องการแลก <span className="text-red-400">*</span>
            </label>
            <input type="date" value={swapDate} onChange={e=>setSwapDate(e.target.value)} className={iCls(errors.swapDate)} />
          </div>

          {/* ★ 2) คาบของฉันวันนั้น — ตารางกดเลือก เทา -> น้ำเงิน */}
          {swapDate && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {mode === "repay"
                  ? `ตารางสอนของครู ${fullName(targetTeacher)} ในวัน${TH_DAYS[dow!]} — กดเลือกคาบที่คุณจะขอสอนแทน`
                  : `คาบของฉันในวัน${TH_DAYS[dow!]} — กดเลือกคาบที่ต้องการแลก`
                } <span className="text-red-400">*</span>
              </label>

              {mode === "repay" ? (
                targetDayEntries.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center bg-[#FDF2F8] rounded-xl border border-[#FBCFE8]">
                    ครู{fullName(targetTeacher)}ไม่มีคาบสอนในวันนี้ กรุณาเปลี่ยนวันที่
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {targetDayEntries.map(e => {
                      const free = amIFreeAt(e);
                      const active = selectedEntry?.id === e.id;
                      return (
                        <button key={e.id} type="button" disabled={!free}
                          onClick={() => { if (free) setSelectedEntry(e); }}
                          className={`p-2.5 rounded-xl border-2 text-[11px] font-bold text-left transition-all ${
                            !free
                              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                              : active
                                ? "bg-[#DB2777] border-[#DB2777] text-white"
                                : "bg-white border-[#F9A8D4] text-slate-700 hover:bg-[#FDF2F8]"
                          }`}>
                          <div className="flex justify-between"><span>{e.slot_label}</span><span className="opacity-70">{e.start_time?.slice(0,5)}</span></div>
                          <div className="truncate mt-0.5">{e.subject_name ?? "ไม่ระบุวิชา"}</div>
                          <div className={`truncate ${active ? "opacity-80" : "text-slate-400"}`}>{e.room_name ?? ""}</div>
                          {!free && <div className="text-[10px] font-bold mt-0.5">🔒 คุณมีคาบสอนตรงนี้</div>}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                myDayEntries.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center bg-[#FDF2F8] rounded-xl border border-[#FBCFE8]">ไม่มีคาบสอนของคุณในวันนี้</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {myDayEntries.map(e => {
                      const active = selectedEntry?.id === e.id;
                      return (
                        <button key={e.id} type="button"
                          onClick={() => { setSelectedEntry(e); setPickedTeacherId(""); }}
                          className={`p-2.5 rounded-xl border-2 text-[11px] font-bold text-left transition-all ${
                            active ? "bg-[#DB2777] border-[#DB2777] text-white" : "bg-[#FCE7F3] border-[#FBCFE8] text-slate-600 hover:bg-[#FBCFE8]"
                          }`}>
                          <div className="flex justify-between"><span>{e.slot_label}</span><span className="opacity-70">{e.start_time?.slice(0,5)}</span></div>
                          <div className="truncate mt-0.5">{e.subject_name ?? "ไม่ระบุวิชา"}</div>
                          <div className={`truncate ${active ? "opacity-80" : "text-slate-400"}`}>{e.room_name ?? ""}</div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
              {errors.selectedEntry && <p className="text-xs text-red-500 mt-1">กรุณาเลือกคาบ</p>}
            </div>
          )}

          {/* ★ 3) รายชื่อครูที่ว่าง — เรียงแบบเดียวกับหน้าแอดมิน + โชว์จำนวนคาบ */}
          {selectedEntry && (
            mode === "repay" ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1.5">สรุปคำขอแลกคาบคืน</p>
                <p className="text-sm text-slate-700">ครูเจ้าของคาบเดิม: <span className="font-bold text-[#DB2777]">{fullName(targetTeacher)}</span></p>
                <p className="text-sm text-slate-700 mt-1">คุณจะสอนแทนคาบนี้เอง: <span className="font-bold text-emerald-700">{fullName(user)} (คุณ)</span></p>
                <p className="text-xs text-slate-400 mt-2">💡 คำขอนี้จะถูกส่งไปให้ {fullName(targetTeacher)} กดยืนยันในแท็บ "🔄 แลกคาบ" ก่อน จึงจะมีผล</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  เลือกครูที่จะขอให้สอนแทน <span className="text-red-400">*</span>
                </label>
                {loadingMeta ? (
                  <p className="text-xs text-slate-400">⏳ กำลังตรวจสอบครูที่ว่าง...</p>
                ) : candidateTeachers.length === 0 ? (
                  <p className="text-xs text-red-500 font-bold">ไม่พบครูที่ว่างในคาบนี้</p>
                ) : (
                  <TeacherSearchSelect
                    teachers={candidateTeachers}
                    value={pickedTeacherId}
                    onChange={setPickedTeacherId}
                    placeholder="— เลือกครูที่จะขอให้สอนแทน —"
                    loadMap={candidateLoadMap}
                  />
                )}
                {errors.pickedTeacherId && <p className="text-xs text-red-500 mt-1">กรุณาเลือกครู</p>}
              </div>
            )
          )}

          {/* เหตุผล */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เหตุผล</label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
              placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)" className={iCls()+" resize-none"} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end shrink-0 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm font-medium">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังส่ง..." : "📤 ส่งคำขอ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AssignSubModal ──────────────────────────────────────────
function AssignSubModal({ leaveRequest, teachers, entries, subRecords, academicYearId, currentUser, homeroomMap, restrictDates, allTimeSlots, onSave, onClose }: {
  leaveRequest: LeaveRequest; teachers: User[];
  entries: TimetableEntry[]; subRecords: SubRecord[]; academicYearId: string;
  currentUser: User; homeroomMap: Record<string, string>; restrictDates?: string[];
  allTimeSlots: any[];   // ★ เพิ่ม
  onSave: () => void; onClose: () => void;
}) {
  const absentId = leaveRequest.user_id;
  // ★ ถ้าลาครึ่งวัน กรองเฉพาะคาบที่อยู่ในครึ่งวันนั้นเท่านั้น — ถ้าไม่ใช่ครึ่งวัน (null) โชว์ทั้งวันเหมือนเดิม
  const absentEntries = entries
  .filter(e => e.teacher_id === absentId || e.teacher_id_2 === absentId)
  .filter(e => {
    if (!leaveRequest.half_day) return true; // ลาเต็มวัน โชว์หมด
    const half = periodHalfOf(e, allTimeSlots);
    if (half === null) return true; // ★ จำแนกไม่ได้ (หา lunch boundary ไม่เจอ) → ไม่กรองทิ้ง โชว์ไว้ก่อน ให้แอดมินตัดสินใจเอง
    return half === leaveRequest.half_day;
  });
  const absentTeacher = useMemo(
  () => teachers.find(t => t.id === absentId) ?? null,
  [teachers, absentId]
);
  const leaveDates: string[] = (restrictDates && restrictDates.length > 0) ? restrictDates : getLeaveWeekdayDates(leaveRequest);

  const [assignments, setAssignments] = useState<Record<string, string>>(
    () => Object.fromEntries(absentEntries.flatMap(e =>
      leaveDates.map(dt => [`${e.id}_${dt}`, ""])
    ))
  );
  const [saving, setSaving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  function setAsgn(key: string, val: string) {
    setAssignments(prev => ({ ...prev, [key]: val }));
  }

  // ★ จำนวนคาบที่ครูแต่ละคนสอนอยู่แล้วในวันนั้น (นับตารางสอนจริง + คาบที่เพิ่งจัดในหน้าต่างนี้)
  function dayLoadMap(date: string, candidates: User[]): Record<string, number> {
    const dow = dowOf(date);
    const map: Record<string, number> = {};
    for (const t of candidates) {
      const base = computeTotalLoadForDay(t.id, dow, date, entries, subRecords);
      const extra = Object.entries(assignments).filter(([k, subId]) => subId === t.id && k.endsWith(`_${date}`)).length;
      map[t.id] = base + extra;
    }
    return map;
  }

  // ★ จัดอัตโนมัติ — เลือกครูว่างที่มีภาระคาบวันนั้นน้อยที่สุดให้ทุกคาบที่ยังไม่ได้จัด
  function autoAssignAll() {
    setAutoRunning(true);
    const next: Record<string, string> = { ...assignments };
    const tally: Record<string, number> = {}; // `${teacherId}_${date}`
    let total = 0, newlyFilled = 0, unfilled = 0;
    for (const date of leaveDates) {
      const dow = dowOf(date);
      const dayEntries = absentEntries.filter(e => e.day_of_week === dow && !e.is_break);
      for (const entry of dayEntries) {
  const key = `${entry.id}_${date}`;
  if (coTeacherId(entry, absentId)) continue; // ★ มีครูคู่สอนอยู่แล้ว ไม่ต้องจัด ไม่ต้องนับ
  total++;
  if (next[key]) continue;
  const conflictMapForEntry = computeSubstituteConflictMap(entry, date, subRecords, entries, absentId);
  const candidatesAll = computeFreeTeachersForEntry(entry, date, entries, teachers, absentId);
  const candidates = candidatesAll.filter(t => !conflictMapForEntry[t.id]); // ★ กันจัดซ้ำ ครูที่สอนแทนคนอื่นอยู่แล้วในคาบทับกัน
        if (candidates.length === 0) { unfilled++; continue; }
        const scored = candidates.map(t => {
          const tKey = `${t.id}_${date}`;
          const load = computeTotalLoadForDay(t.id, dow, date, entries, subRecords) + (tally[tKey] ?? 0);
          const priority = substitutePriority(t, entry, absentTeacher, entries, homeroomMap);
          return { t, load, priority };
        }).sort((a, b) => a.priority - b.priority || a.load - b.load || fullName(a.t).localeCompare(fullName(b.t), "th"));
        const pick = scored[0].t;
        next[key] = pick.id;
        const tKey = `${pick.id}_${date}`;
        tally[tKey] = (tally[tKey] ?? 0) + 1;
        newlyFilled++;
      }
    }
    setAssignments(next);
    setAutoRunning(false);
    if (newlyFilled === 0 && unfilled === 0) {
      alert("ทุกคาบถูกจัดครูไว้แล้ว");
    } else if (unfilled > 0) {
      alert(`⚡ จัดอัตโนมัติสำเร็จ ${newlyFilled} คาบ\n⚠️ เหลือ ${unfilled} คาบที่ไม่มีครูว่าง (หรือครูที่ว่างกำลังสอนแทนคนอื่นในคาบเดียวกันอยู่แล้ว) กรุณาเลือกเอง`);
    } else {
      alert(`⚡ จัดอัตโนมัติสำเร็จครบ ${newlyFilled} คาบ`);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    const records = Object.entries(assignments)
      .filter(([,v]) => v)
      .map(([key, subId]) => {
        const [entryId, date] = key.split("_");
        const entry = absentEntries.find(e => e.id === entryId);
        return {
          leave_request_id: leaveRequest.id,
          original_teacher_id: absentId,
          absent_teacher_id: absentId,
          substitute_teacher_id: subId,
          timetable_entry_id: entryId,
          substitute_date: date,
          time_slot_id: entry?.time_slot_id,
          classroom_id: entry?.classroom_id,
          subject_id: entry?.subject_id,
          hours_count: computeSlotHours(entry),
          assigned_by: currentUser.id,
          status: "assigned",
          academic_year_id: academicYearId,
          note: "จัดโดยแอดมิน (หน้าแลกคาบ)",
        };
      });
    if (records.length === 0) { alert("กรุณาเลือกครูสอนแทนอย่างน้อย 1 คาบ"); setSaving(false); return; }
    const { error } = await supabase.from("substitution_records").insert(records);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }

    // ★ แจ้งเตือน Teams ให้ครูที่ถูกจัดสอนแทนทุกคน (ไม่ซ้ำคน)
    const uniqueSubTeacherIds = [...new Set(records.map(r => r.substitute_teacher_id))];
    uniqueSubTeacherIds.forEach(id => {
      const t = teachers.find(x => x.id === id);
      const countForThisTeacher = records.filter(r => r.substitute_teacher_id === id).length;
      notifyTeams(t?.email, `📋 คุณถูกจัดให้สอนแทน ${fullName(absentTeacher)} จำนวน ${countForThisTeacher} คาบ กรุณาตรวจสอบตารางในระบบ`);
    });

    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 text-base">📋 จัดครูสอนแทน</h3>
            <p className="text-sm text-slate-500">{fullName(leaveRequest.user)} ลา {thaiDate(leaveRequest.start_date)}
              {leaveRequest.start_date !== leaveRequest.end_date ? ` – ${thaiDate(leaveRequest.end_date)}` : ""}
              {" "}({leaveRequest.days_count} วัน)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {absentEntries.length > 0 && (
              <button onClick={autoAssignAll} disabled={autoRunning}
                className="px-3 py-2 rounded-xl bg-[#FB7185] hover:bg-[#BE185D] text-[#9D174D] text-xs font-bold disabled:opacity-50 whitespace-nowrap">
                ⚡ จัดอัตโนมัติ
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500 shrink-0">✕</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {absentEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของครูคนนี้</div>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-[#9D174D] bg-[#FDF2F8] border border-[#F9A8D4] rounded-xl px-3 py-2">
                💡 ปุ่ม "⚡ จัดอัตโนมัติ" จะเลือกครูที่ว่างและมีคาบสอนวันนั้นน้อยที่สุดให้ทุกคาบที่ยังไม่ได้จัด — ตัวเลข "X คาบ" ข้างชื่อครูคือจำนวนคาบที่ครูสอนอยู่แล้วในวันนั้น ถ้าครบ {SUB_LOAD_WARN_AT} คาบจะมี ⚠️ เตือนให้พิจารณาก่อนเลือก
              </p>
              {leaveDates.map(date => {
  const dayOfWeek = new Date(date+"T00:00:00").getDay();
  const dayEntries = absentEntries
    .filter(e => e.day_of_week === dayOfWeek && !e.is_break)
    .sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0));
  if (dayEntries.length === 0) return null;
                return (
                  <div key={date}>
                    <h4 className="font-bold text-slate-700 text-sm mb-3 pb-2 border-b border-[#FBCFE8]">
                      📅 {TH_DAYS[dayOfWeek]} {thaiDate(date)}
                    </h4>
                    <div className="space-y-2">
                      {dayEntries.map(entry => {
  const key = `${entry.id}_${date}`;
  const coId = coTeacherId(entry, absentId);
  const coTeacher = coId ? teachers.find(t => t.id === coId) : null;

  // ★ มีครูอีกคนสอนคู่อยู่ในคาบนี้แล้ว — ไม่ต้องจัดสอนแทน แค่โชว์ให้เห็น
  if (coTeacher) {
    return (
      <div key={key} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div className="shrink-0 text-center w-16">
          <div className="text-xs font-bold text-emerald-600">{entry.slot_label}</div>
          <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
          <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold text-emerald-600">👥 มีครูสอนคู่อยู่แล้ว</p>
          <p className="text-sm font-bold text-emerald-800">{fullName(coTeacher)}</p>
        </div>
      </div>
    );
  }

  return (
    <div key={key} className="flex items-center gap-3 bg-[#FDF2F8] rounded-xl px-4 py-3">
      <div className="shrink-0 text-center w-16">
        <div className="text-xs font-bold text-[#DB2777]">{entry.slot_label}</div>
        <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
        <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
      </div>
      <div className="shrink-0 w-72 sm:w-80">
        <TeacherSearchSelect
          teachers={sortTeachersByGrade(
            computeFreeTeachersForEntry(entry, date, entries, teachers, absentId),
            entry, absentTeacher, entries, homeroomMap
          )}
          value={assignments[key] || ""}
          onChange={id => setAsgn(key, id)}
          placeholder="— เลือกครูสอนแทน —"
          loadMap={dayLoadMap(date, computeFreeTeachersForEntry(entry, date, entries, teachers, absentId))}
          conflictMap={computeSubstituteConflictMap(entry, date, subRecords, entries, absentId)}
        />
      </div>
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
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end shrink-0 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการสอนแทน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── ManualAssignModal — จัดสอนแทนทันทีไม่ต้องรอใบลา (ลาผ่าตัด/ลายาว)
// ══════════════════════════════════════════════════════════
function ManualAssignModal({ selectableTeachers, allTeachers, entries, subRecords, academicYearId, currentUser, homeroomMap, onSave, onClose }: {
  selectableTeachers: User[]; allTeachers: User[]; entries: TimetableEntry[]; subRecords: SubRecord[]; academicYearId: string;
  currentUser: User; homeroomMap: Record<string, string>; onSave: () => void; onClose: () => void;
}) {
  const [absentTeacherId, setAbsentTeacherId] = useState("");
  const [startDate, setStartDate] = useState(ymd(new Date()));
  const [endDate, setEndDate] = useState(ymd(new Date()));
  const [reason, setReason] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const absentEntries = useMemo(() =>
  absentTeacherId ? entries.filter(e => (e.teacher_id === absentTeacherId || e.teacher_id_2 === absentTeacherId) && !e.is_break) : []
, [entries, absentTeacherId]);
const absentTeacher = useMemo(
  () => allTeachers.find(t => t.id === absentTeacherId) ?? null,
  [allTeachers, absentTeacherId]
);
  const leaveDates = useMemo(() => {
    if (!absentTeacherId || !startDate || !endDate || startDate > endDate) return [] as string[];
    const dates: string[] = [];
    let d = new Date(startDate + "T00:00:00");
    const last = new Date(endDate + "T00:00:00");
    while (d <= last) {
      if (d.getDay() >= 1 && d.getDay() <= 5) dates.push(ymd(d));
      d = addDays(d, 1);
    }
    return dates;
  }, [absentTeacherId, startDate, endDate]);

  useEffect(() => { setAssignments({}); }, [absentTeacherId, startDate, endDate]);

  function setAsgn(key: string, val: string) {
    setAssignments(prev => ({ ...prev, [key]: val }));
  }

  // ★ จำนวนคาบรวมของครู = ตารางสอนจริง + สอนแทนไปแล้วใน subRecords + คาบที่กำลังจัดในเซสชันนี้ (ยังไม่กดบันทึก)
  function sessionExtraLoad(teacherId: string, date: string): number {
    return Object.entries(assignments).filter(([k, subId]) => subId === teacherId && k.endsWith(`_${date}`)).length;
  }
  function dayLoadMapManual(date: string, candidates: User[]): Record<string, number> {
    const dow = dowOf(date);
    const map: Record<string, number> = {};
    for (const t of candidates) {
      map[t.id] = computeTotalLoadForDay(t.id, dow, date, entries, subRecords) + sessionExtraLoad(t.id, date);
    }
    return map;
  }

  // ★ สุ่มเลือกครูสอนแทน — จากครูสายชั้นเดียวกับครูที่ลา ที่ว่างตรงคาบ และมีคาบสอนวันนั้นน้อยที่สุด (นับรวมคาบที่กำลังจัดในเซสชันนี้ด้วย)
  function randomAssignTeacher(key: string, entry: TimetableEntry, date: string) {
    const dow = dowOf(date);
    const candidatesAll = computeFreeTeachersForEntry(entry, date, entries, allTeachers, absentTeacherId);
    const conflictMapForEntry = computeSubstituteConflictMap(entry, date, subRecords, entries, absentTeacherId);
    const candidates = candidatesAll.filter(t => !conflictMapForEntry[t.id]);
    if (candidates.length === 0) { alert("⚠️ ไม่มีครูว่างในคาบนี้ (หรือครูที่ว่างกำลังสอนแทนคนอื่นในคาบเดียวกันอยู่แล้ว)"); return; }
    const bestPriority = Math.min(...candidates.map(t => substitutePriority(t, entry, absentTeacher, entries, homeroomMap)));
    const pool = candidates.filter(t => substitutePriority(t, entry, absentTeacher, entries, homeroomMap) === bestPriority);
    const scored = pool.map(t => ({ t, load: computeTotalLoadForDay(t.id, dow, date, entries, subRecords) + sessionExtraLoad(t.id, date) }));
    const minLoad = Math.min(...scored.map(s => s.load));
    const minPool = scored.filter(s => s.load === minLoad).map(s => s.t);
    const pick = minPool[Math.floor(Math.random() * minPool.length)];
    setAsgn(key, pick.id);
  }

  const handleSave = async () => {
    if (!absentTeacherId) { alert("กรุณาเลือกครูที่ลา"); return; }
    if (leaveDates.length === 0) { alert("กรุณาเลือกช่วงวันที่ให้ถูกต้อง"); return; }
    setSaving(true);
    const records = Object.entries(assignments)
      .filter(([, v]) => v)
      .map(([key, subId]) => {
        const [entryId, date] = key.split("_");
        const entry = absentEntries.find(e => e.id === entryId);
        return {
          leave_request_id: null,
          original_teacher_id: absentTeacherId,
          absent_teacher_id: absentTeacherId,
          substitute_teacher_id: subId,
          timetable_entry_id: entryId,
          substitute_date: date,
          time_slot_id: entry?.time_slot_id,
          classroom_id: entry?.classroom_id,
          subject_id: entry?.subject_id,
          hours_count: computeSlotHours(entry),
          assigned_by: currentUser.id,
          status: "assigned",
          academic_year_id: academicYearId,
          note: `จัดโดยแอดมิน (ลาต่อเนื่อง/ไม่มีใบลาในระบบ)${reason ? " — " + reason : ""}`,
        };
      });
    if (records.length === 0) { alert("กรุณาเลือกครูสอนแทนอย่างน้อย 1 คาบ"); setSaving(false); return; }
    const { error } = await supabase.from("substitution_records").insert(records);
    setSaving(false);
    if (error) { alert("❌ " + error.message); return; }
    const uniqueSubTeacherIds = [...new Set(records.map(r => r.substitute_teacher_id))];
    uniqueSubTeacherIds.forEach(id => {
      const t = allTeachers.find(x => x.id === id);
      const countForThisTeacher = records.filter(r => r.substitute_teacher_id === id).length;
      notifyTeams(t?.email, `📋 คุณถูกจัดให้สอนแทน ${fullName(absentTeacher)} จำนวน ${countForThisTeacher} คาบ กรุณาตรวจสอบตารางในระบบ`);
    });
    onSave();
  };

  return (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
    <div className="bg-white w-full max-w-[96vw] h-full max-h-[95vh] rounded-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">⚡ จัดสอนแทนทันที (ไม่ต้องรอใบลา)</h3>
            <p className="text-sm text-slate-500">สำหรับกรณีลาผ่าตัด/ลายาว — เลือกครู + ช่วงวันที่แล้วจัดสอนแทนได้เลย</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ครูที่ลา *</label>
  <TeacherSearchSelect
    teachers={selectableTeachers.filter(isSelectableTeacher)}
    value={absentTeacherId}
    onChange={setAbsentTeacherId}
    placeholder="— เลือกครู —"
  />
  {selectableTeachers.length === 0 && (
    <p className="text-xs text-amber-600 font-bold mt-1">ไม่พบครูในสิทธิ์ของคุณ</p>
  )}
</div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">วันที่เริ่มลา *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">วันที่สิ้นสุด *</label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">หมายเหตุ</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ลาผ่าตัด, ลาคลอด..."
              className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
          </div>

          {absentTeacherId && leaveDates.length === 0 && (
            <p className="text-xs text-red-500 font-bold">กรุณาเลือกช่วงวันที่ให้ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)</p>
          )}

          {absentTeacherId && leaveDates.length > 0 && (
            absentEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-400">ไม่พบตารางสอนของครูคนนี้</div>
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-[#9D174D] bg-[#FDF2F8] border border-[#F9A8D4] rounded-xl px-3 py-2">
                  💡 รายชื่อครูในช่อง "เลือกครูสอนแทน" จะเรียงครูสายชั้นเดียวกับครูที่ลาไว้ก่อน — ตัวเลข "X คาบ" ข้างชื่อครูคือจำนวนคาบที่ครูสอนอยู่แล้วในวันนั้น ถ้าครบ {SUB_LOAD_WARN_AT} คาบจะมี ⚠️ เตือน และกดปุ่ม 🎲 เพื่อสุ่มครูสายชั้นเดียวกันที่ว่างตรงคาบและมีคาบน้อยที่สุดให้อัตโนมัติ
                </p>
                {leaveDates.map(date => {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  const dayEntries = absentEntries
    .filter(e => e.day_of_week === dayOfWeek)
    .sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0));
  if (dayEntries.length === 0) return null;
                  return (
                    <div key={date}>
                      <h4 className="font-bold text-slate-700 text-sm mb-3 pb-2 border-b border-[#FBCFE8]">
                        📅 {TH_DAYS[dayOfWeek]} {thaiDate(date)}
                      </h4>
                      <div className="space-y-2">
                        {dayEntries.map(entry => {
  const key = `${entry.id}_${date}`;
  const coId = coTeacherId(entry, absentTeacherId);
  const coTeacher = coId ? allTeachers.find(t => t.id === coId) : null;

  // ★ มีครูอีกคนสอนคู่อยู่ในคาบนี้แล้ว — ไม่ต้องจัดสอนแทน แค่โชว์ให้เห็น
  if (coTeacher) {
    return (
      <div key={key} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div className="shrink-0 text-center w-16">
          <div className="text-xs font-bold text-emerald-600">{entry.slot_label}</div>
          <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
          <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold text-emerald-600">👥 มีครูสอนคู่อยู่แล้ว</p>
          <p className="text-sm font-bold text-emerald-800">{fullName(coTeacher)}</p>
        </div>
      </div>
    );
  }

  const dow = dowOf(date);
  const candidates = computeFreeTeachersForEntry(entry, date, entries, allTeachers, absentTeacherId);
  const sortedCandidates = sortTeachersByGrade(candidates, entry, absentTeacher, entries, homeroomMap);
  const loadMap = dayLoadMapManual(date, sortedCandidates);
  const conflictMapForEntry = computeSubstituteConflictMap(entry, date, subRecords, entries, absentTeacherId);
  const pickedId = assignments[key] || "";
  const pickedLoad = pickedId ? (loadMap[pickedId] ?? null) : null;
  return (
    <div key={key} className="flex items-center gap-3 bg-[#FDF2F8] rounded-xl px-4 py-3">
                              <div className="shrink-0 text-center w-16">
                                <div className="text-xs font-bold text-[#DB2777]">{entry.slot_label}</div>
                                <div className="text-[10px] text-slate-400">{thaiTime(entry.start_time ?? undefined)}</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate">{entry.subject_name ?? "ไม่ระบุวิชา"}</div>
                                <div className="text-xs text-slate-400">{entry.grade_group ?? ""} {entry.room_name ?? ""}</div>
                                {pickedId && pickedLoad !== null && pickedLoad >= SUB_LOAD_WARN_AT && (
                                  <div className="text-[11px] font-bold text-red-500 mt-0.5">⚠️ ครูคนนี้มีภาระรวมวันนี้แล้ว {pickedLoad} คาบ (สอน+สอนแทน) — ควรพิจารณาก่อนยืนยัน</div>
                                )}
                                {pickedId && conflictMapForEntry[pickedId] && (
                                  <div className="text-[11px] font-bold text-red-600 mt-0.5">⚠️ {conflictMapForEntry[pickedId]}</div>
                                )}
                              </div>
                              <div className="shrink-0 w-72 sm:w-80 flex items-center gap-1.5">
  <div className="flex-1 min-w-0">
   <TeacherSearchSelect
      teachers={sortedCandidates}
      value={assignments[key] || ""}
      onChange={id => setAsgn(key, id)}
      placeholder="— เลือกครูสอนแทน —"
      loadMap={loadMap}
      conflictMap={conflictMapForEntry}
    />
  </div>
  <button type="button" onClick={() => randomAssignTeacher(key, entry, date)}
    title="สุ่มครูสายชั้นเดียวกันที่ว่างและมีคาบน้อยที่สุด"
    className="shrink-0 w-9 h-9 rounded-xl bg-[#FDF2F8] hover:bg-[#F9A8D4] border-2 border-[#F9A8D4] flex items-center justify-center text-base">
    🎲
  </button>
</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end shrink-0 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการสอนแทน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function SubstitutionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"swap"|"substitute"|"stat">("swap");
  const [academicYear, setAcademicYear] = useState<AcademicYear|null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [homeroomMap, setHomeroomMap] = useState<Record<string, string>>({});
  const [allEntries, setAllEntries] = useState<TimetableEntry[]>([]);
  const [allTimeSlots, setAllTimeSlots] = useState<any[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [subRecords, setSubRecords] = useState<SubRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [assignLeave, setAssignLeave] = useState<LeaveRequest|null>(null);
  const [assignRestrictDates, setAssignRestrictDates] = useState<string[] | undefined>(undefined);
  const [showManualAssign, setShowManualAssign] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [subSortOrder, setSubSortOrder] = useState<"desc" | "asc">("desc"); // ★ ใหม่-เก่า (default) / เก่า-ใหม่
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set()); // ★ รายการที่ติ๊กเลือกไว้พิมพ์
  const [swapInitialReason, setSwapInitialReason] = useState<string | undefined>(undefined);
  const [swapMode, setSwapMode] = useState<"normal"|"repay">("normal");
  const [swapFixedTargetTeacherId, setSwapFixedTargetTeacherId] = useState<string | undefined>(undefined);
  const [editingSub, setEditingSub] = useState<SubRecord|null>(null);
  const [adminSwapFilterStatus, setAdminSwapFilterStatus] = useState<"all"|"pending"|"accepted"|"rejected"|"cancelled">("all");
const [adminSwapFilterTeacher, setAdminSwapFilterTeacher] = useState("");
  const isAdmin = useMemo(() => ADMIN_ROLES.includes(user?.role ?? ""), [user]);
  // ★ ขยายสิทธิ์ "จัดสอนแทน" ให้หัวหน้าสายชั้น/หัวหน้าหมวด ไม่ใช่แค่แอดมิน
  //   ต้องมีคอลัมน์ users.extra_roles (text[]) เก็บค่าเช่น 'grade_head', 'dept_head'
  const canAssignSub = useMemo(() => {
    if (!user) return false;
    if (isAdmin) return true;
    const roles = user.extra_roles ?? [];
    return roles.includes("grade_head") || roles.includes("dept_head");
  }, [user, isAdmin]);
  const isFullAdmin = useMemo(() => ["admin", "director", "deputy_director"].includes(user?.role ?? ""), [user]);
const isGradeHeadUser = useMemo(() => {
  if (!user) return false;
  if (user.role === "grade_head") return true;
  return (user.extra_roles ?? []).includes("grade_head");
}, [user]);
// ★ true เฉพาะ "หัวหน้าสายชั้น" ที่ไม่ใช่แอดมิน/ผอ./รองผอ. — ใช้จำกัดให้เห็นแค่สายชั้นตัวเอง
const restrictToOwnGrade = useMemo(() => isGradeHeadUser && !isFullAdmin, [isGradeHeadUser, isFullAdmin]);

// ★ ต้องประกาศตัวนี้ก่อน เพราะตัวถัดไปเรียกใช้
const teacherGradeLevelMap = useMemo(
  () => Object.fromEntries(teachers.map(t => [t.id, t.grade_level ?? null])),
  [teachers]
);

// ★ ใบลาที่เห็นได้ — หัวหน้าสายชั้นเห็นเฉพาะครูสายชั้นตัวเอง
const visibleLeaveRequests = useMemo(() => {
  if (!restrictToOwnGrade || !user?.grade_level) return leaveRequests;
  return leaveRequests.filter(lr => teacherGradeLevelMap[lr.user_id] === user.grade_level);
}, [leaveRequests, restrictToOwnGrade, user, teacherGradeLevelMap]);

// ★ รายการสอนแทนที่เห็นได้ — หัวหน้าสายชั้นเห็นเฉพาะที่เกี่ยวข้องกับสายชั้นตัวเอง
const visibleSubRecords = useMemo(() => {
  if (!restrictToOwnGrade || !user?.grade_level) return subRecords;
  return subRecords.filter(r =>
    (!!r.absent_teacher_id && teacherGradeLevelMap[r.absent_teacher_id] === user.grade_level) ||
    (!!r.substitute_teacher_id && teacherGradeLevelMap[r.substitute_teacher_id] === user.grade_level)
  );
}, [subRecords, restrictToOwnGrade, user, teacherGradeLevelMap]);
  // ★ รายชื่อครูที่เลือกได้ในโหมด "จัดอัตโนมัติ" — admin เลือกได้ทุกคน, หัวหน้าสายเลือกได้แค่สายชั้นตัวเอง
const manualAssignTeachers = useMemo(() => {
  if (!user) return [];
  const base = teachers.filter(isSelectableTeacher);
  if (isAdmin) return base;
  const roles = user.extra_roles ?? [];
  if (roles.includes("grade_head") && user.grade_level) {
    return base.filter(t => t.grade_level === user.grade_level);
  }
  return [];
}, [teachers, user, isAdmin]);

const canManualAssign = isAdmin || (user?.extra_roles ?? []).includes("grade_head");
const isSpecificAdmin = useMemo(() => user?.email === "admin@khienkhet.ac.th", [user]);
const canEditSwap = useCallback((r: SwapRequest) => {
  if (isSpecificAdmin && r.status !== "cancelled") return true;
  return r.requester_id === user?.id && r.status === "pending";
}, [isSpecificAdmin, user]);
// ★ เช็คว่าเคยขอ "แลกคาบคืน" สำหรับรายการสอนแทนนี้ไปแล้วหรือยัง (ยัง pending/accepted อยู่)
// ใช้ reason เป็นตัวอ้างอิง เพราะข้อความมีวันที่+คาบเดิมที่ไม่ซ้ำกันอยู่แล้ว
const hasActiveRepayForSub = useCallback((r: SubRecord) => {
  if (!user || !r.substitute_teacher_id) return false;
  const marker = `${thaiDate(r.substitute_date)} (${r.slot_label ?? "-"})`;
  return swapRequests.some(sw =>
    sw.requester_id === user.id &&
    sw.target_teacher_id === r.substitute_teacher_id &&
    sw.status !== "cancelled" && sw.status !== "rejected" &&
    !!sw.reason?.includes(marker)
  );
}, [swapRequests, user]);

// ★ เช็คเหมือนกันแต่สำหรับ "แลกคาบคืน" ที่มาจากคำขอแลกคาบ (accepted) ในแท็บแลกคาบ
const hasActiveRepayForSwap = useCallback((r: SwapRequest) => {
  if (!user) return false;
  const marker = `${thaiDate(r.swap_date)} (${r.requester_entry?.slot_label ?? "-"})`;
  return swapRequests.some(sw =>
    sw.id !== r.id &&
    sw.requester_id === user.id &&
    sw.target_teacher_id === r.target_teacher_id &&
    sw.status !== "cancelled" && sw.status !== "rejected" &&
    !!sw.reason?.includes(marker)
  );
}, [swapRequests, user]);

const [editingSwap, setEditingSwap] = useState<SwapRequest | null>(null);
const [editingSwapDate, setEditingSwapDate] = useState<SwapRequest | null>(null); // ★ ใหม่

  // ── Load user ────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) { setLoading(false); return; }
      let { data } = await supabase.from("users")
        .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email,extra_roles")
        .eq("auth_id", au.id).maybeSingle();
      if (!data && au.email) {
        const r = await supabase.from("users")
          .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email,extra_roles")
          .eq("email", au.email).maybeSingle();
        data = r.data;
        if (data) await supabase.from("users").update({ auth_id: au.id }).eq("id", (data as any).id);
      }
      if (data) setUser(data as User);
      setLoading(false);
    };
    init();
  }, []);

  // ── Load data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;

    // Academic year
    const { data: years } = await supabase.from("academic_years")
      .select("id,year_name,is_current").order("year_name", { ascending: false });
    const ay = (years ?? []).find((y: any) => y.is_current) ?? years?.[0];
    setAcademicYear(ay ?? null);
    const ayId = ay?.id;

    // Teachers
const { data: tch, error: tchErr } = await supabase.from("users")
  .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email,extra_roles")
  .in("role", ["homeroom_teacher","subject_teacher"])
  .order("first_name");

if (tchErr) {
  console.error("[SubstitutionPage] โหลด teachers ไม่สำเร็จ:", tchErr.code, tchErr.message, tchErr.details);
  // fallback: ลองใหม่แบบไม่มี extra_roles เผื่อคอลัมน์นี้ยังไม่มีในตาราง users
  const { data: tchFallback, error: tchErr2 } = await supabase.from("users")
    .select("id,first_name,last_name,title,role,position,academic_level,grade_level,email")
    .in("role", ["teacher","homeroom_teacher","subject_teacher"])
    .order("first_name");
  if (tchErr2) {
    console.error("[SubstitutionPage] fallback ก็ยังพัง:", tchErr2.message);
  }
  setTeachers((tchFallback ?? []) as User[]);
} else {
  setTeachers((tch ?? []) as User[]);
}

    // ★ ตารางสอน — ใช้วิธี resolve เดียวกับหน้าใบลาเป๊ะ (schedule template + virtual slot id)
    let entriesQuery = supabase.from("timetable_entries")
      .select("id,classroom_id,subject_id,teacher_id,teacher_id_2,day_of_week,time_slot_id,academic_year_id");
    if (ayId) entriesQuery = entriesQuery.eq("academic_year_id", ayId);

    const [entriesRes, slotsRes, classroomsRes, subjectsRes] = await Promise.all([
      entriesQuery,
      supabase.from("time_slots")
        .select("id,slot_number,start_time,end_time,slot_label,is_break,schedule_type")
        .order("slot_number", { ascending: true }),
      supabase.from("classrooms").select("id,room_name,grade_group,schedule_type,homeroom_teacher_id"),
      supabase.from("subjects").select("id,subject_code,name_th"),
    ]);

    const timeSlots = slotsRes.data || [];
    setAllTimeSlots(timeSlots);
    const classroomsMap = Object.fromEntries((classroomsRes.data || []).map((c: any) => [c.id, c]));
    const subjectsMap = Object.fromEntries((subjectsRes.data || []).map((s: any) => [s.id, s]));
    const hrMap: Record<string, string> = {};
    (classroomsRes.data || []).forEach((c: any) => { if (c.homeroom_teacher_id) hrMap[c.id] = c.homeroom_teacher_id; });
    setHomeroomMap(hrMap);

    const allE = enrichEntries(entriesRes.data || [], classroomsMap, subjectsMap, timeSlots) as TimetableEntry[];
    setAllEntries(allE);

    // Swap requests (แลกคาบระหว่างครู — เป็นคนละฟีเจอร์กับสอนแทนจากใบลา)
    const swapQ = supabase.from("class_swap_requests")
  .select(`*,
    requester:users!requester_id(id,first_name,last_name,title,email),
    target_teacher:users!target_teacher_id(id,first_name,last_name,title,email)`)
  .order("created_at", { ascending: false }).limit(100);
    const { data: swaps } = await swapQ;
    setSwapRequests((swaps ?? []) as SwapRequest[]);

    // ★ Substitution records — ตารางเดียวกับที่หน้าใบลาเขียนลง
    const { data: subs, error: subsErr } = await supabase.from("substitution_records")
      .select(`*,
        absent_teacher:users!absent_teacher_id(id,first_name,last_name,title),
        substitute_teacher:users!substitute_teacher_id(id,first_name,last_name,title)`)
      .order("substitute_date", { ascending: false }).limit(300);
    if (subsErr) {
      console.error("[SubstitutionPage] โหลด substitution_records ไม่สำเร็จ:", subsErr.message, subsErr);
    }
    const entryMap = Object.fromEntries(allE.map(e => [e.id, e]));
    const enrichedSubs: SubRecord[] = (subs ?? []).map((r: any) => {
      const entry = r.timetable_entry_id ? entryMap[r.timetable_entry_id] : null;
      if (entry) {
        return { ...r, subject_name: entry.subject_name, room_name: entry.room_name, grade_group: entry.grade_group, slot_label: entry.slot_label, slot_number: entry.slot_number };
      }
      const subj = subjectsMap[r.subject_id];
      const room = classroomsMap[r.classroom_id];
      const roomSlots = buildRoomSlots(room?.schedule_type, timeSlots);
      const slot = roomSlots.find((s: any) => s.id === r.time_slot_id) ?? timeSlots.find((s: any) => s.id === r.time_slot_id);
      return { ...r, subject_name: subj?.name_th ?? null, room_name: room?.room_name ?? null, grade_group: room?.grade_group ?? null, slot_label: slot?.slot_label ?? null, slot_number: slot?.slot_number ?? null };
    });
    setSubRecords(markPastAssignedAsDone(enrichedSubs));

    // Leave requests (approved, within next 30 days)
    const from = ymd(new Date());
    const to   = ymd(addDays(new Date(), 30));
    const { data: leaves } = await supabase.from("leave_requests")
      .select(`*,user:users!user_id(id,first_name,last_name,title,role)`)
      .in("status", ["pending", "approved"])
      .gte("end_date", from).lte("start_date", to)
      .order("start_date");
    setLeaveRequests((leaves ?? []) as LeaveRequest[]);
  }, [user]);
  

  useEffect(() => { if (!loading && user) loadData(); }, [loading, user, loadData]);

  // ── Swap actions ─────────────────────────────────────────
  const handleSwapRespond = async (id: string, accept: boolean) => {
  const status = accept ? "accepted" : "rejected";
  await supabase.from("class_swap_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", id);
  const req = swapRequests.find(r => r.id === id);
  if (req) {
    notifyTeams(
      req.requester?.email,
      accept
        ? `✅ คำขอแลกคาบวันที่ ${thaiDate(req.swap_date)} ของคุณได้รับการตอบรับแล้ว`
        : `❌ คำขอแลกคาบวันที่ ${thaiDate(req.swap_date)} ของคุณถูกปฏิเสธ`
    );
  }
  await loadData();
};
// ★ แอดมิน/ผอ./รองผอ. อนุมัติหรือปฏิเสธคำขอแลกคาบแทนใครก็ได้ (ไม่ต้องเป็นเจ้าของคาบ)
const handleAdminSwapRespond = async (id: string, action: "accepted" | "rejected") => {
  if (!confirm(action === "accepted" ? "ยืนยันอนุมัติคำขอแลกคาบนี้แทนครู?" : "ยืนยันปฏิเสธคำขอแลกคาบนี้แทนครู?")) return;
  await supabase.from("class_swap_requests").update({ status: action, responded_at: new Date().toISOString() }).eq("id", id);
  const req = swapRequests.find(r => r.id === id);
  if (req) {
    const msg = action === "accepted"
      ? `✅ ผู้ดูแลระบบ (${fullName(user)}) อนุมัติคำขอแลกคาบวันที่ ${thaiDate(req.swap_date)} แทนแล้ว`
      : `❌ ผู้ดูแลระบบ (${fullName(user)}) ปฏิเสธคำขอแลกคาบวันที่ ${thaiDate(req.swap_date)} แทนแล้ว`;
    notifyTeams(req.requester?.email, msg);
    notifyTeams(req.target_teacher?.email, msg);
  }
  await loadData();
};
// ★ ลบคำขอแลกคาบที่ยกเลิกแล้วออกจาก Supabase ถาวร
const handleSwapDeletePermanent = async (id: string) => {
  if (!confirm("⚠️ ลบคำขอแลกคาบนี้ถาวร?\nข้อมูลจะหายไปจากฐานข้อมูลทันทีและกู้คืนไม่ได้")) return;
  const { error } = await supabase.from("class_swap_requests").delete().eq("id", id);
  if (error) { alert("❌ ลบไม่สำเร็จ: " + error.message); return; }
  await loadData();
};
const handleAdminSwapDateSave = async (id: string, newDate: string) => {
  const { error } = await supabase.from("class_swap_requests").update({ swap_date: newDate }).eq("id", id);
  if (error) { alert("❌ " + error.message); return; }
  setEditingSwapDate(null);
  await loadData();
};
const handleAdminSwapDeleteAny = async (id: string) => {
  if (!confirm("⚠️ ลบคำขอแลกคาบนี้ถาวร?\nข้อมูลจะหายไปจากฐานข้อมูลทันทีและกู้คืนไม่ได้")) return;
  const { error } = await supabase.from("class_swap_requests").delete().eq("id", id);
  if (error) { alert("❌ ลบไม่สำเร็จ: " + error.message); return; }
  setEditingSwapDate(null);
  await loadData();
};
  const handleSwapCancel = async (id: string) => {
    if (!confirm("ยืนยันการยกเลิกคำขอ?")) return;
    await supabase.from("class_swap_requests").update({ status: "cancelled" }).eq("id", id);
    await loadData();
  };

  // ★ ยกเลิกรายการสอนแทน — รายการที่ยกเลิกจะถูกตัดออกจากสถิติทั้งหมดโดยอัตโนมัติ
  const handleSubCancel = async (id: string) => {
    if (!confirm("ยืนยันการยกเลิกรายการสอนแทนนี้? รายการนี้จะถูกตัดออกจากสถิติ")) return;
    await supabase.from("substitution_records").update({ status: "cancelled" }).eq("id", id);
    await loadData();
  };
  // ★ ลบรายการสอนแทนที่ยกเลิกแล้วออกจาก Supabase ถาวร (ใช้ได้เฉพาะรายการที่ status = cancelled เท่านั้น)
const handleSubDeletePermanent = async (id: string) => {
  if (!confirm("⚠️ ลบรายการนี้ถาวร?\nข้อมูลจะหายไปจากฐานข้อมูลทันทีและกู้คืนไม่ได้")) return;
  const { error } = await supabase.from("substitution_records").delete().eq("id", id);
  if (error) { alert("❌ ลบไม่สำเร็จ: " + error.message); return; }
  await loadData();
};
  function EditSubModal({ record, allEntries, teachers, currentUser, onSave, onClose }: {
  record: SubRecord; allEntries: TimetableEntry[]; teachers: User[]; currentUser: User;
  onSave: () => void; onClose: () => void;
}) {
  const entry = allEntries.find(e => e.id === record.timetable_entry_id) ?? null;
  const [newTeacherId, setNewTeacherId] = useState(record.substitute_teacher_id ?? "");
  const [saving, setSaving] = useState(false);

  // ★ ครูที่ลา (เจ้าของคาบเดิม) — ใช้หาสายชั้นเดียวกันจาก grade_level
  const absentTeacher = useMemo(
    () => teachers.find(t => t.id === record.absent_teacher_id) ?? null,
    [teachers, record.absent_teacher_id]
  );
  
  const rawCandidates = useMemo(() => {
    if (!entry) return teachers.filter(isSelectableTeacher);
    const free = computeFreeTeachersForEntry(entry, record.substitute_date, allEntries, teachers, record.absent_teacher_id);
    // เผื่อครูคนเดิมไม่โผล่ในลิสต์ว่าง (เช่นถูกจัดสอนแทนที่อื่นซ้อนพอดี) ให้ใส่กลับเข้าไปด้วยเสมอ
    if (record.substitute_teacher_id && !free.some(t => t.id === record.substitute_teacher_id)) {
      const old = teachers.find(t => t.id === record.substitute_teacher_id);
      if (old) return [old, ...free];
    }
    return free;
  }, [entry, allEntries, teachers, record]);

  // ★ เรียงครูสายชั้นเดียวกับ "ครูที่ลา" ขึ้นก่อน
  const candidates = useMemo(
    () => sortTeachersByGrade(rawCandidates, entry, absentTeacher, allEntries, homeroomMap),
    [rawCandidates, absentTeacher, entry, allEntries, homeroomMap]
  );

  // ★ จำนวนคาบที่แต่ละคนสอนอยู่แล้วในวันนั้น — โชว์เป็น badge ข้างชื่อ
  const loadMap = useMemo(() => {
    const dow = dowOf(record.substitute_date);
    return Object.fromEntries(candidates.map(t => [t.id, computeTotalLoadForDay(t.id, dow, record.substitute_date, allEntries, subRecords)]));
  }, [candidates, allEntries, record.substitute_date, subRecords]);

  const conflictMapForEntry = useMemo(() => {
    if (!entry) return {} as Record<string, string>;
    return computeSubstituteConflictMap(entry, record.substitute_date, subRecords, allEntries, record.absent_teacher_id);
  }, [entry, record.substitute_date, record.absent_teacher_id, subRecords, allEntries]);

  const handleSave = async () => {
    if (!newTeacherId) { alert("กรุณาเลือกครูสอนแทนคนใหม่"); return; }
    setSaving(true);
    const { error } = await supabase.from("substitution_records").update({
      substitute_teacher_id: newTeacherId,
      assigned_by: currentUser.id,
      note: `${record.note ?? ""}${record.note ? " " : ""}(แก้ไขครูสอนแทนโดยแอดมิน)`,
    }).eq("id", record.id);
    setSaving(false);
    if (error) { alert("❌ "+error.message); return; }
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-base">✏️ แก้ไขครูสอนแทน</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-[#FDF2F8] rounded-xl px-4 py-3 text-sm">
            <p><span className="text-slate-400">วันที่:</span> {thaiDate(record.substitute_date)} · {record.slot_label ?? "-"}</p>
            <p><span className="text-slate-400">วิชา:</span> {record.subject_name ?? "-"} · {record.room_name ?? "-"}</p>
            <p><span className="text-slate-400">ครูที่ลา:</span> {fullName(record.absent_teacher)}</p>
            <p><span className="text-slate-400">ครูสอนแทนเดิม:</span> <span className="font-bold text-[#DB2777]">{fullName(record.substitute_teacher)}</span></p>
          </div>
          <div>
  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เปลี่ยนเป็นครู *</label>
  <TeacherSearchSelect
    teachers={candidates}
    value={newTeacherId}
    onChange={setNewTeacherId}
    placeholder="— เลือกครูสอนแทนคนใหม่ —"
    loadMap={loadMap}
    conflictMap={conflictMapForEntry}
  />
  {candidates.length === 0 && <p className="text-xs text-red-500 font-bold mt-1">ไม่พบครูว่างในคาบนี้</p>}
</div>
        </div>
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex gap-2 justify-end bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || newTeacherId === record.substitute_teacher_id}
            className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ── EditSwapDateModal — เฉพาะ admin@khienkhet.ac.th แก้วันที่/ลบได้ทุกสถานะ
// ══════════════════════════════════════════════════════════
function EditSwapDateModal({ record, onSave, onDelete, onClose }: {
  record: SwapRequest;
  onSave: (id: string, newDate: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(record.swap_date);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!date) { alert("กรุณาเลือกวันที่"); return; }
    setSaving(true);
    await onSave(record.id, date);
    setSaving(false);
  };
  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(record.id);
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-base">✏️ แก้ไขคำขอแลกคาบ (แอดมิน)</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#FCE7F3] flex items-center justify-center text-slate-500">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-[#FDF2F8] rounded-xl px-4 py-3 text-sm space-y-1">
            <p><span className="text-slate-400">ผู้ขอ:</span> <span className="font-bold text-slate-800">{fullName(record.requester)}</span></p>
            <p><span className="text-slate-400">ขอแลกกับ:</span> <span className="font-bold text-[#DB2777]">{fullName(record.target_teacher)}</span></p>
            <p><span className="text-slate-400">สถานะ:</span> <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${STATUS_SWAP[record.status]?.cls}`}>{STATUS_SWAP[record.status]?.label}</span></p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">วันที่แลกคาบ *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border-2 border-[#F9A8D4] rounded-xl px-3 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none" />
          </div>
          <p className="text-xs text-slate-400">💡 แก้ไขเฉพาะวันที่เท่านั้น ไม่กระทบสถานะหรือคาบที่เลือกไว้เดิม</p>
        </div>
        <div className="px-6 py-4 border-t border-[#FCE7F3] flex items-center justify-between gap-2 bg-[#FDF2F8] rounded-b-2xl">
          <button onClick={handleDelete} disabled={deleting}
            className="px-4 py-2.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold border border-red-300 disabled:opacity-50">
            {deleting ? "กำลังลบ..." : "🗑️ ลบรายการนี้"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-[#FBCFE8] text-slate-600 text-sm font-medium">ยกเลิก</button>
            <button onClick={handleSave} disabled={saving || date === record.swap_date}
              className="px-5 py-2.5 rounded-xl bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

  // ── Filtered data ────────────────────────────────────────
  const mySwaps = useMemo(() =>
    swapRequests.filter(r => r.requester_id === user?.id || r.target_teacher_id === user?.id)
  , [swapRequests, user]);

  const incomingSwaps = useMemo(() =>
    swapRequests.filter(r => r.target_teacher_id === user?.id && r.status === "pending")
  , [swapRequests, user]);
  // ── สรุปภาพรวมการแลกคาบทั้งโรงเรียน (สำหรับแอดมิน/ผอ./รองผอ.) ──
const adminSwapStats = useMemo(() => {
  const total = swapRequests.length;
  const pending = swapRequests.filter(r => r.status === "pending").length;
  const accepted = swapRequests.filter(r => r.status === "accepted").length;
  const rejected = swapRequests.filter(r => r.status === "rejected").length;
  const cancelled = swapRequests.filter(r => r.status === "cancelled").length;
  return { total, pending, accepted, rejected, cancelled };
}, [swapRequests]);

const teacherSwapSummary = useMemo(() => {
  const map: Record<string, { name: string; requested: number; covered: number }> = {};
  swapRequests.forEach(r => {
    if (r.status === "cancelled") return;
    if (!map[r.requester_id]) map[r.requester_id] = { name: fullName(r.requester), requested: 0, covered: 0 };
    map[r.requester_id].requested++;
    if (r.status === "accepted" && r.target_teacher_id) {
      if (!map[r.target_teacher_id]) map[r.target_teacher_id] = { name: fullName(r.target_teacher), requested: 0, covered: 0 };
      map[r.target_teacher_id].covered++;
    }
  });
  return Object.entries(map).sort((a, b) => (b[1].requested + b[1].covered) - (a[1].requested + a[1].covered));
}, [swapRequests]);

const adminFilteredSwaps = useMemo(() => {
  let list = swapRequests;
  if (adminSwapFilterStatus !== "all") list = list.filter(r => r.status === adminSwapFilterStatus);
  if (adminSwapFilterTeacher) list = list.filter(r => r.requester_id === adminSwapFilterTeacher || r.target_teacher_id === adminSwapFilterTeacher);
  return [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}, [swapRequests, adminSwapFilterStatus, adminSwapFilterTeacher]);

  const filteredSubs = useMemo(() => {
    let list = visibleSubRecords;
    if (filterDate) list = list.filter(r => r.substitute_date === filterDate);
    if (filterTeacher) list = list.filter(r =>
      r.absent_teacher_id === filterTeacher || r.substitute_teacher_id === filterTeacher);
    if (!canAssignSub) list = list.filter(r =>
      r.absent_teacher_id === user?.id || r.substitute_teacher_id === user?.id);
    // ★ เรียงวันที่ตาม subSortOrder — วันเดียวกันเรียงคาบ 1-6 เสมอ ไม่กลับตามทิศทางวันที่
    return [...list].sort((a, b) => {
      const dateCmp = a.substitute_date < b.substitute_date ? -1 : a.substitute_date > b.substitute_date ? 1 : 0;
      const primary = subSortOrder === "asc" ? dateCmp : -dateCmp;
      if (primary !== 0) return primary;
      return (a.slot_number ?? 0) - (b.slot_number ?? 0);
    });
  }, [subRecords, filterDate, filterTeacher, canAssignSub, user, subSortOrder]);
  useEffect(() => { setSelectedSubIds(new Set()); }, [filterDate, filterTeacher]);
  const toggleSelectSub = (id: string) => {
    setSelectedSubIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllSubs = () => {
    setSelectedSubIds(prev => {
      const allSelected = filteredSubs.length > 0 && filteredSubs.every(r => prev.has(r.id));
      return allSelected ? new Set() : new Set(filteredSubs.map(r => r.id));
    });
  };
  const isAllSubsSelected = filteredSubs.length > 0 && filteredSubs.every(r => selectedSubIds.has(r.id));

  // ── Stat ─────────────────────────────────────────────────
  const statMap = useMemo(() => {
    const m: Record<string, { name: string; asAbsent: number; asSub: number; hours: number }> = {};
    for (const r of visibleSubRecords) {
      if (r.status === "cancelled") continue;
      if (r.absent_teacher_id) {
        if (!m[r.absent_teacher_id]) m[r.absent_teacher_id] = { name: fullName(r.absent_teacher), asAbsent: 0, asSub: 0, hours: 0 };
        m[r.absent_teacher_id].asAbsent++;
      }
      if (r.substitute_teacher_id) {
        if (!m[r.substitute_teacher_id]) m[r.substitute_teacher_id] = { name: fullName(r.substitute_teacher), asAbsent: 0, asSub: 0, hours: 0 };
        m[r.substitute_teacher_id].asSub++;
        m[r.substitute_teacher_id].hours += Number(r.hours_count);
      }
    }
    return Object.entries(m).sort((a,b) => b[1].hours - a[1].hours);
  }, [subRecords]);

  const combinedHistory = useMemo(() => {
  type HistItem = { key: string; date: string; kind: "swap" | "sub"; data: SwapRequest | SubRecord };
  const swapItems: HistItem[] = swapRequests
    .filter(r => r.status === "accepted")
    .map(r => ({ key: `swap-${r.id}`, date: r.swap_date, kind: "swap" as const, data: r }));
  const subItems: HistItem[] = subRecords
    .map(r => ({ key: `sub-${r.id}`, date: r.substitute_date, kind: "sub" as const, data: r }));
  let items = [...swapItems, ...subItems];

  if (!isFullAdmin) {
    items = items.filter(item => {
      if (item.kind === "swap") {
        const r = item.data as SwapRequest;
        if (r.requester_id === user?.id || r.target_teacher_id === user?.id) return true;
        if (isGradeHeadUser && user?.grade_level) {
          return teacherGradeLevelMap[r.requester_id] === user.grade_level
              || teacherGradeLevelMap[r.target_teacher_id] === user.grade_level;
        }
        return false;
      } else {
        const r = item.data as SubRecord;
        if (r.absent_teacher_id === user?.id || r.substitute_teacher_id === user?.id) return true;
        if (isGradeHeadUser && user?.grade_level) {
          return (!!r.absent_teacher_id && teacherGradeLevelMap[r.absent_teacher_id] === user.grade_level)
              || (!!r.substitute_teacher_id && teacherGradeLevelMap[r.substitute_teacher_id] === user.grade_level);
        }
        return false;
      }
    });
  }

  return items
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 40);
}, [swapRequests, subRecords, isFullAdmin, isGradeHeadUser, teacherGradeLevelMap, user]);

  // ── Render ───────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#FDF2F8]">
      <div className="w-10 h-10 rounded-full border-[3px] border-[#F9A8D4] border-t-[#FB7185] animate-spin" />
      <p className="text-[#64748B] text-sm font-medium tracking-wide">กำลังโหลด...</p>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF2F8]">
      <div className="bg-white border border-[#FBCFE8] rounded-2xl px-8 py-7 shadow-sm text-center">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-[#1E293B] text-base font-bold">กรุณาเข้าสู่ระบบ</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDF2F8] flex flex-col" style={{fontFamily:"'Sarabun','Noto Sans Thai',sans-serif"}}>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#9D174D] via-[#DB2777] to-[#EC4899] border-b-[3px] border-[#FB7185] px-5 py-4 flex items-center gap-3 shadow-lg shrink-0 relative">
        <button onClick={() => router.push("/dashboard")}
  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold text-lg shrink-0 border border-white/10">
  🏠
</button>
        {/* Signature seal — a small emblem echoing the school stamp on printed orders */}
        <div className="w-11 h-11 rounded-full bg-[#FB7185]/15 border-2 border-[#FB7185] flex items-center justify-center shrink-0">
          <span className="text-lg leading-none">🔄</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-extrabold text-lg leading-tight tracking-tight">แลกคาบ &amp; สอนแทน</h1>
          <p className="text-[#FBCFE8] text-xs sm:text-sm font-medium">{fullName(user)} · ปีการศึกษา {academicYear?.year_name}</p>
        </div>
        <button onClick={() => { setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); setShowSwapModal(true); }}
          className="px-4 py-2 bg-[#FB7185] hover:bg-[#BE185D] text-[#9D174D] text-sm font-bold rounded-xl shadow-sm transition-colors shrink-0">
          + ขอแลกคาบ
        </button>
      </div>

      {/* Incoming swap badge */}
      {incomingSwaps.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-3">
          <span className="text-amber-700 font-bold text-sm">⏳ มีคำขอแลกคาบรอการตอบรับ {incomingSwaps.length} รายการ</span>
          <button onClick={() => setTab("swap")} className="text-xs text-amber-800 underline font-bold">ดู</button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-[#FBCFE8] flex overflow-x-auto shrink-0">
        {([
          ["swap",       "🔄 แลกคาบ"],
          ["substitute", "📋 สอนแทน"],
          ["stat",       "📊 สถิติ/ประวัติ"],
        ] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-3.5 text-sm font-bold border-b-[3px] whitespace-nowrap transition-all
              ${tab===k ? "border-[#FB7185] text-[#9D174D]" : "border-transparent text-[#94A3B8] hover:text-[#1E293B]"}`}>
            {l}
            {k==="swap" && incomingSwaps.length > 0 && (
              <span className="ml-1.5 bg-[#FB7185] text-[#9D174D] text-[10px] font-black px-1.5 py-0.5 rounded-full">{incomingSwaps.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Tab: แลกคาบ ── */}
        {tab === "swap" && (
          <div className="w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">คำขอแลกคาบของฉัน</h2>
              <button onClick={() => { setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); setShowSwapModal(true); }}
                className="px-4 py-2 bg-[#FB7185] hover:bg-[#BE185D] text-white text-sm font-bold rounded-xl">
                + ขอแลกคาบใหม่
              </button>
            </div>
            {isFullAdmin && (
  <div className="space-y-4">
    <h2 className="font-bold text-slate-700 text-base">🗂️ ภาพรวมการแลกคาบทั้งโรงเรียน (ผู้ดูแลระบบ)</h2>

    {/* การ์ดสรุป */}
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: "คำขอทั้งหมด", value: adminSwapStats.total, color: "#1E293B", bg: "bg-white", border: "border-[#FBCFE8]" },
        { label: "รอตอบรับ", value: adminSwapStats.pending, color: "#D97706", bg: "bg-amber-50", border: "border-amber-200" },
        { label: "ตกลงแล้ว", value: adminSwapStats.accepted, color: "#059669", bg: "bg-emerald-50", border: "border-emerald-200" },
        { label: "ปฏิเสธ", value: adminSwapStats.rejected, color: "#DC2626", bg: "bg-red-50", border: "border-red-200" },
        { label: "ยกเลิก", value: adminSwapStats.cancelled, color: "#64748B", bg: "bg-slate-50", border: "border-slate-200" },
      ].map(c => (
        <div key={c.label} className={`${c.bg} border-2 ${c.border} rounded-2xl p-4 text-center shadow-sm`}>
          <div className="text-2xl font-black" style={{ color: c.color }}>{c.value}</div>
          <div className="text-xs text-slate-500 font-bold mt-1">{c.label}</div>
        </div>
      ))}
    </div>

    {/* สรุปรายครู */}
    {teacherSwapSummary.length > 0 && (
      <div className="bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-[#FCE7F3]">
          <h3 className="font-bold text-slate-700 text-sm">👥 สรุปการแลกคาบรายครู</h3>
          <p className="text-xs text-slate-400 mt-0.5">"ขอแลก" = จำนวนครั้งที่เป็นผู้ขอแลกคาบ · "รับแลกให้" = จำนวนครั้งที่ตอบรับสอนแทนให้ผู้อื่น</p>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-gradient-to-r from-[#9D174D] to-[#EC4899] text-white text-xs">
                <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                <th className="px-3 py-3 text-center">ขอแลก</th>
                <th className="px-3 py-3 text-center">รับแลกให้</th>
              </tr>
            </thead>
            <tbody>
              {teacherSwapSummary.map(([id, s], i) => (
                <tr key={id} className={i % 2 === 0 ? "bg-[#FDF2F8]" : "bg-white"}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-[#DB2777]">{s.requested || "-"}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{s.covered || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* รายการทั้งหมด + ปุ่มอนุมัติแทน */}
    <div className="bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-[#FCE7F3] flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-slate-700 text-sm">📋 คำขอแลกคาบทั้งหมด ({adminFilteredSwaps.length})</h3>
        <div className="flex gap-2 flex-wrap">
          <select value={adminSwapFilterStatus} onChange={e => setAdminSwapFilterStatus(e.target.value as any)}
            className="border-2 border-[#F9A8D4] rounded-xl px-3 py-1.5 text-xs font-bold bg-white focus:outline-none">
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รอตอบรับ</option>
            <option value="accepted">ตกลงแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
          <select value={adminSwapFilterTeacher} onChange={e => setAdminSwapFilterTeacher(e.target.value)}
            className="border-2 border-[#F9A8D4] rounded-xl px-3 py-1.5 text-xs font-bold bg-white focus:outline-none">
            <option value="">ทุกคน</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </div>
      </div>
      {adminFilteredSwaps.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">ไม่มีข้อมูล</div>
      ) : (
        <div className="divide-y divide-[#FCE7F3] max-h-[480px] overflow-y-auto">
          {adminFilteredSwaps.map(r => (
            <div key={r.id} className="px-5 py-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${STATUS_SWAP[r.status]?.cls}`}>{STATUS_SWAP[r.status]?.label}</span>
                  <span className="text-xs text-slate-400">📅 {thaiDate(r.swap_date)}</span>
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {fullName(r.requester)} <span className="text-slate-400 font-normal">ขอแลกกับ</span> {fullName(r.target_teacher)}
                </p>
                {r.reason && <p className="text-xs text-slate-500 mt-1">{r.reason}</p>}
              </div>
              {r.status === "pending" ? (
  <div className="flex gap-2 shrink-0">
    <button onClick={() => handleAdminSwapRespond(r.id, "accepted")}
      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold">✅ อนุมัติแทน</button>
    <button onClick={() => handleAdminSwapRespond(r.id, "rejected")}
      className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold">❌ ปฏิเสธแทน</button>
    {isSpecificAdmin && (
      <button onClick={() => setEditingSwapDate(r)}
        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold border border-blue-200">✏️ แก้ไข</button>
    )}
  </div>
) : isSpecificAdmin ? (
  <button onClick={() => setEditingSwapDate(r)}
    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold border border-blue-200 shrink-0">
    ✏️ แก้ไข
  </button>
) : r.status === "cancelled" ? (
  <button onClick={() => handleSwapDeletePermanent(r.id)}
    className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold border border-red-300 shrink-0">
    🗑️ ลบถาวร
  </button>
) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}

            {/* Incoming */}
            {incomingSwaps.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">⏳ รอตอบรับ ({incomingSwaps.length})</h3>
                <div className="space-y-3">
                  {incomingSwaps.map(r => (
                    <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-bold text-slate-800">{fullName(r.requester)} <span className="text-slate-400 font-normal">ขอแลกคาบ</span></p>
                          <p className="text-sm text-slate-500">📅 {thaiDate(r.swap_date)}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${STATUS_SWAP[r.status]?.cls}`}>
                          {STATUS_SWAP[r.status]?.label}
                        </span>
                      </div>
                      {r.reason && <p className="text-sm text-slate-600 mb-3 bg-white rounded-xl px-3 py-2">{r.reason}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => handleSwapRespond(r.id, true)}
                          className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold">
                          ✅ ตกลง
                        </button>
                        <button onClick={() => handleSwapRespond(r.id, false)}
                          className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold">
                          ❌ ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My requests */}
            <div className="w-full max-w-none">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">คำขอทั้งหมดของฉัน</h3>

              {mySwaps.length === 0 ? (
                <div className="w-full text-center py-16 bg-white rounded-2xl border border-[#FBCFE8] text-slate-400 shadow-sm">
                  <p className="text-5xl mb-3">🔄</p>
                  <p className="text-base font-medium">ยังไม่มีคำขอแลกคาบ</p>
                </div>
              ) : (
                <div className="w-full grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {mySwaps.map(r => (
                    <div key={r.id} className="w-full bg-white rounded-2xl border border-[#FBCFE8] p-5 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 text-base leading-snug">
                            {r.requester_id === user?.id
                              ? <span>ขอแลกกับ <span className="text-[#DB2777]">{fullName(r.target_teacher)}</span></span>
                              : <span><span className="text-[#DB2777]">{fullName(r.requester)}</span> ขอแลกกับคุณ</span>
                            }
                          </p>
                          <p className="text-xs sm:text-sm text-slate-400 mt-1">📅 {thaiDate(r.swap_date)}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border shrink-0 ${STATUS_SWAP[r.status]?.cls}`}>
                          {STATUS_SWAP[r.status]?.label}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-slate-500 mb-2">{r.reason}</p>}
                      <div className="flex items-center gap-3">
                        {r.requester_id === user?.id && r.status === "pending" && (
                          <button onClick={() => handleSwapCancel(r.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-bold underline">ยกเลิกคำขอ</button>
                        )}
                        {r.requester_id === user?.id && r.status === "accepted" && !hasActiveRepayForSwap(r) && (
  <button onClick={() => {
    setSwapMode("repay");
    setSwapFixedTargetTeacherId(r.target_teacher_id);
    setSwapInitialReason(`ขอแลกคาบคืนให้ ${fullName(r.target_teacher)} ที่เคยรับแลกคาบให้เมื่อ ${thaiDate(r.swap_date)} (${r.requester_entry?.slot_label ?? "-"})`);
    setShowSwapModal(true);
  }}
    className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-bold border border-purple-200">
    🔄 แลกคาบคืน
  </button>
)}
                        {canEditSwap(r) && (
                          <button onClick={() => { setEditingSwap(r); setShowSwapModal(true); }}
                            className="text-xs text-blue-500 hover:text-blue-700 font-bold underline">✏️ แก้ไข</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: สอนแทน ── */}
        {tab === "substitute" && (
          <div className="w-full p-5 space-y-5">
            {/* แอดมิน/หัวหน้าสายชั้น/หัวหน้าหมวด: จัดสอนแทนจากใบลา */}
            {canAssignSub && visibleLeaveRequests.length > 0 && (
  <div>
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
      📋 ครูที่ลา (รอจัดสอนแทน) — {visibleLeaveRequests.length} คน
    </h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {visibleLeaveRequests.map(lr => {
                    const expectedDates = getLeaveWeekdayDates(lr);
                    const assignedDates = new Set(
                      subRecords.filter(r => r.leave_request_id === lr.id && r.status !== "cancelled").map(r => r.substitute_date)
                    );
                    const missingDates = expectedDates.filter(d => !assignedDates.has(d));
                    const fullyAssigned = expectedDates.length > 0 && missingDates.length === 0;
                    const partiallyAssigned = assignedDates.size > 0 && missingDates.length > 0;
                    return (
                      <div key={lr.id} className={`rounded-2xl border p-4 ${fullyAssigned ? "bg-emerald-50 border-emerald-200" : partiallyAssigned ? "bg-amber-50 border-amber-300" : "bg-white border-[#FBCFE8]"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{fullName(lr.user)}</p>
                            <p className="text-xs text-slate-400">{thaiDate(lr.start_date)} – {thaiDate(lr.end_date)} ({lr.days_count} วัน)</p>
                            {lr.status === "pending" && (
  <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
    ⏳ ยังรออนุมัติ — จัดล่วงหน้าได้เลย
  </span>
)}
{lr.half_day && (
  <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-200">
    🕐 ลาครึ่ง{lr.half_day === "morning" ? "เช้า" : "บ่าย"}
  </span>
)}
                            {partiallyAssigned && (
                              <span className="block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-300 w-fit">
                                ⚠️ ใบลาแก้ไขเพิ่ม — ยังขาด {missingDates.length} วัน
                              </span>
                            )}
                            <p className="text-xs text-slate-400 mt-0.5">{{sick:"ลาป่วย",personal:"ลากิจ",official:"ลาราชการ",maternity:"ลาคลอด",ordination:"ลาอุปสมบท"}[lr.leave_type]??lr.leave_type}</p>
                          </div>
                          {fullyAssigned ? (
                            <span className="text-xs font-bold px-2 py-1 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300 shrink-0">จัดแล้ว ✓</span>
                          ) : partiallyAssigned ? (
                            <button onClick={() => { setAssignLeave(lr); setAssignRestrictDates(missingDates); }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shrink-0">
                              จัดวันที่เพิ่ม
                            </button>
                          ) : (
                            <button onClick={() => { setAssignLeave(lr); setAssignRestrictDates(undefined); }}
                              className="px-3 py-1.5 bg-[#DB2777] hover:bg-[#9D174D] text-white text-xs font-bold rounded-xl shrink-0">
                              จัดสอนแทน
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  💡 ครูที่ยื่นใบลาแล้วจัดสอนแทนไว้ในฟอร์มลาเองแล้ว (🤖/🎯) จะขึ้น "จัดแล้ว ✓" ให้อัตโนมัติ ไม่ต้องจัดซ้ำ
                </p>
              </div>
            )}

            {canManualAssign && (
  <div className="bg-[#FDF2F8] border-2 border-[#F9A8D4] rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
    <div>
      <p className="font-bold text-[#9D174D] text-sm">⚡ จัดอัตโนมัติ (ไม่ต้องรอใบลา)</p>
      <p className="text-xs text-[#BE185D] mt-0.5">
        {isAdmin ? "เลือกครูคนไหนก็ได้ทั้งโรงเรียน" : "เลือกได้เฉพาะครูในสายชั้นของคุณ"} — ใช้เมื่อครูลาผ่าตัด/ลายาวและยังไม่มีใบลาในระบบ
      </p>
    </div>
    <button onClick={() => setShowManualAssign(true)}
      className="px-4 py-2.5 bg-[#FB7185] hover:bg-[#BE185D] text-white text-sm font-bold rounded-xl shrink-0">
      ⚡ จัดอัตโนมัติ
    </button>
  </div>
)}


            {/* Filter + Print */}
<div className="w-full bg-white rounded-2xl border border-[#FBCFE8] p-5 shadow-sm">
  <div className="flex flex-wrap gap-4 items-end justify-between w-full">
    
    {/* ฝั่งตัวกรอง */}
    <div className="flex gap-4 flex-wrap items-end flex-1 min-w-[280px]">
      <div className="flex-1 sm:flex-initial min-w-[160px]">
        <label className="block text-xs font-bold text-slate-400 mb-1.5">วันที่</label>
        <input 
          type="date" 
          value={filterDate} 
          onChange={e=>setFilterDate(e.target.value)}
          className="w-full border-2 border-[#F9A8D4] rounded-xl px-3.5 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none transition-colors" 
        />
      </div>

      {canAssignSub && (
        <div className="flex-1 sm:flex-initial min-w-[200px]">
          <label className="block text-xs font-bold text-slate-400 mb-1.5">ครู</label>
          <select 
            value={filterTeacher} 
            onChange={e=>setFilterTeacher(e.target.value)}
            className="w-full border-2 border-[#F9A8D4] rounded-xl px-3.5 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none transition-colors"
          >
            <option value="">ทั้งหมด</option>
            {teachers.map(t=><option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </div>
      )}

      <div className="flex-1 sm:flex-initial min-w-[160px]">
        <label className="block text-xs font-bold text-slate-400 mb-1.5">เรียงลำดับ</label>
        <select 
          value={subSortOrder} 
          onChange={e=>setSubSortOrder(e.target.value as "desc"|"asc")}
          className="w-full border-2 border-[#F9A8D4] rounded-xl px-3.5 py-2.5 text-sm bg-white focus:border-[#DB2777] focus:outline-none transition-colors"
        >
          <option value="desc">📅 วันที่ใหม่ → เก่า</option>
          <option value="asc">📅 วันที่เก่า → ใหม่</option>
        </select>
      </div>

      {(filterDate||filterTeacher) && (
        <button 
          onClick={()=>{setFilterDate("");setFilterTeacher("");}}
          className="px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-red-500 hover:underline transition-colors mb-0.5"
        >
          ✕ ล้างตัวกรอง
        </button>
      )}
    </div>

    {/* ฝั่งปุ่มพิมพ์ */}
    {canAssignSub && filteredSubs.length > 0 && (
      <div className="flex gap-2 shrink-0">
        {selectedSubIds.size > 0 && (
          <button 
            onClick={() => {
              const selected = filteredSubs.filter(r => selectedSubIds.has(r.id));
              printSubOrder(sortSubsForPrint(selected), `เฉพาะที่เลือก (${selected.length} รายการ)`);
            }}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all"
          >
            🖨️ พิมพ์ที่เลือก ({selectedSubIds.size})
          </button>
        )}
        <button 
          onClick={()=>printSubOrder(sortSubsForPrint(filteredSubs), filterDate?thaiDate(filterDate):"ทั้งหมด")}
          className="px-5 py-2.5 bg-[#DB2777] hover:bg-[#9D174D] active:scale-95 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all"
        >
          🖨️ พิมพ์ทั้งหมด ({filteredSubs.length})
        </button>
      </div>
    )}

  </div>
</div>
{/* Sub records table */}
<div className="w-full bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden shadow-sm">
  <div className="px-6 py-4 border-b border-[#FCE7F3] flex items-center justify-between">
    <h3 className="font-bold text-slate-700 text-base">รายการสอนแทน ({filteredSubs.length})</h3>
  </div>
  
  {filteredSubs.length === 0 ? (
    <div className="text-center py-16 text-slate-400 text-sm">ไม่มีข้อมูล</div>
  ) : (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gradient-to-r from-[#9D174D] to-[#EC4899] text-white text-xs sm:text-sm">
            {canAssignSub && (
              <th className="px-4 py-3.5 text-center whitespace-nowrap">
                <input type="checkbox" checked={isAllSubsSelected} onChange={toggleSelectAllSubs}
                  className="w-4 h-4 rounded cursor-pointer" title="เลือกทั้งหมด" />
              </th>
            )}
            {["วันที่","คาบ","ห้อง","วิชา","ครูเจ้าของคาบ","ครูสอนแทน","ชม.","ที่มา","สถานะ","แลกคาบคืน", ...(canAssignSub ? ["จัดการ"] : [])].map(h=>(
              <th key={h} className="px-4 py-3.5 text-left font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#FCE7F3]">
          {filteredSubs.map((r,i)=>{
            const src = sourceOf(r.note);
            return (
              <tr key={r.id} className={`${i%2===0 ? "bg-[#FDF2F8]/50" : "bg-white"} hover:bg-[#FDF2F8]/40 transition-colors`}>
                {canAssignSub && (
                  <td className="px-4 py-3.5 text-center">
                    <input type="checkbox" checked={selectedSubIds.has(r.id)} onChange={() => toggleSelectSub(r.id)}
                      className="w-4 h-4 rounded cursor-pointer accent-[#DB2777]" />
                  </td>
                )}
                <td className="px-4 py-3.5 whitespace-nowrap text-xs sm:text-sm">{thaiDate(r.substitute_date)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap text-xs sm:text-sm font-bold text-[#DB2777]">{r.slot_label??"-"}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm whitespace-nowrap">{r.room_name??"-"}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm font-medium">{r.subject_name??"-"}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm font-medium whitespace-nowrap">{fullName(r.absent_teacher)}</td>
                <td className="px-4 py-3.5 text-xs sm:text-sm font-semibold text-emerald-700 whitespace-nowrap">{fullName(r.substitute_teacher)}</td>
                <td className="px-4 py-3.5 text-center text-xs sm:text-sm font-bold">{formatHoursDisplay(Number(r.hours_count))}</td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border inline-block ${SOURCE_LABEL[src].cls}`}>
                    {SOURCE_LABEL[src].label}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border inline-block ${STATUS_SUB[r.status]?.cls}`}>
                    {STATUS_SUB[r.status]?.label??r.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
  {r.absent_teacher_id === user?.id && r.status !== "cancelled" && r.substitute_teacher_id && !hasActiveRepayForSub(r) ? (
    <button
      onClick={() => {
        setSwapMode("repay");
        setSwapFixedTargetTeacherId(r.substitute_teacher_id);
        setSwapInitialReason(`ขอแลกคาบคืนให้ ${fullName(r.substitute_teacher)} ที่เคยสอนแทนให้เมื่อ ${thaiDate(r.substitute_date)} (${r.slot_label ?? "-"})`);
        setShowSwapModal(true);
      }}
      className="px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-bold border border-purple-200 transition-colors"
    >
      🔄 แลกคาบคืน
    </button>
  ) : (
    <span className="text-xs text-slate-300">—</span>
  )}
</td>
                {canAssignSub && (
  <td className="px-4 py-3.5 whitespace-nowrap">
    {r.status === "cancelled" ? (
      <button onClick={()=>handleSubDeletePermanent(r.id)}
        className="px-2.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold border border-red-300 transition-colors">
        🗑️ ลบถาวร
      </button>
    ) : r.status === "done" ? (
      <span className="text-xs text-slate-400 font-bold">🔒 ผ่านไปแล้ว แก้ไขไม่ได้</span>
    ) : (
      <div className="flex gap-1.5">
        <button onClick={()=>setEditingSub(r)}
          className="px-2.5 py-1.5 rounded-lg bg-[#FDF2F8] hover:bg-[#FBCFE8] text-[#9D174D] text-xs font-bold border border-[#F9A8D4] transition-colors">
          ✏️ แก้ไข
        </button>
        <button onClick={()=>handleSubCancel(r.id)}
          className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold border border-red-200 transition-colors">
          ✕ ยกเลิก
        </button>
      </div>
    )}
  </td>
)}
              </tr>
            );
          })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: สถิติ/ประวัติ ── */}
        {tab === "stat" && (
  <div className="w-full p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 text-base">📊 สถิติการสอนแทน</h2>
              {canAssignSub && (
                <button onClick={()=>printTeacherSubStat(visibleSubRecords, teachers)}
                  className="px-4 py-2 bg-[#DB2777] hover:bg-[#9D174D] text-white text-sm font-bold rounded-xl flex items-center gap-1.5">
                  🖨️ พิมพ์สถิติ (คิดขั้นเงินเดือน)
                </button>
              )}
            </div>

            {/* My stat card */}
            {!canAssignSub && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label:"คาบที่ขาด/ลา", value: subRecords.filter(r=>r.absent_teacher_id===user.id && r.status!=="cancelled").length, color:"#dc2626", icon:"📋" },
                  { label:"ครั้งที่สอนแทน", value: subRecords.filter(r=>r.substitute_teacher_id===user.id && r.status!=="cancelled").length, color:"#16a34a", icon:"✅" },
                  { label:"ชั่วโมงสอนแทน", value: formatHoursDisplay(subRecords.filter(r=>r.substitute_teacher_id===user.id && r.status!=="cancelled").reduce((s,r)=>s+Number(r.hours_count),0)), color:"#2563eb", icon:"⏰" },
                  { label:"คำขอแลกคาบ", value: mySwaps.length, color:"#7c3aed", icon:"🔄" },
                ].map(c=>(
                  <div key={c.label} className="bg-white rounded-2xl border border-[#FBCFE8] p-4 flex items-center gap-3">
                    <span className="text-3xl">{c.icon}</span>
                    <div>
                      <div className="text-2xl font-black" style={{color:c.color}}>{c.value}</div>
                      <div className="text-xs text-slate-400 font-medium">{c.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* All teachers stat table (admin/grade-head/dept-head) */}
            {canAssignSub && (
              <div className="bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#FCE7F3]">
                  <h3 className="font-bold text-slate-700 text-sm">สรุปรายบุคคล</h3>
                </div>
                {statMap.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-[#EC4899] to-[#EC4899] text-white text-xs">
                          <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                          <th className="px-3 py-3 text-center">คาบที่ขาด</th>
                          <th className="px-3 py-3 text-center">ครั้งสอนแทน</th>
                          <th className="px-3 py-3 text-center">รวมชั่วโมง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statMap.map(([id,s],i)=>(
                          <tr key={id} className={i%2===0?"bg-[#FDF2F8]":"bg-white"}>
                            <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                            <td className="px-3 py-3 text-center text-red-600 font-bold">{s.asAbsent}</td>
                            <td className="px-3 py-3 text-center text-emerald-600 font-bold">{s.asSub}</td>
                            <td className="px-3 py-3 text-center">
                              <span className="font-black text-[#DB2777] text-base">{formatHoursDisplay(s.hours)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ประวัติการแลกคาบ/สอนแทน */}
            <div className="bg-white rounded-2xl border border-[#FBCFE8] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#FCE7F3]">
                <h3 className="font-bold text-slate-700 text-sm">🕘 ประวัติการแลกคาบ/สอนแทนล่าสุด</h3>
                <p className="text-xs text-slate-400 mt-0.5">รวมทั้งคำขอแลกคาบที่ตกลงแล้ว และรายการสอนแทนทุกที่มา (สูงสุด 40 รายการล่าสุด)</p>
              </div>
              {combinedHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีประวัติ</div>
              ) : (
                <div className="divide-y divide-[#FCE7F3] max-h-[480px] overflow-y-auto">
                  {combinedHistory.map(item => {
                    if (item.kind === "swap") {
                      const r = item.data as SwapRequest;
                      return (
                        <div key={item.key} className="px-5 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-purple-50 text-purple-600 border-purple-200">🔄 แลกคาบเพื่อนครู</span>
                              <span className="text-xs text-slate-400">{thaiDate(r.swap_date)}</span>
                            </div>
                            <p className="text-sm font-bold text-slate-800 mt-1">
                              {fullName(r.requester)} <span className="text-slate-400 font-normal">↔</span> {fullName(r.target_teacher)}
                            </p>
                            {r.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{r.reason}</p>}
                          </div>
                        </div>
                      );
                    }
                    const r = item.data as SubRecord;
                    const src = sourceOf(r.note);
                    return (
                      <div key={item.key} className="px-5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${SOURCE_LABEL[src].cls}`}>{SOURCE_LABEL[src].label}</span>
                            <span className="text-xs text-slate-400">{thaiDate(r.substitute_date)} · {r.slot_label ?? "-"}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 mt-1">
                            {fullName(r.absent_teacher)} <span className="text-slate-400 font-normal">→ สอนแทนโดย</span> {fullName(r.substitute_teacher)}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{r.subject_name ?? "ไม่ระบุวิชา"} · {r.room_name ?? ""} · {formatHoursDisplay(Number(r.hours_count))}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showSwapModal && academicYear && (
  <SwapRequestModal
    user={user} allEntries={allEntries} allTeachers={teachers} allTimeSlots={allTimeSlots}
    academicYearId={academicYear.id} homeroomMap={homeroomMap}
    initialReason={swapInitialReason}
    mode={swapMode}
    fixedTargetTeacherId={swapFixedTargetTeacherId}
    editingRequest={editingSwap}
    onSave={async()=>{ setShowSwapModal(false); setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); setEditingSwap(null); await loadData(); }}
    onClose={()=>{ setShowSwapModal(false); setSwapMode("normal"); setSwapFixedTargetTeacherId(undefined); setSwapInitialReason(undefined); setEditingSwap(null); }}
  />
)}
      {assignLeave && academicYear && (
  <AssignSubModal
    leaveRequest={assignLeave}
    teachers={teachers} entries={allEntries} subRecords={subRecords}
    academicYearId={academicYear.id}
    currentUser={user} homeroomMap={homeroomMap} restrictDates={assignRestrictDates}
    allTimeSlots={allTimeSlots}   // ★ เพิ่ม
    onSave={async()=>{ setAssignLeave(null); setAssignRestrictDates(undefined); await loadData(); }}
    onClose={()=>{ setAssignLeave(null); setAssignRestrictDates(undefined); }}
  />
)}
      {editingSub && (
  <EditSubModal
    record={editingSub}
    allEntries={allEntries}
    teachers={teachers}
    currentUser={user}
    onSave={async()=>{ setEditingSub(null); await loadData(); }}
    onClose={()=>setEditingSub(null)}
  />
)}
{editingSwapDate && (
  <EditSwapDateModal
    record={editingSwapDate}
    onSave={handleAdminSwapDateSave}
    onDelete={handleAdminSwapDeleteAny}
    onClose={() => setEditingSwapDate(null)}
  />
)}
      {showManualAssign && academicYear && (
  <ManualAssignModal
    selectableTeachers={manualAssignTeachers}
    allTeachers={teachers}
    entries={allEntries}
    subRecords={subRecords}
    academicYearId={academicYear.id}
    currentUser={user} homeroomMap={homeroomMap}
    onSave={async()=>{ setShowManualAssign(false); await loadData(); }}
    onClose={()=>setShowManualAssign(false)}
  />
)}
    </div>
  );
}