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
const ADMIN_NOTIFY_EMAIL = "admin@khienkhet.ac.th";
const APPROVER_ROLES = ["admin", "director", "deputy_director", "dept_head", "grade_head", "subject_head"];
const NON_TEACHING_ROLES = ["admin", "director", "deputy_director", "staff", "subject_teacher"];

// ★ โรลที่ถือว่าเป็น "แอดมิน" (แก้ตารางสอนได้ทุกวิชาโดยตรง ไม่ต้องรออนุมัติ เหมือน admin@khienkhet.ac.th)
// นับ director/deputy_director เป็นแอดมินเสมอ และนับทุกโรลที่ "มีคำว่า admin" อยู่ในชื่อ (เช่น admin, subject_admin, it_admin ฯลฯ)
function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  if (role === "director" || role === "deputy_director") return true;
  return role.toLowerCase().includes("admin");
}

type TimeSlot   = { id: string; slot_number: number; start_time: string; end_time: string; slot_label?: string; is_break: boolean; schedule_type?: string };
type Subject = { id: string; subject_code: string; name_th: string; subject_group?: string; periods_per_week?: number };
type Teacher = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string; position?: string;
  role?: string; grade_level?: string; department_id?: string; extra_roles?: string[]; can_arrange_schedule?: boolean;
};
type UserProfile = {
  id: string; title?: string; first_name?: string; last_name?: string; full_name?: string;
  email: string; role: string; position?: string; grade_level?: string;
  extra_roles?: string[]; department_id?: string; can_arrange_schedule?: boolean;
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
type AutoScheduleParams = {
  classroom: Classroom;
  subjectId: string;
  teacherId: string;
  teacherId2?: string | null;
  periodsNeeded: number;
  entries: TimetableEntry[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
  teachers: Teacher[];
  lockedPeriods: { grade_label: string; day_of_week: number; slot_label: string }[];
  gradeLabel: string;
  skipBuildingCheck?: boolean; // ★ ใหม่: ห้องปฏิบัติการ — ครูไม่เดินย้ายอาคาร ไม่ต้องเช็ค
};

function computeAutoScheduleSlots(p: AutoScheduleParams): { assignments: { day_of_week: number; time_slot: TimeSlot }[]; warnings: string[] } {
  const { classroom, subjectId, teacherId, teacherId2, periodsNeeded, entries, classrooms,
    timeSlots, teachers, lockedPeriods, gradeLabel, skipBuildingCheck } = p;

  const teachingSlots = timeSlots.filter(s => !s.is_break).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const myBuildingGroup = getBuildingGroup(classroom);
  const involvedTeacherIds = [teacherId, teacherId2].filter(Boolean) as string[];

  function isTeacherGradeHead(tid: string): boolean {
    const t = teachers.find(x => x.id === tid);
    return !!t?.extra_roles?.includes("grade_head");
  }

  // ★ หัวหน้าสาย ว่าง 3 คาบแรกวันพุธเสมอ (day_of_week = 3)
  function isWednesdayReserved(day: number, slot: TimeSlot): boolean {
    if (day !== 3) return false;
    const first3 = teachingSlots.slice(0, 3).map(s => s.id);
    if (!first3.includes(slot.id)) return false;
    return involvedTeacherIds.some(isTeacherGradeHead);
  }

  function isLocked(day: number, slot: TimeSlot): boolean {
    return lockedPeriods.some(lp => lp.grade_label === gradeLabel && lp.day_of_week === day && lp.slot_label === slot.slot_label);
  }

  function slotStartOf(id: string) { return timeSlots.find(s => s.id === id)?.start_time?.slice(0, 5); }

  function classroomOccupied(day: number, slot: TimeSlot): boolean {
    const start = slot.start_time.slice(0, 5);
    return entries.some(e => e.classroom_id === classroom.id && e.day_of_week === day &&
      (e.time_slot_id === slot.id || slotStartOf(e.time_slot_id) === start));
  }

  function subjectAlreadyOnDay(day: number, extra: { day_of_week: number }[]): boolean {
    const already = entries.some(e => e.classroom_id === classroom.id && e.day_of_week === day && e.subject_id === subjectId);
    return already || extra.some(a => a.day_of_week === day);
  }

  function teacherEntriesOnDay(tid: string, day: number): TimetableEntry[] {
    return entries.filter(e => e.day_of_week === day && (e.teacher_id === tid || e.teacher_id_2 === tid));
  }

  function teacherBusyAtSlot(tid: string, day: number, slot: TimeSlot): boolean {
    const start = slot.start_time.slice(0, 5);
    return teacherEntriesOnDay(tid, day).some(e => e.time_slot_id === slot.id || slotStartOf(e.time_slot_id) === start);
  }

  function teacherDailyCountReached(tid: string, day: number, extraCountToday: number): boolean {
    return teacherEntriesOnDay(tid, day).length + extraCountToday >= 5; // ★ ไม่เกิน 5 คาบ/วัน
  }

    // ★ ถ้าครูมีคาบติดกัน (ก่อน/หลัง) ต้องอยู่กลุ่มอาคารเดียวกับห้องนี้
  function buildingConflict(tid: string, day: number, slotIdx: number): boolean {
    if (skipBuildingCheck) return false; // ★ ห้องปฏิบัติการ: ครูอยู่ประจำที่ นักเรียนมาหาครู ไม่ต้องเช็คอาคาร
    const neighborIdxs = [slotIdx - 1, slotIdx + 1].filter(i => i >= 0 && i < teachingSlots.length);
    for (const idx of neighborIdxs) {
      const neighborSlot = teachingSlots[idx];
      const start = neighborSlot.start_time.slice(0, 5);
      const otherEntry = teacherEntriesOnDay(tid, day).find(e => e.time_slot_id === neighborSlot.id || slotStartOf(e.time_slot_id) === start);
      if (otherEntry) {
        const otherRoom = classrooms.find(c => c.id === otherEntry.classroom_id);
        if (otherRoom && otherRoom.id !== classroom.id && getBuildingGroup(otherRoom) !== myBuildingGroup) return true;
      }
    }
    return false;
  }

  const assignments: { day_of_week: number; time_slot: TimeSlot }[] = [];
  const warnings: string[] = [];
  const days = [1, 2, 3, 4, 5];
  const perDayCountThisRun: Record<string, number> = {}; // key: `${tid}-${day}`
  let dayPointer = 0;
  let guard = 0;

  while (assignments.length < periodsNeeded && guard < 300) {
    guard++;
    const day = days[dayPointer % days.length];
    dayPointer++;

    if (subjectAlreadyOnDay(day, assignments)) continue; // ★ ไม่จัดวิชาเดียวกันซ้ำในวันเดียวกัน

    let placed = false;
    for (let idx = 0; idx < teachingSlots.length; idx++) {
      const slot = teachingSlots[idx];
      if (classroomOccupied(day, slot)) continue;
      if (isLocked(day, slot)) continue;
      if (isWednesdayReserved(day, slot)) continue;
      if (involvedTeacherIds.some(tid => teacherBusyAtSlot(tid, day, slot))) continue;
      if (involvedTeacherIds.some(tid => teacherDailyCountReached(tid, day, perDayCountThisRun[`${tid}-${day}`] ?? 0))) continue;
      if (involvedTeacherIds.some(tid => buildingConflict(tid, day, idx))) continue;

      assignments.push({ day_of_week: day, time_slot: slot });
      involvedTeacherIds.forEach(tid => {
        const k = `${tid}-${day}`;
        perDayCountThisRun[k] = (perDayCountThisRun[k] ?? 0) + 1;
      });
      placed = true;
      break;
    }
    if (!placed && dayPointer > days.length * 4) {
      warnings.push(`หาคาบว่างที่ตรงเงื่อนไขไม่พอ (จัดได้ ${assignments.length}/${periodsNeeded} คาบ) กรุณาจัดที่เหลือด้วยตนเอง`);
      break;
    }
  }

  return { assignments, warnings };
}
type BatchAutoScheduleParams = {
  classroomsOrdered: Classroom[]; // ห้องที่เลือก เรียงลำดับที่จะจัดแล้ว (ห้องเรียน = เรียงตามอาคาร, ห้องแล็บ = ตามที่ผู้ใช้เลือก 1→7 หรือ 7→1)
  subjectId: string;
  teacherId: string;
  teacherId2?: string | null;
  periodsPerRoom: number;       // จำนวนคาบ/สัปดาห์ ต่อ 1 ห้อง
  roomKind: "lab" | "classroom";
  entries: TimetableEntry[];    // คาบทั้งหมดที่มีอยู่แล้ว (ทุกห้อง)
  allClassrooms: Classroom[];
  allTimeSlots: TimeSlot[];     // time_slots จาก DB ทั้งหมด (ยังไม่ผ่าน buildRoomSlots)
  teachers: Teacher[];
  lockedPeriods: { grade_label: string; day_of_week: number; slot_label: string }[];
};
function computeBatchAutoSchedule(p: BatchAutoScheduleParams) {
  const results: { classroom: Classroom; assignments: { day_of_week: number; time_slot: TimeSlot }[]; warnings: string[] }[] = [];
  let workingEntries = [...p.entries];

  for (const classroom of p.classroomsOrdered) {
    const gradeLabel = getClassroomGradeLabel(classroom);
    const roomSlots = buildRoomSlots(classroom.schedule_type, p.allTimeSlots);
    const result = computeAutoScheduleSlots({
      classroom, subjectId: p.subjectId, teacherId: p.teacherId, teacherId2: p.teacherId2 ?? null,
      periodsNeeded: p.periodsPerRoom,
      entries: workingEntries,
      classrooms: p.allClassrooms,
      timeSlots: roomSlots,
      teachers: p.teachers,
      lockedPeriods: p.lockedPeriods,
      gradeLabel,
      skipBuildingCheck: p.roomKind === "lab",
    });
    results.push({ classroom, assignments: result.assignments, warnings: result.warnings });

    const fakeEntries: TimetableEntry[] = result.assignments.map(a => ({
      id: `pending-${classroom.id}-${a.time_slot.id}`,
      classroom_id: classroom.id, subject_id: p.subjectId,
      teacher_id: p.teacherId, teacher_id_2: p.teacherId2 ?? undefined,
      day_of_week: a.day_of_week, time_slot_id: a.time_slot.id,
      academic_year_id: classroom.academic_year_id ?? "",
    }));
    workingEntries = [...workingEntries, ...fakeEntries];
  }
  return results;
}
const GRADE_LABELS_MS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const ALL_GRADE_LABELS = ["อ.2", "อ.3", "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

function getClassroomGradeLabel(c: { room_name?: string }): string {
  const m = (c.room_name ?? "").match(/([ปมอ])\.?(\d+)/);
  return m ? `${m[1]}.${m[2]}` : "";
}

// ★ ใหม่: ห้อง ม.1–ม.6 เท่านั้นที่ต้องแยกเทอม 1/2 · อ./ป. แสดงรวมทุกเทอมเสมอ
function isSecondaryClassroom(c: { room_name?: string }): boolean {
  return getClassroomGradeLabel(c).startsWith("ม.");
}

// ★ ใหม่: ห้องนี้ (ผูกกับ academic_year_id หนึ่งแถว) อยู่เทอมไหน — ไม่ระบุ = เทอม 1
function getSemesterForClassroom(room: Classroom, yearsRaw: AcademicYearRaw[]): number {
  const yr = yearsRaw.find(y => y.id === room.academic_year_id);
  return yr?.semester ?? 1;
}
// ★ ใหม่: ปีการศึกษา (year_name) ของห้องนี้
function getYearNameForClassroom(room: Classroom, yearsRaw: AcademicYearRaw[]): string {
  return yearsRaw.find(y => y.id === room.academic_year_id)?.year_name ?? "";
}
// ★ ใหม่: กรองห้องตามเทอมที่เลือก — มีผลเฉพาะ ม.1–ม.6, อ./ป. ผ่านฟิลเตอร์นี้เสมอ
function filterRoomsBySemester(rooms: Classroom[], semester: number, yearsRaw: AcademicYearRaw[]): Classroom[] {
  return rooms.filter(r => !isSecondaryClassroom(r) || getSemesterForClassroom(r, yearsRaw) === semester);
}
// ★ ใหม่: กลุ่มอาคาร/ชั้น derive จากเลขห้องอัตโนมัติ — ห้อง 1-3 กลุ่มเดียวกัน, 4-6 อีกกลุ่ม ฯลฯ
// ★ แก้: อาคาร A = ห้อง 1-3, อาคาร B = ห้อง 4 เป็นต้นไป (ตามที่ระบุ ไม่ใช่แบ่งทุก 3 ห้อง)
function getBuildingGroup(room: Classroom): number {
  const n = room.room_number ?? 0;
  return n <= 3 ? 1 : 2;
}

const SCHEDULABLE_GRADE_LABELS = ["ป.1","ป.2","ป.3","ป.4","ป.5","ป.6","ม.1","ม.2","ม.3","ม.4","ม.5","ม.6"];

// ★ ใหม่: เช็คว่าห้องนี้จัดคาบครบตามหลักสูตร (periods_per_week ของแต่ละวิชา) หรือยัง
function classroomCompletionStatus(classroom: Classroom, subjects: Subject[], entries: TimetableEntry[]) {
  const gradeLabel = getClassroomGradeLabel(classroom);
  const applicable = subjects.filter(s => parseGradeFromSubjectCode(s.subject_code)?.includes(gradeLabel));
  const roomEntries = entries.filter(e => e.classroom_id === classroom.id);
  let totalRequired = 0, totalScheduled = 0;
  const missing: { subject: Subject; missingPeriods: number }[] = [];
  applicable.forEach(s => {
    const required = s.periods_per_week ?? 0;
    if (required <= 0) return;
    const scheduled = roomEntries.filter(e => e.subject_id === s.id).length;
    totalRequired += required;
    totalScheduled += Math.min(scheduled, required);
    if (scheduled < required) missing.push({ subject: s, missingPeriods: required - scheduled });
  });
  return { totalRequired, totalScheduled, missing };
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
function GradeHeadPermissionModal({ teachers, onClose, onToggle }: {
  teachers: Teacher[]; onClose: () => void; onToggle: (teacherId: string, value: boolean) => Promise<void>;
}) {
  const gradeHeads = teachers.filter(t => t.extra_roles?.includes("grade_head"));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-4">
          <h3 className="text-lg font-black text-white">🔑 สิทธิ์จัดตารางสายชั้น</h3>
          <p className="text-sm text-white/70">อนุญาตให้หัวหน้าสายจัดตารางสอนได้เอง (แอดมินจัดได้เสมออยู่แล้ว)</p>
        </div>
        <div className="p-5 space-y-2 max-h-[60vh] overflow-y-auto">
          {gradeHeads.length === 0 && <p className="text-center text-slate-400 py-6 text-sm">ยังไม่มีผู้ใช้ role หัวหน้าสาย</p>}
          {gradeHeads.map(t => (
            <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="font-bold text-slate-800 text-sm">{displayName(t)}</p>
                <p className="text-xs text-slate-400">สาย {t.grade_level ?? "—"}</p>
              </div>
              <button onClick={() => onToggle(t.id, !t.can_arrange_schedule)}
                className={`w-12 h-7 rounded-full transition-all relative ${t.can_arrange_schedule ? "bg-emerald-500" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${t.can_arrange_schedule ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5"><button onClick={onClose} className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ปิด</button></div>
      </div>
    </div>
  );
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
// ★ แปลงรหัสวิชา (เช่น ว11282, ว31101, ว30274) เป็นระดับชั้นที่วิชานี้ใช้ได้
// คืนค่าเป็น array เพราะวิชารหัส 30xxx (เลข digit ที่ 2 = 0) คือวิชาเลือกเสรี ม.ปลาย
// ที่ใช้ร่วมกันได้ทั้ง ม.4, ม.5, ม.6 ไม่ใช่แค่ชั้นใดชั้นหนึ่ง
function parseGradeFromSubjectCode(code?: string): string[] | undefined {
  if (!code) return undefined;
  const match = code.match(/[0-9]+/);
  if (!match || match[0].length < 2) return undefined;
  const digits = match[0];
  const group = digits[0];
  const level = parseInt(digits[1], 10);
  switch (group) {
    case "0": return (level === 2 || level === 3) ? [`อ.${level}`] : undefined;
    case "1": return (level >= 1 && level <= 6) ? [`ป.${level}`] : undefined;
    case "2": return (level >= 1 && level <= 3) ? [`ม.${level}`] : undefined;
    case "3":
      // ★ เลข 0 = รหัสวิชาเลือกเสรี/เพิ่มเติม ม.ปลาย ใช้ร่วมกันได้ทั้ง ม.4–ม.6 (เช่น ว30274)
      if (level === 0) return ["ม.4", "ม.5", "ม.6"];
      return (level >= 1 && level <= 3) ? [`ม.${level + 3}`] : undefined;
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
    // ✅ FIX: จับคู่ schedule_type ก่อนเสมอ (กันเคสเวลาเดียวกันแต่คนละ schedule_type ชนกัน)
    // ถ้าไม่เจอที่ schedule_type ตรงกัน ค่อย fallback ไปหาแค่ start_time (รองรับ DB เก่าที่ไม่มี schedule_type)
    let dbSlot = allDbSlots.find(
      s => s.start_time.slice(0, 5) === tmplSlot.start_time && s.schedule_type === type
    );
    if (!dbSlot) {
      dbSlot = allDbSlots.find(s => s.start_time.slice(0, 5) === tmplSlot.start_time);
    }
    if (dbSlot) {
      return {
        ...dbSlot,
        slot_label: tmplSlot.slot_label,
        is_break: tmplSlot.is_break,
        end_time: tmplSlot.end_time,
      };
    }
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
// ✅ ดึงข้อมูลทุกแถวจาก Supabase แบบไม่จำกัดที่ 1000 แถว (วนดึงทีละหน้าจนครบ)
async function fetchAllRows<T = any>(query: any): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
function LockedPeriodsModal({ lockedPeriods, academicYearId, onClose, onReload }: {
  lockedPeriods: { id: string; grade_label: string; day_of_week: number; slot_label: string; label: string }[];
  academicYearId: string; onClose: () => void; onReload: () => Promise<void>;
}) {
  const [grade, setGrade] = useState(SCHEDULABLE_GRADE_LABELS[0]);
  const [day, setDay] = useState(1);
  const [slotLabel, setSlotLabel] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const type = scheduleTypeForGradeLabel(grade);
  const tmpl = SCHEDULE_TEMPLATES.find(t => t.key === type)!;
  const periodSlots = tmpl.slots.filter(s => !s.is_break);
  const gradeLocks = lockedPeriods.filter(l => l.grade_label === grade);

  async function addLock() {
    if (!slotLabel || !label.trim()) { alert("กรุณาเลือกคาบและกรอกชื่อกิจกรรม"); return; }
    setSaving(true);
    await (supabase.from("locked_periods") as any).insert([{ grade_label: grade, day_of_week: day, slot_label: slotLabel, label: label.trim(), academic_year_id: academicYearId }]);
    setLabel(""); await onReload(); setSaving(false);
  }
  async function removeLock(id: string) {
    if (!confirm("ยกเลิกการล็อกคาบนี้?")) return;
    await supabase.from("locked_periods").delete().eq("id", id);
    await onReload();
  }

  const inp = "bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm font-bold focus:border-rose-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-rose-600 px-6 py-4">
          <h3 className="text-lg font-black text-white">🔒 ล็อกคาบ</h3>
          <p className="text-sm text-white/70">ระบบจัดตารางอัตโนมัติจะข้ามคาบที่ล็อกไว้เสมอ</p>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-2">
            <select value={grade} onChange={e => { setGrade(e.target.value); setSlotLabel(""); }} className={inp}>
              {SCHEDULABLE_GRADE_LABELS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={day} onChange={e => setDay(Number(e.target.value))} className={inp}>
              {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
            <select value={slotLabel} onChange={e => setSlotLabel(e.target.value)} className={inp}>
              <option value="">— เลือกคาบ —</option>
              {periodSlots.map(s => <option key={s.slot_label} value={s.slot_label}>{s.slot_label} ({s.start_time}-{s.end_time})</option>)}
            </select>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="เช่น ลูกเสือ-เนตรนารี" className={inp} />
          </div>
          <button onClick={addLock} disabled={saving} className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm disabled:opacity-50">
            {saving ? "⏳..." : "+ เพิ่มคาบล็อก"}
          </button>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {gradeLocks.length === 0 ? <div className="text-center py-6 text-slate-400 text-sm">ยังไม่มีคาบล็อกสำหรับชั้นนี้</div> :
              gradeLocks.map(l => (
                <div key={l.id} className="px-4 py-3 flex items-center justify-between gap-2 bg-white">
                  <p className="text-sm font-bold text-slate-700">🔒 {DAYS[l.day_of_week - 1]} · {l.slot_label} · {l.label}</p>
                  <button onClick={() => removeLock(l.id)} className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-black">ลบ</button>
                </div>
              ))}
          </div>
        </div>
        <div className="px-5 pb-5 pt-2 border-t border-slate-100"><button onClick={onClose} className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ปิด</button></div>
      </div>
    </div>
  );
}
function BatchAutoArrangeModal({ gradeLabel: initialGrade, classroomsAll, subjects, teachers,
  entries, allTimeSlots, lockedPeriods, onClose, onArrange }: {
  gradeLabel?: string;
  classroomsAll: Classroom[]; // ห้องทั้งหมดในปี/เทอมที่กำลังดูอยู่
  subjects: Subject[]; teachers: Teacher[];
  entries: TimetableEntry[]; allTimeSlots: TimeSlot[];
  lockedPeriods: { grade_label: string; day_of_week: number; slot_label: string }[];
  onClose: () => void;
  onArrange: (jobs: { classroom: Classroom; assignments: { day_of_week: number; time_slot: TimeSlot }[] }[], subjectId: string, teacherId: string, teacherId2?: string) => Promise<void>;
}) {
  const [grade, setGrade] = useState(initialGrade ?? SCHEDULABLE_GRADE_LABELS[0]);
  const gradeRooms = classroomsAll
    .filter(c => getClassroomGradeLabel(c) === grade)
    .sort((a, b) => (a.room_number ?? 0) - (b.room_number ?? 0));

  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [teacherId2, setTeacherId2] = useState("");
  const [periodsPerRoom, setPeriodsPerRoom] = useState<number | "">("");
  const [roomKind, setRoomKind] = useState<"classroom" | "lab">("classroom");
  const [labOrder, setLabOrder] = useState<"asc" | "desc">("asc");
  const [preview, setPreview] = useState<{ classroom: Classroom; assignments: { day_of_week: number; time_slot: TimeSlot }[]; warnings: string[] }[] | null>(null);
  const [running, setRunning] = useState(false);

  const applicableSubjects = subjects.filter(s => parseGradeFromSubjectCode(s.subject_code)?.includes(grade));
  const subject = subjects.find(s => s.id === subjectId);
  const defaultPeriods = subject?.periods_per_week ?? "";

  function toggleRoom(id: string) {
    setSelectedRoomIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setPreview(null);
  }
  function toggleAllRooms() {
    setSelectedRoomIds(prev => prev.length === gradeRooms.length ? [] : gradeRooms.map(r => r.id));
    setPreview(null);
  }

  function orderedSelectedRooms(): Classroom[] {
    const selected = gradeRooms.filter(r => selectedRoomIds.includes(r.id));
    if (roomKind === "lab") {
      const sorted = [...selected].sort((a, b) => (a.room_number ?? 0) - (b.room_number ?? 0));
      return labOrder === "asc" ? sorted : sorted.reverse();
    }
    // ★ ห้องเรียนทั่วไป: จัดกลุ่มอาคารให้ติดกันเสมอ (1-3 อาคารหนึ่ง, 4 ขึ้นไปอีกอาคารหนึ่ง)
    return [...selected].sort((a, b) => {
      const ga = getBuildingGroup(a), gb = getBuildingGroup(b);
      if (ga !== gb) return ga - gb;
      return (a.room_number ?? 0) - (b.room_number ?? 0);
    });
  }

  function runPreview() {
    const periods = periodsPerRoom === "" ? Number(defaultPeriods || 0) : Number(periodsPerRoom);
    if (!subjectId || !teacherId || selectedRoomIds.length === 0 || periods <= 0) {
      alert("กรุณาเลือกวิชา ครู ห้องอย่างน้อย 1 ห้อง และจำนวนคาบ/ห้อง");
      return;
    }
    const ordered = orderedSelectedRooms();
    const results = computeBatchAutoSchedule({
      classroomsOrdered: ordered, subjectId, teacherId, teacherId2: teacherId2 || null,
      periodsPerRoom: periods, roomKind, entries, allClassrooms: classroomsAll,
      allTimeSlots, teachers, lockedPeriods,
    });
    setPreview(results);
  }

  async function confirmArrange() {
    if (!preview) return;
    setRunning(true);
    await onArrange(preview.map(r => ({ classroom: r.classroom, assignments: r.assignments })), subjectId, teacherId, teacherId2 || undefined);
    setRunning(false);
    onClose();
  }

  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-violet-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-violet-600 px-6 py-4">
          <h3 className="text-lg font-black text-white">⚡ จัดตารางอัตโนมัติ (หลายห้องพร้อมกัน)</h3>
          <p className="text-sm text-white/70">เลือกชั้น → ห้อง → วิชา แล้วให้ระบบจัดคาบให้ทันที</p>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">ชั้น *</label>
              <select value={grade} onChange={e => { setGrade(e.target.value); setSelectedRoomIds([]); setSubjectId(""); setPreview(null); }} className={inp}>
                {SCHEDULABLE_GRADE_LABELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">รายวิชา *</label>
              <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setPreview(null); }} className={inp}>
                <option value="">— เลือกรายวิชา —</option>
                {applicableSubjects.map(s => <option key={s.id} value={s.id}>{s.subject_code} {s.name_th}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black text-slate-500 uppercase">ห้องที่จะจัด * ({selectedRoomIds.length}/{gradeRooms.length})</label>
              <button onClick={toggleAllRooms} className="text-xs font-black text-violet-600">เลือกทั้งหมด/ยกเลิก</button>
            </div>
            <div className="flex flex-wrap gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl p-3">
              {gradeRooms.length === 0 && <p className="text-xs text-slate-400">ไม่พบห้องของชั้นนี้</p>}
              {gradeRooms.map(r => (
                <button key={r.id} onClick={() => toggleRoom(r.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black border-2 ${selectedRoomIds.includes(r.id) ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
                  {r.room_name ?? `ห้อง ${r.room_number}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">ครูผู้สอน คนที่ 1 *</label>
              <select value={teacherId} onChange={e => { setTeacherId(e.target.value); setPreview(null); }} className={inp}>
                <option value="">— เลือกครู —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">ครูผู้สอน คนที่ 2 (ถ้ามี)</label>
              <select value={teacherId2} onChange={e => { setTeacherId2(e.target.value); setPreview(null); }} className={inp}>
                <option value="">— ไม่มี —</option>
                {teachers.filter(t => t.id !== teacherId).map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">
              จำนวนคาบ/สัปดาห์ ต่อ 1 ห้อง {subject && <span className="text-slate-400 font-normal normal-case">(วิชานี้ตั้งไว้ {subject.periods_per_week ?? "ยังไม่ตั้งค่า"} คาบ/สัปดาห์)</span>}
            </label>
            <input type="number" min={1} value={periodsPerRoom === "" ? "" : periodsPerRoom}
              onChange={e => { setPeriodsPerRoom(e.target.value === "" ? "" : Number(e.target.value)); setPreview(null); }}
              placeholder={String(defaultPeriods || 1)} className={inp} />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">ประเภทห้องเรียน *</label>
            <div className="flex gap-2">
              <button onClick={() => { setRoomKind("classroom"); setPreview(null); }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 ${roomKind === "classroom" ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
                🏫 ห้องเรียนทั่วไป (สอนถึงห้องนักเรียน)
              </button>
              <button onClick={() => { setRoomKind("lab"); setPreview(null); }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 ${roomKind === "lab" ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
                🔬 ห้องปฏิบัติการ (นักเรียนมาหาครู)
              </button>
            </div>
            {roomKind === "classroom" ? (
              <p className="text-xs text-slate-400 mt-1.5">💡 ระบบจะเรียงห้อง 1–3 และ 4 ขึ้นไปให้อยู่ติดกันเสมอ (คนละอาคาร ครูเดินสอนต่อเนื่องข้ามอาคารไม่ได้)</p>
            ) : (
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setLabOrder("asc"); setPreview(null); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-black border-2 ${labOrder === "asc" ? "bg-violet-100 border-violet-400 text-violet-700" : "bg-white border-slate-200 text-slate-500"}`}>
                  เรียง 1 → 7
                </button>
                <button onClick={() => { setLabOrder("desc"); setPreview(null); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-black border-2 ${labOrder === "desc" ? "bg-violet-100 border-violet-400 text-violet-700" : "bg-white border-slate-200 text-slate-500"}`}>
                  เรียง 7 → 1
                </button>
              </div>
            )}
          </div>

          <button onClick={runPreview} className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm">
            🔍 รันหาคาบว่างให้ดูก่อน
          </button>

          {preview && (
            <div className="space-y-2">
              {preview.map(r => (
                <div key={r.classroom.id} className="bg-violet-50 border-2 border-violet-200 rounded-xl p-3">
                  <p className="text-xs font-black text-violet-700 mb-1.5">{r.classroom.room_name} — จัดได้ {r.assignments.length} คาบ</p>
                  <div className="space-y-0.5">
                    {r.assignments.map((a, i) => (
                      <p key={i} className="text-xs text-slate-600">• {DAYS[a.day_of_week - 1]} · {a.time_slot.slot_label} ({formatTime(a.time_slot.start_time)}-{formatTime(a.time_slot.end_time)})</p>
                    ))}
                  </div>
                  {r.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600 font-bold mt-1">⚠️ {w}</p>)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 pt-2 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={confirmArrange} disabled={!preview || running}
            className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-50">
            {running ? "⏳ กำลังบันทึก..." : `✅ ยืนยันจัดทั้งหมด ${preview?.reduce((s, r) => s + r.assignments.length, 0) ?? 0} คาบ`}
          </button>
        </div>
      </div>
    </div>
  );
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
  const isHomeroomOnly = !isAdminRole(currentUser.role)
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
  ? subjects.filter(s => parseGradeFromSubjectCode(s.subject_code)?.includes(roomGradeLabel))
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

function TeacherCellModal({ teacher, day, slot, entry, classrooms, subjects, teachers, academicYearId, onSave, onDelete, onClose }: {
  teacher: Teacher; day: number; slot: TimeSlot; entry?: TimetableEntry;
  classrooms: Classroom[]; subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  onSave: (d: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [classroomId, setClassroomId] = useState(entry?.classroom_id ?? "");
  const [subjectId,   setSubjectId]   = useState(entry?.subject_id ?? "");
  const [teacherId2,  setTeacherId2]  = useState(entry?.teacher_id_2 ?? "");
  const [loading,     setLoading]     = useState(false);
  const dc = DAY_COLORS[day - 1];

  const selectedClassroom = classrooms.find(c => c.id === classroomId);
  function roomGradeLabel(c?: Classroom) {
    const m = (c?.room_name ?? "").match(/([ปมอ])\.?(\d+)/);
    return m ? `${m[1]}.${m[2]}` : "";
  }
  const gLabel = roomGradeLabel(selectedClassroom);
  const filteredSubjects = gLabel
  ? subjects.filter(s => parseGradeFromSubjectCode(s.subject_code)?.includes(gLabel))
  : subjects;
  const baseSubjects = filteredSubjects.length > 0 ? filteredSubjects : subjects;
  const selectableTeacher2 = teachers.filter(t => t.id !== teacher.id);

  async function handleSubmit() {
    if (!classroomId || !subjectId) { alert("กรุณาเลือกห้องเรียนและวิชา"); return; }
    setLoading(true);
    await onSave({
      id: entry?.id,
      classroom_id: classroomId,
      subject_id: subjectId,
      teacher_id: teacher.id,          // ★ ล็อกครูคนที่ 1 เป็นครูที่เลือกไว้เสมอ
      teacher_id_2: teacherId2 || null,
      day_of_week: day, time_slot_id: slot.id, time_slot: slot,
      academic_year_id: academicYearId,
    });
    setLoading(false);
  }

  const inp = "w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm font-bold focus:border-indigo-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`${dc.header} px-6 py-4`}>
          <p className="text-sm text-white/80">{DAYS[day - 1]} · {slot.slot_label} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}</p>
          <h3 className="text-lg font-black text-white mt-0.5">{entry ? "✏️ แก้ไขคาบเรียน" : "➕ เพิ่มคาบเรียน"}</h3>
          <p className="text-sm text-white/70">ครู: {displayName(teacher)}</p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">ห้องเรียน *</label>
            <select value={classroomId} onChange={e => { setClassroomId(e.target.value); setSubjectId(""); }} className={inp}>
              <option value="">— เลือกห้องเรียน —</option>
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.grade_group} {c.room_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">รายวิชา *</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={inp} disabled={!classroomId}>
              <option value="">— เลือกรายวิชา —</option>
              {baseSubjects.map(s => <option key={s.id} value={s.id}>{s.subject_code} {s.name_th}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              ครูผู้สอน คนที่ 2 <span className="text-slate-400 font-normal normal-case">(ถ้ามี)</span>
            </label>
            <select value={teacherId2} onChange={e => setTeacherId2(e.target.value)} className={inp}>
              <option value="">— ไม่มีครูคนที่ 2 —</option>
              {selectableTeacher2.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
            </select>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
          {entry && onDelete && (
            <button onClick={async () => { if (confirm("ลบคาบนี้?")) { setLoading(true); await onDelete(entry.id); setLoading(false); } }}
              className="px-4 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-black text-sm">🗑️ ลบ</button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-black text-sm">ยกเลิก</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-[2] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:opacity-50">
            {loading ? "⏳..." : "💾 บันทึก"}
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

function GradeScheduleManager({ currentUser, isAdmin, teachers, classrooms, subjects, timeSlots, entries, academicYearId, onSaveEntry, onDeleteEntry }: {
  currentUser: UserProfile; isAdmin: boolean; teachers: Teacher[]; classrooms: Classroom[];
  subjects: Subject[]; timeSlots: TimeSlot[]; entries: TimetableEntry[]; academicYearId: string;
  onSaveEntry: (d: any) => Promise<void>; onDeleteEntry: (id: string) => Promise<void>;
}) {
  const allGradeLevels = [...new Set(teachers.map(t => t.grade_level).filter(Boolean))] as string[];
  const [gradeFilter, setGradeFilter] = useState(isAdmin ? (allGradeLevels[0] ?? "") : (currentUser.grade_level ?? ""));
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [cellModal, setCellModal] = useState<{ day: number; slot: TimeSlot; entry?: TimetableEntry } | null>(null);

  const gradeTeachers = teachers.filter(t => t.grade_level === gradeFilter);
  const teacher = teachers.find(t => t.id === selectedTeacherId);
  const myEntries = entries.filter(e => e.teacher_id === selectedTeacherId || e.teacher_id_2 === selectedTeacherId);

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  return (
    <div>
      <div className="mb-4 flex gap-2 flex-wrap items-center">
        {isAdmin && (
          <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setSelectedTeacherId(""); }}
            className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold">
            {allGradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}
          className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold flex-1 min-w-[200px]">
          <option value="">— เลือกครูในสาย {gradeFilter} —</option>
          {gradeTeachers.map(t => <option key={t.id} value={t.id}>{displayName(t)}</option>)}
        </select>
      </div>

      {!teacher ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          กรุณาเลือกครูเพื่อจัดตารางสอน
        </div>
      ) : (
        <>
          <h3 className="font-black text-slate-700 mb-3">📅 ตารางสอน: {displayName(teacher)} ({myEntries.length} คาบ)</h3>
          {(["kindergarten", "primary", "junior", "senior"] as const).map(type => {
            const slots = buildRoomSlots(type, timeSlots);
            const roomsOfType = classrooms.filter(c => (c.schedule_type ?? "primary") === type);
            const entriesOfType = myEntries.filter(e => roomsOfType.some(r => r.id === e.classroom_id));
            const label = SCHEDULE_TEMPLATES.find(t => t.key === type)?.label ?? type;

            return (
              <div key={type} className="mb-6">
                <p className="text-xs font-black text-slate-400 uppercase mb-2">{label}</p>
                <div className="w-full rounded-2xl border border-slate-200 shadow-sm bg-white overflow-x-auto">
                  <table className="border-collapse w-full" style={{ minWidth: "600px" }}>
                    <thead>
                      <tr>
                        <th className="px-2 py-3 bg-slate-50 border-b-2 border-r-2 border-slate-200 text-slate-400 font-black text-xs uppercase text-center sticky left-0 z-10">วัน / คาบ</th>
                        {slots.map(slot => (
                          <th key={slot.id} className={`px-1 py-2 border-b-2 border-r border-slate-200 text-center font-black ${slot.is_break ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-600"}`}>
                            <div className="text-xs">{slot.slot_label}</div>
                            <div className="text-[10px] font-normal text-slate-400">{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</div>
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
                            </td>
                            {slots.map(slot => {
                              if (slot.is_break) return (
                                <td key={slot.id} className="bg-slate-50 border-r border-slate-100 text-center p-0">
                                  <div className="text-[9px] text-slate-300 font-bold">พัก</div>
                                </td>
                              );
                              const entry = entriesOfType.find(e => e.day_of_week === day && e.time_slot_id === slot.id)
                                ?? entriesOfType.find(e => e.day_of_week === day && (timeSlots.find(s => s.id === e.time_slot_id)?.start_time.slice(0,5) === slot.start_time));
                              const colors = entry ? (subjectColorMap[entry.subject_id] ?? SUBJECT_COLORS[0]) : null;
                              const subject = entry ? (subjects.find(s => s.id === entry.subject_id) ?? (entry as any).subject) : null;
                              const room = entry ? classrooms.find(c => c.id === entry.classroom_id) : null;
                              return (
                                <td key={slot.id} className="p-1 align-top border-r border-slate-100">
                                  {entry && colors ? (
                                    <div
                                      className={`rounded-xl border-2 px-2 py-2 cursor-pointer hover:shadow-md ${colors.bg} ${colors.border} ${colors.text}`}
                                      style={{ minHeight: "80px" }}
                                      onClick={() => setCellModal({ day, slot, entry })}>
                                      <p className="font-black text-xs leading-tight line-clamp-2 mb-1">
  {(subject as any)?.name_th ?? "—"}
  {(subject as any)?.subject_code && (
    <span className="block text-[9px] font-bold opacity-60">{(subject as any).subject_code}</span>
  )}
</p>
{room && <p className="text-[10px] font-bold opacity-70">{room.grade_group} {room.room_name}</p>}
                                    </div>
                                  ) : (
                                    <div
                                      className="rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 flex items-center justify-center"
                                      style={{ minHeight: "80px" }}
                                      onClick={() => setCellModal({ day, slot })}>
                                      <span className="text-slate-300 text-2xl">+</span>
                                    </div>
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
              </div>
            );
          })}
        </>
      )}

      {cellModal && teacher && (
        <TeacherCellModal
          teacher={teacher} day={cellModal.day} slot={cellModal.slot} entry={cellModal.entry}
          classrooms={classrooms} subjects={subjects} teachers={teachers} academicYearId={academicYearId}
          onSave={async (d) => { await onSaveEntry(d); setCellModal(null); }}
          onDelete={async (id) => { await onDeleteEntry(id); setCellModal(null); }}
          onClose={() => setCellModal(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Timetable Grid ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function TimetableGrid({ classroom, entries, timeSlots, allTimeSlots, subjects, teachers, academicYearId,
  currentUser, clubPeriod, clubsForGrade, onSave, onRequestChange, onDelete }: {
  classroom: Classroom; entries: TimetableEntry[]; timeSlots: TimeSlot[]; allTimeSlots: TimeSlot[];
  subjects: Subject[]; teachers: Teacher[]; academicYearId: string;
  currentUser: UserProfile;
  clubPeriod?: ClubPeriod; clubsForGrade: Club[];
  onSave: (d: any) => Promise<void>;
  onRequestChange: (d: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {

  const [modal, setModal] = useState<{ slot: TimeSlot; day: number; entry?: TimetableEntry; permission: "direct"|"request" } | null>(null);

  // ✅ FIX (root cause): จับคู่ entry กับ slot ด้วย "เวลาเริ่ม" เป็น fallback แทนการเทียบ time_slot_id ตรงๆ อย่างเดียว
  // เพราะ time_slots อาจมีหลาย record ที่เวลาเดียวกันแต่คนละ id (คนละ schedule_type)
  // ทำให้คาบเรียนที่ผูกกับ id หนึ่ง ถูกมองไม่เห็นเมื่อตารางที่ render ใช้อีก id หนึ่งที่เวลาเดียวกัน
  const startTimeMap: Record<string, string> = {};
  allTimeSlots.forEach(s => { startTimeMap[s.id] = (s.start_time ?? "").slice(0, 5); });

  function getEntry(day: number, slot: TimeSlot) {
    const slotStart = (slot.start_time ?? "").slice(0, 5);
    return entries.find(e => {
      if (e.day_of_week !== day) return false;
      if (e.time_slot_id === slot.id) return true;               // ตรงกันตรงๆ
      return startTimeMap[e.time_slot_id] === slotStart;          // ตรงกันด้วยเวลา (id ต่างกันแต่เวลาเดียวกัน)
    });
  }

  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  function getPermissionForEntry(user: UserProfile, entry: { teacher_id?: string; teacher_id_2?: string } | undefined, teachers: Teacher[]): "direct" | "request" | "deny" {
  const extraRoles = user.extra_roles ?? [];

  // admin/director/deputy_director (หรือโรลใดๆ ที่มีคำว่า admin): แก้ทุกอย่างตรง ไม่ต้องรอ
  if (isAdminRole(user.role)) return "direct";

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

                    const entry    = getEntry(day, slot);
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
                            <p className="font-black text-xs leading-tight line-clamp-2 mb-1">
  {(subject as any)?.name_th ?? "—"}
  {(subject as any)?.subject_code && (
    <span className="block text-[9px] font-bold opacity-60">{(subject as any).subject_code}</span>
  )}
</p>
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
function PersonalTimetableGrid({ myEntries, myClubBlocks, timeSlots, allTimeSlots, subjects, teachers, classrooms, userId }: {
  myEntries: TimetableEntry[];
  myClubBlocks: { dayOfWeek: number; slotLabel: string; club: Club }[];
  timeSlots: TimeSlot[]; allTimeSlots: TimeSlot[]; subjects: Subject[]; teachers: Teacher[]; classrooms: Classroom[]; userId: string;
}) {
  const subjectColorMap: Record<string, typeof SUBJECT_COLORS[0]> = {};
  subjects.forEach((s, i) => { subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });

  // ✅ FIX: จับคู่ด้วยเวลาเริ่มเหมือนกับ TimetableGrid
  const startTimeMap: Record<string, string> = {};
  allTimeSlots.forEach(s => { startTimeMap[s.id] = (s.start_time ?? "").slice(0, 5); });

  function getMyEntry(day: number, slot: TimeSlot) {
    const slotStart = (slot.start_time ?? "").slice(0, 5);
    return myEntries.find(e => {
      if (e.day_of_week !== day) return false;
      if (e.time_slot_id === slot.id) return true;
      return startTimeMap[e.time_slot_id] === slotStart;
    });
  }
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

                  
                  const entry = getMyEntry(day, slot);
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
      <p className="font-black text-xs leading-tight line-clamp-2 mb-1">
  {(subject as any)?.name_th ?? "—"}
  {(subject as any)?.subject_code && (
    <span className="block text-[9px] font-bold opacity-60">{(subject as any).subject_code}</span>
  )}
</p>
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
                  <p className="font-black text-slate-800 text-sm truncate">
  {(subject as any)?.name_th ?? "—"}
  {(subject as any)?.subject_code && (
    <span className="ml-1 text-[10px] font-bold text-slate-400">{(subject as any).subject_code}</span>
  )}
</p>
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
  const [selectedSemester, setSelectedSemester] = useState<number>(1); 
  const [selectedRoom,     setSelectedRoom]     = useState("");
  const [viewMode, setViewMode] = useState<"room"|"teacher"|"requests"|"duplicates"|"dashboard"|"gradeSchedule">("room");
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
const [showGradeHeadPermission, setShowGradeHeadPermission] = useState(false);
const [lockedPeriods, setLockedPeriods] = useState<any[]>([]);
const [showLockedPeriods, setShowLockedPeriods] = useState(false);

const loadLockedPeriods = useCallback(async () => {
  if (!selectedYear) return;
  const selRow = academicYearsRaw.find(y => y.id === selectedYear);
  const yearIds = selRow ? academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id) : [selectedYear];
  const { data } = await supabase.from("locked_periods").select("*").in("academic_year_id", yearIds);
  setLockedPeriods(data ?? []);
}, [selectedYear, academicYearsRaw]);
const [showAutoArrange, setShowAutoArrange] = useState(false);

async function handleAutoArrangeConfirm(
  jobs: { classroom: Classroom; assignments: { day_of_week: number; time_slot: TimeSlot }[] }[],
  subjectId: string, teacherId: string, teacherId2?: string
) {
  for (const job of jobs) {
    for (const a of job.assignments) {
      await handleSaveDirect({
        classroom_id: job.classroom.id, subject_id: subjectId,
        teacher_id: teacherId, teacher_id_2: teacherId2 ?? null,
        day_of_week: a.day_of_week, time_slot_id: a.time_slot.id, time_slot: a.time_slot,
        academic_year_id: job.classroom.academic_year_id ?? selectedYear,
      });
    }
  }
}
useEffect(() => { loadLockedPeriods(); }, [loadLockedPeriods]);

async function toggleGradeHeadPermission(teacherId: string, value: boolean) {
  await (supabase.from("users") as any).update({ can_arrange_schedule: value }).eq("id", teacherId);
  setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, can_arrange_schedule: value } : t));
}

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
        .select("id,first_name,last_name,full_name,email,role,position,grade_level,extra_roles,department_id,can_arrange_schedule")
        .eq("auth_id", authUser.id).maybeSingle();
      profileData = byAuthId;

      if (!profileData && email) {
        const { data: byEmail } = await supabase.from("users")
          .select("id,first_name,last_name,full_name,email,role,position,grade_level,extra_roles,department_id,can_arrange_schedule")
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
supabase.from("subjects").select("id,subject_code,name_th,subject_group,periods_per_week").order("subject_code"),
supabase.from("users")
  .select("id,title,first_name,last_name,full_name,position,role,grade_level,department_id,extra_roles,can_arrange_schedule")
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
        const matched      = allRooms.filter(r => sameYearIds.includes(r.academic_year_id ?? ""));
        const baseRoomList = matched.length > 0 ? matched : allRooms; // ★ fallback แสดงทั้งหมด

        const initSemester = currentYearRow.semester ?? 1;
        setSelectedSemester(initSemester);
        const roomList = filterRoomsBySemester(baseRoomList, initSemester, yearsRaw); // ★ ใหม่

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
  const sameIds  = academicYearsRaw.filter(y => y.year_name === selRow.year_name).map(y => y.id);
  const matched  = allClassrooms.filter(r => sameIds.includes(r.academic_year_id ?? ""));
  const baseList = matched.length > 0 ? matched : allClassrooms;
  const list = filterRoomsBySemester(baseList, selectedSemester, academicYearsRaw); // ★ ใหม่
  setClassrooms(list);
  if (list.length > 0 && !list.find(r => r.id === selectedRoom)) setSelectedRoom(list[0].id);
}, [selectedYear, selectedSemester, academicYearsRaw, allClassrooms]); // ★ เพิ่ม selectedSemester

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
    const entriesData = await fetchAllRows<TimetableEntry>(
  supabase.from("timetable_entries").select("*").in("academic_year_id", yearIds)
);

if (!entriesData) return;
let allEntries = entriesData as TimetableEntry[];
// ในบรรทัดถัดจากขั้น 2
if (allEntries.length === 0) {
  allEntries = await fetchAllRows<TimetableEntry>(supabase.from("timetable_entries").select("*"));
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
console.log("✅ loadEntries: total =", enriched.length, "for room:", enriched.filter(e => e.classroom_id === selectedRoom).length);
  }, [selectedYear, academicYearsRaw]);

  // ★ โหลด entries ของ "ทุกปีการศึกษา" แบบไม่กรอง เพื่อใช้ตรวจคาบซ้ำ/ครูซ้อนคาบ
// ป้องกันเคสที่คาบซ้ำถูกสร้างข้าม academic_year_id คนละค่ากัน แล้วมองไม่เห็นตอนดูเฉพาะปีที่เลือก
const loadAllEntriesForCheck = useCallback(async () => {
  setCheckingAllYears(true);
  // ใน loadAllEntriesForCheck
const allEntries = await fetchAllRows<TimetableEntry>(supabase.from("timetable_entries").select("*"));

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
  if (isAdminRole(user.role)) return true;
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
    const isAdminUser = isAdminRole(user.role);
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
      setClassrooms(filterRoomsBySemester(matched.length > 0 ? matched : allRooms, selectedSemester, academicYearsRaw)); // ★ แก้บรรทัดนี้
    } else setClassrooms(allRooms);
  }
  async function checkAndNotifyConflict(classroomId: string, dayOfWeek: number, timeSlotId: string) {
    try {
      const { data, error } = await supabase
        .from("timetable_entries")
        .select("id")
        .eq("classroom_id", classroomId)
        .eq("day_of_week", dayOfWeek)
        .eq("time_slot_id", timeSlotId);
      if (error) { console.warn("[checkAndNotifyConflict] query error:", error.message); return; }
      if ((data ?? []).length > 1) {
        const room = classrooms.find(c => c.id === classroomId) ?? allClassrooms.find(c => c.id === classroomId);
        sendTeamsDM("academic", ADMIN_NOTIFY_EMAIL,
          `🧹 พบคาบซ้ำ! ห้อง ${room?.grade_group ?? ""} ${room?.room_name ?? ""} วัน${DAYS[(dayOfWeek ?? 1) - 1]} มีการจัดคาบซ้อนกัน — เข้าไปตรวจสอบที่หน้าตารางสอน`);
      }
    } catch (err) {
      console.warn("[checkAndNotifyConflict] error:", err);
    }
  }
  async function handleDeleteEntry(id: string) {
    const entry = entries.find(e => e.id === id) ?? allEntriesForCheck.find(e => e.id === id);
    await supabase.from("timetable_entries").delete().eq("id", id);
    await loadEntries();
    if (entry) {
      await desyncSubjectSection({
        subjectId: entry.subject_id, classroomId: entry.classroom_id,
        academicYearId: entry.academic_year_id, teacherId: entry.teacher_id,
      });
      if (entry.teacher_id_2) {
        await desyncSubjectSection({
          subjectId: entry.subject_id, classroomId: entry.classroom_id,
          academicYearId: entry.academic_year_id, teacherId: entry.teacher_id_2,
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
// ✅ syncSubjectSection — ทำให้ subject_sections ตรงกับ timetable_entries เสมอ
// เรียกทุกครั้งหลัง insert/update timetable_entries สำเร็จ
// ══════════════════════════════════════════════════════════════════════════
async function syncSubjectSection({
  subjectId, classroomId, academicYearId, teacherId, teacherId2, createdBy,
}: {
  subjectId: string; classroomId: string; academicYearId: string;
  teacherId: string; teacherId2?: string | null; createdBy: string;
}) {
  try {
    const { data: existing } = await supabase
      .from("subject_sections")
      .select("id, teacher_id, co_teacher_id, is_active")
      .eq("subject_id", subjectId)
      .eq("classroom_id", classroomId)
      .eq("academic_year_id", academicYearId)
      .maybeSingle();

    if (!existing) {
      // ยังไม่มี section เลย → สร้างใหม่
      const joinCode = Math.random().toString(36).slice(2, 8);
      const { error } = await (supabase.from("subject_sections") as any).insert([{
        subject_id: subjectId, classroom_id: classroomId, academic_year_id: academicYearId,
        teacher_id: teacherId, co_teacher_id: teacherId2 || null,
        join_code: joinCode, is_active: true, created_by: createdBy,
      }]);
      if (error) console.error("[syncSubjectSection] insert error:", error);
      return;
    }

    // มี section อยู่แล้ว → เช็คว่าครูตรงไหม ถ้าไม่ตรงให้เติม/อัปเดต
    const currentTeachers = [existing.teacher_id, existing.co_teacher_id].filter(Boolean);
    const wantedTeachers = [teacherId, teacherId2].filter(Boolean) as string[];
    const missing = wantedTeachers.filter(t => !currentTeachers.includes(t));

    const patch: any = {};
    if (!existing.is_active) patch.is_active = true; // เผื่อเคยถูกปิดไปแล้วมีคนกลับมาสอนใหม่

    if (missing.length > 0) {
      if (!existing.teacher_id) patch.teacher_id = missing[0];
      else if (!existing.co_teacher_id) patch.co_teacher_id = missing.find(m => m !== existing.teacher_id) ?? missing[0];
      // ถ้าเต็มทั้ง 2 ช่องแล้วแต่ยังมีคนขาด (ครูคนที่ 3) — log ไว้เตือนแอดมิน ไม่ auto-overwrite
      else console.warn("[syncSubjectSection] มีครูเกิน 2 คนสำหรับ", { subjectId, classroomId }, "ครูที่ขาด:", missing);
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await (supabase.from("subject_sections") as any).update(patch).eq("id", existing.id);
      if (error) console.error("[syncSubjectSection] update error:", error);
    }
  } catch (err) {
    console.error("[syncSubjectSection] unexpected error:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ✅ desyncSubjectSection — ถอดครูออกจาก section เมื่อไม่มีคาบสอนคู่นี้เหลือแล้ว
// เรียกหลังลบ/แก้ไข timetable_entries (เผื่อครูคนนั้นเลิกสอนคู่ subject+classroom นี้)
// ══════════════════════════════════════════════════════════════════════════
async function desyncSubjectSection({
  subjectId, classroomId, academicYearId, teacherId,
}: {
  subjectId: string; classroomId: string; academicYearId: string; teacherId: string;
}) {
  try {
    // เช็คก่อนว่าครูคนนี้ยังมีคาบของ subject+classroom คู่นี้เหลืออยู่ไหม
    const { data: stillTeaching } = await supabase
      .from("timetable_entries")
      .select("id")
      .eq("subject_id", subjectId)
      .eq("classroom_id", classroomId)
      .or(`teacher_id.eq.${teacherId},teacher_id_2.eq.${teacherId}`)
      .limit(1);
    if (stillTeaching && stillTeaching.length > 0) return; // ยังสอนอยู่ ไม่ต้องทำอะไร

    const { data: section } = await supabase
      .from("subject_sections")
      .select("id, teacher_id, co_teacher_id")
      .eq("subject_id", subjectId)
      .eq("classroom_id", classroomId)
      .eq("academic_year_id", academicYearId)
      .maybeSingle();
    if (!section) return;

    if (section.co_teacher_id === teacherId) {
      await (supabase.from("subject_sections") as any).update({ co_teacher_id: null }).eq("id", section.id);
    } else if (section.teacher_id === teacherId) {
      if (section.co_teacher_id) {
        // เลื่อน co_teacher ขึ้นมาแทน
        await (supabase.from("subject_sections") as any)
          .update({ teacher_id: section.co_teacher_id, co_teacher_id: null })
          .eq("id", section.id);
      } else {
        // ไม่มีใครสอนเลย — ปิด section (ไม่ลบถาวร เผื่อมีข้อมูลนักเรียน/คะแนนผูกอยู่)
        await (supabase.from("subject_sections") as any).update({ is_active: false }).eq("id", section.id);
      }
    }
  } catch (err) {
    console.error("[desyncSubjectSection] unexpected error:", err);
  }
}
  // ══════════════════════════════════════════════════════════════════════════
  // ✅ syncAllSections — ปุ่มกดมือ ไล่ตรวจทั้งระบบให้ subject_sections ตรงกับ
  // timetable_entries ทั้งหมด (เผื่อ auto-sync พลาดหรือมีข้อมูลเก่าที่ยังไม่ตรงกัน)
  // เฉพาะแอดมินเท่านั้นที่กดได้
  // ══════════════════════════════════════════════════════════════════════════
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; closed: number } | null>(null);

  async function syncAllSections() {
    if (!user) return;
    setSyncing(true);
    setSyncResult(null);
    let created = 0, updated = 0, closed = 0;

    try {
      // ดึง timetable_entries ทั้งหมดทุกปีการศึกษา
      const allEntries = await fetchAllRows<TimetableEntry>(
        supabase.from("timetable_entries").select("*")
      );

      // ดึง subject_sections ทั้งหมดมาไว้ในหน่วยความจำ (ลด round-trip)
      const { data: allSections } = await supabase
        .from("subject_sections")
        .select("id, subject_id, classroom_id, academic_year_id, teacher_id, co_teacher_id, is_active");
      const sections = (allSections ?? []) as any[];

      // จัดกลุ่ม entries ตาม subject+classroom+ปี เพื่อหาว่าใครสอนคู่ไหนบ้าง (สูงสุด 2 คน)
      type GroupKey = string;
      const groups = new Map<GroupKey, { subjectId: string; classroomId: string; academicYearId: string; teacherIds: string[] }>();
      allEntries.forEach(e => {
        const key = `${e.subject_id}|${e.classroom_id}|${e.academic_year_id}`;
        if (!groups.has(key)) {
          groups.set(key, { subjectId: e.subject_id, classroomId: e.classroom_id, academicYearId: e.academic_year_id, teacherIds: [] });
        }
        const g = groups.get(key)!;
        if (!g.teacherIds.includes(e.teacher_id)) g.teacherIds.push(e.teacher_id);
        if (e.teacher_id_2 && !g.teacherIds.includes(e.teacher_id_2)) g.teacherIds.push(e.teacher_id_2);
      });

      // 1) สร้าง/อัปเดต section ให้ตรงกับตารางสอนปัจจุบัน (ข้ามกลุ่มที่มีครูเกิน 2 คน — ต้องจัดการเอง)
      for (const g of groups.values()) {
        if (g.teacherIds.length > 2) {
          console.warn("[syncAllSections] มีครูเกิน 2 คนสำหรับคู่นี้ ข้ามไป ต้องจัดการเอง:", g);
          continue;
        }
        const existing = sections.find(s =>
          s.subject_id === g.subjectId && s.classroom_id === g.classroomId && s.academic_year_id === g.academicYearId
        );
        const before = existing ? JSON.stringify([existing.teacher_id, existing.co_teacher_id, existing.is_active]) : null;

        await syncSubjectSection({
          subjectId: g.subjectId, classroomId: g.classroomId, academicYearId: g.academicYearId,
          teacherId: g.teacherIds[0], teacherId2: g.teacherIds[1] ?? null, createdBy: user.id,
        });

        if (!existing) created++;
        else {
          // เช็คว่ามีการเปลี่ยนแปลงจริงไหม (sync อาจไม่ทำอะไรถ้าตรงอยู่แล้ว)
          const { data: after } = await supabase
            .from("subject_sections").select("teacher_id, co_teacher_id, is_active")
            .eq("id", existing.id).maybeSingle();
          const afterStr = after ? JSON.stringify([after.teacher_id, after.co_teacher_id, after.is_active]) : null;
          if (afterStr !== before) updated++;
        }
      }

      // 2) desync: หา section ที่ active อยู่ แต่ครูไม่มีคาบคู่นี้ในตารางสอนแล้ว
      for (const s of sections) {
        if (!s.is_active) continue;
        const key = `${s.subject_id}|${s.classroom_id}|${s.academic_year_id}`;
        const g = groups.get(key);
        const stillTeaching = (tid: string) => g?.teacherIds.includes(tid) ?? false;

        if (s.teacher_id && !stillTeaching(s.teacher_id)) {
          await desyncSubjectSection({
            subjectId: s.subject_id, classroomId: s.classroom_id, academicYearId: s.academic_year_id,
            teacherId: s.teacher_id,
          });
          closed++;
        }
        if (s.co_teacher_id && !stillTeaching(s.co_teacher_id)) {
          await desyncSubjectSection({
            subjectId: s.subject_id, classroomId: s.classroom_id, academicYearId: s.academic_year_id,
            teacherId: s.co_teacher_id,
          });
          closed++;
        }
      }

      setSyncResult({ created, updated, closed });
    } catch (err: any) {
      console.error("[syncAllSections] error:", err);
      alert("❌ ซิงค์ไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    } finally {
      setSyncing(false);
    }
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
  // ── Save direct (admin) ───────────────────────────────────────────────────
  async function handleSaveDirect(data: any) {
    try {
      const realSlotId = await ensureRealTimeSlot(data.time_slot_id, data.time_slot);

      const { data: clash, error: clashErr } = await supabase
        .from("timetable_entries")
        .select("id")
        .eq("classroom_id", data.classroom_id)
        .eq("day_of_week", data.day_of_week)
        .eq("time_slot_id", realSlotId)
        .eq("academic_year_id", data.academic_year_id);
      if (clashErr) throw clashErr;
      const otherClash = (clash ?? []).filter(c => c.id !== data.id);
      if (otherClash.length > 0) {
        const confirmOverwrite = confirm(
          "⚠️ ช่องนี้มีคาบเรียนอยู่แล้วในระบบ (แต่หน้าจอไม่แสดง)\n\n" +
          "ต้องการบันทึกทับคาบเดิมด้วยข้อมูลใหม่นี้เลยหรือไม่?"
        );
        if (!confirmOverwrite) { await loadEntries(); return; }

        // ✅ แก้: ใส่ค่าจริงแทน /* ... */
        const { error: overwriteErr } = await (supabase.from("timetable_entries") as any)
          .update({
            subject_id: data.subject_id,
            teacher_id: data.teacher_id,
            teacher_id_2: data.teacher_id_2 ?? null,
            time_slot_id: realSlotId,
          })
          .eq("id", otherClash[0].id);
        if (overwriteErr) throw overwriteErr;
        await loadEntries();
        await syncSubjectSection({
          subjectId: data.subject_id, classroomId: data.classroom_id, academicYearId: data.academic_year_id,
          teacherId: data.teacher_id, teacherId2: data.teacher_id_2, createdBy: user!.id,
        });
        return;
      }

      if (data.id) {
        // ✅ แก้: ใส่ค่าจริงแทน /* ... */
        const { error } = await (supabase.from("timetable_entries") as any)
          .update({
            subject_id: data.subject_id, teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 ?? null,
            time_slot_id: realSlotId,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        // ✅ แก้: ใส่ค่าจริงแทน /* ... */
        const { error } = await (supabase.from("timetable_entries") as any).insert([{
          classroom_id: data.classroom_id, subject_id: data.subject_id,
          teacher_id: data.teacher_id, teacher_id_2: data.teacher_id_2 ?? null,
          day_of_week: data.day_of_week, time_slot_id: realSlotId,
          academic_year_id: data.academic_year_id,
        }]);
        if (error) throw error;
      }
      await loadEntries();
      await checkAndNotifyConflict(data.classroom_id, data.day_of_week, realSlotId);
      await syncSubjectSection({
        subjectId: data.subject_id, classroomId: data.classroom_id, academicYearId: data.academic_year_id,
        teacherId: data.teacher_id, teacherId2: data.teacher_id_2, createdBy: user!.id,
      });
    } catch (err: any) {
      console.error("[handleSaveDirect] error:", err);

      // ✅ NEW: จับ unique constraint violation โดยเฉพาะ (เผื่อมีคนอื่นบันทึกแทรกพอดีระหว่างที่เช็ค)
      if (err?.code === "23505") {
        alert(
          "⚠️ บันทึกไม่สำเร็จ: ช่องนี้มีคาบเรียนอยู่แล้ว (อาจมีคนอื่นเพิ่งบันทึกไปพร้อมกัน)\n\n" +
          "ระบบจะโหลดตารางล่าสุดให้ กรุณาลองใหม่อีกครั้งหลังตรวจดูคาบที่มีอยู่"
        );
        await loadEntries();
        return;
      }

      alert(
        "❌ บันทึกคาบเรียนไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ") +
        "\n\nถ้าปัญหายังเกิดซ้ำ ลองกดปุ่ม ⚙️ มุมขวาบนเพื่อเลือกตารางเวลาของห้องนี้ใหม่อีกครั้ง หรือแจ้งผู้ดูแลระบบ"
      );
    }
  }
  // ── Request change (teacher) ──────────────────────────────────────────────
  // ✅ เพิ่ม ensureRealTimeSlot เหมือนกัน กันคำขอพังด้วยสาเหตุเดียวกัน
  // ── Request change (teacher) ──────────────────────────────────────────────
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
      if (err?.code === "23505") {
        alert("⚠️ ส่งคำขอไม่สำเร็จ: มีคำขอ/คาบเรียนซ้ำในช่องนี้อยู่แล้ว กรุณาลองใหม่");
        return;
      }
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
      await checkAndNotifyConflict(req.classroom_id, req.day_of_week, req.time_slot_id);
      // ✅ เพิ่มบรรทัดนี้ — sync section ให้ตรงกับที่อนุมัติไป
      await syncSubjectSection({
        subjectId: req.new_subject_id, classroomId: req.classroom_id, academicYearId: req.academic_year_id,
        teacherId: req.new_teacher_id, teacherId2: req.new_teacher_id_2, createdBy: user.id,
      });
      // ★ ถ้าวิชา/ห้องเดิมเปลี่ยนไป ให้ desync ของเก่าด้วย (ครูเก่าอาจไม่ได้สอนคู่เดิมแล้ว)
      if (req.old_teacher_id && (req.old_subject_id !== req.new_subject_id)) {
        await desyncSubjectSection({
          subjectId: req.old_subject_id!, classroomId: req.classroom_id, academicYearId: req.academic_year_id,
          teacherId: req.old_teacher_id,
        });
      }
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
      // ★ เพิ่มใหม่: DM ส่วนตัวถึง admin
      sendTeamsDM("academic", ADMIN_NOTIFY_EMAIL,
        `📚 ${fullName(user)} ขอเพิ่มรายวิชาใหม่: ${d.subject_code} ${d.name_th} (ชั้น ${d.grade_level}) — เข้าไปตรวจสอบที่หน้าคำขอ`);

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

      // ★ FIX: ไม่ insert ลงตาราง subjects อีกต่อไป เพราะแอดมินจะไปสร้างวิชาเองภายหลัง
      // (การ insert ตรงนี้ทำให้ชน unique constraint ถ้ารหัสวิชาซ้ำกับที่มีอยู่แล้ว
      // และทำให้อนุมัติไม่สำเร็จทั้งที่จริง ๆ ควรอนุมัติได้ปกติ)
      const { error: updErr } = await (supabase.from("subject_addition_requests") as any)
        .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updErr) throw updErr;

      await loadSubjectRequests();

      // ★ เพิ่มใหม่: DM แจ้งผู้ขอว่าอนุมัติแล้ว
      if (req.requester?.email) {
        sendTeamsDM("academic", req.requester.email,
          `✅ คำขอเพิ่มรายวิชา "${req.subject_code} ${req.name_th}" ของคุณได้รับการอนุมัติแล้ว`);
      } else {
        console.warn("[handleApproveSubjectRequest] ไม่มี email ผู้ขอ ส่ง DM ไม่ได้:", req.requester);
      }

      alert("✅ อนุมัติคำขอแล้ว (แอดมินจะเป็นผู้เพิ่มรายวิชาเข้าระบบเอง)");
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

      // ★ เพิ่มใหม่: DM แจ้งผู้ขอ
      if (req?.requester?.email) {
        sendTeamsDM("academic", req.requester.email,
          `❌ คำขอเพิ่มรายวิชา "${req.subject_code} ${req.name_th}" ของคุณถูกปฏิเสธ เหตุผล: ${reason}`);
      } else {
        console.warn("[handleRejectSubjectRequest] ไม่มี email ผู้ขอ ส่ง DM ไม่ได้:", req?.requester);
      }
    } catch (err: any) {
      console.error("[handleRejectSubjectRequest] error:", err);
      alert("❌ ปฏิเสธคำขอไม่สำเร็จ: " + (err?.message ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"));
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-blue-500 font-black text-lg animate-pulse">กำลังโหลดตารางสอน...</div></div>;
  if (!user)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-red-500 font-black">❌ กรุณาเข้าสู่ระบบก่อน</p></div>;

  const isAdmin           = isAdminRole(user.role);
  const canManageGradeSchedule = isAdmin || ((user.extra_roles ?? []).includes("grade_head") && !!user.can_arrange_schedule);
  const isApprover        = APPROVER_ROLES.includes(user.role) || isAdminRole(user.role);
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
    const yearName = getYearNameForClassroom(c, academicYearsRaw);
    const semesterPart = isSecondaryClassroom(c) ? `|เทอม${getSemesterForClassroom(c, academicYearsRaw)}` : "";
    const key = `${yearName}|${c.grade_group ?? ""}|${(c.room_name ?? "").trim()}${semesterPart}`;
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
      {showGradeHeadPermission && (
  <GradeHeadPermissionModal teachers={teachers} onClose={() => setShowGradeHeadPermission(false)} onToggle={toggleGradeHeadPermission} />
)}
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
{showAutoArrange && (
  <BatchAutoArrangeModal
    gradeLabel={selectedClassroom ? getClassroomGradeLabel(selectedClassroom) : undefined}
    classroomsAll={classrooms}
    subjects={subjects} teachers={teachers}
    entries={entries} allTimeSlots={timeSlots} lockedPeriods={lockedPeriods}
    onClose={() => setShowAutoArrange(false)}
    onArrange={handleAutoArrangeConfirm}
  />
)}
{showClubAdmin && (
  <ClubManagementModal
    clubPeriods={clubPeriods} clubs={clubs} teachers={teachers} academicYearId={selectedYear}
    onClose={() => setShowClubAdmin(false)} onReload={loadClubs}
  />
)}
{syncResult && (
  <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSyncResult(null)}>
    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-teal-600 px-6 py-4">
        <h3 className="text-lg font-black text-white">✅ ซิงค์ Smart Class เสร็จแล้ว</h3>
      </div>
      <div className="p-5 space-y-2 text-sm">
        <p>🆕 สร้างใหม่: <b>{syncResult.created}</b> รายการ</p>
        <p>♻️ อัปเดต: <b>{syncResult.updated}</b> รายการ</p>
        <p>🔒 ปิด (ไม่มีคนสอนแล้ว): <b>{syncResult.closed}</b> รายการ</p>
      </div>
      <div className="px-5 pb-5">
        <button onClick={() => setSyncResult(null)} className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-black text-sm">ปิด</button>
      </div>
    </div>
  </div>
)}
{showLockedPeriods && (
  <LockedPeriodsModal lockedPeriods={lockedPeriods} academicYearId={selectedYear} onClose={() => setShowLockedPeriods(false)} onReload={loadLockedPeriods} />
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

{/* ★ ใหม่: สลับเทอม — มีผลเฉพาะห้อง ม.1–ม.6 / อ.-ป. แสดงรวมทุกเทอมเสมอ */}
<div className="flex bg-slate-100 rounded-xl p-1 gap-0.5" title="แยกเทอมเฉพาะ ม.1–ม.6 · อ./ป. แสดงรวมทุกเทอม">
  {[1, 2].map(s => (
    <button key={s} onClick={() => setSelectedSemester(s)}
      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${selectedSemester === s ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
      เทอม {s}
    </button>
  ))}
</div>
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
  <button onClick={() => setShowGradeHeadPermission(true)}
    className="px-3 py-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-700 font-black text-sm hover:bg-indigo-100">
    🔑 สิทธิ์ หน.สาย
  </button>
)}
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
{canManageGradeSchedule && (
  <button onClick={() => setViewMode("gradeSchedule")}
    className={`px-3 py-2 rounded-xl border-2 font-black text-sm
      ${viewMode === "gradeSchedule" ? "bg-indigo-600 border-indigo-600 text-white" : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
    🧑‍🏫 จัดตารางสอนสายชั้น
  </button>
)}
{isAdmin && (
  <button onClick={() => setShowClubAdmin(true)}
    className="px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 text-purple-700 font-black text-sm hover:bg-purple-100">
    🎪 จัดการชุมนุม
  </button>
)}
{/* ✅ เพิ่มปุ่มนี้ — เฉพาะแอดมินเท่านั้น */}
{isAdmin && (
  <button onClick={async () => {
      if (!confirm("จะไล่ตรวจ Smart Class ทั้งระบบให้ตรงกับตารางสอนปัจจุบัน ต้องการดำเนินการต่อหรือไม่?")) return;
      await syncAllSections();
    }}
    disabled={syncing}
    className="px-3 py-2 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-700 font-black text-sm hover:bg-teal-100 disabled:opacity-50 flex items-center gap-1.5">
    {syncing ? "⏳ กำลังซิงค์..." : "🔄 ซิงค์ Smart Class"}
  </button>
)}
{(isAdmin || canManageGradeSchedule) && (
  <button onClick={() => setShowLockedPeriods(true)}
    className="px-3 py-2 rounded-xl border-2 border-rose-200 bg-rose-50 text-rose-700 font-black text-sm hover:bg-rose-100">
    🔒 ล็อกคาบ
  </button>
)}
{(isAdmin || canManageGradeSchedule) && (
  <button onClick={() => setShowAutoArrange(true)}
    className="px-3 py-2 rounded-xl border-2 border-violet-200 bg-violet-50 text-violet-700 font-black text-sm hover:bg-violet-100">
    ⚡ จัดอัตโนมัติ
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
          {isSecondaryClassroom(selectedClassroom) && <span className="ml-2 text-indigo-500 font-bold">· เทอม {selectedSemester}</span>}
          {!canEditDirect && <span className="ml-2 text-amber-600 font-bold text-xs">· คลิกคาบที่คุณสอนเพื่อขอแก้ไข</span>}
        </p>
      </div>
    </div>
              <TimetableGrid
  key={`${selectedRoom}-${roomEntries.length}`}
  classroom={selectedClassroom} entries={roomEntries} timeSlots={roomTimeSlots}
      allTimeSlots={timeSlots}
      subjects={subjects} teachers={teachers} academicYearId={selectedYear}
      currentUser={user}
      clubPeriod={clubPeriods.find(cp => cp.grade_label === getClassroomGradeLabel(selectedClassroom))}
      clubsForGrade={clubs.filter(c => c.grade_label === getClassroomGradeLabel(selectedClassroom))}
      onSave={handleSaveDirect}
      onRequestChange={handleRequestChange}
      onDelete={handleDeleteEntry}
    />
    </div>  
  )} 

  {/* ── จัดตารางสอนสายชั้น ── */}
{viewMode === "gradeSchedule" && canManageGradeSchedule && (
  <GradeScheduleManager
    currentUser={user}
    isAdmin={isAdmin}
    teachers={teachers}
    classrooms={classrooms}
    subjects={subjects}
    timeSlots={timeSlots}
    entries={entries}
    academicYearId={selectedYear}
    onSaveEntry={handleSaveDirect}
    onDeleteEntry={handleDeleteEntry}
  />
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
  allTimeSlots={timeSlots}
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
                  onDeleteEntry={async (id) => { await handleDeleteEntry(id); await loadAllEntriesForCheck(); }}
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
  const yearName = getYearNameForClassroom(room, academicYearsRaw);
  const semLabel = isSecondaryClassroom(room) ? ` · เทอม ${getSemesterForClassroom(room, academicYearsRaw)}` : "";
  return (
    <div key={room.id} className="px-5 py-3 flex items-center justify-between gap-3">
      <div>
        <p className="font-bold text-slate-800 text-sm">ปีการศึกษา {yearName || "—"}{semLabel}</p>
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
      onDeleteEntry={async (id) => { await handleDeleteEntry(id); await loadAllEntriesForCheck(); }}
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